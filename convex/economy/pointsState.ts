/**
 * Primitivas del estado de economía, extraídas de `convex/economy.ts` para que
 * el motor de puntos (`pointsEngine.ts`) pueda usarlas sin importar de vuelta
 * `economy.ts` — eso sería un ciclo. La dirección de dependencias queda:
 *
 *   economy.ts  →  pointsEngine.ts  →  pointsState.ts
 *
 * Nada de esto cambió de semántica al moverse; son las mismas funciones.
 */

export const todayKey = () => new Date().toISOString().slice(0, 10);

export const weekKey = () => {
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${week}`;
};

export const quarterKey = () => {
    const d = new Date();
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `${d.getFullYear()}-Q${q}`;
};

// Define the default pet / points state (single source of truth)
export const DEFAULT_PET_STATE = {
    gameCoins: 100,
    points: 0,
    /** Cumulative earn lifetime — used for membership tiers (does not decrease on redeem). */
    lifetimePoints: 0,
    loginStreak: 0,
    dailyClaimDate: null as string | null,
    wheelClaimDate: null as string | null,
    petStats: { happiness: 80, hunger: 60, energy: 70, level: 1, exp: 0 },
    petConfig: { activeHat: 'none', unlockedHats: ['none'] },
    challenges: {
        daily_browse: { current: 0, claimed: false, dayKey: '' },
        weekly_purchase: { current: 0, claimed: false, weekKey: '' },
        quarterly_mission: { current: 0, claimed: false, quarterKey: '' },
    },
};

export function normalizeChallenges(raw: any) {
    const day = todayKey();
    const week = weekKey();
    const quarter = quarterKey();
    const browse = raw?.daily_browse ?? {};
    const purchase = raw?.weekly_purchase ?? {};
    const quarterly = raw?.quarterly_mission ?? {};
    return {
        daily_browse: {
            current: browse.dayKey === day ? (browse.current || 0) : 0,
            claimed: browse.dayKey === day ? !!browse.claimed : false,
            dayKey: browse.dayKey === day ? day : '',
        },
        weekly_purchase: {
            current: purchase.weekKey === week ? (purchase.current || 0) : 0,
            claimed: purchase.weekKey === week ? !!purchase.claimed : false,
            weekKey: purchase.weekKey === week ? week : '',
        },
        quarterly_mission: {
            current: quarterly.quarterKey === quarter ? (quarterly.current || 0) : 0,
            claimed: quarterly.quarterKey === quarter ? !!quarterly.claimed : false,
            quarterKey: quarterly.quarterKey === quarter ? quarter : '',
        },
    };
}

/** Merge partial/legacy rewardsState with defaults so UI never sees undefined coins/challenges. */
export function hydrateRewardsState(raw: any) {
    const base = { ...DEFAULT_PET_STATE, ...(raw || {}) };
    return {
        ...base,
        // ponytail: typeof NaN === 'number' — use isFinite
        gameCoins: Number.isFinite(base.gameCoins) ? base.gameCoins : DEFAULT_PET_STATE.gameCoins,
        points: Number.isFinite(base.points) ? base.points : 0,
        lifetimePoints: Number.isFinite(base.lifetimePoints)
            ? base.lifetimePoints
            : (Number.isFinite(base.points) ? base.points : 0),
        loginStreak: Number.isFinite(base.loginStreak) ? base.loginStreak : 0,
        dailyClaimDate: base.dailyClaimDate ?? null,
        wheelClaimDate: base.wheelClaimDate ?? null,
        petStats: { ...DEFAULT_PET_STATE.petStats, ...(base.petStats || {}) },
        petConfig: {
            activeHat: base.petConfig?.activeHat || 'none',
            unlockedHats: Array.isArray(base.petConfig?.unlockedHats)
                ? base.petConfig.unlockedHats
                : ['none'],
        },
        challenges: normalizeChallenges(base.challenges),
    };
}

export async function ensureEconomyState(ctx: any, args: { userId: string }) {
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
    } else {
        // Backfill missing fields without wiping progress
        const hydrated = hydrateRewardsState(state.rewardsState);
        const needsPatch =
            state.rewardsState.challenges == null ||
            state.rewardsState.petConfig == null ||
            !Number.isFinite(state.rewardsState.gameCoins) ||
            !Number.isFinite(state.rewardsState.points);
        if (needsPatch) {
            await ctx.db.patch(state._id, {
                rewardsState: hydrated,
                updatedAt: new Date().toISOString(),
            });
            state = await ctx.db.get(state._id);
        } else {
            state = { ...state, rewardsState: hydrated };
        }
    }
    return state;
}
