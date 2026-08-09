"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { OAuth2Client } from "google-auth-library";

export const loginWithGoogle = action({
    args: {
        idToken: v.string(),
        role: v.optional(v.string()),
        mode: v.union(v.literal("login"), v.literal("register")),
        /** Profile fields for register mode (collected in SignUp form). */
        username: v.optional(v.string()),
        referredBy: v.optional(v.string()),
        businessCategory: v.optional(v.string()),
        nickname: v.optional(v.string()),
        phoneNumber: v.optional(v.string()),
        bio: v.optional(v.string()),
        businessAddress: v.optional(v.string()),
        instagramUrl: v.optional(v.string()),
        tiktokUrl: v.optional(v.string()),
        termsVersion: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<Record<string, unknown>> => {
        const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
        if (!clientId) {
            throw new Error("Google Sign-In no configurado en el servidor.");
        }

        const client = new OAuth2Client(clientId);
        const ticket = await client.verifyIdToken({
            idToken: args.idToken,
            audience: clientId,
        });
        const payload = ticket.getPayload();

        if (!payload?.email || !payload.sub) {
            throw new Error("Token de Google inválido.");
        }
        if (payload.email_verified !== true) {
            throw new Error("Email de Google no verificado.");
        }

        const name =
            payload.name?.trim() ||
            payload.email.split("@")[0] ||
            "Usuario Google";

        return await ctx.runMutation(internal.users.oauthLoginFromProvider, {
            provider: "google",
            email: payload.email,
            name,
            providerUserId: payload.sub,
            role: args.role,
            mode: args.mode,
            username: args.username,
            referredBy: args.referredBy,
            businessCategory: args.businessCategory,
            nickname: args.nickname,
            phoneNumber: args.phoneNumber,
            bio: args.bio,
            businessAddress: args.businessAddress,
            instagramUrl: args.instagramUrl,
            tiktokUrl: args.tiktokUrl,
            termsVersion: args.termsVersion,
        });
    },
});
