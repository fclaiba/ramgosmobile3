import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getActorOrNull, requireActor } from "./authHelpers";
import { internal } from "./_generated/api";
import { releaseAppointment, type SlotReservationResult } from "./agenda";
import { Id } from "./_generated/dataModel";
import { canCreateBusinessForms, resolveKycStatus } from "./_kyc";
import { normalizePhone, PHONE_ERRORS, validatePhone } from "./_phone";

export const createForm = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        title: v.string(),
        description: v.optional(v.string()),
        type: v.union(v.literal('visit'), v.literal('call')),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        const user = await ctx.db.get(actor.id);
        
        if (!user || user.role !== 'business') {
            throw new Error("No autorizado. Solo negocios pueden crear formularios.");
        }
        // Estado efectivo, no el crudo: ver el comentario en `_kyc.ts`.
        const requireKyc = await ctx.db
            .query("global_settings")
            .withIndex("by_key", (q: any) => q.eq("key", "require_kyc"))
            .first();
        const kycStatus = resolveKycStatus(user.kycStatus, requireKyc?.value === true);
        if (!canCreateBusinessForms(kycStatus)) {
            throw new Error("El KYC del negocio no está aprobado. Completa la verificación para usar esta función.");
        }

        const formId = await ctx.db.insert("businessForms", {
            businessId: actor.idString,
            title: args.title,
            description: args.description,
            type: args.type,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        
        return { success: true, formId: String(formId) };
    }
});

export const listFormsByBusiness = query({
    args: {
        sessionToken: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor) return [];

        const forms = await ctx.db
            .query("businessForms")
            .withIndex("by_business", q => q.eq("businessId", actor.idString))
            .collect();
            
        return forms;
    }
});

export const getPublicForms = query({
    args: { businessId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("businessForms")
            .withIndex("by_business", q => q.eq("businessId", args.businessId))
            .filter(q => q.eq(q.field("isActive"), true))
            .collect();
    }
});

export const getForm = query({
    args: { formId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.formId) return null;
        return await ctx.db.get(args.formId as Id<"businessForms">);
    }
});

export const submitLead = mutation({
    args: {
        formId: v.optional(v.string()),
        businessId: v.optional(v.string()),
        name: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        message: v.optional(v.string()),
        sessionToken: v.optional(v.string()),
        scheduledDate: v.optional(v.string()),
        scheduledTime: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ success: boolean; submissionId: string; appointmentId?: string }> => {
        let bId = args.businessId;
        
        if (args.formId) {
            const form = await ctx.db.get(args.formId as Id<"businessForms">);
            if (!form) throw new Error("Formulario no encontrado.");
            if (!form.isActive) throw new Error("El formulario ya no está activo.");
            bId = form.businessId;
        }
        
        if (!bId) throw new Error("Se requiere businessId o formId.");

        // El teléfono del lead es el dato con el que el negocio devuelve el
        // contacto. Es opcional, pero si viene tiene que ser un número real:
        // antes entraba sin ninguna validación, ni acá ni en el formulario.
        let phone = args.phone?.trim() || undefined;
        if (phone) {
            const phoneError = validatePhone(phone);
            if (phoneError) throw new Error(PHONE_ERRORS[phoneError]);
            phone = normalizePhone(phone);
        }
        
        let submitterId: string | undefined = undefined;
        let finalName = args.name || "Usuario Anónimo";
        let finalEmail = args.email || "Sin email";

        if (args.sessionToken) {
            /**
             * H5: acá había un `try/catch` que se tragaba TODOS los errores
             * salvo uno, por su mensaje. Dos consecuencias reales: el guard de
             * "no te mandes una consulta a vos mismo" (abajo) quedaba anulado,
             * y una sesión inválida no fallaba — entraba como lead anónimo.
             * Ahora los errores propagan; el único caso tolerado es la sesión
             * ausente/vencida, que cae explícitamente al camino anónimo.
             */
            const actor = await getActorOrNull(ctx, args.sessionToken);
            if (actor) {
                submitterId = actor.idString;

                const userDoc = await ctx.db.get(actor.id);
                if (userDoc) {
                    finalName = userDoc.name || finalName;
                    finalEmail = userDoc.email || finalEmail;
                }

                if (submitterId === bId) {
                    throw new Error("No puedes enviarle una solicitud de consulta a tu propio negocio. Esta función es exclusiva para clientes terceros.");
                }

                // Por índice `by_user` (H5): antes se traía TODOS los leads del
                // negocio para filtrar uno en memoria.
                const existingLeads = await ctx.db
                    .query("businessFormLeads")
                    .withIndex("by_user", q => q.eq("userId", submitterId))
                    .collect();

                if (existingLeads.some(l => l.businessId === bId && l.status === 'new')) {
                    throw new Error("Ya tienes una consulta pendiente con este negocio. Espera a que te respondan antes de enviar otra.");
                }
            }
        }
        
        /**
         * H5: si la consulta elige horario, el horario se RESERVA de verdad.
         *
         * Antes `scheduledDate`/`scheduledTime` entraban como strings libres y
         * nadie chequeaba nada: dos personas elegían el mismo turno y las dos
         * quedaban agendadas. Ahora pasa por la misma mutation atómica que el
         * resto de la agenda, y el lead sólo guarda una copia para mostrar.
         *
         * Reservar exige sesión: un turno sin dueño no se puede cancelar ni
         * reprogramar después. Una consulta anónima sigue entrando, sin horario.
         */
        let appointmentId: string | undefined;
        if (args.scheduledDate && args.scheduledTime) {
            if (!submitterId) {
                throw new Error("Iniciá sesión para reservar un horario.");
            }
            const reserved: SlotReservationResult = await ctx.runMutation(internal.agenda.internalReserveAppointmentSlot, {
                businessId: bId,
                buyerUserId: submitterId,
                slotDate: args.scheduledDate,
                slotTime: args.scheduledTime,
                paymentMode: "request" as const,
                nowMs: Date.now(),
            });
            if (!reserved.ok) throw new Error(reserved.reason);
            appointmentId = String(reserved.appointmentId);
        }

        const submissionId = await ctx.db.insert("businessFormLeads", {
            formId: args.formId || "direct",
            businessId: bId,
            ...(submitterId ? { userId: submitterId } : {}),
            name: finalName,
            email: finalEmail,
            phone,
            message: args.message,
            scheduledDate: args.scheduledDate,
            scheduledTime: args.scheduledTime,
            ...(appointmentId ? { appointmentId } : {}),
            status: 'new',
            createdAt: new Date().toISOString(),
        });
        
        return { success: true, submissionId: String(submissionId), appointmentId };
    }
});

