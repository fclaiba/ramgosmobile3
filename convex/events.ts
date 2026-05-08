/**
 * convex/events.ts — Event ticket lifecycle.
 *
 * Lifecycle:
 *   1. Buyer adds an event listing to cart, hits checkout.
 *   2. CheckoutScreen (or PaymentIntent action) calls `holdEventCapacity`
 *      atomically BEFORE the PaymentIntent is created. If capacity check
 *      fails (oversold), the PI never gets created → buyer sees a
 *      friendly "Sold out" toast instead of a charge that has to be refunded.
 *   3. PaymentIntent succeeds → webhook calls `internalIssueEventReservationsForPayment`
 *      → emits one `eventReservations` row per quantity unit, status = 'confirmed',
 *      with a QR code.
 *   4. At the event entrance, the host scans the QR via `checkInReservation`.
 *   5. A daily cron auto-confirms (releases escrow) for events whose date
 *      has passed by 24h+ — see `cronAutoReleaseEvents`.
 *
 * Capacity model:
 *   `listings.eventCapacity` = total seats; `listings.eventSoldCount` =
 *   currently-held seats. We mutate `eventSoldCount` directly inside a
 *   single mutation so concurrent buyers can't oversell.
 */

import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor } from "./authHelpers";

const generateQrCode = (): string => {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `EVT-${ts}-${rand}`.toUpperCase();
};

// ---------------------------------------------------------------------------
// holdEventCapacity — atomic check-and-decrement of `eventSoldCount`.
// Throws if the requested quantity would exceed eventCapacity.
//
// CALL THIS BEFORE creating the PaymentIntent for an event line item.
// ---------------------------------------------------------------------------
export const holdEventCapacity = mutation({
    args: {
        actorId: v.optional(v.id("users")),
        listingId: v.id("listings"),
        quantity: v.number(),
    },
    handler: async (ctx, args) => {
        // Auth: any logged-in user may hold capacity for themselves.
        await requireActor(ctx, args.actorId);
        if (args.quantity <= 0) throw new Error("Cantidad inválida.");

        const listing = await ctx.db.get(args.listingId);
        if (!listing) throw new Error("Evento no encontrado.");
        if ((listing as any).type !== "event") {
            throw new Error("Esta función solo aplica a eventos.");
        }

        const capacity = (listing as any).eventCapacity as number | undefined;
        const sold = ((listing as any).eventSoldCount as number | undefined) ?? 0;

        // If capacity is undefined we treat it as unlimited (open-air event,
        // free flow). Most ticketed events SHOULD have a capacity though.
        if (typeof capacity === "number" && sold + args.quantity > capacity) {
            throw new Error(
                `Capacidad agotada. Quedan ${Math.max(0, capacity - sold)} entradas.`,
            );
        }

        await ctx.db.patch(args.listingId, {
            eventSoldCount: sold + args.quantity,
        } as any);

        return { ok: true, newSoldCount: sold + args.quantity };
    },
});

// ---------------------------------------------------------------------------
// releaseEventCapacity — reverse holdEventCapacity, e.g. when a PI fails
// or the buyer cancels before paying.
// ---------------------------------------------------------------------------
export const releaseEventCapacity = mutation({
    args: {
        actorId: v.optional(v.id("users")),
        listingId: v.id("listings"),
        quantity: v.number(),
    },
    handler: async (ctx, args) => {
        await requireActor(ctx, args.actorId);
        const listing = await ctx.db.get(args.listingId);
        if (!listing) return;
        const sold = ((listing as any).eventSoldCount as number | undefined) ?? 0;
        await ctx.db.patch(args.listingId, {
            eventSoldCount: Math.max(0, sold - args.quantity),
        } as any);
    },
});

// ---------------------------------------------------------------------------
// internalIssueEventReservationsForPayment — webhook-driven.
// ---------------------------------------------------------------------------
export const internalIssueEventReservationsForPayment = internalMutation({
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
        if (type !== "event" || !listingId) return;

        const listingNormId = ctx.db.normalizeId("listings", listingId);
        const listing = listingNormId ? await ctx.db.get(listingNormId) : null;
        if (!listing) {
            console.warn(
                `[Events] Listing not found for payment ${args.paymentId}`,
            );
            return;
        }
        if ((listing as any).type !== "event") {
            console.warn(`[Events] Listing ${listingId} is not an event`);
            return;
        }

        // Idempotency — skip if reservations already exist for this payment.
        const existing = await ctx.db
            .query("eventReservations")
            .withIndex("by_listing", (q) => q.eq("listingId", listingId))
            .filter((q) => q.eq(q.field("paymentId"), String(args.paymentId)))
            .collect();
        if (existing.length > 0) {
            console.log(
                `[Events] ${existing.length} reservations already issued for payment ${args.paymentId}; skipping`,
            );
            return;
        }

        // We persist ONE reservation per payment row (buyers can choose
        // quantity inside the reservation). For per-seat QR codes, we'd
        // emit `quantity` rows here — kept as a single row for simplicity
        // since one QR can be presented to scan all attendees together.
        const quantity = Number((meta.quantity as number) ?? 1) || 1;

        await ctx.db.insert("eventReservations", {
            listingId,
            userId: payment.userId,
            sellerId: payment.sellerId,
            paymentId: String(args.paymentId),
            orderId: payment.orderId ?? undefined,
            quantity,
            qrCode: generateQrCode(),
            status: "confirmed",
            eventDate: (listing as any).eventDate,
            createdAt: new Date().toISOString(),
        });

        console.log(
            `[Events] Confirmed reservation (qty=${quantity}) for payment ${args.paymentId}`,
        );
    },
});

