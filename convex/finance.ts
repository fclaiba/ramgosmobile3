import { v } from "convex/values";
import { internalMutation, mutation, query, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
    assertAdminOrDeveloper,
    assertSelfOrAdmin,
    requireActor,
} from "./authHelpers";

// ---------------------------------------------------------------------------
// Wallet Accounts
// ---------------------------------------------------------------------------

export const ensureWalletAccount = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.string(),
        ownerType: v.union(
            v.literal("ramgos"),
            v.literal("business"),
            v.literal("influencer"),
            v.literal("consumer"),
        ),
        ownerName: v.string(),
        currency: v.optional(v.literal("USD")),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const existing = await ctx.db
            .query("walletAccounts")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .first();

        if (existing) return existing._id;

        return await ctx.db.insert("walletAccounts", {
            userId: args.userId,
            ownerType: args.ownerType,
            ownerName: args.ownerName,
            currency: args.currency ?? "USD",
            balanceAvailable: 0,
            balancePending: 0,
            balanceReserved: 0,
            lastUpdatedAt: new Date().toISOString(),
        });
    },
});

export const getWalletAccount = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await requireActor(ctx, (args as any).sessionToken);
        } catch {
            return null;
        }
        assertSelfOrAdmin(actor, args.userId);

        return await ctx.db
            .query("walletAccounts")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .first();
    },
});

export const internalCreditWallet = internalMutation({
    args: {
        userId: v.string(),
        bucket: v.union(v.literal("available"), v.literal("pending"), v.literal("reserved")),
        amount: v.number(),
    },
    handler: async (ctx, args) => {
        const account = await ctx.db
            .query("walletAccounts")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .first();
        if (!account) return;
        const patch: Record<string, number> = {};
        if (args.bucket === "available") patch.balanceAvailable = Math.max(0, account.balanceAvailable + args.amount);
        if (args.bucket === "pending") patch.balancePending = Math.max(0, account.balancePending + args.amount);
        if (args.bucket === "reserved") patch.balanceReserved = Math.max(0, account.balanceReserved + args.amount);
        patch.lastUpdatedAt = Date.now() as any;
        await ctx.db.patch(account._id, { ...patch, lastUpdatedAt: new Date().toISOString() });
    },
});

export const internalMovePendingToAvailable = internalMutation({
    args: { userId: v.string(), amount: v.number() },
    handler: async (ctx, args) => {
        const account = await ctx.db
            .query("walletAccounts")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .first();
        if (!account) return;
        await ctx.db.patch(account._id, {
            balancePending: Math.max(0, account.balancePending - args.amount),
            balanceAvailable: account.balanceAvailable + args.amount,
            lastUpdatedAt: new Date().toISOString(),
        });
    },
});

export const internalDebitWallet = internalMutation({
    args: {
        userId: v.string(),
        bucket: v.union(v.literal("available"), v.literal("pending"), v.literal("reserved")),
        amount: v.number(),
    },
    handler: async (ctx, args) => {
        const account = await ctx.db
            .query("walletAccounts")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .first();
        if (!account) return;
        const patch: Partial<{ balanceAvailable: number; balancePending: number; balanceReserved: number; lastUpdatedAt: string }> = {};
        if (args.bucket === "available") patch.balanceAvailable = Math.max(0, account.balanceAvailable - args.amount);
        if (args.bucket === "pending") patch.balancePending = Math.max(0, account.balancePending - args.amount);
        if (args.bucket === "reserved") patch.balanceReserved = Math.max(0, account.balanceReserved - args.amount);
        patch.lastUpdatedAt = new Date().toISOString();
        await ctx.db.patch(account._id, patch);
    },
});

// ---------------------------------------------------------------------------
// Payment Records
// ---------------------------------------------------------------------------

export const internalGetPaymentById = internalQuery({
    args: { paymentId: v.id("payments") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.paymentId);
    },
});

export const createPaymentRecord = internalMutation({
    args: {
        orderId: v.optional(v.string()),
        userId: v.string(),
        sellerId: v.optional(v.string()),
        stripePaymentIntentId: v.optional(v.string()),
        provider: v.string(),
        providerFee: v.number(),
        amount: v.number(),
        status: v.union(
            v.literal("pending"),
            v.literal("succeeded"),
            v.literal("succeeded_in_escrow"),
            v.literal("released_to_seller"),
            v.literal("failed"),
            v.literal("refunded"),
            v.literal("disputed"),
        ),
        sellerNet: v.number(),
        ramgosCommission: v.number(),
        influencerId: v.optional(v.string()),
        influencerAmount: v.number(),
        commissionRate: v.number(),
        influencerRate: v.number(),
        paymentMethodBrand: v.optional(v.string()),
        paymentMethodLast4: v.optional(v.string()),
        description: v.optional(v.string()),
        metadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("payments", {
            ...args,
            currency: "USD",
            createdAt: new Date().toISOString(),
        });
    },
});

