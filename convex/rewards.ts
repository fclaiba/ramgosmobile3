import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireActor } from "./authHelpers";

const SIGNUP_BONUS = 500;
const REFERRAL_BONUS = 1000;

export const awardSignupPoints = internalMutation({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const eventKey = `signup_${args.userId}`;
        
        // Evitar duplicados
        const existing = await ctx.db
            .query("pointsLedger")
            .withIndex("by_user_event", q => q.eq("userId", args.userId).eq("eventKey", eventKey))
            .first();
            
        if (existing) return { success: true, points: 0, message: "Ya otorgado" };

        await ctx.db.insert("pointsLedger", {
            userId: args.userId,
            eventKey,
            type: "earn",
            source: "bonus",
            amount: SIGNUP_BONUS,
            description: "Bono de bienvenida por registrarte en Ramgos",
            createdAt: new Date().toISOString(),
        });

        await updateEconomyState(ctx, args.userId, SIGNUP_BONUS);
        
        return { success: true, points: SIGNUP_BONUS };
    }
});

export const awardReferralPoints = internalMutation({
    args: { referrerId: v.id("users"), referredId: v.id("users") },
    handler: async (ctx, args) => {
        const eventKey = `referral_${args.referredId}`;
        
        const existing = await ctx.db
            .query("pointsLedger")
            .withIndex("by_user_event", q => q.eq("userId", args.referrerId).eq("eventKey", eventKey))
            .first();
            
        if (existing) return { success: true, points: 0, message: "Ya otorgado" };

        await ctx.db.insert("pointsLedger", {
            userId: args.referrerId,
            eventKey,
            type: "earn",
            source: "referral",
            amount: REFERRAL_BONUS,
            description: "Bono por invitar a un amigo a la plataforma",
            createdAt: new Date().toISOString(),
        });

        await updateEconomyState(ctx, args.referrerId, REFERRAL_BONUS);
        
        return { success: true, points: REFERRAL_BONUS };
    }
});

// Helper interno para sumarizar los puntos
async function updateEconomyState(ctx: any, userId: Id<"users">, newPoints: number) {
    const state = await ctx.db
        .query("economyState")
        .withIndex("by_user", (q: any) => q.eq("userId", userId))
        .first();

    if (state) {
        const currentPoints = state.pointsState?.balance || 0;
        await ctx.db.patch(state._id, {
            pointsState: { ...state.pointsState, balance: currentPoints + newPoints },
            updatedAt: new Date().toISOString()
        });
    } else {
        await ctx.db.insert("economyState", {
            userId,
            pointsState: { balance: newPoints },
            updatedAt: new Date().toISOString()
        });
    }
}

export const getMyPoints = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        const state = await ctx.db
            .query("economyState")
            .withIndex("by_user", q => q.eq("userId", actor.idString))
            .first();
            
        return {
            balance: state?.pointsState?.balance || 0,
        };
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
