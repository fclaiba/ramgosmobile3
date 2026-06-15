import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { assertSelfOrAdmin, requireActor } from "./authHelpers";

const assertUserAccess = async (ctx: any, userId: string) => {
  const actor = await requireActor(ctx, userId);
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
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let actor;
    try {
      actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
    } catch {
      return null;
    }
    const targetUserId = args.userId ?? actor.idString;
    assertSelfOrAdmin(actor, targetUserId);

    return await ctx.db
      .query("economyState")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
      .first();
  },
});

export const savePointsState = mutation({
  args: {
    userId: v.optional(v.string()),
    pointsState: v.any(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
    const targetUserId = args.userId ?? actor.idString;
    assertSelfOrAdmin(actor, targetUserId);

    return await upsertState(ctx, targetUserId, { pointsState: args.pointsState });
  },
});

export const saveWalletState = mutation({
  args: {
    userId: v.optional(v.string()),
    walletState: v.any(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
    const targetUserId = args.userId ?? actor.idString;
    assertSelfOrAdmin(actor, targetUserId);

    return await upsertState(ctx, targetUserId, { walletState: args.walletState });
  },
});

export const saveRewardsState = mutation({
  args: {
    userId: v.optional(v.string()),
    rewardsState: v.any(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
    const targetUserId = args.userId ?? actor.idString;
    assertSelfOrAdmin(actor, targetUserId);

    return await upsertState(ctx, targetUserId, { rewardsState: args.rewardsState });
  },
});

export const applyPointsEvent = mutation({
  args: {
    userId: v.optional(v.string()),
    eventKey: v.string(),
    type: v.union(v.literal("earn"), v.literal("redeem"), v.literal("convert"), v.literal("challenge")),
    source: v.union(v.literal("purchase"), v.literal("game"), v.literal("referral"), v.literal("bonus"), v.literal("manual")),
    amount: v.number(),
    description: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
    const targetUserId = args.userId ?? actor.idString;
    assertSelfOrAdmin(actor, targetUserId);

    const existing = await ctx.db
      .query("pointsLedger")
      .withIndex("by_user_event", (q) => q.eq("userId", targetUserId).eq("eventKey", args.eventKey))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("pointsLedger", {
      userId: targetUserId,
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

export const applyPointsEventInternal = internalMutation({
  args: {
    userId: v.string(),
    eventKey: v.string(),
    type: v.union(v.literal("earn"), v.literal("redeem"), v.literal("convert"), v.literal("challenge")),
    source: v.union(v.literal("purchase"), v.literal("game"), v.literal("referral"), v.literal("bonus"), v.literal("manual")),
    amount: v.number(),
    description: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
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
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let actor;
    try {
      actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
    } catch {
      return { balance: 0, events: [] };
    }
    const targetUserId = args.userId ?? actor.idString;
    assertSelfOrAdmin(actor, targetUserId);

    const events = await ctx.db
      .query("pointsLedger")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
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
    userId: v.optional(v.string()),
    eventKey: v.string(),
    type: v.union(v.literal("credit"), v.literal("debit"), v.literal("hold"), v.literal("release")),
    amount: v.number(),
    description: v.string(),
    orderId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
    const targetUserId = args.userId ?? actor.idString;
    assertSelfOrAdmin(actor, targetUserId);

    const existing = await ctx.db
      .query("walletLedger")
      .withIndex("by_user_event", (q) => q.eq("userId", targetUserId).eq("eventKey", args.eventKey))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("walletLedger", {
      userId: targetUserId,
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
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let actor;
    try {
      actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
    } catch {
      return { balanceAvailable: 0, balancePending: 0, balance: 0, events: [] };
    }
    const targetUserId = args.userId ?? actor.idString;
    assertSelfOrAdmin(actor, targetUserId);

    const events = await ctx.db
      .query("walletLedger")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
      .collect();

    let balanceAvailable = 0;
    let balancePending = 0;

    for (const event of events) {
      if (event.type === "credit") {
        balanceAvailable += event.amount;
      } else if (event.type === "debit") {
        balanceAvailable -= event.amount;
      } else if (event.type === "hold") {
        balancePending += event.amount;
      } else if (event.type === "release") {
        balancePending -= event.amount;
        balanceAvailable += event.amount;
      }
    }

    return {
      balanceAvailable,
      balancePending,
      balance: balanceAvailable + balancePending,
      events: events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  },
});

export const claimReward = mutation({
  args: {
    userId: v.optional(v.string()),
    claimKey: v.string(),
    type: v.string(),
    pointsAwarded: v.number(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
    const targetUserId = args.userId ?? actor.idString;
    assertSelfOrAdmin(actor, targetUserId);

    const existing = await ctx.db
      .query("rewardsClaims")
      .withIndex("by_user_claim", (q) => q.eq("userId", targetUserId).eq("claimKey", args.claimKey))
      .first();
    if (existing) {
      return { alreadyClaimed: true, claimId: existing._id };
    }

    const claimId = await ctx.db.insert("rewardsClaims", {
      userId: targetUserId,
      claimKey: args.claimKey,
      type: args.type,
      pointsAwarded: args.pointsAwarded,
      metadata: args.metadata,
      claimedAt: new Date().toISOString(),
    });
    return { alreadyClaimed: false, claimId };
  },
});

// ===== GAMIFICATION MODULE (PHASE 1) =====

export const getGameConfig = query({
  args: { gameId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gameConfigs")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .first();
  },
});

/**
 * Secure mutation to spin the roulette or slots.
 * Handles point deduction, probabilistic outcome, and prize award in one transaction.
 */
export const playGame = mutation({
  args: {
    gameId: v.string(), // 'roulette' | 'slots'
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.userId);
    const targetUserId = args.userId ?? actor.idString;
    assertSelfOrAdmin(actor, targetUserId);

    // 1. Get Game Config
    const config = await ctx.db
      .query("gameConfigs")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .first();

    if (!config || config.status !== 'active') {
      throw new Error("Juego no disponible en este momento.");
    }

    // 2. Check Balance (Points)
    const points = await ctx.db
      .query("pointsLedger")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
      .collect();
    const balance = points.reduce((acc, p) => acc + p.amount, 0);

    if (balance < config.costPerSpin) {
      throw new Error("No tienes suficientes puntos para jugar.");
    }

    // 3. Probabilistic Engine
    const totalWeight = config.paytable.reduce((acc, p) => acc + p.weight, 0);
    let random = Math.random() * totalWeight;
    let selectedOutcome = config.paytable[config.paytable.length - 1];

    for (const item of config.paytable) {
      if (random < item.weight) {
        selectedOutcome = item;
        break;
      }
      random -= item.weight;
    }

    const prizePoints = selectedOutcome.fixedPrize ?? (config.costPerSpin * selectedOutcome.multiplier);
    const eventKey = `${args.gameId}_spin_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // 4. Record Transactions (Idempotent Ledger)
    // Deduction
    await ctx.db.insert("pointsLedger", {
      userId: targetUserId,
      eventKey: `${eventKey}_cost`,
      type: "redeem",
      source: "game",
      amount: -config.costPerSpin,
      description: `Costo de giro: ${args.gameId}`,
      createdAt: new Date().toISOString(),
    });

    // Award (if any)
    let ledgerId;
    if (prizePoints > 0) {
      ledgerId = await ctx.db.insert("pointsLedger", {
        userId: targetUserId,
        eventKey: `${eventKey}_prize`,
        type: "earn",
        source: "game",
        amount: prizePoints,
        description: `Premio de juego: ${args.gameId} (${selectedOutcome.label})`,
        createdAt: new Date().toISOString(),
      });
    } else {
        // Still need a ledger ID for the spin record, we'll use a placeholder or the cost ID
        // For consistency, let's create a 0-point record if no prize
        ledgerId = await ctx.db.insert("pointsLedger", {
            userId: targetUserId,
            eventKey: `${eventKey}_no_prize`,
            type: "earn",
            source: "game",
            amount: 0,
            description: `Giro sin premio: ${args.gameId}`,
            createdAt: new Date().toISOString(),
          });
    }

    // 5. Audit Log
    const spinId = await ctx.db.insert("gameSpins", {
      userId: targetUserId,
      gameId: args.gameId,
      cost: config.costPerSpin,
      outcome: {
        paytableId: selectedOutcome.id,
        prizePoints,
        metadata: {
            label: selectedOutcome.label,
            // Slots specific metadata could go here (e.g. symbols generated)
            // Roulette specific metadata could go here (e.g. angle calculated)
        }
      },
      ledgerId,
      createdAt: new Date().toISOString(),
    });

    return {
      spinId,
      outcome: selectedOutcome,
      prizePoints,
      newBalance: balance - config.costPerSpin + prizePoints
    };
  },
});

// Admin tool to seed or update game configurations
export const seedGameConfigs = mutation({
    args: {},
    handler: async (ctx) => {
        const rouletteConfig = {
            gameId: 'roulette',
            costPerSpin: 10,
            status: 'active' as const,
            paytable: [
                { id: 'r1', label: 'Jackpot', weight: 1, multiplier: 50 },
                { id: 'r2', label: 'Big Win', weight: 5, multiplier: 10 },
                { id: 'r3', label: 'Small Win', weight: 20, multiplier: 2 },
                { id: 'r4', label: 'Try Again', weight: 74, multiplier: 0 },
            ],
            updatedAt: new Date().toISOString(),
        };

        const slotsConfig = {
            gameId: 'slots',
            costPerSpin: 20,
            status: 'active' as const,
            paytable: [
                { id: 's1', label: '777 Jackpot', weight: 1, multiplier: 100 },
                { id: 's2', label: 'Triple Diamond', weight: 3, multiplier: 25 },
                { id: 's3', label: 'Fruit Match', weight: 15, multiplier: 5 },
                { id: 's4', label: 'Any Pair', weight: 30, multiplier: 1.5 },
                { id: 's5', label: 'No Win', weight: 51, multiplier: 0 },
            ],
            updatedAt: new Date().toISOString(),
        };

        const games = [rouletteConfig, slotsConfig];

        for (const game of games) {
            const existing = await ctx.db
                .query("gameConfigs")
                .withIndex("by_game", (q) => q.eq("gameId", game.gameId))
                .first();
            
            if (existing) {
                await ctx.db.patch(existing._id, game);
            } else {
                await ctx.db.insert("gameConfigs", game);
            }
        }
    }
});
