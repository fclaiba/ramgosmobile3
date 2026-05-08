/**
 * convex/subscriptions.ts — Stripe Subscriptions for business merchants.
 *
 * Why business uses Stripe (not IAP):
 *   - Apple/Google bill IAP at 30% (15% after year 1) AND require IAP for
 *     digital goods consumed in the app.
 *   - The "merchant" plan is a B2B service that grants seller features —
 *     this is exempt from IAP rules under both stores' policies.
 *   - Stripe gives us proper invoicing, dunning, proration, and webhooks.
 *
 * Flow:
 *   1. Client calls `createSubscriptionCheckout` → action that creates a
 *      Stripe Customer if missing, then a Stripe Checkout Session in
 *      `mode: 'subscription'` for the configured `STRIPE_PRICE_BUSINESS_MONTHLY`.
 *      Returns the hosted Checkout URL.
 *   2. App opens that URL in an in-app browser. User pays.
 *   3. Stripe fires `checkout.session.completed` and
 *      `customer.subscription.created` → `convex/http.ts` calls
 *      `internalSyncSubscriptionFromEvent` to upsert `stripeSubscriptions`
 *      and patch `users.subscriptionTier='business'/'active'`.
 *   4. `cancelSubscription` action issues `subscriptions.update({ cancel_at_period_end: true })`.
 *
 * Keeping all customer/subscription state in Convex (`stripeSubscriptions`)
 * means dashboards / gating logic don't need to call Stripe live; we trust
 * the webhook stream as the source of truth.
 */

import { v } from "convex/values";
import {
    action,
    internalAction,
    internalMutation,
    internalQuery,
    query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";
import { withStripeBreadcrumb } from "./observability";

const stripeKey = process.env.STRIPE_SECRET_KEY;
const allowStripeMock = process.env.ALLOW_STRIPE_MOCK === "true";
const isMockMode = !stripeKey;
const stripe = new Stripe(stripeKey ?? "sk_test_mock_fallback", {
    apiVersion: "2024-04-10" as any,
});

// Configured Stripe Price IDs (set in Convex env). Business is the main
// recurring plan; we keep `pro` here too for completeness in case we ever
// offer Stripe billing for consumer pro on web (mobile uses IAP).
const PRICE_BUSINESS = process.env.STRIPE_PRICE_BUSINESS_MONTHLY ?? "";
const PRICE_PRO = process.env.STRIPE_PRICE_PRO_MONTHLY ?? "";

const assertStripeConfigured = () => {
    if (!isMockMode) return;
    if (allowStripeMock) return;
    throw new Error(
        "Stripe no configurado. Define STRIPE_SECRET_KEY en Convex o habilita ALLOW_STRIPE_MOCK=true.",
    );
};

const resolvePriceForTier = (tier: "pro" | "business"): string => {
    if (tier === "business") return PRICE_BUSINESS;
    return PRICE_PRO;
};

// ---------------------------------------------------------------------------
// Internal helpers — actions can't read DB directly.
// ---------------------------------------------------------------------------

export const internalGetUser = internalQuery({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => ctx.db.get(args.userId),
});

export const internalSetStripeCustomerId = internalMutation({
    args: { userId: v.id("users"), stripeCustomerId: v.string() },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, {
            stripeCustomerId: args.stripeCustomerId,
        } as any);
    },
});

export const internalUpsertSubscription = internalMutation({
    args: {
        userId: v.string(),
        stripeCustomerId: v.string(),
        stripeSubscriptionId: v.string(),
        stripePriceId: v.string(),
        tier: v.union(v.literal("pro"), v.literal("business")),
        status: v.union(
            v.literal("active"),
            v.literal("past_due"),
            v.literal("canceled"),
            v.literal("incomplete"),
            v.literal("trialing"),
            v.literal("unpaid"),
        ),
        currentPeriodEnd: v.optional(v.string()),
        cancelAtPeriodEnd: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("stripeSubscriptions")
            .withIndex("by_stripe_subscription", (q) =>
                q.eq("stripeSubscriptionId", args.stripeSubscriptionId),
            )
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                status: args.status,
                currentPeriodEnd: args.currentPeriodEnd,
                cancelAtPeriodEnd: args.cancelAtPeriodEnd,
                stripePriceId: args.stripePriceId,
                updatedAt: new Date().toISOString(),
            });
        } else {
            await ctx.db.insert("stripeSubscriptions", {
                userId: args.userId,
                stripeCustomerId: args.stripeCustomerId,
                stripeSubscriptionId: args.stripeSubscriptionId,
                stripePriceId: args.stripePriceId,
                tier: args.tier,
                status: args.status,
                currentPeriodEnd: args.currentPeriodEnd,
                cancelAtPeriodEnd: args.cancelAtPeriodEnd,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }

        // Mirror to users.subscriptionTier + subscriptionStatus so dashboards
        // (which already read from users) stay in sync without joining tables.
        const userNormId = ctx.db.normalizeId("users", args.userId);
        if (userNormId) {
            const isActive =
                args.status === "active" || args.status === "trialing";
            await ctx.db.patch(userNormId, {
                subscriptionTier: isActive ? args.tier : "free",
                subscriptionStatus: isActive ? "active" : "inactive",
            } as any);
        }
    },
});

