import { mutation } from "./_generated/server";

export const createTests = mutation({
    args: {},
    handler: async (ctx) => {
        const roles = ['consumer', 'influencer', 'admin', 'business'];
        for (const role of roles) {
            const email = `${role}@test.com`;
            const existing = await ctx.db.query("users").withIndex("by_email", q => q.eq("email", email)).first();
            
            if (!existing) {
                await ctx.db.insert("users", {
                    uid: Math.random().toString(36).slice(2),
                    email,
                    password: "hashed_321drowssap", // 'password123' hashed
                    name: role.charAt(0).toUpperCase() + role.slice(1),
                    role: role as any,
                    kycStatus: "approved", // Verified status
                    joinedAt: new Date().toISOString(),
                    tier: "Bronze",
                    subscriptionStatus: "inactive",
                    isTest: true
                });
            }
        }
        return "✅ Usuarios de prueba (consumer, influencer, admin, business) creados y verificados.";
    }
});
