import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { assertSelfOrAdmin, requireActor } from './authHelpers';
import {
    DEFAULT_PET_STATE,
    ensureEconomyState,
    hydrateRewardsState,
    normalizeChallenges,
    quarterKey,
    todayKey,
    weekKey,
} from './economy/pointsState';
import { awardPoints, buildEventKey, countDailyAwards } from './economy/pointsEngine';



/** $1 cash spent = 1 base point. Tier bonus matches PointsContext DISCOUNT_TIERS. */
export const POINTS_PER_USD = 1;
const PURCHASE_TIERS = [
    { minPoints: 0, bonusMultiplier: 0 },
    { minPoints: 100, bonusMultiplier: 0.05 },
    { minPoints: 500, bonusMultiplier: 0.1 },
    { minPoints: 1000, bonusMultiplier: 0.2 },
] as const;

function purchaseBonusMultiplier(lifetimePoints: number): number {
    let bonus = 0;
    for (const tier of PURCHASE_TIERS) {
        if (lifetimePoints >= tier.minPoints) bonus = tier.bonusMultiplier;
    }
    return bonus;
}

const WHEEL_MIN = 5;
const WHEEL_MAX = 50;

const CHALLENGE_DEFS: Record<string, { reward: number; target: number; title: string }> = {
    daily_login: { reward: 10, target: 1, title: 'Inicia sesión' },
    daily_browse: { reward: 5, target: 3, title: 'Explora el marketplace' },
    weekly_purchase: { reward: 25, target: 1, title: 'Realiza una compra' },
    quarterly_mission: { reward: 150, target: 3, title: 'Misión Trimestral' },
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

        return hydrateRewardsState(state.rewardsState);
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

        const newState = await internalUpdatePetState(ctx, {
            userId: args.userId,
            updates: {
                hunger: Math.min(100, res.state.petStats.hunger + 30),
                exp: (res.state.petStats.exp || 0) + 15,
            },
        });
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

        const newState = await internalUpdatePetState(ctx, {
            userId: args.userId,
            updates: {
                energy: Math.min(100, (res.state.petStats.energy || 0) + 40),
                exp: (res.state.petStats.exp || 0) + 10,
            },
        });
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

        const newState = await internalUpdatePetState(ctx, {
            userId: args.userId,
            updates: {
                happiness: Math.min(100, res.state.petStats.happiness + 15),
                exp: (res.state.petStats.exp || 0) + 20,
            },
        });
        return { status: 'awarded', message: 'Que limpio!', state: newState };
    }
});

export const playVirtualPet = mutation({
    args: { sessionToken: v.optional(v.string()), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const cost = 2;
        const spent = await internalSpendCoins(ctx, {
            userId: args.userId,
            amount: cost,
            reason: 'Jugar con mascota',
        });
        if (!spent.success) return { status: 'error', message: spent.message };

        const energy = spent.state.petStats.energy;
        if (energy < 15) {
            // refund coins if too tired
            await internalAddCoins(ctx, { userId: args.userId, amount: cost, reason: 'Refund juego' });
            return { status: 'error', message: 'La mascota esta muy cansada para jugar.' };
        }

        const newState = await internalUpdatePetState(ctx, {
            userId: args.userId,
            updates: {
                happiness: Math.min(100, spent.state.petStats.happiness + 20),
                energy: Math.max(0, spent.state.petStats.energy - 15),
                exp: (spent.state.petStats.exp || 0) + 25,
            },
        });
        return { status: 'awarded', message: 'Diversion total!', state: newState };
    }
});

/**
 * Precio de los accesorios. Espeja `HATS` de
 * `src/components/pet/MiMascotaView.tsx`, pero manda ESTE: el `cost` que
 * llegaba por argumento lo elegía el cliente, así que mandar `cost: 0`
 * desbloqueaba cualquier accesorio gratis.
 */
const ACCESSORY_PRICES: Record<string, number> = {
    none: 0,
    party: 50,
    glasses: 100,
    cowboy: 150,
    viking: 200,
    alien: 250,
    wizard: 300,
    crown: 500,
};

