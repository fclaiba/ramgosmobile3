import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useToast } from './ToastContext';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { storage } from '../services/auth/storageAdapter';
import { sessionTokenStore } from '../services/auth/sessionTokenStore';
import { CURRENT_SESSION_KEY, REMEMBERED_LOGIN_KEY } from '../services/auth/sessionKeys';
import { uploadKycPayloadImages } from '../utils/uploadToConvexStorage';

/** Re-export: las claves viven en services/auth/sessionKeys (sin deps de Convex). */
export { CURRENT_SESSION_KEY, REMEMBERED_LOGIN_KEY } from '../services/auth/sessionKeys';

type RememberedLogin = {
    email: string;
    rememberMe: boolean;
};

async function saveRememberedLogin(email: string): Promise<void> {
    const payload: RememberedLogin = {
        email: email.trim(),
        rememberMe: true,
    };
    await storage.setItem(REMEMBERED_LOGIN_KEY, JSON.stringify(payload));
}

async function clearRememberedLogin(): Promise<void> {
    await storage.removeItem(REMEMBERED_LOGIN_KEY);
}

/** Persiste o no la sesión según "Recordarme". */
async function writeSessionForRememberMe(
    sessionPayload: string,
    rememberMe: boolean,
): Promise<void> {
    if (rememberMe) {
        await storage.setItem(CURRENT_SESSION_KEY, sessionPayload);
    } else {
        await storage.removeItem(CURRENT_SESSION_KEY);
    }
}

async function maybePersistSession(
    sessionPayload: string,
    persist: boolean,
): Promise<void> {
    if (!persist) return;
    await storage.setItem(CURRENT_SESSION_KEY, sessionPayload);
}

/**
 * Códigos de error del backend que la UI tiene que tratar distinto.
 *
 * `requireActor` distingue "no hay sesión" (UNAUTHENTICATED → desloguear) de
 * "la cuenta está baneada" (FORBIDDEN + ACCOUNT_BANNED → mandar a
 * BannedUserScreen sin borrar credenciales) y de "suspensión sólo social"
 * (SOCIAL_SUSPENDED → avisar, pero el resto de la app sigue funcionando).
 * Aplanar los tres en "algo salió mal" era lo que había antes.
 */
export type BackendErrorKind =
    | 'unauthenticated'
    | 'banned'
    | 'social_suspended'
    | 'rate_limited'
    | 'forbidden'
    | 'unknown';

export const classifyBackendError = (error: any): BackendErrorKind => {
    const data = error?.data;
    const code = typeof data === 'object' ? data?.code : undefined;
    const message = typeof data === 'object' ? String(data?.message ?? '') : String(error?.message ?? '');

    if (code === 'RATE_LIMITED') return 'rate_limited';
    if (code === 'UNAUTHENTICATED') return 'unauthenticated';
    if (message.includes('ACCOUNT_BANNED')) return 'banned';
    if (message.includes('SOCIAL_SUSPENDED')) return 'social_suspended';
    if (code === 'FORBIDDEN') return 'forbidden';
    return 'unknown';
};

/** Texto listo para mostrar según el código. */
export const backendErrorMessage = (error: any, fallback: string): string => {
    switch (classifyBackendError(error)) {
        case 'banned':
            return 'Tu cuenta fue suspendida. Contactá a soporte.';
        case 'social_suspended':
            return 'Tu acceso a la red social está suspendido temporalmente.';
        case 'rate_limited':
            return 'Demasiadas acciones seguidas. Esperá un momento.';
        default:
            return extractErrorMessage(error, fallback);
    }
};

const extractErrorMessage = (error: any, fallback: string) => {
    if (!error) return fallback;
    // ConvexError con payload objeto ({ code, message }): el mensaje vive en .data,
    // no en .message (que trae el JSON crudo envuelto en ruido de Convex).
    if (error.data && typeof error.data === 'object' && typeof error.data.message === 'string') {
        return error.data.message;
    }
    if (typeof error.data === 'string' && error.data.trim()) return error.data;
    const msg = error.message || fallback;
    if (typeof msg !== 'string') return fallback;
    if (msg.includes('Uncaught Error: ')) {
        return msg.split('Uncaught Error: ')[1].split('\n')[0].trim();
    }
    if (msg.includes('Uncaught ConvexError: ')) {
        return msg.split('Uncaught ConvexError: ')[1].split('\n')[0].trim();
    }
    return msg;
};

// ---------------------------------------------------------------------------
// Auth types (inlined, no longer depending on mockConvexStore internals)
// ---------------------------------------------------------------------------

