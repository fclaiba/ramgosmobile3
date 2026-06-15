import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    ReactNode
} from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from './AuthContext';

type PointSource = 'purchase' | 'game' | 'referral' | 'bonus' | 'manual';
export type DailyActivityType = 'FEED_PET' | 'ARCADE_GAME' | 'WHEEL';

const DAILY_LIMITS: Record<DailyActivityType, number> = {
    FEED_PET: 1,
    ARCADE_GAME: 3,
    WHEEL: 1
};

export type PetStage = 'EGG' | 'BABY' | 'YOUNG' | 'ADULT';

export const getPetStage = (streak: number): PetStage => {
    if (streak < 3) return 'EGG';
    if (streak < 8) return 'BABY';
    if (streak < 30) return 'YOUNG';
    return 'ADULT';
};

export interface PointsTransaction {
    id: string;
    type: 'earn' | 'redeem' | 'convert' | 'challenge';
    amount: number;
    description: string;
    date: string;
    source?: PointSource;
    metadata?: Record<string, unknown>;
}

export interface DailyChallenge {
    id: string;
    type: 'daily' | 'weekly';
    title: string;
    description: string;
    reward: number;
    current: number;
    target: number;
    completed: boolean;
    claimed: boolean;
    icon: string;
}

interface ChallengeProgress {
    lastLoginDate: string;
    loginStreak: number;
    dailyClaimDate: string;
    weeklyPurchases: number;
    weekStartDate: string;
    dailyActivities?: Record<string, { count: number; date: string }>;
    currentStreak: number;
    lastClaimDate?: string;
}

interface QuarterSummary {
    key: string;
    startDate: string;
    endDate: string;
    purchasePoints: number;
    gamePoints: number;
    referralPoints: number;
    expiredGamePoints: number;
}

interface MembershipTier {
    id: 'bronze' | 'silver' | 'gold' | 'platinum';
    label: string;
    minPoints: number;
    bonusMultiplier: number;
    perks: string[];
}

interface PointsAwardOptions {
    source?: PointSource;
    metadata?: Record<string, unknown>;
    date?: Date;
    type?: PointsTransaction['type'];
    countsTowardPurchaseGoal?: boolean;
}

export interface PurchaseRewardSummary {
    basePoints: number;
    bonusPoints: number;
    totalPoints: number;
}

export interface PurchaseRewardPreview extends PurchaseRewardSummary {
    tierId: MembershipTier['id'];
    tierLabel: string;
    bonusMultiplier: number;
}

interface PointsContextType {
    points: number;
    lifetimePoints: number;
    transactions: PointsTransaction[];
    lastEarnTransactionId: string | null;
    challenges: DailyChallenge[];
    challengeProgress: ChallengeProgress;
    quarterSummary: QuarterSummary;
    currentTier: MembershipTier;
    nextTier?: MembershipTier;
    addPoints: (amount: number, description: string, options?: PointsAwardOptions) => PointsTransaction | null;
    redeemPoints: (amount: number, description: string) => boolean;
    convertCoinsToPoints: (coins: number) => number;
    getAvailableDiscounts: () => { points: number; discount: number; percentage: number }[];
    canUseDiscount: (requiredPoints: number) => boolean;
    checkDailyLogin: () => void;
    claimDailyReward: () => boolean;
    trackPurchase: (amount: number) => PurchaseRewardSummary;
    previewPurchasePoints: (amount: number) => PurchaseRewardPreview;
    claimChallenge: (challengeId: string) => boolean;
    checkDailyLimit: (activity: DailyActivityType) => { allowed: boolean; remaining: number };
    recordActivity: (activity: DailyActivityType) => void;
    conversionRate: number;
    petStage: PetStage;
}

const PointsContext = createContext<PointsContextType | undefined>(undefined);

const COINS_TO_POINTS_RATE = 5;
const QUARTER_PURCHASE_GOAL = 500;

