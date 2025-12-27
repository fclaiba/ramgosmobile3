import { storage } from './storageAdapter';

const STORE_KEY = '@ramgos/auth/store:v1';
export const CURRENT_SESSION_KEY = '@ramgos/auth/current-session';
export const DEVICE_KEY = '@ramgos/auth/device-id';

export type AuthUserRole = 'consumer' | 'business' | 'influencer' | 'admin';
export type AuthKycStatus = 'unverified' | 'pending' | 'approved' | 'rejected';

type VerificationPurpose = 'signup' | 'login' | 'recover';

interface StoredUser {
    id: string;
    email: string;
    emailVerified: boolean;
    status: 'active' | 'banned' | 'suspended';
    passwordHash?: string;
    role: AuthUserRole;
    name: string;
    avatar?: string;
    createdAt: string;
    updatedAt: string;
    providers: Array<{ type: 'password' | 'google' | 'facebook' | 'apple'; providerId?: string }>;
    security: {
        deviceIds: string[];
        failedLogins: number;
        lastLoginAt?: string;
        lastPasswordChangeAt?: string;
    };
    kyc: {
        status: AuthKycStatus;
        required: boolean;
        submittedAt?: string;
        updatedAt?: string;
        reviewerNotes?: string;
        metadata?: Record<string, unknown>;
    };
    profile: {
        nickname?: string;
        tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
    };
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
    createdAt: string;
    lastLoginAt?: string;
    providers: string[];
}

// ... existing code ...

// ... existing code ...


export interface SessionRecord {
    id: string;
    userId: string;
    deviceId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    refreshExpiresAt: number;
    createdAt: number;
    lastActiveAt: number;
    revokedAt?: number;
}

interface VerificationRecord {
    id: string;
    email: string;
    code: string;
    purpose: VerificationPurpose;
    expiresAt: number;
    createdAt: number;
    attemptsLeft: number;
}

interface DeviceBinding {
    id: string;
    userId?: string;
    createdAt: number;
    lastUsedAt: number;
    blockedUntil?: number;
}

interface PersistedStore {
    users: Record<string, StoredUser>;
    sessions: Record<string, SessionRecord>;
    verifications: Record<string, VerificationRecord>;
    devices: Record<string, DeviceBinding>;
}

const DEFAULT_STORE: PersistedStore = {
    users: {
        // Pre-seeded test users for development
        user_test_consumer: {
            id: 'user_test_consumer',
            email: 'test@ramgos.com',
            emailVerified: true,
            status: 'active',
            passwordHash: 'mock$4$321drowssap:pbuvwptg135:11', // password: 'password123'
            role: 'consumer',
            name: 'Usuario Test',
            createdAt: new Date('2025-01-01').toISOString(),
            updatedAt: new Date('2025-01-01').toISOString(),
            providers: [{ type: 'password' }],
            security: {
                deviceIds: [],
                failedLogins: 0,
            },
            kyc: {
                status: 'unverified',
                required: false,
                updatedAt: new Date('2025-01-01').toISOString(),
            },
            profile: {
                nickname: 'Test',
                tier: 'Bronze',
            },
        },
        user_test_business: {
            id: 'user_test_business',
            email: 'business@ramgos.com',
            emailVerified: true,
            status: 'active',
            passwordHash: 'mock$4$321drowssap:pbuvwptg135:11', // password: 'password123'
            role: 'business',
            name: 'Negocio Test',
            createdAt: new Date('2025-01-01').toISOString(),
            updatedAt: new Date('2025-01-01').toISOString(),
            providers: [{ type: 'password' }],
            security: {
                deviceIds: [],
                failedLogins: 0,
            },
            kyc: {
                status: 'approved',
                required: true,
                submittedAt: new Date('2025-01-02').toISOString(),
                updatedAt: new Date('2025-01-03').toISOString(),
            },
            profile: {
                nickname: 'TestBiz',
                tier: 'Silver',
            },
        },
        user_test_influencer: {
            id: 'user_test_influencer',
            email: 'influencer@ramgos.com',
            emailVerified: true,
            status: 'active',
            passwordHash: 'mock$4$321drowssap:pbuvwptg135:11', // password: 'password123'
            role: 'influencer',
            name: 'Influencer Test',
            createdAt: new Date('2025-01-01').toISOString(),
            updatedAt: new Date('2025-01-01').toISOString(),
            providers: [{ type: 'password' }],
            security: {
                deviceIds: [],
                failedLogins: 0,
            },
            kyc: {
                status: 'approved',
                required: true,
                submittedAt: new Date('2025-01-02').toISOString(),
                updatedAt: new Date('2025-01-03').toISOString(),
            },
            profile: {
                nickname: 'TestInflu',
                tier: 'Gold',
            },
        },
        user_test_admin: {
            id: 'user_test_admin',
            email: 'admin@ramgos.com',
            emailVerified: true,
            status: 'active',
            passwordHash: 'mock$4$321drowssap:pbuvwptg135:11', // password: 'password123'
            role: 'admin',
            name: 'Admin Test',
            createdAt: new Date('2025-01-01').toISOString(),
            updatedAt: new Date('2025-01-01').toISOString(),
            providers: [{ type: 'password' }],
            security: {
                deviceIds: [],
                failedLogins: 0,
            },
            kyc: {
                status: 'approved',
                required: false,
                updatedAt: new Date('2025-01-01').toISOString(),
            },
            profile: {
                nickname: 'Admin',
                tier: 'Platinum',
            },
        },
    },
    sessions: {},
    verifications: {},
    devices: {},
};

