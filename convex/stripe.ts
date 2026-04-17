import { v } from "convex/values";
import { action, internalMutation, mutation } from "./_generated/server";
import { requireActor } from "./authHelpers";
import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY;
const allowStripeMock = process.env.ALLOW_STRIPE_MOCK === "true";
const isMockMode = !stripeKey;
const stripe = new Stripe(stripeKey ?? "sk_test_mock_fallback", {
    apiVersion: "2024-04-10" as any, 
});

const assertStripeConfigured = () => {
    if (!isMockMode) return;
    if (allowStripeMock) return;
    throw new Error("Stripe no configurado. Define STRIPE_SECRET_KEY en Convex o habilita ALLOW_STRIPE_MOCK=true solo para desarrollo.");
};

export const createPaymentIntent = action({
    args: {
        orderId: v.optional(v.id("orders")),
        amountInCents: v.number(), // Stripe expects minor units
    },
    handler: async (ctx, args) => {
        assertStripeConfigured();
        // Here we ideally cross-check the 'orders' table to verify the exact amount of the ID
        // But since this is a demonstration, we trust the caller or add standard validation.

        if (isMockMode) {
            console.log(`[Development Mock] Simulated createPaymentIntent for ${args.amountInCents} cents.`);
            return {
                clientSecret: "pi_mock_secret_12345",
                paymentIntentId: "pi_mock_12345"
            };
        }

        try {
            const paymentIntent = await stripe.paymentIntents.create({
                amount: args.amountInCents,
                currency: "usd",
                metadata: {
                    orderId: args.orderId || "unknown",
                },
                payment_method_types: ["card"],
                // In a real app we'd configure application_fee_amount and transfer_data here
                // if we were instantly routing it.
            });

            return {
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id
            };
        } catch (error: any) {
            console.error("Stripe error:", error);
            throw new Error(`Error creating payment: ${error.message}`);
        }
    }
});

export const createConnectAccountLink = action({
    args: {
        accountId: v.string(), // "acct_1..."
    },
    handler: async (ctx, args) => {
        assertStripeConfigured();
        if (isMockMode) {
            return "https://connect.stripe.com/mock-onboarding";
        }
        
        try {
            const accountLink = await stripe.accountLinks.create({
                account: args.accountId,
                refresh_url: "ramgos://business/onboarding-refresh",
                return_url: "ramgos://business/onboarding-complete",
                type: "account_onboarding",
            });
            return accountLink.url;
        } catch (error: any) {
            console.error("Stripe Connect error:", error);
            throw new Error(error.message);
        }
    }
});

export const executePayout = action({
    args: {
        amountInCents: v.number(),
        destinationAccountId: v.string()
    },
    handler: async (ctx, args) => {
        assertStripeConfigured();
        if (isMockMode) {
            console.log(`[Development Mock] Executed transfer of ${args.amountInCents} to ${args.destinationAccountId}`);
            return { success: true, transferId: "tr_mock_123" };
        }

        try {
            const transfer = await stripe.transfers.create({
                amount: args.amountInCents,
                currency: "usd",
                destination: args.destinationAccountId,
            });
            return { success: true, transferId: transfer.id };
        } catch (error: any) {
            throw new Error(error.message);
        }
    }
});
