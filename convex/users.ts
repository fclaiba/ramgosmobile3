import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { assertSelfOrAdmin, requireActor, checkRateLimit, createSession, getActorOrNull } from "./authHelpers";
import { internal } from "./_generated/api";
import { hashPassword, verifyPassword } from "./passwordHelpers";

export const internalCheckRateLimit = internalMutation({
    args: { key: v.string(), maxAttempts: v.number(), windowMs: v.number() },
    handler: async (ctx, args) => {
        await checkRateLimit(ctx, args.key, args.maxAttempts, args.windowMs);
    }
});

export const checkInfluencerMetrics = internalMutation({
    args: {},
    handler: async (ctx, args) => {
        const influencers = await ctx.db
            .query("users")
            // Ideally we'd have an index on role, but filtering in memory for MVP is okay if set is small
            .filter((q) => q.eq(q.field("role"), "influencer"))
            .collect();

        const now = Date.now();
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

        for (const user of influencers) {
            const joinedAt = new Date(user.joinedAt).getTime();
            // If account is older than 30 days
            if (now - joinedAt > THIRTY_DAYS_MS) {
                // If followers < 5000 (default 0)
                if ((user.followerCount || 0) < 5000) {
                    console.log(`[Influencer Check] Downgrading user ${user._id} (${user.email}) due to insufficient followers.`);
                    await ctx.db.patch(user._id, {
                        role: 'consumer'
                    });
                    // Optional: Send notification here
                }
            }
        }
    }
});

const ALLOWED_ROLES = new Set(['consumer', 'business', 'influencer', 'admin']);

const sanitizeUser = (user: any) => ({
    _id: user._id,
    uid: user.uid,
    email: user.email,
    name: user.name,
    nickname: user.nickname,
    role: user.role,
    avatar: user.avatar,
    kycStatus: user.kycStatus,
    joinedAt: user.joinedAt,
    tier: user.tier,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionTier: user.subscriptionTier,
    termsAcceptedVersion: user.termsAcceptedVersion,
    isTest: user.isTest,
    balance: user.balance,
    bio: user.bio,
    sellerRating: user.sellerRating,
    sellerReviewCount: user.sellerReviewCount,
    sellerTotalSales: user.sellerTotalSales,
    sellerResponseTimeHours: user.sellerResponseTimeHours,
    isBanned: user.isBanned,
});

export const register = mutation({
    args: {
        email: v.string(),
        password: v.string(),
        name: v.string(),
        role: v.string(),
        avatar: v.optional(v.string()),
        termsVersion: v.optional(v.number()),
        nickname: v.optional(v.string()),
        phoneNumber: v.optional(v.string()),
        bio: v.optional(v.string()),
        businessCategory: v.optional(v.string()),
        username: v.optional(v.string()),
        referralCode: v.optional(v.string()),
        referredBy: v.optional(v.string()),
        instagramUrl: v.optional(v.string()),
        tiktokUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        if (!ALLOWED_ROLES.has(args.role)) {
            throw new Error("Rol inválido.");
        }

        const email = args.email.trim().toLowerCase();
        const name = args.name.trim();
        if (!email || !name) {
            throw new Error("Email y nombre son obligatorios.");
        }

        // Password complexity validation
        const pass = args.password;
        if (pass.length < 8 || !/[A-Z]/.test(pass) || !/[0-9]/.test(pass)) {
            throw new Error("La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.");
        }

        const existing = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();

        if (existing) {
            throw new Error("No se pudo registrar la cuenta. Si ya tienes una cuenta, intenta iniciar sesión.");
        }

        if (args.username) {
            const existingUsername = await ctx.db
                .query("users")
                .withIndex("by_username", (q) => q.eq("username", args.username!.trim()))
                .first();
            if (existingUsername) {
                throw new Error("El nombre de usuario ya está en uso. Por favor, elige otro.");
            }
        }

        const hashedPassword = hashPassword(args.password);
        const initialInfluencerStatus = args.role === 'influencer' ? 'pending' : undefined;

        const userId = await ctx.db.insert("users", {
            uid: Math.random().toString(36).slice(2),
            email,
            password: hashedPassword,
            name,
            role: args.role as any,
            avatar: args.avatar,
            nickname: args.nickname?.trim() || undefined,
            phoneNumber: args.phoneNumber?.trim() || undefined,
            bio: args.bio?.trim() || undefined,
            businessCategory: args.businessCategory?.trim() || undefined,
            username: args.username?.trim() || undefined,
            referralCode: args.referralCode?.trim() || undefined,
            referredBy: args.referredBy?.trim() || undefined,
            kycStatus: "pending",
            influencerStatus: initialInfluencerStatus as any,
            instagramUrl: args.instagramUrl?.trim() || undefined,
            tiktokUrl: args.tiktokUrl?.trim() || undefined,
            joinedAt: new Date().toISOString(),
            tier: "Bronze",
            subscriptionStatus: "inactive",
            isTest: email.endsWith("@ramgos.com"),
            ...(args.termsVersion ? { termsAcceptedVersion: args.termsVersion } : {}),
        });

        const sessionToken = await createSession(ctx, userId);
        return { userId: String(userId), sessionToken };
    },
});

