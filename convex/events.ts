/**
 * convex/events.ts — Event ticket lifecycle.
 *
 * H4 (E-149 AGD-06 / STK-04) — POR QUÉ SE REESCRIBIÓ
 *
 * Este módulo tenía tres funciones bien escritas y con CERO call sites:
 * `holdEventCapacity`/`releaseEventCapacity` (aforo vía `eventCapacity`, un
 * campo que ninguna pantalla llena — `CreateListingScreen` nunca lo escribe) y
 * `internalIssueEventReservationsForPayment`, diseñada para un checkout de UN
 * ítem por pago (`payment.metadata.listingId`) que dejó de existir con el
 * checkout multi-vendedor de `_split.ts`. El comentario de cabecera decía que
 * "CheckoutScreen llama a `holdEventCapacity`": nunca fue cierto.
 *
 * Lifecycle vigente:
 *   1. `createPaymentIntent` reserva stock ATÓMICAMENTE antes de cobrar
 *      (`internal.stock.internalReserveStock`, H3) — un evento con `stock: 1`
 *      no se sobrevende, igual que un producto. Es el mismo mecanismo, no uno
 *      paralelo: `eventCapacity`/`eventSoldCount` no tienen escritor en la app
 *      hoy, así que no son la fuente de verdad del aforo.
 *   2. El webhook crea la orden (`internalProcessPaidCheckout`) y, si hay
 *      líneas de tipo `event`, agenda `internalIssueEventReservationsForOrder`
 *      — mismo patrón que `bonos.internalIssueBonosForOrder` (línea 778 de
 *      `stripe.ts`): una fila `eventReservations` con QR **por unidad**
 *      comprada, para que cada asistente escanee la suya.
 *   3. En la entrada, el host escanea con `checkInReservation`.
 *   4. Un cron diario libera el escrow 24h después de `eventDate`
 *      (`internalAutoReleaseEvents`).
 *   5. Reembolso (`stripe.internalBeginOrderRefund`/`internalCompleteOrderRefund`):
 *      una entrada ya escaneada (`checked_in`) bloquea el refund sin `force`
 *      de admin — el asistente ya usó lo que pagó, mismo criterio que un bono
 *      `redeemed` (H2). Las que siguen `confirmed` se cancelan sin objeción.
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
// internalIssueEventReservationsForOrder — disparada desde el webhook cuando
// la orden tiene al menos una línea de tipo `event` (mismo trigger que los
// bonos, ver `stripe.ts` `internalProcessPaidCheckout`).
//
// Idempotente por `(orderId, listingId)`: un reintento del webhook no emite
// QR de más. Una fila por unidad — quantity=3 son 3 QR, no uno reusable.
// ---------------------------------------------------------------------------
export const internalIssueEventReservationsForOrder = internalMutation({
    args: { orderId: v.id("orders") },
    handler: async (ctx, args) => {
        const order = await ctx.db.get(args.orderId);
        if (!order) return;

        for (const item of order.items) {
            const listingNormId = ctx.db.normalizeId("listings", item.listingId);
            const listing = listingNormId ? await ctx.db.get(listingNormId) : null;
            if (!listing || (listing as any).type !== "event") continue;

            const existing = await ctx.db
                .query("eventReservations")
                .withIndex("by_order", (q) => q.eq("orderId", String(args.orderId)))
                .filter((q) => q.eq(q.field("listingId"), item.listingId))
                .collect();
            if (existing.length > 0) {
                console.log(`[Events] Ya emitidas ${existing.length} entrada(s) para orden ${args.orderId} / ${item.listingId}`);
                continue;
            }

            const sellerId = String((listing as any).sellerId || order.sellerId || "");
            if (!sellerId) continue;
            const eventDate = (listing as any).eventDate as string | undefined;
            const quantity = Math.max(1, Math.floor(item.quantity));

            for (let i = 0; i < quantity; i++) {
                const qrCode = generateQrCode();
                await ctx.db.insert("eventReservations", {
                    listingId: item.listingId,
                    userId: order.userId,
                    sellerId,
                    orderId: String(args.orderId),
                    quantity: 1,
                    qrCode,
                    status: "confirmed",
                    eventDate,
                    createdAt: new Date().toISOString(),
                });
            }

            await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                userId: order.userId,
                title: quantity > 1 ? "Tus entradas están listas" : "Tu entrada está lista",
                body: `${item.title || "Evento"}: ${quantity} entrada${quantity > 1 ? "s" : ""} confirmada${quantity > 1 ? "s" : ""}. Mostrá el QR en la puerta.`,
                category: "order" as const,
                data: { type: "event_reservation_issued", listingId: item.listingId, orderId: String(args.orderId) },
            });
        }
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
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        qrCode: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);

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
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
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
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        listingId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
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
//
// H4: una orden ahora tiene UNA fila `eventReservations` POR ENTRADA (antes
// era una por orden). Sin deduplicar por `orderId`, una compra de 3 entradas
// programaría `internalReleaseOrderEscrow` 3 veces para la misma orden.
// ---------------------------------------------------------------------------
export const internalAutoReleaseEvents = internalMutation({
    args: {},
    handler: async (ctx, args) => {
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

        const dueOrderIds = new Set<string>();
        for (const res of reservations) {
            if (!res.eventDate || !res.orderId) continue;
            const eventTs = new Date(res.eventDate).getTime();
            if (!Number.isFinite(eventTs) || eventTs > cutoff) continue; // event hasn't passed yet
            dueOrderIds.add(res.orderId);
        }

        let released = 0;
        for (const orderId of dueOrderIds) {
            const orderNormId = ctx.db.normalizeId("orders", orderId);
            if (!orderNormId) continue;
            const order = await ctx.db.get(orderNormId);
            if (!order) continue;

            if (
                order.escrowState === "held" &&
                !order.escrowReleaseError &&
                (order.status === "payment_received" ||
                    order.status === "paid_escrow" ||
                    order.status === "delivered")
            ) {
                // El transfer real y el cambio a `released` los hace stripe.ts.
                await ctx.scheduler.runAfter(0, internal.stripe.internalReleaseOrderEscrow, {
                    orderId: orderNormId,
                    trigger: "event_auto",
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
//
// H5 (E-149): antes esto liberaba 7 días después de que la orden pasara a
// `delivered` — y NADIE marca `delivered` un servicio, así que en la práctica
// no liberaba nunca y la plata del vendedor se quedaba en escrow para siempre.
//
// Con turnos hay una fecha real: el escrow se libera 24 h después de que el
// turno TERMINÓ, igual que los eventos. La regla vieja se conserva para los
// servicios vendidos sin turno (no todos los negocios usan agenda).
// ---------------------------------------------------------------------------
const SERVICE_GRACE_MS = 24 * 60 * 60 * 1000;

export const internalAutoReleaseServices = internalMutation({
    args: {},
    handler: async (ctx, args) => {
        const now = Date.now();
        const dueOrderIds = new Set<string>();

        // 1. Servicios con turno: el turno ya terminó hace más de 24 h.
        //    Se deduplica por orden — una orden puede tener más de un turno.
        for (const status of ["confirmed", "completed", "no_show"] as const) {
            const past = await ctx.db
                .query("appointments")
                .withIndex("by_status_and_ends", (q) =>
                    q.eq("status", status).lte("endsAtMs", now - SERVICE_GRACE_MS),
                )
                .take(200);
            for (const appointment of past) {
                if (appointment.orderId) dueOrderIds.add(appointment.orderId);
            }
        }

        let released = 0;
        for (const orderId of dueOrderIds) {
            const orderNormId = ctx.db.normalizeId("orders", orderId);
            if (!orderNormId) continue;
            const order = await ctx.db.get(orderNormId);
            if (!order) continue;
            if (order.escrowState !== "held" || order.escrowReleaseError) continue;
            if (order.status !== "paid_escrow" && order.status !== "payment_received" && order.status !== "delivered") {
                continue;
            }
            await ctx.scheduler.runAfter(0, internal.stripe.internalReleaseOrderEscrow, {
                orderId: orderNormId,
                trigger: "service_auto",
            });
            released++;
        }

        // 2. Camino histórico: servicios sin turno, 7 días desde `delivered`.
        const cutoffISO = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
        const orders = await ctx.db
            .query("orders")
            .withIndex("by_status", (q) => q.eq("status", "delivered"))
            .collect();
        for (const order of orders) {
            if (dueOrderIds.has(String(order._id))) continue;
            if (order.updatedAt > cutoffISO) continue;
            if (order.listingType !== "service") continue;
            if (order.escrowState !== "held" || order.escrowReleaseError) continue;

            await ctx.scheduler.runAfter(0, internal.stripe.internalReleaseOrderEscrow, {
                orderId: order._id,
                trigger: "service_auto",
            });
            released++;
        }

        if (released > 0) {
            console.log(`[Services cron] Auto-released ${released} order(s)`);
        }
        return { released };
    },
});
