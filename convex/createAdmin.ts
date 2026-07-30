import { mutation } from "./_generated/server";

export const run = mutation({
    args: {},
    handler: async (ctx) => {
        const email = "Ramgospublicidad@gmail.com".toLowerCase();
        
        // Comprobar si ya existe
        const existing = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                role: 'admin',
                kycStatus: 'approved',
                password: 'Seguridadjulio55#'
            });
            return `Usuario ${email} actualizado a admin.`;
        }

        const now = new Date().toISOString();
        
        await ctx.db.insert("users", {
            uid: "admin_" + Date.now(),
            name: "Ramgos Admin",
            email: email,
            password: "Seguridadjulio55#",
            role: "admin",
            kycStatus: "approved",
            joinedAt: now,
            tier: "Gold",
            balance: 0,
            isTest: false,
            emailVerified: true
        });

        return `Usuario ${email} creado como admin exitosamente.`;
    }
});