export const unlockAccessory = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.string(),
        type: v.string(),
        id: v.string(),
        /** Ignorado: el precio lo pone el servidor. Se acepta por compatibilidad. */
        cost: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const price = ACCESSORY_PRICES[args.id];
        if (price === undefined) return false;

        const doc = await ensureEconomyState(ctx, { userId: args.userId });
        const current = hydrateRewardsState(doc!.rewardsState);
        const unlocked = current.petConfig.unlockedHats || [];
        if (unlocked.includes(args.id)) return true;

        const res = await internalSpendCoins(ctx, {
            userId: args.userId,
            amount: price,
            reason: `Comprar ropa ${args.id}`,
        });
        if (!res.success) return false;

        const newState = {
            ...hydrateRewardsState(res.state),
            petConfig: {
                ...current.petConfig,
                unlockedHats: [...unlocked, args.id],
            },
        };

        await ctx.db.patch(doc!._id, {
            rewardsState: newState,
            updatedAt: new Date().toISOString(),
        });
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

        const doc = await ensureEconomyState(ctx, { userId: args.userId });
        if (!doc?.rewardsState) return { success: false, message: 'Usuario no encontrado' };

        const coins = Math.floor(Number(args.coinsToConvert));
        if (!Number.isFinite(coins) || coins <= 0) {
            return { success: false, message: 'Monto inválido' };
        }

        const currentState = hydrateRewardsState(doc.rewardsState);
        if (currentState.gameCoins < coins) {
            return { success: false, message: 'Monedas insuficientes' };
        }

        const earnedPoints = Math.floor(coins / 5);
        if (earnedPoints <= 0) {
            return { success: false, message: 'Mínimo 5 monedas para canjear' };
        }

        const newState = {
            ...currentState,
            gameCoins: currentState.gameCoins - coins,
            points: currentState.points + earnedPoints,
            lifetimePoints: (currentState.lifetimePoints || 0) + earnedPoints,
        };

        await ctx.db.patch(doc._id, { rewardsState: newState, updatedAt: new Date().toISOString() });

        await ctx.db.insert('pointsLedger', {
            userId: args.userId,
            eventKey: `convert_${Date.now()}_${Math.random()}`,
            type: 'convert',
            source: 'game',
            amount: earnedPoints,
            description: `Conversion de ${coins} monedas`,
            createdAt: new Date().toISOString(),
        });

        return { success: true, earnedPoints, state: newState };
    }
});

/**
 * Catálogo de recompensas reclamables.
 *
 * Reemplaza a `addPoints`, que era una mutation PÚBLICA que recibía el monto
 * desde el cliente y sólo validaba `amount > 0`: cualquiera podía acreditarse
 * los puntos que quisiera. Acá el cliente sólo dice QUÉ reclama; cuánto vale
 * y si corresponde lo decide el servidor.
 *
 * `refId` identifica la instancia del evento (el hito de racha, el número de
 * partida). Junto con la fecha forma el `eventKey`, que es a la vez la clave
 * de idempotencia y la del tope diario — ver `economy/pointsEngine.ts`.
 */
const REWARD_CATALOG: Record<
    string,
    {
        points: number | ((refId: string) => number | null);
        source: 'purchase' | 'game' | 'referral' | 'bonus' | 'manual';
        description: string;
        /** Máximo de reclamos por día para este `kind`. */
        dailyMax: number;
        /** Verificación server-side contra el estado real. `null` = OK. */
        verify?: (state: any, refId: string) => string | null;
    }
> = {
    /** Cuidado diario de la mascota. El `eventKey` con la fecha ya lo hace 1/día. */
    pet_daily_care: {
        points: 5,
        source: 'bonus',
        description: 'Cuidado diario de mascota virtual',
        dailyMax: 1,
    },
    /**
     * Recompensa de arcade. Deliberadamente PLANA y no derivada del puntaje:
     * el puntaje lo reporta el cliente, así que atarle los puntos deja el
     * monto en manos del cliente otra vez, que es justo el agujero que
     * estamos cerrando. Tope diario duro de 3, igual que la UI.
     */
    arcade_play: {
        points: 10,
        source: 'game',
        description: 'Recompensa de arcade',
        dailyMax: 3,
    },
    /** Hito de racha. `refId` = días. El servidor verifica la racha real. */
    streak_milestone: {
        points: (refId) => STREAK_MILESTONE_REWARDS[refId] ?? null,
        source: 'bonus',
        description: 'Bonus de racha',
        dailyMax: 4,
        verify: (state, refId) => {
            const target = Number(refId);
            if (!STREAK_MILESTONE_REWARDS[refId]) return 'Hito inexistente.';
            if ((state.loginStreak || 0) < target) {
                return `Mantené la racha hasta el día ${target} para reclamar.`;
            }
            return null;
        },
    },
};

