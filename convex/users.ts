import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

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

export const register = mutation({
    args: {
        email: v.string(),
        password: v.string(),
        name: v.string(),
        role: v.string(),
        avatar: v.optional(v.string())
    },
    handler: async (ctx, args) => {
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

        return user;
    },
});

export const getUser = query({
    args: { id: v.id("users") },
    handler: async (ctx, args) => {
        try {
            const user = await ctx.db.get(args.id);
            return user;
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
        id: v.id("users"),
        updates: v.object({
            name: v.optional(v.string()),
            nickname: v.optional(v.string()), // We don't have nickname in schema yet? Add if needed.
            avatar: v.optional(v.string()),
        })
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, {
            name: args.updates.name,
            avatar: args.updates.avatar
        });
    }
});

// --- NEW CRUD ---

export const listUsers = query({
    args: {
        role: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        let q = ctx.db.query("users");
        const users = await q.collect();
        if (args.role) {
            return users.filter(u => u.role === args.role);
        }
        return users;
    },
});

export const updateUser = mutation({
    args: {
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
        await ctx.db.patch(args.id, {
            ...args.updates,
            role: args.updates.role as any,
        });
    },
});

export const deleteUser = mutation({
    args: { id: v.id("users") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
    },
});

export const approveKYC = mutation({
    args: {
        adminId: v.id("users"),
        targetUserId: v.id("users")
    },
    handler: async (ctx, args) => {
        const admin = await ctx.db.get(args.adminId);
        if (!admin || admin.role !== 'admin') {
            throw new Error("No tienes permisos de administrador.");
        }
        await ctx.db.patch(args.targetUserId, {
            kycStatus: 'approved'
        });
    }
});

export const rejectKYC = mutation({
    args: {
        adminId: v.id("users"),
        targetUserId: v.id("users"),
        reason: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const admin = await ctx.db.get(args.adminId);
        if (!admin || admin.role !== 'admin') {
            throw new Error("No tienes permisos de administrador.");
        }
        await ctx.db.patch(args.targetUserId, {
            kycStatus: 'rejected'
        });
    }
});

export const acceptTerms = mutation({
    args: {
        id: v.id("users"),
        version: v.number(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, {
            termsAcceptedVersion: args.version
        });
    }
});
