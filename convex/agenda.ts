// ---------------------------------------------------------------------------
// AGENDA DE TURNOS — H5 (E-149, invariantes AGD).
//
// EL BUG QUE CIERRA
//
// Los horarios disponibles se calculaban en el CLIENTE
// (`src/screens/FormFillScreen.tsx:92-105`) y el servidor guardaba lo que le
// mandaran: `businessForms.submitLead` aceptaba `scheduledDate`/`scheduledTime`
// como strings libres, sin mirar `businessSettings` y —sobre todo— sin chequear
// si el horario ya estaba tomado. Dos compradores elegían el mismo turno y los
// dos quedaban agendados; el negocio se enteraba cuando llegaban los dos.
//
// Es la misma causa raíz que STK-01 (cerrado en H3): el chequeo vivía donde no
// podía escribir. El arreglo es el mismo, y a propósito: chequear y escribir en
// UNA sola mutation, que Convex serializa por OCC. De N reservas simultáneas
// del mismo horario commitea una y las demás se reintentan contra el turno ya
// tomado.
//
// CICLO DE VIDA
//
//   held ──webhook: pago acreditado──> confirmed ──> completed | no_show
//    │                                     │
//    │                                     └──cancelar (fuera de la ventana)──┐
//    ├──salir del checkout / PI fallido ──────────────────────────────────────┤
//    └──cron: venció el hold ─────────────────────────────────────────────────┴─> cancelled
//
//   requested ──el negocio confirma──> confirmed   (modo solicitud, sin plata)
//
// Sólo `cancelled` libera el horario. Un `held` vencido tampoco lo bloquea
// aunque el cron no haya pasado todavía (ver `isBlocking`).
// ---------------------------------------------------------------------------
import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireActor } from "./authHelpers";
import {
    canCancelFreely,
    DEFAULT_CANCELLATION_HOURS,
    DEFAULT_TIMEZONE,
    findSlot,
    generateSlots,
    isConfigUsable,
    type BusinessAgendaConfig,
} from "./_agenda";

/**
 * Cuánto vive una reserva de turno sin pago. Igual que el TTL de stock (H3):
 * tiene que cubrir un checkout lento sin dejar el horario bloqueado por un
 * carrito abandonado.
 */
export const APPOINTMENT_HOLD_TTL_MS = 30 * 60 * 1000;

/** Cuántos holds vencidos barre el cron por corrida. */
const EXPIRY_SWEEP_LIMIT = 100;

type Appointment = Doc<"appointments">;

export const appointmentModeValidator = v.union(v.literal("paid"), v.literal("request"));

/**
 * La config del negocio con los defaults aplicados.
 *
 * `timezone`, `appointmentMode` y `cancellationHours` son opcionales en el
 * schema porque las filas que ya existían no los tienen: acá se resuelven una
 * sola vez para que nadie más tenga que acordarse del default.
 */
export function resolveAgendaConfig(settings: Doc<"businessSettings"> | null): {
    config: BusinessAgendaConfig;
    appointmentMode: "paid" | "request";
    cancellationHours: number;
} | null {
    if (!settings) return null;
    const config: BusinessAgendaConfig = {
        startHour: settings.startHour,
        endHour: settings.endHour,
        slotDurationMinutes: settings.slotDurationMinutes,
        workingDays: settings.workingDays ?? [],
        timezone: settings.timezone || DEFAULT_TIMEZONE,
    };
    return {
        config,
        appointmentMode: settings.appointmentMode ?? "request",
        cancellationHours: settings.cancellationHours ?? DEFAULT_CANCELLATION_HOURS,
    };
}

/**
 * ¿Este turno ocupa el horario?
 *
 * Todo menos `cancelled` ocupa. Un `held` vencido NO: si no, entre dos pasadas
 * del cron habría hasta cinco minutos en los que un carrito abandonado sigue
 * bloqueando un horario que ya nadie va a pagar.
 */
function isBlocking(appointment: Appointment, nowMs: number): boolean {
    if (appointment.status === "cancelled") return false;
    if (appointment.status === "held" && (appointment.holdExpiresAt ?? 0) <= nowMs) return false;
    return true;
}

