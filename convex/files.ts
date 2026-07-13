import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertSelfOrAdmin, requireActor } from "./authHelpers";

export const generateUploadUrl = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireActor(ctx, (args as any).sessionToken);
        return await ctx.storage.generateUploadUrl();
    },
});