const STREAK_MILESTONE_REWARDS: Record<string, number> = {
    '3': 20,
    '7': 60,
    '14': 150,
    '30': 400,
};

/**
 * Los bonos de referido y bienvenida NO están en el catálogo a propósito:
 * los otorga el servidor solo en el alta (`users.awardReferralOnSignup`),
 * donde conoce al referidor de verdad. Si fueran reclamables, el cliente
 * podría inventarse referidos.
 */
export const claimReward = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        kind: v.string(),
        refId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);

        const def = REWARD_CATALOG[args.kind];
        if (!def) return { success: false, message: 'Recompensa desconocida.' };

        const refId = (args.refId ?? 'default').slice(0, 64);
        // El `~` es el centinela del rango del tope diario; no puede aparecer
        // dentro del id o rompería el conteo.
        if (refId.includes(':') || refId.includes('~')) {
            return { success: false, message: 'Referencia inválida.' };
        }

        const doc = await ensureEconomyState(ctx, { userId: actor.idString });
        const state = hydrateRewardsState(doc!.rewardsState);

        const reason = def.verify?.(state, refId);
        if (reason) return { success: false, message: reason };

        const amount = typeof def.points === 'function' ? def.points(refId) : def.points;
        if (!amount || amount <= 0) return { success: false, message: 'Recompensa inválida.' };

        const result = await awardPoints(ctx, {
            userId: actor.idString,
            eventKey: buildEventKey(args.kind, refId),
            amount,
            description: def.description,
            source: def.source,
            metadata: { kind: args.kind, refId },
            dailyCapKind: args.kind,
            dailyCapMax: def.dailyMax,
        });

        if (result.awarded === 0) {
            const message =
                result.reason === 'duplicate'
                    ? 'Ya reclamaste esta recompensa.'
                    : result.reason === 'capped'
                      ? 'Alcanzaste el límite diario de esta recompensa.'
                      : 'No se pudo acreditar la recompensa.';
            return { success: false, message, reason: result.reason, points: result.balance };
        }

        return { success: true, pointsAwarded: result.awarded, points: result.balance };
    },
});

/** Cuántos reclamos de `kind` quedan hoy. La UI ya no lleva esa cuenta. */
export const getRewardAllowance = query({
    args: { sessionToken: v.optional(v.string()), kind: v.string() },
    handler: async (ctx, args) => {
        // Query: degrada en vez de lanzar (`useQuery` re-lanza en render).
        let actor;
        try {
            actor = await requireActor(ctx, args.sessionToken);
        } catch {
            return { used: 0, max: 0, remaining: 0 };
        }
        const def = REWARD_CATALOG[args.kind];
        if (!def) return { used: 0, max: 0, remaining: 0 };
        const used = await countDailyAwards(ctx, actor.idString, args.kind);
        return { used, max: def.dailyMax, remaining: Math.max(0, def.dailyMax - used) };
    },
});

/**
 * Award purchase points: $1 cash = 1 pt (+ tier bonus).
 * Idempotent per paymentIntentId. Cash-only — amount already excludes points redeemed.
 */
