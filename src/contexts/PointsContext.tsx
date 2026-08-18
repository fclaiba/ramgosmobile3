import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

export const DISCOUNT_TIERS = [
    { minPoints: 0, label: 'Bronce', bonusMultiplier: 0, perks: ['Acceso básico'] },
    { minPoints: 100, label: 'Plata', bonusMultiplier: 0.05, perks: ['5% extra', 'Soporte prioritario'] },
    { minPoints: 500, label: 'Oro', bonusMultiplier: 0.10, perks: ['10% extra', 'Soporte VIP', 'Envíos gratis'] },
    { minPoints: 1000, label: 'Élite', bonusMultiplier: 0.20, perks: ['20% extra', 'Conserje personal', 'Envíos gratis', 'Regalos'] },
];

export interface MembershipTier {
    id: string;
    label: string;
    minPoints: number;
    bonusMultiplier: number;
    perks: string[];
}

export const MEMBERSHIP_TIERS: MembershipTier[] = [
    { id: 'bronze', label: 'Bronze', minPoints: 0, bonusMultiplier: 0, perks: ['Acceso básico'] },
    { id: 'silver', label: 'Silver', minPoints: 1000, bonusMultiplier: 0.05, perks: ['+5% puntos extra por compra'] },
    { id: 'gold', label: 'Gold', minPoints: 5000, bonusMultiplier: 0.10, perks: ['+10% puntos extra', 'Sorteos VIP'] },
    { id: 'platinum', label: 'Platinum', minPoints: 15000, bonusMultiplier: 0.15, perks: ['+15% puntos extra', 'Envíos selectos gratis'] },
];

export type DailyChallenge = {
    id: string;
    type: 'daily' | 'weekly' | 'special';
    title: string;
    description: string;
    reward: number;
    target: number;
    current: number;
    claimed: boolean;
    icon?: string;
};

const CHALLENGE_META: Omit<DailyChallenge, 'current' | 'claimed'>[] = [
    { id: 'daily_login', type: 'daily', title: 'Inicia sesión', description: 'Conéctate cada día para mantener tu racha.', reward: 10, target: 1, icon: 'login' },
    { id: 'daily_browse', type: 'daily', title: 'Explora el marketplace', description: 'Visita 3 productos del marketplace.', reward: 5, target: 3, icon: 'purchase' },
    { id: 'weekly_purchase', type: 'weekly', title: 'Realiza una compra', description: 'Completa una compra esta semana para ganar puntos extra.', reward: 25, target: 1, icon: 'purchase' },
];


type PetStats = { happiness: number; hunger: number; energy: number; level: number; exp: number };
type PetConfig = { activeHat: string; unlockedHats: string[] };

type PointsContextValue = {
    points: number;
    lifetimePoints: number;
    gameCoins: number;
    petStats: PetStats;
    petConfig: PetConfig;
    transactions: any[];
    lastEarnTransactionId: string | null;
    currentTier: (typeof DISCOUNT_TIERS)[number];
    nextTier: (typeof DISCOUNT_TIERS)[number] | null;
    challengeProgress: { loginStreak: number; dailyClaimDate: string | null };
    wheelClaimDate: string | null;
    conversionRate: number;
    convertCoinsToPoints: (coins: number) => Promise<{
        success: boolean;
        earnedPoints?: number;
        gameCoins?: number;
        message?: string;
    }>;
    claimDailyReward: () => Promise<boolean>;
    claimChallenge: (id: string) => Promise<boolean>;
    progressChallenge: (id: string, increment?: number) => Promise<boolean>;
    spinLuckyWheel: () => Promise<{
        success: boolean;
        alreadyClaimed?: boolean;
        pointsAwarded?: number;
        message?: string;
    }>;
    addGameCoins: (amount: number, reason?: string) => Promise<boolean>;
    spendGameCoins: (amount: number, reason?: string) => Promise<boolean>;
    redeemPoints: (
        pointsToRedeem: number,
        orderId?: string,
    ) => Promise<{ success: boolean; discountUsd?: number; pointsSpent?: number; message?: string }>;
    feedPet: () => Promise<{ success: boolean; message: string }>;
    sleepPet: () => Promise<{ success: boolean; message: string }>;
    cleanPet: () => Promise<{ success: boolean; message: string }>;
    playPet: () => Promise<{ success: boolean; message: string }>;
    unlockHat: (id: string, cost: number) => Promise<boolean>;
    equipHat: (id: string) => Promise<void>;
    updatePetState: (updates: Partial<PetStats>) => Promise<boolean>;
    challenges: DailyChallenge[];
    quarterlyMission: { claimed: boolean; reward: number; purchasesCurrent: number; purchasesTarget: number };
    ready: boolean;
};

