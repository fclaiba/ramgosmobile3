import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireActor } from "./authHelpers";

export const getDisputedOrEscrowOrders = query({
    args: {},
    handler: async (ctx) => {
        const actor = await requireActor(ctx);
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
    args: {},
    handler: async (ctx) => {
        const actor = await requireActor(ctx);
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

export const getRecentOrders = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx);
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
