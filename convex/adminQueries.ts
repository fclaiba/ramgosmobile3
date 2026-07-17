import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireActor } from "./authHelpers";

export const getDisputedOrEscrowOrders = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        if (actor.role !== "admin" && actor.role !== "developer") {
            throw new Error("No autorizado");
        }

        const orders = await ctx.db
            .query("orders")
            .filter((q) => q.or(
                q.eq(q.field("status"), "paid_escrow"),
                q.eq(q.field("status"), "disputed")
            ))
            .order("desc")
            .take(50);

        return orders;
    }
});

export const getPlatformStats = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        if (actor.role !== "admin" && actor.role !== "developer") {
            throw new Error("No autorizado");
        }

        const allOrders = await ctx.db
            .query("orders")
            .order("desc")
            .take(5000);

        const totalSalesVolume = allOrders
            .filter(o => o.status === "completed" || o.status === "paid_escrow" || o.status === "payment_received")
            .reduce((sum, o) => sum + (o.total || 0), 0);

        const totalOrders = allOrders.length;
        const completedOrders = allOrders.filter(o => o.status === "completed").length;
        const disputedOrders = allOrders.filter(o => o.status === "disputed").length;
        const escrowHeldOrders = allOrders.filter(o => o.status === "paid_escrow" || o.status === "payment_received").length;
        const cancelledOrders = allOrders.filter(o => o.status === "cancelled").length;

        const uniqueBuyers = new Set(allOrders.map(o => o.userId));
        const uniqueSellers = new Set(allOrders.map(o => o.sellerId));

        const escrowHeldVolume = allOrders
            .filter(o => o.status === "paid_escrow" || o.status === "payment_received")
            .reduce((sum, o) => sum + (o.total || 0), 0);

        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);
        const recentOrders = allOrders.filter(o => new Date(o.createdAt) >= last30Days);
        const recentVolume = recentOrders.reduce((sum, o) => sum + (o.total || 0), 0);

        return {
            totalSalesVolume,
            totalOrders,
            completedOrders,
            disputedOrders,
            escrowHeldOrders,
            cancelledOrders,
            uniqueBuyers: uniqueBuyers.size,
            uniqueSellers: uniqueSellers.size,
            escrowHeldVolume,
            recentOrdersCount: recentOrders.length,
            recentVolume,
        };
    }
});

// ── Panel Admin: logs, sesiones y estado de hashes ──────────────────────────

const assertAdmin = (actor: { role: string }) => {
    if (actor.role !== "admin" && actor.role !== "developer") {
        throw new Error("No autorizado");
    }
};

export const getAuditLogs = query({
    args: {
        sessionToken: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdmin(actor);
        const cap = Math.min(args.limit ?? 100, 300);
        return await ctx.db.query("audit_logs").order("desc").take(cap);
    },
});

export const getSecurityOverview = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdmin(actor);

        const users = await ctx.db.query("users").collect();
        const hashTypeOf = (pw?: string) =>
            !pw ? "none" : pw.startsWith("hashed_") ? "legacy" : "bcrypt";

        const userHashes = users.map((u) => ({
            _id: u._id,
            email: u.email,
            name: u.name,
            role: u.role,
            isBanned: (u as any).isBanned ?? false,
            hashType: hashTypeOf(u.password),
        }));

        const counts = { legacy: 0, bcrypt: 0, none: 0 } as Record<string, number>;
        for (const u of userHashes) counts[u.hashType]++;

        const now = Date.now();
        const sessions = await ctx.db.query("sessions").order("desc").take(500);
        const activeSessions = sessions.filter((s) => !s.revokedAt && s.expiresAt > now);

        const rateLimits = await ctx.db.query("rateLimits").collect();
        const blockedNow = rateLimits.filter((r) => r.blockedUntil && r.blockedUntil > now);

        return {
            totalUsers: users.length,
            hashCounts: counts,
            userHashes,
            activeSessionCount: activeSessions.length,
            totalSessionCount: sessions.length,
            blockedRateLimits: blockedNow.map((r) => ({
                key: r.key,
                attempts: r.attempts,
                blockedUntil: r.blockedUntil,
            })),
        };
    },
});

export const getActiveSessions = query({
    args: {
        sessionToken: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdmin(actor);

        const now = Date.now();
        const cap = Math.min(args.limit ?? 100, 300);
        const sessions = await ctx.db.query("sessions").order("desc").take(cap);

        const rows = [];
        for (const s of sessions) {
            const normalizedId = ctx.db.normalizeId("users", s.userId);
            const user = normalizedId ? await ctx.db.get(normalizedId) : null;
            rows.push({
                _id: s._id,
                userId: s.userId,
                email: (user as any)?.email ?? "(desconocido)",
                role: (user as any)?.role ?? "?",
                createdAt: s.createdAt,
                expiresAt: s.expiresAt,
                revoked: !!s.revokedAt,
                expired: s.expiresAt <= now,
            });
        }
        return rows;
    },
});

export const getKycReviewQueue = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdmin(actor);

        const users = await ctx.db.query("users").collect();
        return users
            .filter((u) => u.kycStatus === "pending" || u.kycStatus === "unverified")
            .map((u) => ({
                _id: u._id,
                name: u.name,
                email: u.email,
                role: u.role,
                kycStatus: u.kycStatus ?? "unverified",
                joinedAt: u.joinedAt,
                verificationDocuments: u.verificationDocuments ?? [],
            }))
            .sort((a, b) => (b.joinedAt || "").localeCompare(a.joinedAt || ""));
    },
});