const DEFAULT_PET_STATS: PetStats = { happiness: 80, hunger: 60, energy: 70, level: 1, exp: 0 };
const DEFAULT_PET_CONFIG: PetConfig = { activeHat: 'none', unlockedHats: ['none'] };

const DEFAULT_CONTEXT: PointsContextValue = {
    points: 0,
    lifetimePoints: 0,
    gameCoins: 0,
    petStats: DEFAULT_PET_STATS,
    petConfig: DEFAULT_PET_CONFIG,
    transactions: [],
    lastEarnTransactionId: null,
    currentTier: DISCOUNT_TIERS[0],
    nextTier: DISCOUNT_TIERS[1],
    challengeProgress: { loginStreak: 0, dailyClaimDate: null },
    wheelClaimDate: null,
    conversionRate: 5,
    convertCoinsToPoints: async () => ({ success: false, message: 'Sin sesión' }),
    claimDailyReward: async () => false,
    claimChallenge: async () => false,
    progressChallenge: async () => false,
    spinLuckyWheel: async () => ({ success: false, message: 'Sin sesión' }),
    addGameCoins: async () => false,
    spendGameCoins: async () => false,
    redeemPoints: async () => ({ success: false, message: 'Sin sesión' }),
    feedPet: async () => ({ success: false, message: 'Sin sesión' }),
    sleepPet: async () => ({ success: false, message: 'Sin sesión' }),
    cleanPet: async () => ({ success: false, message: 'Sin sesión' }),
    playPet: async () => ({ success: false, message: 'Sin sesión' }),
    unlockHat: async () => false,
    equipHat: async () => {},
    updatePetState: async () => false,
    challenges: CHALLENGE_META.map((c) => ({ ...c, current: 0, claimed: false })),
    quarterlyMission: { claimed: false, reward: 150, purchasesCurrent: 0, purchasesTarget: 3 },
    ready: false,
};

const PointsContext = createContext<PointsContextValue | null>(null);

