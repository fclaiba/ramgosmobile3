import React, { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

export const DISCOUNT_TIERS = [
    { minPoints: 0,    label: 'Bronce', bonusMultiplier: 0, perks: ['Acceso básico'] },
    { minPoints: 100,  label: 'Plata',  bonusMultiplier: 0.05, perks: ['5% extra', 'Soporte prioritario'] },
    { minPoints: 500,  label: 'Oro',    bonusMultiplier: 0.10, perks: ['10% extra', 'Soporte VIP', 'Envíos gratis'] },
    { minPoints: 1000, label: 'Élite',  bonusMultiplier: 0.20, perks: ['20% extra', 'Conserje personal', 'Envíos gratis', 'Regalos'] },
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

const DEFAULT_CHALLENGES: DailyChallenge[] = [
    { id: 'daily_login', type: 'daily', title: 'Inicia sesión', description: 'Conéctate cada día para mantener tu racha.', reward: 10, target: 1, current: 1, claimed: false, icon: 'login' },
    { id: 'daily_browse', type: 'daily', title: 'Explora el marketplace', description: 'Visita 3 productos del marketplace.', reward: 5, target: 3, current: 0, claimed: false, icon: 'purchase' },
    { id: 'weekly_purchase', type: 'weekly', title: 'Realiza una compra', description: 'Completa una compra esta semana para ganar puntos extra.', reward: 25, target: 1, current: 0, claimed: false, icon: 'purchase' },
];

const DEFAULT_CONTEXT = {
    points: 0,
    lifetimePoints: 0,
    transactions: [] as any[],
    currentTier: DISCOUNT_TIERS[0],
    nextTier: DISCOUNT_TIERS[1],
    challengeProgress: { loginStreak: 0, dailyClaimDate: null as string | null },
    conversionRate: 5,
    convertCoinsToPoints: (_coins: number) => Promise.resolve(),
    claimDailyReward: () => Promise.resolve(false),
    claimChallenge: (_id: string) => Promise.resolve(false),
    redeemPoints: () => {},
    challenges: DEFAULT_CHALLENGES,
};

const PointsContext = createContext<any>(null);

export function PointsProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();

    // Hooks SIEMPRE al mismo nivel — nunca después de un return condicional
    const economyState = useQuery(
        api.economy.getEconomyState,
        user?.id ? { userId: user.id } : 'skip'
    );
    const pointsHistory = useQuery(
        api.economy.getPointsHistory,
        user?.id ? { userId: user.id } : 'skip'
    );
    const initializeEconomy = useMutation(api.economy.initializeEconomy);
    const convertMutation = useMutation(api.economy.convertCoinsToPoints);
    const claimDailyMutation = useMutation(api.economy.claimDailyReward);
    const addPointsMutation = useMutation(api.economy.addPoints);

    // Initialize economy when user logs in and query returns null (no doc yet)
    React.useEffect(() => {
        if (user?.id && economyState === null) {
            initializeEconomy({ userId: user.id }).catch(console.error);
        }
    }, [user?.id, economyState, initializeEconomy]);

    // Sin usuario → defaults
    if (!user?.id) {
        return (
            <PointsContext.Provider value={DEFAULT_CONTEXT}>
                {children}
            </PointsContext.Provider>
        );
    }

    const points = economyState?.points ?? 0;
    const loginStreak = economyState?.loginStreak ?? 0;
    const dailyClaimDate: string | null = economyState?.dailyClaimDate ?? null;

    // Tiers
    let currentTier = DISCOUNT_TIERS[0];
    let nextTier: typeof DISCOUNT_TIERS[0] | null = DISCOUNT_TIERS[1];
    for (let i = 0; i < DISCOUNT_TIERS.length; i++) {
        if (points >= DISCOUNT_TIERS[i].minPoints) {
            currentTier = DISCOUNT_TIERS[i];
            nextTier = DISCOUNT_TIERS[i + 1] || null;
        }
    }

    // Transactions from ledger
    const transactions = (pointsHistory || []).map((entry: any) => ({
        id: entry._id,
        type: entry.type,
        amount: entry.amount,
        description: entry.description,
        date: entry.createdAt,
        source: entry.source,
    }));

    const convertCoinsToPoints = async (costInCoins: number) => {
        try {
            await convertMutation({ userId: user.id, coinsToConvert: costInCoins });
        } catch (e) {
            console.error('Failed to convert coins:', e);
        }
    };

    const claimDailyReward = async (): Promise<boolean> => {
        try {
            const result = await claimDailyMutation({ userId: user.id });
            return result?.success || false;
        } catch (e) {
            console.error('Failed to claim daily:', e);
            return false;
        }
    };

    // Claim a challenge: award its points via addPoints mutation
    const claimChallenge = async (challengeId: string): Promise<boolean> => {
        const challenge = DEFAULT_CHALLENGES.find(c => c.id === challengeId);
        if (!challenge) return false;
        if (challenge.claimed) return false;

        try {
            await addPointsMutation({
                userId: user.id,
                amount: challenge.reward,
                description: `Desafío: ${challenge.title}`,
                source: 'bonus',
            });
            return true;
        } catch (e) {
            console.error('Failed to claim challenge:', e);
            return false;
        }
    };

    // Enrich challenges with daily claim status
    const todayKey = new Date().toISOString().slice(0, 10);
    const challenges = DEFAULT_CHALLENGES.map(c => {
        if (c.id === 'daily_login') {
            return { ...c, current: 1, claimed: dailyClaimDate === todayKey };
        }
        return c;
    });

    return (
        <PointsContext.Provider value={{
            points,
            lifetimePoints: points,
            transactions,
            currentTier,
            nextTier,
            challengeProgress: { loginStreak, dailyClaimDate },
            conversionRate: 5,
            convertCoinsToPoints,
            claimDailyReward,
            claimChallenge,
            redeemPoints: () => {},
            challenges,
        }}>
            {children}
        </PointsContext.Provider>
    );
}

export function usePoints() {
    const context = useContext(PointsContext);
    return context ?? DEFAULT_CONTEXT;
}