const DISCOUNT_TIERS = [
    { points: 100, discount: 1.00, percentage: 0 },
    { points: 200, discount: 2.00, percentage: 0 },
    { points: 500, discount: 5.00, percentage: 0 },
    { points: 1000, discount: 10.00, percentage: 0 },
    { points: 2000, discount: 20.00, percentage: 0 },
    { points: 5000, discount: 50.00, percentage: 0 },
];

export const MEMBERSHIP_TIERS: MembershipTier[] = [
    { id: 'bronze', label: 'Bronze', minPoints: 0, bonusMultiplier: 0, perks: ['Acceso básico'] },
    { id: 'silver', label: 'Silver', minPoints: 1000, bonusMultiplier: 0.05, perks: ['+5% puntos extra por compra'] },
    { id: 'gold', label: 'Gold', minPoints: 5000, bonusMultiplier: 0.10, perks: ['+10% puntos extra', 'Sorteos VIP'] },
    { id: 'platinum', label: 'Platinum', minPoints: 15000, bonusMultiplier: 0.15, perks: ['+15% puntos extra', 'Envíos selectos gratis'] },
];

const defaultChallenges: DailyChallenge[] = [
    {
        id: 'daily_login',
        type: 'daily',
        title: 'Inicia sesión diariamente',
        description: 'Conéctate cada día para mantener tu racha.',
        reward: 10,
        current: 0,
        target: 1,
        completed: false,
        claimed: false,
        icon: 'login',
    },
    {
        id: 'weekly_purchase',
        type: 'weekly',
        title: 'Realiza compras semanales',
        description: 'Completa 3 compras en la semana para recibir un bono.',
        reward: 20,
        current: 0,
        target: 3,
        completed: false,
        claimed: false,
        icon: 'purchase',
    },
];

const defaultChallengeProgress: ChallengeProgress = {
    lastLoginDate: '',
    loginStreak: 0,
    dailyClaimDate: '',
    weeklyPurchases: 0,
    weekStartDate: '',
    currentStreak: 0,
};

const startOfQuarter = (date: Date): Date => {
    const quarter = Math.floor(date.getMonth() / 3);
    return new Date(date.getFullYear(), quarter * 3, 1, 0, 0, 0, 0);
};

const endOfQuarter = (date: Date): Date => {
    const start = startOfQuarter(date);
    return new Date(start.getFullYear(), start.getMonth() + 3, 0, 23, 59, 59, 999);
};

const addDays = (date: Date, days: number): Date => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

const getQuarterKey = (date: Date): string => {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `${date.getFullYear()}-Q${quarter}`;
};

const createQuarterSummary = (seed: Date): QuarterSummary => {
    const start = startOfQuarter(seed);
    const end = endOfQuarter(seed);
    return {
        key: getQuarterKey(seed),
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        purchasePoints: 0,
        gamePoints: 0,
        referralPoints: 0,
        expiredGamePoints: 0,
    };
};

const getDateKey = (date: Date): string => date.toISOString().slice(0, 10);

const getWeekStartKey = (date: Date): string => {
    const start = new Date(date);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday as start of week
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    return getDateKey(start);
};

const isYesterday = (date: Date, compare: Date): boolean => {
    const yesterday = addDays(compare, -1);
    return getDateKey(date) === getDateKey(yesterday);
};

