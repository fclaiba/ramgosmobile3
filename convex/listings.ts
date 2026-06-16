import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { assertAdminOrDeveloper, assertSelfOrAdmin, requireActor } from "./authHelpers";

// --- QUERIES ---

// Get all active listings for the feed
// We can later add pagination, but for now we fetch active ones.
export const getFeed = query({
    args: {},
    handler: async (ctx, args) => {
        const listings = await ctx.db
            .query("listings")
            .withIndex("by_status", (q) => q.eq("status", "active"))
            .order("desc") // Newest first usually
            .collect();

        // KYC Filter: Only show products from approved sellers
        const validListings = [];
        for (const l of listings) {
            const sellerId = ctx.db.normalizeId("users", l.sellerId);
            const seller: any = sellerId ? await ctx.db.get(sellerId) : null;
            if (seller && seller.kycStatus === 'approved') {
                validListings.push(l);
            }
        }

        return await Promise.all(validListings.map(l => resolveListingUrls(ctx, l)));
    },
});

// Helper to resolve storage URLs
// Helper to resolve storage URLs
const resolveListingUrls = async (ctx: any, listing: any) => {
    if (!listing) return null;

    const isStorageId = (url: string) => {
        // Must NOT start with http, blob:, data: and should look like a storage ID (if possible)
        // Convex storage IDs are usually alphanumeric.
        return url && !url.startsWith("http") && !url.startsWith("blob:") && !url.startsWith("data:") && url.length < 64;
    };

    let imageUrl = listing.image;
    if (isStorageId(imageUrl)) {
        try {
            const url = await ctx.storage.getUrl(imageUrl);
            if (url) imageUrl = url;
            else console.warn("Failed to resolve storage ID:", imageUrl); // placeholder?
        } catch (e) {
            console.error("Invalid storage ID:", imageUrl);
            // Keep original if fail
        }
    }
    let gallery = listing.gallery;
    if (gallery && Array.isArray(gallery)) {
        gallery = await Promise.all(gallery.map(async (url: string) => {
            if (isStorageId(url)) {
                try {
                    const resolved = await ctx.storage.getUrl(url);
                    return resolved || url;
                } catch (e) { return url; }
            }
            return url;
        }));
    }
    return { ...listing, image: imageUrl, gallery };
};

// Get single listing by ID
export const getListing = query({
    args: { id: v.id("listings") },
    handler: async (ctx, args) => {
        const listing = await ctx.db.get(args.id);
        return await resolveListingUrls(ctx, listing);
    },
});

export const getMyListings = query({
    args: {
        actorId: v.optional(v.any()),
        sellerId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.sellerId);
        const targetSellerId = args.sellerId ?? actor.idString;
        if (targetSellerId !== actor.idString) {
            assertAdminOrDeveloper(actor);
        }
        const listings = await ctx.db
            .query("listings")
            .withIndex("by_seller", (q) => q.eq("sellerId", targetSellerId))
            .collect();
        return await Promise.all(listings.map(l => resolveListingUrls(ctx, l)));
    }
});

// --- MUTATIONS ---