export const updatePaymentStatus = internalMutation({
    args: {
        paymentId: v.id("payments"),
        status: v.union(
            v.literal("pending"),
            v.literal("succeeded"),
            v.literal("succeeded_in_escrow"),
            v.literal("released_to_seller"),
            v.literal("failed"),
            v.literal("refunded"),
            v.literal("disputed"),
        ),
        settledAt: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.paymentId, {
            status: args.status,
            settledAt: args.settledAt,
        });
    },
});

export const updatePaymentByIntentId = internalMutation({
    args: {
        stripePaymentIntentId: v.string(),
        status: v.union(
            v.literal("pending"),
            v.literal("succeeded"),
            v.literal("succeeded_in_escrow"),
            v.literal("released_to_seller"),
            v.literal("failed"),
            v.literal("refunded"),
            v.literal("disputed"),
        ),
        settledAt: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const payment = await ctx.db
            .query("payments")
            .withIndex("by_stripe_intent", (q) => q.eq("stripePaymentIntentId", args.stripePaymentIntentId))
            .first();
        if (!payment) return;
        await ctx.db.patch(payment._id, {
            status: args.status,
            settledAt: args.settledAt,
        });
    },
});

export const getPaymentsByUser = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await requireActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
        assertSelfOrAdmin(actor, args.userId);

        return await ctx.db
            .query("payments")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .order("desc")
            .collect();
    },
});

export const getPaymentsByOrder = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.string(),
        orderId: v.string(),
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await requireActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
        assertSelfOrAdmin(actor, args.userId);

        return await ctx.db
            .query("payments")
            .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
            .collect();
    },
});

// ---------------------------------------------------------------------------
// Payment Events (webhook idempotency)
// ---------------------------------------------------------------------------

export const recordPaymentEvent = internalMutation({
    args: {
        stripeEventId: v.string(),
        eventType: v.string(),
        payload: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("paymentEvents")
            .withIndex("by_stripe_event", (q) => q.eq("stripeEventId", args.stripeEventId))
            .first();
        if (existing) {
            return { alreadyProcessed: true, id: existing._id };
        }
        const id = await ctx.db.insert("paymentEvents", {
            stripeEventId: args.stripeEventId,
            eventType: args.eventType,
            processed: false,
            payload: args.payload,
            createdAt: new Date().toISOString(),
        });
        return { alreadyProcessed: false, id };
    },
});

export const markPaymentEventProcessed = internalMutation({
    args: {
        stripeEventId: v.string(),
        error: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("paymentEvents")
            .withIndex("by_stripe_event", (q) => q.eq("stripeEventId", args.stripeEventId))
            .first();
        if (!existing) return;
        await ctx.db.patch(existing._id, {
            processed: true,
            processedAt: new Date().toISOString(),
            error: args.error,
        });
    },
});

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export const createPayout = internalMutation({
    args: {
        paymentId: v.optional(v.string()),
        sellerId: v.string(),
        amountInCents: v.number(),
        destinationAccountId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("payouts", {
            paymentId: args.paymentId,
            sellerId: args.sellerId,
            amountInCents: args.amountInCents,
            destinationAccountId: args.destinationAccountId,
            currency: "USD",
            status: "pending",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
    },
});

export const updatePayoutStatus = internalMutation({
    args: {
        payoutId: v.id("payouts"),
        status: v.union(
            v.literal("pending"),
            v.literal("processing"),
            v.literal("completed"),
            v.literal("failed"),
        ),
        stripeTransferId: v.optional(v.string()),
        executedAt: v.optional(v.string()),
        error: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.payoutId, {
            status: args.status,
            stripeTransferId: args.stripeTransferId,
            executedAt: args.executedAt,
            error: args.error,
            updatedAt: new Date().toISOString(),
        });
    },
});

export const getPayoutsBySeller = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        sellerId: v.string(),
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await requireActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
        assertSelfOrAdmin(actor, args.sellerId);

        return await ctx.db
            .query("payouts")
            .withIndex("by_seller", (q) => q.eq("sellerId", args.sellerId))
            .order("desc")
            .collect();
    },
});