export type AuthUserRole = 'consumer' | 'business' | 'influencer' | 'admin';
export type AuthKycStatus = 'unverified' | 'pending' | 'approved' | 'rejected';
export type SubscriptionStatus = 'active' | 'inactive';
export type SubscriptionTier = 'free' | 'pro' | 'business';
export type SocialProvider = 'google' | 'facebook';

export interface SocialProfile {
    providerUserId: string;
    email?: string;
    name?: string;
    avatar?: string;
}

export interface PublicUser {
    id: string;
    email: string;
    status: 'active' | 'banned' | 'suspended';
    name: string;
    role: AuthUserRole;
    avatar?: string;
    emailVerified: boolean;
    requiresKyc: boolean;
    kycStatus: AuthKycStatus;
    kycMetadata?: Record<string, unknown>;
    nickname?: string;
    username?: string;
    referralAlias?: string;
    tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
    termsAcceptedVersion: number;
    subscriptionStatus: SubscriptionStatus;
    subscriptionTier: SubscriptionTier;
    createdAt: string;
    lastLoginAt?: string;
    providers: string[];
    isTest?: boolean;
}

export interface SessionRecord {
    id: string;
    userId: string;
    deviceId: string;
    accessToken: string;
    refreshToken: string;
    createdAt: number;
    lastActiveAt: number;
    expiresAt: number;
    refreshExpiresAt: number;
    /** FASE 1: token opaco emitido por el server (tabla sessions). */
    sessionToken?: string;
}

export interface SignUpInput {
    email: string;
    password: string;
    name: string;
    role?: AuthUserRole;
    avatar?: string;
    businessName?: string;
    businessCategory?: string;
    businessAddress?: string;
    phone?: string;
    referralCode?: string;
    referredBy?: string;
    instagramUrl?: string;
    tiktokUrl?: string;
    username?: string;
}

export interface SignUpResult {
    user: PublicUser;
    requiresVerification: boolean;
}