export const login = mutation({
    args: {
        email: v.string(),
        password: v.string(),
    },
    handler: async (ctx, args) => {
        const email = args.email.trim().toLowerCase();
        await checkRateLimit(ctx, `login_${email}`, 5, 900000);

        const user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();

        if (!user) {
            // Anti-enumeration: Generic error message
            throw new Error("Credenciales incorrectas.");
        }

        if ((user as any).isBanned) {
            throw new Error("ACCOUNT_BANNED");
        }

        const passwordHash = user.password;
        if (!passwordHash || !verifyPassword(args.password, passwordHash)) {
            throw new Error("Credenciales incorrectas.");
        }

        const sessionToken = await createSession(ctx, user._id);
        return { ...sanitizeUser(user), sessionToken };
    },
});

export const oauthLogin = mutation({
    args: {
        provider: v.string(), // 'google' | 'apple'
        email: v.string(),
        name: v.string(),
        providerUserId: v.string(),
    },
    handler: async (ctx, args) => {
        const email = args.email.trim().toLowerCase();
        
        let user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();

        if (!user) {
            // Auto-register consumer
            const userId = await ctx.db.insert("users", {
                uid: Math.random().toString(36).slice(2), // Use internal UID
                email,
                name: args.name.trim(),
                role: "consumer",
                kycStatus: "pending",
                joinedAt: new Date().toISOString(),
                tier: "Bronze",
                subscriptionStatus: "inactive",
                isTest: email.endsWith("@ramgos.com"),
                // In a real app we might store providerUserId in a linkedAccounts table or directly
            });
            user = await ctx.db.get(userId);
        }

        if ((user as any).isBanned) {
            throw new Error("ACCOUNT_BANNED");
        }

        const sessionToken = await createSession(ctx, user!._id);
        return { ...sanitizeUser(user), sessionToken };
    },
});

export const logout = mutation({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.sessionToken) return;
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.sessionToken!))
            .first();
        if (session && !session.revokedAt) {
            await ctx.db.patch(session._id, { revokedAt: new Date().toISOString() });
        }
    },
});

// Change the password of an authenticated user.
export const changePassword = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        code: v.string(),
        currentPassword: v.string(),
        newPassword: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        if (args.newPassword.length < 8 || !/[A-Z]/.test(args.newPassword) || !/[0-9]/.test(args.newPassword)) {
            throw new Error("La nueva contraseña debe tener al menos 8 caracteres, una mayúscula y un número.");
        }
        if (args.newPassword === args.currentPassword) {
            throw new Error("La nueva contraseña debe ser distinta a la actual.");
        }

        const user = await ctx.db.get(actor.id);
        if (!user) {
            throw new Error("Usuario no encontrado.");
        }

        if (user.otp !== args.code) {
            throw new Error("El código de verificación es inválido.");
        }
        if (user.otpExpiresAt && user.otpExpiresAt < Date.now()) {
            throw new Error("El código ha expirado.");
        }

        if (!user.password || !verifyPassword(args.currentPassword, user.password)) {
            throw new Error("La contraseña actual es incorrecta.");
        }

        // Password History check
        const history = user.passwordHistory || [];
        for (const oldHash of history) {
            if (verifyPassword(args.newPassword, oldHash)) {
                throw new Error("No puedes usar contraseñas anteriores por razones de seguridad.");
            }
        }

        const newHash = hashPassword(args.newPassword);
        const newHistory = [newHash, ...history].slice(0, 5); // Keep last 5

        await ctx.db.patch(actor.id, {
            password: newHash,
            passwordHistory: newHistory,
            otp: undefined,
            otpExpiresAt: undefined,
        });
        return { success: true };
    },
});

