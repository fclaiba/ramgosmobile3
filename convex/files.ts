import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertSelfOrAdmin, requireActor } from "./authHelpers";

export const generateUploadUrl = mutation({
    args: {
        actorId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireActor(ctx, args.actorId);
        return await ctx.storage.generateUploadUrl();
    },
});
