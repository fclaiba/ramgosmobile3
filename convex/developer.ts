import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
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
    args: {},
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
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
    args: {},
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
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
        targetUserId: v.id("users"), // The test user to enter
    },
    handler: async (ctx, args) => {
        // 1. Security Check
        const actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
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

export const resetAndSeedListings = internalMutation({
    args: {},
    handler: async (ctx) => {
        // 1. Delete all current listings
        const allListings = await ctx.db.query("listings").collect();
        for (const listing of allListings) {
            await ctx.db.delete(listing._id);
        }

        // 2. Find a test seller (e.g., Business)
        const seller = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", "business@test.com"))
            .first();

        if (!seller) {
            throw new Error("El usuario business@test.com no existe. Ejecuta seedTestUsers primero.");
        }

        const sellerId = seller._id;

        // 3. Create products in Buenos Aires and New York
        const baLocation = { lat: -34.6037, lng: -58.3816, name: "Buenos Aires", distanceKm: 0, address: "Obelisco, BA" };
        const nyLocation = { lat: 40.7128, lng: -74.0060, name: "Nueva York", distanceKm: 0, address: "Times Square, NY" };

        const testProducts: any[] = [
            {
                title: "Alfajores Artesanales (BA)",
                description: "Caja de docena de alfajores de maicena artesanales en el centro de Buenos Aires.",
                price: 15,
                type: "product" as any,
                category: "Gastronomía",
                sellerId,
                stock: 50,
                location: baLocation,
                condition: "new",
                currency: "USD",
                status: "active" as any,
                views: 0,
                favoriteCount: 0,
                orderCount: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                tags: ["product"],
                slug: "alfajores-artesanales-ba-" + Math.random().toString(36).slice(2,7)
            },
            {
                title: "Clases de Tango (BA)",
                description: "Servicio de clases particulares de tango en San Telmo.",
                price: 25,
                type: "service" as any,
                category: "Educación",
                sellerId,
                stock: 10,
                location: baLocation,
                condition: "new",
                currency: "USD",
                status: "active" as any,
                views: 0,
                favoriteCount: 0,
                orderCount: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                tags: ["service"],
                slug: "clases-tango-ba-" + Math.random().toString(36).slice(2,7)
            },
            {
                title: "Vintage Camera (NY)",
                description: "Mint condition vintage camera in New York.",
                price: 150,
                type: "product" as any,
                category: "Tecnología",
                sellerId,
                stock: 1,
                location: nyLocation,
                condition: "used",
                currency: "USD",
                status: "active" as any,
                views: 0,
                favoriteCount: 0,
                orderCount: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                tags: ["product"],
                slug: "vintage-camera-ny-" + Math.random().toString(36).slice(2,7)
            },
            {
                title: "Central Park Tour (NY)",
                description: "Guided walking tour through Central Park.",
                price: 45,
                type: "event" as any,
                category: "Entretenimiento",
                sellerId,
                stock: 20,
                location: nyLocation,
                condition: "new",
                currency: "USD",
                status: "active" as any,
                views: 0,
                favoriteCount: 0,
                orderCount: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                tags: ["event"],
                slug: "central-park-tour-ny-" + Math.random().toString(36).slice(2,7)
            }
        ];

        for (const p of testProducts) {
            await ctx.db.insert("listings", p);
        }

        return { success: true, message: `Deleted ${allListings.length} listings and seeded ${testProducts.length} new ones.` };
    }
});

export const seed5Bonos = mutation({
    args: {},
    handler: async (ctx) => {
        const business = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", "business@test.com"))
            .first();

        const consumer = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", "consumer@test.com"))
            .first();

        if (!business || !consumer) {
            throw new Error("Missing test users. Run seedTestUsers first.");
        }

        let bonoListing = await ctx.db
            .query("listings")
            .withIndex("by_seller", (q) => q.eq("sellerId", business._id))
            .filter((q) => q.eq(q.field("type"), "bono"))
            .first();

        if (!bonoListing) {
            const listingId = await ctx.db.insert("listings", {
                sellerId: business._id,
                title: "Bono Premium 50% Off",
                description: "Bono premium para pruebas",
                price: 50,
                currency: "USD",
                category: "bonos",
                tags: ["premium", "test"],
                slug: "bono-premium-50-off",
                stock: 100,
                status: "active",
                type: "bono",
                condition: "new",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            });
            bonoListing = await ctx.db.get(listingId);
        }

        for (let i = 0; i < 5; i++) {
            const ts = Date.now().toString(36);
            const rand = Math.random().toString(36).slice(2, 6);
            const code = `BNO5-${ts}-${rand}`.toUpperCase();

            await ctx.db.insert("bonoRedemptions", {
                bonoCode: code,
                listingId: String(bonoListing!._id),
                ownerUserId: consumer._id,
                sellerId: business._id,
                validUntil: (bonoListing as any).validUntil,
                status: "issued",
                createdAt: new Date().toISOString(),
            });
        }

        return "5 bonos creados y asignados al consumidor.";
    }
});
