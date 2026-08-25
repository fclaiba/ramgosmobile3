// Dual referral: @username (identity) + optional referralAlias (vanity).
// Source of truth: convex/users.getReferralDashboard + updateProfile(referralAlias).
import React, { createContext, useCallback, useMemo } from 'react';
import { Share } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from './AuthContext';
import { referralWebLink } from '../config/appOrigin';

/**
 * Montos de referido — re-exportados de la tabla única del servidor.
 *
 * Antes eran literales propios (5 / 10 / 25) que no coincidían con lo que el
 * servidor acredita en `users.awardReferralOnSignup` (500 / 1000 / 2000). El
 * usuario veía en pantalla un número cien veces menor al que cobraba.
 */
export { REFERRAL_REWARDS } from '../../convex/economy/_rewardRules';

/**
 * Bono de bienvenida al usuario nuevo. Ya no se paga en el alta sino en su
 * primera compra, que es donde el servidor lo acredita.
 */
export const REFERRAL_WELCOME_BONUS = 0;

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
    /** Preferred share code (alias if set, else @username). */
    referralCode: string;
    username: string;
    referralAlias: string;
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
    username: '',
    referralAlias: '',
    referralLink: '',
    referralSummary: { registrations: 0, purchases: 0, totalPoints: 0 },
    history: [],
    generateReferralLink: async () => '',
    shareReferral: async () => {},
    simulateReferral: () => {},
};

const ReferralContext = createContext<ReferralContextValue | null>(null);

function useReferralsState(): ReferralContextValue {
    const { sessionToken } = useAuth();

    const dashboard = useQuery(
        api.users.getReferralDashboard,
        sessionToken ? { sessionToken } : 'skip',
    );

    const username = dashboard?.username ?? '';
    const referralAlias = dashboard?.referralAlias ?? '';
    const referralCode = dashboard?.referralCode ?? '';
    const referralLink = dashboard?.referralLink ?? '';

    const shareReferral = useCallback(async () => {
        if (!referralCode) return;
        const link = referralLink || referralWebLink(referralCode);
        const label = referralAlias
            ? `${referralAlias} (también @${username})`
            : `@${username || referralCode}`;
        await Share.share({
            message: `¡Unite a Ramgos con mi código ${label}! ${link}`,
            url: link,
        });
    }, [referralCode, referralLink, referralAlias, username]);

    const generateReferralLink = useCallback(async () => {
        if (referralLink) return referralLink;
        if (referralCode) return referralWebLink(referralCode);
        return '';
    }, [referralLink, referralCode]);

    return useMemo(() => {
        if (!sessionToken) {
            return guestValue;
        }
        return {
            referrals: dashboard?.referrals ?? [],
            stats: dashboard?.stats ?? guestValue.stats,
            referralCode,
            username,
            referralAlias,
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
        username,
        referralAlias,
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