// ---------------------------------------------------------------------------
// Withdrawals
//
// DEPRECATED for sellers / influencers as of Sprint 6. The new flow is:
//   - Onboard via Stripe Connect V2 (convex/connect.ts).
//   - Stripe handles the actual money movement to the seller bank.
//   - On-demand payouts are triggered via `connect.requestInstantPayout`.
//   - Auto schedules are managed via `connect.updatePayoutSchedule`.
//
// This `createWithdrawal` mutation is retained for ADMIN-driven manual
// overrides only (e.g. a one-off bank transfer outside Stripe rails for a
// support case). Calls from a non-admin actor are rejected.
// ---------------------------------------------------------------------------

export const createWithdrawal = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.string(),
        amount: v.number(),
        destinationType: v.union(v.literal("bank"), v.literal("wallet")),
        destinationLabel: v.string(),
        notes: v.optional(v.string()),
        metadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        // Sprint 6: lock to admin / developer. Sellers + influencers must
        // use the Stripe Connect payout flow exposed in convex/connect.ts.
        const role = (actor as any).role;
        if (role !== "admin" && role !== "developer") {
            throw new Error(
                "Esta operación está deprecada. Usa Stripe Connect (requestInstantPayout) para mover fondos.",
            );
        }
        assertSelfOrAdmin(actor, args.userId);

        if (args.amount <= 0) throw new Error("El monto del retiro debe ser mayor a 0.");

        // Check user KYC
        const userNormId = ctx.db.normalizeId("users", args.userId);
        if (userNormId) {
            const user = await ctx.db.get(userNormId);
            if (!user || user.kycStatus !== "approved") {
                throw new Error("Se requiere KYC aprobado para retirar fondos.");
            }
        }

        // Check available balance in wallet
        const wallet = await ctx.db
            .query("walletAccounts")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .first();
        if (!wallet || wallet.balanceAvailable < args.amount) {
            throw new Error("Saldo disponible insuficiente para el retiro.");
        }

        // Move from available to reserved
        await ctx.db.patch(wallet._id, {
            balanceAvailable: Math.max(0, wallet.balanceAvailable - args.amount),
            balanceReserved: wallet.balanceReserved + args.amount,
            lastUpdatedAt: new Date().toISOString(),
        });

        const withdrawalId = await ctx.db.insert("withdrawals", {
            userId: args.userId,
            amount: args.amount,
            currency: "USD",
            status: "pending",
            destinationType: args.destinationType,
            destinationLabel: args.destinationLabel,
            notes: args.notes,
            metadata: args.metadata,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: args.userId,
            title: 'Solicitud de retiro recibida',
            body: `Recibimos tu pedido de $${args.amount.toFixed(2)} USD a ${args.destinationLabel}. Te avisamos cuando se procese.`,
            category: 'payment',
            data: { type: 'withdrawal_requested', withdrawalId: String(withdrawalId), amount: args.amount },
        });

        return withdrawalId;
    },
});

export const getWithdrawalsByUser = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await requireActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
        assertSelfOrAdmin(actor, args.userId);

        return await ctx.db
            .query("withdrawals")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .order("desc")
            .collect();
    },
});

export const updateWithdrawalStatus = internalMutation({
    args: {
        withdrawalId: v.id("withdrawals"),
        status: v.union(
            v.literal("pending"),
            v.literal("processing"),
            v.literal("approved"),
            v.literal("rejected"),
        ),
        processedAt: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const withdrawal = await ctx.db.get(args.withdrawalId);
        if (!withdrawal) return;

        // If rejected, return funds to available
        if (args.status === "rejected" && withdrawal.status !== "rejected") {
            const wallet = await ctx.db
                .query("walletAccounts")
                .withIndex("by_user", (q) => q.eq("userId", withdrawal.userId))
                .first();
            if (wallet) {
                await ctx.db.patch(wallet._id, {
                    balanceReserved: Math.max(0, wallet.balanceReserved - withdrawal.amount),
                    balanceAvailable: wallet.balanceAvailable + withdrawal.amount,
                    lastUpdatedAt: new Date().toISOString(),
                });
            }
        }

        await ctx.db.patch(args.withdrawalId, {
            status: args.status,
            processedAt: args.processedAt,
            updatedAt: new Date().toISOString(),
        });

        // Notify user on terminal transitions.
        if (args.status === 'approved' || args.status === 'rejected') {
            await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: withdrawal.userId,
                title: args.status === 'approved' ? 'Retiro procesado' : 'Retiro rechazado',
                body: args.status === 'approved'
                    ? `Tu retiro de $${withdrawal.amount.toFixed(2)} fue aprobado. Llega en 1-2 días hábiles.`
                    : `Tu retiro de $${withdrawal.amount.toFixed(2)} fue rechazado. Los fondos volvieron a tu balance disponible.`,
                category: 'payment',
                data: { type: `withdrawal_${args.status}`, withdrawalId: String(args.withdrawalId), amount: withdrawal.amount },
            });
        }
    },
});

