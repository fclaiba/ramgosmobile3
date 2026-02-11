import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { usePoints } from './PointsContext';
import { useToast } from './ToastContext';

// Constitución (Rewards v2): reglas exactas de referidos (único dueño: ReferralContext)
export const REFERRAL_REWARDS = {
    REGISTER: 5,
    FIRST_PURCHASE: 10,
    HIGH_TICKET: 25,
} as const;

export const REFERRAL_WELCOME_BONUS = 10 as const;
export const REFERRAL_HIGH_TICKET_THRESHOLD_USD = 100 as const;

type ReferralEventType =
    | 'REGISTER'
    | 'FIRST_PURCHASE'
    | 'HIGH_TICKET'
    | 'WELCOME';

export interface ReferralHistoryItem {
    id: string;
    date: string;
    user: string;
    action: 'Registro' | 'Compra' | 'Bono' | 'Bienvenida';
    points: number;
    status: 'completed';
    metadata?: Record<string, unknown>;
}

export interface ReferralStats {
    code: string;
    totalInvited: number;
    totalPurchases: number;
    totalEarned: number;
    pendingRewards: number;
    level: 'Novato' | 'Conector' | 'Influencer';
}

interface ReferralState {
    ownerId: string;
    referralCode: string;
    hasBeenReferred: boolean;
    referredByUserId?: string;
    referredByCode?: string;
    firstPurchaseCreditedToReferrer: boolean;
    totals: {
        invited: number;
        purchases: number;
        earned: number;
    };
    history: ReferralHistoryItem[];
}

interface ReferralContextType {
    referralCode: string;
    referralLink: string;
    stats: ReferralStats;
    history: ReferralHistoryItem[];
    referralSummary: {
        registrations: number;
        purchases: number;
        totalPoints: number;
    };
    isLoading: boolean;
    shareReferral: () => Promise<void>;
    redeemCode: (code: string) => Promise<boolean>;
    notifyMyFirstPurchase: (amountUSD: number) => Promise<void>;
    simulateReferral: () => Promise<void>;
    simulateReferralFirstPurchase: (amountUSD?: number) => Promise<void>;
    hasBeenReferred: boolean;
}

const ReferralContext = createContext<ReferralContextType | undefined>(undefined);

const STORAGE_PREFIX = '@ramgos/referrals/user/';
const REGISTRY_KEY = '@ramgos/referrals/registry';

