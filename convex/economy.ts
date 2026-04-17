import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertSelfOrAdmin, requireActor } from "./authHelpers";

const assertUserAccess = async (ctx: any, actorId: string | undefined, userId: string) => {
  const actor = await requireActor(ctx, actorId as any);
  assertSelfOrAdmin(actor, userId);
  return actor;
};

const upsertState = async (
  ctx: any,
  userId: string,
  patch: Record<string, unknown>,
) => {
  const existing = await ctx.db
    .query("economyState")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();

  const base = { ...patch, updatedAt: new Date().toISOString() };
  if (existing) {
    await ctx.db.patch(existing._id, base);
    return existing._id;
  }
  return await ctx.db.insert("economyState", {
    userId,
    ...base,
  });
};

export const getState = query({
  args: {
    actorId: v.optional(v.id("users")),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertUserAccess(ctx, args.actorId, args.userId);
    return await ctx.db
      .query("economyState")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const savePointsState = mutation({
  args: {
    actorId: v.optional(v.id("users")),
    userId: v.string(),
    pointsState: v.any(),
  },
  handler: async (ctx, args) => {
    await assertUserAccess(ctx, args.actorId, args.userId);
    return await upsertState(ctx, args.userId, { pointsState: args.pointsState });
  },
});

export const saveWalletState = mutation({
  args: {
    actorId: v.optional(v.id("users")),
    userId: v.string(),
    walletState: v.any(),
  },
  handler: async (ctx, args) => {
    await assertUserAccess(ctx, args.actorId, args.userId);
    return await upsertState(ctx, args.userId, { walletState: args.walletState });
  },
});

export const saveRewardsState = mutation({
  args: {
    actorId: v.optional(v.id("users")),
    userId: v.string(),
    rewardsState: v.any(),
  },
  handler: async (ctx, args) => {
    await assertUserAccess(ctx, args.actorId, args.userId);
    return await upsertState(ctx, args.userId, { rewardsState: args.rewardsState });
  },
});

export const applyPointsEvent = mutation({
  args: {
    actorId: v.optional(v.id("users")),
    userId: v.string(),
    eventKey: v.string(),
    type: v.union(v.literal("earn"), v.literal("redeem"), v.literal("convert"), v.literal("challenge")),
    source: v.union(v.literal("purchase"), v.literal("game"), v.literal("referral"), v.literal("bonus"), v.literal("manual")),
    amount: v.number(),
    description: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await assertUserAccess(ctx, args.actorId, args.userId);
    const existing = await ctx.db
      .query("pointsLedger")
      .withIndex("by_user_event", (q) => q.eq("userId", args.userId).eq("eventKey", args.eventKey))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("pointsLedger", {
      userId: args.userId,
      eventKey: args.eventKey,
      type: args.type,
      source: args.source,
      amount: args.amount,
      description: args.description,
      metadata: args.metadata,
      createdAt: new Date().toISOString(),
    });
  },
});

export const getPointsSummary = query({
  args: {
    actorId: v.optional(v.id("users")),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertUserAccess(ctx, args.actorId, args.userId);
    const events = await ctx.db
      .query("pointsLedger")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const balance = events.reduce((acc, event) => acc + event.amount, 0);
    return {
      balance,
      events: events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  },
});

export const applyWalletEvent = mutation({
  args: {
    actorId: v.optional(v.id("users")),
    userId: v.string(),
    eventKey: v.string(),
    type: v.union(v.literal("credit"), v.literal("debit"), v.literal("hold"), v.literal("release")),
    amount: v.number(),
    description: v.string(),
    orderId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await assertUserAccess(ctx, args.actorId, args.userId);
    const existing = await ctx.db
      .query("walletLedger")
      .withIndex("by_user_event", (q) => q.eq("userId", args.userId).eq("eventKey", args.eventKey))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("walletLedger", {
      userId: args.userId,
      eventKey: args.eventKey,
      type: args.type,
      amount: args.amount,
      currency: "USD",
      orderId: args.orderId,
      description: args.description,
      metadata: args.metadata,
      createdAt: new Date().toISOString(),
    });
  },
});

export const getWalletSummary = query({
  args: {
    actorId: v.optional(v.id("users")),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertUserAccess(ctx, args.actorId, args.userId);
    const events = await ctx.db
      .query("walletLedger")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const balance = events.reduce((acc, event) => {
      if (event.type === "debit" || event.type === "hold") return acc - event.amount;
      return acc + event.amount;
    }, 0);
    return {
      balance,
      events: events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  },
});

export const claimReward = mutation({
  args: {
    actorId: v.optional(v.id("users")),
    userId: v.string(),
    claimKey: v.string(),
    type: v.string(),
    pointsAwarded: v.number(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await assertUserAccess(ctx, args.actorId, args.userId);
    const existing = await ctx.db
      .query("rewardsClaims")
      .withIndex("by_user_claim", (q) => q.eq("userId", args.userId).eq("claimKey", args.claimKey))
      .first();
    if (existing) {
      return { alreadyClaimed: true, claimId: existing._id };
    }

    const claimId = await ctx.db.insert("rewardsClaims", {
      userId: args.userId,
      claimKey: args.claimKey,
      type: args.type,
      pointsAwarded: args.pointsAwarded,
      metadata: args.metadata,
      claimedAt: new Date().toISOString(),
    });
    return { alreadyClaimed: false, claimId };
  },
});