/** Los turnos del negocio que caen dentro de un rango de instantes. */
async function appointmentsInRange(
    ctx: QueryCtx | MutationCtx,
    businessId: string,
    fromMs: number,
    toMs: number,
): Promise<Appointment[]> {
    return await ctx.db
        .query("appointments")
        .withIndex("by_business_and_start", (q) =>
            q.eq("businessId", businessId).gte("startsAtMs", fromMs).lte("startsAtMs", toMs),
        )
        .collect();
}

/**
 * Los horarios libres de un día. ÚNICA autoridad sobre qué se puede reservar.
 *
 * Es pública porque el comprador la necesita antes de elegir, y sólo expone
 * cuándo atiende el negocio — nada de quién reservó qué.
 */
export const getAvailableSlots = query({
    args: { businessId: v.string(), date: v.string(), nowMs: v.optional(v.number()) },
    handler: async (
        ctx,
        args,
    ): Promise<{
        timezone: string;
        appointmentMode: "paid" | "request";
        cancellationHours: number;
        slots: Array<{ slotTime: string; startsAtMs: number; endsAtMs: number }>;
    }> => {
        const settings = await ctx.db
            .query("businessSettings")
            .withIndex("by_business", (q) => q.eq("businessId", args.businessId))
            .first();
        const resolved = resolveAgendaConfig(settings);
        if (!resolved || !isConfigUsable(resolved.config)) {
            return {
                timezone: resolved?.config.timezone ?? DEFAULT_TIMEZONE,
                appointmentMode: resolved?.appointmentMode ?? "request",
                cancellationHours: resolved?.cancellationHours ?? DEFAULT_CANCELLATION_HOURS,
                slots: [],
            };
        }

        // El "ahora" entra por argumento: una query no debe leer el reloj
        // (guideline de Convex — el resultado quedaría cacheado y stale).
        // `nowMs` en 0 (sin dato) es deliberadamente conservador: ningún hold
        // se considera vencido, así que ninguno deja de bloquear.
        const nowMs = args.nowMs ?? 0;
        const head = {
            timezone: resolved.config.timezone,
            appointmentMode: resolved.appointmentMode,
            cancellationHours: resolved.cancellationHours,
        };

        const grid = generateSlots(resolved.config, args.date, nowMs || undefined);
        if (grid.length === 0) return { ...head, slots: [] };

        const taken = new Set(
            (await appointmentsInRange(ctx, args.businessId, grid[0].startsAtMs, grid[grid.length - 1].startsAtMs))
                .filter((a) => isBlocking(a, nowMs))
                .map((a) => a.startsAtMs),
        );

        return { ...head, slots: grid.filter((s) => !taken.has(s.startsAtMs)) };
    },
});

/** El turno reservado por un checkout, si existe. */
export async function loadAppointmentForCart(
    ctx: MutationCtx,
    args: { buyerUserId: string; cartId: string },
): Promise<Appointment | null> {
    const rows = await ctx.db
        .query("appointments")
        .withIndex("by_cart_and_buyer", (q) => q.eq("cartId", args.cartId).eq("buyerUserId", args.buyerUserId))
        .collect();
    return rows.find((r) => r.status === "held") ?? rows.find((r) => r.status === "confirmed") ?? null;
}

/**
 * Libera el horario. Idempotente: sobre un turno que ya no está vivo no hace
 * nada y devuelve `false`.
 */
export async function releaseAppointment(
    ctx: MutationCtx,
    appointment: Appointment,
    reason: string,
): Promise<boolean> {
    if (appointment.status === "cancelled") return false;
    await ctx.db.patch(appointment._id, {
        status: "cancelled",
        cancelReason: reason,
        updatedAt: Date.now(),
    });
    return true;
}

/** El pago entró: el turno queda firme y atado a la orden. */
export async function confirmAppointmentForOrder(
    ctx: MutationCtx,
    appointment: Appointment,
    orderId: string,
): Promise<boolean> {
    if (appointment.status !== "held") return false;
    await ctx.db.patch(appointment._id, {
        status: "confirmed",
        orderId,
        holdExpiresAt: undefined,
        updatedAt: Date.now(),
    });
    return true;
}