const sanitizeId = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
const buildReferralCode = (userId: string) => `RAMGOS-${sanitizeId(userId).padStart(6, '0').slice(-6)}`;
const buildReferralLink = (code: string) => `https://ramgos.app/r/${code}`;
const nowIso = () => new Date().toISOString();
const makeId = () => `ref_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const computeLevel = (invited: number): ReferralStats['level'] => {
    if (invited > 10) return 'Influencer';
    if (invited > 3) return 'Conector';
    return 'Novato';
};

const emptyStateFor = (ownerId: string): ReferralState => {
    const code = buildReferralCode(ownerId);
    return {
        ownerId,
        referralCode: code,
        hasBeenReferred: false,
        referredByUserId: undefined,
        referredByCode: undefined,
        firstPurchaseCreditedToReferrer: false,
        totals: { invited: 0, purchases: 0, earned: 0 },
        history: [],
    };
};

async function loadRegistry(): Promise<Record<string, string>> {
    try {
        const raw = await AsyncStorage.getItem(REGISTRY_KEY);
        return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
        return {};
    }
}

async function saveRegistry(registry: Record<string, string>) {
    await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
}

async function upsertRegistry(code: string, ownerId: string) {
    const registry = await loadRegistry();
    if (registry[code] === ownerId) return;
    registry[code] = ownerId;
    await saveRegistry(registry);
}

async function loadUserState(ownerId: string): Promise<ReferralState> {
    const key = `${STORAGE_PREFIX}${ownerId}`;
    try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return emptyStateFor(ownerId);
        const parsed = JSON.parse(raw) as ReferralState;
        return { ...emptyStateFor(ownerId), ...parsed, ownerId };
    } catch {
        return emptyStateFor(ownerId);
    }
}

async function saveUserState(state: ReferralState) {
    const key = `${STORAGE_PREFIX}${state.ownerId}`;
    await AsyncStorage.setItem(key, JSON.stringify(state));
}

export const ReferralProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { addPoints } = usePoints();
    const { show } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [state, setState] = useState<ReferralState | null>(null);
    const [pendingAutoRedeemCheckedFor, setPendingAutoRedeemCheckedFor] = useState<string | null>(null);

    const redeemCode = useCallback(async (rawCode: string) => {
        if (!state) return false;
        const code = rawCode.trim().toUpperCase();

        if (state.hasBeenReferred) {
            show('Ya has canjeado un código de referido antes.', 'error');
            return false;
        }
        if (code === state.referralCode) {
            show('No puedes usar tu propio código.', 'error');
            return false;
        }
        if (!code.startsWith('RAMGOS-')) {
            show('Código inválido. Formato: RAMGOS-XXXXXX', 'error');
            return false;
        }

        setIsLoading(true);
        try {
            const registry = await loadRegistry();
            const referrerUserId = registry[code];
            if (!referrerUserId) {
                show('Código no encontrado.', 'error');
                return false;
            }

            // 1) Bienvenida al amigo (+10)
            addPoints(REFERRAL_WELCOME_BONUS, `Bono de bienvenida (${code})`, { type: 'earn', source: 'referral' });

            const welcomeItem: ReferralHistoryItem = {
                id: makeId(),
                date: nowIso(),
                user: 'Tú',
                action: 'Bienvenida',
                points: REFERRAL_WELCOME_BONUS,
                status: 'completed',
                metadata: { referralCode: code, referrerUserId },
            };

            const nextSelf: ReferralState = {
                ...state,
                hasBeenReferred: true,
                referredByUserId: referrerUserId,
                referredByCode: code,
                totals: { ...state.totals, earned: state.totals.earned + REFERRAL_WELCOME_BONUS },
                history: [welcomeItem, ...state.history],
            };
            setState(nextSelf);

            // 2) Registro del amigo (+5) para el referrer
            const referrerState = await loadUserState(referrerUserId);
            const signupItem: ReferralHistoryItem = {
                id: makeId(),
                date: nowIso(),
                user: user?.name?.trim() || 'Nuevo usuario',
                action: 'Registro',
                points: REFERRAL_REWARDS.REGISTER,
                status: 'completed',
                metadata: { friendUserId: state.ownerId, referralCode: code },
            };
            await saveUserState({
                ...referrerState,
                totals: {
                    invited: referrerState.totals.invited + 1,
                    purchases: referrerState.totals.purchases,
                    earned: referrerState.totals.earned + REFERRAL_REWARDS.REGISTER,
                },
                history: [signupItem, ...referrerState.history],
            });

            show(`¡Código canjeado! +${REFERRAL_WELCOME_BONUS} puntos de bienvenida`, 'success');
            return true;
        } catch (e) {
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, [addPoints, show, state, user?.name]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const ownerId = user?.id ?? 'guest';
            setIsLoading(true);
            const loaded = await loadUserState(ownerId);
            await upsertRegistry(loaded.referralCode, ownerId);
            if (!cancelled) {
                setState(loaded);
                setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [user?.id]);

    useEffect(() => {
        if (!state) return;
        saveUserState(state).catch((err) => console.warn('Unable to persist referral state', err));
    }, [state]);

    // If registration stored a pending referral code, auto-redeem it on first authenticated load.
    useEffect(() => {
        if (!state) return;
        if (state.ownerId === 'guest') return;
        if (pendingAutoRedeemCheckedFor === state.ownerId) return;
        setPendingAutoRedeemCheckedFor(state.ownerId);

        (async () => {
            const pendingKey = `@ramgos/referrals/pending/${state.ownerId}`;
            const pendingCode = await AsyncStorage.getItem(pendingKey);
            if (!pendingCode) return;
            if (state.hasBeenReferred) {
                await AsyncStorage.removeItem(pendingKey);
                return;
            }
            // Best-effort: redeem and then clear pending.
            await redeemCode(pendingCode);
            await AsyncStorage.removeItem(pendingKey);
        })().catch((err) => console.warn('Unable to auto-redeem pending referral', err));
    }, [pendingAutoRedeemCheckedFor, state, redeemCode]);

    const referralCode = state?.referralCode ?? buildReferralCode(user?.id ?? 'guest');
    const referralLink = buildReferralLink(referralCode);

    const stats: ReferralStats = useMemo(() => {
        const invited = state?.totals.invited ?? 0;
        const purchases = state?.totals.purchases ?? 0;
        const earned = state?.totals.earned ?? 0;
        return {
            code: referralCode,
            totalInvited: invited,
            totalPurchases: purchases,
            totalEarned: earned,
            pendingRewards: 0,
            level: computeLevel(invited),
        };
    }, [referralCode, state?.totals.earned, state?.totals.invited, state?.totals.purchases]);

    const history = state?.history ?? [];
    const referralSummary = useMemo(() => ({
        registrations: stats.totalInvited,
        purchases: stats.totalPurchases,
        totalPoints: stats.totalEarned,
    }), [stats.totalEarned, stats.totalInvited, stats.totalPurchases]);

    const shareReferral = useCallback(async () => {
        const message =
            `¡Únete a Ramgos! Usa mi código ${referralCode} y recibe +${REFERRAL_WELCOME_BONUS} puntos de bienvenida.\n` +
            `${referralLink}`;
        try {
            await Share.share({ message, title: 'Te invito a Ramgos Rewards' });
        } catch (error) {
            console.error('Error al compartir:', error);
        }
    }, [referralCode, referralLink]);

    const notifyMyFirstPurchase = useCallback(async (amountUSD: number) => {
        if (!state?.hasBeenReferred || !state.referredByUserId) return;
        if (state.firstPurchaseCreditedToReferrer) return;

        const referrerUserId = state.referredByUserId;
        const referrerState = await loadUserState(referrerUserId);

        const baseItem: ReferralHistoryItem = {
            id: makeId(),
            date: nowIso(),
            user: user?.name?.trim() || 'Tu referido',
            action: 'Compra',
            points: REFERRAL_REWARDS.FIRST_PURCHASE,
            status: 'completed',
            metadata: { amountUSD, friendUserId: state.ownerId },
        };

        const highTicket = amountUSD > REFERRAL_HIGH_TICKET_THRESHOLD_USD;
        const bonusItem: ReferralHistoryItem | null = highTicket
            ? {
                id: makeId(),
                date: nowIso(),
                user: user?.name?.trim() || 'Tu referido',
                action: 'Bono',
                points: REFERRAL_REWARDS.HIGH_TICKET,
                status: 'completed',
                metadata: { amountUSD, friendUserId: state.ownerId },
            }
            : null;

        const credited = REFERRAL_REWARDS.FIRST_PURCHASE + (highTicket ? REFERRAL_REWARDS.HIGH_TICKET : 0);

        await saveUserState({
            ...referrerState,
            totals: {
                invited: referrerState.totals.invited,
                purchases: referrerState.totals.purchases + 1,
                earned: referrerState.totals.earned + credited,
            },
            history: bonusItem ? [bonusItem, baseItem, ...referrerState.history] : [baseItem, ...referrerState.history],
        });

        setState((prev) => (prev ? { ...prev, firstPurchaseCreditedToReferrer: true } : prev));
    }, [state, user?.name]);

    const simulateReferral = useCallback(async () => {
        if (!__DEV__) return;
        if (!state) return;
        const newFriend = `Usuario_${Math.floor(Math.random() * 1000)}`;
        addPoints(REFERRAL_REWARDS.REGISTER, `Referido: ${newFriend}`, { type: 'earn', source: 'referral' });
        const item: ReferralHistoryItem = {
            id: makeId(),
            date: nowIso(),
            user: newFriend,
            action: 'Registro',
            points: REFERRAL_REWARDS.REGISTER,
            status: 'completed',
        };
        setState((prev) => prev ? ({
            ...prev,
            totals: { ...prev.totals, invited: prev.totals.invited + 1, earned: prev.totals.earned + REFERRAL_REWARDS.REGISTER },
            history: [item, ...prev.history],
        }) : prev);
        show(`Simulado: +${REFERRAL_REWARDS.REGISTER} puntos`, 'success');
    }, [addPoints, show, state]);

    const simulateReferralFirstPurchase = useCallback(async (amountUSD = 25) => {
        if (!__DEV__) return;
        if (!state) return;
        const firstRegistered = state.history.find((item) => item.action === 'Registro');
        if (!firstRegistered) {
            show('Primero simula un registro de referido.', 'info');
            return;
        }

        const baseReward = REFERRAL_REWARDS.FIRST_PURCHASE;
        const highTicketReward = amountUSD > REFERRAL_HIGH_TICKET_THRESHOLD_USD ? REFERRAL_REWARDS.HIGH_TICKET : 0;
        const totalReward = baseReward + highTicketReward;

        addPoints(totalReward, `Referido compra: ${firstRegistered.user}`, { type: 'earn', source: 'referral' });
        setState((prev) => prev ? ({
            ...prev,
            totals: {
                invited: prev.totals.invited,
                purchases: prev.totals.purchases + 1,
                earned: prev.totals.earned + totalReward,
            },
            history: [
                ...(highTicketReward ? [{
                    id: makeId(),
                    date: nowIso(),
                    user: firstRegistered.user,
                    action: 'Bono' as const,
                    points: highTicketReward,
                    status: 'completed' as const,
                }] : []),
                {
                    id: makeId(),
                    date: nowIso(),
                    user: firstRegistered.user,
                    action: 'Compra' as const,
                    points: baseReward,
                    status: 'completed' as const,
                },
                ...prev.history,
            ],
        }) : prev);
        show(`Simulado: compra referido +${totalReward} puntos`, 'success');
    }, [addPoints, show, state]);

    const value: ReferralContextType = {
        referralCode,
        referralLink,
        stats,
        history,
        referralSummary,
        isLoading,
        shareReferral,
        redeemCode,
        notifyMyFirstPurchase,
        simulateReferral,
        simulateReferralFirstPurchase,
        hasBeenReferred: Boolean(state?.hasBeenReferred),
    };

    return <ReferralContext.Provider value={value}>{children}</ReferralContext.Provider>;
};

export const useReferral = () => {
    const context = useContext(ReferralContext);
    if (!context) {
        throw new Error('useReferral debe usarse dentro de un ReferralProvider');
    }
    return context;
};
