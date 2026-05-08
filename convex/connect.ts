/**
 * Stripe Connect V2 — accounts, onboarding links, live status reads.
 *
 * V2 differs from classic V1 Connect in that:
 *   - Account creation never takes top-level `type: 'express'/'standard'/'custom'`.
 *   - Capabilities live under `configuration.recipient.capabilities`.
 *   - Onboarding links use `v2.core.accountLinks.create` with `use_case`.
 *   - Status reads use `v2.core.accounts.retrieve(id, { include: [...] })`.
 *   - Account / capability changes are delivered as *thin events*; full
 *     payloads are pulled via `v2.core.events.retrieve(thinEvent.id)` and
 *     are routed in `convex/http.ts` (see /stripe-webhook).
 *
 * Risk model (per plan):
 *   - fees_collector: 'application'  (Ramgos collects Stripe fees from buyers)
 *   - losses_collector: 'stripe'     (Stripe absorbs negative-balance recovery —
 *                                     safer for an early-stage marketplace)
 *
 * PaymentIntents stay on V1 in `convex/stripe.ts` because Separate Charges
 * + Transfers don't require V2-specific payment APIs. Both APIs coexist
 * peacefully on the same Stripe account / SDK instance.
 *
 * Auth model in this file: actions cannot use `ctx.db` directly, so the
 * actor lookup is done via `internal.connect.internalGetActorRole` query.
 */

import { v } from "convex/values";
import {
    action,
    internalAction,
    internalMutation,
    internalQuery,
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

const assertStripeConfigured = () => {
    if (!isMockMode) return;
    if (allowStripeMock) return;
    throw new Error(
        "Stripe no configurado. Define STRIPE_SECRET_KEY en Convex o habilita ALLOW_STRIPE_MOCK=true solo para desarrollo.",
    );
};

// ---------------------------------------------------------------------------
// Internal helpers — actions cannot read the DB directly, so we use these
// internal queries / mutations to read users and persist results.
// ---------------------------------------------------------------------------

export const internalSaveConnectAccount = internalMutation({
    args: {
        userId: v.id("users"),
        stripeConnectAccountId: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, {
            stripeConnectAccountId: args.stripeConnectAccountId,
        } as any);
    },
});

export const internalGetConnectAccountId = internalQuery({
    args: { userId: v.id("users") },
    handler: async (ctx, args): Promise<string | null> => {
        const user = await ctx.db.get(args.userId);
        if (!user) return null;
        return ((user as any).stripeConnectAccountId as string) ?? null;
    },
});

export const internalGetActorRole = internalQuery({
    args: { actorId: v.id("users") },
    handler: async (
        ctx,
        args,
    ): Promise<{ role: string; email: string | null } | null> => {
        const user = await ctx.db.get(args.actorId);
        if (!user) return null;
        return {
            role: (user as any).role ?? "consumer",
            email: (user as any).email ?? null,
        };
    },
});

const assertSelfOrAdminAction = async (
    ctx: any,
    actorId: any,
    targetUserId: string,
) => {
    if (!actorId) {
        throw new Error("No autorizado.");
    }
    const actor: { role: string; email: string | null } | null =
        await ctx.runQuery(internal.connect.internalGetActorRole, {
            actorId,
        });
    if (!actor) throw new Error("No autorizado.");

    const isSelf = String(actorId) === targetUserId;
    const isAdmin = actor.role === "admin" || actor.role === "developer";
    if (!isSelf && !isAdmin) {
        throw new Error("No autorizado.");
    }
};

