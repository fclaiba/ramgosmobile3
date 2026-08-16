import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { Id } from './_generated/dataModel';
import { requireActor } from './authHelpers';

// FASE 3: convex/cart.ts es la ÚNICA fuente de verdad del carrito autenticado.
// La identidad SIEMPRE se deriva de requireActor (sessionToken); el arg `userId`
// se conserva solo por compatibilidad de firma y se IGNORA.
const MAX_CART_ITEMS = 200;

// Add to cart
export const addToCart = mutation({
    args: {
        sessionToken: v.optional(v.string()),
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
            sourcePostId: v.optional(v.string()),
        })),
        // Attribution is NOT listing data, so it survives the server-side
        // snapshot rebuild below. Callers that resolve a promoter server-side
        // (see `commerce.addPostProductToCart`) pass it here.
        attribution: v.optional(v.object({
            referralCode: v.optional(v.string()),
            sourcePostId: v.optional(v.string()),
        })),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        return await applyAddToCart(ctx, actor.idString, args);
    },
});

/**
 * Shared body of `addToCart`, callable from other modules that have already
 * authenticated the actor (see `commerce.addPostProductToCart`). Kept as a
 * plain helper rather than an internal mutation so the add stays inside the
 * caller's transaction.
 */
export const applyAddToCart = async (
    ctx: any,
    userId: string,
    args: {
        listingId: string;
        quantity: number;
        mutationKey?: string;
        snapshot?: any;
        attribution?: { referralCode?: string; sourcePostId?: string };
    },
) => {
    {
        const quantity = Math.floor(args.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new Error("Cantidad inválida.");
        }

        const isVirtual = args.listingId.startsWith("virtual:");
        // Los listings reales se validan y snapshotean SIEMPRE server-side:
        // nunca se confía en el precio enviado por el cliente.
        let listing: any = null;
        if (!isVirtual) {
            const listingId = ctx.db.normalizeId("listings", args.listingId);
            listing = listingId ? await ctx.db.get(listingId) : null;
            if (!listing) {
                throw new Error("Producto no encontrado");
            }
        }

        const assertStock = (requested: number) => {
            if (listing && listing.type === 'product' && typeof listing.stock === 'number' && requested > listing.stock) {
                throw new Error("Stock insuficiente.");
            }
        };

        // Check if item already in cart
        const existing = await ctx.db
            .query("cart")
            .withIndex("by_user_listing", (q: any) =>
                q.eq("userId", userId).eq("listingId", args.listingId)
            )
            .first();

        if (existing) {
            if (args.mutationKey && existing.lastMutationKey === args.mutationKey) {
                return existing._id;
            }
            const newQuantity = existing.quantity + quantity;
            assertStock(newQuantity);
            await ctx.db.patch(existing._id, {
                quantity: newQuantity,
                lastMutationKey: args.mutationKey,
                // Last touch wins: if the buyer re-adds this item from a
                // creator's post, that creator gets the credit.
                ...(args.attribution
                    ? {
                          snapshot: {
                              ...existing.snapshot,
                              referralCode:
                                  args.attribution.referralCode ??
                                  existing.snapshot.referralCode,
                              sourcePostId:
                                  args.attribution.sourcePostId ??
                                  existing.snapshot.sourcePostId,
                          },
                      }
                    : {}),
            });
            return existing._id;
        }

        assertStock(quantity);

        const currentItems = await ctx.db
            .query("cart")
            .withIndex("by_user", (q: any) => q.eq("userId", userId))
            .take(MAX_CART_ITEMS);
        if (currentItems.length >= MAX_CART_ITEMS) {
            throw new Error("El carrito alcanzó el máximo de ítems.");
        }

        let snapshot = args.snapshot;
        if (listing) {
            const listingType = listing.type as
                | 'product'
                | 'service'
                | 'event'
                | 'bono'
                | undefined;
            let image = listing.image as string | undefined;
            if (image && !image.startsWith('http') && !image.startsWith('blob:') && !image.startsWith('data:')) {
                try {
                    const url = await ctx.storage.getUrl(image as any);
                    if (url) image = url;
                } catch {
                    // keep raw id
                }
            }
            if (!image && Array.isArray(listing.gallery) && listing.gallery[0]) {
                const g0 = listing.gallery[0];
                if (String(g0).startsWith('http')) image = String(g0);
                else {
                    try {
                        image = (await ctx.storage.getUrl(g0 as any)) || String(g0);
                    } catch {
                        image = String(g0);
                    }
                }
            }
            snapshot = {
                title: listing.title,
                price: listing.price,
                image,
                sellerId: listing.sellerId,
                type: listingType ?? 'product',
                sellerName: listing.sellerName,
                condition: listing.condition,
                shippingWeightKg: listing.shippingWeightKg,
                shippingDimensionsCm: listing.shippingDimensionsCm,
                distanceKm: listing.location?.distanceKm ?? listing.distanceKm,
                // Caller-resolved promoter wins over the listing default: it is
                // who actually drove this sale.
                referralCode: args.attribution?.referralCode ?? listing.referralCode,
                sourcePostId: args.attribution?.sourcePostId,
            };
        }

        if (!snapshot) {
            throw new Error("Snapshot de item requerida.");
        }

        // Insert cart item
        return await ctx.db.insert("cart", {
            userId,
            listingId: args.listingId,
            quantity,
            lastMutationKey: args.mutationKey,
            addedAt: new Date().toISOString(),
            // Snapshot at time of adding (listing or virtual item)
            snapshot,
        });
    }
};

// Get user's cart
export const getMyCart = query({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await requireActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
        const userId = actor.idString;

        const cartItems = await ctx.db
            .query("cart")
            .withIndex("by_user", q => q.eq("userId", userId))
            .take(MAX_CART_ITEMS);

        // Populate with current listing data
        return await Promise.all(
            cartItems.map(async item => {
                const listingId = item.listingId.startsWith("virtual:")
                    ? null
                    : ctx.db.normalizeId("listings", item.listingId);
                const listing = listingId ? await ctx.db.get(listingId) : null;
                return { ...item, listing };
            })
        );
    },
});

// Update cart item quantity
export const updateCartQuantity = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.optional(v.string()),
        cartItemId: v.id("cart"),
        quantity: v.number(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const userId = actor.idString;

        const current = await ctx.db.get(args.cartItemId);
        if (!current || current.userId !== userId) throw new Error("No autorizado.");

        const quantity = Math.floor(args.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            await ctx.db.delete(args.cartItemId);
            return;
        }

        if (!current.listingId.startsWith("virtual:")) {
            const listingId = ctx.db.normalizeId("listings", current.listingId);
            const listing = listingId ? await ctx.db.get(listingId) : null;
            if (listing && listing.type === 'product' && typeof listing.stock === 'number' && quantity > listing.stock) {
                throw new Error("Stock insuficiente.");
            }
        }

        await ctx.db.patch(args.cartItemId, {
            quantity,
        });
    },
});

// Remove from cart
export const removeFromCart = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.optional(v.string()),
        cartItemId: v.id("cart"),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const userId = actor.idString;

        const current = await ctx.db.get(args.cartItemId);
        if (!current || current.userId !== userId) throw new Error("No autorizado.");
        await ctx.db.delete(args.cartItemId);
    },
});

// Clear user's cart
export const clearCart = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const userId = actor.idString;

        const cartItems = await ctx.db
            .query("cart")
            .withIndex("by_user", q => q.eq("userId", userId))
            .take(MAX_CART_ITEMS);

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
            .take(MAX_CART_ITEMS);

        await Promise.all(
            cartItems.map(item => ctx.db.delete(item._id))
        );
    },
});