/**
 * Reserva el horario: chequea y escribe en la MISMA transacción.
 *
 * Devuelve `ok: false` con el motivo en vez de tirar, para que el checkout arme
 * el mensaje. Cuando falla no escribe nada.
 */
export type SlotReservationResult =
    | { ok: true; appointmentId: Id<"appointments">; startsAtMs: number; endsAtMs: number; reused: boolean }
    | { ok: false; reason: string };

export const internalReserveAppointmentSlot = internalMutation({
    args: {
        businessId: v.string(),
        buyerUserId: v.string(),
        listingId: v.optional(v.string()),
        cartId: v.optional(v.string()),
        slotDate: v.string(),
        slotTime: v.string(),
        paymentMode: appointmentModeValidator,
        nowMs: v.number(),
        ttlMs: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<SlotReservationResult> => {
        // Reintento del mismo checkout: el horario ya está tomado POR ESTE
        // comprador. Se extiende el vencimiento en vez de liberar y volver a
        // reservar, que abriría una ventana para que otro se lo lleve.
        if (args.cartId) {
            const existing = await loadAppointmentForCart(ctx, {
                buyerUserId: args.buyerUserId,
                cartId: args.cartId,
            });
            if (existing) {
                if (existing.status === "held") {
                    await ctx.db.patch(existing._id, {
                        holdExpiresAt: args.nowMs + Math.max(60_000, args.ttlMs ?? APPOINTMENT_HOLD_TTL_MS),
                        updatedAt: args.nowMs,
                    });
                }
                return {
                    ok: true,
                    appointmentId: existing._id,
                    startsAtMs: existing.startsAtMs,
                    endsAtMs: existing.endsAtMs,
                    reused: true,
                };
            }
        }

        const settings = await ctx.db
            .query("businessSettings")
            .withIndex("by_business", (q) => q.eq("businessId", args.businessId))
            .first();
        const resolved = resolveAgendaConfig(settings);
        if (!resolved || !isConfigUsable(resolved.config)) {
            return { ok: false, reason: "Este negocio todavía no configuró su agenda." };
        }

        // La grilla del servidor es la única válida: esto rechaza a la vez el
        // día no laboral, la hora fuera de horario, la que no cae en la grilla,
        // la que no existe por el cambio de hora, y la que ya pasó.
        const slot = findSlot(resolved.config, args.slotDate, args.slotTime, args.nowMs);
        if (!slot) {
            return { ok: false, reason: "Ese horario no está disponible." };
        }

        const sameStart = (await appointmentsInRange(ctx, args.businessId, slot.startsAtMs, slot.startsAtMs)).filter(
            (a) => isBlocking(a, args.nowMs),
        );
        if (sameStart.length > 0) {
            return { ok: false, reason: "Ese horario acaba de ser reservado. Elegí otro." };
        }

        const isPaid = args.paymentMode === "paid";
        const appointmentId = await ctx.db.insert("appointments", {
            businessId: args.businessId,
            buyerUserId: args.buyerUserId,
            listingId: args.listingId,
            cartId: args.cartId,
            startsAtMs: slot.startsAtMs,
            endsAtMs: slot.endsAtMs,
            slotDate: args.slotDate,
            slotTime: slot.slotTime,
            timezone: resolved.config.timezone,
            status: isPaid ? "held" : "requested",
            paymentMode: args.paymentMode,
            ...(isPaid
                ? { holdExpiresAt: args.nowMs + Math.max(60_000, args.ttlMs ?? APPOINTMENT_HOLD_TTL_MS) }
                : {}),
            postponementsCount: 0,
            createdAt: args.nowMs,
            updatedAt: args.nowMs,
        });
        return { ok: true, appointmentId, startsAtMs: slot.startsAtMs, endsAtMs: slot.endsAtMs, reused: false };
    },
});

/**
 * Compensación de `createPaymentIntent`: si Stripe rechaza la creación del PI
 * después de reservar, el horario vuelve en el acto y no espera al cron.
 */
export const internalReleaseAppointmentById = internalMutation({
    args: { appointmentId: v.id("appointments"), reason: v.string() },
    handler: async (ctx, args): Promise<{ released: boolean }> => {
        const appointment = await ctx.db.get(args.appointmentId);
        if (!appointment) return { released: false };
        return { released: await releaseAppointment(ctx, appointment, args.reason) };
    },
});

/**
 * El comprador abandonó el checkout: devuelve SU horario, ya.
 *
 * Mismo motivo que `stock.releaseMyCheckoutReservation` (H3): `PaymentScreen`
 * genera un `cartId` nuevo en cada montaje, así que sin esto el comprador que
 * se arrepiente y vuelve a entrar se choca con su propia reserva.
 */
export const releaseMyAppointmentHold = mutation({
    args: { sessionToken: v.optional(v.string()), cartId: v.string() },
    handler: async (ctx, args): Promise<{ released: boolean }> => {
        const actor = await requireActor(ctx, args.sessionToken);
        const appointment = await loadAppointmentForCart(ctx, {
            buyerUserId: actor.idString,
            cartId: args.cartId,
        });
        if (!appointment || appointment.status !== "held") return { released: false };
        return { released: await releaseAppointment(ctx, appointment, "checkout_abandoned") };
    },
});

/** Cron: libera los horarios de checkouts que nunca se pagaron. */
export const internalReleaseExpiredHolds = internalMutation({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args): Promise<{ released: number }> => {
        const now = Date.now();
        const due = await ctx.db
            .query("appointments")
            .withIndex("by_status_and_hold_expires", (q) => q.eq("status", "held").lte("holdExpiresAt", now))
            .take(Math.max(1, Math.min(args.limit ?? EXPIRY_SWEEP_LIMIT, EXPIRY_SWEEP_LIMIT)));

        let released = 0;
        for (const appointment of due) {
            if (await releaseAppointment(ctx, appointment, "hold_expired")) released += 1;
        }
        if (released > 0) console.log(`[Agenda] ${released} turno(s) sin pagar devueltos a la grilla.`);
        return { released };
    },
});

