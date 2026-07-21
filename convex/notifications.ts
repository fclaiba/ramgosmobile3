import { v } from "convex/values";
import { mutation, query, action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertAdminOrDeveloper, requireActor } from "./authHelpers";
import { Resend } from "resend";

/** Inbox del usuario: últimas entregas de push (auditoría + UI de Notificaciones). */
export const listMyNotifications = query({
    args: {
        sessionToken: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
        const rows = await ctx.db
            .query("pushDeliveries")
            .withIndex("by_user", (q) => q.eq("userId", actor.idString))
            .order("desc")
            .take(limit);

        return rows.map((row) => ({
            id: row._id,
            title: row.title,
            body: row.body,
            type: row.category || "system",
            date: row.sentAt,
            status: row.status,
            data: row.data,
        }));
    },
});

// ---------------------------------------------------------------------------
// PUBLIC mutations — manage push tokens per user.
// ---------------------------------------------------------------------------
export const registerPushToken = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        token: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);

        const fullUser = await ctx.db.get(actor.id);
        const existingTokens = fullUser?.pushTokens || [];
        if (!existingTokens.includes(args.token)) {
            await ctx.db.patch(actor.id as any, {
                pushTokens: [...existingTokens, args.token],
            });
        }
    },
});

export const removePushToken = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        token: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);

        const fullUser = await ctx.db.get(actor.id);
        const existingTokens = fullUser?.pushTokens || [];
        if (existingTokens.includes(args.token)) {
            await ctx.db.patch(actor.id as any, {
                pushTokens: existingTokens.filter((t: string) => t !== args.token),
            });
        }
    },
});

// ---------------------------------------------------------------------------
// OTP / Resend email — unchanged from previous version.
// ---------------------------------------------------------------------------
export const sendOTP = action({
    args: {
        email: v.string(),
        code: v.string(),
        type: v.optional(v.union(v.literal('verification'), v.literal('recovery'))),
    },
    handler: async (ctx, args) => {
        // Rate Limiting: max 3 OTP requests per 10 minutes (600000 ms)
        await ctx.runMutation(internal.users.internalCheckRateLimit, {
            key: `otp_${args.email}`,
            maxAttempts: 3,
            windowMs: 600000
        });

        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
            console.error("Missing RESEND_API_KEY environment variable");
            console.log(`[Development Mock] Se enviaría OTP a ${args.email}: Código ${args.code}`);
            return { success: true, mocked: true };
        }

        const resend = new Resend(resendApiKey);
        const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Ramgos <onboarding@resend.dev>";

        const isRecovery = args.type === 'recovery';
        const subject = isRecovery ? "Recuperación de Contraseña - Ramgos" : "Código de Verificación Ramgos";
        const title = isRecovery ? "Recuperar Contraseña" : "Bienvenido a Ramgos";
        const message = isRecovery 
            ? "Has solicitado restablecer tu contraseña. Tu código de seguridad es:" 
            : "Tu código de verificación para continuar tu registro es:";

        try {
            const { data, error } = await resend.emails.send({
                from: fromEmail,
                to: args.email,
                subject: subject,
                html: `
                    <div style="font-family: sans-serif; background-color: #FAFAFA; padding: 20px;">
                        <h2 style="color: #7C3AED;">${title}</h2>
                        <p>${message}</p>
                        <h1 style="color: #111827; letter-spacing: 5px; font-weight: bold;">${args.code}</h1>
                        <p>Este código expira en 10 minutos. No lo compartas con nadie.</p>
                    </div>
                `,
            });
            if (error) {
                console.error("Resend delivery error:", error);
                if (error.name === 'validation_error') {
                    console.log(`[Development Mock/Fallback] Se enviaría OTP a ${args.email}: Código ${args.code}`);
                    return { success: true, mocked: true, fallback: true };
                }
                throw new Error(error.message);
            }
            console.log("Resend successfully dispatched OTP", data);
            return { success: true, id: data?.id };
        } catch (error: any) {
            console.error("Resend error:", error);
            throw new Error(`Error enviando email: ${error.message}`);
        }
    },
});