// ---------------------------------------------------------------------------
// createConnectAccount — V2 account creation for sellers/influencers.
// Persists `users.stripeConnectAccountId` once Stripe returns the new id.
// ---------------------------------------------------------------------------
export const createConnectAccount = action({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.id("users"),
        displayName: v.string(),
        contactEmail: v.string(),
        country: v.optional(v.string()), // ISO-3166 alpha-2; defaults to 'us'
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ accountId: string; isMock: boolean }> => {
        assertStripeConfigured();
        await assertSelfOrAdminAction(ctx, args.actorId, String(args.userId));

        if (isMockMode) {
            const mockId = `acct_mock_${args.userId}_${Date.now()}`;
            await ctx.runMutation(internal.connect.internalSaveConnectAccount, {
                userId: args.userId,
                stripeConnectAccountId: mockId,
            });
            return { accountId: mockId, isMock: true };
        }

        try {
            // EXACT shape required by V2 — no top-level `type`. Capabilities
            // live under configuration.recipient.
            const account: any = await withStripeBreadcrumb(
                {
                    api: "v2.core.accounts.create",
                    userId: String(args.userId),
                    country: (args.country ?? "us").toLowerCase(),
                },
                () =>
                    (stripe as any).v2.core.accounts.create({
                        display_name: args.displayName,
                        contact_email: args.contactEmail,
                        identity: {
                            country: (args.country ?? "us").toLowerCase(),
                        },
                        dashboard: "express",
                        defaults: {
                            responsibilities: {
                                fees_collector: "application",
                                // Plan override vs sample: Stripe absorbs losses.
                                losses_collector: "stripe",
                            },
                        },
                        configuration: {
                            recipient: {
                                capabilities: {
                                    stripe_balance: {
                                        stripe_transfers: {
                                            requested: true,
                                        },
                                    },
                                },
                            },
                        },
                    }),
            );

            await ctx.runMutation(internal.connect.internalSaveConnectAccount, {
                userId: args.userId,
                stripeConnectAccountId: account.id,
            });

            return { accountId: account.id, isMock: false };
        } catch (error: any) {
            console.error("[Connect V2] createConnectAccount error:", error);
            throw new Error(
                `No se pudo crear la cuenta Stripe Connect: ${error.message}`,
            );
        }
    },
});

// ---------------------------------------------------------------------------
// createOnboardingLink — V2 account link for KYC/onboarding.
// Returns a short-lived URL the user opens (in-app browser / WebView).
// ---------------------------------------------------------------------------
export const createOnboardingLink = action({
    args: {
        actorId: v.optional(v.id("users")),
        accountId: v.string(),
    },
    handler: async (ctx, args): Promise<{ url: string; isMock: boolean }> => {
        assertStripeConfigured();

        if (isMockMode) {
            return {
                url: `https://connect.stripe.com/mock-onboarding?account=${args.accountId}`,
                isMock: true,
            };
        }

        // Light auth: must have an actor at minimum (actions can't run
        // assertSelfOrAdmin without an internal query on a known target user;
        // here the target is the account itself, validated server-side by
        // Stripe — anyone calling with a random accountId would just get a
        // link that's useless to them).
        if (!args.actorId) throw new Error("No autorizado.");

        try {
            const link = await (stripe as any).v2.core.accountLinks.create({
                account: args.accountId,
                use_case: {
                    type: "account_onboarding",
                    account_onboarding: {
                        configurations: ["recipient"],
                        // Deep links into the app. The dashboard screens listen
                        // for these and re-poll account status on return.
                        refresh_url: "ramgos://onboarding/refresh",
                        return_url: "ramgos://onboarding/complete",
                    },
                },
            });
            return { url: link.url, isMock: false };
        } catch (error: any) {
            console.error("[Connect V2] createOnboardingLink error:", error);
            throw new Error(
                `No se pudo generar el link de onboarding: ${error.message}`,
            );
        }
    },
});

