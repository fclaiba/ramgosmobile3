import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useToast } from './ToastContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import {
    type AuthUserRole,
    type PublicUser,
    type SessionRecord,
    type SignUpInput,
    type SignUpResult,
    type SocialProfile,
    type SocialProvider,
    CURRENT_SESSION_KEY,
} from '../services/auth/mockConvexStore';
import { storage } from '../services/auth/storageAdapter';

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
    // REMOVED BLOCKING KYC ON LOGIN per user request (User St. 744)
    /*
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
    */

    if (!user.nickname) {
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

    // 1. Initialize Session
    useEffect(() => {
        (async () => {
            try {
                const storedSessionStr = await storage.getItem(CURRENT_SESSION_KEY);
                if (storedSessionStr) {
                    // Try parsing as JSON first
                    let storedSession: any;
                    try {
                        storedSession = JSON.parse(storedSessionStr);
                    } catch (e) {
                        // Legacy support if it was just a string ID
                        storedSession = { userId: storedSessionStr };
                    }

                    // CRITICAL FIX: Detect corrupted session where userId is actually a sessionId
                    if (storedSession?.userId?.startsWith('session_')) {
                        console.warn('[AuthContext] Detected corrupted session (sessionId instead of userId), clearing...');
                        await storage.removeItem(CURRENT_SESSION_KEY);
                        setState(prev => ({ ...prev, status: 'anonymous' }));
                        return;
                    }

                    if (storedSession && storedSession.userId) {
                        setState(prev => ({
                            ...prev,
                            session: storedSession,
                            // Keep loading until userData arrives
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
        if (userData && state.session?.userId) {
            const u = userData as any;
            const publicUser: PublicUser = {
                id: u._id,
                email: u.email,
                name: u.name,
                role: u.role as any,
                avatar: u.avatar,
                status: 'active',
                emailVerified: true,
                requiresKyc: true,
                kycStatus: u.kycStatus || 'pending',
                nickname: u.name,
                tier: (u.tier as any) || 'Bronze',
                termsAcceptedVersion: 1,
                subscriptionStatus: (u.subscriptionStatus as any) || 'inactive',
                subscriptionTier: (u.subscriptionTier as any) || 'free',
                createdAt: u.joinedAt,
                providers: ['password'],
                isTest: u.isTest
            };

            setState(prev => ({
                ...prev,
                user: publicUser,
                status: 'authenticated',
                // Preserve originalUser during sync if impersonating
                originalUser: prev.originalUser
            }));
        } else if (state.session?.userId && !userData) {
            // Still loading query
        } else if (!state.session?.userId && state.status !== 'anonymous') {
            setState(prev => ({ ...prev, user: null, status: 'anonymous' }));
        }
    }, [userData, state.session?.userId]);


    const signUpWithEmail = async (payload: SignUpInput) => {
        setIsProcessing(true);
        try {
            const newId = await registerMutation({
                email: payload.email,
                password: payload.password,
                name: payload.name,
                role: payload.role,
                avatar: payload.avatar
            });

            // newId is a real Convex ID from the mutation
            const newSession = createSessionMock(newId);
            await storage.setItem(CURRENT_SESSION_KEY, JSON.stringify(newSession));

            setState(prev => ({ ...prev, session: newSession }));

            // Return structure for UI
            return {
                user: { id: newId, email: payload.email } as any,
                userId: newId,
                verification: { email: payload.email, expiresAt: 0, code: '000000' }
            };
        } catch (error: any) {
            show(error.message || 'Error de registro', 'error');
            throw error;
        } finally {
            setIsProcessing(false);
        }
    };

    const loginWithEmail = async (email: string, password: string): Promise<AuthFlowDecision> => {
        setIsProcessing(true);
        try {
            const userData = await loginMutation({ email, password });

            const user: PublicUser = {
                id: userData._id,
                email: userData.email,
                name: userData.name,
                role: userData.role as UserRole,
                isTest: userData.isTest,
                avatar: userData.avatar,
                status: 'active',
                emailVerified: true,
                requiresKyc: true,
                termsAcceptedVersion: 1,
                createdAt: new Date().toISOString(),
                providers: ['password'],
                kycStatus: (userData.kycStatus as any) || 'pending',
                tier: (userData.tier as any) || 'Bronze',
                subscriptionStatus: (userData.subscriptionStatus as any) || 'inactive',
                subscriptionTier: 'free',
            };

            const session = createSessionMock(user.id);
            await storage.setItem(CURRENT_SESSION_KEY, JSON.stringify(session));

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
            setState(prev => ({ ...prev, lastError: error.message }));
            show(error.message || 'Error de inicio de sesión', 'error');
            throw error;
        } finally {
            setIsProcessing(false);
        }
    };

    const enterImpersonation = async (targetUserId: string) => {
        if (!state.user) throw new Error("Must be logged in to impersonate");

        setIsProcessing(true);
        try {
            const adminId = state.originalUser?.id ?? state.user.id;
            const targetUser = await impersonateMutation({
                adminId: adminId as any,
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
            show(e.message, "error");
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

    const updateProfile = async (updates: { nickname?: string; avatar?: string }) => {
        if (!state.user) return;
        await updateProfileMutation({
            id: state.user.id as any,
            updates: { name: updates.nickname, avatar: updates.avatar }
        });
    };

    // Stubs
    const verifyEmailCode = async (code: string): Promise<AuthFlowDecision> => {
        setIsProcessing(true);
        // Simulate API delay
        await new Promise(r => setTimeout(r, 1000));

        // In a real app, verify code with backend.
        // For now, accept any 6 digit code and proceed.

        if (!state.user) throw new Error("No hay usuario para verificar");

        // Optimistically update KYC/Email status locally if needed, 
        // but for now relying on Current User state mostly.

        // Force User Sync if possible, otherwise resolve route based on current state
        const user = state.user;

        // Assuming verification passes

        setIsProcessing(false);
        return {
            user: user,
            nextRoute: resolveNextRoute(user),
            requiresKyc: true,
            kycStatus: user.kycStatus
        };
    };
    const resendVerificationCode = async () => ({} as any);
    const loginWithSocial = async () => ({} as any);
    const updateRole = async (role: UserRole) => {
        if (!state.user) return;
        try {
            await updateUserMutation({
                id: state.user.id as any,
                updates: { role }
            });
            // State will update via useQuery subscription
            show(`Rol actualizado a ${role.toUpperCase()}`, 'success');
        } catch (error: any) {
            console.error("Failed to update role", error);
            show('Error al actualizar rol', 'error');
        }
    };
    const refreshActiveSession = async () => { };
    const markKycSubmitted = async () => { };
    const updateSubscription = async () => { };
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
    const deleteMyAccount = async () => logout();
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
