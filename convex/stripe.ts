/**
 * convex/stripe.ts — Marketplace payments backed by Stripe (V1 PaymentIntents).
 *
 * Charge model: SEPARATE CHARGES + TRANSFERS.
 *
 *   1. Buyer pays once → PaymentIntent on the platform account (no
 *      transfer_data, no application_fee_amount). Funds land 100% on
 *      Ramgos' Stripe balance.
 *   2. Per line item we persist a row in `payments` with computed splits
 *      (sellerNet, ramgosCommission, influencerAmount). Wallets receive
 *      pending credits on `payment_intent.succeeded`.
 *   3. On `orders.confirmReceipt` (or auto-release cron in Sprint 3),
 *      `internalReleasePayment` fires `stripe.transfers.create({ destination })`
 *      for each seller AND each influencer that has a Connect account, and
 *      moves wallet pending → available. Ramgos commission stays on the
 *      platform balance by simply NOT being transferred out — that's the
 *      cleanest, audit-friendly way to model platform fees.
 *   4. Refunds do `refunds.create` then `transfers.createReversal` for any
 *      transfers already executed.
 *
 * Why not destination charges with `application_fee_amount`?
 *   - A single PaymentIntent only routes to ONE destination — multi-seller
 *     carts can't be expressed.
 *   - `application_fee_amount` retains the fee but NOT the influencer split;
 *     a second transfer would still be needed.
 *   - Escrow becomes harder: destination charges move money to the seller
 *     immediately, so retaining funds means using `on_behalf_of` + manual
 *     reversal — which is brittle.
 *   - Separate Charges + Transfers naturally handles all 3 (multi-seller,
 *     escrow, influencer split) and is the documented Stripe pattern for
 *     marketplaces with hold-then-release semantics.
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
// Split calculator (single source of truth for fees).
// Centralising this here means refactors / tier rules later only touch one
// place. Returns a per-line breakdown in USD floats — convert to cents at
// the boundary with the Stripe API.
// ---------------------------------------------------------------------------
type LineInput = {
    listingId?: string;
    sellerId?: string;
    influencerId?: string;
    referralCode?: string; // resolved to influencerId server-side if present
    type?: string; // 'product' | 'service' | 'event' | 'bono' | 'subscription'
    amountInCents: number;
    quantity?: number;
    commissionRate?: number;
    influencerRate?: number;
    description?: string;
};

type LineSplit = {
    listingId: string | null;
    sellerId: string | null;
    influencerId: string | null;
    type: string | null;
    amount: number; // line total in USD
    providerFee: number;
    ramgosCommission: number;
    influencerAmount: number;
    sellerNet: number;
    commissionRate: number;
    influencerRate: number;
    description: string | null;
};

// Bonos pay a higher take rate per the business rules.
// All other types (product/service/event/subscription) share the same
// default which can be overridden per-line.
const computeDefaultCommissionRate = (type?: string): number => {
    if (type === "bono") return 0.3; // 30% on bonos
    return 0.12; // 12% baseline
};

const splitLine = (line: LineInput): LineSplit => {
    const amount = (line.amountInCents * (line.quantity ?? 1)) / 100;
    const commissionRate =
        line.commissionRate ?? computeDefaultCommissionRate(line.type);
    // The PI attribution validator (above) is the source of truth for
    // `influencerRate`. If a line still reaches splitLine with an
    // influencerId but no rate, treat it as no attribution (rate=0)
    // rather than silently applying a hardcoded default — that prevented
    // accidental commissions before campaign-backend was in place.
    const influencerRate =
        line.influencerId && typeof line.influencerRate === 'number'
            ? line.influencerRate
            : 0;

    // Stripe's standard cards-only fee, US: 2.9% + $0.30. We charge it back
    // to the seller's net (industry standard for marketplaces). For multi-
    // line PIs, we approximate by allocating proportionally per line.
    const providerFee = Math.round((amount * 0.029 + 0.3) * 100) / 100;
    const ramgosCommission = Math.max(1.5, amount * commissionRate);
    const influencerAmount = line.influencerId ? amount * influencerRate : 0;
    const sellerNet = Math.max(
        0,
        amount - ramgosCommission - influencerAmount - providerFee,
    );

    return {
        listingId: line.listingId ?? null,
        sellerId: line.sellerId ?? null,
        influencerId: line.influencerId ?? null,
        type: line.type ?? null,
        amount,
        providerFee,
        ramgosCommission,
        influencerAmount,
        sellerNet,
        commissionRate,
        influencerRate,
        description: line.description ?? null,
    };
};

// ---------------------------------------------------------------------------
// createPaymentIntent — multi-line variant.
//
// Accepts EITHER a single-amount call (legacy, kept for backwards compat)
// OR a `lineItems` array. When `lineItems` is provided, we:
//   - Persist one `payments` row per line (granularity for refunds/disputes).
//   - Sum line amounts to compute the PI amount.
//   - Embed paymentIds + sellerIds in PI metadata for webhook reconciliation.
//
// The legacy single-amount path (no `lineItems`) creates a single payments
// row attributed to the (sellerId, influencerId) at the top of the args —
// kept so PaymentScreen-style flows keep working without refactor.
// ---------------------------------------------------------------------------
export const createPaymentIntent = action({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.optional(v.string()),
        orderId: v.optional(v.id("orders")),
        sellerId: v.optional(v.string()),
        influencerId: v.optional(v.string()),
        amountInCents: v.optional(v.number()), // legacy single-amount path
        commissionRate: v.optional(v.number()),
        influencerRate: v.optional(v.number()),
        description: v.optional(v.string()),
        metadata: v.optional(v.any()),
        lineItems: v.optional(
            v.array(
                v.object({
                    listingId: v.optional(v.string()),
                    sellerId: v.optional(v.string()),
                    influencerId: v.optional(v.string()),
                    referralCode: v.optional(v.string()),
                    type: v.optional(v.string()),
                    amountInCents: v.number(),
                    quantity: v.optional(v.number()),
                    commissionRate: v.optional(v.number()),
                    influencerRate: v.optional(v.number()),
                    description: v.optional(v.string()),
                }),
            ),
        ),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{
        clientSecret: string | null;
        paymentIntentId: string;
        paymentRecordIds: string[];
    }> => {
        assertStripeConfigured();

        // Resolve the effective line items (lineItems[] or synthesize from
        // the legacy single-amount args).
        const effectiveLines: LineInput[] = args.lineItems && args.lineItems.length > 0
            ? args.lineItems
            : args.amountInCents
                ? [
                      {
                          sellerId: args.sellerId,
                          influencerId: args.influencerId,
                          amountInCents: args.amountInCents,
                          quantity: 1,
                          commissionRate: args.commissionRate,
                          influencerRate: args.influencerRate,
                          description: args.description,
                      },
                  ]
                : [];

        if (effectiveLines.length === 0) {
            throw new Error(
                "createPaymentIntent: debe recibir lineItems o amountInCents.",
            );
        }

        // Resolve referralCode → influencerId server-side. The CLIENT can
        // suggest a code (from cart snapshot or checkout input), but the
        // server is the source of truth that owns the mapping (anti-fraud).
        const resolvedLines: LineInput[] = await Promise.all(
            effectiveLines.map(async (line) => {
                if (line.influencerId || !line.referralCode) return line;
                try {
                    const resolved: string | null = await ctx.runMutation(
                        internal.users.internalResolveReferralCode,
                        { code: line.referralCode },
                    );
                    if (resolved && resolved !== (args.userId ?? "")) {
                        return { ...line, influencerId: resolved };
                    }
                } catch (e) {
                    // Best effort — code resolution failure should not block
                    // the payment. The line just won't have an influencer.
                    console.warn(
                        `[Stripe] resolveReferralCode failed for ${line.referralCode}`,
                    );
                }
                return line;
            }),
        );

        // ---------------------------------------------------------------
        // Attribution validation (Influencer Campaign Backend).
        //
        // For each line that has BOTH an influencerId and a listingId,
        // verify the seller is a business AND either:
        //   (a) listing.openPromotion = true → use openCommissionRate, OR
        //   (b) there's an active campaign (influencer ↔ business) →
        //       use campaign.commissionRate.
        //
        // If neither applies, we strip the influencer from the line so
        // the buyer still pays normally but no commission is awarded.
        // ---------------------------------------------------------------
        const validatedLines: LineInput[] = await Promise.all(
            resolvedLines.map(async (line) => {
                if (!line.influencerId) return line;

                // Without a listingId we can't validate seller role; drop attribution.
                if (!line.listingId) {
                    return { ...line, influencerId: undefined, influencerRate: undefined };
                }

                let listingMeta: any = null;
                try {
                    listingMeta = await ctx.runQuery(
                        internal.listings.internalGetListingForAttribution,
                        { listingId: line.listingId },
                    );
                } catch (e) {
                    console.warn(
                        `[Stripe] internalGetListingForAttribution failed for ${line.listingId}`,
                    );
                }

                if (!listingMeta || listingMeta.sellerRole !== 'business') {
                    return { ...line, influencerId: undefined, influencerRate: undefined };
                }

                // (a) Open promotion path.
                if (
                    listingMeta.openPromotion &&
                    typeof listingMeta.openCommissionRate === 'number' &&
                    listingMeta.openCommissionRate > 0
                ) {
                    return {
                        ...line,
                        influencerRate: listingMeta.openCommissionRate,
                    };
                }

                // (b) Active campaign path.
                let campaign: any = null;
                try {
                    campaign = await ctx.runQuery(
                        internal.campaigns.internalFindActiveCampaign,
                        {
                            influencerId: line.influencerId,
                            businessId: listingMeta.sellerId,
                        },
                    );
                } catch (e) {
                    console.warn(
                        `[Stripe] internalFindActiveCampaign failed`,
                    );
                }

                if (campaign && typeof campaign.commissionRate === 'number') {
                    return {
                        ...line,
                        influencerRate: campaign.commissionRate,
                    };
                }

                // No path → strip attribution.
                return { ...line, influencerId: undefined, influencerRate: undefined };
            }),
        );

        const splits = validatedLines.map(splitLine);
        const totalAmountCents = splits.reduce(
            (sum, s) => sum + Math.round(s.amount * 100),
            0,
        );

        if (isMockMode) {
            const paymentIds: string[] = [];
            for (const split of splits) {
                const paymentId: string = await ctx.runMutation(
                    internal.finance.createPaymentRecord,
                    {
                        orderId: args.orderId,
                        userId: args.userId ?? "mock_user",
                        sellerId: split.sellerId ?? undefined,
                        stripePaymentIntentId: "pi_mock_12345",
                        provider: "stripe",
                        providerFee: split.providerFee,
                        amount: split.amount,
                        status: "pending",
                        sellerNet: split.sellerNet,
                        ramgosCommission: split.ramgosCommission,
                        influencerId: split.influencerId ?? undefined,
                        influencerAmount: split.influencerAmount,
                        commissionRate: split.commissionRate,
                        influencerRate: split.influencerRate,
                        description: split.description ?? args.description,
                        metadata: {
                            ...(args.metadata ?? {}),
                            listingId: split.listingId,
                            type: split.type,
                        },
                    },
                );
                paymentIds.push(paymentId);
            }
            return {
                clientSecret: "pi_mock_secret_12345",
                paymentIntentId: "pi_mock_12345",
                paymentRecordIds: paymentIds,
            };
        }

        try {
            const sellerIds = Array.from(
                new Set(splits.map((s) => s.sellerId).filter(Boolean) as string[]),
            );

            const paymentIntent = await withStripeBreadcrumb(
                {
                    api: "paymentIntents.create",
                    orderId: args.orderId,
                    amountInCents: totalAmountCents,
                    sellerCount: sellerIds.length,
                },
                () =>
                    stripe.paymentIntents.create({
                        amount: totalAmountCents,
                        currency: "usd",
                        metadata: {
                            orderId: args.orderId ?? "unknown",
                            userId: args.userId ?? "",
                            // sellerCount is a sanity bound for the webhook handler:
                            // if we expect N sellers and only N-1 payments rows can
                            // be found at release time, we know something drifted.
                            sellerCount: String(sellerIds.length),
                            sellerIds: sellerIds.join(","),
                        },
                        payment_method_types: ["card"],
                        description:
                            args.description ?? `Ramgos order ${args.orderId ?? ""}`,
                    }),
            );

            const paymentIds: string[] = [];
            for (const split of splits) {
                const paymentId: string = await ctx.runMutation(
                    internal.finance.createPaymentRecord,
                    {
                        orderId: args.orderId,
                        userId: args.userId ?? "",
                        sellerId: split.sellerId ?? undefined,
                        stripePaymentIntentId: paymentIntent.id,
                        provider: "stripe",
                        providerFee: split.providerFee,
                        amount: split.amount,
                        status: "pending",
                        sellerNet: split.sellerNet,
                        ramgosCommission: split.ramgosCommission,
                        influencerId: split.influencerId ?? undefined,
                        influencerAmount: split.influencerAmount,
                        commissionRate: split.commissionRate,
                        influencerRate: split.influencerRate,
                        description: split.description ?? args.description,
                        metadata: {
                            ...(args.metadata ?? {}),
                            listingId: split.listingId,
                            type: split.type,
                        },
                    },
                );
                paymentIds.push(paymentId);
            }

            return {
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
                paymentRecordIds: paymentIds,
            };
        } catch (error: any) {
            console.error("Stripe createPaymentIntent error:", error);
            throw new Error(`Error creating payment: ${error.message}`);
        }
    },
});

// ---------------------------------------------------------------------------
// internalMarkPaymentSucceeded — webhook handler.
// On `payment_intent.succeeded` we mark ALL payments tied to the PI as
// succeeded and credit each seller + influencer wallet (pending bucket).
// ---------------------------------------------------------------------------
export const internalMarkPaymentSucceeded = internalMutation({
    args: {
        stripePaymentIntentId: v.string(),
        orderId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const payments = await ctx.db
            .query("payments")
            .withIndex("by_stripe_intent", (q) =>
                q.eq("stripePaymentIntentId", args.stripePaymentIntentId),
            )
            .collect();

        if (payments.length === 0) {
            console.warn(
                `[Stripe] No payments rows for PI ${args.stripePaymentIntentId}`,
            );
            return;
        }

        for (const payment of payments) {
            if (payment.status === "succeeded") continue; // idempotent per row

            await ctx.db.patch(payment._id, {
                status: "succeeded",
                settledAt: new Date().toISOString(),
            });

            // Per-type fan-out: emit bono codes / event reservations.
            // We use scheduler.runAfter(0, ...) so each fan-out runs in its
            // own mutation transaction — keeps the per-payment hot path
            // tight (just a status flip + wallet credit) and isolates
            // failures (a bad bono emit doesn't roll back wallet credit).
            const meta = (payment.metadata ?? {}) as any;
            if (meta.type === "bono") {
                await ctx.scheduler.runAfter(
                    0,
                    internal.bonos.internalIssueBonosForPayment,
                    { paymentId: payment._id },
                );
            } else if (meta.type === "event") {
                await ctx.scheduler.runAfter(
                    0,
                    internal.events.internalIssueEventReservationsForPayment,
                    { paymentId: payment._id },
                );
            }

            // Credit seller wallet — pending bucket.
            if (payment.sellerId) {
                const sellerWallet = await ctx.db
                    .query("walletAccounts")
                    .withIndex("by_user", (q) => q.eq("userId", payment.sellerId!))
                    .first();
                if (sellerWallet) {
                    await ctx.db.patch(sellerWallet._id, {
                        balancePending: sellerWallet.balancePending + payment.sellerNet,
                        lastUpdatedAt: new Date().toISOString(),
                    });
                }

                // Pre-create payout record per payment (status=pending).
                // It will be transitioned to processing/completed in
                // internalReleasePayment when escrow releases.
                await ctx.db.insert("payouts", {
                    paymentId: String(payment._id),
                    sellerId: payment.sellerId,
                    amountInCents: Math.round(payment.sellerNet * 100),
                    currency: "USD",
                    status: "pending",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
            }

            // Credit influencer wallet — pending bucket.
            if (payment.influencerId && payment.influencerAmount > 0) {
                const infWallet = await ctx.db
                    .query("walletAccounts")
                    .withIndex("by_user", (q) => q.eq("userId", payment.influencerId!))
                    .first();
                if (infWallet) {
                    await ctx.db.patch(infWallet._id, {
                        balancePending: infWallet.balancePending + payment.influencerAmount,
                        lastUpdatedAt: new Date().toISOString(),
                    });
                }
            }
        }

        // Update order to payment_received (only if it's still in pending /
        // payment_received transition; webhooks may race with createOrder).
        if (args.orderId) {
            const orderId = ctx.db.normalizeId("orders", args.orderId);
            if (orderId) {
                const order = await ctx.db.get(orderId);
                if (order && (order.status === "pending" || order.status === "payment_received")) {
                    await ctx.db.patch(orderId, {
                        status: "payment_received",
                        escrowState: "held",
                        updatedAt: new Date().toISOString(),
                    });
                }
            }
        }
    },
});

// ---------------------------------------------------------------------------
// internalReleasePayment — escrow release for an order.
//
// Called from `orders.confirmReceipt` (and auto-release crons in Sprint 3
// for events / services). For every `payments` row of the order:
//   - moves seller's wallet pending → available
//   - moves influencer's wallet pending → available
//   - schedules a `stripe.transfers.create` to the seller's Connect account
//     via the `releaseTransferAction` action (mutations can't call Stripe).
//   - marks the per-line payout as `processing`.
//
// Why split across mutation + action?
//   - `stripe.transfers.create` is a network call, only allowed in actions.
//   - We use `ctx.scheduler.runAfter(0, ...)` to fan out one action per
//     payout so a single slow Stripe request doesn't hold up the whole
//     order release. Each action atomically updates its own payout row.
// ---------------------------------------------------------------------------
export const internalReleasePayment = internalMutation({
    args: { orderId: v.id("orders") },
    handler: async (ctx, args): Promise<{ scheduledTransfers: number }> => {
        const order = await ctx.db.get(args.orderId);
        if (!order) return { scheduledTransfers: 0 };

        const payments = await ctx.db
            .query("payments")
            .withIndex("by_order", (q) => q.eq("orderId", String(args.orderId)))
            .collect();

        let scheduled = 0;

        for (const payment of payments) {
            if (payment.status !== "succeeded") continue;

            // --- Seller leg ---
            if (payment.sellerId && payment.sellerNet > 0) {
                const wallet = await ctx.db
                    .query("walletAccounts")
                    .withIndex("by_user", (q) => q.eq("userId", payment.sellerId!))
                    .first();
                if (wallet) {
                    await ctx.db.patch(wallet._id, {
                        balancePending: Math.max(
                            0,
                            wallet.balancePending - payment.sellerNet,
                        ),
                        balanceAvailable: wallet.balanceAvailable + payment.sellerNet,
                        lastUpdatedAt: new Date().toISOString(),
                    });
                }

                const payout = await ctx.db
                    .query("payouts")
                    .withIndex("by_seller", (q) =>
                        q.eq("sellerId", payment.sellerId!),
                    )
                    .filter((q) =>
                        q.eq(q.field("paymentId"), String(payment._id)),
                    )
                    .first();
                if (payout) {
                    await ctx.db.patch(payout._id, {
                        status: "processing",
                        updatedAt: new Date().toISOString(),
                    });

                    // Resolve Stripe destination Connect account (if any).
                    const sellerNormId = ctx.db.normalizeId(
                        "users",
                        payment.sellerId!,
                    );
                    const sellerUser = sellerNormId
                        ? await ctx.db.get(sellerNormId)
                        : null;
                    const destination = (sellerUser as any)
                        ?.stripeConnectAccountId as string | undefined;

                    if (destination) {
                        await ctx.db.patch(payout._id, {
                            destinationAccountId: destination,
                            updatedAt: new Date().toISOString(),
                        });
                        await ctx.scheduler.runAfter(
                            0,
                            internal.stripe.releaseTransferAction,
                            {
                                payoutId: payout._id,
                                amountInCents: payout.amountInCents,
                                destinationAccountId: destination,
                                transferGroup: String(args.orderId),
                                paymentId: String(payment._id),
                                role: "seller",
                            },
                        );
                        scheduled++;
                    } else {
                        // Seller has no Connect account yet — keep funds in
                        // wallet (already moved to available above) and let
                        // them onboard later. Nothing fails here.
                        await ctx.db.patch(payout._id, {
                            status: "pending",
                            error: "seller_not_onboarded",
                            updatedAt: new Date().toISOString(),
                        });
                    }
                }
            }

            // --- Influencer leg ---
            if (payment.influencerId && payment.influencerAmount > 0) {
                const wallet = await ctx.db
                    .query("walletAccounts")
                    .withIndex("by_user", (q) =>
                        q.eq("userId", payment.influencerId!),
                    )
                    .first();
                if (wallet) {
                    await ctx.db.patch(wallet._id, {
                        balancePending: Math.max(
                            0,
                            wallet.balancePending - payment.influencerAmount,
                        ),
                        balanceAvailable:
                            wallet.balanceAvailable + payment.influencerAmount,
                        lastUpdatedAt: new Date().toISOString(),
                    });
                }

                const influencerNormId = ctx.db.normalizeId(
                    "users",
                    payment.influencerId!,
                );
                const influencerUser = influencerNormId
                    ? await ctx.db.get(influencerNormId)
                    : null;
                const destination = (influencerUser as any)
                    ?.stripeConnectAccountId as string | undefined;

                // We persist a separate payout row for the influencer
                // (sellerId column doubles as "recipient userId" — keep that
                // in mind in admin dashboards).
                const influencerPayoutId = await ctx.db.insert("payouts", {
                    paymentId: String(payment._id),
                    sellerId: payment.influencerId,
                    amountInCents: Math.round(payment.influencerAmount * 100),
                    destinationAccountId: destination,
                    currency: "USD",
                    status: destination ? "processing" : "pending",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    error: destination ? undefined : "influencer_not_onboarded",
                });

                if (destination) {
                    await ctx.scheduler.runAfter(
                        0,
                        internal.stripe.releaseTransferAction,
                        {
                            payoutId: influencerPayoutId,
                            amountInCents: Math.round(
                                payment.influencerAmount * 100,
                            ),
                            destinationAccountId: destination,
                            transferGroup: String(args.orderId),
                            paymentId: String(payment._id),
                            role: "influencer",
                        },
                    );
                    scheduled++;
                }
            }
        }

        return { scheduledTransfers: scheduled };
    },
});

// ---------------------------------------------------------------------------
// releaseTransferAction — actually fires the Stripe transfer.
// One per payout, scheduled by internalReleasePayment.
// ---------------------------------------------------------------------------
export const releaseTransferAction = internalAction({
    args: {
        payoutId: v.id("payouts"),
        amountInCents: v.number(),
        destinationAccountId: v.string(),
        transferGroup: v.string(),
        paymentId: v.string(),
        role: v.union(v.literal("seller"), v.literal("influencer")),
    },
    handler: async (ctx, args): Promise<void> => {
        if (isMockMode) {
            await ctx.runMutation(internal.finance.updatePayoutStatus, {
                payoutId: args.payoutId,
                status: "completed",
                stripeTransferId: `tr_mock_${Date.now()}`,
                executedAt: new Date().toISOString(),
            });
            return;
        }

        try {
            const transfer = await withStripeBreadcrumb(
                {
                    api: "transfers.create",
                    paymentId: args.paymentId,
                    payoutId: String(args.payoutId),
                    role: args.role,
                    destination: args.destinationAccountId,
                    amountInCents: args.amountInCents,
                },
                () =>
                    stripe.transfers.create({
                        amount: args.amountInCents,
                        currency: "usd",
                        destination: args.destinationAccountId,
                        transfer_group: args.transferGroup,
                        metadata: {
                            paymentId: args.paymentId,
                            role: args.role,
                        },
                    }),
            );
            await ctx.runMutation(internal.finance.updatePayoutStatus, {
                payoutId: args.payoutId,
                status: "completed",
                stripeTransferId: transfer.id,
                executedAt: new Date().toISOString(),
            });

            // Resolve recipient userId from the payout row to push the
            // "transferencia recibida" notification. We do NOT rely on
            // the destination Connect account ID — that's a Stripe
            // identifier, not our user id.
            try {
                const payoutCtx: any = await ctx.runQuery(
                    internal.stripe.internalGetPayoutRecipient,
                    { payoutId: args.payoutId },
                );
                if (payoutCtx?.recipientUserId) {
                    const amountUsd = (args.amountInCents / 100).toFixed(2);
                    await ctx.runAction(internal.notifications.notifyUser, {
                        userId: payoutCtx.recipientUserId,
                        title: args.role === 'seller' ? 'Recibiste tu payout' : 'Recibiste tu comisión',
                        body: `$${amountUsd} USD enviados a tu cuenta. Suelen acreditarse en 1-2 días hábiles.`,
                        category: 'payment',
                        data: {
                            type: 'payout_completed',
                            role: args.role,
                            payoutId: String(args.payoutId),
                            amount: Number(amountUsd),
                            stripeTransferId: transfer.id,
                        },
                    });
                }
            } catch (e) {
                console.warn('[push.payout] recipient lookup failed', e);
            }
        } catch (error: any) {
            console.error(
                `[Stripe] transfer error (${args.role} payoutId=${args.payoutId}):`,
                error,
            );
            await ctx.runMutation(internal.finance.updatePayoutStatus, {
                payoutId: args.payoutId,
                status: "failed",
                error: error.message,
            });
        }
    },
});

// Tiny helper: resolves recipient userId for a payout — used by the
// payout success push.
export const internalGetPayoutRecipient = internalQuery({
    args: { payoutId: v.id("payouts") },
    handler: async (ctx, args): Promise<{ recipientUserId: string | null }> => {
        const payout = await ctx.db.get(args.payoutId);
        if (!payout) return { recipientUserId: null };
        return { recipientUserId: payout.sellerId ?? null };
    },
});

// ---------------------------------------------------------------------------
// internalRefundPayment — refund a single payment row.
// Reverses the linked transfers (if any) AND issues a Stripe refund of the
// proportional amount on the parent PaymentIntent.
//
// `payments[].metadata.refundReason` is a free-form reason tag.
// ---------------------------------------------------------------------------
export const internalRefundPayment = internalAction({
    args: {
        paymentId: v.id("payments"),
        reason: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ refunded: boolean }> => {
        const payment: any = await ctx.runQuery(
            internal.stripe.internalGetPayment,
            { paymentId: args.paymentId },
        );
        if (!payment) return { refunded: false };
        if (!payment.stripePaymentIntentId) return { refunded: false };

        if (isMockMode) {
            await ctx.runMutation(internal.finance.updatePaymentStatus, {
                paymentId: args.paymentId,
                status: "refunded",
                settledAt: new Date().toISOString(),
            });
            return { refunded: true };
        }

        try {
            // 1. Refund the proportional amount on the PI. Stripe treats
            //    each refund independently per PI, so partial refunds for
            //    multi-line PIs work out of the box.
            const refundAmountCents = Math.round(payment.amount * 100);
            await withStripeBreadcrumb(
                {
                    api: "refunds.create",
                    paymentId: String(args.paymentId),
                    paymentIntentId: payment.stripePaymentIntentId,
                    amountInCents: refundAmountCents,
                    reason: args.reason ?? "manual",
                },
                () =>
                    stripe.refunds.create({
                        payment_intent: payment.stripePaymentIntentId,
                        amount: refundAmountCents,
                        reason: "requested_by_customer",
                        metadata: {
                            paymentId: String(args.paymentId),
                            reason: args.reason ?? "manual",
                        },
                    }),
            );

            // 2. Reverse any transfers we already pushed for this payment.
            //    The transfer ids live on the `payouts` rows we created.
            const payouts: any[] = await ctx.runQuery(
                internal.stripe.internalListPayoutsForPayment,
                { paymentId: String(args.paymentId) },
            );
            for (const payout of payouts) {
                if (payout.status === "completed" && payout.stripeTransferId) {
                    try {
                        await withStripeBreadcrumb(
                            {
                                api: "transfers.createReversal",
                                paymentId: String(args.paymentId),
                                payoutId: String(payout._id),
                                transferId: payout.stripeTransferId,
                            },
                            () =>
                                stripe.transfers.createReversal(
                                    payout.stripeTransferId,
                                ),
                        );
                    } catch (e: any) {
                        console.warn(
                            `[Stripe] transfer reversal failed for ${payout.stripeTransferId}: ${e.message}`,
                        );
                    }
                }
            }

            await ctx.runMutation(internal.finance.updatePaymentStatus, {
                paymentId: args.paymentId,
                status: "refunded",
                settledAt: new Date().toISOString(),
            });
            return { refunded: true };
        } catch (error: any) {
            console.error("[Stripe] refund error:", error);
            throw new Error(`Error issuing refund: ${error.message}`);
        }
    },
});

export const internalGetPayment = internalQuery({
    args: { paymentId: v.id("payments") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.paymentId);
    },
});

export const internalListPayoutsForPayment = internalQuery({
    args: { paymentId: v.string() },
    handler: async (ctx, args) => {
        const all = await ctx.db.query("payouts").collect();
        return all.filter((p) => p.paymentId === args.paymentId);
    },
});

// ---------------------------------------------------------------------------
// internalGetPaymentContextByPI — resolves buyer/seller/order/amount for a
// PaymentIntent. Used by webhook-side notification fan-out so the http
// handler doesn't need to do raw DB queries.
// ---------------------------------------------------------------------------
export const internalGetPaymentContextByPI = internalQuery({
    args: { stripePaymentIntentId: v.string() },
    handler: async (ctx, args): Promise<Array<{
        paymentId: string;
        userId: string;
        sellerId: string | null;
        amount: number;
        currency: string;
        orderId: string | null;
    }>> => {
        const payments = await ctx.db
            .query("payments")
            .withIndex("by_stripe_intent", (q) =>
                q.eq("stripePaymentIntentId", args.stripePaymentIntentId),
            )
            .collect();
        return payments.map((p) => ({
            paymentId: String(p._id),
            userId: p.userId,
            sellerId: p.sellerId ?? null,
            amount: p.amount,
            currency: p.currency,
            orderId: p.orderId ?? null,
        }));
    },
});

// ---------------------------------------------------------------------------
// internalNotifyPaymentEvent — single entry point for push notifications
// triggered by Stripe webhooks. Centralises the notify-by-PI lookup to
// keep webhook routing in http.ts terse.
// ---------------------------------------------------------------------------
export const internalNotifyPaymentEvent = internalAction({
    args: {
        stripePaymentIntentId: v.string(),
        eventType: v.union(
            v.literal('succeeded'),
            v.literal('failed'),
            v.literal('refunded'),
            v.literal('disputed'),
        ),
    },
    handler: async (ctx, args): Promise<void> => {
        const contexts: Array<any> = await ctx.runQuery(
            internal.stripe.internalGetPaymentContextByPI,
            { stripePaymentIntentId: args.stripePaymentIntentId },
        );
        if (contexts.length === 0) return;

        // Use the FIRST payment for buyer-facing summary (all line items
        // belong to the same buyer + same currency; total amount summed).
        const buyerId = contexts[0].userId;
        const total = contexts.reduce((acc: number, c: any) => acc + c.amount, 0);
        const currency = contexts[0].currency;

        const sellerIds = Array.from(
            new Set(
                contexts
                    .map((c: any) => c.sellerId)
                    .filter((s: string | null): s is string => Boolean(s)),
            ),
        );

        switch (args.eventType) {
            case 'succeeded':
                await ctx.runAction(internal.notifications.notifyUser, {
                    userId: buyerId,
                    title: 'Pago confirmado',
                    body: `Pagaste $${total.toFixed(2)} ${currency}. Te avisamos cuando el vendedor envíe.`,
                    category: 'payment',
                    data: { type: 'payment_succeeded', stripePaymentIntentId: args.stripePaymentIntentId },
                });
                break;
            case 'failed':
                await ctx.runAction(internal.notifications.notifyUser, {
                    userId: buyerId,
                    title: 'Tu pago falló',
                    body: 'No pudimos procesar tu pago. Intentá nuevamente o cambiá de método.',
                    category: 'payment',
                    data: { type: 'payment_failed', stripePaymentIntentId: args.stripePaymentIntentId },
                });
                break;
            case 'refunded':
                await ctx.runAction(internal.notifications.notifyUser, {
                    userId: buyerId,
                    title: 'Reembolso emitido',
                    body: `Te devolvimos $${total.toFixed(2)} ${currency}. El reflejo en tu tarjeta puede tardar 5-10 días.`,
                    category: 'payment',
                    data: { type: 'payment_refunded', stripePaymentIntentId: args.stripePaymentIntentId },
                });
                for (const sellerId of sellerIds) {
                    await ctx.runAction(internal.notifications.notifyUser, {
                        userId: sellerId,
                        title: 'Reembolso aplicado',
                        body: `Se reembolsó una compra a un cliente. Revisá los detalles.`,
                        category: 'payment',
                        data: { type: 'payment_refunded_seller', stripePaymentIntentId: args.stripePaymentIntentId },
                    });
                }
                break;
            case 'disputed':
                for (const sellerId of sellerIds) {
                    await ctx.runAction(internal.notifications.notifyUser, {
                        userId: sellerId,
                        title: 'Cliente abrió un chargeback',
                        body: `Stripe nos avisó de una disputa de un comprador. Tenés que aportar evidencia.`,
                        category: 'payment',
                        data: { type: 'stripe_dispute_opened', stripePaymentIntentId: args.stripePaymentIntentId },
                    });
                }
                await ctx.runAction(internal.notifications.internalNotifyAdmins, {
                    title: 'Chargeback recibido',
                    body: `PI ${args.stripePaymentIntentId} en disputa. Revisar AdminFinance.`,
                    category: 'payment',
                    data: { type: 'stripe_dispute_admin', stripePaymentIntentId: args.stripePaymentIntentId },
                });
                break;
        }
    },
});

// ---------------------------------------------------------------------------
// Connect account creation + onboarding lives in `convex/connect.ts` (V2).
// The legacy V1 `createConnectAccountLink` stub has been removed; clients
// should call `api.connect.ensureConnectAccount` and
// `api.connect.createOnboardingLink` instead.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// executePayout — kept for admin/manual-override flows (Sprint 6).
// Issues a single transfer to a known destination account; does not touch
// wallets (caller is responsible for ledger consistency).
// ---------------------------------------------------------------------------
export const executePayout = action({
    args: {
        payoutId: v.id("payouts"),
        destinationAccountId: v.string(),
    },
    handler: async (ctx, args): Promise<{ success: boolean; transferId: string }> => {
        assertStripeConfigured();

        const payout = (await ctx.runMutation(internal.finance.getPayoutById as any, {
            payoutId: args.payoutId,
        })) as any;
        if (!payout) throw new Error("Payout no encontrado.");

        if (isMockMode) {
            console.log(`[Mock] Transfer of ${payout.amountInCents} to ${args.destinationAccountId}`);
            await ctx.runMutation(internal.finance.updatePayoutStatus, {
                payoutId: args.payoutId,
                status: "completed",
                stripeTransferId: "tr_mock_123",
                executedAt: new Date().toISOString(),
            });
            return { success: true, transferId: "tr_mock_123" };
        }

        try {
            const transfer = await withStripeBreadcrumb(
                {
                    api: "transfers.create",
                    payoutId: String(args.payoutId),
                    destination: args.destinationAccountId,
                    amountInCents: payout.amountInCents,
                    source: "executePayout",
                },
                () =>
                    stripe.transfers.create({
                        amount: payout.amountInCents,
                        currency: "usd",
                        destination: args.destinationAccountId,
                    }),
            );
            await ctx.runMutation(internal.finance.updatePayoutStatus, {
                payoutId: args.payoutId,
                status: "completed",
                stripeTransferId: transfer.id,
                executedAt: new Date().toISOString(),
            });
            return { success: true, transferId: transfer.id };
        } catch (error: any) {
            await ctx.runMutation(internal.finance.updatePayoutStatus, {
                payoutId: args.payoutId,
                status: "failed",
                error: error.message,
            });
            throw new Error(error.message);
        }
    },
});

// ===========================================================================
// Saved payment methods (cards) management.
//
// We piggy-back on the existing Stripe Customer (created during the first
// subscription checkout). For users who never subscribed we lazily create
// a Customer here so they can still save cards for one-tap checkout.
//
// Public actions:
//   - createSetupIntent  — opens Stripe SetupIntent (returns client_secret).
//   - listPaymentMethods — returns saved cards (brand, last4, expiry, default flag).
//   - detachPaymentMethod — removes a saved card.
//   - setDefaultPaymentMethod — flips Customer.invoice_settings.default_payment_method.
// ===========================================================================

const ensureStripeCustomer = async (
    ctx: any,
    userId: string,
): Promise<string> => {
    const user: any = await ctx.runQuery(internal.subscriptions.internalGetUser, {
        userId: userId as any,
    });
    if (!user) throw new Error("Usuario no encontrado.");
    if (user.stripeCustomerId) return user.stripeCustomerId;

    const customer = await withStripeBreadcrumb(
        {
            api: "customers.create",
            userId,
            email: user.email,
            source: "ensureStripeCustomer",
        },
        () =>
            stripe.customers.create({
                email: user.email,
                name: user.name,
                metadata: { ramgosUserId: userId },
            }),
    );
    await ctx.runMutation(internal.subscriptions.internalSetStripeCustomerId, {
        userId: userId as any,
        stripeCustomerId: customer.id,
    });
    return customer.id;
};

export const createSetupIntent = action({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.id("users"),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ clientSecret: string | null; customerId: string; isMock: boolean }> => {
        assertStripeConfigured();
        if (isMockMode) {
            return {
                clientSecret: "seti_mock_client_secret",
                customerId: "cus_mock",
                isMock: true,
            };
        }

        const customerId = await ensureStripeCustomer(ctx, String(args.userId));
        const setupIntent = await withStripeBreadcrumb(
            {
                api: "setupIntents.create",
                userId: String(args.userId),
                customerId,
            },
            () =>
                stripe.setupIntents.create({
                    customer: customerId,
                    usage: "off_session",
                    payment_method_types: ["card"],
                }),
        );
        return {
            clientSecret: setupIntent.client_secret,
            customerId,
            isMock: false,
        };
    },
});

export const listPaymentMethods = action({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.id("users"),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{
        items: Array<{
            id: string;
            brand: string;
            last4: string;
            expMonth: number;
            expYear: number;
            isDefault: boolean;
        }>;
        isMock: boolean;
    }> => {
        assertStripeConfigured();
        if (isMockMode) {
            return {
                items: [
                    {
                        id: "pm_mock_1",
                        brand: "visa",
                        last4: "4242",
                        expMonth: 12,
                        expYear: 2030,
                        isDefault: true,
                    },
                ],
                isMock: true,
            };
        }

        const user: any = await ctx.runQuery(
            internal.subscriptions.internalGetUser,
            { userId: args.userId },
        );
        if (!user?.stripeCustomerId) {
            return { items: [], isMock: false };
        }

        const [methodsList, customer] = await Promise.all([
            withStripeBreadcrumb(
                {
                    api: "paymentMethods.list",
                    userId: String(args.userId),
                    customerId: user.stripeCustomerId,
                },
                () =>
                    stripe.paymentMethods.list({
                        customer: user.stripeCustomerId,
                        type: "card",
                        limit: 25,
                    }),
            ),
            withStripeBreadcrumb(
                {
                    api: "customers.retrieve",
                    customerId: user.stripeCustomerId,
                },
                () => stripe.customers.retrieve(user.stripeCustomerId),
            ),
        ]);

        const defaultPmId =
            (customer as any)?.invoice_settings?.default_payment_method ?? null;

        return {
            items: methodsList.data.map((pm: any) => ({
                id: pm.id,
                brand: pm.card?.brand ?? "unknown",
                last4: pm.card?.last4 ?? "----",
                expMonth: pm.card?.exp_month ?? 0,
                expYear: pm.card?.exp_year ?? 0,
                isDefault: pm.id === defaultPmId,
            })),
            isMock: false,
        };
    },
});

export const detachPaymentMethod = action({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.id("users"),
        paymentMethodId: v.string(),
    },
    handler: async (ctx, args): Promise<{ success: boolean; isMock: boolean }> => {
        assertStripeConfigured();
        if (isMockMode) return { success: true, isMock: true };

        await withStripeBreadcrumb(
            {
                api: "paymentMethods.detach",
                userId: String(args.userId),
                paymentMethodId: args.paymentMethodId,
            },
            () => stripe.paymentMethods.detach(args.paymentMethodId),
        );
        return { success: true, isMock: false };
    },
});

export const setDefaultPaymentMethod = action({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.id("users"),
        paymentMethodId: v.string(),
    },
    handler: async (ctx, args): Promise<{ success: boolean; isMock: boolean }> => {
        assertStripeConfigured();
        if (isMockMode) return { success: true, isMock: true };

        const user: any = await ctx.runQuery(
            internal.subscriptions.internalGetUser,
            { userId: args.userId },
        );
        if (!user?.stripeCustomerId) {
            throw new Error("El usuario aún no tiene Stripe Customer.");
        }

        await withStripeBreadcrumb(
            {
                api: "customers.update",
                customerId: user.stripeCustomerId,
                paymentMethodId: args.paymentMethodId,
                source: "setDefaultPaymentMethod",
            },
            () =>
                stripe.customers.update(user.stripeCustomerId, {
                    invoice_settings: {
                        default_payment_method: args.paymentMethodId,
                    },
                }),
        );
        return { success: true, isMock: false };
    },
});
