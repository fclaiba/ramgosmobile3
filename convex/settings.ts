import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertAdminOrDeveloper, requireActor } from "./authHelpers";
import { can, denialMessage } from "./_roles";
import { buildAuditRecord } from "./_audit";

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
        // `setSetting` controla flags globales como `require_kyc` y `require_2fa`:
        // apagarlos desactiva controles de seguridad para toda la plataforma.
        // Reservado al titular; antes lo aceptaba `developer`.
        if (!can(actor.role, 'change_global_settings')) {
            throw new Error(denialMessage('change_global_settings'));
        }

        const existing = await ctx.db
            .query("global_settings")
            .withIndex("by_key", (q) => q.eq("key", args.key))
            .first();

        const before = existing?.value;

        if (existing) {
            await ctx.db.patch(existing._id, { value: args.value });
        } else {
            await ctx.db.insert("global_settings", { key: args.key, value: args.value });
        }

        await ctx.db.insert("audit_logs", buildAuditRecord({
            actorUserId: actor.idString,
            action: "GLOBAL_SETTING_CHANGED",
            before: { key: args.key, value: before },
            after: { key: args.key, value: args.value },
        }));
    }
});

