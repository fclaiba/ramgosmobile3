import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Alert } from 'react-native';
import {
    mockConvexStore,
    type AuthResult,
    type AuthUserRole,
    type PublicUser,
    type ResendVerificationResult,
    type SessionRecord,
    type SignUpInput,
    type SignUpResult,
    type SocialProfile,
    type SocialProvider,
    CURRENT_SESSION_KEY,
} from '../services/auth/mockConvexStore';
import { storage } from '../services/auth/storageAdapter';

type UserRole = AuthUserRole;
type AuthStatus = 'loading' | 'anonymous' | 'pending_verification' | 'authenticated';

interface PendingVerificationState {
    email: string;
    expiresAt: number;
    userId: string;
    code?: string;
    user?: PublicUser;
}

interface AuthState {
    status: AuthStatus;
    user: PublicUser | null;
    session: SessionRecord | null;
    deviceId?: string;
    pendingVerification?: PendingVerificationState;
    lastError?: string | null;
}

interface AuthFlowDecision {
    user: PublicUser;
    nextRoute: { screen: string; params?: Record<string, unknown> } | null;
    requiresKyc: boolean;
    kycStatus: PublicUser['kycStatus'];
}

interface AuthContextType {
    status: AuthStatus;
    isAuthenticated: boolean;
    isProcessing: boolean;
    user: PublicUser | null;
    session: SessionRecord | null;
    deviceId?: string;
    pendingVerification?: PendingVerificationState;
    signUpWithEmail: (payload: SignUpInput) => Promise<SignUpResult>;
    verifyEmailCode: (code: string) => Promise<AuthFlowDecision>;
    resendVerificationCode: () => Promise<PendingVerificationState>;
    loginWithEmail: (email: string, password: string) => Promise<AuthFlowDecision>;
    loginWithSocial: (
        provider: SocialProvider,
        profile?: SocialProfile,
        roleOverride?: UserRole,
    ) => Promise<AuthFlowDecision>;
    logout: (force?: boolean) => Promise<void>;
    updateRole: (role: UserRole) => Promise<void>;
    requireAuth: (callback: () => void, options?: { prompt?: boolean; message?: string }) => boolean;
    requireKycFor: (
        scope: 'financial' | 'withdraw' | 'business' | 'influencer',
        onGranted: () => void,
        options?: { onBlocked?: () => void; message?: string },
    ) => boolean;
    refreshActiveSession: () => Promise<void>;
    markKycSubmitted: (data: Record<string, unknown>) => Promise<void>;
    updateProfile: (updates: { nickname?: string; avatar?: string }) => Promise<void>;
    clearPendingVerification: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const resolveNextRoute = (user: PublicUser): AuthFlowDecision['nextRoute'] => {
    // 0. Security Check: Banned/Suspended users are blocked immediately
    if (user.status === 'banned' || user.status === 'suspended') {
        return { screen: 'BannedUser' };
    }

    // 1. KYC Check (Enforced only if required and status is unverified or rejected)
    // Pending users are allowed to enter (limited access or waiting mode)
    if (user.requiresKyc && (user.kycStatus === 'unverified' || user.kycStatus === 'rejected')) {
        return {
            screen: 'KYC',
            params: { accountType: user.role }
        };
    }

    // 2. All users must have a basic profile (nickname)
    if (!user.nickname) {
        return { screen: 'BasicProfileSetup' };
    }

    // 3. Otherwise, go Home (Dashboards are accessed via the navbar)
    return { screen: 'Home' };
};

const normalizeVerification = (
    payload: ResendVerificationResult,
    user?: PublicUser | null,
): PendingVerificationState => ({
    email: payload.email,
    expiresAt: payload.expiresAt,
    userId: payload.userId,
    code: __DEV__ ? payload.code : undefined,
    user: user ?? undefined,
});

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth debe usarse dentro de AuthProvider');
    }
    return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<AuthState>({
        status: 'loading',
        user: null,
        session: null,
        pendingVerification: undefined,
        deviceId: undefined,
        lastError: null,
    });
    const [isProcessing, setIsProcessing] = useState(false);

    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const refreshActiveSessionRef = useRef<() => Promise<void>>(undefined);
    const sessionRef = useRef<SessionRecord | null>(null);

    const scheduleRefresh = useCallback((session: SessionRecord) => {
        if (refreshTimer.current) {
            clearTimeout(refreshTimer.current);
        }
        const now = Date.now();
        const msUntilExpiry = session.expiresAt - now;
        const refreshDelay = Math.max(msUntilExpiry - 30_000, 15_000);
        refreshTimer.current = setTimeout(() => {
            refreshActiveSessionRef.current?.().catch((error) => {
                console.warn('[Auth] Refresh failed', error);
            });
        }, refreshDelay);
    }, []);

    const updateStateWithAuth = useCallback(
        (result: AuthResult) => {
            sessionRef.current = result.session;
            setState((prev) => ({
                status: 'authenticated',
                user: result.user,
                session: result.session,
                deviceId: prev.deviceId,
                pendingVerification: undefined,
                lastError: null,
            }));
            scheduleRefresh(result.session);
        },
        [scheduleRefresh],
    );

    const logout = useCallback(
        async (force = false) => {
            const current = sessionRef.current;
            try {
                if (current && !force) {
                    await mockConvexStore.revokeSession(current.id);
                }
            } finally {
                sessionRef.current = null;
                if (refreshTimer.current) {
                    clearTimeout(refreshTimer.current);
                    refreshTimer.current = null;
                }
                await storage.removeItem(CURRENT_SESSION_KEY);
                setState((prev) => ({
                    ...prev,
                    status: 'anonymous',
                    user: null,
                    session: null,
                    pendingVerification: undefined,
                }));
            }
        },
        [],
    );

    const refreshActiveSession = useCallback(async () => {
        const current = sessionRef.current;
        if (!current) {
            return;
        }
        try {
            const refreshed = await mockConvexStore.refreshSession(current.refreshToken);
            updateStateWithAuth(refreshed);
        } catch (error) {
            console.warn('[Auth] refreshActiveSession error', error);
            await logout(true);
            const message =
                error instanceof Error
                    ? error.message
                    : 'La sesión ha expirado. Inicia sesión nuevamente.';
            setState((prev) => ({
                ...prev,
                status: 'anonymous',
                lastError: message,
            }));
        }
    }, [logout, updateStateWithAuth]);

    refreshActiveSessionRef.current = refreshActiveSession;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                await mockConvexStore.init();
                const deviceId = await mockConvexStore.ensureDeviceId();
                if (cancelled) return;
                setState((prev) => ({
                    ...prev,
                    deviceId,
                }));

                const storedSessionId = await storage.getItem(CURRENT_SESSION_KEY);
                if (!storedSessionId) {
                    if (!cancelled) {
                        setState((prev) => ({
                            ...prev,
                            status: 'anonymous',
                        }));
                    }
                    return;
                }

                const result = await mockConvexStore.getSessionById(storedSessionId);
                if (!result) {
                    await storage.removeItem(CURRENT_SESSION_KEY);
                    if (!cancelled) {
                        setState((prev) => ({
                            ...prev,
                            status: 'anonymous',
                            user: null,
                            session: null,
                        }));
                    }
                    return;
                }

                if (!cancelled) {
                    updateStateWithAuth(result);
                }
            } catch (error) {
                console.error('[Auth] init error', error);
                if (!cancelled) {
                    setState((prev) => ({
                        ...prev,
                        status: 'anonymous',
                        lastError:
                            error instanceof Error ? error.message : 'No se pudo iniciar la sesión.',
                    }));
                }
            }
        })();

        return () => {
            cancelled = true;
            if (refreshTimer.current) {
                clearTimeout(refreshTimer.current);
            }
        };
    }, [updateStateWithAuth]);

    useEffect(() => {
        sessionRef.current = state.session;
    }, [state.session]);

    const signUpWithEmail = useCallback(
        async (payload: SignUpInput) => {
            setIsProcessing(true);
            try {
                const result = await mockConvexStore.signUpWithEmail(payload);
                setState((prev) => ({
                    ...prev,
                    status: 'pending_verification',
                    user: null,
                    session: null,
                    pendingVerification: {
                        email: result.user.email,
                        expiresAt: result.verification.expiresAt,
                        userId: result.userId,
                        code: __DEV__ ? result.verification.code : undefined,
                        user: result.user,
                    },
                    lastError: null,
                }));
                return result;
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : 'No se pudo crear la cuenta.';
                setState((prev) => ({
                    ...prev,
                    lastError: message,
                }));
                Alert.alert('Registro', message);
                throw error;
            } finally {
                setIsProcessing(false);
            }
        },
        [],
    );

    const applyAuthResult = useCallback(
        (result: AuthResult): AuthFlowDecision => {
            updateStateWithAuth(result);
            return {
                user: result.user,
                nextRoute: resolveNextRoute(result.user),
                requiresKyc: result.user.requiresKyc,
                kycStatus: result.user.kycStatus,
            };
        },
        [updateStateWithAuth],
    );

    const verifyEmailCode = useCallback(
        async (code: string) => {
            if (!state.pendingVerification) {
                throw new Error('No hay un proceso de verificación activo.');
            }
            setIsProcessing(true);
            try {
                const result = await mockConvexStore.verifyEmailCode(
                    state.pendingVerification.email,
                    code,
                );
                return applyAuthResult(result);
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'No se pudo verificar el código ingresado.';
                setState((prev) => ({
                    ...prev,
                    lastError: message,
                }));
                throw error;
            } finally {
                setIsProcessing(false);
            }
        },
        [applyAuthResult, state.pendingVerification],
    );

    const resendVerificationCode = useCallback(async () => {
        const target =
            state.pendingVerification?.email ?? state.user?.email ?? state.user?.email;
        if (!target) {
            throw new Error('No hay un email disponible para reenviar el código.');
        }
        const result = await mockConvexStore.resendVerification(target, 'signup');
        const pendingUser =
            state.pendingVerification?.user ??
            state.user ??
            (await mockConvexStore.getUserById(result.userId));
        const normalized = normalizeVerification(result, pendingUser ?? undefined);
        setState((prev) => ({
            ...prev,
            status: 'pending_verification',
            pendingVerification: normalized,
            user: prev.status === 'authenticated' ? prev.user : pendingUser ?? null,
            session: prev.status === 'authenticated' ? prev.session : null,
        }));
        return normalized;
    }, [state.pendingVerification?.email, state.pendingVerification?.user, state.user]);

    const loginWithEmail = useCallback(
        async (email: string, password: string) => {
            setIsProcessing(true);
            try {
                const result = await mockConvexStore.loginWithEmail(email, password);
                return applyAuthResult(result);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (message.startsWith('EMAIL_NOT_VERIFIED')) {
                    const resend = await mockConvexStore.resendVerification(email, 'signup');
                    const pendingUser = await mockConvexStore.getUserById(resend.userId);
                    const normalized = normalizeVerification(resend, pendingUser ?? undefined);
                    setState((prev) => ({
                        ...prev,
                        status: 'pending_verification',
                        pendingVerification: normalized,
                        user: pendingUser ?? null,
                        session: null,
                        lastError: 'Debes verificar tu email antes de continuar.',
                    }));
                    setIsProcessing(false);
                    throw new Error('EMAIL_VERIFICATION_REQUIRED');
                }

                setState((prev) => ({
                    ...prev,
                    lastError: message,
                }));
                Alert.alert('Inicio de sesión', message);
                throw error;
            } finally {
                setIsProcessing(false);
            }
        },
        [applyAuthResult],
    );

    const loginWithSocial = useCallback(
        async (
            provider: SocialProvider,
            profile?: SocialProfile,
            roleOverride: UserRole = 'consumer',
        ) => {
            setIsProcessing(true);
            try {
                const result = await mockConvexStore.socialLogin(
                    provider,
                    profile ?? {},
                    roleOverride,
                );
                return applyAuthResult(result);
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : 'No se pudo completar el acceso social.';
                setState((prev) => ({
                    ...prev,
                    lastError: message,
                }));
                Alert.alert('Inicio social', message);
                throw error;
            } finally {
                setIsProcessing(false);
            }
        },
        [applyAuthResult],
    );

    const updateRole = useCallback(
        async (role: UserRole) => {
            if (!state.user) {
                throw new Error('Debes iniciar sesión para cambiar de rol.');
            }
            const updated = await mockConvexStore.updateRole(state.user.id, role);
            setState((prev) => ({
                ...prev,
                user: updated,
            }));
        },
        [state.user],
    );

    const requireAuth = useCallback(
        (callback: () => void, options?: { prompt?: boolean; message?: string }) => {
            if (state.status === 'authenticated' && state.user) {
                callback();
                return true;
            }
            if (options?.prompt !== false) {
                Alert.alert('Inicia sesión', options?.message ?? 'Necesitas iniciar sesión para continuar.');
            }
            return false;
        },
        [state.status, state.user],
    );

    const requireKycFor = useCallback(
        (
            scope: 'financial' | 'withdraw' | 'business' | 'influencer',
            onGranted: () => void,
            options?: { onBlocked?: () => void; message?: string },
        ) => {
            const hasAccess = requireAuth(onGranted, { prompt: false });
            if (!hasAccess) {
                options?.onBlocked?.();
                return false;
            }
            if (!state.user?.requiresKyc) {
                onGranted();
                return true;
            }
            if (state.user.kycStatus === 'approved') {
                onGranted();
                return true;
            }
            const defaultMessages = {
                financial: 'Debes completar la verificación KYC para operaciones financieras.',
                withdraw: 'Completa tu verificación KYC para solicitar retiros.',
                business: 'Los negocios necesitan KYC aprobado para esta acción.',
                influencer: 'Los influencers deben finalizar KYC para continuar.',
            };
            Alert.alert(
                'Verificación requerida',
                options?.message ?? defaultMessages[scope],
            );
            options?.onBlocked?.();
            return false;
        },
        [requireAuth, state.user],
    );

    const clearPendingVerification = useCallback(() => {
        setState((prev) => ({
            ...prev,
            pendingVerification: undefined,
        }));
    }, []);

    const markKycSubmitted = useCallback(
        async (data: Record<string, unknown>) => {
            if (!state.user) {
                throw new Error('Debes iniciar sesión antes de enviar KYC.');
            }
            // Mark KYC as submitted in the auth store
            await mockConvexStore.markKycSubmitted(state.user.id);

            // Note: The KYC record in FintechContext will be updated separately
            // This avoids circular dependency between AuthContext and FintechContext

            const refreshed = await mockConvexStore.getUserById(state.user.id);
            if (refreshed) {
                setState((prev) => ({
                    ...prev,
                    user: refreshed,
                }));
            }
        },
        [state.user],
    );

    const updateProfile = useCallback(
        async (updates: { nickname?: string; avatar?: string }) => {
            if (!state.user) return;
            try {
                const updatedUser = await mockConvexStore.updateProfile(state.user.id, updates);
                setState((prev) => ({
                    ...prev,
                    user: updatedUser,
                }));
            } catch (error) {
                console.error('Update profile error:', error);
                throw error;
            }
        },
        [state.user],
    );

    const value = useMemo<AuthContextType>(
        () => ({
            status: state.status,
            isAuthenticated: state.status === 'authenticated' && !!state.user,
            isProcessing,
            user: state.user,
            session: state.session,
            deviceId: state.deviceId,
            pendingVerification: state.pendingVerification,
            signUpWithEmail,
            verifyEmailCode,
            resendVerificationCode,
            loginWithEmail,
            loginWithSocial,
            logout,
            updateRole,
            requireAuth,
            requireKycFor,
            refreshActiveSession,
            markKycSubmitted,
            updateProfile,
            clearPendingVerification,
        }),
        [
            clearPendingVerification,
            isProcessing,
            loginWithEmail,
            loginWithSocial,
            logout,
            markKycSubmitted,
            refreshActiveSession,
            requireAuth,
            requireKycFor,
            resendVerificationCode,
            signUpWithEmail,
            state.deviceId,
            state.pendingVerification,
            state.session,
            state.status,
            state.user,
            updateRole,
            updateProfile,
            verifyEmailCode,
        ],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export type { AuthFlowDecision, AuthStatus, PendingVerificationState, UserRole };
