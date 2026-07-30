import { v } from "convex/values";
import { mutation, action, internalMutation } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { requireActor, createSession } from "./authHelpers";
import { hashPassword, verifyPassword } from "./passwordHelpers";

// Internal mutation to save OTP in the users table
export const saveOtp = internalMutation({
    args: { email: v.string(), code: v.string() },
    handler: async (ctx, args) => {
        const email = args.email.trim().toLowerCase();
        const user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();
            
        if (!user) return; // Prevent enumeration
        
        await ctx.db.patch(user._id, {
            otp: args.code,
            otpExpiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes from now
        });
    }
});

// Enviar email de verificación
export const sendVerificationEmail = action({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Guardamos el OTP en la DB
        await ctx.runMutation(internal.auth.saveOtp, { email: args.email, code });
        
        // Enviamos el correo usando notifications.sendOTP
        await ctx.runAction(api.notifications.sendOTP, { email: args.email, code, type: 'verification' });
        
        return { success: true, message: "Código enviado correctamente." };
    }
});

// Verificar el código de email
export const verifyEmailCode = mutation({
    args: { 
        sessionToken: v.optional(v.string()), 
        code: v.string(),
        email: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        let user;
        
        if (args.sessionToken) {
            const actor = await requireActor(ctx, args.sessionToken);
            user = await ctx.db.get(actor.id);
        } else if (args.email) {
            user = await ctx.db
                .query("users")
                .withIndex("by_email", (q) => q.eq("email", args.email!.trim().toLowerCase()))
                .first();
        }

        if (!user) {
            throw new Error("Usuario no encontrado.");
        }

        if (user.otp !== args.code) {
            throw new Error("Código inválido.");
        }
        
        if (user.otpExpiresAt && user.otpExpiresAt < Date.now()) {
            throw new Error("El código ha expirado.");
        }

        // Marcar email como verificado y borrar OTP
        await ctx.db.patch(user._id, {
            emailVerified: true,
            otp: undefined,
            otpExpiresAt: undefined
        });
        
        if (!args.sessionToken) {
            const sessionToken = await createSession(ctx, user._id);
            return { success: true, sessionToken };
        }
        
        return { success: true };
    }
});

// Solicitar recuperación de contraseña
export const sendPasswordResetEmail = action({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Guardamos el OTP en la DB
        await ctx.runMutation(internal.auth.saveOtp, { email: args.email, code });
        
        // Reutilizamos el mismo envío de OTP (simplificación Ponytail)
        await ctx.runAction(api.notifications.sendOTP, { email: args.email, code, type: 'recovery' });
        
        return { success: true };
    }
});

// Resetear la contraseña con código
export const resetPasswordWithCode = mutation({
    args: { 
        email: v.string(), 
        code: v.string(), 
        newPassword: v.string(),
    },
    handler: async (ctx, args) => {
        const email = args.email.trim().toLowerCase();
        
        const user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();
            
        if (!user) {
            throw new Error("Usuario no encontrado.");
        }

        if (user.otp !== args.code) {
            throw new Error("Código inválido.");
        }

        if (user.otpExpiresAt && user.otpExpiresAt < Date.now()) {
            throw new Error("El código ha expirado.");
        }
        
        const pass = args.newPassword;
        if (pass.length < 8 || !/[A-Z]/.test(pass) || !/[0-9]/.test(pass)) {
            throw new Error("La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.");
        }

        // Password History check
        const history = user.passwordHistory || [];
        for (const oldHash of history) {
            if (verifyPassword(pass, oldHash)) {
                throw new Error("No puedes usar contraseñas anteriores por razones de seguridad.");
            }
        }

        const newHash = hashPassword(pass);
        const newHistory = [newHash, ...history].slice(0, 5); // Keep last 5

        await ctx.db.patch(user._id, {
            password: newHash,
            passwordHistory: newHistory,
            otp: undefined,
            otpExpiresAt: undefined
        });

        // En una app real se podrían revocar las sesiones aquí

        return { success: true };
    }
});

// Mutación para saltar KYC
export const skipKyc = mutation({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        await ctx.db.patch(actor.id, {
            kycStatus: 'skipped'
        });
        return { success: true };
    }
});