export const internalAwardPurchasePoints = internalMutation({
    args: {
        userId: v.string(),
        cashAmountUsd: v.number(),
        paymentIntentId: v.string(),
        orderId: v.optional(v.string()),
        description: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const cash = Math.max(0, Number(args.cashAmountUsd) || 0);
        const basePoints = Math.floor(cash * POINTS_PER_USD);
        if (basePoints <= 0) {
            return { success: false, pointsAwarded: 0, reason: 'no_cash' as const };
        }

        const eventKey = `purchase_pts_${args.paymentIntentId}`;
        const existing = await ctx.db
            .query('pointsLedger')
            .withIndex('by_user_event', (q: any) =>
                q.eq('userId', args.userId).eq('eventKey', eventKey),
            )
            .first();
        if (existing) {
            return {
                success: false,
                pointsAwarded: 0,
                reason: 'already_awarded' as const,
            };
        }

        const doc = await ensureEconomyState(ctx, { userId: args.userId });
        const current = hydrateRewardsState(doc!.rewardsState);
        const bonusMult = purchaseBonusMultiplier(current.lifetimePoints || 0);
        const pointsAwarded = Math.max(1, Math.floor(basePoints * (1 + bonusMult)));

        const challenges = normalizeChallenges(current.challenges);
        const purchaseDef = CHALLENGE_DEFS.weekly_purchase;
        challenges.weekly_purchase = {
            current: Math.min(
                purchaseDef.target,
                (challenges.weekly_purchase.current || 0) + 1,
            ),
            claimed: !!challenges.weekly_purchase.claimed,
            weekKey: weekKey(),
        };

        const quarterlyDef = CHALLENGE_DEFS.quarterly_mission;
        challenges.quarterly_mission = {
            current: Math.min(
                quarterlyDef.target,
                (challenges.quarterly_mission?.current || 0) + 1,
            ),
            claimed: !!challenges.quarterly_mission?.claimed,
            quarterKey: quarterKey(),
        };

        const newState = {
            ...current,
            points: (current.points || 0) + pointsAwarded,
            lifetimePoints: (current.lifetimePoints || 0) + pointsAwarded,
            challenges,
        };

        await ctx.db.patch(doc!._id, {
            rewardsState: newState,
            updatedAt: new Date().toISOString(),
        });

        await ctx.db.insert('pointsLedger', {
            userId: args.userId,
            eventKey,
            type: 'earn',
            source: 'purchase',
            amount: pointsAwarded,
            description:
                args.description ||
                `Compra: $${cash.toFixed(2)} → ${pointsAwarded} pts` +
                    (bonusMult > 0 ? ` (incl. +${Math.round(bonusMult * 100)}% nivel)` : ''),
            metadata: {
                paymentIntentId: args.paymentIntentId,
                orderId: args.orderId,
                cashAmountUsd: cash,
                basePoints,
                bonusMultiplier: bonusMult,
            },
            createdAt: new Date().toISOString(),
        });

        return {
            success: true,
            pointsAwarded,
            basePoints,
            bonusMultiplier: bonusMult,
            points: newState.points,
            lifetimePoints: newState.lifetimePoints,
        };
    },
});

/** Daily lucky wheel — atomic claim + points credit in Convex */
export const spinLuckyWheel = mutation({
    args: { sessionToken: v.optional(v.string()), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const day = todayKey();
        const claimKey = `wheel_${day}`;
        const existing = await ctx.db
            .query('rewardsClaims')
            .withIndex('by_user_claim', (q: any) =>
                q.eq('userId', args.userId).eq('claimKey', claimKey),
            )
            .first();
        if (existing) {
            return {
                success: false,
                alreadyClaimed: true,
                message: 'Ya giraste la rueda hoy. Vuelve mañana.',
                pointsAwarded: existing.pointsAwarded,
            };
        }

        const pointsAwarded =
            Math.floor(Math.random() * (WHEEL_MAX - WHEEL_MIN + 1)) + WHEEL_MIN;

        const doc = await ensureEconomyState(ctx, { userId: args.userId });
        const current = hydrateRewardsState(doc!.rewardsState);
        const newState = {
            ...current,
            points: (current.points || 0) + pointsAwarded,
            lifetimePoints: (current.lifetimePoints || 0) + pointsAwarded,
            wheelClaimDate: day,
        };
        await ctx.db.patch(doc!._id, {
            rewardsState: newState,
            updatedAt: new Date().toISOString(),
        });
        await ctx.db.insert('rewardsClaims', {
            userId: args.userId,
            claimKey,
            type: 'lucky_wheel',
            pointsAwarded,
            claimedAt: new Date().toISOString(),
        });
        await ctx.db.insert('pointsLedger', {
            userId: args.userId,
            eventKey: claimKey,
            type: 'earn',
            source: 'bonus',
            amount: pointsAwarded,
            description: 'Ruleta de la Suerte Ramgos',
            createdAt: new Date().toISOString(),
        });

        return {
            success: true,
            pointsAwarded,
            points: newState.points,
            message: `¡Ganaste ${pointsAwarded} puntos!`,
        };
    },
});