let memoryStore: PersistedStore = { ...DEFAULT_STORE };
let bootstrapped = false;

const ACCESS_TTL_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const VERIFICATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

const randomId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

const now = () => Date.now();

const hashPassword = (password: string) => {
    const salt = password.length % 7;
    const reversed = password.split('').reverse().join('');
    const rotated = password
        .split('')
        .map((char, index) => String.fromCharCode(char.charCodeAt(0) + ((index + salt) % 4)))
        .join('');
    return `mock$${salt}$${reversed}:${rotated}:${password.length}`;
};

const LEGACY_PASSWORD_HASHES = new Map<string, string>([
    ['mock$3$321drowssap:rcuuyrug}:11', 'password123'],
]);

const getLegacyPassword = (hash: string | undefined) => {
    if (!hash) return undefined;
    return LEGACY_PASSWORD_HASHES.get(hash);
};

const verifyPassword = (hash: string | undefined, password: string) => {
    if (!hash) return false;
    const legacyPassword = getLegacyPassword(hash);
    if (legacyPassword !== undefined) {
        return legacyPassword === password;
    }
    const [prefix, saltPart, payload] = hash.split('$');
    if (prefix !== 'mock' || !saltPart || !payload) return false;
    const recalculated = hashPassword(password);
    return recalculated === `mock$${saltPart}$${payload}`;
};

const generateCode = () => `${Math.floor(100000 + Math.random() * 900000)}`;

const sanitizeUser = (user: StoredUser): PublicUser => ({
    id: user.id,
    email: user.email,
    status: user.status,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
    emailVerified: user.emailVerified,
    requiresKyc: user.kyc.required,
    kycStatus: user.kyc.status,
    kycMetadata: user.kyc.metadata,
    tier: user.profile.tier,
    createdAt: user.createdAt,
    lastLoginAt: user.security.lastLoginAt,
    providers: user.providers.map((p) => p.type),
});

const persistStore = async () => {
    await storage.setItem(STORE_KEY, JSON.stringify(memoryStore));
};

const loadStore = async () => {
    const raw = await storage.getItem(STORE_KEY);
    if (!raw) {
        memoryStore = { ...DEFAULT_STORE };
        await persistStore();
        return;
    }

    try {
        const parsed = JSON.parse(raw) as PersistedStore;
        memoryStore = {
            users: parsed.users ?? {},
            sessions: parsed.sessions ?? {},
            verifications: parsed.verifications ?? {},
            devices: parsed.devices ?? {},
        };
    } catch (error) {
        console.error('[mockConvexStore] Failed to parse store, resetting', error);
        memoryStore = { ...DEFAULT_STORE };
        await persistStore();
    }
};

