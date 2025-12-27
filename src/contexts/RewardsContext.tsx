import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePoints } from './PointsContext';
import { useAuth } from './AuthContext';

type RewardStatus = 'awarded' | 'already_claimed' | 'limit_reached' | 'not_qualified' | 'error';

interface RewardResult {
    status: RewardStatus;
    pointsAwarded?: number;
    message: string;
    metadata?: Record<string, unknown>;
}

interface ArcadeRewardResult extends RewardResult {
    remaining: number;
    attemptsUsed: number;
}

interface WheelSegment {
    id: string;
    label: string;
    points: number;
    weight: number;
    color: string;
    description: string;
}

interface LuckyWheelResult extends RewardResult {
    segment: WheelSegment;
}

interface DailyEngagementState {
    dayKey: string;
    petFed: boolean;
    arcadeRewardsClaimed: number;
    arcadeRewardHistory: Record<string, number>;
    wheelSpun: boolean;
    wheelResult?: {
        segmentId: string;
        points: number;
        spunAt: string;
    };
    gameCoins: number;
}

interface StreakRewardState {
    claimedMilestones: number[];
    longestStreak: number;
}

interface StreakMilestone {
    value: number;
    reward: number;
    claimed: boolean;
    eligible: boolean;
}

interface ReferralRecord {
    id: string;
    name?: string;
    registeredAt: string;
    firstPurchaseAt?: string;
    status: 'registered' | 'purchased';
}

interface ReferralState {
    ownerId?: string;
    code: string;
    link: string;
    registrations: number;
    purchases: number;
    referrals: ReferralRecord[];
    totalPointsAwarded: {
        registration: number;
        purchase: number;
    };
}

interface RewardsContextType {
    dailyState: DailyEngagementState;
    feedVirtualPet: () => RewardResult;
    registerArcadeReward: (gameId: string, score: number) => ArcadeRewardResult;
    getArcadeStatus: () => {
        remaining: number;
        claimed: number;
        perGame: Record<string, number>;
    };
    spinLuckyWheel: () => LuckyWheelResult;
    getLuckyWheelStatus: () => {
        available: boolean;
        lastResult?: LuckyWheelResult;
    };
    claimStreakMilestone: (milestone: number) => RewardResult;
    getStreakMilestones: () => StreakMilestone[];
    streakLongest: number;
    referralCode: string;
    referralLink: string;
    referrals: ReferralRecord[];
    registerReferralSignup: (newUserId: string, name?: string) => RewardResult;
    registerReferralFirstPurchase: (referralId: string) => RewardResult;
    referralSummary: {
        registrations: number;
        purchases: number;
        totalPoints: number;
    };
    gameCoins: number;
    addGameCoins: (amount: number) => void;
    spendGameCoins: (amount: number) => boolean;
}

const DAILY_STATE_KEY = '@ramgos/rewards/daily';
const STREAK_STATE_KEY = '@ramgos/rewards/streak';
const REFERRAL_STATE_PREFIX = '@ramgos/rewards/referral/';

const FEED_PET_REWARD = 5;
const ARCADE_MAX_REWARDS = 3;
const ARCADE_MIN_SCORE = 50;
const REFERRAL_REWARDS = {
    registration: 100,
    firstPurchase: 250,
};

const WHEEL_SEGMENTS: WheelSegment[] = [
    { id: 'jackpot', label: 'Jackpot 500', points: 500, weight: 5, color: '#F97316', description: 'Gran premio diario' },
    { id: 'mega', label: 'Ultra Bonus 200', points: 200, weight: 10, color: '#8B5CF6', description: 'Multiplica tu fidelidad' },
    { id: 'bonus100', label: 'Bonus 100', points: 100, weight: 20, color: '#2563EB', description: 'Recompensa premium' },
    { id: 'bonus50', label: 'Bonus 50', points: 50, weight: 25, color: '#22C55E', description: 'Giro afortunado' },
    { id: 'bonus20', label: 'Bonus 20', points: 20, weight: 30, color: '#0EA5E9', description: 'Sigue sumando' },
    { id: 'try_again', label: 'Sigue intentando', points: 0, weight: 10, color: '#9CA3AF', description: 'Vuelve mañana' },
];

const STREAK_MILESTONES: Array<{ value: number; reward: number }> = [
    { value: 3, reward: 20 },
    { value: 7, reward: 60 },
    { value: 14, reward: 150 },
    { value: 30, reward: 400 },
];

