/**
 * Daily reconciliation cron — Stripe Balance Transactions vs internal ledger.
 *
 * Why we need it: our `payments` and `payouts` tables are mutated by webhook
 * handlers and by manual actions. If a webhook is missed, an action fails
 * mid-flight, or a Stripe-side correction (manual refund / adjustment / fee
 * change) happens out-of-band, our ledger drifts from Stripe's truth.
 *
 * The cron runs once a day, walks `stripe.balanceTransactions.list` from the
 * last cursor we processed, and for each BT:
 *   - tries to find a matching local row (by PI id, transfer id, or refund
 *     source id);
 *   - if no match, raises a `reconciliationFlags` row with reason
 *     'no_local_payment' / 'no_local_payout' so an admin can investigate;
 *   - if found, sanity-checks amount and currency and flags
 *     'amount_mismatch' / 'currency_mismatch' if they diverge;
 *   - persists the cursor so the next run resumes from where we stopped
 *     (no double-processing).
 *
 * No money is moved here — flagging only. Admin acts on the flags through
 * AdminFinanceScreen (force release, manual refund, etc.).
 */

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { getStripe, stripeEnv } from "./stripeClient";
import { stripeModeValidator } from "./schema";
import type { StripeMode } from "./_stripeEnv";
import { classifyOrphanCharge, shouldAttemptRemediation } from "./_reconciliationRules";

// Bi-modal: se reconcilia cada modo con clave configurada, con su propio
// cursor (`scope = stripe-bt:<mode>`). El cliente se resuelve perezosamente.
const cursorScope = (mode: StripeMode) => `stripe-bt:${mode}`;

// ---------------------------------------------------------------------------
// Cursor helpers (single-row table keyed by `scope='stripe-bt'`)
// ---------------------------------------------------------------------------

export const internalGetCursor = internalQuery({
    args: { mode: stripeModeValidator },
    handler: async (ctx, args): Promise<{ id: string; lastBt: string | null } | null> => {
        const row = await ctx.db
            .query("reconciliationCursor")
            .withIndex("by_scope", (q) => q.eq("scope", cursorScope(args.mode)))
            .first();
        if (!row) return null;
        return {
            id: String(row._id),
            lastBt: (row as any).lastBalanceTransactionId ?? null,
        };
    },
});

export const internalUpsertCursor = internalMutation({
    args: {
        mode: stripeModeValidator,
        lastBalanceTransactionId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("reconciliationCursor")
            .withIndex("by_scope", (q) => q.eq("scope", cursorScope(args.mode)))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                lastBalanceTransactionId: args.lastBalanceTransactionId,
                lastRunAt: new Date().toISOString(),
                runsCompleted: ((existing as any).runsCompleted ?? 0) + 1,
            });
        } else {
            await ctx.db.insert("reconciliationCursor", {
                scope: cursorScope(args.mode),
                lastBalanceTransactionId: args.lastBalanceTransactionId,
                lastRunAt: new Date().toISOString(),
                runsCompleted: 1,
            });
        }
    },
});

// ---------------------------------------------------------------------------
// Local lookup helpers — used to cross-reference Stripe BTs against our DB.
// ---------------------------------------------------------------------------

export const internalFindPaymentByPI = internalQuery({
    args: { stripePaymentIntentId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("payments")
            .withIndex("by_stripe_intent", (q) =>
                q.eq("stripePaymentIntentId", args.stripePaymentIntentId),
            )
            .first();
    },
});

export const internalFindPayoutByTransfer = internalQuery({
    args: { stripeTransferId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("payouts")
            .withIndex("by_stripe_transfer", (q) =>
                q.eq("stripeTransferId", args.stripeTransferId),
            )
            .first();
    },
});

export const internalFlagAlreadyExists = internalQuery({
    args: { stripeBalanceTransactionId: v.string() },
    handler: async (ctx, args) => {
        const row = await ctx.db
            .query("reconciliationFlags")
            .withIndex("by_stripe_bt", (q) =>
                q.eq("stripeBalanceTransactionId", args.stripeBalanceTransactionId),
            )
            .first();
        return !!row;
    },
});

export const internalCreateFlag = internalMutation({
    args: {
        stripeBalanceTransactionId: v.string(),
        sourceType: v.string(),
        sourceId: v.optional(v.string()),
        relatedPaymentId: v.optional(v.string()),
        relatedPayoutId: v.optional(v.string()),
        reason: v.string(),
        amountInCents: v.number(),
        currency: v.string(),
        mode: v.optional(stripeModeValidator),
    },
    handler: async (ctx, args) => {
        // Idempotent: don't double-flag the same BT id.
        const exists = await ctx.db
            .query("reconciliationFlags")
            .withIndex("by_stripe_bt", (q) =>
                q.eq("stripeBalanceTransactionId", args.stripeBalanceTransactionId),
            )
            .first();
        if (exists) return;

        await ctx.db.insert("reconciliationFlags", {
            stripeBalanceTransactionId: args.stripeBalanceTransactionId,
            sourceType: args.sourceType,
            sourceId: args.sourceId,
            relatedPaymentId: args.relatedPaymentId,
            relatedPayoutId: args.relatedPayoutId,
            reason: args.reason,
            amountInCents: args.amountInCents,
            currency: args.currency,
            mode: args.mode,
            status: "open",
            createdAt: new Date().toISOString(),
        });
    },
});

