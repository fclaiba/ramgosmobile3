/**
 * commerce.ts — Social commerce: turning a post into a real purchase.
 *
 * Backend for the `CommerceTag` on a post (docs/DISEÑO_RED_SOCIAL_COMMERCE.md).
 *
 * IMPORTANT — the feed does NOT charge anyone. Tapping the tag adds the real
 * listing to the marketplace cart and the buyer continues through the normal
 * cart → checkout flow. These are real products in `listings`, so they must go
 * through the one path that already handles stock, shipping, escrow, disputes
 * and multi-vendor splits. A parallel "pay inside the feed" flow would be a
 * second payment path, which Fase 5 explicitly forbids.
 *
 * What this module owns:
 *
 *   1. `addPostProductToCart` — validates the post's product and stamps the
 *      creator's attribution onto the cart item.
 *   2. Attribution — the post author's `referralCode` is resolved SERVER-SIDE
 *      and written into `cart.snapshot.referralCode`. It rides along to
 *      `stripe.createPaymentIntent`, where the existing engine
 *      (`campaigns.internalResolveCartAttribution`) decides the actual
 *      commission: active campaign → openPromotion → whitelist. A creator with
 *      no agreement earns 0, same rule as every other channel.
 *   3. `socialPostSales` — written at order creation from
 *      `cart.snapshot.sourcePostId`, so creators can see which post produced
 *      which sale. It is an analytics view, never the source of truth for
 *      money (that stays `payments` / `payouts`).
 */

import { v } from 'convex/values';
import {
    query,
    mutation,
    internalQuery,
    internalMutation,
} from './_generated/server';
import { internal } from './_generated/api';
import { requireActor } from './authHelpers';
import { applyAddToCart } from './cart';

const NOW = () => new Date().toISOString();

/** Platform take rate — matches the cart flow default in convex/stripe.ts. */
const PLATFORM_COMMISSION_RATE = 0.12;

// ---------------------------------------------------------------------------
// Offer — what the post's CommerceTag / preview sheet renders
// ---------------------------------------------------------------------------

/**
 * Live state of the product attached to a post, priced from `listings` (never
 * from the post snapshot, which can be stale).
 */
export const getPostCommerceOffer = query({
    args: {
        sessionToken: v.optional(v.string()),
        postId: v.id('socialPosts'),
        quantity: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await requireActor(ctx, args.sessionToken);
        } catch {
            return { available: false as const, reason: 'auth' as const };
        }

        const post = await ctx.db.get(args.postId);
        if (!post || post.deletedAt) {
            return { available: false as const, reason: 'post_not_found' as const };
        }

        const rawListingId = post.commercialProduct?.listingId;
        const listingId = rawListingId ? ctx.db.normalizeId('listings', rawListingId) : null;
        const listing = listingId ? await ctx.db.get(listingId) : null;
        if (!listing) {
            return { available: false as const, reason: 'no_product' as const };
        }
        if (listing.status !== 'active') {
            return { available: false as const, reason: 'inactive' as const };
        }

        const quantity = Math.max(1, Math.floor(args.quantity ?? 1));
        const tracksStock = listing.type === 'product' || listing.type === 'bono';
        if (tracksStock && listing.stock < quantity) {
            return { available: false as const, reason: 'out_of_stock' as const };
        }
        if (listing.sellerId === actor.idString) {
            return { available: false as const, reason: 'own_product' as const };
        }

        const creatorProfile = await ctx.db
            .query('socialUsers')
            .withIndex('by_user', (q) => q.eq('userId', post.authorUserId))
            .first();

        return {
            available: true as const,
            postId: String(post._id),
            listingId: String(listing._id),
            title: listing.title,
            description: listing.description,
            image:
                listing.images?.find((i: any) => i.isPrimary)?.url ??
                listing.images?.[0]?.url ??
                listing.image ??
                listing.gallery?.[0],
            type: listing.type,
            priceUsd: listing.price,
            discountPercent: listing.discountPercent ?? 0,
            stock: listing.stock,
            quantity,
            creator: creatorProfile
                ? {
                      userId: post.authorUserId,
                      username: creatorProfile.username,
                      displayName: creatorProfile.displayName,
                      avatar: creatorProfile.avatar,
                      verified: creatorProfile.verified === true,
                  }
                : null,
        };
    },
});

// ---------------------------------------------------------------------------
// Add to cart — the only action the feed performs
// ---------------------------------------------------------------------------