export const getUser = query({
    args: { id: v.id("users"), sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        try {
            if (args.sessionToken) {
                 const actor = await getActorOrNull(ctx, args.sessionToken);
                 if (!actor || actor.idString !== args.id) {
                     return null;
                 }
            }
            const user = await ctx.db.get(args.id);
            return user ? sanitizeUser(user) : null;
        } catch (e) {
            return null;
        }
    },
});

export const syncUser = mutation({
    args: {
        uid: v.string(),
        name: v.string(),
        email: v.string(),
        role: v.string(),
        avatar: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Legacy sync for Social Auth (if we keep it)
        // For now reuse logic
        const email = args.email.trim().toLowerCase();
        const existing = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();

        if (existing) {
            // SECURITY (Fase 1): syncUser NO puede emitir sesión para una
            // cuenta con contraseña — eso permitía account takeover enviando
            // el email de la víctima. Esas cuentas deben usar login().
            // Deuda Fase 2: verificar el token OAuth del proveedor server-side.
            if (existing.password) {
                throw new Error(
                    "Esta cuenta usa contraseña. Iniciá sesión con email y contraseña.",
                );
            }
            const sessionToken = await createSession(ctx, existing._id);
            return { userId: String(existing._id), sessionToken };
        }

        const isTestAccount = email.endsWith('@ramgos.com') || (args as any).isTest;

        const newUserId = await ctx.db.insert("users", {
            uid: args.uid,
            email,
            name: args.name.trim(),
            role: args.role as any,
            avatar: args.avatar,
            kycStatus: "pending",
            joinedAt: new Date().toISOString(),
            tier: "Bronze",
            subscriptionStatus: "inactive",
            isTest: isTestAccount,
        });
        const sessionToken = await createSession(ctx, newUserId);
        return { userId: String(newUserId), sessionToken };
    }
});

export const updateProfile = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        id: v.id("users"),
        updates: v.object({
            name: v.optional(v.string()),
            nickname: v.optional(v.string()),
            avatar: v.optional(v.string()),
            phoneNumber: v.optional(v.string()),
            username: v.optional(v.string()),
            referralCode: v.optional(v.string()),
        })
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, String(args.id));

        const userDoc = await ctx.db.get(args.id);
        if (!userDoc) throw new Error("Usuario no encontrado.");

        const updates: any = {};
        if (args.updates.name !== undefined) updates.name = args.updates.name.trim();
        if (args.updates.nickname !== undefined) updates.nickname = args.updates.nickname.trim();
        if (args.updates.avatar !== undefined) updates.avatar = args.updates.avatar;
        if (args.updates.phoneNumber !== undefined) updates.phoneNumber = args.updates.phoneNumber.trim();
        if (args.updates.referralCode !== undefined) updates.referralCode = args.updates.referralCode.trim();

        if (args.updates.username !== undefined) {
            const newUsername = args.updates.username.trim();
            if (newUsername !== userDoc.username) {
                const existing = await ctx.db
                    .query("users")
                    .filter((q) => q.eq(q.field("username"), newUsername))
                    .first();
                if (existing) {
                    throw new Error("El nombre de usuario ya está en uso.");
                }

                const now = Date.now();
                const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
                if (userDoc.usernameLastChangedAt && now - userDoc.usernameLastChangedAt < FIFTEEN_DAYS_MS) {
                    const daysLeft = Math.ceil((FIFTEEN_DAYS_MS - (now - userDoc.usernameLastChangedAt)) / (1000 * 60 * 60 * 24));
                    throw new Error(`Debes esperar ${daysLeft} días para volver a cambiar tu nombre de usuario.`);
                }

                updates.username = newUsername;
                updates.usernameLastChangedAt = now;
            }
        }

        if (Object.keys(updates).length > 0) {
            await ctx.db.patch(args.id, updates);
        }
    }
});

