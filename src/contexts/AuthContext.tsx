import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useToast } from './ToastContext';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { storage } from '../services/auth/storageAdapter';

export const CURRENT_SESSION_KEY = '@ramgos/auth/current-session';

const extractErrorMessage = (error: any, fallback: string) => {
    if (!error) return fallback;
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
export type SocialProvider = 'google' | 'facebook' | 'apple';

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
}

export interface SignUpInput {
    email: string;
    password: string;
    name: string;
    role?: AuthUserRole;
    avatar?: string;
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
    deviceId?: string;
    pendingVerification?: PendingVerificationState;
    signUpWithEmail: (payload: SignUpInput) => Promise<SignUpResult>;
    verifyEmailCode: (code: string) => Promise<AuthFlowDecision>;
    resendVerificationCode: () => Promise<PendingVerificationState>;
    loginWithEmail: (email: string, password: string, roleOverride?: UserRole) => Promise<AuthFlowDecision>;
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

    // Force KYC for pending, unverified, or rejected statuses
    if (user.requiresKyc && (
        user.kycStatus === 'pending' ||
        user.kycStatus === 'unverified' ||
        user.kycStatus === 'rejected'
    )) {
        return {
            screen: 'KYC',
            params: { accountType: user.role }
        };
    }

    // Only force BasicProfileSetup for brand-new accounts without any display name
    if (!user.nickname && !user.name) {
        return { screen: 'BasicProfileSetup' };
    }

    return { screen: 'Home' };
};

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
    // Note: useAction is proper for actions, let's just use it directly:
    const sendOtpActionCall = useAction(api.notifications.sendOTP);
    const removePushTokenMutation = useMutation(api.notifications.removePushToken);

    // Helper to satisfy strict SessionRecord type
    const createSessionMock = (userId: string): SessionRecord => ({
        id: 'mock_session_' + Date.now(),
        userId,
        deviceId: 'backend-device',
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        refreshExpiresAt: Date.now() + 86400000 * 7,
    });

    // Convex Mutations
    const loginMutation = useMutation(api.users.login);
    const registerMutation = useMutation(api.users.register);
    const syncUserMutation = useMutation(api.users.syncUser);
    const submitKycMutation = useMutation(api.users.submitKyc);
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
    const userData = useQuery(api.users.getUser, isValidConvexId ? { id: userId as Id<"users"> } : "skip");

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

                    if (storedSession && storedSession.userId && storedSession._mockUser) {
                        setState(prev => ({
                            ...prev,
                            session: storedSession,
                            user: storedSession._mockUser,
                            status: 'authenticated',
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

    // 2. Sync Query with Local State (MOCKED - Disabled)
    useEffect(() => {
        // We bypass Convex real-time sync while in MOCK mode to avoid Stripe/Auth backend issues.
        // The user object is completely handled locally via localStorage (_mockUser).
    }, []);


    const signUpWithEmail = async (payload: SignUpInput) => {
        setIsProcessing(true);
        try {
            const role = payload.role ?? 'consumer';
            
            const userId = await registerMutation({
                email: payload.email,
                password: payload.password,
                name: payload.name,
                role: role,
                avatar: payload.avatar
            });

            const user: PublicUser = {
                id: userId,
                email: payload.email,
                name: payload.name,
                role: role,
                isTest: false,
                avatar: payload.avatar,
                status: 'active',
                emailVerified: true,
                requiresKyc: true,
                termsAcceptedVersion: CURRENT_TERMS_VERSION,
                createdAt: new Date().toISOString(),
                providers: ['password'],
                kycStatus: 'unverified',
                tier: 'Bronze',
                subscriptionStatus: 'inactive',
                subscriptionTier: 'free',
            };

            const session = createSessionMock(user.id);
            await storage.setItem(CURRENT_SESSION_KEY, JSON.stringify({ ...session, _mockUser: user }));

            setState(prev => ({
                ...prev,
                status: 'authenticated',
                session,
                user,
            }));

            return {
                user,
                requiresVerification: false,
            };
        } catch (error: any) {
            show(extractErrorMessage(error, 'Error de registro'), 'error');
            throw error;
        } finally {
            setIsProcessing(false);
        }
    };

    const loginWithEmail = async (email: string, password: string, roleOverride?: UserRole): Promise<AuthFlowDecision> => {
        setIsProcessing(true);
        try {
            const result = await loginMutation({ email, password });

            let finalRole = result.role as UserRole;
            
            // If dev account and roleOverride is passed, update in DB
            if (roleOverride && roleOverride !== finalRole && (email.endsWith('@ramgos.com') || email.endsWith('@test.com'))) {
                try {
                    await updateUserMutation({
                        id: result._id as any,
                        updates: { role: roleOverride }
                    });
                    finalRole = roleOverride;
                } catch (e) {
                    console.error("Failed to update dev account role during login:", e);
                }
            }

            const user: PublicUser = {
                id: result._id as string,
                email: result.email,
                name: result.name,
                nickname: result.nickname,
                role: finalRole,
                isTest: result.isTest,
                avatar: result.avatar,
                status: 'active',
                emailVerified: true,
                requiresKyc: true,
                termsAcceptedVersion: result.termsAcceptedVersion || 1,
                createdAt: result.joinedAt || new Date().toISOString(),
                providers: ['password'],
                kycStatus: result.kycStatus || 'pending',
                tier: result.tier || 'Bronze',
                subscriptionStatus: result.subscriptionStatus || 'inactive',
                subscriptionTier: result.subscriptionTier || 'free',
            };

            const session = createSessionMock(user.id);
            await storage.setItem(CURRENT_SESSION_KEY, JSON.stringify({ ...session, _mockUser: user }));

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
                storage.setItem(CURRENT_SESSION_KEY, JSON.stringify({ ...prev.session, _mockUser: updatedUser })).catch(console.error);
            }
            return { ...prev, user: updatedUser };
        });
    };

    const verifyEmailCode = async (code: string): Promise<AuthFlowDecision> => {
        setIsProcessing(true);
        try {
            if (!state.user && !state.pendingVerification?.userId) {
                throw new Error("No hay usuario para verificar");
            }
            
            if (state.pendingVerification?.code && state.pendingVerification.code !== code) {
                throw new Error("Código incorrecto o expirado.");
            }

            // At this point OTP is valid (or __DEV__ override).
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
                 nextRoute: { screen: 'BasicProfileSetup' },
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
        
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        await sendOtpActionCall({ email, code: otpCode }).catch(console.error);

        const pending: PendingVerificationState = {
            ...state.pendingVerification!,
            email,
            code: otpCode,
            expiresAt: Date.now() + 10 * 60 * 1000,
        };
        
        setState(prev => ({ ...prev, pendingVerification: pending }));
        show('Código reenviado al email.', 'success');
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

            const userId = await syncUserMutation({
                uid,
                email,
                name,
                role,
                avatar: profile?.avatar,
            });

            const session = createSessionMock(userId);
            await storage.setItem(CURRENT_SESSION_KEY, JSON.stringify(session));

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
                    storage.setItem(CURRENT_SESSION_KEY, JSON.stringify({ ...prev.session, _mockUser: updatedUser })).catch(console.error);
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

        await submitKycMutation({
            id: state.user.id as any,
            payload: data,
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
        try {
            await deleteUserMutation({ id: state.user.id as any });
        } catch (e: any) {
            console.error('Failed to delete account on backend', e);
            // Even if backend fails, clear the local session so the user isn't stuck
        }
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
            deviceId: 'backend-device',
            pendingVerification: undefined,
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
