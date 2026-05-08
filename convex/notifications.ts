import { v } from "convex/values";
import { mutation, action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor } from "./authHelpers";
import { Resend } from "resend";

// ---------------------------------------------------------------------------
// PUBLIC mutations — manage push tokens per user.
// ---------------------------------------------------------------------------
export const registerPushToken = mutation({
    args: {
        actorId: v.optional(v.id("users")),
        token: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);

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
        actorId: v.optional(v.id("users")),
        token: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);

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
    },
    handler: async (ctx, args) => {
        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
            console.error("Missing RESEND_API_KEY environment variable");
            console.log(`[Development Mock] Se enviaría OTP a ${args.email}: Código ${args.code}`);
            return { success: true, mocked: true };
        }

        const resend = new Resend(resendApiKey);
        const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Ramgos <onboarding@resend.dev>";

        try {
            const { data, error } = await resend.emails.send({
                from: fromEmail,
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
    },
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

export const internalGetUserPushTokens = internalQuery({
    args: { userId: v.string() },
    handler: async (ctx, args): Promise<string[]> => {
        try {
            const user = await ctx.db.get(args.userId as any);
            return ((user as any)?.pushTokens as string[] | undefined) ?? [];
        } catch (e) {
            return [];
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
        category: v.optional(v.union(
            v.literal('order'),
            v.literal('payment'),
            v.literal('dispute'),
            v.literal('social'),
            v.literal('campaign'),
            v.literal('system'),
        )),
    },
    handler: async (ctx, args): Promise<{ success: boolean; sentTo: number }> => {
        const tokens: string[] = await ctx.runQuery(internal.notifications.internalGetUserPushTokens, {
            userId: args.userId,
        });

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
            return { success: false, sentTo: 0 };
        }

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
            console.log(`[push.notify] sent user=${args.userId} tokens=${tokens.length} title="${args.title}"`);
            return { success: true, sentTo: tokens.length };
        } catch (error: any) {
            console.error('[push.notify] error', error);
            await ctx.runMutation(internal.notifications.internalRecordPushDelivery, {
                userId: args.userId,
                title: args.title,
                body: args.body,
                category: args.category,
                status: 'failed',
                errorMessage: error?.message ?? String(error),
                data: args.data,
            });
            return { success: false, sentTo: 0 };
        }
    },
});

// ---------------------------------------------------------------------------
// PUBLIC action — backwards-compatible wrapper. Existing callers that pass
// raw tokens still work; new callers should prefer `internal.notifications.notifyUser`.
// ---------------------------------------------------------------------------
export const sendPushNotification = action({
    args: {
        tokens: v.array(v.string()),
        title: v.string(),
        body: v.string(),
        data: v.optional(v.any()),
    },
    handler: async (_ctx, args): Promise<{ success: boolean; receipt?: any; reason?: string }> => {
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