const ensureBootstrapped = async () => {
    if (bootstrapped) return;
    await loadStore();
    bootstrapped = true;
};

const ensureDeviceId = async (): Promise<string> => {
    await ensureBootstrapped();
    const existing = await storage.getItem(DEVICE_KEY);
    if (existing) {
        if (!memoryStore.devices[existing]) {
            memoryStore.devices[existing] = {
                id: existing,
                createdAt: now(),
                lastUsedAt: now(),
            };
            await persistStore();
        }
        return existing;
    }
    const id = randomId('device');
    memoryStore.devices[id] = {
        id,
        createdAt: now(),
        lastUsedAt: now(),
    };
    await storage.setItem(DEVICE_KEY, id);
    await persistStore();
    return id;
};

const bindDeviceToUser = async (deviceId: string, userId: string) => {
    const device = memoryStore.devices[deviceId];
    if (!device) {
        memoryStore.devices[deviceId] = {
            id: deviceId,
            createdAt: now(),
            lastUsedAt: now(),
            userId,
        };
    } else {
        device.userId = userId;
        device.lastUsedAt = now();
    }

    const user = memoryStore.users[userId];
    if (user && !user.security.deviceIds.includes(deviceId)) {
        user.security.deviceIds.push(deviceId);
        user.updatedAt = new Date().toISOString();
    }
};

const createSessionRecord = (userId: string, deviceId: string): SessionRecord => {
    const accessToken = randomId('access');
    const refreshToken = randomId('refresh');
    const timestamp = now();
    return {
        id: randomId('session'),
        userId,
        deviceId,
        accessToken,
        refreshToken,
        createdAt: timestamp,
        lastActiveAt: timestamp,
        expiresAt: timestamp + ACCESS_TTL_MS,
        refreshExpiresAt: timestamp + REFRESH_TTL_MS,
    };
};

const upsertUser = async (user: StoredUser) => {
    memoryStore.users[user.id] = user;
    await persistStore();
    return sanitizeUser(user);
};

const findUserByEmail = (email: string) => {
    const normalized = email.trim().toLowerCase();
    return Object.values(memoryStore.users).find((u) => u.email.toLowerCase() === normalized);
};

const findUserByProvider = (provider: string, providerId?: string) => {
    return Object.values(memoryStore.users).find((u) =>
        u.providers.some((p) => p.type === provider && (!providerId || p.providerId === providerId)),
    );
};

const createVerificationRecord = async (email: string, purpose: VerificationPurpose) => {
    const record: VerificationRecord = {
        id: randomId('verify'),
        email: email.trim().toLowerCase(),
        code: generateCode(),
        purpose,
        createdAt: now(),
        expiresAt: now() + VERIFICATION_TTL_MS,
        attemptsLeft: 5,
    };
    memoryStore.verifications[record.id] = record;
    await persistStore();
    return record;
};

const consumeVerificationCode = (email: string, code: string): VerificationRecord | null => {
    const normalized = email.trim().toLowerCase();
    const record = Object.values(memoryStore.verifications).find(
        (v) => v.email === normalized && v.code === code,
    );
    if (!record) return null;
    if (record.expiresAt < now()) {
        delete memoryStore.verifications[record.id];
        return null;
    }
    record.attemptsLeft -= 1;
    if (record.attemptsLeft <= 0) {
        delete memoryStore.verifications[record.id];
        return null;
    }
    delete memoryStore.verifications[record.id];
    return record;
};

const removeExpiredSessions = async () => {
    let changed = false;
    const current = now();
    Object.keys(memoryStore.sessions).forEach((key) => {
        const session = memoryStore.sessions[key];
        if (session.refreshExpiresAt <= current || session.revokedAt) {
            delete memoryStore.sessions[key];
            changed = true;
        }
    });
    if (changed) {
        await persistStore();
    }
};

const buildAuthPayload = (user: StoredUser, session: SessionRecord) => ({
    user: sanitizeUser(user),
    session,
});

export interface SignUpInput {
    email: string;
    password: string;
    name: string;
    role: AuthUserRole;
    avatar?: string;
    referralCode?: string;
}