const createDailyState = (dayKey: string): DailyEngagementState => ({
    dayKey,
    petFed: false,
    arcadeRewardsClaimed: 0,
    arcadeRewardHistory: {},
    wheelSpun: false,
    wheelResult: undefined,
    gameCoins: 100, // Initial bonus
});

const createStreakState = (): StreakRewardState => ({
    claimedMilestones: [],
    longestStreak: 0,
});

const generateReferralCode = (ownerId?: string) => {
    if (!ownerId) {
        return 'RAMGOS-GUEST';
    }
    const sanitized = ownerId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return `RAMGOS-${sanitized.padStart(6, '0').slice(-6)}`;
};

const createReferralState = (ownerId?: string): ReferralState => {
    const code = generateReferralCode(ownerId);
    const link = `https://ramgos.app/r/${code}`;
    return {
        ownerId,
        code,
        link,
        registrations: 0,
        purchases: 0,
        referrals: [],
        totalPointsAwarded: {
            registration: 0,
            purchase: 0,
        },
    };
};

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const pickSegment = (segments: WheelSegment[]): WheelSegment => {
    const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
    const random = Math.random() * totalWeight;
    let accumulator = 0;
    for (const segment of segments) {
        accumulator += segment.weight;
        if (random <= accumulator) {
            return segment;
        }
    }
    return segments[segments.length - 1];
};

const RewardsContext = createContext<RewardsContextType | undefined>(undefined);