export const CURRENT_TERMS_VERSION = 1;

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
    originalUser?: PublicUser | null; // For impersonation
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
    isImpersonating: boolean;
    isProcessing: boolean;
    user: PublicUser | null;
    session: SessionRecord | null;
    /** FASE 1: token de sesión server-side para mutaciones sensibles. */
    sessionToken?: string;
    deviceId?: string;
    pendingVerification?: PendingVerificationState;
    signUpWithEmail: (payload: SignUpInput) => Promise<SignUpResult>;
    verifyEmailCode: (code: string, rememberMe?: boolean) => Promise<AuthFlowDecision>;
    resendVerificationCode: () => Promise<PendingVerificationState>;
    loginWithEmail: (
        email: string,
        password: string,
        roleOverride?: UserRole,
        rememberMe?: boolean,
    ) => Promise<AuthFlowDecision>;
    loginWithSocial: (
        provider: SocialProvider,
        profile?: SocialProfile,
        roleOverride?: UserRole,
    ) => Promise<AuthFlowDecision>;
    loginWithGoogleIdToken: (
        idToken: string,
        options?: {
            mode?: 'login' | 'register';
            role?: UserRole;
            username?: string;
            referredBy?: string;
            businessCategory?: string;
            businessName?: string;
            businessAddress?: string;
            phone?: string;
            instagramUrl?: string;
            tiktokUrl?: string;
        },
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
    updateProfile: (updates: { nickname?: string; avatar?: string; phoneNumber?: string }) => Promise<void>;
    updateSubscription: (tier: 'free' | 'pro' | 'business', status: 'active' | 'inactive') => Promise<void>;
    acceptCurrentTerms: () => Promise<void>;
    deleteMyAccount: () => Promise<void>;
    clearPendingVerification: () => void;

    // Developer Mode
    enterImpersonation: (targetUserId: string) => Promise<void>;
    exitImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const resolveNextRoute = (user: PublicUser): AuthFlowDecision['nextRoute'] => {
    if (user.status === 'banned' || user.status === 'suspended') {
        return { screen: 'BannedUser' };
    }

    if (user.termsAcceptedVersion < CURRENT_TERMS_VERSION) {
        return {
            screen: 'Terms',
            params: { mode: 'blocking' }
        };
    }

    // We no longer force it during login or registration flow

    if (user.role === 'business' && user.kycStatus === 'unverified') {
        return { screen: 'KYC', params: { accountType: 'business' } };
    }

    return { screen: 'Home' };
};

/** Destino post-login/registro según estado del usuario (KYC, términos, etc.) */
export const getAuthDestination = (user: PublicUser): AuthFlowDecision['nextRoute'] =>
    resolveNextRoute(user);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth debe usarse dentro de AuthProvider');
    }
    return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { show } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);
    /** Si false, la sesión vive solo en memoria (Recordarme desmarcado). */
    const persistSessionRef = useRef(true);
    // Note: useAction is proper for actions, let's just use it directly:
    const sendOtpActionCall = useAction(api.auth.sendVerificationEmail);
    const verifyEmailCodeMutation = useMutation(api.auth.verifyEmailCode);
    const removePushTokenMutation = useMutation(api.notifications.removePushToken);
    const loginWithGoogleAction = useAction(api.oauthGoogle.loginWithGoogle);

    // Helper to satisfy strict SessionRecord type
    const createSessionMock = (userId: string, sessionToken?: string): SessionRecord => ({
        id: 'mock_session_' + Date.now(),
        userId,
        deviceId: 'backend-device',
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        refreshExpiresAt: Date.now() + 86400000 * 7,
        sessionToken,
    });

    // Convex Mutations
    const loginMutation = useMutation(api.users.login);
    const logoutMutation = useMutation(api.users.logout);
    const registerMutation = useMutation(api.users.register);
    const syncUserMutation = useMutation(api.users.syncUser);
    const submitKycMutation = useMutation(api.users.submitKyc);
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);
    const updateSubscriptionMutation = useMutation(api.users.updateSubscription);
    const updateProfileMutation = useMutation(api.users.updateProfile);
    const updateUserMutation = useMutation(api.users.updateUser);

    const impersonateMutation = useMutation(api.developer.impersonate);
    const acceptTermsMutation = useMutation(api.users.acceptTerms);

    // Initial state
    const [state, setState] = useState<AuthState>({
        status: 'loading',
        user: null,
        session: null,
        originalUser: null,
    });

    // Convex Query - Sync User Data
    // Convex Query - Sync User Data
    const userId = state.session?.userId;
    // CRITICAL: Skip query if ID is a mock ID (from previous offline testing) to prevent Server Errors
    const isValidConvexId = userId && !userId.startsWith('mock_') && !userId.startsWith('user_') && !userId.includes('session');
    const userData = useQuery(api.users.getUser, isValidConvexId ? { id: userId as Id<"users">, sessionToken: state.session?.sessionToken } : "skip");

    const USER_ID_KEY = '@ramgos/auth/user_id';

    // 1. Initialize Session (MOCKED)
    useEffect(() => {
        (async () => {
            try {
                const storedSessionStr = await storage.getItem(CURRENT_SESSION_KEY);
                if (storedSessionStr) {
                    let storedSession: any;
                    try {
                        storedSession = JSON.parse(storedSessionStr);
                    } catch (e) {
                        storedSession = { userId: storedSessionStr };
                    }

                    if (storedSession?.userId?.startsWith('session_')) {
                        await storage.removeItem(CURRENT_SESSION_KEY);
                        setState(prev => ({ ...prev, status: 'anonymous' }));
                        return;
                    }

                    // ponytail: sessions without server token can't auth Convex calls
                    if (!storedSession?.sessionToken?.startsWith('ses_')) {
                        await storage.removeItem(CURRENT_SESSION_KEY);
                        setState(prev => ({ ...prev, status: 'anonymous' }));
                        return;
                    }

                    if (storedSession && storedSession.userId) {
                        persistSessionRef.current = true;
                        setState(prev => ({
                            ...prev,
                            session: storedSession,
                            // CRITICAL: We intentionally do NOT set 'user' here yet.
                            // We wait for the Convex 'getUser' query to confirm the user exists.
                            // Otherwise, stale IDs from local storage cause useQuery crashes!
                            user: null, 
                            status: 'loading',
                        }));
                    } else {
                        setState(prev => ({ ...prev, status: 'anonymous' }));
                    }
                } else {
                    setState(prev => ({ ...prev, status: 'anonymous' }));
                }
            } catch (e) {
                console.error("Failed to load session", e);
                setState(prev => ({ ...prev, status: 'anonymous' }));
            }
        })();
    }, []);

    // 2. Sync Query with Local State
    useEffect(() => {
        // If Convex query finished and user is not found (e.g. DB wiped), log out!
        if (userData === null && state.session) {
            storage.removeItem(CURRENT_SESSION_KEY).catch(console.error);
            setState(prev => ({
                ...prev,
                status: 'anonymous',
                session: null,
                user: null,
            }));
            return;
        }

        if (userData && String(state.session?.userId) === String(userData._id)) {
            const serverUser: PublicUser = {
                id: userData._id as string,
                email: userData.email,
                name: userData.name,
                nickname: userData.nickname,
                username: userData.username,
                referralAlias: userData.referralAlias,
                role: userData.role as UserRole,
                isTest: userData.isTest,
                avatar: userData.avatar,
                status: 'active',
                emailVerified: true,
                requiresKyc: true,
                termsAcceptedVersion: userData.termsAcceptedVersion || 1,
                createdAt: userData.joinedAt || new Date().toISOString(),
                providers: ['password'],
                kycStatus: userData.kycStatus as any || 'pending',
                tier: userData.tier as any || 'Bronze',
                subscriptionStatus: userData.subscriptionStatus as any || 'inactive',
                subscriptionTier: userData.subscriptionTier as any || 'free',
            };
            
            const prevStr = state.user ? JSON.stringify(state.user) : null;
            const newStr = JSON.stringify(serverUser);
            
            if (prevStr !== newStr) {
                setState(prev => ({
                    ...prev,
                    user: serverUser,
                    status: 'authenticated'
                }));
            }
        }
    }, [userData, state.session?.userId, state.user]);

    // FASE 3: publicar el sessionToken para consumidores fuera del árbol de
    // AuthProvider (CartContext envuelve a AuthProvider en App.tsx).
    useEffect(() => {
        sessionTokenStore.set(
            state.status === 'authenticated' ? state.session?.sessionToken : undefined,
        );
    }, [state.status, state.session?.sessionToken]);

    const signUpWithEmail = async (payload: SignUpInput) => {
        setIsProcessing(true);
        try {
            const role = payload.role ?? 'consumer';
            const email = payload.email.trim().toLowerCase();

            const registerResult: any = await registerMutation({
                email,
                password: payload.password,
                name: payload.name.trim(),
                role,
                avatar: payload.avatar,
                termsVersion: CURRENT_TERMS_VERSION,
                nickname: role === 'business'
                    ? payload.businessName?.trim()
                    : role === 'influencer'
                        ? payload.businessName?.trim()
                        : undefined,
                phoneNumber: payload.phone?.trim() || undefined,
                businessAddress: payload.businessAddress?.trim() || undefined,
                businessCategory: payload.businessCategory?.trim() || undefined,
                username: payload.username?.trim() || undefined,
                referredBy: payload.referredBy?.trim() || payload.referralCode?.trim() || undefined,
                instagramUrl: payload.instagramUrl?.trim() || undefined,
                tiktokUrl: payload.tiktokUrl?.trim() || undefined,
            });

            const userId = String(registerResult?.userId ?? '');
            const registerSessionToken: string | undefined = registerResult?.sessionToken;
            if (!userId || !registerSessionToken?.startsWith('ses_')) {
                throw new Error('El servidor no confirmó el registro. Revisá que Convex esté corriendo.');
            }

            const user: PublicUser = {
                id: userId,
                email,
                name: payload.name.trim(),
                nickname: payload.businessName?.trim(),
                username: payload.username?.trim(),
                role: role,
                isTest: email.endsWith('@ramgos.com'),
                avatar: payload.avatar,
                status: 'active',
                emailVerified: false,
                requiresKyc: true,
                termsAcceptedVersion: CURRENT_TERMS_VERSION,
                createdAt: new Date().toISOString(),
                providers: ['password'],
                kycStatus: 'pending',
                tier: 'Bronze',
                subscriptionStatus: 'inactive',
                subscriptionTier: 'free',
            };

            const session = createSessionMock(userId, registerSessionToken);
            persistSessionRef.current = true;
            await storage.setItem(CURRENT_SESSION_KEY, JSON.stringify({ ...session, _mockUser: user }));

            const requiresOtp = registerResult?.requiresOtp !== false && !email.endsWith('@ramgos.com');

            if (requiresOtp) {
                setState(prev => ({
                    ...prev,
                    status: 'pending_verification',
                    session: { ...session, userId },
                    user,
                    pendingVerification: {
                        userId,
                        email,
                        expiresAt: Date.now() + 10 * 60 * 1000,
                        user,
                    }
                }));

                // Enviar el OTP real a través de Resend
                sendOtpActionCall({ email }).catch(console.error);

                return {
                    user,
                    requiresVerification: true,
                };
            } else {
                setState(prev => ({
                    ...prev,
                    status: 'authenticated',
                    session: { ...session, userId },
                    user,
                    originalUser: null
                }));

                return {
                    user,
                    requiresVerification: false,
                    nextRoute: resolveNextRoute(user)
                };
            }
        } catch (error: any) {
            show(extractErrorMessage(error, 'Error de registro'), 'error');
            throw error;
        } finally {
            setIsProcessing(false);
        }
    };

    const loginWithEmail = async (
        email: string,
        password: string,
        roleOverride?: UserRole,
        rememberMe = true,
    ): Promise<AuthFlowDecision> => {
        setIsProcessing(true);
        try {
            const result = await loginMutation({ emailOrUsername: email, password });

            if ((result as any).requiresOtp) {
                const pendingUserId = (result as any).userId;
                await sendOtpActionCall({ email }).catch(console.error);
                setState(prev => ({
                    ...prev,
                    status: 'pending_verification',
                    pendingVerification: {
                        userId: pendingUserId,
                        email: email,
                        expiresAt: Date.now() + 10 * 60 * 1000,
                    }
                }));
                return {
                    user: { id: pendingUserId, email } as PublicUser,
                    nextRoute: { screen: 'Verification', params: { email, isSignup: false, rememberMe } },
                    requiresKyc: false,
                    kycStatus: 'pending'
                };
            }

            const fullResult = result as any;
            let finalRole = fullResult.role as UserRole;
            
            // If dev account and roleOverride is passed, update in DB
            if (roleOverride && roleOverride !== finalRole && (email.endsWith('@ramgos.com') || email.endsWith('@test.com'))) {
                try {
                    await updateUserMutation({
                        id: fullResult._id,
                        updates: { role: roleOverride }
                    });
                    finalRole = roleOverride;
                } catch (e) {
                    console.error("Failed to update dev account role during login:", e);
                }
            }

            const user: PublicUser = {
                id: fullResult._id,
                email: fullResult.email,
                name: fullResult.name,
                nickname: fullResult.nickname,
                username: fullResult.username,
                referralAlias: fullResult.referralAlias,
                role: finalRole,
                isTest: fullResult.isTest,
                avatar: fullResult.avatar,
                status: 'active',
                emailVerified: true,
                requiresKyc: true,
                termsAcceptedVersion: fullResult.termsAcceptedVersion || 1,
                createdAt: fullResult.joinedAt || new Date().toISOString(),
                providers: ['password'],
                kycStatus: fullResult.kycStatus || 'pending',
                tier: fullResult.tier || 'Bronze',
                subscriptionStatus: fullResult.subscriptionStatus || 'inactive',
                subscriptionTier: fullResult.subscriptionTier || 'free',
            };

            const session = createSessionMock(user.id, (result as any).sessionToken);
            const sessionPayload = JSON.stringify({ ...session, _mockUser: user });
            persistSessionRef.current = rememberMe;
            await writeSessionForRememberMe(sessionPayload, rememberMe);
            if (rememberMe) {
                await saveRememberedLogin(email);
            } else {
                await clearRememberedLogin();
            }

            setState(prev => ({
                ...prev,
                status: 'authenticated',
                user,
                session,
                originalUser: null
            }));

            return {
                user,
                nextRoute: resolveNextRoute(user),
                requiresKyc: true,
                kycStatus: user.kycStatus
            };
        } catch (error: any) {
            const cleanMsg = extractErrorMessage(error, 'Error de inicio de sesión');
            setState(prev => ({ ...prev, lastError: cleanMsg }));
            throw error;
        } finally {
            setIsProcessing(false);
        }
    };

    const loginWithGoogleIdToken = async (
        idToken: string,
        options?: {
            mode?: 'login' | 'register';
            role?: UserRole;
            username?: string;
            referredBy?: string;
            businessCategory?: string;
            businessName?: string;
            businessAddress?: string;
            phone?: string;
            instagramUrl?: string;
            tiktokUrl?: string;
        },
    ): Promise<AuthFlowDecision> => {
        setIsProcessing(true);
        try {
            const mode = options?.mode ?? 'login';
            const result = await loginWithGoogleAction({
                idToken,
                mode,
                role: options?.role,
                username: options?.username,
                referredBy: options?.referredBy,
                businessCategory: options?.businessCategory,
                nickname: options?.businessName,
                phoneNumber: options?.phone,
                businessAddress: options?.businessAddress,
                instagramUrl: options?.instagramUrl,
                tiktokUrl: options?.tiktokUrl,
                termsVersion: mode === 'register' ? CURRENT_TERMS_VERSION : undefined,
            });
            const fullResult = result as any;

            if (!fullResult?.sessionToken?.startsWith('ses_')) {
                throw new Error('El servidor no confirmó la sesión con Google.');
            }

            const user: PublicUser = {
                id: fullResult._id,
                email: fullResult.email,
                name: fullResult.name,
                nickname: fullResult.nickname,
                username: fullResult.username,
                referralAlias: fullResult.referralAlias,
                role: fullResult.role as UserRole,
                isTest: fullResult.isTest,
                avatar: fullResult.avatar,
                status: 'active',
                emailVerified: true,
                requiresKyc: true,
                termsAcceptedVersion: fullResult.termsAcceptedVersion || 1,
                createdAt: fullResult.joinedAt || new Date().toISOString(),
                providers: ['google'],
                kycStatus: fullResult.kycStatus || 'pending',
                tier: fullResult.tier || 'Bronze',
                subscriptionStatus: fullResult.subscriptionStatus || 'inactive',
                subscriptionTier: fullResult.subscriptionTier || 'free',
            };

            const session = createSessionMock(user.id, fullResult.sessionToken);
            persistSessionRef.current = true;
            await storage.setItem(
                CURRENT_SESSION_KEY,
                JSON.stringify({ ...session, _mockUser: user }),
            );

            setState(prev => ({
                ...prev,
                status: 'authenticated',
                user,
                session,
                originalUser: null,
            }));

            return {
                user,
                nextRoute: resolveNextRoute(user),
                requiresKyc: true,
                kycStatus: user.kycStatus,
            };
        } catch (error: any) {
            const cleanMsg = extractErrorMessage(
                error,
                'Error de inicio de sesión con Google',
            );
            setState(prev => ({ ...prev, lastError: cleanMsg }));
            throw error;
        } finally {
            setIsProcessing(false);
        }
    };

    const enterImpersonation = async (targetUserId: string) => {
        if (!state.user) throw new Error("Must be logged in to impersonate");

        setIsProcessing(true);
        try {
            const targetUser = await impersonateMutation({
                targetUserId: targetUserId as any
            });

            const newUser: PublicUser = {
                id: targetUser._id,
                email: targetUser.email,
                name: targetUser.name,
                username: (targetUser as any).username,
                referralAlias: (targetUser as any).referralAlias,
                role: targetUser.role as UserRole,
                isTest: targetUser.isTest,
                avatar: targetUser.avatar,
                status: 'active',
                emailVerified: true,
                requiresKyc: true,
                termsAcceptedVersion: 1,
                createdAt: new Date().toISOString(),
                providers: ['password'],
                kycStatus: (targetUser.kycStatus as any) || 'pending',
                tier: (targetUser.tier as any) || 'Bronze',
                subscriptionStatus: (targetUser.subscriptionStatus as any) || 'inactive',
                subscriptionTier: 'free',
            };

            setState(prev => ({
                ...prev,
                user: newUser,
                session: prev.session ? { ...prev.session, userId: newUser.id } : null,
                originalUser: prev.originalUser || prev.user
            }));

            show("Impersonando a " + newUser.name, "success");

        } catch (e: any) {
            console.error(e);
            show(extractErrorMessage(e, 'Error al impersonar'), "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const exitImpersonation = async () => {
        if (!state.originalUser) return;

        const original = state.originalUser;
        setState(prev => ({
            ...prev,
            user: original || null,
            session: prev.session && original ? { ...prev.session, userId: original.id } : prev.session,
            originalUser: null
        }));
        show("Sesión original restaurada", "success");
    };

    const logout = async (force = false) => {
        try {
            // FASE 1: revoke server-side session (best-effort).
            if (state.session?.sessionToken) {
                logoutMutation({ sessionToken: state.session.sessionToken }).catch(() => { });
            }
            // Attempt to unregister push token
            if (state.user?.id) {
                try {
                	// A robust way without importing expo-constants here is to pass it,
                	// but since it's just a best-effort cleanup, we simply clear session here.
                	// For production, the preferred way is letting NotificationsContext
                	// listen to auth state changes and purge.
                } catch (err) {}
            }
            
            await storage.removeItem(CURRENT_SESSION_KEY);
            setState({
                status: 'anonymous',
                user: null,
                session: null,
                originalUser: null
            });
        } catch (e) {
            console.error("Logout failed", e);
        }
    };

    // ... Utils ...
    const requireAuth = useCallback((callback: () => void, options?: { prompt?: boolean; message?: string }) => {
        if (state.user) {
            callback();
            return true;
        }
        if (options?.prompt !== false) show(options?.message ?? 'Inicia sesión', 'info');
        return false;
    }, [state.user]);

    const requireKycFor = useCallback((scope: any, onGranted: any, options: any) => {
        if (!state.user) return false;
        if (state.user.kycStatus === 'approved') {
            onGranted();
            return true;
        }
        show('Verificación KYC requerida', 'error');
        return false;
    }, [state.user]);

    const updateProfile = async (updates: { nickname?: string; avatar?: string; phoneNumber?: string }) => {
        if (!state.user) return;
        await updateProfileMutation({
            id: state.user.id as any,
            updates: { name: updates.nickname, nickname: updates.nickname, avatar: updates.avatar, phoneNumber: updates.phoneNumber }
        });
        
        setState(prev => {
            if (!prev.user) return prev;
            const updatedUser = {
                ...prev.user,
                name: updates.nickname || prev.user.name,
                avatar: updates.avatar || prev.user.avatar,
                nickname: updates.nickname || prev.user.nickname,
            };
            if (prev.session) {
                maybePersistSession(
                    JSON.stringify({ ...prev.session, _mockUser: updatedUser }),
                    persistSessionRef.current,
                ).catch(console.error);
            }
            return { ...prev, user: updatedUser };
        });
    };

    const verifyEmailCode = async (
        code: string,
        rememberMe = true,
    ): Promise<AuthFlowDecision> => {
        setIsProcessing(true);
        try {
            if (!state.user && !state.pendingVerification?.userId) {
                throw new Error("No hay usuario para verificar");
            }
            
            const emailToVerify = state.pendingVerification?.email;
            const res = await verifyEmailCodeMutation({
                sessionToken: state.session?.sessionToken,
                code,
                email: state.session?.sessionToken ? undefined : emailToVerify,
            });

            // At this point OTP is valid.
            const sessionToken = (res as any)?.sessionToken;
            let newSession = state.session;
            
            if (sessionToken && emailToVerify) {
                newSession = createSessionMock(state.pendingVerification!.userId, sessionToken);
                const sessionPayload = JSON.stringify({
                    ...newSession,
                    userId: state.pendingVerification!.userId,
                });
                persistSessionRef.current = rememberMe;
                await writeSessionForRememberMe(sessionPayload, rememberMe);
                if (rememberMe) {
                    await saveRememberedLogin(emailToVerify);
                } else {
                    await clearRememberedLogin();
                }
            }

            // Move from pending_verification to authenticated
            
            setState(prev => {
                const optimisticUser = prev.user || prev.pendingVerification?.user || {
                    id: prev.pendingVerification!.userId,
                    email: prev.pendingVerification?.email || '',
                    role: 'consumer', // Default, will be overwritten by sync
                    kycStatus: 'pending',
                } as any;
                
                return {
                    ...prev,
                    status: 'authenticated',
                    user: optimisticUser,
                    session: newSession || prev.session,
                    pendingVerification: undefined
                };
            });

            const user = state.user || (state.pendingVerification?.user as PublicUser) || { id: state.pendingVerification!.userId } as any;
            
            if (user) {
                return {
                    user: user,
                    nextRoute: resolveNextRoute(user),
                    requiresKyc: true,
                    kycStatus: user.kycStatus
                };
            }
            
            // If user data hasn't synced yet, we return optimistc next route.
            return {
                 user: { id: state.pendingVerification!.userId } as any,
                 nextRoute: { screen: 'Home' },
                 requiresKyc: true,
                 kycStatus: 'pending'
            };
        } finally {
            setIsProcessing(false);
        }
    };

    const resendVerificationCode = async (): Promise<PendingVerificationState> => {
        if (!state.pendingVerification && !state.user) {
            throw new Error("No hay verificación pendiente.");
        }
        
        const email = state.pendingVerification?.email || state.user?.email!;

        // El `.catch(console.error)` de antes se tragaba el fallo y el toast
        // decía "reenviado" igual. Sumado a que el servidor respondía siempre
        // "enviado correctamente" aunque hubiera caído al mock de consola, un
        // envío roto era indistinguible de uno exitoso desde la app.
        const outcome = await sendOtpActionCall({ email });

        const pending: PendingVerificationState = {
            ...state.pendingVerification!,
            email,
            expiresAt: Date.now() + 10 * 60 * 1000,
        };

        setState(prev => ({ ...prev, pendingVerification: pending }));

        if (outcome?.delivered === false) {
            show(
                outcome.message || 'No se pudo enviar el email. Avisale al soporte.',
                'error',
            );
        } else {
            show('Código reenviado al email.', 'success');
        }
        return pending;
    };
    const loginWithSocial = async (
        provider: SocialProvider,
        profile?: SocialProfile,
        roleOverride?: UserRole,
    ): Promise<AuthFlowDecision> => {
        setIsProcessing(true);
        try {
            const email = profile?.email || `${provider}_${Date.now()}@social.ramgos`;
            const name = profile?.name || `Usuario ${provider}`;
            const role = (roleOverride || 'consumer') as UserRole;
            const uid = `${provider}_${profile?.providerUserId || Date.now()}`;

            const syncResult: any = await syncUserMutation({
                uid,
                email,
                name,
                role,
                avatar: profile?.avatar,
            });
            const userId = String(syncResult?.userId ?? '');
            const sessionToken = syncResult?.sessionToken;
            if (!userId || !sessionToken?.startsWith('ses_')) {
                throw new Error('El servidor no confirmó la cuenta social.');
            }

            const session = createSessionMock(userId, sessionToken);
            persistSessionRef.current = true;
            await storage.setItem(CURRENT_SESSION_KEY, JSON.stringify({ ...session, userId }));

            const user: PublicUser = {
                id: userId,
                email,
                name,
                role,
                avatar: profile?.avatar,
                status: 'active',
                emailVerified: true,
                requiresKyc: true,
                termsAcceptedVersion: 1,
                createdAt: new Date().toISOString(),
                providers: [provider],
                kycStatus: 'pending',
                tier: 'Bronze',
                subscriptionStatus: 'inactive',
                subscriptionTier: 'free',
            };

            setState(prev => ({
                ...prev,
                status: 'authenticated',
                user,
                session: { ...session, userId },
                originalUser: null,
            }));

            return {
                user,
                nextRoute: resolveNextRoute(user),
                requiresKyc: true,
                kycStatus: user.kycStatus,
            };
        } catch (error: any) {
            throw error;
        } finally {
            setIsProcessing(false);
        }
    };
    const updateRole = async (role: UserRole) => {
        if (!state.user) return;
        try {
            await updateUserMutation({
                id: state.user.id as any,
                updates: { role }
            });
            
            setState(prev => {
                if (!prev.user) return prev;
                const updatedUser = { ...prev.user, role };
                if (prev.session) {
                    maybePersistSession(
                        JSON.stringify({ ...prev.session, _mockUser: updatedUser }),
                        persistSessionRef.current,
                    ).catch(console.error);
                }
                return { ...prev, user: updatedUser };
            });

            show(`Rol actualizado a ${role.toUpperCase()}`, 'success');
        } catch (error: any) {
            console.error("Failed to update role", error);
            show('Error al actualizar rol', 'error');
        }
    };
    const refreshActiveSession = async () => { };
    const markKycSubmitted = async (data: Record<string, unknown>) => {
        if (!state.user) throw new Error("No hay usuario autenticado.");

        const sessionToken = state.session?.sessionToken;
        const payload = await uploadKycPayloadImages(data, {
            generateUploadUrl,
            sessionToken,
            actorId: String(state.user.id),
        });

        await submitKycMutation({
            sessionToken,
            id: state.user.id as any,
            payload,
        });
        setState(prev => prev.user ? ({
            ...prev,
            user: { ...prev.user, kycStatus: 'pending' },
        }) : prev);
    };
    const updateSubscription = async (tier: 'free' | 'pro' | 'business', status: 'active' | 'inactive') => {
        if (!state.user) throw new Error("No hay usuario autenticado.");

        await updateSubscriptionMutation({
            id: state.user.id as any,
            tier,
            status,
        });
        setState(prev => prev.user ? ({
            ...prev,
            user: {
                ...prev.user,
                subscriptionTier: tier,
                subscriptionStatus: status,
            },
        }) : prev);
    };
    const acceptCurrentTerms = async () => {
        if (!state.user) return;
        try {
            await acceptTermsMutation({
                sessionToken: state.session?.sessionToken,
                id: state.user.id as any,
                version: CURRENT_TERMS_VERSION
            });
            // Ideally we'd optimize the local state too, but query will sync it.
        } catch (e: any) {
            console.error("Error accepting terms", e);
            throw e;
        }
    };
    const deleteUserMutation = useMutation(api.users.deleteUser);

    const deleteMyAccount = async () => {
        if (!state.user) return;
        const token = state.session?.sessionToken || sessionTokenStore.get();
        await deleteUserMutation({
            id: state.user.id as any,
            sessionToken: token,
        });
        await logout(true);
    };
    const clearPendingVerification = () => { };


    const value = useMemo<AuthContextType>(
        () => ({
            status: state.status,
            isAuthenticated: !!state.user,
            isImpersonating: !!state.originalUser,
            isProcessing,
            user: state.user,
            session: state.session,
            // Gate: el token se publica solo cuando el server ya lo validó
            // (status === 'authenticated' lo setea el efecto que consume getUser).
            // Durante el boot los consumidores ven undefined y sus queries hacen
            // 'skip', así que ninguna query sale con un token sin validar.
            sessionToken: state.status === 'authenticated' ? state.session?.sessionToken : undefined,
            deviceId: 'backend-device',
            pendingVerification: undefined,
            signUpWithEmail,
            verifyEmailCode,
            resendVerificationCode,
            loginWithEmail,
            loginWithSocial,
            loginWithGoogleIdToken,
            logout,
            updateRole,
            requireAuth,
            requireKycFor,
            refreshActiveSession,
            markKycSubmitted,
            updateProfile,
            updateSubscription,
            acceptCurrentTerms,
            deleteMyAccount,
            clearPendingVerification,
            enterImpersonation,
            exitImpersonation,
        }),
        [state.status, state.user, state.originalUser, isProcessing, state.session]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export type { AuthFlowDecision, AuthStatus, PendingVerificationState, UserRole };
