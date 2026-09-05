// ---------------------------------------------------------------------------
// RESERVA DE STOCK — H3 (E-149, invariantes STK-01 / STK-03).
//
// EL BUG QUE CIERRA
//
// El chequeo de stock vivía en `createPaymentIntent` (una action, antes de
// cobrar) y el descuento en el webhook (una mutation, después de cobrar). Entre
// los dos no había nada: cinco compradores simultáneos sobre un producto con
// stock 1 leían 1 los cinco, pagaban los cinco, y cada webhook descontaba
// acotado en 0 y anotaba `stockShortfall`. Cinco órdenes pagadas por un solo
// artículo — verificado empíricamente (5 de 5) contra el deployment de audit,
// no inferido.
//
// EL ARREGLO
//
// Chequear y descontar en la MISMA transacción, y hacerlo ANTES del cobro.
// `internalReserveStock` es una mutation: Convex las serializa por OCC, así que
// de N reservas concurrentes sobre el mismo listing commitea una y las otras se
// reintentan contra el stock ya bajo. La que no alcanza vuelve con `ok: false`
// y el comprador NO llega a pagar.
//
// CICLO DE VIDA
//
//   held ──consume (webhook: pago acreditado)──> consumed
//    │
//    ├──release (Stripe rechazó el PI, `payment_intent.payment_failed`)──┐
//    └──release (cron: venció el TTL sin pago)───────────────────────────┴─> released
//
// `released` devuelve el stock. `consumed` no: ese stock ya es de una orden, y
// si esa orden se reembolsa lo repone `internalCompleteOrderRefund`.
//
// POR QUÉ UNA FILA POR CARRITO Y NO POR LÍNEA
//
// Un checkout es un solo cobro: reservar 2 de 3 líneas dejaría stock retenido
// de una compra que igual se va a rechazar. La reserva es todo-o-nada, y la
// unidad de idempotencia es `(cartId, userId)` — el mismo par que forma la
// idempotency key del PaymentIntent (`pi:{userId}:{cartId}`), así un reintento
// del mismo checkout reusa la reserva en lugar de descontar dos veces.
// ---------------------------------------------------------------------------
import { v } from "convex/values";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActor } from "./authHelpers";
import { planReservation, type ReservationLine } from "./_inventory";
import { stripeModeValidator } from "./schema";

/**
 * Cuánto vive una reserva sin pago. Tiene que cubrir un checkout lento (3DS,
 * cambio de tarjeta) sin retener inventario de carritos abandonados; el cron
 * corre cada 5 minutos, así que el techo real es TTL + 5 min.
 */
export const RESERVATION_TTL_MS = 30 * 60 * 1000;

/** Cuántas reservas vencidas barre el cron por corrida. */
const EXPIRY_SWEEP_LIMIT = 100;

type Reservation = Doc<"stockReservations">;

/** La reserva `held` (o `consumed`) vigente de un checkout, si existe. */
export async function loadReservationForCart(
    ctx: MutationCtx,
    args: { userId: string; cartId: string },
): Promise<Reservation | null> {
    const rows = await ctx.db
        .query("stockReservations")
        .withIndex("by_cart_and_user", (q) => q.eq("cartId", args.cartId).eq("userId", args.userId))
        .collect();
    return rows.find((r) => r.status === "held") ?? rows.find((r) => r.status === "consumed") ?? null;
}

/**
 * Marca la reserva como consumida. NO devuelve stock: lo tomó una orden.
 *
 * Idempotente: sobre una reserva que ya no está `held` no hace nada y devuelve
 * `false`, así el webhook puede llamarla sin chequear el estado.
 */
export async function consumeReservation(
    ctx: MutationCtx,
    reservation: Reservation,
    stripePaymentIntentId?: string,
): Promise<boolean> {
    if (reservation.status !== "held") return false;
    await ctx.db.patch(reservation._id, {
        status: "consumed",
        consumedAt: Date.now(),
        ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
    });
    return true;
}

