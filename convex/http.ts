import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import Stripe from "stripe";

const http = httpRouter();
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const zendeskEnabled = process.env.ZENDESK_ENABLED === "true";
const zendeskSubdomain = process.env.ZENDESK_SUBDOMAIN;
const zendeskEmail = process.env.ZENDESK_EMAIL;
const zendeskApiToken = process.env.ZENDESK_API_TOKEN;

const stripe = new Stripe(stripeSecretKey!, {
    apiVersion: "2026-06-24.dahlia" as any,
});

// ---------------------------------------------------------------------------
// /stripe-webhook — receives Stripe events.
//
// Routing strategy:
//   - V1 events (e.g. `payment_intent.succeeded`, `charge.*`, `account.updated`)
//     arrive as snapshot events: full payload in event.data.object.
//   - V2 events (e.g. `v2.core.account[requirements].updated`) arrive as
//     thin events: only id + type. We must call
//     `stripe.v2.core.events.retrieve(thinEvent.id)` to get the full payload.
//
// We detect V2 by `event.type` starting with `v2.`. Both share the same
// signature verification (`stripe.webhooks.constructEvent`) and idempotency
// table (`paymentEvents`).
// ---------------------------------------------------------------------------
http.route({
    path: "/stripe-webhook",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        if (!stripeSecretKey || !stripeWebhookSecret) {
            return new Response("Stripe webhook no configurado para este entorno.", { status: 503 });
        }

        const body = await request.text();
        let event: Stripe.Event;

        try {
            if (stripeWebhookSecret) {
                const signature = request.headers.get("stripe-signature") as string;
                event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
            } else {
                console.log("[Development Mock] Skipped Stripe Webhook signature validation");
                event = JSON.parse(body) as Stripe.Event;
            }
        } catch (err: any) {
            console.error(`Webhook signature verification failed: ${err.message}`);
            return new Response(`Webhook Error: ${err.message}`, { status: 400 });
        }

        // Idempotency check — record event before processing
        const { alreadyProcessed } = await ctx.runMutation(internal.finance.recordPaymentEvent, {
            stripeEventId: event.id,
            eventType: event.type,
            payload: event.data?.object as any,
        });

        if (alreadyProcessed) {
            console.log(`[Webhook] Already processed event ${event.id} (${event.type}), skipping.`);
            return new Response(null, { status: 200 });
        }

        let processingError: string | undefined;
        const isV2 = event.type.startsWith("v2.");

        try {
            if (isV2) {
                // ----- V2 thin event routing -----
                console.log(`[Webhook V2] Received thin event: ${event.type}. Fetching full payload...`);
                // En V2 de Stripe, el evento que entra es "delgado" (thin event).
                // Es indispensable hacer un fetch a la API para traer el payload real seguro.
                const fullEvent = await stripe.v2.core.events.retrieve(event.id);
                const relatedId = (fullEvent as any).related_object?.id as string | undefined;
                console.log(`[Webhook V2] Fetched full event ${fullEvent.type} (related=${relatedId ?? "n/a"})`);

                switch (fullEvent.type as string) {
                    case "v2.core.account[requirements].updated":
                    case "v2.core.account[configuration.recipient].capability_status_updated": {
                        if (relatedId) {
                            await ctx.runAction(internal.connect.internalApplyV2AccountUpdate, {
                                accountId: relatedId,
                            });
                        }
                        break;
                    }
                    default:
                        console.log(`[Webhook V2] Unhandled type: ${fullEvent.type}`);
                }
            } else {
                // ----- V1 snapshot event routing -----
                switch (event.type) {
                    case "payment_intent.succeeded": {
                        const pi = event.data.object as Stripe.PaymentIntent;
                        console.log(`[Webhook] PaymentIntent ${pi.id} succeeded (${pi.amount / 100} USD)`);

                        // Wait, check if this is a multi-vendor cart payment (has cartId)
                        const cartId = pi.metadata?.cartId;
                        const userId = pi.metadata?.userId;
                        
                        if (cartId && userId) {
                            console.log(`[Webhook] Processing multi-vendor cart ${cartId} for user ${userId}`);
                            await ctx.runAction(internal.stripe.internalProcessMultiVendorCart, {
                                stripePaymentIntentId: pi.id,
                                userId: userId,
                                cartId: cartId,
                                amount: pi.amount,
                            });
                        } else {
                            // Standard single-order fallback
                            await ctx.runMutation(internal.stripe.internalMarkPaymentSucceeded, {
                                stripePaymentIntentId: pi.id,
                                orderId: pi.metadata?.orderId,
                            });

                            const orderId = pi.metadata?.orderId;
                            if (orderId) {
                                try {
                                    await ctx.runMutation(internal.orders.internalUpdateOrderStatus, {
                                        orderId: orderId as any,
                                        status: "payment_received",
                                    });
                                } catch (err) {
                                    console.error("[Webhook] Failed to update order status:", err);
                                }
                            }
                        }

                        await ctx.runAction(internal.stripe.internalNotifyPaymentEvent, {
                            stripePaymentIntentId: pi.id,
                            eventType: 'succeeded',
                        });
                        break;
                    }

                    case "payment_intent.payment_failed": {
                        const pi = event.data.object as Stripe.PaymentIntent;
                        console.log(`[Webhook] PaymentIntent ${pi.id} failed`);
                        await ctx.runMutation(internal.finance.updatePaymentByIntentId, {
                            stripePaymentIntentId: pi.id,
                            status: "failed",
                        });
                        await ctx.runAction(internal.stripe.internalNotifyPaymentEvent, {
                            stripePaymentIntentId: pi.id,
                            eventType: 'failed',
                        });
                        break;
                    }

                    case "charge.refunded": {
                        const charge = event.data.object as any;
                        const piId = charge.payment_intent as string;
                        if (piId) {
                            await ctx.runMutation(internal.finance.updatePaymentByIntentId, {
                                stripePaymentIntentId: piId,
                                status: "refunded",
                            });
                            await ctx.runAction(internal.stripe.internalNotifyPaymentEvent, {
                                stripePaymentIntentId: piId,
                                eventType: 'refunded',
                            });
                        }
                        break;
                    }

                    case "charge.dispute.created": {
                        const dispute = event.data.object as any;
                        const piId = dispute.payment_intent as string;
                        if (piId) {
                            await ctx.runMutation(internal.finance.updatePaymentByIntentId, {
                                stripePaymentIntentId: piId,
                                status: "disputed",
                            });
                            await ctx.runAction(internal.stripe.internalNotifyPaymentEvent, {
                                stripePaymentIntentId: piId,
                                eventType: 'disputed',
                            });
                        }
                        break;
                    }

                    case "account.updated": {
                        // V1 Connect account event — kept for backward compat.
                        // V2 path is handled above via thin events.
                        const account = event.data.object as Stripe.Account;
                        console.log(`[Webhook] V1 Connect account updated: ${account.id}`);
                        break;
                    }

                    // ----- Stripe Subscriptions (Sprint 4) -----
                    case "customer.subscription.created":
                    case "customer.subscription.updated":
                    case "customer.subscription.deleted": {
                        const sub = event.data.object as any;
                        await ctx.runAction(
                            internal.subscriptions.internalHandleStripeSubscriptionEvent,
                            {
                                eventType: event.type,
                                subscription: sub,
                            },
                        );
                        break;
                    }

                    case "checkout.session.completed": {
                        const session = event.data.object as any;
                        console.log(
                            `[Webhook] Checkout session completed: ${session.id} (mode=${session.mode})`,
                        );
                        break;
                    }

                    case "invoice.payment_succeeded":
                    case "invoice.payment_failed": {
                        const invoice = event.data.object as any;
                        if (invoice.subscription) {
                            try {
                                const sub = await stripe.subscriptions.retrieve(
                                    invoice.subscription as string,
                                );
                                await ctx.runAction(
                                    internal.subscriptions
                                        .internalHandleStripeSubscriptionEvent,
                                    {
                                        eventType: event.type,
                                        subscription: sub,
                                    },
                                );
                            } catch (e: any) {
                                console.error(
                                    `[Webhook] invoice.* sub fetch failed: ${e.message}`,
                                );
                            }
                        }
                        break;
                    }

                    // ----- Stripe Identity (KYC/KYB) -----
                    case "identity.verification_session.verified": {
                        const session = event.data.object as any;
                        const userId = session.metadata?.userId;
                        if (userId) {
                            await ctx.runMutation(internal.users.internalApproveKYC, {
                                targetUserId: userId as any,
                            });
                            console.log(`[Webhook] KYC Approved for user: ${userId}`);
                        }
                        break;
                    }
                    case "identity.verification_session.requires_input":
                    case "identity.verification_session.canceled": {
                        const session = event.data.object as any;
                        const userId = session.metadata?.userId;
                        if (userId) {
                            await ctx.runMutation(internal.users.internalRejectKYC, {
                                targetUserId: userId as any,
                            });
                            console.log(`[Webhook] KYC Rejected/Requires Input for user: ${userId}`);
                        }
                        break;
                    }

                    default:
                        console.log(`[Webhook] Unhandled event type: ${event.type}`);
                }
            }
        } catch (err: any) {
            console.error(`[Webhook] Error processing event ${event.id}:`, err);
            processingError = err.message;
        }

        await ctx.runMutation(internal.finance.markPaymentEventProcessed, {
            stripeEventId: event.id,
            error: processingError,
        });

        return new Response(null, { status: 200 });
    }),
});