// Internal helper to read a payout by ID (used by stripe actions)
export const getPayoutById = internalMutation({
    args: { payoutId: v.id("payouts") },
    handler: async (ctx, args) => ctx.db.get(args.payoutId),
});

// ===========================================================================
// Sprint 7 — Admin / reconciliation queries.
//
// All four queries are read-only and must be invoked by an admin or
// developer (see `assertAdminOrDeveloper`). They power AdminFinanceScreen
// in the mobile app and surface anything that needs human attention.
// ---------------------------------------------------------------------------

// 1) Failed transfers — payouts whose status is 'failed'. Each row points
//    back to a `payments` row so the admin can see the buyer + seller.
export const listFailedTransfers = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertAdminOrDeveloper(actor);

        const cap = Math.min(args.limit ?? 100, 500);
        return await ctx.db
            .query("payouts")
            .withIndex("by_status", (q) => q.eq("status", "failed"))
            .order("desc")
            .take(cap);
    },
});

// 2) Stuck escrows — orders that have been in escrow > 30d without a
//    `confirmReceipt`. We approximate "in escrow" as orders in
//    payment_received / awaiting_shipment / in_transit / delivered status
//    that have not flipped to completed yet.
export const listStuckEscrows = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        olderThanDays: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertAdminOrDeveloper(actor);

        const days = args.olderThanDays ?? 30;
        const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

        // Convex doesn't support OR filters across multiple status values
        // efficiently with a single index, so we collect the candidate
        // statuses one by one. This is bounded — the admin tooling caller
        // expects O(orders-not-completed), which is small in practice.
        const inEscrowStatuses = [
            "payment_received",
            "awaiting_shipment",
            "in_transit",
            "delivered",
        ] as const;

        const all = (
            await Promise.all(
                inEscrowStatuses.map((status) =>
                    ctx.db
                        .query("orders")
                        .filter((q) => q.eq(q.field("status"), status))
                        .collect(),
                ),
            )
        ).flat();

        return all
            .filter((o: any) => {
                const createdAt = (o._creationTime ?? 0) as number;
                return new Date(createdAt).toISOString() < cutoff;
            })
            .sort((a: any, b: any) => (a._creationTime ?? 0) - (b._creationTime ?? 0));
    },
});

// 3) Open disputes — payments flagged as 'disputed'.
export const listOpenDisputes = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertAdminOrDeveloper(actor);

        const cap = Math.min(args.limit ?? 100, 500);
        return await ctx.db
            .query("payments")
            .withIndex("by_status", (q) => q.eq("status", "disputed"))
            .order("desc")
            .take(cap);
    },
});

// 4) Pending refunds — payments where status='refunded' but we haven't
//    yet executed the corresponding transfer reversals (best-effort: we
//    don't yet model "reversal pending" explicitly so we surface anything
//    refunded in the last 7 days as a sanity bucket).
export const listPendingRefunds = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        windowDays: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertAdminOrDeveloper(actor);

        const cutoff = new Date(
            Date.now() - (args.windowDays ?? 7) * 86_400_000,
        ).toISOString();
        const refunded = await ctx.db
            .query("payments")
            .withIndex("by_status", (q) => q.eq("status", "refunded"))
            .order("desc")
            .take(500);

        return refunded.filter((p: any) => {
            const ts = p.settledAt ?? p.createdAt;
            return ts >= cutoff;
        });
    },
});

// 5) Reconciliation flags — discrepancies surfaced by the daily cron.
export const listReconciliationFlags = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        status: v.optional(
            v.union(
                v.literal("open"),
                v.literal("investigating"),
                v.literal("resolved"),
                v.literal("ignored"),
            ),
        ),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertAdminOrDeveloper(actor);

        const cap = Math.min(args.limit ?? 100, 500);
        if (args.status) {
            const status = args.status;
            return await ctx.db
                .query("reconciliationFlags")
                .withIndex("by_status", (q) => q.eq("status", status))
                .order("desc")
                .take(cap);
        }
        return await ctx.db.query("reconciliationFlags").order("desc").take(cap);
    },
});

// 6) Update reconciliation flag status (resolve / ignore / re-open).
export const updateReconciliationFlag = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        flagId: v.id("reconciliationFlags"),
        status: v.union(
            v.literal("open"),
            v.literal("investigating"),
            v.literal("resolved"),
            v.literal("ignored"),
        ),
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertAdminOrDeveloper(actor);

        await ctx.db.patch(args.flagId, {
            status: args.status,
            notes: args.notes,
            resolvedAt:
                args.status === "resolved" || args.status === "ignored"
                    ? new Date().toISOString()
                    : undefined,
        });
    },
});
