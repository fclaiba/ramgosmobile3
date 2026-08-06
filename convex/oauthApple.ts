"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { createRemoteJWKSet, jwtVerify } from "jose";

const APPLE_JWKS = createRemoteJWKSet(
    new URL("https://appleid.apple.com/auth/keys"),
);

function appleAudiences(): string[] {
    const ids = [
        process.env.APPLE_BUNDLE_ID,
        process.env.APPLE_SERVICES_ID,
        process.env.APPLE_CLIENT_ID,
    ].filter((id): id is string => !!id?.trim());

    // Default native App ID if env not set yet (dev).
    if (ids.length === 0) {
        return ["com.fclaiba.ramgosmobile"];
    }
    return [...new Set(ids.map((id) => id.trim()))];
}

export const loginWithApple = action({
    args: {
        identityToken: v.string(),
        /** Email from native credential (only on first Apple authorization). */
        email: v.optional(v.string()),
        /** Display name from native credential (only on first authorization). */
        name: v.optional(v.string()),
        role: v.optional(v.string()),
        mode: v.union(v.literal("login"), v.literal("register")),
        username: v.optional(v.string()),
        referredBy: v.optional(v.string()),
        businessCategory: v.optional(v.string()),
        nickname: v.optional(v.string()),
        phoneNumber: v.optional(v.string()),
        bio: v.optional(v.string()),
        instagramUrl: v.optional(v.string()),
        tiktokUrl: v.optional(v.string()),
        termsVersion: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<Record<string, unknown>> => {
        const audiences = appleAudiences();

        let payload: Record<string, unknown>;
        try {
            const verified = await jwtVerify(args.identityToken, APPLE_JWKS, {
                issuer: "https://appleid.apple.com",
                audience: audiences,
            });
            payload = verified.payload as Record<string, unknown>;
        } catch {
            throw new Error(
                "Token de Apple inválido. Revisá APPLE_BUNDLE_ID / APPLE_SERVICES_ID en Convex.",
            );
        }

        const sub = typeof payload.sub === "string" ? payload.sub : null;
        if (!sub) {
            throw new Error("Token de Apple inválido (sin sub).");
        }

        const emailFromToken =
            typeof payload.email === "string" ? payload.email : undefined;
        const email = (emailFromToken || args.email || "").trim().toLowerCase();

        const name =
            args.name?.trim() ||
            (email ? email.split("@")[0] : "") ||
            "Usuario Apple";

        return await ctx.runMutation(internal.users.oauthLoginFromProvider, {
            provider: "apple",
            email: email || undefined,
            name,
            providerUserId: sub,
            role: args.role,
            mode: args.mode,
            username: args.username,
            referredBy: args.referredBy,
            businessCategory: args.businessCategory,
            nickname: args.nickname,
            phoneNumber: args.phoneNumber,
            bio: args.bio,
            instagramUrl: args.instagramUrl,
            tiktokUrl: args.tiktokUrl,
            termsVersion: args.termsVersion,
        });
    },
});
