import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { assertSelfOrAdmin, requireActor } from './authHelpers';

// Define the default pet state
const DEFAULT_PET_STATE = {
    gameCoins: 100,
    points: 0,
    petStats: { happiness: 80, hunger: 60, energy: 70, level: 1, exp: 0 },
    petConfig: { activeHat: 'none', unlockedHats: ['none'] },
};

export const getEconomyState = query({
    args: { sessionToken: v.optional(v.string()), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const state = await ctx.db
            .query('economyState')
            .withIndex('by_user', (q: any) => q.eq('userId', args.userId))
            .first();

        if (!state || !state.rewardsState) {
            return null;
        }

        return state.rewardsState;
    },
});

export const initializeEconomy = mutation({
    args: { sessionToken: v.optional(v.string()), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const state = await ctx.db
            .query('economyState')
            .withIndex('by_user', (q: any) => q.eq('userId', args.userId))
            .first();

        if (!state) {
            await ctx.db.insert('economyState', {
                userId: args.userId,
                rewardsState: DEFAULT_PET_STATE,
                updatedAt: new Date().toISOString(),
            });
            return DEFAULT_PET_STATE;
        }
        if (!state.rewardsState) {
            await ctx.db.patch(state._id, {
                rewardsState: DEFAULT_PET_STATE,
                updatedAt: new Date().toISOString(),
            });
            return DEFAULT_PET_STATE;
        }
        return state.rewardsState;
    },
});

async function ensureEconomyState(ctx: any, args: { userId: string }) {
    let state = await ctx.db
        .query('economyState')
        .withIndex('by_user', (q: any) => q.eq('userId', args.userId))
        .first();
    if (!state) {
        const id = await ctx.db.insert('economyState', {
            userId: args.userId,
            rewardsState: DEFAULT_PET_STATE,
            updatedAt: new Date().toISOString(),
        });
        state = await ctx.db.get(id);
    } else if (!state.rewardsState) {
        await ctx.db.patch(state._id, {
            rewardsState: DEFAULT_PET_STATE,
            updatedAt: new Date().toISOString(),
        });
        state = await ctx.db.get(state._id);
    }
    return state;
}