/**
 * Devuelve el stock reservado y marca la reserva como liberada.
 *
 * Suma sobre el stock ACTUAL, no sobre el que había al reservar: lo que se
 * devuelve es lo que se tomó, sin pisar ventas ni reposiciones intermedias.
 * Idempotente por el mismo motivo que `consumeReservation`.
 */
export async function releaseReservation(
    ctx: MutationCtx,
    reservation: Reservation,
    reason: string,
): Promise<boolean> {
    if (reservation.status !== "held") return false;
    for (const line of reservation.lines) {
        const listingId = ctx.db.normalizeId("listings", line.listingId);
        if (!listingId) continue;
        const listing = await ctx.db.get(listingId);
        if (!listing || typeof listing.stock !== "number") continue;
        await ctx.db.patch(listingId, { stock: listing.stock + line.quantity });
    }
    await ctx.db.patch(reservation._id, {
        status: "released",
        releasedAt: Date.now(),
        releaseReason: reason,
    });
    return true;
}

/**
 * Reserva el stock del checkout: chequea y descuenta en una sola transacción.
 *
 * Devuelve `ok: false` con el detalle del faltante en vez de tirar, para que
 * `createPaymentIntent` arme el mismo mensaje de siempre (`outOfStockMessage`).
 * Cuando falla no escribe nada: el plan es todo-o-nada.
 */
