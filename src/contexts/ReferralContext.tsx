// Opción A — referidos reales desde convex/users.ts (getReferralDashboard + ensureReferralCode).
import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { Share } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from './AuthContext';

/** Business constants — locked by constitution.test.tsx */
export const REFERRAL_REWARDS = {
    REGISTER: 5,
    FIRST_PURCHASE: 10,
    HIGH_TICKET: 25,
} as const;

export const REFERRAL_WELCOME_BONUS = 10;

export interface ReferralStats {
    totalInvited: number;
    totalEarned: number;
    level: number;
}

export interface ReferralHistoryItem {
    id: string;
    name: string;
    status: string;
    earned: number;
    date: string;
    user?: string;
    action?: string;
    points?: number;
}

export interface ReferralContextValue {
    referrals: ReferralHistoryItem[];
    stats: ReferralStats;
    referralCode: string;
    referralLink: string;
    referralSummary: { registrations: number; purchases: number; totalPoints: number };
    history: ReferralHistoryItem[];
    generateReferralLink: () => Promise<string>;
    shareReferral: () => Promise<void>;
    simulateReferral: () => void;
}

const guestValue: ReferralContextValue = {
    referrals: [],
    stats: { totalInvited: 0, totalEarned: 0, level: 1 },
    referralCode: '',
    referralLink: '',
    referralSummary: { registrations: 0, purchases: 0, totalPoints: 0 },
    history: [],
    generateReferralLink: async () => '',
    shareReferral: async () => {},
    simulateReferral: () => {},
};

const ReferralContext = createContext<ReferralContextValue | null>(null);

function useReferralsState(): ReferralContextValue {
    const { user, sessionToken } = useAuth();

    const dashboard = useQuery(
        api.users.getReferralDashboard,
        sessionToken ? { sessionToken } : 'skip',
    );

    const ensureReferralCodeMutation = useMutation(api.users.ensureReferralCode);

    useEffect(() => {
        if (user?.id && sessionToken && dashboard && !dashboard.referralCode) {
            ensureReferralCodeMutation({ sessionToken, userId: user.id }).catch(console.error);
        }
    }, [user?.id, sessionToken, dashboard, ensureReferralCodeMutation]);

    const referralCode = dashboard?.referralCode ?? '';
    const referralLink = dashboard?.referralLink ?? '';

    const shareReferral = useCallback(async () => {
        if (!referralCode) return;
        const link = referralLink || `https://ramgos.com/ref/${referralCode}`;
        await Share.share({
            message: `¡Unite a Ramgos con mi código ${referralCode}! ${link}`,
            url: link,
        });
    }, [referralCode, referralLink]);

    const generateReferralLink = useCallback(async () => {
        if (referralLink) return referralLink;
        if (!sessionToken || !user?.id) return '';
        const code = await ensureReferralCodeMutation({ sessionToken, userId: user.id });
        return `https://ramgos.com/ref/${code}`;
    }, [referralLink, ensureReferralCodeMutation, sessionToken, user?.id]);

    return useMemo(() => {
        if (!sessionToken) {
            return guestValue;
        }
        return {
            referrals: dashboard?.referrals ?? [],
            stats: dashboard?.stats ?? guestValue.stats,
            referralCode,
            referralLink,
            referralSummary: dashboard?.referralSummary ?? guestValue.referralSummary,
            history: dashboard?.history ?? [],
            generateReferralLink,
            shareReferral,
            simulateReferral: () => {},
        };
    }, [
        sessionToken,
        dashboard,
        referralCode,
        referralLink,
        generateReferralLink,
        shareReferral,
    ]);
}

export function ReferralProvider({ children }: { children: React.ReactNode }) {
    const value = useReferralsState();
    return <ReferralContext.Provider value={value}>{children}</ReferralContext.Provider>;
}

export function useReferrals(): ReferralContextValue {
    return useReferralsState();
}

export const useReferral = useReferrals;
