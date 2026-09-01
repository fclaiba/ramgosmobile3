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
import {
    decoratePetState,
    EGG_CARE_BOOST,
    EGG_DAILY_LOGIN_BOOST,
    hatchEgg,
    isEggStage,
    settlePetState,
} from './economy/petLifecycle';



/**
 * Las reglas económicas viven en `economy/_rewardRules.ts`, que es el mismo
 * módulo que importan los contextos de React. Antes estaban duplicadas acá y
 * allá, y se habían desincronizado: el frontend mostraba 5 puntos por referido
 * mientras esto acreditaba 500.
 */
import {
    ARCADE_MAX_PER_DAY,
    ARCADE_POINTS_RANGE,
    bonusMultiplierFor,
    DAILY_LOGIN_POINTS,
    PET_DAILY_CARE_POINTS,
    POINT_VALUE_USD,
    POINTS_PER_USD,
    rollPoints,
    rollWheelPrize,
    STREAK_MILESTONE_REWARDS,
} from './economy/_rewardRules';

export { POINTS_PER_USD };

const purchaseBonusMultiplier = bonusMultiplierFor;

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

        // Las queries no escriben, así que la liquidación se calcula en memoria:
        // el usuario SIEMPRE ve el estado correcto para el reloj de ahora, y la
        // versión persistida se pone al día en la próxima mutation. Sin esto la
        // mascota se vería congelada hasta que el usuario tocara algo.
        const now = Date.now();
        const settled = settlePetState(hydrateRewardsState(state.rewardsState), now);
        return decoratePetState(settled.state, now);
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

/**
 * Carga el estado ya puesto al día contra el reloj.
 *
 * Toda mutation que toque la mascota tiene que entrar por acá: el desgaste y la
 * incubación se derivan de timestamps (ver `economy/petLifecycle.ts`), así que
 * "poner al día" es justamente lo que hace que el tiempo exista para la
 * mascota. Es idempotente dentro de la misma transacción: la segunda llamada no
 * encuentra horas nuevas que liquidar.
 */
async function settleAndLoad(ctx: any, userId: string) {
    const doc = await ensureEconomyState(ctx, { userId });
    const hydrated = hydrateRewardsState(doc!.rewardsState);
    const { state, changed, hatched } = settlePetState(hydrated, Date.now());

    if (changed) {
        await ctx.db.patch(doc!._id, {
            rewardsState: state,
            updatedAt: new Date().toISOString(),
        });
    }

    return { doc: doc!, state, hatched };
}