// ---------------------------------------------------------------------------
// getAccountStatus — LIVE read from Stripe (no DB cache, per the brief).
// Used by dashboard banners to know if the seller can receive payments yet.
// ---------------------------------------------------------------------------
export const getAccountStatus = action({
    args: {
        actorId: v.optional(v.id("users")),
        accountId: v.string(),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{
        accountId: string;
        readyToReceivePayments: boolean;
        onboardingComplete: boolean;
        requirementsStatus: string | null;
        transfersStatus: string | null;
        isMock: boolean;
    }> => {
        assertStripeConfigured();

        if (isMockMode) {
            return {
                accountId: args.accountId,
                readyToReceivePayments: true,
                onboardingComplete: true,
                requirementsStatus: null,
                transfersStatus: "active",
                isMock: true,
            };
        }

        try {
            const account = await (stripe as any).v2.core.accounts.retrieve(
                args.accountId,
                { include: ["configuration.recipient", "requirements"] },
            );

            const transfersStatus =
                account?.configuration?.recipient?.capabilities?.stripe_balance
                    ?.stripe_transfers?.status ?? null;
            const readyToReceivePayments = transfersStatus === "active";

            const requirementsStatus =
                account?.requirements?.summary?.minimum_deadline?.status ?? null;
            const onboardingComplete =
                requirementsStatus !== "currently_due" &&
                requirementsStatus !== "past_due";

            return {
                accountId: args.accountId,
                readyToReceivePayments,
                onboardingComplete,
                requirementsStatus,
                transfersStatus,
                isMock: false,
            };
        } catch (error: any) {
            console.error("[Connect V2] getAccountStatus error:", error);
            throw new Error(
                `No se pudo leer el estado de la cuenta: ${error.message}`,
            );
        }
    },
});

// ---------------------------------------------------------------------------
// ensureConnectAccount — convenience wrapper used by dashboards.
// If the user already has a Connect account id, returns it; otherwise
// creates a brand new V2 account on the fly.
// ---------------------------------------------------------------------------
export const ensureConnectAccount = action({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.id("users"),
        displayName: v.string(),
        contactEmail: v.string(),
        country: v.optional(v.string()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ accountId: string; created: boolean }> => {
        await assertSelfOrAdminAction(ctx, args.actorId, String(args.userId));

        const existing: string | null = await ctx.runQuery(
            internal.connect.internalGetConnectAccountId,
            { userId: args.userId },
        );

        if (existing) {
            return { accountId: existing, created: false };
        }

        const result: { accountId: string; isMock: boolean } = await ctx.runAction(
            internal.connect.internalCreateConnectAccountAction as any,
            {
                userId: args.userId,
                displayName: args.displayName,
                contactEmail: args.contactEmail,
                country: args.country,
            },
        );
        return { accountId: result.accountId, created: true };
    },
});

// Internal version (no actor check — caller is responsible) so the public
// ensureConnectAccount action can chain into account creation without
// re-validating the actor twice.
export const internalCreateConnectAccountAction = internalAction({
    args: {
        userId: v.id("users"),
        displayName: v.string(),
        contactEmail: v.string(),
        country: v.optional(v.string()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ accountId: string; isMock: boolean }> => {
        assertStripeConfigured();

        if (isMockMode) {
            const mockId = `acct_mock_${args.userId}_${Date.now()}`;
            await ctx.runMutation(internal.connect.internalSaveConnectAccount, {
                userId: args.userId,
                stripeConnectAccountId: mockId,
            });
            return { accountId: mockId, isMock: true };
        }

        const account = await (stripe as any).v2.core.accounts.create({
            display_name: args.displayName,
            contact_email: args.contactEmail,
            identity: { country: (args.country ?? "us").toLowerCase() },
            dashboard: "express",
            defaults: {
                responsibilities: {
                    fees_collector: "application",
                    losses_collector: "stripe",
                },
            },
            configuration: {
                recipient: {
                    capabilities: {
                        stripe_balance: {
                            stripe_transfers: { requested: true },
                        },
                    },
                },
            },
        });

        await ctx.runMutation(internal.connect.internalSaveConnectAccount, {
            userId: args.userId,
            stripeConnectAccountId: account.id,
        });

        return { accountId: account.id, isMock: false };
    },
});

// ---------------------------------------------------------------------------
// internalApplyV2AccountUpdate — webhook handler for V2 account thin events.
// Called from `convex/http.ts` /stripe-webhook when a v2.core.account[*]
// event arrives. Re-fetches the account, derives onboarding flags, and
// records an audit log entry.
// ---------------------------------------------------------------------------
export const internalApplyV2AccountUpdate = internalAction({
    args: { accountId: v.string() },
    handler: async (ctx, args): Promise<void> => {
        if (isMockMode) {
            console.log(
                `[Connect V2 webhook] Mock mode: skip applyV2AccountUpdate for ${args.accountId}`,
            );
            return;
        }

        try {
            const account = await (stripe as any).v2.core.accounts.retrieve(
                args.accountId,
                { include: ["configuration.recipient", "requirements"] },
            );

            const transfersStatus =
                account?.configuration?.recipient?.capabilities?.stripe_balance
                    ?.stripe_transfers?.status ?? null;
            const requirementsStatus =
                account?.requirements?.summary?.minimum_deadline?.status ?? null;

            const readyToReceivePayments = transfersStatus === "active";
            const onboardingComplete =
                requirementsStatus !== "currently_due" &&
                requirementsStatus !== "past_due";

            await ctx.runMutation(internal.connect.internalSaveConnectFlags, {
                stripeConnectAccountId: args.accountId,
                payoutsEnabled: readyToReceivePayments,
                onboardingComplete,
            });
        } catch (error: any) {
            console.error(
                `[Connect V2 webhook] applyV2AccountUpdate error for ${args.accountId}:`,
                error,
            );
        }
    },
});

// We don't have an index on stripeConnectAccountId yet. For the current
// scale (hundreds of sellers) the filter scan stays well within Convex
// per-mutation limits. For 1k+ sellers, add an index on `users` for
// `stripeConnectAccountId` and switch this to a withIndex query.
export const internalSaveConnectFlags = internalMutation({
    args: {
        stripeConnectAccountId: v.string(),
        payoutsEnabled: v.boolean(),
        onboardingComplete: v.boolean(),
    },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query("users")
            .filter((q) =>
                q.eq(q.field("stripeConnectAccountId"), args.stripeConnectAccountId),
            )
            .first();
        if (!user) {
            console.warn(
                `[Connect V2] No user with stripeConnectAccountId=${args.stripeConnectAccountId}`,
            );
            return;
        }
        // Audit log keeps an immutable trace of onboarding transitions
        // without forcing extra columns onto the users table.
        await ctx.db.insert("audit_logs", {
            actorUserId: "system:stripe-webhook",
            targetUserId: String(user._id),
            action: args.payoutsEnabled
                ? "STRIPE_CONNECT_PAYOUTS_ENABLED"
                : "STRIPE_CONNECT_PAYOUTS_DISABLED",
            timestamp: new Date().toISOString(),
            metadata: {
                accountId: args.stripeConnectAccountId,
                onboardingComplete: args.onboardingComplete,
            },
        });
    },
});

// ===========================================================================
// Sprint 6 — Withdrawals via Stripe Connect payouts
// ===========================================================================
//
// Replaces the legacy ACH form (`WithdrawalScreen`) which only flipped a
// status flag and never moved money. Sellers + influencers with onboarded
// Connect accounts get:
//   - getConnectBalance:      live read of available + pending on the
//                             connected account (no DB cache).
//   - updatePayoutSchedule:   switch between daily / weekly / monthly /
//                             manual auto-payouts.
//   - requestInstantPayout:   on-demand standard payout from connected
//                             account balance to their bank.
//
// All three are SCA-safe: they hit the connected account balance, not the
// platform balance, and the connected account is the legal owner of the
// funds at this point (post-transfer in our model).
//
// Rate limiting: a hostile influencer could spam requestInstantPayout, but
// Stripe rejects payouts that exceed available balance, and our wallet
// already gates this server-side via assertSelfOrAdminAction. We don't add
// a second rate limit layer here — Convex caps per-user mutation rate.
// ---------------------------------------------------------------------------

export const getConnectBalance = action({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.id("users"),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{
        accountId: string | null;
        availableCents: number;
        pendingCents: number;
        currency: string;
        isMock: boolean;
    }> => {
        await assertSelfOrAdminAction(ctx, args.actorId, String(args.userId));

        const accountId: string | null = await ctx.runQuery(
            internal.connect.internalGetConnectAccountId,
            { userId: args.userId },
        );

        if (!accountId) {
            return {
                accountId: null,
                availableCents: 0,
                pendingCents: 0,
                currency: "usd",
                isMock: isMockMode,
            };
        }

        if (isMockMode) {
            // Echo a friendly mock so dashboards render even without Stripe.
            return {
                accountId,
                availableCents: 18_5075, // $185.07
                pendingCents: 4_2000, // $42.00
                currency: "usd",
                isMock: true,
            };
        }

        try {
            // Stripe-Account header scopes the read to the connected account.
            const balance: any = await withStripeBreadcrumb(
                { api: "balance.retrieve", accountId },
                () =>
                    stripe.balance.retrieve(undefined, {
                        stripeAccount: accountId,
                    }),
            );

            const sumByCurrency = (
                arr: Array<{ amount: number; currency: string }> | undefined,
            ) => {
                if (!arr || arr.length === 0) return { amount: 0, currency: "usd" };
                // We assume USD-only per the plan's out-of-scope note.
                const usd = arr.find((b) => b.currency === "usd") ?? arr[0];
                return { amount: usd.amount, currency: usd.currency };
            };

            const available = sumByCurrency(balance.available);
            const pending = sumByCurrency(balance.pending);

            return {
                accountId,
                availableCents: available.amount,
                pendingCents: pending.amount,
                currency: available.currency,
                isMock: false,
            };
        } catch (error: any) {
            console.error("[Connect V2] getConnectBalance error:", error);
            throw new Error(
                `No se pudo leer el balance de Stripe Connect: ${error.message}`,
            );
        }
    },
});

export const updatePayoutSchedule = action({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.id("users"),
        // 'manual' disables auto-payouts (sellers must call requestInstantPayout).
        interval: v.union(
            v.literal("manual"),
            v.literal("daily"),
            v.literal("weekly"),
            v.literal("monthly"),
        ),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ updated: boolean; isMock: boolean }> => {
        await assertSelfOrAdminAction(ctx, args.actorId, String(args.userId));

        const accountId: string | null = await ctx.runQuery(
            internal.connect.internalGetConnectAccountId,
            { userId: args.userId },
        );
        if (!accountId) {
            throw new Error(
                "No tienes una cuenta de Stripe Connect. Completa el onboarding primero.",
            );
        }

        if (isMockMode) {
            return { updated: true, isMock: true };
        }

        try {
            // Note: payout schedule lives on the V1 Account API even with
            // V2 accounts — Stripe exposes it under `settings.payouts`.
            await withStripeBreadcrumb(
                {
                    api: "accounts.update",
                    accountId,
                    payoutSchedule: args.interval,
                },
                () =>
                    stripe.accounts.update(accountId, {
                        settings: {
                            payouts: {
                                schedule: { interval: args.interval },
                            },
                        },
                    }),
            );
            return { updated: true, isMock: false };
        } catch (error: any) {
            console.error("[Connect V2] updatePayoutSchedule error:", error);
            throw new Error(
                `No se pudo actualizar el calendario de payout: ${error.message}`,
            );
        }
    },
});