// ===========================================================================
// SUPERFICIE PÚBLICA — comprador y negocio
// ===========================================================================

/** El negocio dueño del turno (o un admin). */
function assertBusinessOwns(
    appointment: Appointment,
    actor: { idString: string; role?: string },
): void {
    const isOwner = appointment.businessId === actor.idString;
    const isAdmin = actor.role === "admin" || actor.role === "developer";
    if (!isOwner && !isAdmin) throw new Error("No autorizado: este turno es de otro negocio.");
}

/**
 * Modo `request`: el comprador pide un horario y el negocio confirma. Sin plata
 * de por medio, pero con la MISMA reserva atómica que el modo pago — el horario
 * queda tomado en el momento, no cuando el negocio se acuerde de mirar.
 */
export const requestAppointment = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        businessId: v.string(),
        listingId: v.optional(v.string()),
        slotDate: v.string(),
        slotTime: v.string(),
    },
    handler: async (ctx, args): Promise<{ appointmentId: Id<"appointments"> }> => {
        const actor = await requireActor(ctx, args.sessionToken);
        if (actor.idString === args.businessId) {
            throw new Error("No podés agendarte un turno con tu propio negocio.");
        }

        const settings = await ctx.db
            .query("businessSettings")
            .withIndex("by_business", (q) => q.eq("businessId", args.businessId))
            .first();
        const resolved = resolveAgendaConfig(settings);
        if (!resolved) throw new Error("Este negocio todavía no configuró su agenda.");
        if (resolved.appointmentMode === "paid") {
            throw new Error("Los turnos de este negocio se reservan pagando desde el listing.");
        }

        const reserved: SlotReservationResult = await ctx.runMutation(internal.agenda.internalReserveAppointmentSlot, {
            businessId: args.businessId,
            buyerUserId: actor.idString,
            listingId: args.listingId,
            slotDate: args.slotDate,
            slotTime: args.slotTime,
            paymentMode: "request" as const,
            nowMs: Date.now(),
        });
        if (!reserved.ok) throw new Error(reserved.reason);

        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            userId: args.businessId,
            title: "Nueva solicitud de turno",
            body: `Te pidieron un turno para el ${args.slotDate} a las ${args.slotTime}.`,
            category: "order" as const,
            data: { type: "appointment_requested", appointmentId: String(reserved.appointmentId) },
        });
        return { appointmentId: reserved.appointmentId };
    },
});

