import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { assertSelfOrAdmin, requireActor, checkRateLimit, createSession } from "./authHelpers";
import { internal } from "./_generated/api";
import { hashPassword, isLegacyPasswordHash, verifyPassword } from "./passwordHelpers";

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
});

export const register = mutation({
    args: {
        email: v.string(),
        password: v.string(),
        name: v.string(),
        role: v.string(),
        avatar: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        if (!ALLOWED_ROLES.has(args.role)) {
            throw new Error("Rol inválido.");
        }

        // Password complexity validation
        const pass = args.password;
        if (pass.length < 8 || !/[A-Z]/.test(pass) || !/[0-9]/.test(pass)) {
            throw new Error("La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.");
        }

        const existing = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();

        if (existing) {
            // Anti-enumeration: Generic error message
            throw new Error("No se pudo registrar la cuenta. Si ya tienes una cuenta, intenta iniciar sesión.");
        }

        const userId = await ctx.db.insert("users", {
            uid: Math.random().toString(36).slice(2), // Legacy UID
            email: args.email,
            password: await hashPassword(args.password),
            name: args.name,
            role: args.role as any,
            avatar: args.avatar,
            kycStatus: "pending",
            joinedAt: new Date().toISOString(),
            tier: "Bronze",
            subscriptionStatus: "inactive",
            isTest: args.email.endsWith("@ramgos.com")
        });

        const sessionToken = await createSession(ctx, userId);
        return { userId, sessionToken };
    },
});

export const login = mutation({
    args: {
        email: v.string(),
        password: v.string(),
    },
    handler: async (ctx, args) => {
        // Rate Limiting: max 5 attempts per 15 minutes (900000 ms)
        await checkRateLimit(ctx, `login_${args.email}`, 5, 900000);

        const user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();

        if (!user) {
            // Anti-enumeration: Generic error message
            throw new Error("Credenciales incorrectas.");
        }

        const passwordHash = user.password;
        if (!passwordHash || !(await verifyPassword(args.password, passwordHash))) {
            throw new Error("Credenciales incorrectas.");
        }

        if (isLegacyPasswordHash(passwordHash)) {
            await ctx.db.patch(user._id, {
                password: await hashPassword(args.password),
            });
        }

        const sessionToken = await createSession(ctx, user._id);
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

        if (!user.password || !(await verifyPassword(args.currentPassword, user.password))) {
            throw new Error("La contraseña actual es incorrecta.");
        }

        await ctx.db.patch(actor.id, {
            password: await hashPassword(args.newPassword),
        });
        return { success: true };
    },
});

export const getUser = query({
    args: { id: v.id("users") },
    handler: async (ctx, args) => {
        try {
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
        const existing = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
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
            return { userId: existing._id, sessionToken };
        }

        const isTestAccount = args.email.endsWith('@ramgos.com') || (args as any).isTest;

        const newUserId = await ctx.db.insert("users", {
            uid: args.uid,
            email: args.email,
            name: args.name,
            role: args.role as any,
            avatar: args.avatar,
            kycStatus: "pending",
            joinedAt: new Date().toISOString(),
            tier: "Bronze",
            subscriptionStatus: "inactive",
            isTest: isTestAccount,
        });
        const sessionToken = await createSession(ctx, newUserId);
        return { userId: newUserId, sessionToken };
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
        })
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, String(args.id));

        await ctx.db.patch(args.id, {
            name: args.updates.name,
            nickname: args.updates.nickname,
            avatar: args.updates.avatar,
            phoneNumber: args.updates.phoneNumber
        } as any);
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
        if (actor.role !== 'admin') {
            throw new Error("No autorizado.");
        }
        let q = ctx.db.query("users");
        const users = await q.collect();
        const sanitized = users.map(sanitizeUser);
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

export const approveKYC = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        targetUserId: v.id("users"),
        actorId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        if (actor.role !== 'admin') {
            throw new Error("No tienes permisos de administrador.");
        }
        await ctx.db.patch(args.targetUserId, {
            kycStatus: 'approved'
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
        if (actor.role !== 'admin') {
            throw new Error("No tienes permisos de administrador.");
        }
        await ctx.db.patch(args.targetUserId, {
            kycStatus: 'rejected'
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
        const docs: Array<{ type: string; url: string; status: 'pending' | 'approved' | 'rejected'; uploadedAt: string; reviewedAt?: string }> = [];
        const documentFront = typeof payload.documentFront === 'string' ? payload.documentFront : undefined;
        const documentBack = typeof payload.documentBack === 'string' ? payload.documentBack : undefined;

        if (documentFront) {
            docs.push({
                type: 'id_front',
                url: documentFront,
                status: 'pending',
                uploadedAt: new Date().toISOString(),
            });
        }
        if (documentBack) {
            docs.push({
                type: 'id_back',
                url: documentBack,
                status: 'pending',
                uploadedAt: new Date().toISOString(),
            });
        }

        await ctx.db.patch(args.id, {
            kycStatus: 'pending',
            verificationDocuments: docs.length > 0 ? docs : undefined,
        });
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
            .filter((q) => q.eq(q.field("referredByUserId"), actor.idString))
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
