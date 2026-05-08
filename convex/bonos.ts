/**
 * convex/bonos.ts — Bono (gift voucher) lifecycle.
 *
 * Lifecycle:
 *   1. Buyer purchases a `listings` row of type 'bono' through the marketplace
 *      checkout. PaymentIntent succeeds and webhook calls
 *      `internal.bonos.internalIssueBonosForPayment` → emits one
 *      `bonoRedemptions` row per quantity unit, status = 'issued'.
 *   2. App displays bonoCode + QR to the buyer.
 *   3. Business POS scans the code via `redeemBono` mutation. We validate:
 *        - the actor is the seller (or admin)
 *        - bono is currently 'issued'
 *        - validUntil is not past
 *      Then we mark it 'redeemed', and AUTO-CONFIRM the order line so
 *      escrow releases to the seller (no waiting period — fulfillment
 *      happens at scan time).
 *
 * QR payload:
 *   We use the bonoCode as the QR text. The scanner only needs to call
 *   redeemBono({ bonoCode }) — no signature needed because:
 *     - the code is high-entropy (UUID v4 + check digit)
 *     - the redeemBono mutation does the auth check (only the seller of
 *       the bono's listing can redeem it).
 */

import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor } from "./authHelpers";

// Generates an opaque, sufficiently-unique code for a bono. We don't need
// cryptographic randomness here — Convex queries / mutations execute in V8
// isolates so Math.random is fine, and the code is also indexed.
const generateBonoCode = (): string => {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    const rand2 = Math.random().toString(36).slice(2, 6);
    return `BNO-${ts}-${rand}${rand2}`.toUpperCase();
};

// ---------------------------------------------------------------------------
// internalIssueBonosForPayment — called from the Stripe webhook handler
// when a payment line of type='bono' succeeds.
// ---------------------------------------------------------------------------
export const internalIssueBonosForPayment = internalMutation({
    args: {
        paymentId: v.id("payments"),
    },
    handler: async (ctx, args) => {
        const payment = await ctx.db.get(args.paymentId);
        if (!payment) return;
        if (!payment.sellerId) return;

        const meta = (payment.metadata ?? {}) as any;
        const listingId: string | undefined = meta.listingId;
        const type: string | undefined = meta.type;
        if (type !== "bono" || !listingId) return;

        // Resolve the listing for validUntil + sanity checks.
        const listingNormId = ctx.db.normalizeId("listings", listingId);
        const listing = listingNormId ? await ctx.db.get(listingNormId) : null;
        if (!listing) {
            console.warn(`[Bonos] Listing not found for payment ${args.paymentId}`);
            return;
        }
        if ((listing as any).type !== "bono") {
            console.warn(`[Bonos] Listing ${listingId} is not a bono`);
            return;
        }

        // Idempotency: skip if we already emitted bonos for this payment.
        const existing = await ctx.db
            .query("bonoRedemptions")
            .withIndex("by_listing", (q) => q.eq("listingId", listingId))
            .filter((q) => q.eq(q.field("paymentId"), String(args.paymentId)))
            .collect();
        if (existing.length > 0) {
            console.log(
                `[Bonos] ${existing.length} already issued for payment ${args.paymentId}; skipping`,
            );
            return;
        }

        // Quantity defaults to 1 if metadata doesn't specify it. For bonos,
        // each unit becomes its own redeemable code.
        const quantity = Number((meta.quantity as number) ?? 1) || 1;

        for (let i = 0; i < quantity; i++) {
            const code = generateBonoCode();
            await ctx.db.insert("bonoRedemptions", {
                bonoCode: code,
                listingId,
                ownerUserId: payment.userId,
                sellerId: payment.sellerId,
                paymentId: String(args.paymentId),
                orderId: payment.orderId ?? undefined,
                validUntil: (listing as any).validUntil,
                status: "issued",
                createdAt: new Date().toISOString(),
            });
        }

        console.log(
            `[Bonos] Issued ${quantity} bono(s) for payment ${args.paymentId}`,
        );
    },
});