// ---------------------------------------------------------------------------
// /kyc-webhook — receives KYC approval/rejection events.
// ---------------------------------------------------------------------------
http.route({
    path: "/kyc-webhook",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        try {
            const body = await request.json();
            const eventType = body.event;
            const targetUserId = body.userId;

            if (!targetUserId) {
                return new Response("Missing userId", { status: 400 });
            }

            if (eventType === "kyc.approved") {
                await ctx.runMutation(internal.users.internalApproveKYC, {
                    targetUserId: targetUserId as any,
                });
                console.log(`[KYC Webhook] Approved for user: ${targetUserId}`);
            } else if (eventType === "kyc.rejected") {
                await ctx.runMutation(internal.users.internalRejectKYC, {
                    targetUserId: targetUserId as any,
                });
                console.log(`[KYC Webhook] Rejected for user: ${targetUserId}`);
            } else {
                console.log(`[KYC Webhook] Unknown event type: ${eventType}`);
            }

            return new Response(null, { status: 200 });
        } catch (err: any) {
            console.error(`KYC Webhook error: ${err.message}`);
            return new Response(`Webhook Error: ${err.message}`, { status: 400 });
        }
    }),
});

// ---------------------------------------------------------------------------
// /apple-iap-webhook — App Store Server Notifications V2 endpoint.
//
// Apple sends `{ signedPayload }` (JWS). The internal action verifies the
// JWS chain (Apple Root CA G3 pinned), idempotency-checks the
// notificationUUID, decodes signedTransactionInfo and updates
// `iapReceipts` + pushes the user.
// ---------------------------------------------------------------------------
http.route({
    path: "/apple-iap-webhook",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        try {
            const body = await request.json();
            const signedPayload = body?.signedPayload;
            if (!signedPayload || typeof signedPayload !== "string") {
                return new Response("Missing signedPayload", { status: 400 });
            }
            await ctx.runAction(internal.iapActions.internalApplyAppleNotification, {
                signedPayload,
            });
            return new Response(null, { status: 200 });
        } catch (e: any) {
            console.error("[apple-iap-webhook] error:", e);
            return new Response(`Webhook Error: ${e.message}`, { status: 400 });
        }
    }),
});