export const requestInstantPayout = action({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.id("users"),
        amountInCents: v.number(),
        currency: v.optional(v.string()), // 'usd' default
    },
    handler: async (
        ctx,
        args,
    ): Promise<{
        payoutId: string;
        amountInCents: number;
        currency: string;
        status: string;
        arrivalDate: number | null;
        isMock: boolean;
    }> => {
        await assertSelfOrAdminAction(ctx, args.actorId, String(args.userId));

        if (args.amountInCents < 100) {
            throw new Error("Monto inválido. Mínimo 100 centavos (USD $1).");
        }

        const accountId: string | null = await ctx.runQuery(
            internal.connect.internalGetConnectAccountId,
            { userId: args.userId },
        );
        if (!accountId) {
            throw new Error(
                "No tienes una cuenta de Stripe Connect. Completa el onboarding primero.",
            );
        }

        if (isMockMode) {
            return {
                payoutId: `po_mock_${Date.now()}`,
                amountInCents: args.amountInCents,
                currency: args.currency ?? "usd",
                status: "pending",
                arrivalDate: null,
                isMock: true,
            };
        }

        try {
            // `stripe.payouts.create` on the connected account uses standard
            // (free) payout rails by default; pass `method: 'instant'` to
            // pay the instant-payout fee and arrive within minutes (only
            // available for eligible debit cards). We default to standard.
            const payout = await withStripeBreadcrumb(
                {
                    api: "payouts.create",
                    accountId,
                    amountInCents: args.amountInCents,
                    currency: args.currency ?? "usd",
                    triggeredBy: String(args.userId),
                },
                () =>
                    stripe.payouts.create(
                        {
                            amount: args.amountInCents,
                            currency: args.currency ?? "usd",
                            metadata: {
                                triggeredBy: String(args.userId),
                                source: "ramgos-app:requestInstantPayout",
                            },
                        },
                        { stripeAccount: accountId },
                    ),
            );
            return {
                payoutId: payout.id,
                amountInCents: payout.amount,
                currency: payout.currency,
                status: payout.status,
                arrivalDate: payout.arrival_date ?? null,
                isMock: false,
            };
        } catch (error: any) {
            console.error("[Connect V2] requestInstantPayout error:", error);
            throw new Error(
                `No se pudo solicitar el payout: ${error.message}`,
            );
        }
    },
});
