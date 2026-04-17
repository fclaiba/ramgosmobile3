import { v } from "convex/values";
import { mutation, action } from "./_generated/server";
import { requireActor } from "./authHelpers";
import { Resend } from "resend";

export const registerPushToken = mutation({
    args: {
        actorId: v.optional(v.id("users")),
        token: v.string()
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
        
        const fullUser = await ctx.db.get(actor.id);
        const existingTokens = fullUser?.pushTokens || [];
        if (!existingTokens.includes(args.token)) {
            await ctx.db.patch(actor.id as any, {
                pushTokens: [...existingTokens, args.token]
            });
        }
    }
});

export const removePushToken = mutation({
    args: {
        actorId: v.optional(v.id("users")),
        token: v.string()
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
        
        const fullUser = await ctx.db.get(actor.id);
        const existingTokens = fullUser?.pushTokens || [];
        if (existingTokens.includes(args.token)) {
            await ctx.db.patch(actor.id as any, {
                pushTokens: existingTokens.filter((t: string) => t !== args.token)
            });
        }
    }
});

export const sendOTP = action({
    args: {
        email: v.string(),
        code: v.string()
    },
    handler: async (ctx, args) => {
        // En Convex usando npx convex env set RESEND_API_KEY ...
        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
            console.error("Missing RESEND_API_KEY environment variable");
            // Optionally, we could throw, but falling back to logging for local dev
            console.log(`[Development Mock] Se enviaría OTP a ${args.email}: Código ${args.code}`);
            return { success: true, mocked: true };
        }

        const resend = new Resend(resendApiKey);

        try {
            const { data, error } = await resend.emails.send({
                from: "Ramgos <onboarding@resend.dev>", // Placeholder default
                to: args.email,
                subject: "Código de Verificación Ramgos",
                html: `
                    <div style="font-family: sans-serif; background-color: #FAFAFA; padding: 20px;">
                        <h2 style="color: #7C3AED;">Bienvenido a Ramgos</h2>
                        <p>Tu código de verificación para continuar tu registro es:</p>
                        <h1 style="color: #111827; letter-spacing: 5px; font-weight: bold;">${args.code}</h1>
                        <p>Este código expira en 10 minutos. No lo compartas con nadie.</p>
                    </div>
                `,
            });
            if (error) {
                console.error("Resend delivery error:", error);
                throw new Error(error.message);
            }
            console.log("Resend successfully dispatched OTP", data);
            return { success: true, id: data?.id };
        } catch (error: any) {
            console.error("Resend error:", error);
            throw new Error(`Error enviando email: ${error.message}`);
        }
    }
});

export const sendPushNotification = action({
    args: {
        tokens: v.array(v.string()),
        title: v.string(),
        body: v.string(),
        data: v.optional(v.any())
    },
    handler: async (ctx, args) => {
        if (args.tokens.length === 0) return { success: false, reason: "No tokens provided" };

        const message = {
            to: args.tokens,
            sound: 'default',
            title: args.title,
            body: args.body,
            data: args.data || {},
        };

        try {
            const response = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
            });
            const receipt = await response.json();
            return { success: true, receipt };
        } catch (error: any) {
            console.error("Expo Push Notification error:", error);
            throw new Error(`Error enviando notificaciones: ${error.message}`);
        }
    }
});