// ---------------------------------------------------------------------------
// checkInReservation — entrance scanner.
// Marks the reservation as checked_in. Does NOT auto-release escrow —
// release happens via the daily cron after eventDate + 24h, so the
// organizer has a brief dispute window post-event.
// ---------------------------------------------------------------------------
export const checkInReservation = mutation({
    args: {
        actorId: v.optional(v.id("users")),
        qrCode: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);

        const res = await ctx.db
            .query("eventReservations")
            .withIndex("by_qr", (q) => q.eq("qrCode", args.qrCode))
            .first();
        if (!res) throw new Error("Código de entrada inválido.");

        const isSeller = res.sellerId === actor.idString;
        const isAdmin = actor.role === "admin" || actor.role === "developer";
        if (!isSeller && !isAdmin) {
            throw new Error("No autorizado. Esta entrada pertenece a otro evento.");
        }

        if (res.status === "checked_in") {
            throw new Error("Esta entrada ya fue registrada.");
        }
        if (res.status === "cancelled" || res.status === "refunded") {
            throw new Error("Esta entrada está anulada.");
        }

        await ctx.db.patch(res._id, {
            status: "checked_in",
            checkedInAt: new Date().toISOString(),
        });

        return { success: true, reservationId: String(res._id) };
    },
});

// Buyer-facing list of their event reservations.
export const getMyReservations = query({
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
            .query("eventReservations")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .order("desc")
            .collect();
    },
});

// Seller-facing reservations for an event.
export const getReservationsByListing = query({
    args: {
        actorId: v.optional(v.id("users")),
        listingId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
        const listingNormId = ctx.db.normalizeId("listings", args.listingId);
        if (!listingNormId) return [];
        const listing = await ctx.db.get(listingNormId);
        if (!listing) return [];
        if (
            (listing as any).sellerId !== actor.idString &&
            actor.role !== "admin"
        ) {
            throw new Error("No autorizado.");
        }
        return await ctx.db
            .query("eventReservations")
            .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
            .collect();
    },
});

// ---------------------------------------------------------------------------
// internalAutoReleaseEvents — runs once daily.
// For every event whose eventDate is more than 24h in the past, finds the
// associated orders that are still in 'payment_received' / 'delivered'
// state and releases escrow. This is the auto-confirm equivalent of the
// buyer pressing "Confirm receipt" on a product order.
// ---------------------------------------------------------------------------
export const internalAutoReleaseEvents = internalMutation({
    args: {},
    handler: async (ctx) => {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const reservations = await ctx.db
            .query("eventReservations")
            .filter((q) =>
                q.or(
                    q.eq(q.field("status"), "confirmed"),
                    q.eq(q.field("status"), "checked_in"),
                ),
            )
            .collect();

        let released = 0;

        for (const res of reservations) {
            if (!res.eventDate) continue;
            const eventTs = new Date(res.eventDate).getTime();
            if (!Number.isFinite(eventTs)) continue;
            if (eventTs > cutoff) continue; // event hasn't passed yet
            if (!res.orderId) continue;

            const orderNormId = ctx.db.normalizeId("orders", res.orderId);
            if (!orderNormId) continue;
            const order = await ctx.db.get(orderNormId);
            if (!order) continue;

            if (
                order.status === "payment_received" ||
                order.status === "delivered"
            ) {
                await ctx.db.patch(orderNormId, {
                    status: "completed",
                    escrowState: "released",
                    updatedAt: new Date().toISOString(),
                });
                await ctx.runMutation(internal.stripe.internalReleasePayment, {
                    orderId: orderNormId,
                });
                released++;
            }
        }

        if (released > 0) {
            console.log(`[Events cron] Auto-released ${released} order(s)`);
        }
        return { released };
    },
});

// ---------------------------------------------------------------------------
// internalAutoReleaseServices — runs once daily.
// Services have no event date, so we use a 7-day delivery rule:
// any order with at least one service line item, in 'delivered' status,
// older than 7 days, gets auto-released.
// ---------------------------------------------------------------------------
export const internalAutoReleaseServices = internalMutation({
    args: {},
    handler: async (ctx) => {
        const cutoffMs = 7 * 24 * 60 * 60 * 1000;
        const cutoffISO = new Date(Date.now() - cutoffMs).toISOString();

        const orders = await ctx.db
            .query("orders")
            .withIndex("by_status", (q) => q.eq("status", "delivered"))
            .collect();

        let released = 0;
        for (const order of orders) {
            if (order.updatedAt > cutoffISO) continue;
            // Determine if any payment line is a service
            const payments = await ctx.db
                .query("payments")
                .withIndex("by_order", (q) => q.eq("orderId", String(order._id)))
                .collect();
            const hasService = payments.some(
                (p) => (p.metadata as any)?.type === "service",
            );
            if (!hasService) continue;

            await ctx.db.patch(order._id, {
                status: "completed",
                escrowState: "released",
                updatedAt: new Date().toISOString(),
            });
            await ctx.runMutation(internal.stripe.internalReleasePayment, {
                orderId: order._id,
            });
            released++;
        }
        if (released > 0) {
            console.log(`[Services cron] Auto-released ${released} order(s)`);
        }
        return { released };
    },
});
