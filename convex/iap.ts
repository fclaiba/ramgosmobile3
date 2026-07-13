/**
 * convex/iap.ts — IAP database layer (queries + mutations).
 *
 * The Node.js-only side (Apple JWS / Google Play API / receipt validation)
 * lives in `convex/iapActions.ts`. This file is kept on the V8 runtime so
 * we can have queries / mutations alongside.
 *
 * See `convex/iapActions.ts` for the public actions:
 *   - validateAppleReceipt
 *   - validateGoogleReceipt
 *   - internalApplyAppleNotification
 *   - internalApplyGoogleNotification
 *   - internalVerifyPubSubJwt
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// ---------------------------------------------------------------------------
// Internal helpers (writes / reads).
// ---------------------------------------------------------------------------

export const internalUpsertIapReceipt = internalMutation({
    args: {
        userId: v.string(),
        platform: v.union(v.literal("ios"), v.literal("android")),
        productId: v.string(),
        transactionId: v.string(),
        originalTransactionId: v.optional(v.string()),
        purchaseToken: v.optional(v.string()),
        expiresAt: v.optional(v.string()),
        status: v.union(
            v.literal("active"),
            v.literal("expired"),
            v.literal("cancelled"),
            v.literal("grace_period"),
            v.literal("refunded"),
        ),
        raw: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("iapReceipts")
            .withIndex("by_transaction", (q) =>
                q.eq("transactionId", args.transactionId),
            )
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                expiresAt: args.expiresAt,
                status: args.status,
                raw: args.raw,
                updatedAt: new Date().toISOString(),
            });
        } else {
            await ctx.db.insert("iapReceipts", {
                userId: args.userId,
                platform: args.platform,
                productId: args.productId,
                transactionId: args.transactionId,
                originalTransactionId: args.originalTransactionId,
                purchaseToken: args.purchaseToken,
                expiresAt: args.expiresAt,
                status: args.status,
                raw: args.raw,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }

        const userNormId = ctx.db.normalizeId("users", args.userId);
        if (userNormId) {
            const isActive =
                args.status === "active" || args.status === "grace_period";
            await ctx.db.patch(userNormId, {
                subscriptionTier: isActive ? "pro" : "free",
                subscriptionStatus: isActive ? "active" : "inactive",
            } as any);
        }
    },
});

export const internalGetReceiptByTransaction = internalQuery({
    args: { transactionId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("iapReceipts")
            .withIndex("by_transaction", (q) =>
                q.eq("transactionId", args.transactionId),
            )
            .first();
    },
});

export const internalGetReceiptByOriginalTransaction = internalQuery({
    args: { originalTransactionId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("iapReceipts")
            .withIndex("by_original_transaction", (q) =>
                q.eq("originalTransactionId", args.originalTransactionId),
            )
            .first();
    },
});

export const internalGetReceiptByPurchaseToken = internalQuery({
    args: { purchaseToken: v.string() },
    handler: async (ctx, args) => {
        const all = await ctx.db.query("iapReceipts").collect();
        return all.find((r: any) => r.purchaseToken === args.purchaseToken) ?? null;
    },
});

// Idempotency: returns true the FIRST time we see a notificationUUID,
// false on subsequent calls so the webhook handler can no-op.
export const internalRecordIapNotification = internalMutation({
    args: {
        sessionToken: v.optional(v.string()),
        platform: v.union(v.literal("ios"), v.literal("android")),
        notificationUUID: v.string(),
        notificationType: v.string(),
        subtype: v.optional(v.string()),
        userId: v.optional(v.string()),
        rawPayload: v.optional(v.any()),
    },
    handler: async (ctx, args): Promise<{ alreadyProcessed: boolean }> => {
        const existing = await ctx.db
            .query("iapNotifications")
            .withIndex("by_uuid", (q) => q.eq("notificationUUID", args.notificationUUID))
            .first();
        if (existing) return { alreadyProcessed: true };

        await ctx.db.insert("iapNotifications", {
            platform: args.platform,
            notificationUUID: args.notificationUUID,
            notificationType: args.notificationType,
            subtype: args.subtype,
            userId: args.userId,
            rawPayload: args.rawPayload,
            processedAt: new Date().toISOString(),
        });
        return { alreadyProcessed: false };
    },
});