// --- NEW CRUD ---

export const listUsers = query({
    args: {
        sessionToken: v.optional(v.string()),
        role: v.optional(v.string()),
        actorId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        if (actor.role !== 'admin' && actor.role !== 'developer') {
            throw new Error("No autorizado.");
        }
        let q = ctx.db.query("users");
        const users = await q.collect();
        const sanitized = users
            .map(sanitizeUser)
            .sort((a, b) => (b.joinedAt || "").localeCompare(a.joinedAt || ""));
        if (args.role) {
            return sanitized.filter(u => u.role === args.role);
        }
        return sanitized;
    },
});

export const updateUser = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        id: v.id("users"),
        updates: v.object({
            name: v.optional(v.string()),
            role: v.optional(v.string()),
            kycStatus: v.optional(v.string()),
            tier: v.optional(v.string()),
            subscriptionStatus: v.optional(v.string()),
            avatar: v.optional(v.string()),
            email: v.optional(v.string()),
            isTest: v.optional(v.boolean()),
        })
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);

        const isAdmin = actor.role === 'admin';
        const isSelf = actor.idString === String(args.id);
        if (!isAdmin && !isSelf) {
            throw new Error("No autorizado.");
        }

        if (!isAdmin) {
            const forbidden = ['role', 'kycStatus', 'tier', 'subscriptionStatus', 'isTest'];
            const isDevAccount = actor.email?.endsWith('@ramgos.com');
            
            for (const field of forbidden) {
                if ((field === 'role' || field === 'isTest') && isDevAccount) continue; // Allow dev accounts to change role and isTest
                
                if (Object.prototype.hasOwnProperty.call(args.updates, field)) {
                    throw new Error("No autorizado para actualizar ese campo.");
                }
            }
        }

        if (args.updates.role && !ALLOWED_ROLES.has(args.updates.role)) {
            throw new Error("Rol inválido.");
        }

        await ctx.db.patch(args.id, {
            ...args.updates,
            role: args.updates.role as any,
        });
    },
});

export const deleteUser = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        id: v.id("users")
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const isAdmin = actor.role === 'admin';
        const isSelf = actor.idString === String(args.id);
        if (!isAdmin && !isSelf) {
            throw new Error("No autorizado.");
        }
        await ctx.db.delete(args.id);
    },
});

export const unbanUser = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        if (actor.role !== 'admin') throw new Error("No autorizado.");
        await ctx.db.patch(args.userId, { isBanned: false });
        await ctx.db.insert("audit_logs", {
            actorUserId: actor.idString,
            targetUserId: String(args.userId),
            action: "USER_UNBANNED",
            timestamp: new Date().toISOString(),
        });
        return { success: true };
    },
});

export const banUser = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.id("users"),
        reason: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        if (actor.role !== 'admin') throw new Error("No autorizado.");
        
        await ctx.db.patch(args.userId, {
            isBanned: true
        });
        
        // Revoke active sessions
        const sessions = await ctx.db
            .query("sessions")
            .withIndex("by_user", q => q.eq("userId", args.userId))
            .collect();
        const now = new Date().toISOString();
        for (const session of sessions) {
            if (!session.revokedAt) {
                await ctx.db.patch(session._id, { revokedAt: now });
            }
        }

        await ctx.db.insert("audit_logs", {
            actorUserId: actor.idString,
            targetUserId: String(args.userId),
            action: "USER_BANNED",
            timestamp: now,
            metadata: args.reason ? { reason: args.reason } : undefined,
        });
    }
});

export const approveKYC = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        targetUserId: v.id("users"),
        actorId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        if (actor.role !== 'admin' && actor.role !== 'developer') {
            throw new Error("No tienes permisos de administrador.");
        }
        const user = await ctx.db.get(args.targetUserId);
        if (!user) throw new Error("Usuario no encontrado.");
        const now = new Date().toISOString();
        const docs = (user.verificationDocuments ?? []).map((d) => ({
            ...d,
            status: 'approved' as const,
            reviewedAt: now,
        }));
        await ctx.db.patch(args.targetUserId, {
            kycStatus: 'approved',
            verificationDocuments: docs.length ? docs : undefined,
        });
        await ctx.db.insert("audit_logs", {
            actorUserId: actor.idString,
            targetUserId: String(args.targetUserId),
            action: "KYC_APPROVED",
            timestamp: now,
        });
    }
});