async function internalUpdatePetState(ctx: any, args: { userId: string; updates: any }) {
    const { doc, state } = await settleAndLoad(ctx, args.userId);
    const newState = { ...state, petStats: { ...state.petStats, ...args.updates } };

    await ctx.db.patch(doc._id, {
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
    const { doc: state, state: currentState } = await settleAndLoad(ctx, args.userId);

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
    const { doc: state, state: currentState } = await settleAndLoad(ctx, args.userId);

    // El huevo eclosiona al juntar 100 puntos de juego, pero NO leyendo el
    // saldo `gameCoins` — ese arranca en 100 por defecto y se gasta/recarga
    // todo el tiempo, así que usarlo directo rompía el huevo con la primera
    // moneda ganada (por eso existe `eggCoinsEarned`: sólo sube acá, sólo
    // mientras es huevo, con tope 100; ver `economy/petLifecycle.ts`).
    const newState = {
        ...currentState,
        gameCoins: currentState.gameCoins + args.amount,
        ...(isEggStage(currentState)
            ? { eggCoinsEarned: Math.min(100, (currentState.eggCoinsEarned || 0) + args.amount) }
            : {}),
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

/**
 * Abre el huevo cuando ya juntó los 100 puntos de juego. Es una acción
 * explícita del usuario (botón "Abrir huevo"), no algo que pase solo al
 * llegar a 100 — ver `hatchEgg` en `economy/petLifecycle.ts`.
 */
export const openEgg = mutation({
    args: { sessionToken: v.optional(v.string()), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const { doc, state } = await settleAndLoad(ctx, args.userId);
        const result = hatchEgg(state, Date.now());
        if (!result.hatched) {
            return { status: 'error', message: 'Todavía no juntaste los 100 puntos del huevo' };
        }

        await ctx.db.patch(doc._id, {
            rewardsState: result.state,
            updatedAt: new Date().toISOString(),
        });
        return { status: 'awarded', message: '¡Tu mascota nació! 🐣', state: result.state };
    },
});

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

        // Cuidado diario de la mascota: reusa el mismo catálogo/idempotencia
        // que `claimReward('pet_daily_care')`, así que da lo mismo cuántas
        // veces se alimente en el día — sólo se acredita la primera.
        const petCareDef = REWARD_CATALOG.pet_daily_care;
        const careAward = await awardPoints(ctx, {
            userId: args.userId,
            eventKey: buildEventKey('pet_daily_care', 'default'),
            amount: petCareDef.points as number,
            description: petCareDef.description,
            source: petCareDef.source,
            metadata: { kind: 'pet_daily_care', refId: 'default' },
            dailyCapKind: 'pet_daily_care',
            dailyCapMax: petCareDef.dailyMax,
        });

        return {
            status: 'awarded',
            message: 'Mascota alimentada!',
            state: newState,
            pointsAwarded: careAward.awarded,
        };
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

        // El baño ahora sube `hygiene`, el stat que decae solo y que, cuando
        // está bajo, acelera la caída de felicidad. Antes sólo sumaba felicidad
        // directo, así que bañarla era redundante con jugar.
        const newState = await internalUpdatePetState(ctx, {
            userId: args.userId,
            updates: {
                hygiene: Math.min(100, (res.state!.petStats.hygiene ?? 80) + 40),
                happiness: Math.min(100, res.state!.petStats.happiness + 5),
                exp: (res.state!.petStats.exp || 0) + 20,
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

        // Sobre el huevo esta acción es "dar calor": suma progreso secundario
        // en vez de jugar. Un huevo no tiene energía que gastar ni felicidad
        // que subir, pero sí es un cuidado que admite. El driver principal
        // para eclosionar son los puntos de juego (`eggCoinsEarned` en
        // `internalAddCoins`); esto sólo acelera un poco — nunca hace
        // eclosionar solo, eso requiere tocar "Abrir huevo".
        if (isEggStage(spent.state)) {
            const { doc, state } = await settleAndLoad(ctx, args.userId);
            const boosted = {
                ...state,
                eggCareBoost: Math.min(100, (state.eggCareBoost || 0) + EGG_CARE_BOOST),
            };
            const settled = settlePetState(boosted, Date.now());
            await ctx.db.patch(doc._id, {
                rewardsState: settled.state,
                updatedAt: new Date().toISOString(),
            });
            return {
                status: 'awarded',
                message: 'Le diste calor al huevo 🔥',
                state: settled.state,
            };
        }

        const energy = spent.state!.petStats.energy;
        if (energy < 15) {
            // refund coins if too tired
            await internalAddCoins(ctx, { userId: args.userId, amount: cost, reason: 'Refund juego' });
            return { status: 'error', message: 'La mascota esta muy cansada para jugar.' };
        }

        const newState = await internalUpdatePetState(ctx, {
            userId: args.userId,
            updates: {
                happiness: Math.min(100, spent.state!.petStats.happiness + 20),
                energy: Math.max(0, spent.state!.petStats.energy - 15),
                exp: (spent.state!.petStats.exp || 0) + 25,
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
        points: PET_DAILY_CARE_POINTS,
        source: 'bonus',
        description: 'Cuidado diario de mascota virtual',
        dailyMax: 1,
    },
    /**
     * Recompensa de arcade. Se SORTEA en el servidor dentro de 1–20, que es el
     * rango que publican los términos.
     *
     * Antes era un valor plano de 10 para cerrar un agujero: el puntaje lo
     * reporta el cliente, así que derivar los puntos del puntaje deja el monto
     * en manos del cliente. Sortearlo cumple lo prometido sin reabrir eso —
     * el cliente sigue sin poder influir en la cifra. Tope diario de 3.
     */
    arcade_play: {
        points: () => rollPoints(ARCADE_POINTS_RANGE),
        source: 'game',
        description: 'Recompensa de arcade',
        dailyMax: ARCADE_MAX_PER_DAY,
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

        // Uno de los 8 gajos exactos, nunca "cualquier entero 5-50" — así el
        // gajo donde frena la rueda (cliente) coincide siempre con esto.
        const pointsAwarded = rollWheelPrize();

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

        const discountUsd = amount * POINT_VALUE_USD;
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

        const reward = DAILY_LOGIN_POINTS;
        const loginStreak = (hydrateRewardsState(doc.rewardsState).loginStreak || 0) + 1;

        // Pasa por awardPoints (motor único): acredita `points` Y `lifetimePoints`
        // e inserta el ledger de forma idempotente. Antes se patcheaba `points` a
        // mano sin tocar `lifetimePoints`, así que la racha diaria subía el número
        // grande pero la barra de progreso —que mide el acumulado— no se movía.
        const outcome = await awardPoints(ctx, {
            userId: args.userId,
            eventKey: `daily_${todayKey}`,
            type: 'earn',
            source: 'bonus',
            amount: reward,
            description: `Racha diaria - Dia ${loginStreak}`,
        });

        if (outcome.reason === 'duplicate') {
            return { success: false, message: 'Ya reclamaste hoy' };
        }

        // Relectura obligatoria: awardPoints reescribe rewardsState completo, así
        // que el patch de la racha tiene que ir sobre el estado ya acreditado.
        const afterAward = await ensureEconomyState(ctx, { userId: args.userId });
        const settledState = hydrateRewardsState(afterAward!.rewardsState);

        // Entrar todos los días acelera la incubación: es la promesa que el
        // modal de guía venía haciendo desde siempre sin que el código la
        // cumpliera (la racha no se leía en ninguna parte).
        const withStreak = {
            ...settledState,
            loginStreak,
            dailyClaimDate: todayKey,
            ...(isEggStage(settledState)
                ? { eggCareBoost: Math.min(100, (settledState.eggCareBoost || 0) + EGG_DAILY_LOGIN_BOOST) }
                : {}),
        };
        const settled = settlePetState(withStreak, Date.now());

        await ctx.db.patch(afterAward!._id, {
            rewardsState: settled.state,
            updatedAt: new Date().toISOString(),
        });

        await ctx.db.insert('rewardsClaims', {
            userId: args.userId,
            claimKey: `daily_${todayKey}`,
            type: 'daily_login',
            pointsAwarded: outcome.awarded,
            claimedAt: new Date().toISOString(),
        });

        // `outcome.balance` YA es el saldo posterior a la acreditación.
        return { success: true, points: outcome.balance, loginStreak };
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
            const reward = CHALLENGE_DEFS.daily_login.reward;
            const loginStreak = (hydrateRewardsState(doc!.rewardsState).loginStreak || 0) + 1;

            // Mismo motor y mismo eventKey que claimDailyReward: los dos caminos
            // acreditan la racha del día, así que comparten idempotencia.
            const outcome = await awardPoints(ctx, {
                userId: args.userId,
                eventKey: `daily_${today}`,
                type: 'earn',
                source: 'bonus',
                amount: reward,
                description: `Racha diaria - Dia ${loginStreak}`,
            });

            if (outcome.reason === 'duplicate') {
                return { success: false, message: 'Ya reclamaste hoy' };
            }

            const afterAward = await ensureEconomyState(ctx, { userId: args.userId });
            const settledState = hydrateRewardsState(afterAward!.rewardsState);
            await ctx.db.patch(afterAward!._id, {
                rewardsState: {
                    ...settledState,
                    loginStreak,
                    dailyClaimDate: today,
                    challenges: normalizeChallenges(settledState.challenges),
                },
                updatedAt: new Date().toISOString(),
            });

            await ctx.db.insert('rewardsClaims', {
                userId: args.userId,
                claimKey: `daily_${today}`,
                type: 'daily_login',
                pointsAwarded: outcome.awarded,
                claimedAt: new Date().toISOString(),
            });
            return { success: true, points: outcome.balance, reward };
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