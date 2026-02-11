import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// PHASE 3: Favorites/Wishlist Management

export const addFavorite = mutation({
    args: {
        userId: v.string(),
        listingId: v.string(),
        referralCode: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Check if already exists
        const existing = await ctx.db
            .query("favorites")
            .withIndex("by_user_listing", (q) =>
                q.eq("userId", args.userId).eq("listingId", args.listingId)
            )
            .first();

        if (existing) {
            return existing._id; // Already favorited
        }

        // Add favorite
        const favoriteId = await ctx.db.insert("favorites", {
            userId: args.userId,
            listingId: args.listingId,
            addedAt: new Date().toISOString(),
            referralCode: args.referralCode,
        });

        // Increment favorite count on listing
        try {
            const listingId = ctx.db.normalizeId("listings", args.listingId);
            if (listingId) {
                const listing = await ctx.db.get(listingId);
                if (listing) {
                    await ctx.db.patch(listingId, {
                        favoriteCount: (listing.favoriteCount || 0) + 1,
                    });
                }
            }
        } catch (e) {
            console.error("Failed to increment favorite count", e);
        }

        return favoriteId;
    },
});

export const removeFavorite = mutation({
    args: {
        userId: v.string(),
        listingId: v.string(),
    },
    handler: async (ctx, args) => {
        const favorite = await ctx.db
            .query("favorites")
            .withIndex("by_user_listing", (q) =>
                q.eq("userId", args.userId).eq("listingId", args.listingId)
            )
            .first();

        if (!favorite) {
            return; // Not favorited
        }

        await ctx.db.delete(favorite._id);

        // Decrement count
        try {
            const listingId = ctx.db.normalizeId("listings", args.listingId);
            if (listingId) {
                const listing = await ctx.db.get(listingId);
                if (listing) {
                    await ctx.db.patch(listingId, {
                        favoriteCount: Math.max(0, (listing.favoriteCount || 0) - 1),
                    });
                }
            }
        } catch (e) {
            console.error("Failed to decrement favorite count", e);
        }
    },
});

export const getMyFavorites = query({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        const favorites = await ctx.db
            .query("favorites")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .order("desc")
            .collect();

        // Populate with full listing data
        const listings = await Promise.all(
            favorites.map(async (f) => {
                try {
                    const listingId = ctx.db.normalizeId("listings", f.listingId);
                    if (!listingId) return null;

                    const listing = await ctx.db.get(listingId);
                    return listing ? { ...f, listing } : null;
                } catch (e) {
                    return null;
                }
            })
        );

        // Remove nulls (deleted listings)
        return listings.filter((f): f is NonNullable<typeof f> => f !== null);
    },
});

export const isFavorited = query({
    args: {
        userId: v.string(),
        listingId: v.string(),
    },
    handler: async (ctx, args) => {
        const favorite = await ctx.db
            .query("favorites")
            .withIndex("by_user_listing", (q) =>
                q.eq("userId", args.userId).eq("listingId", args.listingId)
            )
            .first();

        return !!favorite;
    },
});

export const getFavoriteCount = query({
    args: { listingId: v.string() },
    handler: async (ctx, args) => {
        const favorites = await ctx.db
            .query("favorites")
            .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
            .collect();

        return favorites.length;
    },
});