// ---------------------------------------------------------------------------
// createSubscriptionCheckout — public action.
// Returns a Stripe-hosted Checkout Session URL for the configured business
// price. The mobile app opens this URL in an in-app browser.
// ---------------------------------------------------------------------------
export const createSubscriptionCheckout = action({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.id("users"),
        tier: v.union(v.literal("pro"), v.literal("business")),
        successUrl: v.optional(v.string()),
        cancelUrl: v.optional(v.string()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ url: string | null; sessionId: string | null; isMock: boolean }> => {
        assertStripeConfigured();

        if (isMockMode) {
            return {
                url: `https://checkout.stripe.com/mock-subscription?tier=${args.tier}`,
                sessionId: `cs_mock_${Date.now()}`,
                isMock: true,
            };
        }

        const priceId = resolvePriceForTier(args.tier);
        if (!priceId) {
            throw new Error(
                `STRIPE_PRICE_${args.tier === "business" ? "BUSINESS" : "PRO"}_MONTHLY no configurado en Convex.`,
            );
        }

        const user: any = await ctx.runQuery(
            internal.subscriptions.internalGetUser,
            { userId: args.userId },
        );
        if (!user) throw new Error("Usuario no encontrado.");

        // Create or reuse Stripe Customer.
        let stripeCustomerId: string = user.stripeCustomerId ?? "";
        if (!stripeCustomerId) {
            const customer = await withStripeBreadcrumb(
                {
                    api: "customers.create",
                    userId: String(args.userId),
                    email: user.email,
                },
                () =>
                    stripe.customers.create({
                        email: user.email,
                        name: user.name,
                        metadata: { ramgosUserId: String(args.userId) },
                    }),
            );
            stripeCustomerId = customer.id;
            await ctx.runMutation(
                internal.subscriptions.internalSetStripeCustomerId,
                {
                    userId: args.userId,
                    stripeCustomerId,
                },
            );
        }

        const session = await withStripeBreadcrumb(
            {
                api: "checkout.sessions.create",
                userId: String(args.userId),
                customerId: stripeCustomerId,
                tier: args.tier,
                priceId,
            },
            () =>
                stripe.checkout.sessions.create({
                    mode: "subscription",
                    customer: stripeCustomerId,
                    line_items: [{ price: priceId, quantity: 1 }],
                    success_url:
                        args.successUrl ??
                        "ramgos://subscription/success?session={CHECKOUT_SESSION_ID}",
                    cancel_url:
                        args.cancelUrl ?? "ramgos://subscription/cancel",
                    metadata: {
                        ramgosUserId: String(args.userId),
                        tier: args.tier,
                    },
                    subscription_data: {
                        metadata: {
                            ramgosUserId: String(args.userId),
                            tier: args.tier,
                        },
                    },
                }),
        );

        return {
            url: session.url,
            sessionId: session.id,
            isMock: false,
        };
    },
});

