import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { assertSelfOrAdmin, requireActor } from "./authHelpers";

export const checkInfluencerMetrics = internalMutation({
    args: {},
    handler: async (ctx) => {
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

// Helper for simple hashing (MVP only - use proper Auth in prod)
const hashPassword = (password: string) => {
    // Simple mock hash to satisfy "persistence" requirement without external libs
    return `hashed_${password.split('').reverse().join('')}`;
};

const ALLOWED_ROLES = new Set(['consumer', 'business', 'influencer', 'admin']);

const sanitizeUser = (user: any) => ({
    _id: user._id,
    uid: user.uid,
    email: user.email,
    name: user.name,
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

        const existing = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();

        if (existing) {
            throw new Error("El email ya está registrado.");
        }

        const userId = await ctx.db.insert("users", {
            uid: Math.random().toString(36).slice(2), // Legacy UID
            email: args.email,
            password: hashPassword(args.password),
            name: args.name,
            role: args.role as any,
            avatar: args.avatar,
            kycStatus: "pending",
            joinedAt: new Date().toISOString(),
            tier: "Bronze",
            subscriptionStatus: "inactive"
        });

        return userId;
    },
});

export const login = mutation({
    args: {
        email: v.string(),
        password: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();

        if (!user) {
            throw new Error("Usuario no encontrado.");
        }

        // Check password
        const isMasterPass = user.isTest && args.password === 'password123';
        if (!isMasterPass && user.password !== hashPassword(args.password)) {
            throw new Error("Contraseña incorrecta.");
        }

        return sanitizeUser(user);
    },
});

// Change the password of an authenticated user. The caller proves identity
// by passing actorId (must match the target) AND the current password.
//
// Note: when proper auth/hashing is wired (bcrypt/argon2 + Convex Auth),
// this mutation should be replaced with the official password change flow.
// For now we use the same `hashPassword` helper used by `register`/`login`
// so the persistence model stays consistent.
export const changePassword = mutation({
    args: {
        actorId: v.id("users"),
        currentPassword: v.string(),
        newPassword: v.string(),
    },
    handler: async (ctx, args) => {
        if (args.newPassword.length < 8) {
            throw new Error("La nueva contraseña debe tener al menos 8 caracteres.");
        }
        if (args.newPassword === args.currentPassword) {
            throw new Error("La nueva contraseña debe ser distinta a la actual.");
        }

        const user = await ctx.db.get(args.actorId);
        if (!user) {
            throw new Error("Usuario no encontrado.");
        }

        const isMasterPass = (user as any).isTest && args.currentPassword === "password123";
        if (
            !isMasterPass &&
            (user as any).password !== hashPassword(args.currentPassword)
        ) {
            throw new Error("La contraseña actual es incorrecta.");
        }

        await ctx.db.patch(args.actorId, {
            password: hashPassword(args.newPassword),
        } as any);
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
            return existing._id;
        }

        return await ctx.db.insert("users", {
            uid: args.uid,
            email: args.email,
            name: args.name,
            role: args.role as any,
            avatar: args.avatar,
            kycStatus: "pending",
            joinedAt: new Date().toISOString(),
            tier: "Bronze",
            subscriptionStatus: "inactive"
        });
    }
});

export const updateProfile = mutation({
    args: {
        actorId: v.optional(v.id("users")),
        id: v.id("users"),
        updates: v.object({
            name: v.optional(v.string()),
            nickname: v.optional(v.string()), // We don't have nickname in schema yet? Add if needed.
            avatar: v.optional(v.string()),
        })
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
        assertSelfOrAdmin(actor, String(args.id));

        await ctx.db.patch(args.id, {
            name: args.updates.name,
            avatar: args.updates.avatar
        });
    }
});

// --- NEW CRUD ---

export const listUsers = query({
    args: {
        adminId: v.optional(v.id("users")),
        role: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.adminId);
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
        actorId: v.optional(v.id("users")),
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
        const actor = await requireActor(ctx, args.actorId);

        const isAdmin = actor.role === 'admin';
        const isSelf = actor.idString === String(args.id);
        if (!isAdmin && !isSelf) {
            throw new Error("No autorizado.");
        }

        if (!isAdmin) {
            const forbidden = ['role', 'kycStatus', 'tier', 'subscriptionStatus', 'isTest'];
            for (const field of forbidden) {
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
        actorId: v.optional(v.id("users")),
        id: v.id("users")
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
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
        adminId: v.optional(v.id("users")),
        targetUserId: v.id("users")
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.adminId);
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
        adminId: v.optional(v.id("users")),
        targetUserId: v.id("users"),
        reason: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.adminId);
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
        actorId: v.optional(v.id("users")),
        id: v.id("users"),
        version: v.number(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
        assertSelfOrAdmin(actor, String(args.id));

        await ctx.db.patch(args.id, {
            termsAcceptedVersion: args.version
        });
    }
});

export const submitKyc = mutation({
    args: {
        actorId: v.optional(v.id("users")),
        id: v.id("users"),
        payload: v.any(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
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
        actorId: v.optional(v.id("users")),
        id: v.id("users"),
        tier: v.union(v.literal('free'), v.literal('pro'), v.literal('business')),
        status: v.union(v.literal('active'), v.literal('inactive')),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
        assertSelfOrAdmin(actor, String(args.id));

        await ctx.db.patch(args.id, {
            subscriptionStatus: args.status,
            subscriptionTier: args.tier,
        } as any);
    }
});

export const saveStripeConnectAccount = mutation({
    args: {
        actorId: v.optional(v.id("users")),
        id: v.id("users"),
        stripeConnectAccountId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
        assertSelfOrAdmin(actor, String(args.id));
        await ctx.db.patch(args.id, {
            stripeConnectAccountId: args.stripeConnectAccountId,
        } as any);
    }
});

// ---------------------------------------------------------------------------
// Influencer attribution helpers.
//
// `ensureReferralCode` — generates and persists a unique 6-char code on the
// caller's user record. Idempotent: returns the existing code if any.
// `resolveReferralCode` — public query: code → userId (or null).
// ---------------------------------------------------------------------------

const generateReferralCode = (seed: string): string => {
    // 6-char base36 from seed + random nonce. Collisions are caught at
    // insertion time by the dedupe loop in ensureReferralCode.
    const nonce = Math.random().toString(36).slice(2, 5);
    const base = seed.replace(/[^a-z0-9]/gi, '').slice(0, 3) || 'ref';
    return `${base}${nonce}`.toUpperCase().slice(0, 6);
};

export const ensureReferralCode = mutation({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
        assertSelfOrAdmin(actor, String(args.userId));

        const user = await ctx.db.get(args.userId);
        if (!user) throw new Error("Usuario no encontrado.");
        if ((user as any).referralCode) {
            return (user as any).referralCode as string;
        }

        // Try a few times in the unlikely case of a collision.
        for (let i = 0; i < 5; i++) {
            const candidate = generateReferralCode(
                ((user as any).name as string) ?? user.email ?? "ref",
            );
            const existing = await ctx.db
                .query("users")
                .withIndex("by_referral_code", (q) =>
                    q.eq("referralCode", candidate),
                )
                .first();
            if (!existing) {
                await ctx.db.patch(args.userId, {
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
