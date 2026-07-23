import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireActor } from "./authHelpers";
import { Id } from "./_generated/dataModel";

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
        if (user.kycStatus !== 'approved') {
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
        const actor = await requireActor(ctx, args.sessionToken);
        
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
        name: v.string(),
        email: v.string(),
        phone: v.string(),
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
        
        let submitterId = undefined;
        if (args.sessionToken) {
            try {
                const actor = await requireActor(ctx, args.sessionToken);
                submitterId = actor.idString;
            } catch (e) {
            }
        }
        
        const submissionId = await ctx.db.insert("businessFormLeads", {
            formId: args.formId,
            businessId: bId,
            userId: submitterId,
            name: args.name,
            email: args.email,
            phone: args.phone,
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
        const actor = await requireActor(ctx, args.sessionToken);
        
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
