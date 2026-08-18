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
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
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
    spinLuckyWheel: () => Promise<LuckyWheelResult>;
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
    petConfig: { activeHat: string; unlockedHats: string[] };
    unlockAccessory: (type: string, id: string, cost: number) => Promise<boolean>;
    equipAccessory: (type: string, id: string) => void;
    sleepVirtualPet: () => RewardResult;
}

const DAILY_STATE_KEY = '@ramgos/rewards/daily';
const STREAK_STATE_KEY = '@ramgos/rewards/streak';
const REFERRAL_STATE_PREFIX = '@ramgos/rewards/referral/';

/** Business constants — locked by constitution.test.tsx */
export const POINT_VALUE_USD = 0.01;
export const ARCADE_MAX_REWARDS = 3;
export const ARCADE_POINTS_RANGE = { min: 1, max: 20 } as const;
export const WHEEL_POINTS_RANGE = { min: 5, max: 100 } as const;

const FEED_PET_REWARD = 5;
const REFERRAL_POINTS = {
    registration: 100,
    firstPurchase: 250,
};

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

const wheelSegmentFromPoints = (points: number): WheelSegment => ({
    id: `wheel_${points}`,
    label: `${points} pts`,
    points,
    weight: 1,
    color: '#2563EB',
    description: 'Ruleta diaria',
});

const RewardsContext = createContext<RewardsContextType | undefined>(undefined);