// Create a new listing
export const createListing = mutation({
    args: {
        actorId: v.optional(v.any()),
        title: v.string(),
        description: v.string(),
        price: v.number(),
        type: v.union(v.literal('product'), v.literal('service'), v.literal('event'), v.literal('bono')),
        category: v.string(),
        sellerId: v.optional(v.string()),
        stock: v.number(),
        image: v.optional(v.string()),
        gallery: v.optional(v.array(v.string())),
        tags: v.optional(v.array(v.string())), // PHASE 2
        damageDescription: v.optional(v.string()), // PHASE 2
        location: v.optional(v.object({
            lat: v.number(),
            lng: v.number(),
            name: v.string(),
            address: v.optional(v.string()),
            distanceKm: v.optional(v.number()),
        })),
        shippingProfile: v.optional(v.object({
            weightKg: v.number(),
            shipsFromCity: v.optional(v.string()),
            allowPickup: v.boolean(),
        })),
        eventDate: v.optional(v.string()),
        eventTime: v.optional(v.string()),
        validUntil: v.optional(v.string()),
        discountValue: v.optional(v.number()),
        discountType: v.optional(v.string()),
        condition: v.optional(v.string()), // 'new' | 'used'
        // Open promotion: any influencer can earn commission on this
        // listing without an explicit campaign. Only allowed for sellers
        // with role='business'.
        openPromotion: v.optional(v.boolean()),
        openCommissionRate: v.optional(v.number()), // 0–0.5
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.sellerId);
        const sellerId = args.sellerId ?? actor.idString;
        assertSelfOrAdmin(actor, sellerId);
        // Validation: Verify Seller Role
        const normalizedSellerId = ctx.db.normalizeId("users", sellerId);
        if (!normalizedSellerId) {
            throw new Error("No autorizado.");
        }
        const seller = await ctx.db.get(normalizedSellerId);
        if (!seller) {
            throw new Error("Usuario no encontrado.");
        }
        // Allow all roles to create listings (consumer can sell used items, etc.)
        // Restriction for Events and Bonos:
        const role = seller.role;
        const type = args.type;

        if (type === 'event' || type === 'bono') {
            if (role !== 'business' && role !== 'admin') {
                throw new Error(`Los usuarios de tipo ${role} no pueden crear ${type}s. Exclusivo para Negocios.`);
            }
        }

        if (args.openPromotion) {
            const rate = args.openCommissionRate ?? 0;
            if (rate <= 0 || rate > 0.5) {
                throw new Error('La comisión de promoción abierta debe estar entre 1% y 50%.');
            }
        }

        // Generate slug from title
        const slug = args.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).slice(2, 7);

        const listingId = await ctx.db.insert("listings", {
            ...args,
            sellerId,
            slug,
            tags: args.tags || [],
            currency: "USD",
            status: "active",
            views: 0,
            favoriteCount: 0,
            orderCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        return listingId;
    },
});


// PURCHASE / DECREMENT STOCK
// This is critical for real-time inventory management.
export const purchaseItem = mutation({
    args: {
        actorId: v.optional(v.any()),
        listingId: v.id("listings"),
        quantity: v.number(),
        buyerId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.buyerId);
        const buyerId = args.buyerId ?? actor.idString;
        assertSelfOrAdmin(actor, buyerId);
        const listing = await ctx.db.get(args.listingId);

        if (!listing) {
            throw new Error("Producto no encontrado.");
        }

        if (listing.stock < args.quantity) {
            throw new Error("Stock insuficiente.");
        }

        // Decrement stock
        const newStock = listing.stock - args.quantity;

        await ctx.db.patch(args.listingId, {
            stock: newStock,
            // If stock 0, theoretically we could set status to 'closed', 
            // but usually we just keep it active but OOS.
        });

        // Record Order in 'orders' table
        const orderId = await ctx.db.insert("orders", {
            userId: buyerId,
            sellerId: listing.sellerId,
            items: [{
                listingId: args.listingId,
                title: listing.title,
                quantity: args.quantity,
                price: listing.price,
            }],
            total: listing.price * args.quantity,
            currency: "USD",
            status: "pending",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        // Update listing order count
        await ctx.db.patch(args.listingId, {
            orderCount: (listing.orderCount || 0) + 1,
        });

        return { success: true, newStock, orderId };
    },
});

export const updateListing = mutation({
    args: {
        actorId: v.optional(v.any()),
        id: v.id("listings"),
        sellerId: v.optional(v.string()),
        updates: v.object({
            title: v.optional(v.string()),
            description: v.optional(v.string()),
            price: v.optional(v.number()),
            stock: v.optional(v.number()),
            status: v.optional(v.union(v.literal('active'), v.literal('paused'), v.literal('closed'))),
            image: v.optional(v.string()),
            gallery: v.optional(v.array(v.string())),
            category: v.optional(v.string()),
            condition: v.optional(v.string()),
            location: v.optional(v.object({
                lat: v.number(),
                lng: v.number(),
                name: v.string(),
                address: v.optional(v.string()),
                distanceKm: v.optional(v.number()),
            })),
            // Same business-only constraint enforced in createListing.
            openPromotion: v.optional(v.boolean()),
            openCommissionRate: v.optional(v.number()),
        })
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.sellerId);
        const listing = await ctx.db.get(args.id);
        if (!listing) {
            throw new Error("Producto no encontrado");
        }
        const isOwner = listing.sellerId === actor.idString;
        const isAdmin = actor.role === "admin" || actor.role === "developer";
        if (!isOwner && !isAdmin) {
            throw new Error("No autorizado.");
        }

        if (args.updates.openPromotion === true) {
            const rate = args.updates.openCommissionRate ?? listing.openCommissionRate ?? 0;
            if (rate <= 0 || rate > 0.5) {
                throw new Error('La comisión de promoción abierta debe estar entre 1% y 50%.');
            }
        }

        await ctx.db.patch(args.id, args.updates);
        return { success: true };
    }
});

