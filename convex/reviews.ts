import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { assertSelfOrAdmin, requireActor } from "./authHelpers";
import { internal } from "./_generated/api";

// PHASE 2: Reviews and Ratings

export const addReview = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        listingId: v.string(),
        userId: v.optional(v.string()),
        orderId: v.optional(v.string()),
        rating: v.number(), // 1-5
        title: v.optional(v.string()),
        comment: v.string(),
        images: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const targetUserId = args.userId ?? actor.idString;
        assertSelfOrAdmin(actor, targetUserId);
        // Validate rating
        if (args.rating < 1 || args.rating > 5) {
            throw new Error("Rating debe estar entre 1 y 5");
        }

        const userOrders = await ctx.db
            .query("orders")
            .withIndex("by_user", (q) => q.eq("userId", targetUserId))
            .collect();

        const eligibleOrders = userOrders.filter(order => 
            order.status !== 'pending' && 
            order.status !== 'cancelled' && 
            order.items.some(item => item.listingId === args.listingId)
        );

        if (eligibleOrders.length === 0) {
            throw new Error("Debes comprar este producto para poder reseñarlo");
        }

        const existingReviews = await ctx.db
            .query("reviews")
            .withIndex("by_user", (q) => q.eq("userId", targetUserId))
            .filter((q) => q.eq(q.field("listingId"), args.listingId))
            .collect();

        if (existingReviews.length >= eligibleOrders.length) {
            throw new Error("Ya has publicado una reseña por cada compra de este artículo");
        }

        const reviewedOrderIds = new Set(existingReviews.map(r => r.orderId).filter(Boolean));
        const unreviewedOrder = eligibleOrders.find(o => !reviewedOrderIds.has(o._id));
        const finalOrderId = args.orderId || (unreviewedOrder ? unreviewedOrder._id : eligibleOrders[0]._id);
        const verified = true;

        // Get user info
        const userId = ctx.db.normalizeId("users", targetUserId);
        let userName = "Usuario";
        let userAvatar: string | undefined;

        if (userId) {
            const user = await ctx.db.get(userId);
            if (user) {
                userName = user.name;
                userAvatar = user.avatar;
            }
        }

        // Insert review
        const reviewId = await ctx.db.insert("reviews", {
            listingId: args.listingId,
            orderId: finalOrderId,
            userId: targetUserId,
            userName,
            userAvatar,
            rating: args.rating,
            title: args.title,
            comment: args.comment,
            images: args.images,
            helpful: 0,
            verified,
            createdAt: new Date().toISOString(),
        });

        // Update listing's aggregated rating
        await updateListingRating(ctx, args.listingId);

        // Award 5 R Coins for the review
        await ctx.runMutation(internal.economy.applyPointsEventInternal, {
            userId: targetUserId,
            eventKey: `review_${reviewId}`,
            type: "earn",
            source: "bonus",
            amount: 5,
            description: "Recompensa por dejar una reseña",
        });

        return reviewId;
    },
});