export function PointsProvider({ children }: { children: React.ReactNode }) {
    const { user, sessionToken } = useAuth();
    const userId = user?.id;
    const queryArgs = userId && sessionToken ? { sessionToken, userId } : 'skip';

    const economyState = useQuery(api.economy.getEconomyState, queryArgs);
    const pointsHistory = useQuery(api.economy.getPointsHistory, queryArgs);

    const initializeEconomy = useMutation(api.economy.initializeEconomy);
    const convertMutation = useMutation(api.economy.convertCoinsToPoints);
    const claimDailyMutation = useMutation(api.economy.claimDailyReward);
    const claimChallengeMutation = useMutation(api.economy.claimChallenge);
    const progressChallengeMutation = useMutation(api.economy.progressChallenge);
    const spinWheelMutation = useMutation(api.economy.spinLuckyWheel);
    const redeemPointsMutation = useMutation(api.economy.redeemPoints);
    const addCoinsMutation = useMutation(api.economy.addCoins);
    const spendCoinsMutation = useMutation(api.economy.spendCoins);
    const feedMutation = useMutation(api.economy.feedVirtualPet);
    const sleepMutation = useMutation(api.economy.sleepVirtualPet);
    const cleanMutation = useMutation(api.economy.cleanVirtualPet);
    const playMutation = useMutation(api.economy.playVirtualPet);
    const unlockHatMutation = useMutation(api.economy.unlockAccessory);
    const equipHatMutation = useMutation(api.economy.equipAccessory);
    const updatePetStateMutation = useMutation(api.economy.updatePetState);

    React.useEffect(() => {
        if (userId && sessionToken && economyState === null) {
            initializeEconomy({ sessionToken, userId }).catch(console.error);
        }
    }, [userId, sessionToken, economyState, initializeEconomy]);

    // ponytail: guard NaN from bad Convex payloads
    const points = Number.isFinite(economyState?.points) ? (economyState!.points as number) : 0;
    const lifetimePoints = Number.isFinite(economyState?.lifetimePoints)
        ? (economyState!.lifetimePoints as number)
        : points;
    const gameCoins = Number.isFinite(economyState?.gameCoins)
        ? (economyState!.gameCoins as number)
        : 0;
    const loginStreak = economyState?.loginStreak ?? 0;
    const dailyClaimDate: string | null = economyState?.dailyClaimDate ?? null;
    const wheelClaimDate: string | null = economyState?.wheelClaimDate ?? null;
    const petStats: PetStats = economyState?.petStats ?? DEFAULT_PET_STATS;
    const petConfig: PetConfig = economyState?.petConfig ?? DEFAULT_PET_CONFIG;
    const challengeState = economyState?.challenges;

    let currentTier = DISCOUNT_TIERS[0];
    let nextTier: (typeof DISCOUNT_TIERS)[number] | null = DISCOUNT_TIERS[1];
    for (let i = 0; i < DISCOUNT_TIERS.length; i++) {
        if (points >= DISCOUNT_TIERS[i].minPoints) {
            currentTier = DISCOUNT_TIERS[i];
            nextTier = DISCOUNT_TIERS[i + 1] || null;
        }
    }

    const transactions = useMemo(
        () =>
            (pointsHistory || []).map((entry: any) => ({
                id: entry._id,
                type: entry.type,
                amount: entry.amount,
                description: entry.description,
                date: entry.createdAt,
                source: entry.source,
            })),
        [pointsHistory],
    );

    const todayKey = new Date().toISOString().slice(0, 10);
    const challenges: DailyChallenge[] = useMemo(() => {
        return CHALLENGE_META.map((meta) => {
            if (meta.id === 'daily_login') {
                return {
                    ...meta,
                    current: 1,
                    claimed: dailyClaimDate === todayKey,
                };
            }
            const prog = challengeState?.[meta.id as 'daily_browse' | 'weekly_purchase'];
            return {
                ...meta,
                current: prog?.current ?? 0,
                claimed: !!prog?.claimed,
            };
        });
    }, [challengeState, dailyClaimDate, todayKey]);

    const quarterlyMission = useMemo(() => {
        const prog = challengeState?.quarterly_mission;
        return {
            claimed: !!prog?.claimed,
            reward: 150,
            purchasesCurrent: prog?.current ?? 0,
            purchasesTarget: 3,
        };
    }, [challengeState]);

    const convertCoinsToPoints = useCallback(
        async (coinsToConvert: number) => {
            if (!userId || !sessionToken) return { success: false, message: 'Sin sesión' };
            try {
                const result = await convertMutation({ sessionToken, userId, coinsToConvert });
                return {
                    success: !!result?.success,
                    earnedPoints: result?.earnedPoints,
                    gameCoins: result?.state?.gameCoins,
                    message: result?.message,
                };
            } catch (e: any) {
                return { success: false, message: e?.message ?? 'Error al convertir' };
            }
        },
        [convertMutation, sessionToken, userId],
    );

    const claimDailyReward = useCallback(async () => {
        if (!userId || !sessionToken) return false;
        try {
            const result = await claimDailyMutation({ sessionToken, userId });
            return !!result?.success;
        } catch (e) {
            console.error('[Points] claimDailyReward', e);
            return false;
        }
    }, [claimDailyMutation, sessionToken, userId]);

    const claimChallenge = useCallback(
        async (challengeId: string) => {
            if (!userId || !sessionToken) return false;
            try {
                const result = await claimChallengeMutation({ sessionToken, userId, challengeId });
                return !!result?.success;
            } catch (e) {
                console.error('[Points] claimChallenge', e);
                return false;
            }
        },
        [claimChallengeMutation, sessionToken, userId],
    );

    const progressChallenge = useCallback(
        async (challengeId: string, increment = 1) => {
            if (!userId || !sessionToken) return false;
            try {
                const result = await progressChallengeMutation({
                    sessionToken,
                    userId,
                    challengeId,
                    increment,
                });
                return !!result?.success;
            } catch (e) {
                console.error('[Points] progressChallenge', e);
                return false;
            }
        },
        [progressChallengeMutation, sessionToken, userId],
    );

    const spinLuckyWheel = useCallback(async () => {
        if (!userId || !sessionToken) return { success: false, message: 'Sin sesión' };
        try {
            const result = await spinWheelMutation({ sessionToken, userId });
            return {
                success: !!result?.success,
                alreadyClaimed: !!result?.alreadyClaimed,
                pointsAwarded: result?.pointsAwarded,
                message: result?.message,
            };
        } catch (e: any) {
            console.error('[Points] spinLuckyWheel', e);
            return { success: false, message: e?.message ?? 'Error al girar' };
        }
    }, [sessionToken, spinWheelMutation, userId]);

    const redeemPoints = useCallback(
        async (pointsToRedeem: number, orderId?: string) => {
            if (!userId || !sessionToken) return { success: false, message: 'Sin sesión' };
            try {
                const result = await redeemPointsMutation({
                    sessionToken,
                    userId,
                    pointsToRedeem,
                    orderId,
                });
                return {
                    success: !!result?.success,
                    discountUsd: result?.discountUsd,
                    pointsSpent: result?.pointsSpent,
                    message: result?.message,
                };
            } catch (e: any) {
                console.error('[Points] redeemPoints', e);
                return { success: false, message: e?.message ?? 'Error al canjear' };
            }
        },
        [redeemPointsMutation, sessionToken, userId],
    );

    const addGameCoins = useCallback(
        async (amount: number, reason = 'arcade_reward') => {
            if (!userId || !sessionToken || amount <= 0) return false;
            try {
                await addCoinsMutation({ sessionToken, userId, amount, reason });
                return true;
            } catch {
                return false;
            }
        },
        [addCoinsMutation, sessionToken, userId],
    );

    const spendGameCoins = useCallback(
        async (amount: number, reason = 'game_spend') => {
            if (!userId || !sessionToken || amount <= 0) return false;
            try {
                const result = await spendCoinsMutation({ sessionToken, userId, amount, reason });
                return !!result?.success;
            } catch {
                return false;
            }
        },
        [spendCoinsMutation, sessionToken, userId],
    );

    const runPet = useCallback(
        async (fn: (args: { sessionToken: string; userId: string }) => Promise<any>) => {
            if (!userId || !sessionToken) return { success: false, message: 'Sin sesión' };
            try {
                const result = await fn({ sessionToken, userId });
                if (result?.status === 'error' || result?.status === 'already_claimed') {
                    return { success: false, message: result.message || 'No se pudo completar' };
                }
                return { success: true, message: result?.message || 'OK' };
            } catch (e: any) {
                return { success: false, message: e?.message ?? 'Error' };
            }
        },
        [sessionToken, userId],
    );

    const feedPet = useCallback(() => runPet((a) => feedMutation(a)), [feedMutation, runPet]);
    const sleepPet = useCallback(() => runPet((a) => sleepMutation(a)), [runPet, sleepMutation]);
    const cleanPet = useCallback(() => runPet((a) => cleanMutation(a)), [cleanMutation, runPet]);
    const playPet = useCallback(() => runPet((a) => playMutation(a)), [playMutation, runPet]);

    const unlockHat = useCallback(
        async (id: string, cost: number) => {
            if (!userId || !sessionToken) return false;
            try {
                return !!(await unlockHatMutation({
                    sessionToken,
                    userId,
                    type: 'hat',
                    id,
                    cost,
                }));
            } catch {
                return false;
            }
        },
        [sessionToken, unlockHatMutation, userId],
    );

    const equipHat = useCallback(
        async (id: string) => {
            if (!userId || !sessionToken) return;
            try {
                await equipHatMutation({ sessionToken, userId, type: 'hat', id });
            } catch (e) {
                console.error(e);
            }
        },
        [equipHatMutation, sessionToken, userId],
    );

    const updatePetState = useCallback(
        async (updates: Partial<PetStats>) => {
            if (!userId || !sessionToken) return false;
            try {
                await updatePetStateMutation({ sessionToken, userId, updates });
                return true;
            } catch (e) {
                console.error(e);
                return false;
            }
        },
        [updatePetStateMutation, sessionToken, userId],
    );

    const lastEarnTransactionId =
        transactions.find((t) => t.type === 'earn' || t.type === 'convert' || t.type === 'challenge')?.id ?? null;

    const value = useMemo<PointsContextValue>(
        () => ({
            points,
            lifetimePoints,
            gameCoins,
            petStats,
            petConfig,
            transactions,
            lastEarnTransactionId,
            currentTier,
            nextTier,
            challengeProgress: { loginStreak, dailyClaimDate },
            wheelClaimDate,
            conversionRate: 5,
            convertCoinsToPoints,
            claimDailyReward,
            claimChallenge,
            progressChallenge,
            spinLuckyWheel,
            addGameCoins,
            spendGameCoins,
            redeemPoints,
            feedPet,
            sleepPet,
            cleanPet,
            playPet,
            unlockHat,
            equipHat,
            updatePetState,
            challenges,
            quarterlyMission,
            ready: economyState !== undefined,
        }),
        [
            points,
            lifetimePoints,
            gameCoins,
            petStats,
            petConfig,
            transactions,
            lastEarnTransactionId,
            currentTier,
            nextTier,
            loginStreak,
            dailyClaimDate,
            wheelClaimDate,
            convertCoinsToPoints,
            claimDailyReward,
            claimChallenge,
            progressChallenge,
            spinLuckyWheel,
            addGameCoins,
            spendGameCoins,
            redeemPoints,
            feedPet,
            sleepPet,
            cleanPet,
            playPet,
            unlockHat,
            equipHat,
            challenges,
            quarterlyMission,
        ],
    );

    return (
        <PointsContext.Provider value={value}>
            {children}
        </PointsContext.Provider>
    );
}

export function usePoints() {
    return useContext(PointsContext) ?? DEFAULT_CONTEXT;
}