/** Spend points at checkout (1 pt = $0.01). Returns discount USD. */
export const redeemPoints = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.string(),
        pointsToRedeem: v.number(),
        orderId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const amount = Math.floor(args.pointsToRedeem);
        if (amount <= 0) return { success: false, message: 'Monto inválido' };

        const doc = await ensureEconomyState(ctx, { userId: args.userId });
        const current = hydrateRewardsState(doc!.rewardsState);
        if ((current.points || 0) < amount) {
            return { success: false, message: 'Puntos insuficientes' };
        }

        const discountUsd = amount * 0.01;
        const newState = {
            ...current,
            points: current.points - amount,
        };
        await ctx.db.patch(doc!._id, {
            rewardsState: newState,
            updatedAt: new Date().toISOString(),
        });
        await ctx.db.insert('pointsLedger', {
            userId: args.userId,
            eventKey: `redeem_${args.orderId || Date.now()}_${Math.random()}`,
            type: 'redeem',
            source: 'purchase',
            amount,
            description: `Canje de ${amount} puntos (-$${discountUsd.toFixed(2)})`,
            metadata: { orderId: args.orderId, discountUsd },
            createdAt: new Date().toISOString(),
        });

        return {
            success: true,
            pointsSpent: amount,
            discountUsd,
            points: newState.points,
        };
    },
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

        const doc = await ensureEconomyState(ctx, { userId: args.userId });
        if (!doc?.rewardsState) return { success: false, message: 'Usuario no encontrado' };

        const reward = 10;
        const currentState = hydrateRewardsState(doc.rewardsState);
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


/** Progress a challenge (browse marketplace, complete purchase, etc.) */
export const progressChallenge = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.string(),
        challengeId: v.string(),
        increment: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertSelfOrAdmin(actor, args.userId);
        if (!CHALLENGE_DEFS[args.challengeId] || args.challengeId === 'daily_login') {
            return { success: false, message: 'Challenge inválido' };
        }

        const doc = await ensureEconomyState(ctx, { userId: args.userId });
        const current = doc!.rewardsState || DEFAULT_PET_STATE;
        const challenges = normalizeChallenges(current.challenges);
        const key = args.challengeId as 'daily_browse' | 'weekly_purchase';
        const def = CHALLENGE_DEFS[args.challengeId];
        const entry = challenges[key];
        if (entry.claimed) return { success: true, challenges, alreadyClaimed: true };

        const inc = Math.max(1, args.increment ?? 1);
        if (key === 'daily_browse') {
            challenges.daily_browse = {
                current: Math.min(def.target, entry.current + inc),
                claimed: false,
                dayKey: todayKey(),
            };
        } else {
            challenges.weekly_purchase = {
                current: Math.min(def.target, entry.current + inc),
                claimed: false,
                weekKey: weekKey(),
            };
        }

        const newState = { ...current, challenges };
        await ctx.db.patch(doc!._id, { rewardsState: newState, updatedAt: new Date().toISOString() });
        return { success: true, challenges };
    },
});

