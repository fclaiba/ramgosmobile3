import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { Id } from './_generated/dataModel';

// Add to cart
export const addToCart = mutation({
    args: {
        userId: v.string(),
        listingId: v.string(),
        quantity: v.number(),
    },
    handler: async (ctx, args) => {
        // Check if item already in cart
        const existing = await ctx.db
            .query("cart")
            .withIndex("by_user_listing", q =>
                q.eq("userId", args.userId).eq("listingId", args.listingId)
            )
            .first();

        if (existing) {
            // Update quantity
            await ctx.db.patch(existing._id, {
                quantity: existing.quantity + args.quantity
            });
            return existing._id;
        }

        // Get listing details for snapshot
        const listing = await ctx.db.get(args.listingId as Id<"listings">);
        if (!listing) {
            throw new Error("Producto no encontrado");
        }

        // Insert cart item
        return await ctx.db.insert("cart", {
            userId: args.userId,
            listingId: args.listingId,
            quantity: args.quantity,
            addedAt: new Date().toISOString(),
            // Snapshot of listing at time of adding
            snapshot: {
                title: listing.title,
                price: listing.price,
                image: listing.image,
                sellerId: listing.sellerId,
            },
        });
    },
});

// Get user's cart
export const getMyCart = query({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        const cartItems = await ctx.db
            .query("cart")
            .withIndex("by_user", q => q.eq("userId", args.userId))
            .collect();

        // Populate with current listing data
        return await Promise.all(
            cartItems.map(async item => {
                const listing = await ctx.db.get(item.listingId as Id<"listings">);
                return { ...item, listing };
            })
        );
    },
});

// Update cart item quantity
export const updateCartQuantity = mutation({
    args: {
        cartItemId: v.id("cart"),
        quantity: v.number(),
    },
    handler: async (ctx, args) => {
        if (args.quantity <= 0) {
            await ctx.db.delete(args.cartItemId);
            return;
        }

        await ctx.db.patch(args.cartItemId, {
            quantity: args.quantity,
        });
    },
});

// Remove from cart
export const removeFromCart = mutation({
    args: {
        cartItemId: v.id("cart"),
    },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.cartItemId);
    },
});

// Clear user's cart
export const clearCart = mutation({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        const cartItems = await ctx.db
            .query("cart")
            .withIndex("by_user", q => q.eq("userId", args.userId))
            .collect();

        await Promise.all(
            cartItems.map(item => ctx.db.delete(item._id))
        );
    },
});
