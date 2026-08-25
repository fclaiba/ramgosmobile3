import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getActorOrNull, requireActor } from "./authHelpers";
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
    handler: async (ctx, args) => {
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
            try {
                const actor = await requireActor(ctx, args.sessionToken);
                submitterId = actor.idString;
                
                const userDoc = await ctx.db.get(actor.id);
                if (userDoc) {
                    finalName = userDoc.name || finalName;
                    finalEmail = userDoc.email || finalEmail;
                }
                
                if (submitterId === bId) {
                    throw new Error("No puedes enviarle una solicitud de consulta a tu propio negocio. Esta función es exclusiva para clientes terceros.");
                }

                const existingLeads = await ctx.db
                    .query("businessFormLeads")
                    .withIndex("by_business", q => q.eq("businessId", bId as string))
                    .filter(q => q.eq(q.field("userId"), submitterId))
                    .collect();

                if (existingLeads.some(l => l.status === 'new')) {
                    throw new Error("Ya tienes una consulta pendiente con este negocio. Espera a que te respondan antes de enviar otra.");
                }
            } catch (e: any) {
                if (e.message.includes("Ya tienes una consulta")) throw e;
            }
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
            status: 'new',
            createdAt: new Date().toISOString(),
        });
        
        return { success: true, submissionId: String(submissionId) };
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
        const leads = await ctx.db
            .query("businessFormLeads")
            .filter(q => q.eq(q.field("userId"), actor.idString))
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
        
        await ctx.db.patch(args.leadId, {
            scheduledDate: args.scheduledDate,
            scheduledTime: args.scheduledTime,
            postponementsCount: count + 1,
        });
        return { success: true };
    }
});
