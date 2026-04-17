import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertSelfOrAdmin, requireActor } from "./authHelpers";

export const generateUploadUrl = mutation({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.userId);
        const targetUserId = String(args.userId ?? actor.id);
        assertSelfOrAdmin(actor, targetUserId);
        const normalizedTargetUserId = ctx.db.normalizeId("users", targetUserId);
        if (!normalizedTargetUserId) {
            throw new Error("No autorizado.");
        }
        const user = await ctx.db.get(normalizedTargetUserId);
        if (!user) throw new Error("No autorizado.");
        return await ctx.storage.generateUploadUrl();
    },
});