export const sendTestEmail = action({
    args: { to: v.string() },
    handler: async (ctx, args) => {
        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
            throw new Error("Falta la variable de entorno RESEND_API_KEY. Por favor, reemplaza 're_xxxxxxxxx' con tu API key real en el dashboard de Convex.");
        }
        const resend = new Resend(resendApiKey);
        
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: args.to,
            subject: 'Hello World',
            html: '<p>Congrats on sending your <strong>first email</strong>!</p>'
        });
        
        if (error) throw new Error(error.message);
        return data;
    }
});

// ---------------------------------------------------------------------------
// INTERNAL helpers — used by every backend module that needs to fan-out a
// push notification to a single user (orders, disputes, stripe, finance,
// campaigns, social).
//
// Pattern from the call-site:
//   ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
//     userId, title, body, category, data,
//   });
//
// notifyUser persists a row in `pushDeliveries` regardless of whether the
// user has any push tokens — this gives us full auditability of intended
// notifications even when delivery is skipped.
// ---------------------------------------------------------------------------

export const internalGetUserNotificationData = internalQuery({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        try {
            const user = await ctx.db.get(args.userId as any);
            return {
                tokens: ((user as any)?.pushTokens as string[] | undefined) ?? [],
                email: (user as any)?.email,
                name: (user as any)?.name,
            };
        } catch (e) {
            return { tokens: [] };
        }
    },
});

// Returns the userIds of every admin/developer in the system. Used by
// notifyAdmins to fan-out alerts about disputes, escalations, fraud,
// reconciliation flags, etc.
export const internalListAdminUserIds = internalQuery({
    args: {},
    handler: async (ctx): Promise<string[]> => {
        const admins = await ctx.db
            .query('users')
            .filter((q: any) =>
                q.or(
                    q.eq(q.field('role'), 'admin'),
                    q.eq(q.field('role'), 'developer'),
                ),
            )
            .collect();
        return admins.map((u: any) => String(u._id));
    },
});

export const internalRecordPushDelivery = internalMutation({
    args: {
        userId: v.string(),
        title: v.string(),
        body: v.string(),
        category: v.optional(v.string()),
        status: v.union(
            v.literal('queued'),
            v.literal('sent'),
            v.literal('failed'),
            v.literal('skipped'),
        ),
        expoReceiptId: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        data: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert('pushDeliveries', {
            userId: args.userId,
            title: args.title,
            body: args.body,
            category: args.category,
            sentAt: new Date().toISOString(),
            status: args.status,
            expoReceiptId: args.expoReceiptId,
            errorMessage: args.errorMessage,
            data: args.data,
        });
    },
});

export const internalNotifyAdmins = internalAction({
    args: {
        title: v.string(),
        body: v.string(),
        category: v.optional(v.string()),
        data: v.optional(v.any()),
    },
    handler: async (ctx, args): Promise<{ success: boolean; admins: number }> => {
        const adminIds: string[] = await ctx.runQuery(internal.notifications.internalListAdminUserIds, {});
        for (const adminId of adminIds) {
            await ctx.runAction(internal.notifications.notifyUser, {
                userId: adminId,
                title: args.title,
                body: args.body,
                category: (args.category as any) ?? 'system',
                data: args.data,
            });
        }
        return { success: true, admins: adminIds.length };
    },
});

