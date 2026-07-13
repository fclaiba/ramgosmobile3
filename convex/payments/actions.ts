// ---------------------------------------------------------------------------
// FASE 5 — CAMINO DESCARTADO (2026-07-13)
//
// Este simulador de pagos quedó DESCARTADO. El camino único activo es
// convex/stripe.ts (Stripe real en modo TEST) + webhook en convex/http.ts.
// La action pública de acá abajo lanza error para que nadie pueda registrar
// pagos "succeeded" sin pasar por Stripe. Eliminación total: Fase 8d.
// Referencia histórica: MÓDULO_PAGOS_RESPALDO.md.
// ---------------------------------------------------------------------------
import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireActor } from "../authHelpers";

export const createPaymentIntent = action({
    args: {
        sessionToken: v.optional(v.string()),
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
        // Fase 5: camino descartado. Se mantiene el requireActor por consistencia
        // de auth, pero la action ya no simula pagos.
        await requireActor(ctx, (args as any).sessionToken);
        throw new Error(
            "Camino de pago simulado deshabilitado (Fase 5). Usar api.stripe.createPaymentIntent.",
        );
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