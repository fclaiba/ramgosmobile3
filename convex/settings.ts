import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertAdminOrDeveloper, requireActor } from "./authHelpers";

export const getSetting = query({
    args: { key: v.string() },
    handler: async (ctx, args) => {
        const setting = await ctx.db
            .query("global_settings")
            .withIndex("by_key", (q) => q.eq("key", args.key))
            .first();
        return setting?.value ?? null;
    }
});

export const setSetting = mutation({
    args: { sessionToken: v.optional(v.string()), key: v.string(), value: v.any() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdminOrDeveloper(actor);
        
        const existing = await ctx.db
            .query("global_settings")
            .withIndex("by_key", (q) => q.eq("key", args.key))
            .first();
            
        if (existing) {
            await ctx.db.patch(existing._id, { value: args.value });
        } else {
            await ctx.db.insert("global_settings", { key: args.key, value: args.value });
        }
    }
});