// ---------------------------------------------------------------------------
// internal — used by the Stripe PI attribution validator. Returns just the
// fields needed to decide whether a referralCode earns commission.
// ---------------------------------------------------------------------------
export const internalGetListingForAttribution = internalQuery({
    args: { listingId: v.string() },
    handler: async (ctx, args) => {
        const normId = ctx.db.normalizeId('listings', args.listingId);
        if (!normId) return null;
        const listing: any = await ctx.db.get(normId);
        if (!listing) return null;

        const sellerNormId = ctx.db.normalizeId('users', listing.sellerId);
        const seller: any = sellerNormId ? await ctx.db.get(sellerNormId) : null;

        return {
            listingId: String(listing._id),
            sellerId: listing.sellerId,
            sellerRole: seller?.role ?? null,
            openPromotion: listing.openPromotion === true,
            openCommissionRate:
                typeof listing.openCommissionRate === 'number'
                    ? listing.openCommissionRate
                    : null,
        };
    },
});

export const deleteListing = mutation({
    args: {
        actorId: v.optional(v.any()),
        id: v.id("listings"),
        sellerId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.sellerId);
        const listing = await ctx.db.get(args.id);
        if (!listing) {
            throw new Error("Producto no encontrado");
        }
        const isOwner = listing.sellerId === actor.idString;
        const isAdmin = actor.role === "admin" || actor.role === "developer";
        if (!isOwner && !isAdmin) {
            throw new Error("No autorizado.");
        }
        await ctx.db.delete(args.id);
        return { success: true };
    }
});


// PHASE 2: Enhanced Queries

// Get listing by slug (for SEO-friendly URLs)
export const getListingBySlug = query({
    args: { slug: v.string() },
    handler: async (ctx, args) => {
        const listing = await ctx.db
            .query("listings")
            .withIndex("by_slug", (q) => q.eq("slug", args.slug))
            .first();
        return await resolveListingUrls(ctx, listing);
    },
});

// Record a view on a listing
export const recordView = mutation({
    args: {
        listingId: v.string(),
        userId: v.optional(v.string()),
        sessionId: v.string(),
    },
    handler: async (ctx, args) => {
        // Check if already viewed in this session
        const existing = await ctx.db
            .query("listingViews")
            .withIndex("by_session_listing", (q) =>
                q.eq("sessionId", args.sessionId).eq("listingId", args.listingId)
            )
            .first();

        if (existing) return; // Already counted

        // Record view
        await ctx.db.insert("listingViews", {
            listingId: args.listingId,
            userId: args.userId,
            viewedAt: new Date().toISOString(),
            sessionId: args.sessionId,
        });

        // Increment view count
        try {
            const listingId = ctx.db.normalizeId("listings", args.listingId);
            if (listingId) {
                const listing = await ctx.db.get(listingId);
                if (listing) {
                    await ctx.db.patch(listingId, {
                        views: (listing.views || 0) + 1,
                    });
                }
            }
        } catch (e) {
            console.error("Failed to increment views", e);
        }
    },
});

