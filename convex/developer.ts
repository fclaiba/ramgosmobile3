import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { assertAdminOrDeveloper, requireActor } from "./authHelpers";

// Helper to check dev permissions
const checkDevAccess = async (ctx: any, userId: Id<"users">) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Acceso denegado");
    if (user.role !== 'admin' && user.role !== 'developer' && !user.isTest) {
        throw new Error("Se requiere rol de desarrollador o admin.");
    }
};

const sanitizeDevUser = (user: any) => ({
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
    isTest: user.isTest,
});

export const seedTestUsers = mutation({
    args: {
        actorId: v.optional(v.id("users"))
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
        if (actor.role !== "admin" && actor.role !== "developer" && !actor.isTest) {
            throw new Error("Se requiere rol de desarrollador o admin.");
        }

        // Defined Test Users
        const testUsers = [
            {
                email: "consumer@test.com", name: "Test Consumer", role: "consumer",
                tier: "Silver", kycStatus: "approved", avatar: "https://i.pravatar.cc/150?u=consumer"
            },
            {
                email: "business@test.com", name: "Test Business", role: "business",
                tier: "Gold", kycStatus: "approved", avatar: "https://i.pravatar.cc/150?u=business"
            },
            {
                email: "influencer@test.com", name: "Test Influencer", role: "influencer",
                tier: "Platinum", kycStatus: "questionnaire_submitted", avatar: "https://i.pravatar.cc/150?u=influencer"
            },
            {
                email: "admin@test.com", name: "Test Admin", role: "admin",
                tier: "Platinum", kycStatus: "approved", avatar: "https://i.pravatar.cc/150?u=admin"
            },
        ];

        const results = [];

        for (const u of testUsers) {
            // Check if exists
            const existing = await ctx.db
                .query("users")
                .withIndex("by_email", (q) => q.eq("email", u.email))
                .first();

            if (existing) {
                // Ensure flags
                await ctx.db.patch(existing._id, {
                    isTest: true,
                    password: 'hashed_321drowssap', // Force reset password to ensure access
                    kycStatus: u.kycStatus // Also ensure KYC status matches expectations
                });
                results.push({ ...sanitizeDevUser(existing), status: 'updated' });
            } else {
                // Create
                const newId = await ctx.db.insert("users", {
                    uid: `test_${Math.random().toString(36).slice(2)}`,
                    email: u.email,
                    name: u.name,
                    role: u.role as any,
                    tier: u.tier,
                    kycStatus: u.kycStatus,
                    avatar: u.avatar,
                    isTest: true,
                    joinedAt: new Date().toISOString(),
                    subscriptionStatus: 'active',
                    password: 'hashed_321drowssap' // Hash of 'password123'
                });
                results.push({ _id: newId, status: 'created' });
            }
        }

        return results;
    },
});

export const getTestUsers = query({
    args: {
        actorId: v.optional(v.id("users"))
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
        if (actor.role !== "admin" && actor.role !== "developer" && !actor.isTest) {
            throw new Error("Se requiere rol de desarrollador o admin.");
        }
        return await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("isTest"), true))
            .collect()
            .then((users: any[]) => users.map(sanitizeDevUser));
    },
});

export const impersonate = mutation({
    args: {
        adminId: v.optional(v.id("users")), // legacy fallback
        targetUserId: v.id("users"), // The test user to enter
    },
    handler: async (ctx, args) => {
        // 1. Security Check
        const actor = await requireActor(ctx, args.adminId);
        assertAdminOrDeveloper(actor);

        // 2. Target Check
        const targetUser = await ctx.db.get(args.targetUserId);
        if (!targetUser) throw new Error("Usuario objetivo no encontrado");
        if (!targetUser.isTest) throw new Error("Solo se pueden impersonar usuarios de prueba.");

        // 3. Log Audit
        await ctx.db.insert("audit_logs", {
            actorUserId: actor.idString,
            targetUserId: args.targetUserId,
            action: "IMPERSONATE_START",
            timestamp: new Date().toISOString(),
            metadata: { targetEmail: targetUser.email, targetRole: targetUser.role }
        });

        // 4. Return Session Data
        // In a real OAuth system we'd issue a token.
        // Here we return the full user object so the frontend can swap context.
        return sanitizeDevUser(targetUser);
    },
});