const generateTransactionId = () => `txn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

interface TransactionPayload {
    amount: number;
    description: string;
    source: PointSource;
    type: PointsTransaction['type'];
    date: Date;
    metadata?: Record<string, unknown>;
}

const buildTransaction = (payload: TransactionPayload): PointsTransaction => {
    const { amount, description, source, type, date, metadata = {} } = payload;
    const baseMetadata = {
        ...metadata,
        quarter: metadata?.quarter ?? getQuarterKey(date),
    };
    return {
        id: generateTransactionId(),
        type,
        amount,
        description,
        date: date.toISOString(),
        source,
        metadata: baseMetadata,
    };
};

const initialQuarter = createQuarterSummary(new Date());

export function PointsProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    
    // Get summary from backend (Ledger-based)
    const pointsSummary = useQuery(
        api.economy.getPointsSummary,
        user ? { userId: user.id } : 'skip',
    );

    // Map backend data to local structure
    const points = useMemo(() => pointsSummary?.balance ?? 0, [pointsSummary]);
    const pointsRef = useRef(points);
    useEffect(() => { pointsRef.current = points; }, [points]);

    const transactions = useMemo(() => 
        (pointsSummary?.events ?? []).map((ev: any) => ({
            id: ev.eventKey,
            type: ev.type as any,
            amount: ev.amount,
            description: ev.description,
            date: ev.createdAt,
            source: ev.source as any,
            metadata: ev.metadata,
        })), [pointsSummary]);
    
    const transactionsRef = useRef(transactions);
    useEffect(() => { transactionsRef.current = transactions; }, [transactions]);

    const lifetimePoints = useMemo(() => 
        (pointsSummary?.events ?? [])
            .filter((ev: any) => ev.type === 'earn')
            .reduce((acc: number, ev: any) => acc + ev.amount, 0),
        [pointsSummary]
    );
    const lifetimePointsRef = useRef(lifetimePoints);
    useEffect(() => { lifetimePointsRef.current = lifetimePoints; }, [lifetimePoints]);

    const [lastEarnTransactionId, setLastEarnTransactionId] = useState<string | null>(null);

    const [challenges, setChallenges] = useState<DailyChallenge[]>(defaultChallenges);
    const [challengeProgress, setChallengeProgress] = useState<ChallengeProgress>(defaultChallengeProgress);

    const [quarterSummary, setQuarterSummaryState] = useState<QuarterSummary>(initialQuarter);
    const quarterSummaryRef = useRef<QuarterSummary>(initialQuarter);
    
    const economyState = useQuery(
        api.economy.getState,
        user ? { userId: user.id } : 'skip',
    );
    const savePointsState = useMutation(api.economy.savePointsState);
    const applyPointsEvent = useMutation(api.economy.applyPointsEvent);
    const hasHydratedFromBackend = useRef(false);

    const updateQuarterSummary = useCallback((updater: (prev: QuarterSummary) => QuarterSummary) => {
        setQuarterSummaryState((prev) => {
            const next = updater(prev);
            quarterSummaryRef.current = next;
            return next;
        });
    }, []);

    const ensureQuarterForDate = useCallback((eventDate: Date) => {
        updateQuarterSummary((prev) => {
            let working = prev;
            const eventTime = eventDate.getTime();

            while (eventTime > new Date(working.endDate).getTime()) {
                const nextSeed = addDays(new Date(working.endDate), 1);
                working = createQuarterSummary(nextSeed);
            }

            return working;
        });
    }, [updateQuarterSummary]);

    const updateQuarterContribution = useCallback((source: PointSource, amount: number, metadata: Record<string, unknown>, eventDate: Date) => {
        if (amount <= 0) {
            return;
        }

        const countsTowardGoal = Boolean(metadata.countsTowardPurchaseGoal) || source === 'purchase';

        ensureQuarterForDate(eventDate);

        updateQuarterSummary((prev) => {
            const next = { ...prev };

            if (countsTowardGoal) {
                next.purchasePoints += amount;
            } else if (source === 'game') {
                next.gamePoints += amount;
            } else if (source === 'referral') {
                next.referralPoints += amount;
            }

            return next;
        });
    }, [ensureQuarterForDate, updateQuarterSummary]);

    const registerPoints = useCallback((amount: number, description: string, options: PointsAwardOptions = {}): PointsTransaction | null => {
        if (amount === 0) {
            return null;
        }

        const {
            source = 'manual',
            metadata = {},
            date,
            type,
            countsTowardPurchaseGoal
        } = options;

        const eventDate = date ? new Date(date) : new Date();
        ensureQuarterForDate(eventDate);

        const resolvedType = type ?? (amount >= 0 ? 'earn' : 'redeem');
        const transactionId = generateTransactionId();

        if (user?.id) {
            applyPointsEvent({
                userId: user.id,
                eventKey: transactionId,
                type: resolvedType,
                source,
                amount,
                description,
                metadata: { ...metadata, countsTowardPurchaseGoal, quarter: getQuarterKey(eventDate) },
            }).catch((error: any) => {
                console.error('Failed to persist points ledger event', error);
            });
        }

        if (amount > 0) {
            updateQuarterContribution(source, amount, { ...metadata, countsTowardPurchaseGoal }, eventDate);
            if (resolvedType === 'earn') {
                setLastEarnTransactionId(transactionId);
            }
        }

        return {
            id: transactionId,
            type: resolvedType,
            amount,
            description,
            date: eventDate.toISOString(),
            source,
            metadata: { ...metadata, countsTowardPurchaseGoal },
        };
    }, [ensureQuarterForDate, updateQuarterContribution, user?.id, applyPointsEvent]);

    const getTierForPoints = useCallback((balance: number): MembershipTier => {
        const sorted = [...MEMBERSHIP_TIERS].sort((a, b) => a.minPoints - b.minPoints);
        let current = sorted[0];
        for (const tier of sorted) {
            if (balance >= tier.minPoints) {
                current = tier;
            } else {
                break;
            }
        }
        return current;
    }, []);

    const getNextTier = useCallback((balance: number): MembershipTier | undefined => {
        const sorted = [...MEMBERSHIP_TIERS].sort((a, b) => a.minPoints - b.minPoints);
        return sorted.find((tier) => balance < tier.minPoints);
    }, []);

    const addPoints = useCallback((amount: number, description: string, options?: PointsAwardOptions) => {
        return registerPoints(amount, description, options);
    }, [registerPoints]);

    const redeemPoints = useCallback((amount: number, description: string): boolean => {
        if (amount <= 0) {
            return false;
        }
        if (pointsRef.current < amount) {
            return false;
        }
        registerPoints(-amount, description, { source: 'manual', type: 'redeem', metadata: { redemption: true } });
        return true;
    }, [registerPoints]);

    const convertCoinsToPoints = useCallback((coins: number): number => {
        const pointsEarned = Math.floor(coins / COINS_TO_POINTS_RATE);
        if (pointsEarned > 0) {
            registerPoints(pointsEarned, `Conversión de ${coins} monedas`, {
                source: 'game',
                metadata: { coins },
            });
        }
        return pointsEarned;
    }, [registerPoints]);

    const getAvailableDiscounts = useCallback(() => {
        return DISCOUNT_TIERS.filter((tier) => pointsRef.current >= tier.points);
    }, []);

    const canUseDiscount = useCallback((requiredPoints: number): boolean => {
        return pointsRef.current >= requiredPoints;
    }, []);

    const checkDailyLogin = useCallback(() => {
        const today = new Date();
        const todayKey = getDateKey(today);

        setChallengeProgress((prev) => {
            if (prev.lastLoginDate === todayKey) {
                return prev;
            }

            const streak = prev.lastLoginDate && isYesterday(new Date(prev.lastLoginDate), today)
                ? prev.loginStreak + 1
                : 1;

            return {
                ...prev,
                lastLoginDate: todayKey,
                loginStreak: streak,
                dailyClaimDate: '',
            };
        });

        setChallenges((prev) =>
            prev.map((challenge) => {
                if (challenge.id !== 'daily_login') {
                    return challenge;
                }
                return {
                    ...challenge,
                    current: 1,
                    completed: true,
                    claimed: false,
                };
            })
        );
    }, []);

    const claimDailyReward = useCallback(() => {
        const today = new Date();
        const todayKey = getDateKey(today);

        let rewardPoints = 10;
        let didClaim = false;

        setChallengeProgress((prev) => {
            if (prev.dailyClaimDate === todayKey) {
                return prev; // Already claimed today
            }

            didClaim = true;

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayKey = getDateKey(yesterday);

            let newStreak = 1;
            if (prev.dailyClaimDate === yesterdayKey) {
                newStreak = Math.min(prev.currentStreak + 1, 3);
            }

            if (newStreak === 2) rewardPoints = 20;
            if (newStreak >= 3) rewardPoints = 30;

            return {
                ...prev,
                dailyClaimDate: todayKey,
                currentStreak: newStreak,
            };
        });

        if (!didClaim) {
            return false;
        }

        setChallenges((prev) =>
            prev.map((challenge) => {
                if (challenge.id !== 'daily_login') return challenge;
                return { ...challenge, claimed: true };
            })
        );

        registerPoints(rewardPoints, `Racha Diaria (${rewardPoints} pts)`, {
            source: 'bonus',
            metadata: { challengeId: 'daily_login' },
        });

        return true;
    }, [registerPoints]);

    const trackPurchase = useCallback((amount: number): PurchaseRewardSummary => {
        const eventDate = new Date();
        ensureQuarterForDate(eventDate);

        const basePoints = Math.max(Math.floor(amount), 0);
        const tier = getTierForPoints(lifetimePointsRef.current);
        const bonusPoints = basePoints > 0 ? Math.floor(basePoints * tier.bonusMultiplier) : 0;

        if (basePoints > 0) {
            registerPoints(basePoints, `Compra en Ramgos $${amount.toFixed(2)}`, {
                source: 'purchase',
                metadata: {
                    amountUSD: amount,
                    countsTowardPurchaseGoal: true,
                },
                date: eventDate,
            });
        }

        if (bonusPoints > 0) {
            registerPoints(bonusPoints, `Bono de nivel ${tier.label}`, {
                source: 'bonus',
                metadata: {
                    linkedTo: 'purchase',
                    tier: tier.id,
                    countsTowardPurchaseGoal: true,
                },
                date: eventDate,
            });
        }

        let purchasesForWeek = 0;
        const weekStartKey = getWeekStartKey(eventDate);

        setChallengeProgress((prev) => {
            const sameWeek = prev.weekStartDate === weekStartKey;
            purchasesForWeek = sameWeek ? prev.weeklyPurchases + 1 : 1;
            return {
                ...prev,
                weeklyPurchases: purchasesForWeek,
                weekStartDate: weekStartKey,
            };
        });

        setChallenges((prev) =>
            prev.map((challenge) => {
                if (challenge.id !== 'weekly_purchase') {
                    return challenge;
                }
                const completed = purchasesForWeek >= challenge.target;
                return {
                    ...challenge,
                    current: Math.min(challenge.target, purchasesForWeek),
                    completed,
                    claimed: completed ? challenge.claimed : false,
                };
            })
        );

        return {
            basePoints,
            bonusPoints,
            totalPoints: basePoints + bonusPoints,
        };
    }, [ensureQuarterForDate, getTierForPoints, registerPoints]);

    const previewPurchasePoints = useCallback((amount: number) => {
        const basePoints = Math.max(Math.floor(amount), 0);
        const tier = getTierForPoints(lifetimePointsRef.current);
        const bonusPoints = basePoints > 0 ? Math.floor(basePoints * tier.bonusMultiplier) : 0;
        return {
            basePoints,
            bonusPoints,
            totalPoints: basePoints + bonusPoints,
            tierId: tier.id,
            tierLabel: tier.label,
            bonusMultiplier: tier.bonusMultiplier,
        };
    }, [getTierForPoints]);

    const claimChallenge = useCallback((challengeId: string): boolean => {
        let reward = 0;
        let title = '';
        let canReward = false;

        setChallenges((prev) =>
            prev.map((challenge) => {
                if (challenge.id !== challengeId) {
                    return challenge;
                }
                if (!challenge.completed || challenge.claimed) {
                    return challenge;
                }
                reward = challenge.reward;
                title = challenge.title;
                canReward = true;
                return {
                    ...challenge,
                    claimed: true,
                };
            })
        );

        if (canReward && reward > 0) {
            registerPoints(reward, `Recompensa desafío: ${title}`, {
                source: 'bonus',
                metadata: { challengeId },
            });
            return true;
        }

        return false;
    }, [registerPoints]);

    const currentTier = useMemo(() => getTierForPoints(lifetimePoints), [getTierForPoints, lifetimePoints]);
    const nextTier = useMemo(() => getNextTier(lifetimePoints), [getNextTier, lifetimePoints]);

    const checkDailyLimit = useCallback((activity: DailyActivityType) => {
        const todayKey = getDateKey(new Date());
        const activityRecord = challengeProgress.dailyActivities?.[activity];

        if (!activityRecord || activityRecord.date !== todayKey) {
            return { allowed: true, remaining: DAILY_LIMITS[activity] };
        }

        const remaining = DAILY_LIMITS[activity] - activityRecord.count;
        return { allowed: remaining > 0, remaining };
    }, [challengeProgress]);

    const recordActivity = useCallback((activity: DailyActivityType) => {
        const todayKey = getDateKey(new Date());
        setChallengeProgress(prev => {
            const currentRecord = prev.dailyActivities?.[activity];
            const newCount = (currentRecord && currentRecord.date === todayKey)
                ? currentRecord.count + 1
                : 1;

            return {
                ...prev,
                dailyActivities: {
                    ...prev.dailyActivities,
                    [activity]: { count: newCount, date: todayKey }
                }
            };
        });
    }, []);

    useEffect(() => {
        if (!user || hasHydratedFromBackend.current) return;
        const persisted = economyState?.pointsState;
        if (!persisted) {
            hasHydratedFromBackend.current = true;
            return;
        }

        // Transactions and Points are now handled by getPointsSummary,
        // but challenges and progress still need this state.
        setChallenges(Array.isArray(persisted.challenges) ? persisted.challenges : defaultChallenges);
        setChallengeProgress(persisted.challengeProgress ?? defaultChallengeProgress);

        const nextQuarter = persisted.quarterSummary ?? initialQuarter;
        setQuarterSummaryState(nextQuarter);
        quarterSummaryRef.current = nextQuarter;

        hasHydratedFromBackend.current = true;
    }, [user, economyState]);

    useEffect(() => {
        if (!user || !hasHydratedFromBackend.current) return;
        savePointsState({
            userId: user.id,
            pointsState: {
                challenges,
                challengeProgress,
                quarterSummary,
            },
        }).catch((error: any) => {
            console.error('Failed to persist points state', error);
        });
    }, [
        user,
        challenges,
        challengeProgress,
        quarterSummary,
        savePointsState,
    ]);

    const value: PointsContextType = {
        points,
        lifetimePoints,
        transactions,
        lastEarnTransactionId,
        challenges,
        challengeProgress,
        quarterSummary,
        currentTier,
        nextTier,
        addPoints,
        redeemPoints,
        convertCoinsToPoints,
        getAvailableDiscounts,
        canUseDiscount,
        checkDailyLogin,
        claimDailyReward,
        trackPurchase,
        previewPurchasePoints,
        claimChallenge,
        checkDailyLimit,
        recordActivity,
        conversionRate: COINS_TO_POINTS_RATE,
        petStage: getPetStage(challengeProgress.currentStreak),
    };

    return (
        <PointsContext.Provider value={value}>
            {children}
        </PointsContext.Provider>
    );
}

export function usePoints() {
    const context = useContext(PointsContext);
    if (!context) {
        throw new Error('usePoints must be used within PointsProvider');
    }
    return context;
}

export { DISCOUNT_TIERS };