// PHASE 5: Search Listings
export const searchListings = query({
    args: {
        query: v.optional(v.string()),
        category: v.optional(v.string()),
        minPrice: v.optional(v.number()),
        maxPrice: v.optional(v.number()),
        condition: v.optional(v.string()),
        type: v.optional(v.string()),
        tags: v.optional(v.array(v.string())),
        sortBy: v.optional(v.string()), // 'price_asc', 'price_desc', 'newest', 'popular'
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        // Start with all active listings
        let listings = await ctx.db
            .query("listings")
            .withIndex("by_status", (q) => q.eq("status", "active"))
            .collect();

        // KYC Filter: Only show products from approved sellers
        const validListings = [];
        for (const l of listings) {
            const sellerId = ctx.db.normalizeId("users", l.sellerId);
            const seller: any = sellerId ? await ctx.db.get(sellerId) : null;
            if (seller && seller.kycStatus === 'approved') {
                validListings.push(l);
            }
        }
        listings = validListings;

        // Filter by category
        if (args.category) {
            listings = listings.filter(l => l.category === args.category);
        }

        // Filter by type
        if (args.type) {
            listings = listings.filter(l => l.type === args.type);
        }

        // Filter by price range
        if (args.minPrice !== undefined) {
            listings = listings.filter(l => l.price >= args.minPrice!);
        }
        if (args.maxPrice !== undefined) {
            listings = listings.filter(l => l.price <= args.maxPrice!);
        }

        // Filter by condition
        if (args.condition) {
            listings = listings.filter(l => l.condition === args.condition);
        }

        // Filter by tags
        if (args.tags && args.tags.length > 0) {
            listings = listings.filter(l =>
                args.tags!.some(tag => l.tags?.includes(tag))
            );
        }

        // Text search in title and description (simple contains)
        if (args.query) {
            const lowerQuery = args.query.toLowerCase();
            listings = listings.filter(l =>
                l.title.toLowerCase().includes(lowerQuery) ||
                l.description.toLowerCase().includes(lowerQuery)
            );
        }

        // Sort
        const sortBy = args.sortBy || 'newest';
        if (sortBy === 'price_asc') {
            listings.sort((a, b) => a.price - b.price);
        } else if (sortBy === 'price_desc') {
            listings.sort((a, b) => b.price - a.price);
        } else if (sortBy === 'popular') {
            listings.sort((a, b) => (b.views || 0) - (a.views || 0));
        } else { // 'newest'
            listings.sort((a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
        }

        // Limit results
        const limit = args.limit || 50;
        const sliced = listings.slice(0, limit);
        return await Promise.all(sliced.map(l => resolveListingUrls(ctx, l)));
    },
});

// Get analytics for a listing
export const getListingAnalytics = query({
    args: { listingId: v.string() },
    handler: async (ctx, args) => {
        const listingId = ctx.db.normalizeId("listings", args.listingId);
        if (!listingId) return null;

        const listing = await ctx.db.get(listingId);
        if (!listing) return null;

        const views = await ctx.db
            .query("listingViews")
            .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
            .collect();

        const favorites = await ctx.db
            .query("favorites")
            .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
            .collect();

        const uniqueViewers = new Set(views.filter(v => v.userId).map(v => v.userId)).size;

        return {
            totalViews: views.length,
            uniqueViewers,
            totalFavorites: favorites.length,
            orders: listing.orderCount || 0,
            conversionRate: listing.orderCount && views.length > 0
                ? (listing.orderCount / views.length) * 100
                : 0,
            averageRating: listing.averageRating || 0,
            reviewCount: listing.reviewCount || 0,
        };
    },
});