// ---------------------------------------------------------------------------
// internalReconcileStripeBalanceTransactions — daily cron entry point.
// ---------------------------------------------------------------------------

export const internalReconcileStripeBalanceTransactions = internalAction({
    args: {
        // Optional override for manual runs. Defaults to 200 entries per
        // run; daily volume should stay below this for the foreseeable
        // future. For backfills, raise it temporarily via the dashboard.
        maxEntries: v.optional(v.number()),
        mode: v.optional(stripeModeValidator),
        /** Margen antes de juzgar un cobro sin orden. Bajarlo sirve para probar. */
        graceSeconds: v.optional(v.number()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ scanned: number; flagged: number; remediated: number }> => {
        const modes: StripeMode[] = args.mode ? [args.mode] : stripeEnv().availableModes;
        let scanned = 0;
        let flagged = 0;
        let remediated = 0;
        for (const mode of modes) {
            const r = await reconcileMode(ctx, mode, args.maxEntries, args.graceSeconds);
            scanned += r.scanned;
            flagged += r.flagged;
            remediated += r.remediated;
        }
        return { scanned, flagged, remediated };
    },
});

async function reconcileMode(
    ctx: any,
    mode: StripeMode,
    maxEntries?: number,
    graceSeconds?: number,
): Promise<{ scanned: number; flagged: number; remediated: number }> {
    {
        const stripe = getStripe(mode);
        const max = Math.min(maxEntries ?? 200, 1000);

        const cursor: { id: string; lastBt: string | null } | null =
            await ctx.runQuery(internal.reconciliation.internalGetCursor, { mode });
        const startingAfter = cursor?.lastBt ?? undefined;

        let scanned = 0;
        let flagged = 0;
        let remediated = 0;
        let lastSeenId: string | undefined = startingAfter;

        try {
            // Stripe API is paginated; we walk forward in batches of 100.
            const list = await stripe.balanceTransactions.list({
                limit: Math.min(max, 100),
                starting_after: startingAfter,
            });

            for (const bt of list.data) {
                scanned++;
                lastSeenId = bt.id;
                const sourceId =
                    typeof bt.source === "string" ? bt.source : bt.source?.id;

                // Cheap idempotency check — skip if we've flagged this BT id
                // already (we don't re-process flagged rows).
                const already: boolean = await ctx.runQuery(
                    internal.reconciliation.internalFlagAlreadyExists,
                    { stripeBalanceTransactionId: bt.id },
                );
                if (already) continue;

                // Charge / refund → look up the underlying PaymentIntent.
                if (
                    (bt.type === "charge" ||
                        bt.type === "refund" ||
                        bt.type === "payment") &&
                    sourceId
                ) {
                    // For a Charge, retrieve to grab payment_intent id.
                    let paymentIntentId: string | null = null;
                    try {
                        const charge = await stripe.charges.retrieve(sourceId);
                        paymentIntentId =
                            typeof charge.payment_intent === "string"
                                ? charge.payment_intent
                                : (charge.payment_intent as any)?.id ?? null;
                    } catch {
                        // For refunds, source is a refund id, not a charge.
                        try {
                            const refund = await stripe.refunds.retrieve(sourceId);
                            const chargeId =
                                typeof refund.charge === "string"
                                    ? refund.charge
                                    : (refund.charge as any)?.id;
                            if (chargeId) {
                                const ch = await stripe.charges.retrieve(chargeId);
                                paymentIntentId =
                                    typeof ch.payment_intent === "string"
                                        ? ch.payment_intent
                                        : (ch.payment_intent as any)?.id ?? null;
                            }
                        } catch {
                            // Best-effort — fall through to "no match" flag below.
                        }
                    }

                    if (paymentIntentId) {
                        const local: any = await ctx.runQuery(
                            internal.reconciliation.internalFindPaymentByPI,
                            { stripePaymentIntentId: paymentIntentId },
                        );
                        if (!local) {
                            await ctx.runMutation(
                                internal.reconciliation.internalCreateFlag,
                                {
                                    stripeBalanceTransactionId: bt.id,
                                    mode,
                                    sourceType: bt.type,
                                    sourceId,
                                    reason: "no_local_payment",
                                    amountInCents: bt.amount,
                                    currency: bt.currency,
                                },
                            );
                            flagged++;
                            continue;
                        }
                        /**
                         * Cobrado y sin orden. Dos causas distintas, ver
                         * `_reconciliationRules.ts`: el pago marcado como
                         * cobrado que falló creando órdenes, y el que quedó
                         * `pending` porque el webhook nunca llegó (E-140) —
                         * este último se colaba entre las tres reglas.
                         */
                        const verdict = classifyOrphanCharge({
                            btType: bt.type,
                            btCreatedSec: bt.created,
                            nowSec: Math.floor(Date.now() / 1000),
                            localStatus: local.status,
                            hasOrder: !!local.orderId,
                            graceSeconds,
                        });

                        if (verdict.kind !== "ok" && verdict.kind !== "too_soon") {
                            // Antes de alarmar, intentar recuperarlo solo: es
                            // la misma jugada que reenviar el evento desde el
                            // Dashboard, y el handler es idempotente.
                            let recovered = false;
                            if (shouldAttemptRemediation(verdict)) {
                                try {
                                    await ctx.runAction(
                                        internal.stripe.internalHandlePaymentIntentSucceeded,
                                        { mode, paymentIntentId },
                                    );
                                    const after: any = await ctx.runQuery(
                                        internal.reconciliation.internalFindPaymentByPI,
                                        { stripePaymentIntentId: paymentIntentId },
                                    );
                                    recovered = !!after?.orderId;
                                    if (recovered) {
                                        remediated++;
                                        console.log(
                                            `[Reconciliación ${mode}] ${paymentIntentId} recuperado: el webhook nunca había llegado.`,
                                        );
                                    }
                                } catch (err: any) {
                                    console.error(
                                        `[Reconciliación ${mode}] Falló recuperar ${paymentIntentId}: ${err?.message ?? err}`,
                                    );
                                }
                            }

                            // Sólo se alarma si el reintento no alcanzó.
                            if (!recovered) {
                                await ctx.runMutation(
                                    internal.reconciliation.internalCreateFlag,
                                    {
                                        stripeBalanceTransactionId: bt.id,
                                        mode,
                                        sourceType: bt.type,
                                        sourceId,
                                        relatedPaymentId: String(local._id),
                                        reason: verdict.kind,
                                        amountInCents: bt.amount,
                                        currency: bt.currency,
                                    },
                                );
                                flagged++;
                            }
                        }

                        // Amount sanity check — Stripe BT.amount is in cents.
                        // local.amount is in USD (float). Coerce to cents.
                        const localCents = local.amountCents ?? Math.round(local.amount * 100);
                        if (
                            bt.type === "charge" &&
                            Math.abs(bt.amount - localCents) > 1
                        ) {
                            await ctx.runMutation(
                                internal.reconciliation.internalCreateFlag,
                                {
                                    stripeBalanceTransactionId: bt.id,
                                    mode,
                                    sourceType: bt.type,
                                    sourceId,
                                    relatedPaymentId: String(local._id),
                                    reason: "amount_mismatch",
                                    amountInCents: bt.amount,
                                    currency: bt.currency,
                                },
                            );
                            flagged++;
                        }
                    } else {
                        // No PI we could resolve — flag as orphan.
                        await ctx.runMutation(
                            internal.reconciliation.internalCreateFlag,
                            {
                                stripeBalanceTransactionId: bt.id,
                                    mode,
                                sourceType: bt.type,
                                sourceId,
                                reason: "no_payment_intent",
                                amountInCents: bt.amount,
                                currency: bt.currency,
                            },
                        );
                        flagged++;
                    }
                    continue;
                }

                // Transfer → look up local payout.
                if (bt.type === "transfer" && sourceId) {
                    const local: any = await ctx.runQuery(
                        internal.reconciliation.internalFindPayoutByTransfer,
                        { stripeTransferId: sourceId },
                    );
                    if (!local) {
                        await ctx.runMutation(
                            internal.reconciliation.internalCreateFlag,
                            {
                                stripeBalanceTransactionId: bt.id,
                                    mode,
                                sourceType: bt.type,
                                sourceId,
                                reason: "no_local_payout",
                                amountInCents: bt.amount,
                                currency: bt.currency,
                            },
                        );
                        flagged++;
                    }
                    continue;
                }

                // Stripe-side adjustments / disputes / fees with no local
                // counterpart — flag for visibility but mark as low severity
                // (the operator may resolve them as "ignored" once reviewed).
                if (
                    bt.type === "adjustment" ||
                    bt.type === "stripe_fee" ||
                    bt.type === "application_fee"
                ) {
                    await ctx.runMutation(
                        internal.reconciliation.internalCreateFlag,
                        {
                            stripeBalanceTransactionId: bt.id,
                                    mode,
                            sourceType: bt.type,
                            sourceId: sourceId ?? undefined,
                            reason: `stripe_${bt.type}`,
                            amountInCents: bt.amount,
                            currency: bt.currency,
                        },
                    );
                    flagged++;
                    continue;
                }
            }
        } catch (error: any) {
            console.error("[Reconciliation] cron run error:", error);
            // Persist whatever we had so the next run doesn't re-walk
            // already-processed rows.
        }

        await ctx.runMutation(internal.reconciliation.internalUpsertCursor, {
            mode,
            lastBalanceTransactionId: lastSeenId,
        });

        console.log(
            `[Reconciliation ${mode}] scanned=${scanned} flagged=${flagged} recuperados=${remediated} cursor=${lastSeenId ?? "—"}`,
        );
        return { scanned, flagged, remediated };
    }
}