export const internalApproveKYC = internalMutation({
    args: {
        targetUserId: v.id("users")
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.targetUserId, {
            kycStatus: 'approved'
        });
    }
});

export const internalRejectKYC = internalMutation({
    args: {
        targetUserId: v.id("users")
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.targetUserId, {
            kycStatus: 'rejected'
        });
    }
});

export const rejectKYC = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        targetUserId: v.id("users"),
        reason: v.optional(v.string()),
        actorId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        if (actor.role !== 'admin' && actor.role !== 'developer') {
            throw new Error("No tienes permisos de administrador.");
        }
        const user = await ctx.db.get(args.targetUserId);
        if (!user) throw new Error("Usuario no encontrado.");
        const now = new Date().toISOString();
        const docs = (user.verificationDocuments ?? []).map((d) => ({
            ...d,
            status: 'rejected' as const,
            reviewedAt: now,
        }));
        await ctx.db.patch(args.targetUserId, {
            kycStatus: 'rejected',
            verificationDocuments: docs.length ? docs : undefined,
        });
        await ctx.db.insert("audit_logs", {
            actorUserId: actor.idString,
            targetUserId: String(args.targetUserId),
            action: "KYC_REJECTED",
            timestamp: now,
            metadata: args.reason ? { reason: args.reason } : undefined,
        });
    }
});

export const acceptTerms = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        id: v.id("users"),
        version: v.number(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);

        assertSelfOrAdmin(actor, String(args.id));

        await ctx.db.patch(args.id as Id<"users">, {
            termsAcceptedVersion: args.version
        });
    }
});

export const submitKyc = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        id: v.id("users"),
        payload: v.any(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, String(args.id));

        const payload = (args.payload || {}) as Record<string, unknown>;
        const now = new Date().toISOString();
        const docs: Array<{ type: string; url: string; status: 'pending' | 'approved' | 'rejected'; uploadedAt: string; reviewedAt?: string }> = [];

        const pushDoc = (type: string, url: unknown) => {
            if (typeof url === 'string' && url.trim()) {
                docs.push({ type, url: url.trim(), status: 'pending', uploadedAt: now });
            }
        };

        pushDoc('id_front', payload.documentFront);
        pushDoc('id_back', payload.documentBack);
        pushDoc('business_license', payload.incorporationDoc);
        pushDoc('address_proof', payload.premisesPhoto);

        const patch: Record<string, unknown> = {
            kycStatus: 'pending',
            verificationDocuments: docs.length > 0 ? docs : undefined,
        };

        if (typeof payload.businessAddress === 'string' && payload.businessAddress.trim()) {
            patch.bio = payload.businessAddress.trim();
        }
        if (typeof payload.socialLink === 'string' && payload.socialLink.trim()) {
            patch.bio = payload.socialLink.trim();
        }
        if (typeof payload.ein === 'string' && payload.ein.trim()) {
            const prevBio = typeof patch.bio === 'string' ? `${patch.bio} | ` : '';
            patch.bio = `${prevBio}EIN: ${payload.ein.trim()}`;
        }

        await ctx.db.patch(args.id, patch);
    }
});

export const updateSubscription = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        id: v.id("users"),
        tier: v.union(v.literal('free'), v.literal('pro'), v.literal('business')),
        status: v.union(v.literal('active'), v.literal('inactive')),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, String(args.id));

        await ctx.db.patch(args.id, {
            subscriptionStatus: args.status,
            subscriptionTier: args.tier,
        } as any);
    }
});

export const saveStripeConnectAccount = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        id: v.id("users"),
        stripeConnectAccountId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, String(args.id));
        await ctx.db.patch(args.id, {
            stripeConnectAccountId: args.stripeConnectAccountId,
        } as any);
    }
});

export const internalUpdateStripeConnectId = internalMutation({
    args: {
        userId: v.id("users"),
        stripeConnectAccountId: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, {
            stripeConnectAccountId: args.stripeConnectAccountId,
        } as any);
    }
});