export const RewardsProvider = ({ children }: { children: React.ReactNode }) => {
    const { addPoints, challengeProgress } = usePoints();
    const { user } = useAuth();

    const [dailyState, setDailyState] = useState<DailyEngagementState>(() => createDailyState(getTodayKey()));
    const [streakState, setStreakState] = useState<StreakRewardState>(() => createStreakState());
    const [referralState, setReferralState] = useState<ReferralState>(() => createReferralState());

    const referralStorageKeyRef = useRef<string | null>(null);

    // Load persisted state on mount
    useEffect(() => {
        const loadState = async () => {
            try {
                const [storedDaily, storedStreak] = await Promise.all([
                    AsyncStorage.getItem(DAILY_STATE_KEY),
                    AsyncStorage.getItem(STREAK_STATE_KEY),
                ]);

                if (storedDaily) {
                    const parsed: DailyEngagementState = JSON.parse(storedDaily);
                    const today = getTodayKey();
                    if (parsed.dayKey === today) {
                        setDailyState({
                            ...createDailyState(today),
                            ...parsed,
                        });
                    } else {
                        setDailyState(createDailyState(today));
                    }
                }

                if (storedStreak) {
                    const parsed: StreakRewardState = JSON.parse(storedStreak);
                    setStreakState({
                        ...createStreakState(),
                        ...parsed,
                    });
                }
            } catch (error) {
                console.warn('Unable to load rewards state', error);
            }
        };

        loadState();
    }, []);

    // Persist daily state
    useEffect(() => {
        AsyncStorage.setItem(DAILY_STATE_KEY, JSON.stringify(dailyState)).catch((error) => {
            console.warn('Unable to persist daily rewards state', error);
        });
    }, [dailyState]);

    // Persist streak state
    useEffect(() => {
        AsyncStorage.setItem(STREAK_STATE_KEY, JSON.stringify(streakState)).catch((error) => {
            console.warn('Unable to persist streak state', error);
        });
    }, [streakState]);

    // Load or reset referral state when user changes
    useEffect(() => {
        const loadReferralState = async () => {
            const ownerId = user?.id;
            if (!ownerId) {
                referralStorageKeyRef.current = null;
                setReferralState(createReferralState());
                return;
            }

            const key = `${REFERRAL_STATE_PREFIX}${ownerId}`;
            referralStorageKeyRef.current = key;

            try {
                const stored = await AsyncStorage.getItem(key);
                if (stored) {
                    const parsed: ReferralState = JSON.parse(stored);
                    setReferralState({
                        ...createReferralState(ownerId),
                        ...parsed,
                        ownerId,
                    });
                } else {
                    setReferralState(createReferralState(ownerId));
                }
            } catch (error) {
                console.warn('Unable to load referral state', error);
                setReferralState(createReferralState(ownerId));
            }
        };

        loadReferralState();
    }, [user?.id]);

    // Persist referral state
    useEffect(() => {
        const key = referralStorageKeyRef.current;
        if (key && referralState.ownerId) {
            AsyncStorage.setItem(key, JSON.stringify(referralState)).catch((error) => {
                console.warn('Unable to persist referral state', error);
            });
        }
    }, [referralState]);

    // Keep longest streak up-to-date with challenge progress
    useEffect(() => {
        setStreakState((prev) => {
            if (challengeProgress.loginStreak <= prev.longestStreak) {
                return prev;
            }
            return {
                ...prev,
                longestStreak: challengeProgress.loginStreak,
            };
        });
    }, [challengeProgress.loginStreak]);

    const ensureDailyForToday = useCallback((state: DailyEngagementState): DailyEngagementState => {
        const today = getTodayKey();
        if (state.dayKey === today) {
            return state;
        }
        return createDailyState(today);
    }, []);

    useEffect(() => {
        const today = getTodayKey();
        if (dailyState.dayKey !== today) {
            setDailyState(createDailyState(today));
        }
    }, [dailyState.dayKey]);

    const feedVirtualPet = useCallback((): RewardResult => {
        const state = ensureDailyForToday(dailyState);

        if (state.petFed) {
            return {
                status: 'already_claimed',
                message: 'Ya alimentaste a tu mascota hoy.',
            };
        }

        setDailyState((prev) => ({
            ...ensureDailyForToday(prev),
            petFed: true,
        }));

        const points = FEED_PET_REWARD;
        addPoints(points, 'Cuidado diario de mascota virtual', {
            source: 'bonus',
            metadata: { module: 'virtual_pet' },
        });

        return {
            status: 'awarded',
            message: 'Mascota alimentada. ¡Gracias por cuidarla!',
            pointsAwarded: points,
            metadata: { action: 'feed_pet' },
        };
    }, [dailyState, addPoints, ensureDailyForToday]);

    const computeArcadeReward = (score: number) => {
        if (score < ARCADE_MIN_SCORE) {
            return 0;
        }
        const normalized = Math.min(100, Math.max(10, Math.round(score / 8)));
        return normalized;
    };

    const registerArcadeReward = useCallback((gameId: string, score: number): ArcadeRewardResult => {
        const state = ensureDailyForToday(dailyState);
        const attemptsUsed = state.arcadeRewardsClaimed;
        const remaining = Math.max(0, ARCADE_MAX_REWARDS - attemptsUsed);

        if (remaining <= 0) {
            return {
                status: 'limit_reached',
                message: 'Ya reclamaste todas las recompensas diarias de arcade.',
                remaining: 0,
                attemptsUsed,
            };
        }

        const points = computeArcadeReward(score);
        if (points <= 0) {
            return {
                status: 'not_qualified',
                message: `Necesitas un puntaje mínimo de ${ARCADE_MIN_SCORE} para ganar puntos.`,
                remaining,
                attemptsUsed,
            };
        }

        setDailyState((prev) => {
            const currentState = ensureDailyForToday(prev);
            return {
                ...currentState,
                arcadeRewardsClaimed: currentState.arcadeRewardsClaimed + 1,
                arcadeRewardHistory: {
                    ...currentState.arcadeRewardHistory,
                    [gameId]: (currentState.arcadeRewardHistory[gameId] ?? 0) + 1,
                },
            };
        });

        addPoints(points, `Recompensa arcade (${gameId})`, {
            source: 'game',
            metadata: {
                gameId,
                score,
            },
        });

        return {
            status: 'awarded',
            message: `¡Excelente juego! Ganaste ${points} puntos.`,
            pointsAwarded: points,
            remaining: remaining - 1,
            attemptsUsed: attemptsUsed + 1,
            metadata: { gameId, score },
        };
    }, [dailyState, addPoints, ensureDailyForToday]);

    const getArcadeStatus = useCallback(() => {
        const state = ensureDailyForToday(dailyState);
        return {
            remaining: Math.max(0, ARCADE_MAX_REWARDS - state.arcadeRewardsClaimed),
            claimed: state.arcadeRewardsClaimed,
            perGame: state.arcadeRewardHistory,
        };
    }, [dailyState, ensureDailyForToday]);

    const spinLuckyWheel = useCallback((): LuckyWheelResult => {
        const state = ensureDailyForToday(dailyState);

        if (state.wheelSpun) {
            const segment = state.wheelResult
                ? WHEEL_SEGMENTS.find((item) => item.id === state.wheelResult?.segmentId) ?? WHEEL_SEGMENTS[WHEEL_SEGMENTS.length - 1]
                : WHEEL_SEGMENTS[WHEEL_SEGMENTS.length - 1];

            return {
                status: 'already_claimed',
                message: 'Ya giraste la rueda hoy. Vuelve mañana.',
                segment,
                pointsAwarded: segment.points > 0 ? segment.points : undefined,
            };
        }

        const segment = pickSegment(WHEEL_SEGMENTS);

        setDailyState((prev) => ({
            ...ensureDailyForToday(prev),
            wheelSpun: true,
            wheelResult: {
                segmentId: segment.id,
                points: segment.points,
                spunAt: new Date().toISOString(),
            },
        }));

        if (segment.points > 0) {
            addPoints(segment.points, 'Ruleta de la Suerte Ramgos', {
                source: 'bonus',
                metadata: { segmentId: segment.id },
            });
        }

        return {
            status: 'awarded',
            message: segment.points > 0
                ? `¡Ganaste ${segment.points} puntos!`
                : 'Esta vez no hubo premio, vuelve mañana.',
            pointsAwarded: segment.points > 0 ? segment.points : undefined,
            segment,
        };
    }, [dailyState, addPoints, ensureDailyForToday]);

    const getLuckyWheelStatus = useCallback(() => {
        const state = ensureDailyForToday(dailyState);
        if (!state.wheelResult) {
            return { available: !state.wheelSpun };
        }

        const segment = WHEEL_SEGMENTS.find((item) => item.id === state.wheelResult?.segmentId)
            ?? WHEEL_SEGMENTS[WHEEL_SEGMENTS.length - 1];

        const lastResult: LuckyWheelResult = {
            status: segment.points > 0 ? 'awarded' : 'not_qualified',
            message: segment.points > 0
                ? `Ganaste ${segment.points} puntos en tu último giro.`
                : 'Sin puntos en el último giro.',
            pointsAwarded: segment.points > 0 ? segment.points : undefined,
            segment,
        };

        return {
            available: !state.wheelSpun,
            lastResult,
        };
    }, [dailyState, ensureDailyForToday]);

    const claimStreakMilestone = useCallback((milestone: number): RewardResult => {
        const config = STREAK_MILESTONES.find((item) => item.value === milestone);
        if (!config) {
            return {
                status: 'error',
                message: 'Racha no disponible.',
            };
        }

        if (challengeProgress.loginStreak < milestone) {
            return {
                status: 'not_qualified',
                message: `Mantén la racha hasta el día ${milestone} para reclamar.`,
            };
        }

        if (streakState.claimedMilestones.includes(milestone)) {
            return {
                status: 'already_claimed',
                message: 'Este premio de racha ya fue reclamado.',
            };
        }

        setStreakState((prev) => ({
            ...prev,
            claimedMilestones: [...prev.claimedMilestones, milestone],
            longestStreak: Math.max(prev.longestStreak, challengeProgress.loginStreak),
        }));

        addPoints(config.reward, `Bonus racha ${milestone} días`, {
            source: 'bonus',
            metadata: { milestone },
        });

        return {
            status: 'awarded',
            message: `¡Racha de ${milestone} días! Se acreditaron ${config.reward} puntos.`,
            pointsAwarded: config.reward,
            metadata: { milestone },
        };
    }, [addPoints, challengeProgress.loginStreak, streakState.claimedMilestones]);

    const getStreakMilestones = useCallback((): StreakMilestone[] => {
        return STREAK_MILESTONES.map((item) => ({
            ...item,
            claimed: streakState.claimedMilestones.includes(item.value),
            eligible: challengeProgress.loginStreak >= item.value,
        }));
    }, [challengeProgress.loginStreak, streakState.claimedMilestones]);

    const registerReferralSignup = useCallback((newUserId: string, name?: string): RewardResult => {
        if (!referralState.ownerId) {
            return {
                status: 'error',
                message: 'Inicia sesión para activar los referidos.',
            };
        }

        if (referralState.referrals.some((ref) => ref.id === newUserId)) {
            return {
                status: 'already_claimed',
                message: 'Este referido ya fue registrado.',
            };
        }

        setReferralState((prev) => ({
            ...prev,
            registrations: prev.registrations + 1,
            referrals: [
                {
                    id: newUserId,
                    name,
                    registeredAt: new Date().toISOString(),
                    status: 'registered',
                },
                ...prev.referrals,
            ],
            totalPointsAwarded: {
                ...prev.totalPointsAwarded,
                registration: prev.totalPointsAwarded.registration + REFERRAL_REWARDS.registration,
            },
        }));

        addPoints(REFERRAL_REWARDS.registration, 'Bono por registro referido', {
            source: 'referral',
            metadata: { referredUserId: newUserId },
        });

        return {
            status: 'awarded',
            message: `¡Nuevo referido! Se acreditaron ${REFERRAL_REWARDS.registration} puntos.`,
            pointsAwarded: REFERRAL_REWARDS.registration,
            metadata: { referredUserId: newUserId },
        };
    }, [addPoints, referralState.ownerId, referralState.referrals]);

    const registerReferralFirstPurchase = useCallback((referralId: string): RewardResult => {
        if (!referralState.ownerId) {
            return {
                status: 'error',
                message: 'Inicia sesión para activar los referidos.',
            };
        }

        const referral = referralState.referrals.find((item) => item.id === referralId);
        if (!referral) {
            return {
                status: 'not_qualified',
                message: 'No encontramos el referido indicado.',
            };
        }
        if (referral.firstPurchaseAt) {
            return {
                status: 'already_claimed',
                message: 'Ya recibiste la recompensa por la primera compra de este referido.',
            };
        }

        setReferralState((prev) => ({
            ...prev,
            purchases: prev.purchases + 1,
            referrals: prev.referrals.map((item) =>
                item.id === referralId
                    ? {
                        ...item,
                        status: 'purchased',
                        firstPurchaseAt: new Date().toISOString(),
                    }
                    : item
            ),
            totalPointsAwarded: {
                ...prev.totalPointsAwarded,
                purchase: prev.totalPointsAwarded.purchase + REFERRAL_REWARDS.firstPurchase,
            },
        }));

        addPoints(REFERRAL_REWARDS.firstPurchase, 'Bono por primera compra de referido', {
            source: 'referral',
            metadata: { referredUserId: referralId, event: 'first_purchase' },
        });

        return {
            status: 'awarded',
            message: `Compra inicial registrada. Se acreditaron ${REFERRAL_REWARDS.firstPurchase} puntos.`,
            pointsAwarded: REFERRAL_REWARDS.firstPurchase,
            metadata: { referredUserId: referralId },
        };
    }, [addPoints, referralState.ownerId, referralState.referrals]);

    const addGameCoins = useCallback((amount: number) => {
        if (amount <= 0) return;
        setDailyState((prev) => {
            const state = ensureDailyForToday(prev);
            return {
                ...state,
                gameCoins: state.gameCoins + amount,
            };
        });
    }, [ensureDailyForToday]);

    const spendGameCoins = useCallback((amount: number): boolean => {
        if (amount <= 0) return false;
        let success = false;
        setDailyState((prev) => {
            const state = ensureDailyForToday(prev);
            if (state.gameCoins >= amount) {
                success = true;
                return {
                    ...state,
                    gameCoins: state.gameCoins - amount,
                };
            }
            return state;
        });
        return success;
    }, [ensureDailyForToday]);

    const referralSummary = useMemo(() => ({
        registrations: referralState.registrations,
        purchases: referralState.purchases,
        totalPoints: referralState.totalPointsAwarded.registration + referralState.totalPointsAwarded.purchase,
    }), [referralState]);

    const value: RewardsContextType = useMemo(() => ({
        dailyState,
        feedVirtualPet,
        registerArcadeReward,
        getArcadeStatus,
        spinLuckyWheel,
        getLuckyWheelStatus,
        claimStreakMilestone,
        getStreakMilestones,
        streakLongest: streakState.longestStreak,
        referralCode: referralState.code,
        referralLink: referralState.link,
        referrals: referralState.referrals,
        registerReferralSignup,
        registerReferralFirstPurchase,
        referralSummary,
        gameCoins: dailyState.gameCoins,
        addGameCoins,
        spendGameCoins,
    }), [
        claimStreakMilestone,
        dailyState,
        feedVirtualPet,
        getArcadeStatus,
        getLuckyWheelStatus,
        getStreakMilestones,
        referralState.code,
        referralState.link,
        referralState.referrals,
        referralSummary,
        registerArcadeReward,
        registerReferralFirstPurchase,
        registerReferralSignup,
        spinLuckyWheel,
        streakState.longestStreak,
        addGameCoins,
        spendGameCoins,
    ]);

    return (
        <RewardsContext.Provider value={value}>
            {children}
        </RewardsContext.Provider>
    );
};

export const useRewards = () => {
    const context = useContext(RewardsContext);
    if (!context) {
        throw new Error('useRewards must be used within RewardsProvider');
    }
    return context;
};