/** Resolves the promoter's referral code without trusting the client. */
export const internalGetPostAttribution = internalQuery({
    args: { postId: v.id('socialPosts') },
    handler: async (ctx, args) => {
        const post = await ctx.db.get(args.postId);
        if (!post || post.deletedAt) return null;

        const rawListingId = post.commercialProduct?.listingId;
        if (!rawListingId) return null;

        const listingId = ctx.db.normalizeId('listings', rawListingId);
        const listing = listingId ? await ctx.db.get(listingId) : null;
        if (!listing) return null;

        const creatorNormId = ctx.db.normalizeId('users', post.authorUserId);
        const creator = creatorNormId ? await ctx.db.get(creatorNormId) : null;

        return {
            listingId: String(listing._id),
            listingStatus: listing.status,
            listingType: listing.type,
            listingStock: listing.stock,
            sellerId: listing.sellerId,
            creatorUserId: post.authorUserId,
            creatorReferralCode: (creator as any)?.referralCode ?? undefined,
        };
    },
});

/**
 * Puts the post's product in the buyer's marketplace cart, tagged with the
 * creator's attribution. The client then navigates to the cart — no payment
 * happens in the feed.
 */
export const addPostProductToCart = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        postId: v.id('socialPosts'),
        quantity: v.optional(v.number()),
        mutationKey: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{
        success: boolean;
        listingId: string;
        quantity: number;
        creatorUserId: string;
    }> => {
        const actor = await requireActor(ctx, args.sessionToken);

        const attribution: any = await ctx.runQuery(
            internal.commerce.internalGetPostAttribution,
            { postId: args.postId },
        );
        if (!attribution) {
            throw new Error('Este post no tiene un producto disponible.');
        }
        if (attribution.listingStatus !== 'active') {
            throw new Error('El producto ya no está disponible.');
        }
        if (attribution.sellerId === actor.idString) {
            throw new Error('No podés comprar tu propio producto.');
        }

        const quantity = Math.max(1, Math.floor(args.quantity ?? 1));
        const tracksStock =
            attribution.listingType === 'product' || attribution.listingType === 'bono';
        if (tracksStock && attribution.listingStock < quantity) {
            throw new Error('No hay stock suficiente.');
        }

        // `applyAddToCart` re-reads the listing and builds the snapshot itself,
        // so the price is never taken from the post or from the client. The
        // referral code comes from the resolved post author, never from args.
        await applyAddToCart(ctx, actor.idString, {
            listingId: attribution.listingId,
            quantity,
            mutationKey: args.mutationKey,
            attribution: {
                referralCode: attribution.creatorReferralCode,
                sourcePostId: String(args.postId),
            },
        });

        return {
            success: true,
            listingId: attribution.listingId,
            quantity,
            creatorUserId: attribution.creatorUserId,
        };
    },
});

// ---------------------------------------------------------------------------
// Attribution recording (called at order creation, from the cart flow)
// ---------------------------------------------------------------------------

/**
 * Records one `socialPostSales` row per cart item that came from a post.
 * Called by `stripe.internalCreateSubOrder` once the order exists, so the
 * social ledger only ever reflects orders that were really created.
 */
export const internalRecordSocialSalesForOrder = internalMutation({
    args: {
        orderId: v.string(),
        buyerUserId: v.string(),
        sellerId: v.string(),
        stripePaymentIntentId: v.string(),
        items: v.array(v.object({
            listingId: v.string(),
            sourcePostId: v.string(),
            quantity: v.number(),
            grossCents: v.number(),
        })),
    },
    handler: async (ctx, args) => {
        if (args.items.length === 0) return { recorded: 0 };

        const payment = await ctx.db
            .query('payments')
            .withIndex('by_stripe_intent', (q) =>
                q.eq('stripePaymentIntentId', args.stripePaymentIntentId),
            )
            .first();

        let recorded = 0;
        for (const item of args.items) {
            const postId = ctx.db.normalizeId('socialPosts', item.sourcePostId);
            const post = postId ? await ctx.db.get(postId) : null;
            if (!post) continue;

            // Idempotency: a replayed webhook must not double-count a sale.
            const existing = await ctx.db
                .query('socialPostSales')
                .withIndex('by_intent', (q) =>
                    q.eq('stripePaymentIntentId', args.stripePaymentIntentId),
                )
                .collect();
            if (existing.some((s) => s.postId === item.sourcePostId)) continue;

            // Mirror the split the payment row actually recorded; only credit
            // the creator when the attribution engine resolved them.
            const creatorCommissionCents =
                payment && payment.influencerId === post.authorUserId
                    ? Math.round((payment.influencerAmount ?? 0) * 100)
                    : 0;
            const platformCommissionCents = Math.round(
                item.grossCents * PLATFORM_COMMISSION_RATE,
            );

            await ctx.db.insert('socialPostSales', {
                postId: item.sourcePostId,
                creatorUserId: post.authorUserId,
                sellerId: args.sellerId,
                buyerUserId: args.buyerUserId,
                listingId: item.listingId,
                orderId: args.orderId,
                stripePaymentIntentId: args.stripePaymentIntentId,
                quantity: item.quantity,
                grossCents: item.grossCents,
                creatorCommissionCents,
                platformCommissionCents,
                sellerNetCents:
                    item.grossCents - platformCommissionCents - creatorCommissionCents,
                status: 'paid',
                createdAt: NOW(),
                settledAt: NOW(),
            });
            recorded += 1;

            if (creatorCommissionCents > 0 && post.authorUserId !== args.sellerId) {
                await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                    sendEmail: false,
                    userId: post.authorUserId,
                    title: 'Comisión generada',
                    body: `Tu post generó una venta. Ganaste $${(
                        creatorCommissionCents / 100
                    ).toFixed(2)} de comisión.`,
                    category: 'payment',
                    data: { orderId: args.orderId, postId: item.sourcePostId },
                });
            }
        }

        return { recorded };
    },
});