// Helper function to recalculate listing rating
async function updateListingRating(ctx: any, listingId: string) {
    const allReviews = await ctx.db
        .query("reviews")
        .withIndex("by_listing", (q: any) => q.eq("listingId", listingId))
        .collect();

    if (allReviews.length === 0) return;

    const avgRating = allReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / allReviews.length;

    try {
        const normalizedId = ctx.db.normalizeId("listings", listingId);
        if (normalizedId) {
            await ctx.db.patch(normalizedId, {
                averageRating: avgRating,
                reviewCount: allReviews.length,
            });

            // Ponytail: Update Global Seller Rating Accumulator
            const listing = await ctx.db.get(normalizedId);
            if (listing && listing.sellerId) {
                const sellerListings = await ctx.db
                    .query("listings")
                    .withIndex("by_seller", (q: any) => q.eq("sellerId", listing.sellerId))
                    .collect();
                
                let totalReviews = 0;
                let sumRatings = 0;
                for (const l of sellerListings) {
                    if (l.reviewCount && l.averageRating) {
                        totalReviews += l.reviewCount;
                        sumRatings += (l.averageRating * l.reviewCount);
                    }
                }

                if (totalReviews > 0) {
                    const globalRating = sumRatings / totalReviews;
                    const sellerUserId = ctx.db.normalizeId("users", listing.sellerId);
                    if (sellerUserId) {
                        await ctx.db.patch(sellerUserId, {
                            sellerRating: globalRating,
                            sellerReviewCount: totalReviews,
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.error("Failed to update listing rating", e);
    }
}

export const getListingReviews = query({
    args: {
        listingId: v.string(),
        limit: v.optional(v.number()),
        offset: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const reviews = await ctx.db
            .query("reviews")
            .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
            .order("desc")
            .collect();

        const limit = args.limit || 10;
        const offset = args.offset || 0;

        return reviews.slice(offset, offset + limit);
    },
});

export const canReviewListing = query({
    args: {
        sessionToken: v.optional(v.string()), listingId: v.string(), actorId: v.optional(v.any()) },
    handler: async (ctx, args) => {
        try {
            const actor = await requireActor(ctx, (args as any).sessionToken);
            const targetUserId = actor.idString;

            const userOrders = await ctx.db
                .query("orders")
                .withIndex("by_user", (q) => q.eq("userId", targetUserId))
                .collect();

            const eligibleOrders = userOrders.filter(order => 
                order.status !== 'pending' && 
                order.status !== 'cancelled' && 
                order.items.some(item => item.listingId === args.listingId)
            );

            if (eligibleOrders.length === 0) {
                return { canReview: false, reason: "Debes comprar este producto para poder reseñarlo" };
            }

            const existingReviews = await ctx.db
                .query("reviews")
                .withIndex("by_user", (q) => q.eq("userId", targetUserId))
                .filter((q) => q.eq(q.field("listingId"), args.listingId))
                .collect();

            if (existingReviews.length >= eligibleOrders.length) {
                return { canReview: false, reason: "Ya has publicado una reseña por cada compra de este artículo" };
            }

            const reviewedOrderIds = new Set(existingReviews.map(r => r.orderId).filter(Boolean));
            const unreviewedOrder = eligibleOrders.find(o => !reviewedOrderIds.has(o._id));
            const finalOrderId = unreviewedOrder ? unreviewedOrder._id : eligibleOrders[0]._id;

            return { canReview: true, orderId: finalOrderId };
        } catch (e) {
            return { canReview: false, reason: "Inicia sesión para dejar una reseña" };
        }
    }
});

export const getUserReviews = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const targetUserId = args.userId ?? actor.idString;
        assertSelfOrAdmin(actor, targetUserId);
        return await ctx.db
            .query("reviews")
            .withIndex("by_user", (q) => q.eq("userId", targetUserId))
            .order("desc")
            .collect();
    },
});

export const markReviewHelpful = mutation({
    args: { reviewId: v.id("reviews") },
    handler: async (ctx, args) => {
        const review = await ctx.db.get(args.reviewId);
        if (!review) throw new Error("Review no encontrado");

        await ctx.db.patch(args.reviewId, {
            helpful: (review.helpful || 0) + 1,
        });
    },
});

export const addSellerResponse = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        reviewId: v.id("reviews"),
        sellerId: v.optional(v.string()), // legacy fallback
        message: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const review = await ctx.db.get(args.reviewId);
        if (!review) throw new Error("Review no encontrado");

        // Verify seller owns the listing
        try {
            const listingId = ctx.db.normalizeId("listings", review.listingId);
            if (listingId) {
                const listing = await ctx.db.get(listingId);
                const isOwner = listing?.sellerId === actor.idString;
                const isAdmin = actor.role === "admin" || actor.role === "developer";
                if (!isOwner && !isAdmin) {
                    throw new Error("No autorizado");
                }
            }
        } catch (e) {
            throw new Error("No autorizado");
        }

        await ctx.db.patch(args.reviewId, {
            sellerResponse: {
                message: args.message,
                respondedAt: new Date().toISOString(),
            },
            updatedAt: new Date().toISOString(),
        });
    },
});

export const deleteReview = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        reviewId: v.id("reviews"),
        userId: v.optional(v.string()), // legacy fallback
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const review = await ctx.db.get(args.reviewId);
        if (!review) throw new Error("Review no encontrado");

        const isOwner = review.userId === actor.idString;
        const isAdmin = actor.role === "admin" || actor.role === "developer";
        if (!isOwner && !isAdmin) {
            throw new Error("No autorizado");
        }

        const listingId = review.listingId;
        await ctx.db.delete(args.reviewId);

        // Recalculate rating
        await updateListingRating(ctx, listingId);
    },
});

// Get review statistics for a listing
export const getReviewStats = query({
    args: { listingId: v.string() },
    handler: async (ctx, args) => {
        const reviews = await ctx.db
            .query("reviews")
            .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
            .collect();

        if (reviews.length === 0) {
            return {
                average: 0,
                total: 0,
                distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
                verifiedCount: 0,
            };
        }

        const distribution = reviews.reduce((acc, r) => {
            acc[r.rating] = (acc[r.rating] || 0) + 1;
            return acc;
        }, {} as Record<number, number>);

        const verifiedCount = reviews.filter(r => r.verified).length;
        const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

        return {
            average,
            total: reviews.length,
            distribution,
            verifiedCount,
        };
    },
});

export const getBySeller = query({
    args: { sellerId: v.string() },
    handler: async (ctx, args) => {
        const listings = await ctx.db
            .query("listings")
            .filter(q => q.eq(q.field("sellerId"), args.sellerId))
            .collect();

        const listingIds = listings.map(l => l._id.toString());
        if (listingIds.length === 0) return [];

        let allReviews: any[] = [];
        for (const listingId of listingIds) {
            const reviews = await ctx.db
                .query("reviews")
                .withIndex("by_listing", q => q.eq("listingId", listingId))
                .collect();
            allReviews = allReviews.concat(reviews);
        }

        return allReviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
});
