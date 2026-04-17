import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import Stripe from "stripe";

const http = httpRouter();
const allowStripeMock = process.env.ALLOW_STRIPE_MOCK === "true";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = new Stripe(stripeSecretKey || "sk_test_mock_fallback", {
    apiVersion: "2024-04-10" as any,
});

http.route({
    path: "/stripe-webhook",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        if ((!stripeSecretKey || !stripeWebhookSecret) && !allowStripeMock) {
            return new Response("Stripe webhook no configurado para este entorno.", { status: 503 });
        }

        const signature = request.headers.get("stripe-signature") as string;
        
        // Skip validation if secret is not configured
        if (!stripeWebhookSecret) {
            console.log("[Development Mock] Skipped Stripe Webhook signature validation");
        }

        let event: Stripe.Event;

        try {
            const body = await request.text();
            
            if (stripeWebhookSecret) {
                event = stripe.webhooks.constructEvent(
                    body,
                    signature,
                    stripeWebhookSecret
                );
            } else {
                // Mock parse for local logic
                event = JSON.parse(body) as Stripe.Event;
            }
        } catch (err: any) {
            console.error(`Webhook signature verification failed. ${err.message}`);
            return new Response(`Webhook Error: ${err.message}`, { status: 400 });
        }

        // Handle the event
        switch (event.type) {
            case "payment_intent.succeeded":
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                console.log(`PaymentIntent for ${paymentIntent.amount} was successful!`);
                
                const orderId = paymentIntent.metadata?.orderId;
                if (orderId) {
                    try {
                        await ctx.runMutation(internal.orders.internalUpdateOrderStatus, {
                            orderId: orderId as any,
                            status: "payment_received"
                        });
                    } catch (err) {
                        console.error("Failed to update order status", err);
                    }
                }
                break;

            case "payment_method.attached":
                const paymentMethod = event.data.object as Stripe.PaymentMethod;
                console.log("PaymentMethod was attached to a Customer!");
                break;
                
            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        return new Response(null, { status: 200 });
    }),
});

http.route({
    path: "/kyc-webhook",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        try {
            const body = await request.json();
            
            // Expected body shape from simulated webhook or real provider
            // { event: 'kyc.approved', userId: 'xyz' }
            const eventType = body.event;
            const targetUserId = body.userId;

            if (!targetUserId) {
                return new Response("Missing userId", { status: 400 });
            }

            if (eventType === 'kyc.approved') {
                await ctx.runMutation(internal.users.internalApproveKYC, {
                    targetUserId: targetUserId as any
                });
                console.log(`KYC Approved for user: ${targetUserId}`);
            } else if (eventType === 'kyc.rejected') {
                await ctx.runMutation(internal.users.internalRejectKYC, {
                    targetUserId: targetUserId as any
                });
                console.log(`KYC Rejected for user: ${targetUserId}`);
            }

            return new Response(null, { status: 200 });
        } catch (err: any) {
            console.error(`KYC Webhook error: ${err.message}`);
            return new Response(`Webhook Error: ${err.message}`, { status: 400 });
        }
    })
});

export default http;