// ---------------------------------------------------------------------------
// Analytics — "cuánta plata me dio cada post"
// ---------------------------------------------------------------------------

/**
 * Per-post performance for the creator. Restricted to the post author (and
 * admins) — revenue is not public.
 */
export const getPostAnalytics = query({
    args: {
        sessionToken: v.optional(v.string()),
        postId: v.id('socialPosts'),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        const post = await ctx.db.get(args.postId);
        if (!post) throw new Error('Post no encontrado.');

        const isAuthor = post.authorUserId === actor.idString;
        const isAdmin = actor.role === 'admin' || actor.role === 'developer';
        if (!isAuthor && !isAdmin) throw new Error('No autorizado.');

        const sales = await ctx.db
            .query('socialPostSales')
            .withIndex('by_post', (q) => q.eq('postId', String(args.postId)))
            .take(500);

        const paid = sales.filter((s) => s.status === 'paid');
        const revenueCents = paid.reduce((sum, s) => sum + s.grossCents, 0);
        const commissionCents = paid.reduce(
            (sum, s) => sum + s.creatorCommissionCents,
            0,
        );

        const views = post.viewCount ?? 0;
        return {
            postId: String(args.postId),
            views,
            likes: post.likeCount ?? 0,
            comments: post.commentCount ?? 0,
            retweets: post.retweetCount ?? 0,
            sales: paid.length,
            revenueUsd: revenueCents / 100,
            creatorEarningsUsd: commissionCents / 100,
            // The metric the algorithm rewards: sales per impression.
            conversionRate: views > 0 ? paid.length / views : 0,
        };
    },
});

/**
 * Roll-up across every post the creator has monetised, plus the per-post
 * breakdown the Creator Studio dashboard lists.
 */
export const getCreatorCommerceDashboard = query({
    args: {
        sessionToken: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);

        const sales = await ctx.db
            .query('socialPostSales')
            .withIndex('by_creator', (q) => q.eq('creatorUserId', actor.idString))
            .take(1000);

        const paid = sales.filter((s) => s.status === 'paid');

        const byPost = new Map<
            string,
            { sales: number; revenueCents: number; earningsCents: number }
        >();
        for (const sale of paid) {
            const current = byPost.get(sale.postId) ?? {
                sales: 0,
                revenueCents: 0,
                earningsCents: 0,
            };
            byPost.set(sale.postId, {
                sales: current.sales + 1,
                revenueCents: current.revenueCents + sale.grossCents,
                earningsCents: current.earningsCents + sale.creatorCommissionCents,
            });
        }

        const cap = Math.min(args.limit ?? 20, 50);
        const topPosts = await Promise.all(
            Array.from(byPost.entries())
                .sort((a, b) => b[1].earningsCents - a[1].earningsCents)
                .slice(0, cap)
                .map(async ([postId, stats]) => {
                    const id = ctx.db.normalizeId('socialPosts', postId);
                    const post = id ? await ctx.db.get(id) : null;
                    return {
                        postId,
                        content: post?.content?.slice(0, 140) ?? '',
                        image: post?.images?.[0] ?? post?.commercialProduct?.image,
                        productName: post?.commercialProduct?.name,
                        views: post?.viewCount ?? 0,
                        likes: post?.likeCount ?? 0,
                        sales: stats.sales,
                        revenueUsd: stats.revenueCents / 100,
                        earningsUsd: stats.earningsCents / 100,
                    };
                }),
        );

        return {
            totalSales: paid.length,
            totalRevenueUsd: paid.reduce((sum, s) => sum + s.grossCents, 0) / 100,
            totalEarningsUsd:
                paid.reduce((sum, s) => sum + s.creatorCommissionCents, 0) / 100,
            pendingSales: 0,
            topPosts,
        };
    },
});

/** Purchases the viewer made from posts — "mis compras desde el feed". */
export const getMySocialPurchases = query({
    args: {
        sessionToken: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        const rows = await ctx.db
            .query('socialPostSales')
            .withIndex('by_buyer', (q) => q.eq('buyerUserId', actor.idString))
            .order('desc')
            .take(Math.min(args.limit ?? 25, 50));

        return rows.map((r) => ({
            postId: r.postId,
            orderId: r.orderId,
            listingId: r.listingId,
            quantity: r.quantity,
            totalUsd: r.grossCents / 100,
            status: r.status,
            createdAt: r.createdAt,
        }));
    },
});
