import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import type Stripe from "stripe";
import { getStripe, hasStripeKey, webhookSecretsFor } from "./stripeClient";
import type { StripeMode } from "./_stripeEnv";

const http = httpRouter();
const zendeskEnabled = process.env.ZENDESK_ENABLED === "true";
const zendeskSubdomain = process.env.ZENDESK_SUBDOMAIN;
const zendeskEmail = process.env.ZENDESK_EMAIL;
const zendeskApiToken = process.env.ZENDESK_API_TOKEN;

// ---------------------------------------------------------------------------
// Webhooks de Stripe — UNA RUTA POR MODO.
//
//   /stripe-webhook       → cuenta LIVE  (secrets STRIPE_WEBHOOK_SECRET*)
//   /stripe-webhook-test  → cuenta TEST  (secrets STRIPE_WEBHOOK_SECRET_*_TEST)
//
// Por qué: el modo se conoce ANTES de verificar la firma, así que sólo se
// prueban los secretos de ese modo; `stripe listen` (CLI) es test-only y
// reenvía a una única URL; y un evento con `livemode` distinto al de la ruta
// se rechaza (400) en vez de procesarse contra el modo equivocado.
//
// Estilos de payload:
//   - Snapshot (V1: payment_intent.*, charge.*, refund.*, transfer.*, ...):
//     payload completo en `event.data.object`, verificado con
//     `webhooks.constructEventAsync`.
//   - Thin (V2: v2.core.account[...]): sólo id + type + related_object,
//     verificado con `parseEventNotificationAsync` y completado con
//     `v2.core.events.retrieve(id)` cuando hace falta.
//
// Idempotencia: `paymentEvents` por event.id. El evento se registra ANTES de
// procesar y se marca `processed` sólo si terminó bien; ante error se
// responde 500 para que Stripe reintente. El procesamiento en sí también es
// idempotente (órdenes por PI, transfers con idempotencyKey), así que un
// reintento nunca duplica plata.
// ---------------------------------------------------------------------------

type ParsedEvent =
    | { style: "snapshot"; event: Stripe.Event }
    | { style: "thin"; notification: any };