// ---------------------------------------------------------------------------
// /google-iap-webhook — Google Real-Time Developer Notifications endpoint.
//
// Google sends a Pub/Sub envelope:
//   { message: { data: <base64 JSON>, attributes, messageId, publishTime }, subscription }
//
// Authentication: Pub/Sub authenticates push delivery with an OIDC token
// in `Authorization: Bearer <jwt>`. We require the token to be signed by
// Google's pubsub system service account when GOOGLE_PUBSUB_AUDIENCE is
// configured. (The audience must match what was set when creating the
// push subscription — usually the webhook URL.)
// ---------------------------------------------------------------------------
http.route({
    path: "/google-iap-webhook",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        try {
            const expectedAudience = process.env.GOOGLE_PUBSUB_AUDIENCE;
            const expectedEmail =
                process.env.GOOGLE_PUBSUB_SERVICE_ACCOUNT ?? "pubsub@system.gserviceaccount.com";

            if (expectedAudience) {
                const authHeader = request.headers.get("authorization") ?? "";
                const token = authHeader.startsWith("Bearer ")
                    ? authHeader.slice(7)
                    : null;
                if (!token) {
                    return new Response("Missing bearer token", { status: 401 });
                }
                const ok = await ctx.runAction(internal.iapActions.internalVerifyPubSubJwt, {
                    token,
                    expectedAudience,
                    expectedEmail,
                });
                if (!ok.valid) {
                    console.warn("[google-iap-webhook] JWT verification failed:", ok.reason);
                    return new Response("Unauthorized", { status: 401 });
                }
            } else {
                console.warn(
                    "[google-iap-webhook] GOOGLE_PUBSUB_AUDIENCE no configurado — saltando verificación de JWT",
                );
            }

            const envelope = await request.json();
            const data = envelope?.message?.data;
            if (!data) {
                return new Response(null, { status: 204 });
            }
            let decoded: any;
            try {
                decoded = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
            } catch (e) {
                console.warn("[google-iap-webhook] could not decode payload");
                return new Response(null, { status: 200 });
            }

            await ctx.runAction(internal.iapActions.internalApplyGoogleNotification, {
                decodedPayload: decoded,
            });
            return new Response(null, { status: 200 });
        } catch (e: any) {
            console.error("[google-iap-webhook] error:", e);
            return new Response(`Webhook Error: ${e.message}`, { status: 400 });
        }
    }),
});