/** El negocio acepta la solicitud. */
export const confirmAppointment = mutation({
    args: { sessionToken: v.optional(v.string()), appointmentId: v.id("appointments") },
    handler: async (ctx, args): Promise<{ success: boolean }> => {
        const actor = await requireActor(ctx, args.sessionToken);
        const appointment = await ctx.db.get(args.appointmentId);
        if (!appointment) throw new Error("Turno no encontrado.");
        assertBusinessOwns(appointment, actor);
        if (appointment.status !== "requested") {
            throw new Error(`El turno no está pendiente de confirmación (${appointment.status}).`);
        }
        await ctx.db.patch(args.appointmentId, { status: "confirmed", updatedAt: Date.now() });
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            userId: appointment.buyerUserId,
            title: "Turno confirmado",
            body: `Tu turno del ${appointment.slotDate} a las ${appointment.slotTime} quedó confirmado.`,
            category: "order" as const,
            data: { type: "appointment_confirmed", appointmentId: String(args.appointmentId) },
        });
        return { success: true };
    },
});

/**
 * El negocio cierra el turno: ocurrió (`completed`) o el comprador no apareció
 * (`no_show`). Los dos son terminales y los dos habilitan la liberación del
 * escrow — en un `no_show` el negocio reservó el horario igual.
 */
export const closeAppointment = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        appointmentId: v.id("appointments"),
        outcome: v.union(v.literal("completed"), v.literal("no_show")),
    },
    handler: async (ctx, args): Promise<{ success: boolean }> => {
        const actor = await requireActor(ctx, args.sessionToken);
        const appointment = await ctx.db.get(args.appointmentId);
        if (!appointment) throw new Error("Turno no encontrado.");
        assertBusinessOwns(appointment, actor);
        if (appointment.status !== "confirmed") {
            throw new Error(`Sólo se cierra un turno confirmado (está en ${appointment.status}).`);
        }
        await ctx.db.patch(args.appointmentId, { status: args.outcome, updatedAt: Date.now() });
        return { success: true };
    },
});

/**
 * El negocio rechaza una solicitud, o cancela un turno confirmado.
 *
 * Si el turno estaba pagado, el rechazo dispara el reembolso: el comprador no
 * puede quedarse sin turno Y sin la plata. Va con `force` porque la decisión es
 * del negocio, no del comprador — si no, la propia guarda de las 24 h le
 * impediría cancelar un turno de mañana.
 */
export const rejectAppointment = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        appointmentId: v.id("appointments"),
        reason: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ success: boolean; refundScheduled: boolean }> => {
        const actor = await requireActor(ctx, args.sessionToken);
        const appointment = await ctx.db.get(args.appointmentId);
        if (!appointment) throw new Error("Turno no encontrado.");
        assertBusinessOwns(appointment, actor);
        if (appointment.status !== "requested" && appointment.status !== "confirmed") {
            throw new Error(`El turno ya no se puede rechazar (${appointment.status}).`);
        }

        const orderNormId = appointment.orderId ? ctx.db.normalizeId("orders", appointment.orderId) : null;
        await releaseAppointment(ctx, appointment, args.reason ?? "rejected_by_business");
        if (orderNormId) {
            await ctx.scheduler.runAfter(0, internal.stripe.internalRefundOrder, {
                orderId: orderNormId,
                reason: args.reason ?? "El negocio canceló el turno",
                source: "cancel" as const,
                actorUserId: actor.idString,
                force: true,
            });
        }
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            userId: appointment.buyerUserId,
            title: "Turno cancelado por el negocio",
            body: `Tu turno del ${appointment.slotDate} a las ${appointment.slotTime} fue cancelado.${orderNormId ? " Te devolvemos la plata." : ""}`,
            category: "order" as const,
            data: { type: "appointment_rejected", appointmentId: String(args.appointmentId) },
        });
        return { success: true, refundScheduled: !!orderNormId };
    },
});