export const listLeads = query({
    args: {
        sessionToken: v.optional(v.string()),
        formId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor) return [];

        if (args.formId) {
            return await ctx.db
                .query("businessFormLeads")
                .withIndex("by_form", q => q.eq("formId", args.formId as string))
                .filter(q => q.eq(q.field("businessId"), actor.idString))
                .collect();
        }
        
        return await ctx.db
            .query("businessFormLeads")
            .withIndex("by_business", q => q.eq("businessId", actor.idString))
            .collect();
    }
});

export const getMyLeads = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor) return [];
        // Por índice `by_user` (H5): antes recorría la tabla entera.
        const leads = await ctx.db
            .query("businessFormLeads")
            .withIndex("by_user", q => q.eq("userId", actor.idString))
            .collect();
            
        const enrichedLeads = await Promise.all(leads.map(async (lead) => {
            const business = await ctx.db.get(lead.businessId as Id<"users">);
            return { ...lead, businessName: business?.name || 'Negocio' };
        }));
        
        return enrichedLeads;
    }
});

export const cancelLead = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        leadId: v.id("businessFormLeads"),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        const lead = await ctx.db.get(args.leadId);
        if (!lead || lead.userId !== actor.idString) throw new Error("No autorizado");
        
        // H5: si la consulta tenía horario reservado, el horario vuelve a la
        // grilla — si no, quedaba bloqueado para siempre.
        if (lead.appointmentId) {
            const appointmentId = ctx.db.normalizeId("appointments", lead.appointmentId);
            const appointment = appointmentId ? await ctx.db.get(appointmentId) : null;
            if (appointment) await releaseAppointment(ctx, appointment, "lead_cancelled");
        }

        await ctx.db.patch(args.leadId, { status: 'cancelled' });
        return { success: true };
    }
});

export const postponeLead = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        leadId: v.id("businessFormLeads"),
        scheduledDate: v.string(),
        scheduledTime: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        const lead = await ctx.db.get(args.leadId);
        if (!lead || lead.userId !== actor.idString) throw new Error("No autorizado");
        
        const count = lead.postponementsCount || 0;
        if (count >= 3) throw new Error("Has alcanzado el límite máximo de 3 postergaciones para esta cita.");

        /**
         * H5: reprogramar pasa por la misma reserva atómica que agendar. Antes
         * esto aceptaba cualquier fecha y hora — se podía mover un turno a las
         * 3 AM de un domingo, o encima de otro turno ya tomado.
         */
        if (lead.scheduledDate === args.scheduledDate && lead.scheduledTime === args.scheduledTime) {
            // Sin esto se chocaría con su propia reserva y el mensaje sería
            // "ese horario acaba de ser reservado", que no explica nada.
            throw new Error("Ese es el horario que ya tenías. Elegí otro para reprogramar.");
        }

        const previousId = lead.appointmentId ? ctx.db.normalizeId("appointments", lead.appointmentId) : null;
        const previous = previousId ? await ctx.db.get(previousId) : null;

        const reserved: SlotReservationResult = await ctx.runMutation(internal.agenda.internalReserveAppointmentSlot, {
            businessId: lead.businessId,
            buyerUserId: actor.idString,
            slotDate: args.scheduledDate,
            slotTime: args.scheduledTime,
            paymentMode: "request" as const,
            nowMs: Date.now(),
        });
        if (!reserved.ok) throw new Error(reserved.reason);

        // El horario nuevo ya está tomado: recién ahí se suelta el viejo.
        if (previous) await releaseAppointment(ctx, previous, "lead_postponed");

        await ctx.db.patch(args.leadId, {
            scheduledDate: args.scheduledDate,
            scheduledTime: args.scheduledTime,
            appointmentId: String(reserved.appointmentId),
            postponementsCount: count + 1,
        });
        return { success: true };
    }
});
