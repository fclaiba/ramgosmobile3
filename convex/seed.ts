import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const seedUsers = mutation({
    args: {},
    handler: async (ctx) => {
        const usersToCreate = [
            { email: "consumer@test.com", name: "consumer", role: "consumer" },
            { email: "business@test.com", name: "business", role: "business" },
            { email: "influencer@test.com", name: "influencer", role: "influencer" },
            { email: "admin@test.com", name: "admin", role: "admin" }
        ];

        // Cleanup old spanish named accounts to avoid confusion
        const oldEmails = ["consumidor@test.com", "negocio@test.com"];
        for (const email of oldEmails) {
            const old = await ctx.db.query("users").withIndex("by_email", q => q.eq("email", email)).first();
            if (old) {
                await ctx.db.delete(old._id);
            }
        }

        const hashPassword = (password: string) => {
            return `hashed_${password.split('').reverse().join('')}`;
        };

        for (const u of usersToCreate) {
            // Check if exists
            const existing = await ctx.db.query("users").withIndex("by_email", q => q.eq("email", u.email)).first();
            if (!existing) {
                await ctx.db.insert("users", {
                    uid: Math.random().toString(36).slice(2),
                    email: u.email,
                    name: u.name,
                    role: u.role as any,
                    password: hashPassword("password123"),
                    isTest: true,
                    kycStatus: "verified",
                    joinedAt: new Date().toISOString()
                });
            } else {
                // Update to ensure verified and correct password
                await ctx.db.patch(existing._id, {
                    kycStatus: "verified",
                    password: hashPassword("password123")
                });
            }
        }
        
        return "Users created and verified successfully";
    }
});
