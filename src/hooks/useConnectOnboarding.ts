/**
 * useConnectOnboarding — único camino de onboarding de Stripe Connect en el
 * cliente (lo usan BusinessDashboard, InfluencerDashboard y Withdrawal).
 *
 *   start()   → ensureConnectAccount → createOnboardingLink → abre el
 *               onboarding hosted de Stripe en un browser de auth
 *               (`WebBrowser.openAuthSessionAsync`) que vuelve a la app por
 *               `ramgos://connect/return?mode=…` → refresh().
 *   refresh() → getAccountStatus (lee Stripe en vivo y persiste); la query
 *               reactiva `getMyConnectStatus` actualiza la UI sola.
 *
 * El estado viene de `api.connect.getMyConnectStatus` (reactivo, por modo),
 * NO del objeto `user` de la sesión, que no incluye la cuenta Connect.
 */
import { useCallback, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';
import { usePaymentMode, type PaymentMode } from '../contexts/PaymentModeContext';

export type ConnectCaps = {
    transfersStatus?: string;
    payoutsStatus?: string;
    requirementsStatus?: string;
    onboardingComplete: boolean;
    updatedAt: string;
};

export type ConnectStatus = {
    mode: PaymentMode;
    accountId: string | null;
    status: 'none' | 'pending' | 'active' | 'rejected';
    caps: ConnectCaps | null;
    readyToReceivePayments: boolean;
    canPayout: boolean;
    modeConfigured: boolean;
};

export function useConnectOnboarding(options?: { mode?: PaymentMode; userId?: string; displayName?: string }) {
    const { user, sessionToken } = useAuth();
    const { mode: contextMode } = usePaymentMode();
    const mode = options?.mode ?? contextMode;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const status = useQuery(
        api.connect.getMyConnectStatus,
        sessionToken ? { sessionToken, mode, ...(options?.userId ? { userId: options.userId } : {}) } : 'skip',
    ) as ConnectStatus | undefined;

    const ensureConnectAccount = useAction(api.connect.ensureConnectAccount);
    const createOnboardingLink = useAction(api.connect.createOnboardingLink);
    const getAccountStatus = useAction(api.connect.getAccountStatus);

    const refresh = useCallback(async () => {
        if (!sessionToken) return null;
        try {
            return await getAccountStatus({ sessionToken, mode, ...(options?.userId ? { userId: options.userId } : {}) });
        } catch (e: any) {
            console.warn('[Connect] refresh failed', e?.message ?? e);
            return null;
        }
    }, [sessionToken, mode, options?.userId, getAccountStatus]);

    const start = useCallback(async () => {
        if (!user || !sessionToken) {
            setError('Iniciá sesión primero');
            return false;
        }
        setLoading(true);
        setError(null);
        try {
            await ensureConnectAccount({
                sessionToken,
                mode,
                ...(options?.userId ? { userId: options.userId } : {}),
                displayName: options?.displayName || (user as any).name || undefined,
                contactEmail: (user as any).email || undefined,
            });
            const link = await createOnboardingLink({
                sessionToken,
                mode,
                ...(options?.userId ? { userId: options.userId } : {}),
            });
            if (Platform.OS === 'web') {
                // En web no hay sesión de auth: se abre en la misma pestaña y
                // Stripe vuelve por el return_url (deep link universal).
                await Linking.openURL(link.url);
            } else {
                await WebBrowser.openAuthSessionAsync(link.url, link.returnUrl);
            }
            await refresh();
            return true;
        } catch (e: any) {
            const msg = e?.message || 'Error al iniciar el onboarding de Stripe';
            setError(msg);
            return false;
        } finally {
            setLoading(false);
        }
    }, [user, sessionToken, mode, options?.userId, options?.displayName, ensureConnectAccount, createOnboardingLink, refresh]);

    return {
        mode,
        status,
        accountId: status?.accountId ?? null,
        isReady: !!status?.readyToReceivePayments,
        canPayout: !!status?.canPayout,
        isPending: !!status?.accountId && !status?.readyToReceivePayments,
        modeConfigured: status?.modeConfigured ?? true,
        loading,
        error,
        start,
        refresh,
    };
}