/** Claim a completed challenge for points */
export const claimChallenge = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.string(),
        challengeId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        if (args.challengeId === 'daily_login') {
            // reuse daily reward path
            const today = todayKey();
            const existing = await ctx.db
                .query('rewardsClaims')
                .withIndex('by_user_claim', (q: any) =>
                    q.eq('userId', args.userId).eq('claimKey', `daily_${today}`),
                )
                .first();
            if (existing) return { success: false, message: 'Ya reclamaste hoy' };

            const doc = await ensureEconomyState(ctx, { userId: args.userId });
            const current = doc!.rewardsState || DEFAULT_PET_STATE;
            const reward = CHALLENGE_DEFS.daily_login.reward;
            const loginStreak = (current.loginStreak || 0) + 1;
            const newState = {
                ...current,
                points: (current.points || 0) + reward,
                loginStreak,
                dailyClaimDate: today,
                challenges: normalizeChallenges(current.challenges),
            };
            await ctx.db.patch(doc!._id, { rewardsState: newState, updatedAt: new Date().toISOString() });
            await ctx.db.insert('rewardsClaims', {
                userId: args.userId,
                claimKey: `daily_${today}`,
                type: 'daily_login',
                pointsAwarded: reward,
                claimedAt: new Date().toISOString(),
            });
            await ctx.db.insert('pointsLedger', {
                userId: args.userId,
                eventKey: `daily_${today}`,
                type: 'earn',
                source: 'bonus',
                amount: reward,
                description: `Racha diaria - Dia ${loginStreak}`,
                createdAt: new Date().toISOString(),
            });
            return { success: true, points: newState.points, reward };
        }

        const def = CHALLENGE_DEFS[args.challengeId];
        if (!def) return { success: false, message: 'Challenge desconocido' };

        const doc = await ensureEconomyState(ctx, { userId: args.userId });
        const current = doc!.rewardsState || DEFAULT_PET_STATE;
        const challenges = normalizeChallenges(current.challenges);
        const key = args.challengeId as 'daily_browse' | 'weekly_purchase' | 'quarterly_mission';
        const entry = challenges[key];
        if (!entry) return { success: false, message: 'Challenge data not found' };
        if (entry.claimed) return { success: false, message: 'Ya reclamado' };
        if (entry.current < def.target) {
            return { success: false, message: `Progreso insuficiente (${entry.current}/${def.target})` };
        }

        const claimKey = `challenge_${args.challengeId}_${key === 'daily_browse' ? todayKey() : key === 'weekly_purchase' ? weekKey() : quarterKey()}`;
        const existing = await ctx.db
            .query('rewardsClaims')
            .withIndex('by_user_claim', (q: any) =>
                q.eq('userId', args.userId).eq('claimKey', claimKey),
            )
            .first();
        if (existing) return { success: false, message: 'Ya reclamado' };

        if (key === 'daily_browse') {
            challenges.daily_browse = { ...challenges.daily_browse, claimed: true };
        } else if (key === 'weekly_purchase') {
            challenges.weekly_purchase = { ...challenges.weekly_purchase, claimed: true };
        } else if (key === 'quarterly_mission') {
            challenges.quarterly_mission = { ...challenges.quarterly_mission, claimed: true };
        }
        const newState = {
            ...current,
            points: (current.points || 0) + def.reward,
            lifetimePoints: (current.lifetimePoints || 0) + def.reward,
            challenges,
        };
        await ctx.db.patch(doc!._id, { rewardsState: newState, updatedAt: new Date().toISOString() });
        await ctx.db.insert('rewardsClaims', {
            userId: args.userId,
            claimKey,
            type: args.challengeId,
            pointsAwarded: def.reward,
            claimedAt: new Date().toISOString(),
        });
        await ctx.db.insert('pointsLedger', {
            userId: args.userId,
            eventKey: claimKey,
            type: 'challenge',
            source: 'bonus',
            amount: def.reward,
            description: `Desafío: ${def.title}`,
            createdAt: new Date().toISOString(),
        });
        return { success: true, points: newState.points, reward: def.reward };
    },
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
    // Delega en el motor: misma idempotencia por `eventKey` que tenía, más el
    // acotado de monto y la garantía de saldo no negativo, en un solo lugar.
    handler: async (ctx, args) => {
        const result = await awardPoints(ctx, {
            userId: args.userId,
            eventKey: args.eventKey,
            amount: args.amount,
            description: args.description,
            type: args.type as any,
            source: args.source as any,
            metadata: args.metadata,
        });

        if (result.awarded === 0) {
            return { success: false, message: result.reason ?? 'Not applied' };
        }
        return { success: true, points: result.balance };
    }
});