// ---------------------------------------------------------------------------
// cancelSubscription — public action. Issues a "cancel at period end"
// rather than an immediate cancel — buyer keeps benefits until they
// already paid for, which is the standard SaaS cancellation behavior.
// ---------------------------------------------------------------------------
export const cancelSubscription = action({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.id("users"),
    },
    handler: async (ctx, args): Promise<{ success: boolean }> => {
        assertStripeConfigured();

        const sub: any = await ctx.runQuery(
            internal.subscriptions.internalGetActiveSubscription,
            { userId: String(args.userId) },
        );
        if (!sub) throw new Error("No hay suscripción activa.");

        if (isMockMode) {
            await ctx.runMutation(
                internal.subscriptions.internalUpsertSubscription,
                {
                    userId: String(args.userId),
                    stripeCustomerId: sub.stripeCustomerId,
                    stripeSubscriptionId: sub.stripeSubscriptionId,
                    stripePriceId: sub.stripePriceId,
                    tier: sub.tier,
                    status: "canceled",
                    currentPeriodEnd: sub.currentPeriodEnd,
                    cancelAtPeriodEnd: true,
                },
            );
            return { success: true };
        }

        await withStripeBreadcrumb(
            {
                api: "subscriptions.update",
                userId: String(args.userId),
                subscriptionId: sub.stripeSubscriptionId,
                cancelAtPeriodEnd: true,
            },
            () =>
                stripe.subscriptions.update(sub.stripeSubscriptionId, {
                    cancel_at_period_end: true,
                }),
        );
        return { success: true };
    },
});

export const internalGetActiveSubscription = internalQuery({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("stripeSubscriptions")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .filter((q) =>
                q.or(
                    q.eq(q.field("status"), "active"),
                    q.eq(q.field("status"), "trialing"),
                    q.eq(q.field("status"), "past_due"),
                ),
            )
            .first();
    },
});

// ---------------------------------------------------------------------------
// internalHandleStripeSubscriptionEvent — webhook entry point.
// Called from convex/http.ts when any of the following arrive:
//   - customer.subscription.created
//   - customer.subscription.updated
//   - customer.subscription.deleted
//   - invoice.payment_succeeded (only if subscription)
//   - invoice.payment_failed
// ---------------------------------------------------------------------------
export const internalHandleStripeSubscriptionEvent = internalAction({
    args: {
        eventType: v.string(),
        // Pass the raw subscription object (snapshot) — http.ts decoded it.
        subscription: v.any(),
    },
    handler: async (ctx, args): Promise<void> => {
        const sub = args.subscription;
        if (!sub || !sub.id || !sub.customer) {
            console.warn("[Subs webhook] Bad subscription payload");
            return;
        }

        const stripeCustomerId = String(sub.customer);
        const stripeSubscriptionId = String(sub.id);
        const priceItem = sub.items?.data?.[0];
        const stripePriceId = priceItem?.price?.id ?? "";

        // Resolve tier from Price id config OR from subscription.metadata.
        let tier: "pro" | "business" = "business";
        if (sub.metadata?.tier === "pro" || stripePriceId === PRICE_PRO) {
            tier = "pro";
        } else if (
            sub.metadata?.tier === "business" ||
            stripePriceId === PRICE_BUSINESS
        ) {
            tier = "business";
        }

        const status = String(sub.status) as
            | "active"
            | "past_due"
            | "canceled"
            | "incomplete"
            | "trialing"
            | "unpaid";

        // sub.current_period_end is a UNIX seconds timestamp on V1 API
        const currentPeriodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : undefined;

        // We need the userId — either from subscription metadata (preferred)
        // or by looking up the customer via Convex.
        let userId = sub.metadata?.ramgosUserId as string | undefined;
        if (!userId) {
            const userByCustomer: any = await ctx.runQuery(
                internal.subscriptions.internalGetUserByStripeCustomer,
                { stripeCustomerId },
            );
            if (userByCustomer) {
                userId = String(userByCustomer._id);
            }
        }

        if (!userId) {
            console.warn(
                `[Subs webhook] Could not resolve Ramgos user for customer ${stripeCustomerId}`,
            );
            return;
        }

        await ctx.runMutation(
            internal.subscriptions.internalUpsertSubscription,
            {
                userId,
                stripeCustomerId,
                stripeSubscriptionId,
                stripePriceId,
                tier,
                status,
                currentPeriodEnd,
                cancelAtPeriodEnd: !!sub.cancel_at_period_end,
            },
        );
    },
});

export const internalGetUserByStripeCustomer = internalQuery({
    args: { stripeCustomerId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("users")
            .filter((q) =>
                q.eq(q.field("stripeCustomerId"), args.stripeCustomerId),
            )
            .first();
    },
});

// ---------------------------------------------------------------------------
// Public read query.
// ---------------------------------------------------------------------------
export const getMySubscription = query({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = args.userId;
        if (!userId) return null;
        // No actor restriction for self-read; subscription state is shown in
        // the user's own dashboard.
        return await ctx.db
            .query("stripeSubscriptions")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .order("desc")
            .first();
    },
});
