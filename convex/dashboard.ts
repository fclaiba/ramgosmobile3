import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireActor, assertSelfOrAdmin } from "./authHelpers";

// ponytail: métricas financieras privadas (revenue/balance). Solo el propio dueño o un admin
// pueden verlas — se exige sessionToken y se valida con assertSelfOrAdmin (cierra el IDOR).
export const getBusinessMetrics = query({
  args: { businessId: v.id("users"), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.sessionToken);
    assertSelfOrAdmin(actor, args.businessId);

    // 1. Get listings (coupons, events, etc.)
    const listings = await ctx.db
      .query("listings")
      .withIndex("by_seller", (q) => q.eq("sellerId", args.businessId))
      .collect();

    const activeCoupons = listings.filter((l) => l.type === 'bono' && l.status === 'active');

    // 2. Get wallet balance
    let availableBalance = 0;
    let pendingBalance = 0;

    // We try to get the wallet account
    const wallet = await ctx.db
      .query("walletAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.businessId))
      .first();

    if (wallet) {
      availableBalance = wallet.balanceAvailable;
      pendingBalance = wallet.balancePending;
    } else {
        // Fallback to old user balance if wallet is not present
        const user = await ctx.db.get(args.businessId);
        availableBalance = user?.balance || 0;
    }

    // 3. Get redemptions for today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const redemptions = await ctx.db
      .query("bonoRedemptions")
      .withIndex("by_seller", (q) => q.eq("sellerId", args.businessId))
      .collect();

    const redeemedToday = redemptions.filter(r => r.status === 'redeemed' && r.redeemedAt && r.redeemedAt >= todayIso).length;
    const totalRedemptions = redemptions.filter(r => r.status === 'redeemed').length;

    // 4. Calculate total revenue (completed orders)
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_seller", (q) => q.eq("sellerId", args.businessId))
      .collect();

    const successfulPayments = payments.filter(p => p.status === 'succeeded' || p.status === 'released_to_seller');

    const revenueToday = successfulPayments
        .filter(p => p.createdAt >= todayIso)
        .reduce((sum, p) => sum + p.sellerNet, 0);

    const totalRevenue = successfulPayments.reduce((sum, p) => sum + p.sellerNet, 0);

    const uniqueCustomers = new Set(successfulPayments.map(p => p.userId)).size;

    return {
      summary: {
        totalCoupons: listings.filter(l => l.type === 'bono').length,
        activeCoupons: activeCoupons.length,
        redeemedToday,
        totalRedemptions,
        revenueToday,
        totalRevenue,
        availableBalance,
        pendingBalance,
        uniqueCustomers,
      },
      // Keep empty arrays for series for now, they can be calculated similarly if needed
      revenueSeries: [],
      couponLeaders: [],
    };
  },
});

export const getInfluencerMetrics = query({
  args: { influencerId: v.id("users"), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.sessionToken);
    assertSelfOrAdmin(actor, args.influencerId);

    // Campaigns
    const campaigns = await ctx.db
      .query("influencerCampaigns")
      .withIndex("by_influencer", (q) => q.eq("influencerId", args.influencerId))
      .collect();

    const activeCampaigns = campaigns.filter(c => c.status === 'active').length;

    // Wallet
    let availableBalance = 0;
    const wallet = await ctx.db
      .query("walletAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.influencerId))
      .first();

    if (wallet) {
      availableBalance = wallet.balanceAvailable;
    }

    // Payments attributed to this influencer
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_influencer", (q) => q.eq("influencerId", args.influencerId))
      .collect();

    const successfulPayments = payments.filter(p => p.status === 'succeeded' || p.status === 'released_to_seller');

    const sales = successfulPayments.length;
    const totalEarnings = successfulPayments.reduce((sum, p) => sum + p.influencerAmount, 0);

    // Recent earnings (últimos 7 días)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentEarnings = successfulPayments
      .filter(p => new Date(p.createdAt) >= sevenDaysAgo)
      .map(p => ({ amount: p.influencerAmount, date: p.createdAt }));

    return {
      totalEarnings,
      clicks: 0, // Mocked for now, needs analytics tracking
      sales,
      conversionRate: 0,
      activeCampaigns,
      recentEarnings,
    };
  },
});
