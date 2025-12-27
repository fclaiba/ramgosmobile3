import React, {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
    ReactNode
} from 'react';

type PointSource = 'purchase' | 'game' | 'referral' | 'bonus' | 'manual';

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

interface PurchaseRewardSummary {
    basePoints: number;
    bonusPoints: number;
    totalPoints: number;
}

interface PointsContextType {
    points: number;
    lifetimePoints: number;
    transactions: PointsTransaction[];
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
    claimChallenge: (challengeId: string) => boolean;
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
    const [points, setPoints] = useState<number>(0);
    const pointsRef = useRef(points);

    const [lifetimePoints, setLifetimePoints] = useState<number>(0);
    const lifetimePointsRef = useRef(lifetimePoints);

    const [transactions, setTransactions] = useState<PointsTransaction[]>([]);
    const transactionsRef = useRef(transactions);

    const [challenges, setChallenges] = useState<DailyChallenge[]>(defaultChallenges);
    const [challengeProgress, setChallengeProgress] = useState<ChallengeProgress>(defaultChallengeProgress);

    const [quarterSummary, setQuarterSummaryState] = useState<QuarterSummary>(initialQuarter);
    const quarterSummaryRef = useRef<QuarterSummary>(initialQuarter);

    const updatePoints = useCallback((delta: number) => {
        setPoints((prev) => {
            const next = Math.max(prev + delta, 0);
            pointsRef.current = next;
            return next;
        });
    }, []);

    const updateLifetimePoints = useCallback((delta: number) => {
        if (delta <= 0) {
            return;
        }
        setLifetimePoints((prev) => {
            const next = prev + delta;
            lifetimePointsRef.current = next;
            return next;
        });
    }, []);

    const updateTransactions = useCallback((updater: (prev: PointsTransaction[]) => PointsTransaction[]) => {
        setTransactions((prev) => {
            const next = updater(prev);
            transactionsRef.current = next;
            return next;
        });
    }, []);

    const updateQuarterSummary = useCallback((updater: (prev: QuarterSummary) => QuarterSummary) => {
        setQuarterSummaryState((prev) => {
            const next = updater(prev);
            quarterSummaryRef.current = next;
            return next;
        });
    }, []);

    const expireGamePointsForQuarter = useCallback((quarterKey: string) => {
        let expiredSum = 0;

        updateTransactions((prev) => {
            const updated = prev.map((tx) => {
                if (
                    tx.amount > 0 &&
                    tx.source === 'game' &&
                    tx.metadata?.quarter === quarterKey &&
                    !tx.metadata?.expired
                ) {
                    expiredSum += tx.amount;
                    return {
                        ...tx,
                        metadata: { ...tx.metadata, expired: true },
                    };
                }
                return tx;
            });

            if (expiredSum > 0) {
                const expirationTx = buildTransaction({
                    amount: -expiredSum,
                    description: `Expiración de puntos de juegos ${quarterKey}`,
                    source: 'game',
                    type: 'redeem',
                    date: new Date(),
                    metadata: { expiration: true, quarter: quarterKey },
                });
                return [expirationTx, ...updated];
            }

            return updated;
        });

        if (expiredSum > 0) {
            updatePoints(-expiredSum);
        }

        return expiredSum;
    }, [updatePoints, updateTransactions]);

    const ensureQuarterForDate = useCallback((eventDate: Date) => {
        const closedSummaries: QuarterSummary[] = [];

        updateQuarterSummary((prev) => {
            let working = prev;
            const eventTime = eventDate.getTime();

            while (eventTime > new Date(working.endDate).getTime()) {
                closedSummaries.push(working);
                const nextSeed = addDays(new Date(working.endDate), 1);
                working = createQuarterSummary(nextSeed);
            }

            return working;
        });

        closedSummaries.forEach((summary) => {
            if (summary.purchasePoints < QUARTER_PURCHASE_GOAL && summary.gamePoints > 0) {
                const expired = expireGamePointsForQuarter(summary.key);
                if (expired > 0) {
                    updateQuarterSummary((prev) => ({
                        ...prev,
                        expiredGamePoints: prev.expiredGamePoints + expired,
                    }));
                }
            }
        });
    }, [expireGamePointsForQuarter, updateQuarterSummary]);

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
        const transaction = buildTransaction({
            amount,
            description,
            source,
            type: resolvedType,
            date: eventDate,
            metadata: { ...metadata, countsTowardPurchaseGoal },
        });

        updateTransactions((prev) => [transaction, ...prev]);
        updatePoints(amount);

        if (amount > 0) {
            updateLifetimePoints(amount);
            updateQuarterContribution(source, amount, transaction.metadata ?? {}, eventDate);
        }

        return transaction;
    }, [ensureQuarterForDate, updateLifetimePoints, updatePoints, updateTransactions, updateQuarterContribution]);

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
        let rewardGranted = false;

        setChallengeProgress((prev) => {
            if (prev.dailyClaimDate === todayKey) {
                return prev;
            }
            rewardGranted = true;
            return {
                ...prev,
                dailyClaimDate: todayKey,
            };
        });

        if (rewardGranted) {
            setChallenges((prev) =>
                prev.map((challenge) => {
                    if (challenge.id !== 'daily_login') {
                        return challenge;
                    }
                    return {
                        ...challenge,
                        claimed: true,
                    };
                })
            );

            registerPoints(10, 'Recompensa diaria Ramgos', {
                source: 'bonus',
                metadata: { challengeId: 'daily_login' },
            });
        }

        return rewardGranted;
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

        const weekStartKey = getWeekStartKey(eventDate);
        let purchasesForWeek = 0;

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

    const value: PointsContextType = {
        points,
        lifetimePoints,
        transactions,
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
        claimChallenge,
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
