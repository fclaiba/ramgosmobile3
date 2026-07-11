import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

export const createPaymentIntent = action({
    args: {
        amount: v.number(),
        currency: v.string(),
        cartId: v.optional(v.string()),
        mode: v.union(v.literal("test"), v.literal("live")),
        userId: v.optional(v.string()),
        lineItems: v.optional(v.array(v.object({
            listingId: v.string(),
            sellerId: v.optional(v.string()),
            title: v.string(),
            price: v.number(),
            quantity: v.number(),
        }))),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        const userId = args.userId || (identity ? identity.subject : "anonymous");

        const numericAmount = Number(args.amount);
        if (numericAmount <= 0) {
            throw new Error("El monto debe ser mayor a 0");
        }

        const paymentIntentId = `sim_pi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const clientSecret = `${paymentIntentId}_secret_${Math.random().toString(36).slice(2, 10)}`;
        const transferGroup = args.cartId || `cart_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        await ctx.runMutation(internal.finance.createPaymentRecord, {
            userId,
            amount: numericAmount,
            stripePaymentIntentId: paymentIntentId,
            status: "succeeded",
            provider: "stripe",
            providerFee: 0,
            sellerNet: numericAmount,
            ramgosCommission: 0,
            influencerAmount: 0,
            commissionRate: 0,
            influencerRate: 0,
            description: args.lineItems?.[0]?.title || "Pago simulado",
        });

        if (args.lineItems && args.lineItems.length > 0) {
            await ctx.runAction(internal.payments.actions.internalProcessTestCartOrders, {
                stripePaymentIntentId: paymentIntentId,
                userId,
                cartId: transferGroup,
                amount: numericAmount,
                lineItems: args.lineItems,
            });
        }

        return {
            clientSecret,
            id: paymentIntentId,
            directSuccess: true,
            transferGroup,
            isTest: true,
        };
    },
});

export const internalProcessTestCartOrders = internalAction({
    args: {
        stripePaymentIntentId: v.string(),
        userId: v.string(),
        cartId: v.string(),
        amount: v.number(),
        lineItems: v.optional(v.array(v.object({
            listingId: v.string(),
            sellerId: v.optional(v.string()),
            title: v.string(),
            price: v.number(),
            quantity: v.number(),
        }))),
    },
    handler: async (ctx, args) => {
        const items = args.lineItems || [];

        const sellerGroups: Record<string, typeof items> = {};
        for (const item of items) {
            const sellerId = item.sellerId || "ramgos";
            if (!sellerGroups[sellerId]) sellerGroups[sellerId] = [];
            sellerGroups[sellerId].push(item);
        }

        for (const [sellerId, sellerItems] of Object.entries(sellerGroups)) {
            const subtotal = sellerItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);

            await ctx.runMutation(internal.stripe.internalCreateSubOrder, {
                userId: args.userId,
                sellerId,
                items: sellerItems.map(i => ({
                    listingId: i.listingId,
                    title: i.title,
                    quantity: i.quantity,
                    price: i.price,
                })),
                total: subtotal,
                netAmountCents: Math.round(subtotal * 100),
                commissionCents: 0,
                transferGroup: args.cartId,
                stripePaymentIntentId: args.stripePaymentIntentId,
            });
        }

        try {
            await ctx.runMutation(internal.cart.internalClearCart, { userId: args.userId });
        } catch {}
    },
});