export interface SignUpResult {
    user: PublicUser;
    userId: string;
    verification: {
        email: string;
        expiresAt: number;
        code: string;
    };
}

export interface AuthResult {
    user: PublicUser;
    session: SessionRecord;
}

export interface RefreshResult {
    user: PublicUser;
    session: SessionRecord;
}

export interface ResendVerificationResult {
    email: string;
    expiresAt: number;
    code: string;
    userId: string;
}

const signUpWithEmail = async (input: SignUpInput): Promise<SignUpResult> => {
    await ensureBootstrapped();
    const existing = findUserByEmail(input.email);
    if (existing) {
        throw new Error('El email ya está registrado. Intenta iniciar sesión.');
    }

    const requiresKyc = input.role === 'business' || input.role === 'influencer';
    const timestamp = new Date().toISOString();
    const user: StoredUser = {
        id: randomId('user'),
        email: input.email.trim(),
        emailVerified: false,
        passwordHash: hashPassword(input.password),
        role: input.role,
        status: 'active',
        name: input.name,
        avatar:
            input.avatar ??
            `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(input.name)}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        providers: [{ type: 'password' }],
        security: {
            deviceIds: [],
            failedLogins: 0,
        },
        kyc: {
            status: requiresKyc ? 'unverified' : 'approved',
            required: requiresKyc,
            updatedAt: timestamp,
        },
        profile: {
            nickname: input.name.split(' ')[0] ?? input.name,
            tier: 'Bronze',
        },
    };

    memoryStore.users[user.id] = user;
    const verification = await createVerificationRecord(user.email, 'signup');
    await persistStore();

    return {
        user: sanitizeUser(user),
        userId: user.id,
        verification: {
            email: user.email,
            expiresAt: verification.expiresAt,
            code: verification.code,
        },
    };
};

const verifyEmailCode = async (email: string, code: string): Promise<AuthResult> => {
    await ensureBootstrapped();
    const record = consumeVerificationCode(email, code);
    if (!record) {
        throw new Error('El código ingresado es inválido o ha expirado.');
    }

    const user = findUserByEmail(email);
    if (!user) {
        throw new Error('No se encontró el usuario asociado al código.');
    }

    user.emailVerified = true;
    user.updatedAt = new Date().toISOString();
    user.security.failedLogins = 0;
    const deviceId = await ensureDeviceId();
    await bindDeviceToUser(deviceId, user.id);

    const session = createSessionRecord(user.id, deviceId);
    memoryStore.sessions[session.id] = session;
    user.security.lastLoginAt = new Date(session.createdAt).toISOString();
    await storage.setItem(CURRENT_SESSION_KEY, session.id);
    await persistStore();

    return buildAuthPayload(user, session);
};

const loginWithEmail = async (email: string, password: string): Promise<AuthResult> => {
    await ensureBootstrapped();
    await removeExpiredSessions();

    const user = findUserByEmail(email);
    const legacyPassword = getLegacyPassword(user?.passwordHash);
    const passwordMatches = user ? verifyPassword(user.passwordHash, password) : false;
    if (!user || !passwordMatches) {
        throw new Error('Credenciales inválidas.');
    }
    if (!user.emailVerified) {
        const verification = await createVerificationRecord(user.email, 'login');
        await persistStore();
        throw new Error(
            `EMAIL_NOT_VERIFIED:${verification.expiresAt}`, // handled by context for resend
        );
    }

    const deviceId = await ensureDeviceId();
    await bindDeviceToUser(deviceId, user.id);

    const session = createSessionRecord(user.id, deviceId);
    memoryStore.sessions[session.id] = session;
    if (legacyPassword !== undefined && legacyPassword === password) {
        user.passwordHash = hashPassword(password);
    }
    user.security.lastLoginAt = new Date(session.createdAt).toISOString();
    await storage.setItem(CURRENT_SESSION_KEY, session.id);
    await persistStore();

    return buildAuthPayload(user, session);
};

export type SocialProvider = 'google' | 'facebook' | 'apple';

export interface SocialProfile {
    providerUserId?: string;
    email?: string;
    name?: string;
    avatar?: string;
}

const socialLogin = async (
    provider: SocialProvider,
    profile: SocialProfile,
    fallbackRole: AuthUserRole = 'consumer',
): Promise<AuthResult> => {
    await ensureBootstrapped();
    await removeExpiredSessions();

    let user =
        (profile.providerUserId && findUserByProvider(provider, profile.providerUserId)) ||
        (profile.email ? findUserByEmail(profile.email) : undefined);

    if (!user) {
        const timestamp = new Date().toISOString();
        const role: AuthUserRole = fallbackRole;
        const requiresKyc = role === 'business' || role === 'influencer';
        user = {
            id: randomId('user'),
            email:
                profile.email ??
                `${provider}_${Math.random().toString(36).slice(2, 8)}@ramgos.app`,
            emailVerified: true,
            role,
            status: 'active',
            name: profile.name ?? `${provider.toUpperCase()} User`,
            avatar:
                profile.avatar ??
                `https://api.dicebear.com/7.x/croodles/svg?seed=${encodeURIComponent(
                    profile.name ?? provider,
                )}`,
            createdAt: timestamp,
            updatedAt: timestamp,
            providers: [{ type: provider, providerId: profile.providerUserId }],
            security: {
                deviceIds: [],
                failedLogins: 0,
                lastLoginAt: timestamp,
            },
            kyc: {
                status: requiresKyc ? 'unverified' : 'approved',
                required: requiresKyc,
                updatedAt: timestamp,
            },
            profile: {
                nickname: profile.name?.split(' ')[0] ?? provider,
                tier: 'Silver',
            },
        };
        memoryStore.users[user.id] = user;
    } else {
        if (!user.providers.some((p) => p.type === provider)) {
            user.providers.push({ type: provider, providerId: profile.providerUserId });
        }
        user.updatedAt = new Date().toISOString();
        user.security.failedLogins = 0;
        user.emailVerified = true;
    }

    const deviceId = await ensureDeviceId();
    await bindDeviceToUser(deviceId, user.id);
    const session = createSessionRecord(user.id, deviceId);
    memoryStore.sessions[session.id] = session;
    user.security.lastLoginAt = new Date(session.createdAt).toISOString();
    await storage.setItem(CURRENT_SESSION_KEY, session.id);
    await persistStore();

    return buildAuthPayload(user, session);
};

const refreshSession = async (refreshToken: string): Promise<RefreshResult> => {
    await ensureBootstrapped();
    await removeExpiredSessions();

    const session = Object.values(memoryStore.sessions).find(
        (s) => s.refreshToken === refreshToken && !s.revokedAt,
    );
    if (!session) {
        throw new Error('Sesión inválida.');
    }
    if (session.refreshExpiresAt <= now()) {
        delete memoryStore.sessions[session.id];
        await persistStore();
        throw new Error('La sesión expiró. Inicia sesión nuevamente.');
    }

    const user = memoryStore.users[session.userId];
    if (!user) {
        delete memoryStore.sessions[session.id];
        await persistStore();
        throw new Error('Usuario no encontrado.');
    }

    session.accessToken = randomId('access');
    session.refreshToken = randomId('refresh');
    session.expiresAt = now() + ACCESS_TTL_MS;
    session.refreshExpiresAt = now() + REFRESH_TTL_MS;
    session.lastActiveAt = now();
    user.security.lastLoginAt = new Date(session.lastActiveAt).toISOString();
    await persistStore();

    return buildAuthPayload(user, session);
};

const revokeSession = async (sessionId: string) => {
    await ensureBootstrapped();
    if (memoryStore.sessions[sessionId]) {
        delete memoryStore.sessions[sessionId];
        await persistStore();
    }
};

const revokeAllSessionsForUser = async (userId: string) => {
    await ensureBootstrapped();
    let changed = false;
    Object.keys(memoryStore.sessions).forEach((key) => {
        if (memoryStore.sessions[key].userId === userId) {
            delete memoryStore.sessions[key];
            changed = true;
        }
    });
    if (changed) {
        await persistStore();
    }
};

const getSessionById = async (sessionId: string): Promise<AuthResult | null> => {
    await ensureBootstrapped();
    await removeExpiredSessions();
    const session = memoryStore.sessions[sessionId];
    if (!session) return null;
    if (session.expiresAt <= now()) {
        delete memoryStore.sessions[sessionId];
        await persistStore();
        return null;
    }
    const user = memoryStore.users[session.userId];
    if (!user) return null;
    return buildAuthPayload(user, session);
};

const updateRole = async (userId: string, role: AuthUserRole): Promise<PublicUser> => {
    await ensureBootstrapped();
    const user = memoryStore.users[userId];
    if (!user) {
        throw new Error('Usuario no encontrado');
    }
    user.role = role;
    user.updatedAt = new Date().toISOString();
    user.kyc.required = role === 'business' || role === 'influencer';
    if (!user.kyc.required && user.kyc.status !== 'approved') {
        user.kyc.status = 'approved';
    }
    await persistStore();
    return sanitizeUser(user);
};

const markKycSubmitted = async (userId: string, data?: Record<string, unknown>) => {
    await ensureBootstrapped();
    const user = memoryStore.users[userId];
    if (!user) {
        throw new Error('Usuario no encontrado');
    }
    user.kyc.status = 'pending';
    user.kyc.required = true;
    user.kyc.submittedAt = new Date().toISOString();
    user.kyc.updatedAt = user.kyc.submittedAt;
    if (data) {
        user.kyc.metadata = {
            ...user.kyc.metadata,
            ...data,
        };
    }
    await persistStore();
    return sanitizeUser(user);
};

const updateKycStatus = async (userId: string, status: AuthKycStatus, notes?: string) => {
    await ensureBootstrapped();
    const user = memoryStore.users[userId];
    if (!user) return;
    user.kyc.status = status;
    user.kyc.updatedAt = new Date().toISOString();
    user.kyc.reviewerNotes = notes;
    await persistStore();
};

const updateProfile = async (userId: string, updates: { nickname?: string; avatar?: string }) => {
    await ensureBootstrapped();
    const user = memoryStore.users[userId];
    if (!user) throw new Error('Usuario no encontrado');

    if (updates.nickname) {
        user.profile.nickname = updates.nickname;
    }
    if (updates.avatar) {
        user.avatar = updates.avatar;
    }

    user.updatedAt = new Date().toISOString();
    await persistStore();
    return sanitizeUser(user);
};

const listSessionsForUser = async (userId: string) => {
    await ensureBootstrapped();
    return Object.values(memoryStore.sessions).filter((session) => session.userId === userId);
};

const getStoreSnapshot = async (): Promise<PersistedStore> => {
    await ensureBootstrapped();
    return JSON.parse(JSON.stringify(memoryStore));
};

const resendVerification = async (
    email: string,
    purpose: VerificationPurpose = 'signup',
): Promise<ResendVerificationResult> => {
    await ensureBootstrapped();
    const user = findUserByEmail(email);
    if (!user) {
        throw new Error('No se encontró un usuario con ese email.');
    }
    const record = await createVerificationRecord(user.email, purpose);
    await persistStore();
    return {
        email: record.email,
        expiresAt: record.expiresAt,
        code: record.code,
        userId: user.id,
    };
};

const getUserById = async (userId: string): Promise<PublicUser | null> => {
    await ensureBootstrapped();
    const user = memoryStore.users[userId];
    return user ? sanitizeUser(user) : null;
};

const getPendingKycUsers = async (): Promise<PublicUser[]> => {
    await ensureBootstrapped();
    return Object.values(memoryStore.users)
        .filter((user) => user.kyc.status === 'pending')
        .map(sanitizeUser);
};

export const mockConvexStore = {
    init: ensureBootstrapped,
    ensureDeviceId,
    signUpWithEmail,
    verifyEmailCode,
    loginWithEmail,
    socialLogin,
    refreshSession,
    revokeSession,
    revokeAllSessionsForUser,
    getSessionById,
    updateRole,
    markKycSubmitted,
    updateKycStatus,
    updateProfile,
    listSessionsForUser,
    getStoreSnapshot,
    resendVerification,
    getUserById,
    getPendingKycUsers,
    CURRENT_SESSION_KEY,
    DEVICE_KEY,
};

export type { PersistedStore };