/**
 * El comprador cancela su turno.
 *
 * Fuera de la ventana (24 h por defecto) se cancela y se reembolsa. Dentro, no:
 * a esa altura el negocio ya no llena el hueco. No es un "no se puede" absoluto
 * — un admin puede forzarlo con `adminRefundEscrow` —, es que no lo decide el
 * comprador solo.
 */
export const cancelMyAppointment = mutation({
    args: { sessionToken: v.optional(v.string()), appointmentId: v.id("appointments") },
    handler: async (ctx, args): Promise<{ success: boolean; refundScheduled: boolean }> => {
        const actor = await requireActor(ctx, args.sessionToken);
        const appointment = await ctx.db.get(args.appointmentId);
        if (!appointment) throw new Error("Turno no encontrado.");
        if (appointment.buyerUserId !== actor.idString) throw new Error("No autorizado.");
        if (!["held", "requested", "confirmed"].includes(appointment.status)) {
            throw new Error(`Este turno ya no se puede cancelar (${appointment.status}).`);
        }

        const settings = await ctx.db
            .query("businessSettings")
            .withIndex("by_business", (q) => q.eq("businessId", appointment.businessId))
            .first();
        const cancellationHours = resolveAgendaConfig(settings)?.cancellationHours ?? DEFAULT_CANCELLATION_HOURS;

        // Una solicitud sin plata se cancela siempre: no hay nada que devolver
        // y el negocio todavía no bloqueó nada a cambio.
        if (appointment.paymentMode === "request") {
            await releaseAppointment(ctx, appointment, "cancelled_by_buyer");
            return { success: true, refundScheduled: false };
        }

        if (!canCancelFreely(appointment.startsAtMs, Date.now(), cancellationHours)) {
            throw new Error(
                `Faltan menos de ${cancellationHours} h para el turno: ya no se puede cancelar por acá. ` +
                    "Escribile al negocio para reprogramarlo.",
            );
        }

        const orderNormId = appointment.orderId ? ctx.db.normalizeId("orders", appointment.orderId) : null;
        if (orderNormId) {
            // El reembolso cancela el turno como parte de su propia
            // transacción (`internalBeginOrderRefund`), así que acá no se toca.
            await ctx.scheduler.runAfter(0, internal.stripe.internalRefundOrder, {
                orderId: orderNormId,
                reason: "buyer_cancelled_appointment",
                source: "cancel" as const,
                actorUserId: actor.idString,
            });
            return { success: true, refundScheduled: true };
        }

        // Todavía en `held`: nunca llegó a haber orden.
        await releaseAppointment(ctx, appointment, "cancelled_by_buyer");
        return { success: true, refundScheduled: false };
    },
});

/** Mis turnos (comprador). */
export const getMyAppointments = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        const rows = await ctx.db
            .query("appointments")
            .withIndex("by_buyer", (q) => q.eq("buyerUserId", actor.idString))
            .order("desc")
            .take(100);
        return await Promise.all(
            rows
                // Un `held` es un checkout a medio hacer: no es un turno todavía.
                .filter((a) => a.status !== "held")
                .map(async (a) => {
                    const business = await ctx.db.get(a.businessId as Id<"users">);
                    return { ...a, businessName: business?.name ?? "Negocio" };
                }),
        );
    },
});

/** La agenda del negocio, para el panel. */
export const getBusinessAppointments = query({
    args: {
        sessionToken: v.optional(v.string()),
        fromMs: v.number(),
        toMs: v.number(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        const rows = await ctx.db
            .query("appointments")
            .withIndex("by_business_and_start", (q) =>
                q.eq("businessId", actor.idString).gte("startsAtMs", args.fromMs).lte("startsAtMs", args.toMs),
            )
            .collect();
        return await Promise.all(
            rows
                .filter((a) => a.status !== "held")
                .map(async (a) => {
                    const buyer = await ctx.db.get(a.buyerUserId as Id<"users">);
                    return { ...a, buyerName: buyer?.name ?? "Cliente", buyerPhone: buyer?.phoneNumber ?? null };
                }),
        );
    },
});
