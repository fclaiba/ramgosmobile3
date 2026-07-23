import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireActor } from "./authHelpers";

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
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        const user = await ctx.db.get(actor.id);
        
        if (!user || user.role !== 'business') {
            throw new Error("No autorizado. Solo negocios pueden configurar la agenda.");
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
                updatedAt: now,
            });
            return { success: true };
        }
    }
});