export const updatePetState = mutation({
    args: { sessionToken: v.optional(v.string()),
        userId: v.string(),
        updates: v.any(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        return await internalUpdatePetState(ctx, args);
    },
});

async function internalUpdatePetState(ctx: any, args: { userId: string; updates: any }) {
    const state = await ensureEconomyState(ctx, args);
    const currentState = state!.rewardsState || DEFAULT_PET_STATE;
    const newState = { ...currentState, petStats: { ...currentState.petStats, ...args.updates } };

    await ctx.db.patch(state!._id, {
        rewardsState: newState,
        updatedAt: new Date().toISOString(),
    });
    return newState;
}

export const spendCoins = mutation({
    args: { sessionToken: v.optional(v.string()),
        userId: v.string(),
        amount: v.number(),
        reason: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        return await internalSpendCoins(ctx, args);
    },
});

async function internalSpendCoins(ctx: any, args: { userId: string; amount: number; reason: string }) {
    const state = await ensureEconomyState(ctx, args);
    const currentState = state!.rewardsState || DEFAULT_PET_STATE;

    if (currentState.gameCoins < args.amount) {
        return { success: false, message: 'No tienes suficientes monedas' };
    }

    const newState = {
        ...currentState,
        gameCoins: currentState.gameCoins - args.amount,
    };

    await ctx.db.patch(state!._id, {
        rewardsState: newState,
        updatedAt: new Date().toISOString(),
    });

    await ctx.db.insert('pointsLedger', {
        userId: args.userId,
        eventKey: `spend_${Date.now()}_${Math.random()}`,
        type: 'redeem',
        source: 'game',
        amount: args.amount,
        description: args.reason,
        createdAt: new Date().toISOString(),
    });

    return { success: true, state: newState };
}

export const addCoins = mutation({
    args: { sessionToken: v.optional(v.string()),
        userId: v.string(),
        amount: v.number(),
        reason: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        return await internalAddCoins(ctx, args);
    },
});

async function internalAddCoins(ctx: any, args: { userId: string; amount: number; reason: string }) {
    const state = await ensureEconomyState(ctx, args);
    const currentState = state!.rewardsState || DEFAULT_PET_STATE;
    const newState = {
        ...currentState,
        gameCoins: currentState.gameCoins + args.amount,
    };

    await ctx.db.patch(state!._id, {
        rewardsState: newState,
        updatedAt: new Date().toISOString(),
    });

    await ctx.db.insert('pointsLedger', {
        userId: args.userId,
        eventKey: `add_${Date.now()}_${Math.random()}`,
        type: 'earn',
        source: 'game',
        amount: args.amount,
        description: args.reason,
        createdAt: new Date().toISOString(),
    });

    return newState;
}

// Mascota Specific Actions
export const feedVirtualPet = mutation({
    args: { sessionToken: v.optional(v.string()), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const cost = 5;
        const res = await internalSpendCoins(ctx, { userId: args.userId, amount: cost, reason: 'Alimentar mascota' });
        if (!res.success) return { status: 'error', message: res.message };

        const newState = await internalUpdatePetState(ctx, { userId: args.userId, updates: { hunger: Math.min(100, res.state.petStats.hunger + 30) } });
        return { status: 'awarded', message: 'Mascota alimentada!', state: newState };
    }
});

export const sleepVirtualPet = mutation({
    args: { sessionToken: v.optional(v.string()), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const cost = 2;
        const res = await internalSpendCoins(ctx, { userId: args.userId, amount: cost, reason: 'Dormir mascota' });
        if (!res.success) return { status: 'error', message: res.message };

        const newState = await internalUpdatePetState(ctx, { userId: args.userId, updates: { energy: 100 } });
        return { status: 'awarded', message: 'Zzz... la mascota esta descansando', state: newState };
    }
});

export const cleanVirtualPet = mutation({
    args: { sessionToken: v.optional(v.string()), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const cost = 3;
        const res = await internalSpendCoins(ctx, { userId: args.userId, amount: cost, reason: 'Baniar mascota' });
        if (!res.success) return { status: 'error', message: res.message };

        const newState = await internalUpdatePetState(ctx, { userId: args.userId, updates: { happiness: Math.min(100, res.state.petStats.happiness + 15) } });
        return { status: 'awarded', message: 'Que limpio!', state: newState };
    }
});

export const playVirtualPet = mutation({
    args: { sessionToken: v.optional(v.string()), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const res = await internalUpdatePetState(ctx, { userId: args.userId, updates: {} });
        const energy = res.petStats.energy;
        if (energy < 15) return { status: 'error', message: 'La mascota esta muy cansada para jugar.' };

        const newState = await internalUpdatePetState(ctx, {
            userId: args.userId,
            updates: {
                happiness: Math.min(100, res.petStats.happiness + 20),
                energy: Math.max(0, res.petStats.energy - 15)
            }
        });
        return { status: 'awarded', message: 'Diversion total!', state: newState };
    }
});

export const unlockAccessory = mutation({
    args: { sessionToken: v.optional(v.string()), userId: v.string(), type: v.string(), id: v.string(), cost: v.number() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const res = await internalSpendCoins(ctx, { userId: args.userId, amount: args.cost, reason: `Comprar ropa ${args.id}` });
        if (!res.success) return false;

        const state = res.state;
        const newUnlockedHats = [...(state.petConfig.unlockedHats || []), args.id];
        const newState = { ...state, petConfig: { ...state.petConfig, unlockedHats: newUnlockedHats } };

        let doc = await ctx.db.query('economyState').withIndex('by_user', (q) => q.eq('userId', args.userId)).first();
        if (doc) {
            await ctx.db.patch(doc._id, { rewardsState: newState, updatedAt: new Date().toISOString() });
        }
        return true;
    },
});

export const equipAccessory = mutation({
    args: { sessionToken: v.optional(v.string()), userId: v.string(), type: v.string(), id: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        let doc = await ensureEconomyState(ctx, { userId: args.userId });

        if (!doc?.rewardsState) return;
        const newState = { ...doc.rewardsState, petConfig: { ...doc.rewardsState.petConfig, activeHat: args.id } };
        await ctx.db.patch(doc._id, { rewardsState: newState, updatedAt: new Date().toISOString() });
    },
});

export const convertCoinsToPoints = mutation({
    args: { sessionToken: v.optional(v.string()), userId: v.string(), coinsToConvert: v.number() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        let doc = await ensureEconomyState(ctx, { userId: args.userId });
        if (!doc?.rewardsState) return { success: false, message: 'Usuario no encontrado' };

        const currentState = doc.rewardsState;
        if (currentState.gameCoins < args.coinsToConvert) {
            return { success: false, message: 'Monedas insuficientes' };
        }

        const earnedPoints = Math.floor(args.coinsToConvert / 5);

        const newState = {
            ...currentState,
            gameCoins: currentState.gameCoins - args.coinsToConvert,
            points: (currentState.points || 0) + earnedPoints
        };

        await ctx.db.patch(doc._id, { rewardsState: newState, updatedAt: new Date().toISOString() });

        await ctx.db.insert('pointsLedger', {
            userId: args.userId,
            eventKey: `convert_${Date.now()}_${Math.random()}`,
            type: 'convert',
            source: 'game',
            amount: earnedPoints,
            description: `Conversion de ${args.coinsToConvert} monedas`,
            createdAt: new Date().toISOString(),
        });

        return { success: true, earnedPoints, state: newState };
    }
});

// Award points (from purchases, challenges, etc.)
export const addPoints = mutation({
    args: { sessionToken: v.optional(v.string()), userId: v.string(), amount: v.number(), description: v.string(), source: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        let doc = await ensureEconomyState(ctx, { userId: args.userId });
        if (!doc?.rewardsState) return { success: false };

        const currentState = doc.rewardsState;
        const newState = {
            ...currentState,
            points: (currentState.points || 0) + args.amount,
        };

        await ctx.db.patch(doc._id, { rewardsState: newState, updatedAt: new Date().toISOString() });

        await ctx.db.insert('pointsLedger', {
            userId: args.userId,
            eventKey: `add_pts_${Date.now()}_${Math.random()}`,
            type: 'earn',
            source: args.source as any,
            amount: args.amount,
            description: args.description,
            createdAt: new Date().toISOString(),
        });

        return { success: true, points: newState.points };
    }
});

// Claim daily login reward
export const claimDailyReward = mutation({
    args: { sessionToken: v.optional(v.string()), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const todayKey = new Date().toISOString().slice(0, 10);

        const existing = await ctx.db
            .query('rewardsClaims')
            .withIndex('by_user_claim', (q: any) => q.eq('userId', args.userId).eq('claimKey', `daily_${todayKey}`))
            .first();

        if (existing) return { success: false, message: 'Ya reclamaste hoy' };

        let doc = await ensureEconomyState(ctx, { userId: args.userId });
        if (!doc?.rewardsState) return { success: false, message: 'Usuario no encontrado' };

        const reward = 10;
        const currentState = doc.rewardsState;
        const loginStreak = (currentState.loginStreak || 0) + 1;
        const newState = {
            ...currentState,
            points: (currentState.points || 0) + reward,
            loginStreak,
            dailyClaimDate: todayKey,
        };

        await ctx.db.patch(doc._id, { rewardsState: newState, updatedAt: new Date().toISOString() });

        await ctx.db.insert('rewardsClaims', {
            userId: args.userId,
            claimKey: `daily_${todayKey}`,
            type: 'daily_login',
            pointsAwarded: reward,
            claimedAt: new Date().toISOString(),
        });

        await ctx.db.insert('pointsLedger', {
            userId: args.userId,
            eventKey: `daily_${todayKey}`,
            type: 'earn',
            source: 'bonus',
            amount: reward,
            description: `Racha diaria - Dia ${loginStreak}`,
            createdAt: new Date().toISOString(),
        });

        return { success: true, points: newState.points, loginStreak };
    }
});

// Get points transactions history
export const getPointsHistory = query({
    args: { sessionToken: v.optional(v.string()), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        return await ctx.db
            .query('pointsLedger')
            .withIndex('by_user', (q: any) => q.eq('userId', args.userId))
            .order('desc')
            .take(50);
    }
});

// Internal mutation for referral system (called from users.ts)
export const applyPointsEventInternal = internalMutation({
    args: {
        userId: v.string(),
        eventKey: v.string(),
        type: v.string(),
        source: v.string(),
        amount: v.number(),
        description: v.string(),
        metadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query('pointsLedger')
            .withIndex('by_user_event', (q: any) => q.eq('userId', args.userId).eq('eventKey', args.eventKey))
            .first();
        if (existing) return { success: false, message: 'Already applied' };

        let doc = await ensureEconomyState(ctx, { userId: args.userId });
        const currentState = doc!.rewardsState || DEFAULT_PET_STATE;
        const newState = {
            ...currentState,
            points: (currentState.points || 0) + args.amount,
        };
        await ctx.db.patch(doc!._id, { rewardsState: newState, updatedAt: new Date().toISOString() });

        await ctx.db.insert('pointsLedger', {
            userId: args.userId,
            eventKey: args.eventKey,
            type: args.type as any,
            source: args.source as any,
            amount: args.amount,
            description: args.description,
            metadata: args.metadata,
            createdAt: new Date().toISOString(),
        });

        return { success: true };
    }
});