export const notifyUser = internalAction({
    args: {
        userId: v.string(),
        title: v.string(),
        body: v.string(),
        data: v.optional(v.any()),
        sendEmail: v.optional(v.boolean()),
        category: v.optional(v.union(
            v.literal('order'),
            v.literal('payment'),
            v.literal('dispute'),
            v.literal('social'),
            v.literal('campaign'),
            v.literal('system'),
        )),
    },
    handler: async (ctx, args): Promise<{ success: boolean; sentTo: number; emailSent?: boolean }> => {
        const userData = await ctx.runQuery(internal.notifications.internalGetUserNotificationData, {
            userId: args.userId,
        });

        const tokens = userData.tokens;
        let pushSentTo = 0;
        let emailSent = false;

        // 1. Send Push Notification
        if (tokens.length === 0) {
            await ctx.runMutation(internal.notifications.internalRecordPushDelivery, {
                userId: args.userId,
                title: args.title,
                body: args.body,
                category: args.category,
                status: 'skipped',
                errorMessage: 'No push tokens registered',
                data: args.data,
            });
            console.log(`[push.notify] skipped (no tokens) user=${args.userId} title="${args.title}"`);
        } else {
            const message = {
                to: tokens,
                sound: 'default',
                title: args.title,
                body: args.body,
                data: args.data || {},
                channelId: 'default',
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
                const receipt: any = await response.json();
                const expoReceiptId = receipt?.data?.[0]?.id ?? receipt?.data?.id;

                await ctx.runMutation(internal.notifications.internalRecordPushDelivery, {
                    userId: args.userId,
                    title: args.title,
                    body: args.body,
                    category: args.category,
                    status: 'sent',
                    expoReceiptId,
                    data: args.data,
                });
                pushSentTo = tokens.length;
                console.log(`[push.notify] sent user=${args.userId} tokens=${tokens.length} title="${args.title}"`);
            } catch (error: any) {
                console.error('[push.notify] error', error);
                await ctx.runMutation(internal.notifications.internalRecordPushDelivery, {
                    userId: args.userId,
                    title: args.title,
                    body: args.body,
                    category: args.category,
                    status: 'failed',
                    errorMessage: error.message,
                    data: args.data,
                });
            }
        }

        // 2. Send Email if requested
        if (args.sendEmail && userData.email) {
            const resendApiKey = process.env.RESEND_API_KEY;
            if (resendApiKey) {
                const resend = new Resend(resendApiKey);
                const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Ramgos <onboarding@resend.dev>";
                try {
                    await resend.emails.send({
                        from: fromEmail,
                        to: userData.email,
                        subject: args.title,
                        html: `
                            <div style="font-family: sans-serif; background-color: #FAFAFA; padding: 20px;">
                                <div style="background: white; padding: 30px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); max-width: 600px; margin: 0 auto;">
                                    <h2 style="color: #7C3AED; margin-top: 0;">${args.title}</h2>
                                    <p style="color: #4B5563; font-size: 16px; line-height: 1.5;">${args.body}</p>
                                    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
                                    <p style="color: #9CA3AF; font-size: 14px; margin-bottom: 0;">Este es un mensaje automático de Ramgos. Por favor, no respondas a este correo.</p>
                                </div>
                            </div>
                        `,
                    });
                    emailSent = true;
                    console.log(`[email.notify] sent to ${userData.email}`);
                } catch (e: any) {
                    console.error('[email.notify] error', e);
                }
            } else {
                console.log(`[email.notify] skipped (no API key) to ${userData.email}`);
            }
        }

        return { success: pushSentTo > 0 || emailSent, sentTo: pushSentTo, emailSent };
    },
});

// ---------------------------------------------------------------------------
// PUBLIC action — backwards-compatible wrapper. Existing callers that pass
// raw tokens still work; new callers should prefer `internal.notifications.notifyUser`.
// ---------------------------------------------------------------------------
export const sendPushNotification = action({
    args: {
        sessionToken: v.optional(v.string()),
        tokens: v.array(v.string()),
        title: v.string(),
        body: v.string(),
        data: v.optional(v.any()),
    },
    handler: async (ctx, args): Promise<{ success: boolean; receipt?: any; reason?: string }> => {
        // SECURITY (Fase 1): enviar pushes arbitrarios es admin-only.
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertAdminOrDeveloper(actor);
        if (args.tokens.length === 0) return { success: false, reason: 'No tokens provided' };

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
            console.error('Expo Push Notification error:', error);
            throw new Error(`Error enviando notificaciones: ${error.message}`);
        }
    },
});
