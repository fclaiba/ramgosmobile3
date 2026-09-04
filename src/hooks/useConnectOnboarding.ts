/**
 * useConnectOnboarding — único camino de onboarding de Stripe Connect en el
 * cliente (lo usan BusinessDashboard, InfluencerDashboard y Withdrawal).
 *
 *   start()   → ensureConnectAccount → createOnboardingLink → abre el
 *               onboarding hosted de Stripe en un browser de auth
 *               (`WebBrowser.openAuthSessionAsync`) que vuelve por
 *               `https://…/connect/return?mode=…` → refresh(). Stripe exige
 *               https, así que el retorno entra por universal link (nativo)
 *               o por la ruta web; ver `convex/_connectReturnUrl.ts`.
 *   refresh() → getAccountStatus (lee Stripe en vivo y persiste); la query
 *               reactiva `getMyConnectStatus` actualiza la UI sola.
 *
 * El estado viene de `api.connect.getMyConnectStatus` (reactivo, por modo),
 * NO del objeto `user` de la sesión, que no incluye la cuenta Connect.
 *
 * `phase` es la ÚNICA fuente de verdad para ramificar en la UI. Ramificar por
 * "¿existe accountId?" es un bug: `ensureConnectAccount` persiste la cuenta
 * ANTES de que el usuario complete el formulario de Stripe, así que quien
 * cancela a mitad queda con cuenta, sin poder cobrar, y sin ningún botón para
 * reintentar (E-148).
 */
import { useCallback, useMemo, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';
import { usePaymentMode, type PaymentMode } from '../contexts/PaymentModeContext';
import { setConnectReturnTarget, type ConnectReturnTarget } from './connectReturnTarget';

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

/**
 * Fase de la cuenta conectada. Centraliza el branching que antes cada
 * pantalla resolvía a mano (y el Influencer resolvía mal).
 *
 *   loading      → la query reactiva todavía no respondió; NO mostrar "no
 *                  tenés cuenta", que produce un flash de estado equivocado.
 *   unconfigured → no hay clave de Stripe para este modo: no ofrecer CTA.
 *   none         → sin cuenta → "Conectar cuenta de pagos".
 *   pending      → hay cuenta pero faltan datos → "Continuar onboarding".
 *   review       → datos completos, Stripe revisando → "Actualizar estado".
 *   ready        → puede cobrar.
 */
export type ConnectPhase = 'loading' | 'unconfigured' | 'none' | 'pending' | 'review' | 'ready';

export type ConnectStartOutcome =
    /** El auth session devolvió `success`. */
    | 'completed'
    /** Volvió sin confirmación explícita (cancel/dismiss en nativo). */
    | 'returned'
    /** Web: se navegó fuera, no hay resultado sincrónico. */
    | 'redirected'
    | 'error'
    | 'unauthenticated';

export type ConnectStartResult = {
    outcome: ConnectStartOutcome;
    /** Verdad leída de Stripe DESPUÉS del refresh, no del browser. */
    ready: boolean;
    accountId: string | null;
    message?: string;
};

export type ConnectRefreshResult = {
    ok: boolean;
    status: ConnectStatus | null;
    message?: string;
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

    /**
     * Ya no se traga los errores: la pantalla de saldo necesita poder decir
     * "no pudimos verificar, reintentá" en vez de mostrar un cero falso.
     */
    const refresh = useCallback(async (): Promise<ConnectRefreshResult> => {
        if (!sessionToken) {
            return { ok: false, status: null, message: 'Todavía no cargó tu sesión.' };
        }
        try {
            const next = await getAccountStatus({
                sessionToken,
                mode,
                ...(options?.userId ? { userId: options.userId } : {}),
            });
            return { ok: true, status: next as ConnectStatus };
        } catch (e: any) {
            const message = e?.message || 'No se pudo verificar tu cuenta en Stripe.';
            console.warn('[Connect] refresh failed', message);
            return { ok: false, status: null, message };
        }
    }, [sessionToken, mode, options?.userId, getAccountStatus]);

    const start = useCallback(
        async (startOptions?: { returnTo?: ConnectReturnTarget }): Promise<ConnectStartResult> => {
            if (!user || !sessionToken) {
                const message = 'Iniciá sesión primero';
                setError(message);
                return { outcome: 'unauthenticated', ready: false, accountId: null, message };
            }
            setLoading(true);
            setError(null);
            setConnectReturnTarget(startOptions?.returnTo ?? null);
            try {
                await ensureConnectAccount({
                    sessionToken,
                    mode,
                    ...(options?.userId ? { userId: options.userId } : {}),
                    displayName: options?.displayName || (user as any).name || undefined,
                    contactEmail: (user as any).email || undefined,
                });
                // En web hay que volver al origen desde el que se arrancó: mandar
                // al dev de localhost a ramgos.app lo deja en producción y con
                // otra sesión. El servidor lo valida contra una allowlist.
                const returnOrigin =
                    Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
                const link = await createOnboardingLink({
                    sessionToken,
                    mode,
                    ...(options?.userId ? { userId: options.userId } : {}),
                    ...(returnOrigin ? { returnOrigin } : {}),
                });

                let outcome: ConnectStartOutcome;
                if (Platform.OS === 'web') {
                    // En web no hay sesión de auth: se abre en la misma pestaña y
                    // Stripe vuelve por el return_url (deep link universal).
                    await Linking.openURL(link.url);
                    outcome = 'redirected';
                } else {
                    const result = await WebBrowser.openAuthSessionAsync(link.url, link.returnUrl);
                    outcome = result?.type === 'success' ? 'completed' : 'returned';
                }

                // La verdad la decide Stripe, no el browser. Con `returnUrl`
                // https (que Stripe exige) la sesión de auth casi nunca resuelve
                // 'success' aunque el onboarding se haya completado: el universal
                // link reabre la app por su cuenta y el browser queda en
                // 'dismiss'. Por eso el outcome es sólo telemetría y `ready` sale
                // de releer la cuenta.
                const refreshed = await refresh();
                const next = refreshed.status;
                return {
                    outcome,
                    ready: next ? next.canPayout : !!status?.canPayout,
                    accountId: next ? next.accountId : (status?.accountId ?? null),
                };
            } catch (e: any) {
                const message = e?.message || 'Error al iniciar el onboarding de Stripe';
                setError(message);
                setConnectReturnTarget(null);
                return { outcome: 'error', ready: false, accountId: status?.accountId ?? null, message };
            } finally {
                setLoading(false);
            }
        },
        [
            user,
            sessionToken,
            mode,
            options?.userId,
            options?.displayName,
            ensureConnectAccount,
            createOnboardingLink,
            refresh,
            status,
        ],
    );

    const phase = useMemo<ConnectPhase>(() => {
        if (!sessionToken || status === undefined) return 'loading';
        if (!status.modeConfigured) return 'unconfigured';
        if (!status.accountId) return 'none';
        if (status.canPayout) return 'ready';
        return status.caps?.onboardingComplete ? 'review' : 'pending';
    }, [sessionToken, status]);

    return {
        mode,
        status,
        phase,
        /** La query reactiva todavía no respondió. */
        statusLoading: !!sessionToken && status === undefined,
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