// ---------------------------------------------------------------------------
// Influencer attribution helpers.
// ---------------------------------------------------------------------------

/** Fase 6 — dashboard de referidos para ReferralContext (sessionToken only). */
export const getReferralDashboard = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        const user = await ctx.db.get(actor.id);
        if (!user) {
            return {
                referralCode: "",
                referralLink: "",
                stats: { totalInvited: 0, totalEarned: 0, level: 1 },
                referralSummary: { registrations: 0, purchases: 0, totalPoints: 0 },
                history: [] as Array<{
                    id: string;
                    name: string;
                    status: string;
                    earned: number;
                    date: string;
                    points?: number;
                }>,
                referrals: [] as Array<{
                    id: string;
                    name: string;
                    status: string;
                    earned: number;
                    date: string;
                    points?: number;
                }>,
            };
        }

        const referralCode = ((user as any).referralCode as string | undefined) ?? "";

        const referred = await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("referredBy"), actor.idString))
            .collect();

        const ledger = await ctx.db
            .query("pointsLedger")
            .withIndex("by_user", (q) => q.eq("userId", actor.idString))
            .order("desc")
            .take(100);

        const referralEntries = ledger.filter((e) => e.source === "referral");
        const totalEarned = referralEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const registrations = referred.length;
        const purchases = referralEntries.filter(
            (e) =>
                (e.description ?? "").toLowerCase().includes("compra") ||
                !!(e.metadata as any)?.friendUserId,
        ).length;

        const history = referralEntries.map((e) => ({
            id: String(e._id),
            name: e.description ?? "Referido",
            status: e.type,
            earned: e.amount,
            date: e.createdAt,
            points: e.amount,
        }));

        const level =
            registrations >= 20 ? 4 : registrations >= 10 ? 3 : registrations >= 5 ? 2 : 1;

        return {
            referralCode,
            referralLink: referralCode ? `https://ramgos.com/ref/${referralCode}` : "",
            stats: { totalInvited: registrations, totalEarned, level },
            referralSummary: { registrations, purchases, totalPoints: totalEarned },
            history,
            referrals: history,
        };
    },
});

const generateReferralCode = (seed: string): string => {
    // 6-char base36 from seed + random nonce.
    const nonce = Math.random().toString(36).slice(2, 5);
    const base = seed.replace(/[^a-z0-9]/gi, '').slice(0, 3) || 'ref';
    return `${base}${nonce}`.toUpperCase().slice(0, 6);
};

export const ensureReferralCode = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, String(args.userId));

        const user = await ctx.db.get(args.userId as Id<"users">);
        if (!user) throw new Error("Usuario no encontrado.");
        if ((user as any).referralCode) {
            return (user as any).referralCode as string;
        }

        // Try a few times in the unlikely case of a collision.
        for (let i = 0; i < 5; i++) {
            const candidate = generateReferralCode(
                ((user as any).name as string) ?? (user as any).email ?? "ref",
            );
            const existing = await ctx.db
                .query("users")
                .withIndex("by_referral_code", (q) =>
                    q.eq("referralCode", candidate),
                )
                .first();
            if (!existing) {
                await ctx.db.patch(args.userId as Id<"users">, {
                    referralCode: candidate,
                } as any);
                return candidate;
            }
        }
        throw new Error("No se pudo generar un código único de referido. Intenta de nuevo.");
    },
});

export const resolveReferralCode = query({
    args: { code: v.string() },
    handler: async (ctx, args): Promise<string | null> => {
        const user = await ctx.db
            .query("users")
            .withIndex("by_referral_code", (q) =>
                q.eq("referralCode", args.code.toUpperCase()),
            )
            .first();
        if (!user) return null;
        return String(user._id);
    },
});

// Internal version (no auth) for actions to look up codes server-side.
export const internalResolveReferralCode = internalMutation({
    args: { code: v.string() },
    handler: async (ctx, args): Promise<string | null> => {
        const user = await ctx.db
            .query("users")
            .withIndex("by_referral_code", (q) =>
                q.eq("referralCode", args.code.toUpperCase()),
            )
            .first();
        if (!user) return null;
        return String(user._id);
    },
});

