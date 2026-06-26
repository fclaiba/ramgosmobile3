import { action } from "../_generated/server";
import { v } from "convex/values";
import Stripe from "stripe";

export const createPaymentIntent = action({
    args: { 
        amount: v.number(), 
        currency: v.string(),
        cartId: v.optional(v.string()), // Used as transfer_group
    },
    handler: async (ctx, args) => {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-06-24.dahlia" as any });
        
        const numericAmount = Number(args.amount);
        const isZeroDecimal = ['jpy', 'krw'].includes(args.currency.toLowerCase());
        const amountInSmallestUnit = isZeroDecimal ? Math.round(numericAmount) : Math.round(numericAmount * 100);
        
        // Ensure user is authenticated to get userId
        const identity = await ctx.auth.getUserIdentity();
        const userId = identity ? identity.subject : "anonymous";

        if (amountInSmallestUnit < 50 && !isZeroDecimal) {
            throw new Error(`El monto mínimo es $0.50 ${args.currency.toUpperCase()}`);
        }

        // Ponytail Multi-vendor Split: We use a custom transfer_group so we can split it later
        const transferGroup = args.cartId || `cart_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInSmallestUnit,
            currency: args.currency,
            transfer_group: transferGroup,
            metadata: {
                cartId: transferGroup,
                userId: userId,
            }
        });
        return { clientSecret: paymentIntent.client_secret!, id: paymentIntent.id, directSuccess: false, transferGroup };
    },
});