import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireActor } from "./authHelpers";
import {
    DEFAULT_CANCELLATION_HOURS,
    DEFAULT_TIMEZONE,
    isValidTimezone,
    parseHhMm,
} from "./_agenda";

export const getSettings = query({
    args: { businessId: v.string() },
    handler: async (ctx, args) => {
        const settings = await ctx.db
            .query("businessSettings")
            .withIndex("by_business", q => q.eq("businessId", args.businessId))
            .first();
            
        return settings;
    }
});

export const updateSettings = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        startHour: v.string(),
        endHour: v.string(),
        slotDurationMinutes: v.number(),
        workingDays: v.array(v.number()),
        /** H5: zona horaria IANA del negocio. Es la que manda para todos. */
        timezone: v.optional(v.string()),
        appointmentMode: v.optional(v.union(v.literal('paid'), v.literal('request'))),
        cancellationHours: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        const user = await ctx.db.get(actor.id);
        
        if (!user || user.role !== 'business') {
            throw new Error("No autorizado. Solo negocios pueden configurar la agenda.");
        }

        /**
         * H5: la config se valida al GUARDAR, no al usarla.
         *
         * Antes entraba cualquier cosa y el error aparecía después, del lado
         * del comprador, como "no hay turnos" sin explicación.
         */
        const start = parseHhMm(args.startHour);
        const end = parseHhMm(args.endHour);
        if (start === null || end === null) throw new Error("Los horarios deben tener el formato HH:mm.");
        if (end <= start) throw new Error("El horario de cierre tiene que ser posterior al de apertura.");
        if (!Number.isFinite(args.slotDurationMinutes) || args.slotDurationMinutes <= 0) {
            throw new Error("La duración del turno debe ser mayor a cero.");
        }
        if (args.slotDurationMinutes > end - start) {
            throw new Error("La duración del turno no entra en el horario de atención.");
        }
        if (args.workingDays.length === 0) throw new Error("Elegí al menos un día laborable.");
        if (args.workingDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
            throw new Error("Día laborable inválido.");
        }
        const timezone = args.timezone || DEFAULT_TIMEZONE;
        if (!isValidTimezone(timezone)) throw new Error(`Zona horaria desconocida: ${timezone}`);
        const cancellationHours = args.cancellationHours ?? DEFAULT_CANCELLATION_HOURS;
        if (!Number.isFinite(cancellationHours) || cancellationHours < 0 || cancellationHours > 720) {
            throw new Error("La ventana de cancelación debe estar entre 0 y 720 horas.");
        }

        const existing = await ctx.db
            .query("businessSettings")
            .withIndex("by_business", q => q.eq("businessId", actor.idString))
            .first();

        const now = new Date().toISOString();

        if (existing) {
            await ctx.db.patch(existing._id, {
                startHour: args.startHour,
                endHour: args.endHour,
                slotDurationMinutes: args.slotDurationMinutes,
                workingDays: args.workingDays,
                timezone,
                appointmentMode: args.appointmentMode ?? existing.appointmentMode ?? 'request',
                cancellationHours,
                updatedAt: now,
            });
            return { success: true };
        } else {
            await ctx.db.insert("businessSettings", {
                businessId: actor.idString,
                startHour: args.startHour,
                endHour: args.endHour,
                slotDurationMinutes: args.slotDurationMinutes,
                workingDays: args.workingDays,
                timezone,
                appointmentMode: args.appointmentMode ?? 'request',
                cancellationHours,
                updatedAt: now,
            });
            return { success: true };
        }
    }
});
