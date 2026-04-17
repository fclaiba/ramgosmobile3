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