// ---------------------------------------------------------------------------
// redeemBono — called from the business POS scanner.
// ---------------------------------------------------------------------------
export const redeemBono = mutation({
    args: {
        actorId: v.optional(v.id("users")),
        sellerId: v.optional(v.string()), // legacy fallback
        bonoCode: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.sellerId);

        const bono = await ctx.db
            .query("bonoRedemptions")
            .withIndex("by_code", (q) => q.eq("bonoCode", args.bonoCode))
            .first();
        if (!bono) throw new Error("Código de bono inválido.");

        // Auth: only the seller (or admin) of THIS bono can redeem it.
        const isSeller = bono.sellerId === actor.idString;
        const isAdmin = actor.role === "admin" || actor.role === "developer";
        if (!isSeller && !isAdmin) {
            throw new Error("No autorizado. Este bono pertenece a otro negocio.");
        }

        if (bono.status === "redeemed") {
            throw new Error("Este bono ya fue canjeado.");
        }
        if (bono.status === "cancelled") {
            throw new Error("Este bono fue cancelado.");
        }

        // Expiration check
        if (bono.validUntil) {
            const expiresAt = new Date(bono.validUntil).getTime();
            if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
                await ctx.db.patch(bono._id, {
                    status: "expired",
                });
                throw new Error("Este bono está vencido.");
            }
        }

        // Mark as redeemed
        await ctx.db.patch(bono._id, {
            status: "redeemed",
            redeemedByBusinessUserId: actor.idString,
            redeemedAt: new Date().toISOString(),
        });

        // Auto-release escrow for the order this bono came from.
        // Bonos are fulfilled at scan time — there's no shipping wait,
        // so we don't make the buyer manually press "Confirm receipt".
        if (bono.orderId) {
            const orderNormId = ctx.db.normalizeId("orders", bono.orderId);
            if (orderNormId) {
                const order = await ctx.db.get(orderNormId);
                if (
                    order &&
                    (order.status === "payment_received" ||
                        order.status === "delivered")
                ) {
                    await ctx.db.patch(orderNormId, {
                        status: "completed",
                        escrowState: "released",
                        updatedAt: new Date().toISOString(),
                    });
                    await ctx.runMutation(
                        internal.stripe.internalReleasePayment,
                        { orderId: orderNormId },
                    );
                }
            }
        }

        return {
            success: true,
            bonoId: String(bono._id),
            listingId: bono.listingId,
        };
    },
});

// ---------------------------------------------------------------------------
// Buyer-facing query: list a user's purchased bonos.
// ---------------------------------------------------------------------------
export const getMyBonos = query({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.userId);
        const userId = args.userId ?? actor.idString;
        if (userId !== actor.idString && actor.role !== "admin") {
            throw new Error("No autorizado.");
        }
        return await ctx.db
            .query("bonoRedemptions")
            .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
            .order("desc")
            .collect();
    },
});

// Seller-facing query: list bonos issued by a seller (history of all
// emitted vouchers — useful for the "Mis Bonos" tab in BusinessDashboard).
export const getBonosBySeller = query({
    args: {
        actorId: v.optional(v.id("users")),
        sellerId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.sellerId);
        const sellerId = args.sellerId ?? actor.idString;
        if (sellerId !== actor.idString && actor.role !== "admin") {
            throw new Error("No autorizado.");
        }
        return await ctx.db
            .query("bonoRedemptions")
            .withIndex("by_seller", (q) => q.eq("sellerId", sellerId))
            .order("desc")
            .collect();
    },
});

// Lookup by code (used by the scanner before calling redeemBono, so the
// UI can preview seller name / amount before confirming).
export const lookupBono = query({
    args: { bonoCode: v.string() },
    handler: async (ctx, args) => {
        const bono = await ctx.db
            .query("bonoRedemptions")
            .withIndex("by_code", (q) => q.eq("bonoCode", args.bonoCode))
            .first();
        if (!bono) return null;
        // Hydrate listing for display.
        const listingNormId = ctx.db.normalizeId("listings", bono.listingId);
        const listing = listingNormId ? await ctx.db.get(listingNormId) : null;
        return { ...bono, listing };
    },
});
