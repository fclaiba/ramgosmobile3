import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { usePoints } from './PointsContext';
import { useToast } from './ToastContext';
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
    gameCoins: number;
    addGameCoins: (amount: number) => void;
    spendGameCoins: (amount: number) => boolean;
    // Quarterly Mission
    quarterlyMission: QuarterlyMissionState;
    registerQuarterlyPurchase: () => void;
    // Pet Customization
    petConfig: PetConfigState;
    unlockAccessory: (type: 'hat' | 'skin', id: string, cost: number) => boolean;
    equipAccessory: (type: 'hat' | 'skin', id: string) => void;
}

// Helper to get current quarter key (e.g., "2026-Q1")
const getQuarterKey = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `${year}-Q${quarter}`;
};

const FEED_PET_REWARD = 5;
export const ARCADE_MAX_REWARDS = 3;
export const ARCADE_POINTS_RANGE = { min: 1, max: 20 } as const;
export const WHEEL_POINTS_RANGE = { min: 5, max: 100 } as const;
export const POINT_VALUE_USD = 0.01 as const;

const WHEEL_SEGMENTS: WheelSegment[] = [
    {
        id: 'wheel_points',
        label: `Puntos ${WHEEL_POINTS_RANGE.min}-${WHEEL_POINTS_RANGE.max}`,
        points: WHEEL_POINTS_RANGE.min,
        weight: 1,
        color: '#8B5CF6',
        description: `Giro diario (${WHEEL_POINTS_RANGE.min}-${WHEEL_POINTS_RANGE.max} pts)`,
    },
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


// --- QUARTERLY MISSIONS (Strategic Plan v2.0) ---
const QUARTERLY_MISSION = {
    TARGET_PURCHASES: 3,
    REWARD: 150,
    DESCRIPTION: "Compra 3 veces este trimestre"
};

export interface QuarterlyMissionState {
    quarterKey: string;
    purchasesCurrent: number;
    purchasesTarget: number;
    claimed: boolean;
    reward: number;
}

export interface PetConfigState {
    activeHat: string | null;
    activeSkin: string | null;
    unlockedHats: string[];
    unlockedSkins: string[];
}

const createPetConfigState = (): PetConfigState => ({
    activeHat: null,
    activeSkin: null,
    unlockedHats: ['none'],
    unlockedSkins: ['default'],
});

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
    const { user } = useAuth();
    const { addPoints } = usePoints();
    const { show } = useToast();  // Added missing hook
    const economyState = useQuery(
        api.economy.getState,
        user ? { actorId: user.id as any, userId: user.id } : 'skip',
    );
    const saveRewardsState = useMutation(api.economy.saveRewardsState);
    const claimRewardMutation = useMutation(api.economy.claimReward);
    const hydratedRef = useRef(false);

    const [dailyState, setDailyState] = useState<DailyEngagementState>(() => createDailyState(getTodayKey()));

    // Note: Streak rewards are handled in PointsContext (Constitución: +10/+20/+30 progresivo).

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
        if (user?.id) {
            claimRewardMutation({
                actorId: user.id as any,
                userId: user.id,
                claimKey: `pet_feed_${getTodayKey()}`,
                type: 'virtual_pet',
                pointsAwarded: points,
                metadata: { action: 'feed_pet' },
            }).catch((error: any) => {
                console.warn('Failed to persist reward claim', error);
            });
        }
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
    }, [dailyState, addPoints, ensureDailyForToday, user?.id, claimRewardMutation]);

    const computeArcadeReward = (score: number) => {
        // Constitución: Arcade awards 1–20 points (max 3/day).
        // Demo mapping: clamp(score) to avoid inventing additional business numbers.
        const raw = Math.floor(score);
        return Math.min(ARCADE_POINTS_RANGE.max, Math.max(ARCADE_POINTS_RANGE.min, raw || ARCADE_POINTS_RANGE.min));
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
        if (user?.id) {
            claimRewardMutation({
                actorId: user.id as any,
                userId: user.id,
                claimKey: `arcade_${getTodayKey()}_${gameId}_${attemptsUsed + 1}`,
                type: 'arcade',
                pointsAwarded: points,
                metadata: { gameId, score },
            }).catch((error: any) => {
                console.warn('Failed to persist arcade claim', error);
            });
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
    }, [dailyState, addPoints, ensureDailyForToday, user?.id, claimRewardMutation]);

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
            const template = state.wheelResult
                ? WHEEL_SEGMENTS.find((item) => item.id === state.wheelResult?.segmentId) ?? WHEEL_SEGMENTS[0]
                : WHEEL_SEGMENTS[0];
            const resolvedPoints = state.wheelResult?.points ?? template.points;
            const segment = {
                ...template,
                points: resolvedPoints,
                label: `${resolvedPoints} pts`,
            };

            return {
                status: 'already_claimed',
                message: 'Ya giraste la rueda hoy. Vuelve mañana.',
                segment,
                pointsAwarded: segment.points,
            };
        }

        const points =
            Math.floor(Math.random() * (WHEEL_POINTS_RANGE.max - WHEEL_POINTS_RANGE.min + 1))
            + WHEEL_POINTS_RANGE.min;
        const segment = {
            ...WHEEL_SEGMENTS[0],
            label: `${points} pts`,
            points,
        };

        setDailyState((prev) => ({
            ...ensureDailyForToday(prev),
            wheelSpun: true,
            wheelResult: {
                segmentId: segment.id,
                points: segment.points,
                spunAt: new Date().toISOString(),
            },
        }));

        if (user?.id) {
            claimRewardMutation({
                actorId: user.id as any,
                userId: user.id,
                claimKey: `wheel_${getTodayKey()}`,
                type: 'lucky_wheel',
                pointsAwarded: segment.points,
                metadata: { segmentId: segment.id },
            }).catch((error: any) => {
                console.warn('Failed to persist wheel claim', error);
            });
        }

        addPoints(segment.points, 'Ruleta de la Suerte Ramgos', {
            source: 'bonus',
            metadata: { segmentId: segment.id },
        });

        return {
            status: 'awarded',
            message: `¡Ganaste ${segment.points} puntos!`,
            pointsAwarded: segment.points,
            segment,
        };
    }, [dailyState, addPoints, ensureDailyForToday, user?.id, claimRewardMutation]);

    const getLuckyWheelStatus = useCallback(() => {
        const state = ensureDailyForToday(dailyState);
        if (!state.wheelResult) {
            return { available: !state.wheelSpun };
        }

        const template = WHEEL_SEGMENTS.find((item) => item.id === state.wheelResult?.segmentId)
            ?? WHEEL_SEGMENTS[0];
        const points = state.wheelResult.points;
        const segment = { ...template, points, label: `${points} pts` };

        const lastResult: LuckyWheelResult = {
            status: 'awarded',
            message: `Ganaste ${segment.points} puntos en tu último giro.`,
            pointsAwarded: segment.points,
            segment,
        };

        return {
            available: !state.wheelSpun,
            lastResult,
        };
    }, [dailyState, ensureDailyForToday]);

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
        if (amount <= 0) return true;
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

    // --- QUARTERLY MISSION LOGIC ---
    const createFreshQuarterlyMission = (quarterKey: string): QuarterlyMissionState => ({
        quarterKey,
        purchasesCurrent: 0,
        purchasesTarget: QUARTERLY_MISSION.TARGET_PURCHASES,
        claimed: false,
        reward: QUARTERLY_MISSION.REWARD
    });

    const [quarterlyMission, setQuarterlyMission] = useState<QuarterlyMissionState>(() => 
        createFreshQuarterlyMission(getQuarterKey())
    );

    const registerQuarterlyPurchase = useCallback(() => {
        setQuarterlyMission(prev => {
            const currentQuarter = getQuarterKey();
            
            // If we crossed into a new quarter, reset
            if (prev.quarterKey !== currentQuarter) {
                return {
                    ...createFreshQuarterlyMission(currentQuarter),
                    purchasesCurrent: 1, // This purchase counts
                };
            }

            if (prev.claimed) return prev; // Already completed this quarter

            const newValue = prev.purchasesCurrent + 1;

            // Check Completion
            if (newValue >= prev.purchasesTarget) {
                if (user?.id) {
                    claimRewardMutation({
                        actorId: user.id as any,
                        userId: user.id,
                        claimKey: `quarterly_${currentQuarter}`,
                        type: 'quarterly_mission',
                        pointsAwarded: QUARTERLY_MISSION.REWARD,
                        metadata: { purchases: newValue },
                    }).catch((error: any) => {
                        console.warn('Failed to persist quarterly mission claim', error);
                    });
                }
                // Award Logic
                addPoints(QUARTERLY_MISSION.REWARD, QUARTERLY_MISSION.DESCRIPTION, {
                    type: 'earn',
                    source: 'bonus'
                });
                show(`¡Misión Trimestral Completada! +${QUARTERLY_MISSION.REWARD} pts 🎯`, 'success');

                return {
                    ...prev,
                    purchasesCurrent: newValue,
                    claimed: true
                };
            }

            // Show progress toast
            const remaining = prev.purchasesTarget - newValue;
            if (remaining > 0) {
                show(`Misión Trimestral: ${newValue}/${prev.purchasesTarget} compras 🛒`, 'info');
            }

            return {
                ...prev,
                purchasesCurrent: newValue
            };
        });
    }, [addPoints, show, user?.id, claimRewardMutation]);

    // --- PET CONFIG LOGIC ---
    const [petConfig, setPetConfig] = useState<PetConfigState>(() => createPetConfigState());

    useEffect(() => {
        if (!user || hydratedRef.current) return;
        const persisted = economyState?.rewardsState;
        if (!persisted) {
            hydratedRef.current = true;
            return;
        }

        if (persisted.dailyState) {
            setDailyState(persisted.dailyState);
        }
        if (persisted.quarterlyMission) {
            const currentQuarter = getQuarterKey();
            const restored = persisted.quarterlyMission as QuarterlyMissionState;
            setQuarterlyMission(
                restored.quarterKey === currentQuarter
                    ? restored
                    : createFreshQuarterlyMission(currentQuarter),
            );
        }
        if (persisted.petConfig) {
            setPetConfig(persisted.petConfig as PetConfigState);
        }
        hydratedRef.current = true;
    }, [user, economyState]);

    useEffect(() => {
        if (!user || !hydratedRef.current) return;
        saveRewardsState({
            actorId: user.id as any,
            userId: user.id,
            rewardsState: {
                dailyState,
                quarterlyMission,
                petConfig,
            },
        }).catch((error: any) => {
            console.warn('Unable to persist rewards state', error);
        });
    }, [user, dailyState, quarterlyMission, petConfig, saveRewardsState]);

    const unlockAccessory = useCallback((type: 'hat' | 'skin', id: string, cost: number): boolean => {
        if (!spendGameCoins(cost)) {
            show('No tienes suficientes monedas', 'error');
            return false;
        }

        setPetConfig((prev) => {
            if (type === 'hat') {
                if (prev.unlockedHats.includes(id)) return prev;
                return { ...prev, unlockedHats: [...prev.unlockedHats, id] };
            }
            if (prev.unlockedSkins.includes(id)) return prev;
            return { ...prev, unlockedSkins: [...prev.unlockedSkins, id] };
        });
        show('¡Accesorio desbloqueado!', 'success');
        return true;
    }, [spendGameCoins, show]);

    const equipAccessory = useCallback((type: 'hat' | 'skin', id: string) => {
        setPetConfig(prev => ({
            ...prev,
            [type === 'hat' ? 'activeHat' : 'activeSkin']: id === 'none' ? null : id
        }));
    }, []);

    const value: RewardsContextType = useMemo(() => ({
        dailyState,
        feedVirtualPet,
        registerArcadeReward,
        getArcadeStatus,
        spinLuckyWheel,
        getLuckyWheelStatus,
        gameCoins: dailyState.gameCoins,
        addGameCoins,
        spendGameCoins,
        quarterlyMission,
        registerQuarterlyPurchase,
        // Pet Config
        petConfig,
        unlockAccessory,
        equipAccessory
    }), [
        dailyState,
        feedVirtualPet,
        getArcadeStatus,
        getLuckyWheelStatus,
        registerArcadeReward,
        spinLuckyWheel,
        addGameCoins,
        spendGameCoins,
        quarterlyMission,
        registerQuarterlyPurchase,
        petConfig,
        unlockAccessory,
        equipAccessory
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