export const RewardsProvider = ({ children }: { children: React.ReactNode }) => {
    const {
        challengeProgress,
        gameCoins,
        addGameCoins: addCoinsRemote,
        spendGameCoins: spendCoinsRemote,
        unlockHat,
        equipHat,
        spinLuckyWheel: spinWheelRemote,
        wheelClaimDate,
    } = usePoints();
    const { user, sessionToken } = useAuth();
    const claimRewardMutation = useMutation(api.economy.claimReward);

    /**
     * El cliente ya no dice CUÁNTO vale una recompensa, sólo QUÉ reclama.
     * Antes esto llamaba `api.economy.addPoints` pasándole el monto, y esa
     * mutation era pública: cualquiera podía acreditarse los puntos que
     * quisiera. El catálogo, los topes diarios y la verificación viven ahora
     * en `convex/economy.ts` (`REWARD_CATALOG`).
     */
    const claimReward = useCallback(
        async (kind: string, refId?: string) => {
            if (!user?.id || !sessionToken) return false;
            try {
                const result = await claimRewardMutation({ sessionToken, kind, refId });
                return !!result?.success;
            } catch (e) {
                console.error('[Rewards] claimReward failed', e);
                return false;
            }
        },
        [claimRewardMutation, sessionToken, user?.id],
    );

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
                        const { gameCoins: _ignored, ...rest } = parsed;
                        setDailyState({
                            ...createDailyState(today),
                            ...rest,
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

        const rewardPts = FEED_PET_REWARD;
        void claimReward('pet_daily_care');

        return {
            status: 'awarded',
            message: 'Mascota alimentada. ¡Gracias por cuidarla!',
            pointsAwarded: rewardPts,
            metadata: { action: 'feed_pet' },
        };
    }, [dailyState, claimReward, ensureDailyForToday]);

    const computeArcadeReward = (score: number) => {
        if (score <= 0) return 0;
        const raw = Math.floor(score / 10);
        return Math.max(ARCADE_POINTS_RANGE.min, Math.min(ARCADE_POINTS_RANGE.max, raw));
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
                message: 'Puntaje insuficiente para ganar puntos.',
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

        // El monto real lo fija el servidor (plano, con tope diario de 3):
        // atarlo al puntaje reportado por el cliente sería devolverle el
        // control del monto. `points` sólo se usa para el mensaje de la UI.
        void claimReward('arcade_play', `${gameId}-${attemptsUsed + 1}`);

        return {
            status: 'awarded',
            message: `¡Excelente juego! Ganaste ${points} puntos.`,
            pointsAwarded: points,
            remaining: remaining - 1,
            attemptsUsed: attemptsUsed + 1,
            metadata: { gameId, score },
        };
    }, [dailyState, claimReward, ensureDailyForToday]);

    const getArcadeStatus = useCallback(() => {
        const state = ensureDailyForToday(dailyState);
        return {
            remaining: Math.max(0, ARCADE_MAX_REWARDS - state.arcadeRewardsClaimed),
            claimed: state.arcadeRewardsClaimed,
            perGame: state.arcadeRewardHistory,
        };
    }, [dailyState, ensureDailyForToday]);

    const spinLuckyWheel = useCallback(async (): Promise<LuckyWheelResult> => {
        const today = getTodayKey();
        if (wheelClaimDate === today) {
            const segment = wheelSegmentFromPoints(WHEEL_POINTS_RANGE.min);
            return {
                status: 'already_claimed',
                message: 'Ya giraste la rueda hoy. Vuelve mañana.',
                segment,
                pointsAwarded: 0,
            };
        }

        const result = await spinWheelRemote();
        const awarded = result.pointsAwarded ?? WHEEL_POINTS_RANGE.min;
        const segment = wheelSegmentFromPoints(awarded);

        if (result.success) {
            setDailyState((prev) => ({
                ...ensureDailyForToday(prev),
                wheelSpun: true,
                wheelResult: {
                    segmentId: segment.id,
                    points: awarded,
                    spunAt: new Date().toISOString(),
                },
            }));
            return {
                status: 'awarded',
                message: result.message || `¡Ganaste ${awarded} puntos!`,
                pointsAwarded: awarded,
                segment,
            };
        }

        return {
            status: result.alreadyClaimed ? 'already_claimed' : 'error',
            message: result.message || 'No se pudo girar la rueda.',
            segment,
            pointsAwarded: result.alreadyClaimed ? awarded : 0,
        };
    }, [ensureDailyForToday, spinWheelRemote, wheelClaimDate]);

    const getLuckyWheelStatus = useCallback(() => {
        const today = getTodayKey();
        const claimedOnServer = wheelClaimDate === today;
        const state = ensureDailyForToday(dailyState);
        const claimedLocal = state.wheelSpun && state.dayKey === today;
        // Server wins: if Convex says not claimed, allow spin (fixes stuck AsyncStorage)
        const available = !claimedOnServer;

        if (!state.wheelResult && !claimedOnServer) {
            return { available };
        }

        const pts = state.wheelResult?.points ?? WHEEL_POINTS_RANGE.min;
        const segment = wheelSegmentFromPoints(pts);
        const lastResult: LuckyWheelResult = {
            status: 'awarded',
            message: `Ganaste ${segment.points} puntos en tu último giro.`,
            pointsAwarded: segment.points,
            segment,
        };

        return {
            available,
            lastResult: claimedOnServer || claimedLocal ? lastResult : undefined,
        };
    }, [dailyState, ensureDailyForToday, wheelClaimDate]);

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

        void claimReward('streak_milestone', String(milestone));

        return {
            status: 'awarded',
            message: `¡Racha de ${milestone} días! Se acreditaron ${config.reward} puntos.`,
            pointsAwarded: config.reward,
            metadata: { milestone },
        };
    }, [claimReward, challengeProgress.loginStreak, streakState.claimedMilestones]);

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
                registration: prev.totalPointsAwarded.registration + REFERRAL_POINTS.registration,
            },
        }));

        // El bono de referido NO se acredita desde acá. Lo otorga el servidor
        // en el alta (`users.awardReferralOnSignup`), que es el único que
        // conoce al referidor de verdad; desde el cliente cualquiera podía
        // inventarse referidos. Acá sólo se lleva el registro para la UI.
        return {
            status: 'awarded',
            message: '¡Nuevo referido registrado!',
            metadata: { referredUserId: newUserId },
        };
    }, [referralState.ownerId, referralState.referrals]);

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
                purchase: prev.totalPointsAwarded.purchase + REFERRAL_POINTS.firstPurchase,
            },
        }));

        // Igual que el alta: lo acredita el servidor cuando la compra del
        // referido se confirma de verdad, no el cliente al decir que pasó.
        return {
            status: 'awarded',
            message: 'Compra inicial del referido registrada.',
            metadata: { referredUserId: referralId },
        };
    }, [referralState.ownerId, referralState.referrals]);

    // ponytail: coins live in Convex via PointsContext — fire-and-forget for sync callers
    const addGameCoins = useCallback((amount: number) => {
        if (amount <= 0) return;
        void addCoinsRemote(amount, 'arcade_reward');
    }, [addCoinsRemote]);

    const spendGameCoins = useCallback((amount: number): boolean => {
        if (amount <= 0 || gameCoins < amount) return false;
        void spendCoinsRemote(amount, 'game_spend');
        return true;
    }, [gameCoins, spendCoinsRemote]);

    const referralSummary = useMemo(() => ({
        registrations: referralState.registrations,
        purchases: referralState.purchases,
        totalPoints: referralState.totalPointsAwarded.registration + referralState.totalPointsAwarded.purchase,
    }), [referralState]);

    const petConfig = useMemo(
        () => ({ activeHat: 'none', unlockedHats: ['none'] as string[] }),
        []
    );

    const unlockAccessory = useCallback(
        async (_type: string, id: string, cost: number) => unlockHat(id, cost),
        [unlockHat],
    );
    const equipAccessory = useCallback(
        (_type: string, id: string) => {
            void equipHat(id);
        },
        [equipHat],
    );
    const sleepVirtualPet = useCallback((): RewardResult => ({
        status: 'awarded',
        message: 'Mascota descansando.',
        pointsAwarded: 0,
    }), []);

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
        gameCoins,
        addGameCoins,
        spendGameCoins,
        petConfig,
        unlockAccessory,
        equipAccessory,
        sleepVirtualPet,
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
        gameCoins,
        addGameCoins,
        spendGameCoins,
        petConfig,
        unlockAccessory,
        equipAccessory,
        sleepVirtualPet,
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