async function verifyStripeEvent(
    mode: StripeMode,
    body: string,
    signature: string,
): Promise<ParsedEvent> {
    const secrets = webhookSecretsFor(mode);
    const stripe = getStripe(mode);
    let raw: any = null;
    try {
        raw = JSON.parse(body);
    } catch {
        raw = null;
    }
    const isThin = raw?.object === "v2.core.event";
    let lastError: any = null;
    for (const secret of secrets) {
        try {
            if (isThin) {
                const notification = await (stripe as any).parseEventNotificationAsync(body, signature, secret);
                return { style: "thin", notification };
            }
            const event = await stripe.webhooks.constructEventAsync(body, signature, secret);
            return { style: "snapshot", event };
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError ?? new Error("Sin secretos de webhook configurados");
}

const stripeWebhookHandler = (mode: StripeMode) =>
    httpAction(async (ctx, request) => {
        if (!hasStripeKey(mode) || webhookSecretsFor(mode).length === 0) {
            return new Response(`Stripe webhook (${mode}) no configurado para este entorno.`, { status: 503 });
        }

        const body = await request.text();
        const signature = request.headers.get("stripe-signature") ?? "";
        let parsed: ParsedEvent;
        try {
            parsed = await verifyStripeEvent(mode, body, signature);
        } catch (err: any) {
            console.error(`[Webhook ${mode}] Firma inválida: ${err.message}`);
            return new Response(`Webhook Error: ${err.message}`, { status: 400 });
        }

        const eventId: string = parsed.style === "snapshot" ? parsed.event.id : parsed.notification.id;
        const eventType: string = parsed.style === "snapshot" ? parsed.event.type : parsed.notification.type;
        const livemode: boolean | undefined =
            parsed.style === "snapshot" ? parsed.event.livemode : parsed.notification.livemode;
        if (typeof livemode === "boolean" && livemode !== (mode === "live")) {
            console.error(`[Webhook ${mode}] Evento ${eventId} con livemode=${livemode} en la ruta equivocada.`);
            return new Response("livemode no coincide con la ruta", { status: 400 });
        }

        const { alreadyProcessed } = await ctx.runMutation(internal.finance.recordPaymentEvent, {
            stripeEventId: eventId,
            eventType,
            mode,
            payloadStyle: parsed.style,
            payload: parsed.style === "snapshot" ? (parsed.event.data?.object as any) : parsed.notification,
        });
        if (alreadyProcessed) {
            console.log(`[Webhook ${mode}] Evento ${eventId} (${eventType}) ya procesado.`);
            return new Response(null, { status: 200 });
        }

        let processingError: string | undefined;
        try {
            if (parsed.style === "thin") {
                await handleThinEvent(ctx, mode, parsed.notification);
            } else {
                await handleSnapshotEvent(ctx, mode, parsed.event);
            }
        } catch (err: any) {
            console.error(`[Webhook ${mode}] Error procesando ${eventId} (${eventType}):`, err);
            processingError = err?.message ?? String(err);
        }

        await ctx.runMutation(internal.finance.markPaymentEventProcessed, {
            stripeEventId: eventId,
            error: processingError,
        });

        if (processingError) {
            return new Response(`Processing error: ${processingError}`, { status: 500 });
        }
        return new Response(null, { status: 200 });
    });

async function handleThinEvent(ctx: any, mode: StripeMode, notification: any): Promise<void> {
    const type: string = notification.type;
    const stripe = getStripe(mode);
    switch (type) {
        case "v2.core.account[requirements].updated":
        case "v2.core.account[configuration.recipient].capability_status_updated":
        case "v2.core.account[configuration.recipient].updated":
        case "v2.core.account.updated": {
            const accountId: string | undefined = notification.related_object?.id;
            if (accountId) {
                await ctx.runAction(internal.connect.internalApplyV2AccountUpdate, { mode, accountId });
            }
            break;
        }
        case "v2.core.account_link.returned": {
            // El thin event no trae el account id: hay que traer el evento completo.
            const full: any = await (stripe as any).v2.core.events.retrieve(notification.id);
            const accountId: string | undefined = full?.data?.account_id ?? notification.related_object?.id;
            if (accountId) {
                await ctx.runAction(internal.connect.internalApplyV2AccountUpdate, { mode, accountId });
            }
            break;
        }
        default:
            console.log(`[Webhook ${mode} V2] Tipo no manejado: ${type}`);
    }
}

async function handleSnapshotEvent(ctx: any, mode: StripeMode, event: Stripe.Event): Promise<void> {
    const stripe = getStripe(mode);
    switch (event.type) {
        case "payment_intent.succeeded": {
            const pi = event.data.object as Stripe.PaymentIntent;
            console.log(`[Webhook ${mode}] PaymentIntent ${pi.id} succeeded (${pi.amount / 100} USD)`);
            if (pi.metadata?.cartId) {
                await ctx.runAction(internal.stripe.internalHandlePaymentIntentSucceeded, {
                    mode,
                    paymentIntentId: pi.id,
                });
            } else {
                // Legacy: PI sin carrito (orden creada antes del pago).
                await ctx.runMutation(internal.stripe.internalMarkPaymentSucceeded, {
                    stripePaymentIntentId: pi.id,
                    orderId: pi.metadata?.orderId,
                });
                if (pi.metadata?.orderId) {
                    try {
                        await ctx.runMutation(internal.orders.internalUpdateOrderStatus, {
                            orderId: pi.metadata.orderId as any,
                            status: "payment_received",
                        });
                    } catch (err) {
                        console.error("[Webhook] No se pudo actualizar la orden legacy:", err);
                    }
                }
            }
            break;
        }

        case "payment_intent.payment_failed": {
            const pi = event.data.object as Stripe.PaymentIntent;
            await ctx.runMutation(internal.finance.updatePaymentByIntentId, {
                stripePaymentIntentId: pi.id,
                status: "failed",
            });
            // El stock reservado al crear el PI vuelve al inventario ahora, sin
            // esperar al cron (H3).
            await ctx.runMutation(internal.stock.internalReleaseReservationForPayment, {
                stripePaymentIntentId: pi.id,
                reason: "payment_failed",
            });
            break;
        }

        case "payment_intent.canceled": {
            const pi = event.data.object as Stripe.PaymentIntent;
            await ctx.runMutation(internal.finance.updatePaymentByIntentId, {
                stripePaymentIntentId: pi.id,
                status: "failed",
            });
            await ctx.runMutation(internal.stock.internalReleaseReservationForPayment, {
                stripePaymentIntentId: pi.id,
                reason: "payment_canceled",
            });
            break;
        }

        case "charge.refunded": {
            const charge = event.data.object as Stripe.Charge;
            const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
            if (piId) {
                await ctx.runAction(internal.stripe.internalSyncExternalRefund, {
                    mode,
                    paymentIntentId: piId,
                    amountRefundedCents: charge.amount_refunded,
                });
            }
            break;
        }

        case "charge.dispute.created": {
            const dispute = event.data.object as Stripe.Dispute;
            const piId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
            if (piId) {
                await ctx.runMutation(internal.stripe.internalFreezeOrdersForPaymentIntent, {
                    stripePaymentIntentId: piId,
                    disputeId: dispute.id,
                });
            }
            break;
        }

        case "charge.dispute.closed": {
            const dispute = event.data.object as Stripe.Dispute;
            const piId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
            if (piId) {
                await ctx.runAction(internal.stripe.internalResolveStripeDispute, {
                    mode,
                    paymentIntentId: piId,
                    disputeId: dispute.id,
                    status: dispute.status,
                });
            }
            break;
        }

        case "charge.dispute.funds_withdrawn":
        case "charge.dispute.funds_reinstated":
        case "charge.dispute.updated":
        case "transfer.created":
        case "transfer.reversed":
        case "transfer.updated":
        case "refund.created":
        case "refund.updated":
        case "refund.failed":
        case "payout.paid":
        case "payout.failed": {
            // Informativos: quedan registrados en paymentEvents para auditoría.
            console.log(`[Webhook ${mode}] ${event.type} registrado.`);
            break;
        }

        // El estado real de Connect fluye por el webhook thin V2
        // (v2.core.account[...].updated -> internal.connect.internalApplyV2AccountUpdate).
        // Si Stripe llega a mandar este evento V1 igual, no lo persistimos -- pero
        // no debe pasar inadvertido: alertamos para poder investigar por qué llegó.
        case "account.updated": {
            console.warn(
                `[Webhook ${mode}] account.updated (V1) recibido para cuenta ${
                    (event.data.object as { id?: string })?.id ?? "desconocida"
                } -- no persiste nada, el estado real se maneja por el webhook thin V2. Investigar por qué Stripe mandó V1.`,
            );
            break;
        }

        // ----- Stripe Subscriptions -----
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
            await ctx.runAction(internal.subscriptions.internalHandleStripeSubscriptionEvent, {
                eventType: event.type,
                subscription: event.data.object as any,
                mode,
            });
            break;
        }

        case "checkout.session.completed": {
            const session = event.data.object as any;
            console.log(`[Webhook ${mode}] Checkout session completed: ${session.id} (mode=${session.mode})`);
            break;
        }

        case "invoice.payment_succeeded":
        case "invoice.payment_failed": {
            const invoice = event.data.object as any;
            const subId = invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
            if (subId) {
                const sub = await stripe.subscriptions.retrieve(String(subId));
                await ctx.runAction(internal.subscriptions.internalHandleStripeSubscriptionEvent, {
                    eventType: event.type,
                    subscription: sub,
                    mode,
                });
            }
            break;
        }

        // ----- Stripe Identity (KYC/KYB) -----
        case "identity.verification_session.verified": {
            const session = event.data.object as any;
            const userId = session.metadata?.userId;
            if (userId) {
                await ctx.runMutation(internal.users.internalApproveKYC, { targetUserId: userId as any });
            }
            break;
        }
        case "identity.verification_session.requires_input":
        case "identity.verification_session.canceled": {
            const session = event.data.object as any;
            const userId = session.metadata?.userId;
            if (userId) {
                await ctx.runMutation(internal.users.internalRejectKYC, { targetUserId: userId as any });
            }
            break;
        }

        default:
            console.log(`[Webhook ${mode}] Tipo no manejado: ${event.type}`);
    }
}

http.route({ path: "/stripe-webhook", method: "POST", handler: stripeWebhookHandler("live") });
http.route({ path: "/stripe-webhook-test", method: "POST", handler: stripeWebhookHandler("test") });

// ---------------------------------------------------------------------------
// /kyc-webhook — ELIMINADO (2026-08-25).
//
// Aceptaba `{ event: "kyc.approved", userId }` por POST y llamaba a
// `internalApproveKYC` SIN NINGUNA AUTENTICACIÓN: sin firma, sin secreto
// compartido, sin allowlist de IP. Como el KYC aprobado habilita retirar
// fondos (`finance.ts`) y crear formularios de negocio (`businessForms.ts`),
// cualquiera que conociera la URL del deployment y un userId podía
// auto-aprobarse. Escalada de privilegios remota.
//
// No lo llamaba nadie: la aprobación real entra por dos caminos que sí están
// autenticados — el panel de admin (`users.approveKYC`, con rol verificado) y
// el webhook de Stripe Identity de más arriba, que valida la firma.
//
// Si alguna vez se integra un proveedor externo de KYC, el endpoint nuevo
// tiene que verificar firma como hace `/stripe-webhook`, y fallar cerrado si
// falta el secreto.
// ---------------------------------------------------------------------------

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
