/**
 * Lectura del saldo de puntos y su historial.
 *
 * Este archivo tenía `awardSignupPoints` y `awardReferralPoints`, dos
 * `internalMutation` que escribían en `economyState.pointsState.balance`
 * mientras TODO el resto de la economía escribe y lee
 * `economyState.rewardsState.points`. Eran, además, código muerto: no tenían
 * un solo llamador. El alta real acredita por
 * `users.awardReferralOnSignup` → `economy.applyPointsEventInternal`, que sí
 * escribe el campo canónico.
 *
 * Se eliminaron para que no quede un segundo escritor divergente. El saldo
 * canónico es `rewardsState.points`; ver `convex/migrations/pointsUnification.ts`.
 */

import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireActor } from "./authHelpers";
import { readCanonicalPoints } from "./economy/pointsEngine";

export const getMyPoints = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        return await readCanonicalPoints(ctx, actor.idString);
    }
});

export const getMyPointsHistory = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        const history = await ctx.db
            .query("pointsLedger")
            .withIndex("by_user", q => q.eq("userId", actor.idString))
            .order("desc")
            .take(50);

        return history;
    }
});