// ---------------------------------------------------------------------------
// /support-ticket — receives support form payload and forwards to Zendesk.
// Keeps Zendesk credentials server-side only.
// ---------------------------------------------------------------------------
http.route({
    path: "/support-ticket",
    method: "POST",
    handler: httpAction(async (_ctx, request) => {
        if (!zendeskEnabled) {
            return new Response(JSON.stringify({ success: false, reason: "zendesk_disabled" }), {
                status: 503,
                headers: { "Content-Type": "application/json" },
            });
        }

        if (!zendeskSubdomain || !zendeskEmail || !zendeskApiToken) {
            return new Response(JSON.stringify({ success: false, reason: "zendesk_not_configured" }), {
                status: 503,
                headers: { "Content-Type": "application/json" },
            });
        }

        try {
            const body = await request.json();
            const name = String(body?.name ?? "").trim();
            const email = String(body?.email ?? "").trim();
            const category = String(body?.category ?? "Soporte General").trim();
            const subjectInput = String(body?.subject ?? "").trim();
            const message = String(body?.message ?? "").trim();

            if (!email || !subjectInput || !message) {
                return new Response(JSON.stringify({ success: false, reason: "invalid_payload" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const zendeskEndpoint = `https://${zendeskSubdomain}.zendesk.com/api/v2/requests.json`;
            const credentials = `${zendeskEmail}/token:${zendeskApiToken}`;
            const auth = `Basic ${btoa(credentials)}`;
            const subject = `[${category}] ${subjectInput}`;
            const commentBody = [
                `Nombre: ${name || "N/D"}`,
                `Correo: ${email}`,
                `Categoría: ${category}`,
                "",
                message,
            ].join("\n");

            const response = await fetch(zendeskEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: auth,
                },
                body: JSON.stringify({
                    request: {
                        requester: { name, email },
                        subject,
                        comment: { body: commentBody },
                    },
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                console.error(`[Support] Zendesk API error ${response.status}: ${text}`);
                return new Response(JSON.stringify({ success: false, reason: "zendesk_api_error" }), {
                    status: 502,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const data = await response.json();
            return new Response(
                JSON.stringify({
                    success: true,
                    id: data?.request?.id ?? data?.request_id ?? null,
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            );
        } catch (error: any) {
            console.error("[Support] Failed to create Zendesk ticket:", error);
            return new Response(JSON.stringify({ success: false, reason: "internal_error" }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }),
});

// Converted to consolidated webhook in /stripe-webhook

export default http;
