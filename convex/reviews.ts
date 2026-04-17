import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { assertSelfOrAdmin, requireActor } from "./authHelpers";

// PHASE 2: Reviews and Ratings

export const addReview = mutation({
    args: {
        actorId: v.optional(v.id("users")),
        listingId: v.string(),
        userId: v.optional(v.string()),
        orderId: v.optional(v.string()),
        rating: v.number(), // 1-5
        title: v.optional(v.string()),
        comment: v.string(),
        images: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.userId);
        const targetUserId = args.userId ?? actor.idString;
        assertSelfOrAdmin(actor, targetUserId);
        // Validate rating
        if (args.rating < 1 || args.rating > 5) {
            throw new Error("Rating debe estar entre 1 y 5");
        }

        // Check if order exists and belongs to user (if orderId provided)
        let verified = false;
        if (args.orderId) {
            try {
                const orderId = ctx.db.normalizeId("orders", args.orderId);
                if (orderId) {
                    const order = await ctx.db.get(orderId);
                    verified = order?.userId === targetUserId;
                }
            } catch (e) {
                // Order doesn't exist, not verified
            }
        }

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
            orderId: args.orderId,
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

export const getUserReviews = query({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.userId);
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
        actorId: v.optional(v.id("users")),
        reviewId: v.id("reviews"),
        sellerId: v.optional(v.string()), // legacy fallback
        message: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.sellerId);
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
        actorId: v.optional(v.id("users")),
        reviewId: v.id("reviews"),
        userId: v.optional(v.string()), // legacy fallback
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.userId);
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
