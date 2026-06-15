import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Share } from 'react-native';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

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

const buildReferralLink = (code: string) => `https://ramgos.app/r/${code}`;

const computeLevel = (invited: number): ReferralStats['level'] => {
    if (invited > 10) return 'Influencer';
    if (invited > 3) return 'Conector';
    return 'Novato';
};

export const ReferralProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { show } = useToast();

    const [referralCode, setReferralCode] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);

    const ensureReferralCodeMutation = useMutation(api.users.ensureReferralCode);
    const redeemReferralCodeMutation = useMutation(api.users.redeemReferralCode);
    const notifyReferralPurchaseMutation = useMutation(api.users.notifyReferralPurchase);
    
    const pointsSummary = useQuery(api.economy.getPointsSummary, user ? { userId: user.id } : "skip");

    useEffect(() => {
        if (!user) {
            setIsLoading(false);
            return;
        }
        
        ensureReferralCodeMutation({ userId: user.id as any }).then(code => {
            setReferralCode(code);
            setIsLoading(false);
        }).catch(err => {
            console.error("Error ensuring referral code", err);
            setIsLoading(false);
        });
    }, [user?.id, ensureReferralCodeMutation]);

    const redeemCode = useCallback(async (rawCode: string) => {
        if (!user) return false;
        const code = rawCode.trim().toUpperCase();

        if (code === referralCode) {
            show('No puedes usar tu propio código.', 'error');
            return false;
        }

        setIsLoading(true);
        try {
            await redeemReferralCodeMutation({ code, userId: user.id });
            show(`¡Código canjeado! +${REFERRAL_WELCOME_BONUS} puntos de bienvenida`, 'success');
            return true;
        } catch (e: any) {
            show(e.message || 'Error al canjear el código.', 'error');
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [user, referralCode, redeemReferralCodeMutation, show]);

    const notifyMyFirstPurchase = useCallback(async (amountUSD: number) => {
        if (!user) return;
        try {
            await notifyReferralPurchaseMutation({ amountUSD, userId: user.id });
        } catch (err) {
            console.error("Error notifying referral purchase", err);
        }
    }, [user, notifyReferralPurchaseMutation]);

    const history: ReferralHistoryItem[] = useMemo(() => {
        if (!pointsSummary) return [];
        return pointsSummary.events
            .filter(e => e.source === 'referral')
            .map(e => {
                let action: ReferralHistoryItem['action'] = 'Registro';
                let userName = 'Referido';
                
                if (e.eventKey.startsWith('ref_welcome_')) {
                    action = 'Bienvenida';
                    userName = 'Tú';
                } else if (e.eventKey.startsWith('ref_signup_')) {
                    action = 'Registro';
                    userName = (e.description.match(/\((.*?)\)/)?.[1]) || 'Nuevo usuario';
                } else if (e.eventKey.startsWith('ref_purchase_')) {
                    action = 'Compra';
                    userName = (e.description.match(/\((.*?)\)/)?.[1]) || 'Tu referido';
                } else if (e.eventKey.startsWith('ref_bonus_')) {
                    action = 'Bono';
                    userName = (e.description.match(/\((.*?)\)/)?.[1]) || 'Tu referido';
                }

                return {
                    id: e._id,
                    date: e.createdAt,
                    user: userName,
                    action,
                    points: e.amount,
                    status: 'completed',
                    metadata: e.metadata,
                };
            });
    }, [pointsSummary]);

    const hasBeenReferred = useMemo(() => {
        return history.some(h => h.action === 'Bienvenida');
    }, [history]);

    const stats: ReferralStats = useMemo(() => {
        const invited = history.filter(h => h.action === 'Registro').length;
        const purchases = history.filter(h => h.action === 'Compra').length;
        const earned = history.filter(h => h.action !== 'Bienvenida').reduce((acc, curr) => acc + curr.points, 0);
        
        return {
            code: referralCode,
            totalInvited: invited,
            totalPurchases: purchases,
            totalEarned: earned,
            pendingRewards: 0,
            level: computeLevel(invited),
        };
    }, [referralCode, history]);

    const referralSummary = useMemo(() => ({
        registrations: stats.totalInvited,
        purchases: stats.totalPurchases,
        totalPoints: stats.totalEarned,
    }), [stats.totalEarned, stats.totalInvited, stats.totalPurchases]);

    const shareReferral = useCallback(async () => {
        const referralLink = buildReferralLink(referralCode);
        const message =
            `¡Únete a Ramgos! Usa mi código ${referralCode} y recibe +${REFERRAL_WELCOME_BONUS} puntos de bienvenida.\n` +
            `${referralLink}`;
        try {
            await Share.share({ message, title: 'Te invito a Ramgos Rewards' });
        } catch (error) {
            console.error('Error al compartir:', error);
        }
    }, [referralCode]);

    const simulateReferral = useCallback(async () => {
        show('La simulación de referidos está deshabilitada (ahora funciona en el backend).', 'info');
    }, [show]);

    const simulateReferralFirstPurchase = useCallback(async (amountUSD = 25) => {
        show('La simulación de referidos está deshabilitada (ahora funciona en el backend).', 'info');
    }, [show]);

    const value: ReferralContextType = {
        referralCode,
        referralLink: buildReferralLink(referralCode),
        stats,
        history,
        referralSummary,
        isLoading,
        shareReferral,
        redeemCode,
        notifyMyFirstPurchase,
        simulateReferral,
        simulateReferralFirstPurchase,
        hasBeenReferred,
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