export const internalReserveStock = internalMutation({
    args: {
        userId: v.string(),
        cartId: v.string(),
        mode: stripeModeValidator,
        lineItems: v.array(v.object({ listingId: v.string(), quantity: v.number() })),
        ttlMs: v.optional(v.number()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<
        | { ok: true; reservationId: Id<"stockReservations">; expiresAt: number; reused: boolean }
        | { ok: false; shortfalls: Array<{ listingId: string; title: string; requested: number; available: number }> }
    > => {
        const now = Date.now();
        const expiresAt = now + Math.max(60_000, args.ttlMs ?? RESERVATION_TTL_MS);

        // Reintento del mismo checkout: el stock ya está descontado para este
        // carrito. Extender el vencimiento es lo correcto — liberar y volver a
        // reservar abriría una ventana donde otro comprador se lo lleva.
        const existing = await loadReservationForCart(ctx, { userId: args.userId, cartId: args.cartId });
        if (existing) {
            if (existing.status === "held") await ctx.db.patch(existing._id, { expiresAt });
            return { ok: true, reservationId: existing._id, expiresAt, reused: true };
        }

        const lines: ReservationLine[] = [];
        for (const item of args.lineItems) {
            const listingId = ctx.db.normalizeId("listings", item.listingId);
            const listing = listingId ? await ctx.db.get(listingId) : null;
            if (!listing) {
                // Desapareció entre el armado del checkout y la reserva: se
                // rechaza como faltante en vez de dejarlo pasar sin reservar.
                lines.push({ listingId: item.listingId, title: "Producto", quantity: item.quantity, available: 0 });
                continue;
            }
            lines.push({
                listingId: item.listingId,
                title: listing.title || "Producto",
                quantity: item.quantity,
                // `undefined` = sin control de inventario (bonos, servicios).
                available: typeof listing.stock === "number" ? listing.stock : undefined,
            });
        }

        const plan = planReservation(lines);
        if (!plan.ok) return { ok: false, shortfalls: plan.shortfalls };

        const titleFor = new Map(lines.map((l) => [l.listingId, l.title]));
        for (const d of plan.decrements) {
            const listingId = ctx.db.normalizeId("listings", d.listingId);
            if (!listingId) continue;
            await ctx.db.patch(listingId, { stock: d.newStock });
        }

        const reservationId = await ctx.db.insert("stockReservations", {
            cartId: args.cartId,
            userId: args.userId,
            mode: args.mode,
            lines: plan.decrements.map((d) => ({
                listingId: d.listingId,
                title: titleFor.get(d.listingId) ?? "Producto",
                quantity: d.quantity,
            })),
            status: "held",
            expiresAt,
            createdAt: now,
        });
        return { ok: true, reservationId, expiresAt, reused: false };
    },
});

/**
 * El comprador abandonó el checkout: devuelve SU reserva, ya.
 *
 * POR QUÉ HACE FALTA UNA PÚBLICA
 *
 * `PaymentScreen` genera un `cartId` nuevo en cada montaje
 * (`PaymentScreen.tsx:58`), así que sin esto un comprador que entra al
 * checkout, se arrepiente y vuelve a entrar se choca con su PROPIA reserva:
 * "se quedó sin stock" sobre un producto de unidad única que nadie más tocó,
 * durante los 30 minutos del TTL. El cron sería el arreglo, pero media hora
 * después no sirve de nada.
 *
 * Sólo libera reservas `held` del propio actor y del `cartId` que le pasa: no
 * puede tocar la de otro comprador ni una ya consumida. Es best-effort (si la
 * app se cierra de golpe no llega), y por eso el TTL sigue siendo la red.
 */
export const releaseMyCheckoutReservation = mutation({
    args: { sessionToken: v.optional(v.string()), cartId: v.string() },
    handler: async (ctx, args): Promise<{ released: boolean }> => {
        const actor = await requireActor(ctx, args.sessionToken);
        const reservation = await loadReservationForCart(ctx, {
            userId: actor.idString,
            cartId: args.cartId,
        });
        if (!reservation || reservation.status !== "held") return { released: false };
        return { released: await releaseReservation(ctx, reservation, "checkout_abandoned") };
    },
});

/**
 * Compensación de `createPaymentIntent`: si Stripe rechaza la creación del PI
 * después de reservar, el stock vuelve en el acto y no espera al cron.
 */
export const internalReleaseReservationById = internalMutation({
    args: { reservationId: v.id("stockReservations"), reason: v.string() },
    handler: async (ctx, args): Promise<{ released: boolean }> => {
        const reservation = await ctx.db.get(args.reservationId);
        if (!reservation) return { released: false };
        return { released: await releaseReservation(ctx, reservation, args.reason) };
    },
});

/**
 * `payment_intent.payment_failed`: la tarjeta se rechazó, el stock vuelve.
 *
 * El evento sólo trae el PI, así que la reserva se ubica por el pago
 * (`payments.cartId` + `userId`), que es la misma clave con la que se creó.
 */
export const internalReleaseReservationForPayment = internalMutation({
    args: { stripePaymentIntentId: v.string(), reason: v.string() },
    handler: async (ctx, args): Promise<{ released: boolean }> => {
        const payment = await ctx.db
            .query("payments")
            .withIndex("by_stripe_intent", (q) => q.eq("stripePaymentIntentId", args.stripePaymentIntentId))
            .first();
        if (!payment?.cartId) return { released: false };
        const reservation = await loadReservationForCart(ctx, {
            userId: payment.userId,
            cartId: payment.cartId,
        });
        if (!reservation) return { released: false };
        if (!reservation.stripePaymentIntentId) {
            await ctx.db.patch(reservation._id, { stripePaymentIntentId: args.stripePaymentIntentId });
        }
        return { released: await releaseReservation(ctx, reservation, args.reason) };
    },
});

/**
 * Cron: devuelve el stock de las reservas que vencieron sin pago.
 *
 * Si el pago llega DESPUÉS de que el cron liberó, el webhook no encuentra
 * reserva y cae al camino de siempre (descontar acotado en 0 y anotar el
 * faltante en la orden). Es la política de `_inventory.ts`: después de cobrar
 * no se rechaza.
 */
export const internalReleaseExpiredReservations = internalMutation({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args): Promise<{ released: number }> => {
        const now = Date.now();
        const due = await ctx.db
            .query("stockReservations")
            .withIndex("by_status_and_expires", (q) => q.eq("status", "held").lte("expiresAt", now))
            .take(Math.max(1, Math.min(args.limit ?? EXPIRY_SWEEP_LIMIT, EXPIRY_SWEEP_LIMIT)));

        let released = 0;
        for (const reservation of due) {
            if (await releaseReservation(ctx, reservation, "expired")) released += 1;
        }
        if (released > 0) console.log(`[Stock] ${released} reserva(s) vencida(s) devueltas al inventario.`);
        return { released };
    },
});