// ponytail: income derived from `payments` + `stripeSubscriptions` — no duplicate ledger table
const INCOME_PAYMENT_STATUSES = new Set([
    "succeeded",
    "succeeded_in_escrow",
    "released_to_seller",
]);

const sumPayments = (
    rows: { amount: number; ramgosCommission?: number; providerFee?: number; sellerNet?: number; influencerAmount?: number }[],
    pick: (p: (typeof rows)[0]) => number,
) => rows.reduce((s, p) => s + pick(p), 0);

export const getPlatformIncome = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdmin(actor);

        const payments = await ctx.db.query("payments").order("desc").take(5000);
        const counted = payments.filter((p) => INCOME_PAYMENT_STATUSES.has(p.status));

        const grossVolume = sumPayments(counted, (p) => p.amount);
        const platformCommission = sumPayments(counted, (p) => p.ramgosCommission ?? 0);
        const providerFees = sumPayments(counted, (p) => p.providerFee ?? 0);
        const sellerNet = sumPayments(counted, (p) => p.sellerNet ?? 0);
        const influencerShare = sumPayments(counted, (p) => p.influencerAmount ?? 0);

        const inEscrow = sumPayments(
            payments.filter((p) => p.status === "succeeded_in_escrow"),
            (p) => p.amount,
        );
        const refundedVolume = sumPayments(
            payments.filter((p) => p.status === "refunded"),
            (p) => p.amount,
        );

        const now = Date.now();
        const d30 = now - 30 * 86_400_000;
        const recent30 = counted.filter((p) => new Date(p.createdAt).getTime() >= d30);

        const series: { date: string; gross: number; commission: number; count: number }[] = [];
        for (let i = 13; i >= 0; i--) {
            const dayStart = new Date(now - i * 86_400_000);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = dayStart.getTime() + 86_400_000;
            const dayKey = dayStart.toISOString().slice(0, 10);
            const dayRows = counted.filter((p) => {
                const t = new Date(p.createdAt).getTime();
                return t >= dayStart.getTime() && t < dayEnd;
            });
            series.push({
                date: dayKey,
                gross: sumPayments(dayRows, (p) => p.amount),
                commission: sumPayments(dayRows, (p) => p.ramgosCommission ?? 0),
                count: dayRows.length,
            });
        }

        const byStatus: Record<string, number> = {};
        for (const p of payments) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;

        const subs = await ctx.db.query("stripeSubscriptions").collect();
        const activeSubs = subs.filter((s) => s.status === "active" || s.status === "trialing");
        const PRO_PRICE = 2.99;
        const BIZ_PRICE = 5.99;
        const estimatedMrr = activeSubs.reduce(
            (s, sub) => s + (sub.tier === "business" ? BIZ_PRICE : PRO_PRICE),
            0,
        );

        return {
            summary: {
                grossVolume,
                platformCommission,
                providerFees,
                netPlatform: platformCommission - providerFees,
                sellerNet,
                influencerShare,
                inEscrow,
                refundedVolume,
                disputedCount: payments.filter((p) => p.status === "disputed").length,
                commission30d: sumPayments(recent30, (p) => p.ramgosCommission ?? 0),
                gross30d: sumPayments(recent30, (p) => p.amount),
                transactionCount: counted.length,
                activeSubscriptions: activeSubs.length,
                estimatedMrr,
                proSubs: activeSubs.filter((s) => s.tier === "pro").length,
                businessSubs: activeSubs.filter((s) => s.tier === "business").length,
            },
            series,
            byStatus,
        };
    },
});

export const listIncomeLedger = query({
    args: {
        sessionToken: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdmin(actor);
        const cap = Math.min(args.limit ?? 250, 500);
        const payments = await ctx.db.query("payments").order("desc").take(cap);
        return payments.map((p) => ({
            _id: p._id,
            source: "marketplace" as const,
            status: p.status,
            gross: p.amount,
            commission: p.ramgosCommission ?? 0,
            providerFee: p.providerFee ?? 0,
            netPlatform: (p.ramgosCommission ?? 0) - (p.providerFee ?? 0),
            sellerNet: p.sellerNet ?? 0,
            influencerAmount: p.influencerAmount ?? 0,
            orderId: p.orderId,
            userId: p.userId,
            sellerId: p.sellerId,
            provider: p.provider,
            createdAt: p.createdAt,
            settledAt: p.settledAt,
            description: p.description,
            stripePaymentIntentId: p.stripePaymentIntentId,
        }));
    },
});

export const revokeSession = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdmin(actor);
        await ctx.db.patch(args.sessionId, { revokedAt: new Date().toISOString() });
        await ctx.db.insert("audit_logs", {
            actorUserId: actor.idString,
            action: "SESSION_REVOKED",
            timestamp: new Date().toISOString(),
            metadata: { sessionId: args.sessionId },
        });
        return { success: true };
    },
});

export const getRecentOrders = query({
    args: { 
        limit: v.optional(v.number()),
        sessionToken: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        if (actor.role !== "admin" && actor.role !== "developer") {
            throw new Error("No autorizado");
        }

        const limit = args.limit ?? 20;
        return await ctx.db
            .query("orders")
            .order("desc")
            .take(limit);
    }
});
