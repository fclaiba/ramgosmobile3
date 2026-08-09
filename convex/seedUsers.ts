import { mutation } from "./_generated/server";

// ponytail: bcryptjs doesn't run in Convex runtime, use legacy hash for dev seeds
const DEMO_PASSWORD = "RamgosDemo1!";
const legacyHash = (pw: string) => `hashed_${pw.split("").reverse().join("")}`;

export const createTests = mutation({
    args: {},
    handler: async (ctx) => {
        const roles = ['consumer', 'influencer', 'admin', 'business'] as const;
        for (const role of roles) {
            const email = `${role}@test.com`;
            const username = `${role}_test`;
            const existing = await ctx.db.query("users").withIndex("by_email", q => q.eq("email", email)).first();
            
            if (existing) {
                // Always reset: repairs bcrypt-era hashes that can't be verified anymore
                // and keeps @handles searchable for whitelist / campaign invite.
                await ctx.db.patch(existing._id, {
                    password: legacyHash(DEMO_PASSWORD),
                    username,
                    referralCode: username.toUpperCase(),
                    kycStatus: "approved",
                    ...(role === "influencer"
                        ? { influencerStatus: "approved" as const }
                        : {}),
                });
            } else {
                await ctx.db.insert("users", {
                    uid: Math.random().toString(36).slice(2),
                    email,
                    password: legacyHash(DEMO_PASSWORD),
                    name: role.charAt(0).toUpperCase() + role.slice(1),
                    role: role as any,
                    username,
                    referralCode: username.toUpperCase(),
                    kycStatus: "approved",
                    ...(role === "influencer"
                        ? { influencerStatus: "approved" as const }
                        : {}),
                    joinedAt: new Date().toISOString(),
                    tier: "Bronze",
                    subscriptionStatus: "inactive",
                    isTest: true
                });
            }
        }
        return "✅ Usuarios de prueba creados/patcheados con password legacy.";
    }
});