export const redeemReferralCode = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        code: v.string(),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const userId = actor.idString;

        const user = await ctx.db.get(userId as any) as any;
        if (!user) throw new Error("Usuario no encontrado.");

        if (user.referredByUserId) {
            throw new Error("Ya has canjeado un código de referido antes.");
        }
        
        if (user.referralCode === args.code.toUpperCase()) {
            throw new Error("No puedes usar tu propio código.");
        }

        const referrer = await ctx.db
            .query("users")
            .withIndex("by_referral_code", (q) =>
                q.eq("referralCode", args.code.toUpperCase())
            )
            .first() as any;

        if (!referrer) {
            throw new Error("Código no encontrado.");
        }

        // Set referredByUserId
        await ctx.db.patch(user._id, {
            referredByUserId: referrer._id,
        } as any);

        // Give points to the new user (Welcome bonus)
        await ctx.runMutation(internal.economy.applyPointsEventInternal, {
            userId: user._id,
            eventKey: `ref_welcome_${Date.now()}_${user._id}`,
            type: "earn",
            source: "referral",
            amount: 10,
            description: `Bono de bienvenida (${args.code.toUpperCase()})`,
            metadata: { referralCode: args.code.toUpperCase(), referrerUserId: referrer._id },
        });

        // Give points to the referrer (Registration bonus)
        await ctx.runMutation(internal.economy.applyPointsEventInternal, {
            userId: referrer._id,
            eventKey: `ref_signup_${Date.now()}_${user._id}`,
            type: "earn",
            source: "referral",
            amount: 5,
            description: `Registro de referido (${user.name})`,
            metadata: { friendUserId: user._id, referralCode: args.code.toUpperCase() },
        });

        return true;
    },
});

export const notifyReferralPurchase = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        amountUSD: v.number(),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const userId = actor.idString;

        const user = await ctx.db.get(userId as any) as any;
        if (!user || !user.referredByUserId) return false;

        const referrer = await ctx.db.get(user.referredByUserId as any) as any;
        if (!referrer) return false;

        // Give points to the referrer
        const baseReward = 10;
        const highTicketReward = args.amountUSD > 100 ? 25 : 0;

        await ctx.runMutation(internal.economy.applyPointsEventInternal, {
            userId: referrer._id,
            eventKey: `ref_purchase_${Date.now()}_${user._id}`,
            type: "earn",
            source: "referral",
            amount: baseReward,
            description: `Compra de referido (${user.name})`,
            metadata: { friendUserId: user._id, amountUSD: args.amountUSD },
        });

        if (highTicketReward > 0) {
            await ctx.runMutation(internal.economy.applyPointsEventInternal, {
                userId: referrer._id,
                eventKey: `ref_bonus_${Date.now()}_${user._id}`,
                type: "earn",
                source: "referral",
                amount: highTicketReward,
                description: `Bono compra High Ticket (${user.name})`,
                metadata: { friendUserId: user._id, amountUSD: args.amountUSD },
            });
        }

        return true;
    },
});

export const internalGetUserById = internalQuery({
    args: { id: v.string() },
    handler: async (ctx, args) => {
        const idVal = ctx.db.normalizeId("users", args.id);
        if (!idVal) return null;
        return await ctx.db.get(idVal);
    }
});

export const internalGetSessionByToken = internalQuery({
    args: { token: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();
    }
});

export const internalGetUserByToken = internalQuery({
    args: { tokenIdentifier: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
            .first();
    }
});

export const internalGetUserByEmail = internalQuery({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();
    }
});

export const internalPatchUserToken = internalMutation({
    args: { userId: v.id("users"), tokenIdentifier: v.string() },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, { tokenIdentifier: args.tokenIdentifier });
    }
});

export const updateUserStripeCustomerId = internalMutation({
    args: {
        userId: v.string(),
        stripeCustomerId: v.string(),
    },
    handler: async (ctx, args) => {
        const idVal = ctx.db.normalizeId("users", args.userId);
        if (idVal) {
            await ctx.db.patch(idVal, { stripeCustomerId: args.stripeCustomerId } as any);
        }
    }
});



export const getUserActivityStats = query({
    args: {},
    handler: async (ctx) => {
        // ponytail: avoid heavy scans, returning minimal integration skeleton for now
        return { purchases: 0, bonuses: 0, events: 0, savings: 0 };
    }
});
