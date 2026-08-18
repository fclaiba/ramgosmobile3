import { internalMutation } from "./_generated/server";
import { hashPassword } from "./passwordHelpers";
import { newUserIdentityFields } from "./users/identity";

export const run = internalMutation({
    args: {},
    handler: async (ctx) => {
        const email = "Ramgospublicidad@gmail.com".toLowerCase();
        const hashedPassword = hashPassword("Seguridadjulio55#");
        
        // Comprobar si ya existe
        const existing = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                role: 'admin',
                kycStatus: 'approved',
                password: hashedPassword
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
            ...newUserIdentityFields({ username: "ramgosadmin", name: "Ramgos Admin" }),
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
