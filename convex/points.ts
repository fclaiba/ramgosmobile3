import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireActor } from "./authHelpers";

export const getPointsState = query({
    args: {
        sessionToken: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        const economyState = await ctx.db
            .query("economyState")
            .withIndex("by_user", (q) => q.eq("userId", actor.idString))
            .first();
        return economyState?.pointsState || null;
    },
});

export const syncPointsState = mutation({
    args: {
        pointsState: v.any(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx);
        const economyState = await ctx.db
            .query("economyState")
            .withIndex("by_user", (q) => q.eq("userId", actor.idString))
            .first();
            
        if (economyState) {
            await ctx.db.patch(economyState._id, {
                pointsState: args.pointsState,
                updatedAt: new Date().toISOString(),
            });
        } else {
            await ctx.db.insert("economyState", {
                userId: actor.idString,
                pointsState: args.pointsState,
                updatedAt: new Date().toISOString(),
            });
        }
        return true;
    },
});

export const addLedgerEntry = mutation({
    args: {
        points: v.number(),
        type: v.string(),
        description: v.string(),
        source: v.optional(v.string()),
        metadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx);
        const ledgerId = await ctx.db.insert("pointsLedger", {
            userId: actor.idString,
            eventKey: "entry_" + Date.now(),
            type: args.type as any,
            description: args.description,
            source: args.source as any,
            amount: args.points,
            metadata: args.metadata,
            createdAt: new Date().toISOString(),
        });
        return ledgerId;
    },
});

export const saveGameScore = mutation({
    args: {
        gameId: v.string(),
        score: v.number(),
        metadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx);
        // await ctx.db.insert("gameScores", {
        //     userId: actor.idString,
        //     gameId: args.gameId,
        //     score: args.score,
        //     metadata: args.metadata,
        //     playedAt: new Date().toISOString(),
        // });
        return true;
    },
});
