import { v } from "convex/values";
import { mutation, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor, createSession, checkRateLimit } from "./authHelpers";
import { hashPassword, verifyPassword } from "./passwordHelpers";

/**
 * Presupuestos de envío de OTP.
 *
 * Antes verificación y recuperación de contraseña compartían la key
 * `otp_${email}`, así que pedir un código de verificación te consumía intentos
 * de recuperar la contraseña y viceversa — y cada login con 2FA gastaba uno
 * más. Con 3 intentos totales, un usuario legítimo quedaba bloqueado enseguida.
 *
 * La key va normalizada a minúsculas porque `saveOtp` normaliza el email pero
 * la del rate limit usaba el string crudo: `Juan@x.com` y `juan@x.com` tenían
 * contadores distintos, o sea que el límite se evadía cambiando mayúsculas.
 */
export const OTP_SEND_MAX_ATTEMPTS = 5;
export const OTP_SEND_WINDOW_MS = 10 * 60 * 1000;

/** Intentos de ADIVINAR el código, distinto de intentos de pedirlo. */
export const OTP_VERIFY_MAX_ATTEMPTS = 5;
export const OTP_VERIFY_WINDOW_MS = 10 * 60 * 1000;

export function otpRateLimitKey(
    purpose: 'verification' | 'recovery' | 'verify-attempt',
    email: string,
): string {
    return `otp_${purpose}_${email.trim().toLowerCase()}`;
}

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
    // El tipo de retorno va explícito porque el handler llama a otras funciones
    // del deployment a través de `internal`, que se genera a partir de este
    // mismo archivo: sin anotación, TypeScript entra en un ciclo de inferencia
    // (TS7022) y termina tipando toda la API generada como `any`.
    handler: async (ctx, args): Promise<{ success: boolean; delivered: boolean; message: string }> => {
        // El límite se chequea ANTES de generar y guardar el código. Al revés
        // —como estaba— el 4º intento ya había pisado en la base el OTP válido
        // cuando el límite saltaba: el usuario se quedaba sin ningún código
        // utilizable por 10 minutos, incluso teniendo el mail del 3º.
        await ctx.runMutation(internal.users.internalCheckRateLimit, {
            key: otpRateLimitKey('verification', args.email),
            maxAttempts: OTP_SEND_MAX_ATTEMPTS,
            windowMs: OTP_SEND_WINDOW_MS,
        });

        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Guardamos el OTP en la DB
        await ctx.runMutation(internal.auth.saveOtp, { email: args.email, code });

        const outcome = await ctx.runAction(internal.notifications.sendOTP, {
            email: args.email,
            code,
            type: 'verification',
        });

        // `sendOTP` cae a un mock de consola si falta `RESEND_API_KEY` o si
        // Resend rechaza el destinatario. Antes se descartaba ese resultado y
        // esto respondía "Código enviado correctamente" igual: el usuario
        // quedaba esperando un mail que nunca salió, indistinguible de un
        // problema de su casilla. Ahora el estado real viaja hasta la UI.
        const delivered = outcome?.delivered !== false;
        return {
            success: true,
            delivered,
            message: delivered
                ? "Código enviado correctamente."
                : "No se pudo enviar el email. Revisá la configuración de envío.",
        };
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

        // Tope de intentos de ADIVINAR el código. Sin esto se podían probar los
        // 10⁶ códigos de 6 dígitos sin ningún freno: el rate limit sólo cubría
        // el ENVÍO, no la verificación. Y acertar por fuerza bruta en la rama
        // sin `sessionToken` devuelve una sesión válida (ver abajo), o sea que
        // era una toma de cuenta a partir del email solo.
        await checkRateLimit(
            ctx,
            otpRateLimitKey('verify-attempt', user.email),
            OTP_VERIFY_MAX_ATTEMPTS,
            OTP_VERIFY_WINDOW_MS,
        );

        // La expiración se comprueba ANTES que el valor: un código vencido tiene
        // que decir "expiró" y no "inválido", que manda al usuario a revisar
        // dígitos que estaban bien.
        if (user.otpExpiresAt && user.otpExpiresAt < Date.now()) {
            throw new Error("El código ha expirado.");
        }

        if (!user.otp || user.otp !== args.code) {
            throw new Error("Código inválido.");
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
    handler: async (ctx, args): Promise<{ success: boolean }> => {
        // Presupuesto propio: recuperar la contraseña ya no consume los intentos
        // de verificar la cuenta.
        await ctx.runMutation(internal.users.internalCheckRateLimit, {
            key: otpRateLimitKey('recovery', args.email),
            maxAttempts: OTP_SEND_MAX_ATTEMPTS,
            windowMs: OTP_SEND_WINDOW_MS,
        });

        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Guardamos el OTP en la DB
        await ctx.runMutation(internal.auth.saveOtp, { email: args.email, code });

        // Reutilizamos el mismo envío de OTP (simplificación Ponytail)
        await ctx.runAction(internal.notifications.sendOTP, { email: args.email, code, type: 'recovery' });

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
