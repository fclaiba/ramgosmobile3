import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { Id } from './_generated/dataModel';
import { assertSelfOrAdmin, requireActor } from './authHelpers';

// Add to cart
export const addToCart = mutation({
    args: {
        userId: v.optional(v.string()),
        listingId: v.string(),
        quantity: v.number(),
        mutationKey: v.optional(v.string()),
        snapshot: v.optional(v.object({
            title: v.string(),
            price: v.number(),
            image: v.optional(v.string()),
            sellerId: v.optional(v.string()),
            type: v.optional(v.union(v.literal('product'), v.literal('service'), v.literal('bono'), v.literal('event'), v.literal('subscription'))),
            subscriptionTier: v.optional(v.union(v.literal('pro'), v.literal('business'))),
            location: v.optional(v.string()),
            sellerName: v.optional(v.string()),
            condition: v.optional(v.union(v.literal('new'), v.literal('used'))),
            shippingWeightKg: v.optional(v.number()),
            shippingDimensionsCm: v.optional(v.object({
                length: v.number(),
                width: v.number(),
                height: v.number(),
            })),
            distanceKm: v.optional(v.number()),
            referralCode: v.optional(v.string()),
        })),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
        const userId = actor.idString;

        // Check if item already in cart
        const existing = await ctx.db
            .query("cart")
            .withIndex("by_user_listing", q =>
                q.eq("userId", userId).eq("listingId", args.listingId)
            )
            .first();

        if (existing) {
            if (args.mutationKey && existing.lastMutationKey === args.mutationKey) {
                return existing._id;
            }
            // Update quantity
            await ctx.db.patch(existing._id, {
                quantity: existing.quantity + args.quantity,
                lastMutationKey: args.mutationKey,
            });
            return existing._id;
        }

        const isVirtual = args.listingId.startsWith("virtual:");
        let snapshot = args.snapshot;

        if (!isVirtual) {
            const listing = await ctx.db.get(args.listingId as Id<"listings">);
            if (!listing) {
                throw new Error("Producto no encontrado");
            }
            const listingType = (listing as any).type as
                | 'product'
                | 'service'
                | 'event'
                | 'bono'
                | undefined;
            snapshot = {
                title: listing.title,
                price: listing.price,
                image: listing.image,
                sellerId: listing.sellerId,
                type: listingType ?? 'product',
                sellerName: (listing as any).sellerName,
                condition: (listing as any).condition,
                shippingWeightKg: (listing as any).shippingWeightKg,
                shippingDimensionsCm: (listing as any).shippingDimensionsCm,
                distanceKm: (listing as any).distanceKm,
                referralCode: (listing as any).referralCode,
            };
        }

        if (!snapshot) {
            throw new Error("Snapshot de item requerida.");
        }

        // Insert cart item
        return await ctx.db.insert("cart", {
            userId,
            listingId: args.listingId,
            quantity: args.quantity,
            lastMutationKey: args.mutationKey,
            addedAt: new Date().toISOString(),
            // Snapshot at time of adding (listing or virtual item)
            snapshot,
        });
    },
});

// Get user's cart
export const getMyCart = query({
    args: {
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
        } catch {
            return [];
        }
        const userId = actor.idString;

        const cartItems = await ctx.db
            .query("cart")
            .withIndex("by_user", q => q.eq("userId", userId))
            .collect();

        // Populate with current listing data
        return await Promise.all(
            cartItems.map(async item => {
                if (item.listingId.startsWith("virtual:")) {
                    return { ...item, listing: null };
                }
                const listing = await ctx.db.get(item.listingId as Id<"listings">);
                return { ...item, listing };
            })
        );
    },
});

// Update cart item quantity
export const updateCartQuantity = mutation({
    args: {
        userId: v.optional(v.string()),
        cartItemId: v.id("cart"),
        quantity: v.number(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
        const userId = actor.idString;

        const current = await ctx.db.get(args.cartItemId);
        if (!current || current.userId !== userId) throw new Error("No autorizado.");

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
        userId: v.optional(v.string()),
        cartItemId: v.id("cart"),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
        const userId = actor.idString;

        const current = await ctx.db.get(args.cartItemId);
        if (!current || current.userId !== userId) throw new Error("No autorizado.");
        await ctx.db.delete(args.cartItemId);
    },
});

// Clear user's cart
export const clearCart = mutation({
    args: {
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, typeof args !== 'undefined' ? (args as any).userId ?? (args as any).actorId ?? (args as any).id : undefined);
        const userId = actor.idString;

        const cartItems = await ctx.db
            .query("cart")
            .withIndex("by_user", q => q.eq("userId", userId))
            .collect();

        await Promise.all(
            cartItems.map(item => ctx.db.delete(item._id))
        );
    },
});

// Internal clear cart for stripe webhook
export const internalClearCart = internalMutation({
    args: {
        userId: v.string(),
    },
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
