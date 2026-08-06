import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertAdminOrDeveloper, assertSelfOrAdmin, requireActor } from "./authHelpers";
import { assertBonoEconomics } from "./bonoEconomics";

/** Influencer may create a bono only for a business with active campaign or whitelist. */
async function assertInfluencerCanIssueBonoForBusiness(
    ctx: any,
    influencerId: string,
    businessId: string,
) {
    const whitelist = await ctx.db
        .query("influencerWhitelists")
        .withIndex("by_business_and_influencer", (q: any) =>
            q.eq("businessId", businessId).eq("influencerId", influencerId),
        )
        .first();
    if (whitelist && whitelist.status === "active") return;

    const campaigns = await ctx.db
        .query("influencerCampaigns")
        .withIndex("by_influencer_business", (q: any) =>
            q.eq("influencerId", influencerId).eq("businessId", businessId),
        )
        .collect();
    if (campaigns.some((c: any) => c.status === "active")) return;

    throw new Error(
        "No tenés una campaña o whitelist activa con ese negocio. Pedile que te invite o te autorice antes de crear el bono.",
    );
}

async function assertInfluencerKycForBono(ctx: any, influencer: any) {
    const requireKyc = await ctx.db
        .query("global_settings")
        .withIndex("by_key", (q: any) => q.eq("key", "require_kyc"))
        .first();
    const isKycEnabled = requireKyc?.value === true;
    const effectiveKycStatus = influencer.kycStatus
        ? influencer.kycStatus
        : isKycEnabled
          ? "pending"
          : "approved";

    if (
        effectiveKycStatus !== "completed" &&
        effectiveKycStatus !== "skipped" &&
        effectiveKycStatus !== "approved"
    ) {
        throw new Error(
            "Debes completar la verificación KYC para crear bonos como influencer.",
        );
    }
}

// --- QUERIES ---

// Get all active listings for the feed
// We can later add pagination, but for now we fetch active ones.
export const getFeed = query({
    args: {},
    handler: async (ctx, args) => {
        const listings = await ctx.db
            .query("listings")
            .withIndex("by_status", (q) => q.eq("status", "active"))
            .order("desc")
            .collect();

        // ponytail: show all active listings; KYC is gated at publish time
        const enriched = await Promise.all(
            listings.map(async (l) => {
                const resolved = await resolveListingUrls(ctx, l);
                if (!resolved) return null;
                const sellerId = ctx.db.normalizeId("users", l.sellerId);
                const seller: any = sellerId ? await ctx.db.get(sellerId) : null;
                return {
                    ...resolved,
                    seller: seller
                        ? {
                            id: String(seller._id),
                            name: seller.name || seller.nickname || 'Vendedor',
                            avatar: seller.avatar,
                            type: seller.role || 'individual',
                            sellerRating: seller.sellerRating || 0,
                        }
                        : undefined,
                };
            }),
        );
        return enriched.filter(Boolean);
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
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        sellerId: v.optional(v.string()),
        type: v.optional(
            v.union(
                v.literal("product"),
                v.literal("service"),
                v.literal("event"),
                v.literal("bono"),
                v.literal("rental"),
            ),
        ),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);

        // Influencer: listings they published for a business (createdByInfluencerId).
        if (
            actor.role === "influencer" &&
            (!args.sellerId || args.sellerId === actor.idString)
        ) {
            const created = await ctx.db
                .query("listings")
                .withIndex("by_created_by_influencer", (q) =>
                    q.eq("createdByInfluencerId", actor.idString),
                )
                .collect();
            const owned = await ctx.db
                .query("listings")
                .withIndex("by_seller", (q) => q.eq("sellerId", actor.idString))
                .collect();
            const byId = new Map<string, any>();
            for (const l of [...created, ...owned]) {
                byId.set(String(l._id), l);
            }
            let rows = Array.from(byId.values());
            if (args.type) {
                rows = rows.filter((l) => l.type === args.type);
            }
            rows.sort((a, b) =>
                String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
            );
            return await Promise.all(rows.map((l) => resolveListingUrls(ctx, l)));
        }

        const targetSellerId = args.sellerId ?? actor.idString;
        if (targetSellerId !== actor.idString) {
            assertAdminOrDeveloper(actor);
        }
        let listings = await ctx.db
            .query("listings")
            .withIndex("by_seller", (q) => q.eq("sellerId", targetSellerId))
            .order("desc")
            .collect();
        if (args.type) {
            listings = listings.filter((l) => l.type === args.type);
        }
        return await Promise.all(listings.map((l) => resolveListingUrls(ctx, l)));
    },
});

// --- MUTATIONS ---

// Create a new listing
export const createListing = mutation({
    args: {
        sessionToken: v.optional(v.string()),
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
            dimensionsCm: v.optional(v.object({
                length: v.number(),
                width: v.number(),
                height: v.number(),
            })),
            shipsFromCity: v.optional(v.string()),
            allowPickup: v.boolean(),
            handlingTimeHours: v.optional(v.number()),
            shipsFrom: v.optional(v.object({
                city: v.string(),
                country: v.string(),
                postalCode: v.string(),
            })),
        })),
        eventDate: v.optional(v.string()),
        eventTime: v.optional(v.string()),
        validUntil: v.optional(v.string()),
        validityDays: v.optional(v.number()),
        discountValue: v.optional(v.number()),
        discountType: v.optional(v.string()),
        condition: v.optional(v.string()), // 'new' | 'used'
        // Open promotion: any influencer can earn commission on this
        // listing without an explicit campaign. Only allowed for sellers
        // with role='business'.
        openPromotion: v.optional(v.boolean()),
        openCommissionRate: v.optional(v.number()), // 0–0.5
        discountPercent: v.optional(v.number()), // For influencers 40, 50, 60
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const type = args.type;

        let sellerId = args.sellerId ?? actor.idString;
        let createdByInfluencerId: string | undefined;

        if (type === "bono") {
            assertBonoEconomics({
                price: args.price,
                discountValue: args.discountValue,
                discountPercent: args.discountPercent,
            });

            if (actor.role === "influencer") {
                if (!args.sellerId || args.sellerId === actor.idString) {
                    throw new Error(
                        "Para crear un bono debés indicar el negocio emisor (sellerId del negocio).",
                    );
                }
                sellerId = args.sellerId;
                const businessNorm = ctx.db.normalizeId("users", sellerId);
                if (!businessNorm) throw new Error("Negocio emisor inválido.");
                const business = await ctx.db.get(businessNorm);
                if (!business) throw new Error("Negocio emisor no encontrado.");
                if (business.role !== "business" && business.role !== "admin") {
                    throw new Error("El emisor del bono debe ser un negocio.");
                }

                const influencer = await ctx.db.get(actor.id);
                if (!influencer) throw new Error("Usuario no encontrado.");
                await assertInfluencerKycForBono(ctx, influencer);
                await assertInfluencerCanIssueBonoForBusiness(
                    ctx,
                    actor.idString,
                    sellerId,
                );
                createdByInfluencerId = actor.idString;
            } else if (
                actor.role === "business" ||
                actor.role === "admin" ||
                actor.role === "developer"
            ) {
                assertSelfOrAdmin(actor, sellerId);
                const normalizedSellerId = ctx.db.normalizeId("users", sellerId);
                if (!normalizedSellerId) throw new Error("No autorizado.");
                const seller = await ctx.db.get(normalizedSellerId);
                if (!seller) throw new Error("Usuario no encontrado.");
                if (
                    actor.role === "business" &&
                    seller.role !== "business" &&
                    seller.role !== "admin"
                ) {
                    throw new Error("El emisor del bono debe ser un negocio.");
                }
            } else {
                throw new Error(
                    `Los usuarios de tipo ${actor.role} no pueden crear bonos.`,
                );
            }
        } else {
            assertSelfOrAdmin(actor, sellerId);
        }

        // Validation: Verify Seller Role
        const normalizedSellerId = ctx.db.normalizeId("users", sellerId);
        if (!normalizedSellerId) {
            throw new Error("No autorizado.");
        }
        const seller = await ctx.db.get(normalizedSellerId);
        if (!seller) {
            throw new Error("Usuario no encontrado.");
        }
        const role = seller.role;

        if (type === "event") {
            if (role !== "business" && role !== "admin") {
                throw new Error(
                    `Los usuarios de tipo ${role} no pueden crear eventos. Exclusivo para Negocios.`,
                );
            }
        }

        if (args.openPromotion) {
            const rate = args.openCommissionRate ?? 0;
            if (rate <= 0 || rate > 0.5) {
                throw new Error(
                    "La comisión de promoción abierta debe estar entre 1% y 50%.",
                );
            }
        }

        // Generate slug from title
        const slug =
            args.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "") +
            "-" +
            Math.random().toString(36).slice(2, 7);

        // ponytail: drop partial dimensionsCm so validator never rejects create
        const rawShip = args.shippingProfile;
        const dims = rawShip?.dimensionsCm;
        const shippingProfile = rawShip
            ? {
                  weightKg: rawShip.weightKg,
                  allowPickup: rawShip.allowPickup,
                  shipsFromCity: rawShip.shipsFromCity,
                  handlingTimeHours: rawShip.handlingTimeHours,
                  shipsFrom: rawShip.shipsFrom,
                  ...(dims &&
                  typeof dims.length === "number" &&
                  typeof dims.width === "number" &&
                  typeof dims.height === "number"
                      ? { dimensionsCm: dims }
                      : {}),
              }
            : undefined;

        const listingId = await ctx.db.insert("listings", {
            title: args.title,
            description: args.description,
            price: args.price,
            type: args.type,
            category: args.category,
            stock: args.stock,
            image: args.image,
            gallery: args.gallery,
            tags: args.tags || [],
            damageDescription: args.damageDescription,
            location: args.location,
            shippingProfile,
            eventDate: args.eventDate,
            eventTime: args.eventTime,
            validUntil: args.validUntil,
            validityDays:
                args.type === "bono"
                    ? Math.min(
                          Math.max(
                              Math.floor(
                                  Number(args.validityDays) > 0
                                      ? Number(args.validityDays)
                                      : 4,
                              ),
                              1,
                          ),
                          365,
                      )
                    : args.validityDays,
            discountValue: args.discountValue,
            discountType:
                args.type === "bono" ? "fixed" : args.discountType,
            // Never persist % for prepaid-credit bonos.
            discountPercent:
                args.type === "bono" ? undefined : args.discountPercent,
            condition: args.condition,
            openPromotion: args.openPromotion,
            openCommissionRate: args.openCommissionRate,
            sellerId,
            ...(createdByInfluencerId
                ? { createdByInfluencerId }
                : {}),
            slug,
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
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        listingId: v.id("listings"),
        quantity: v.number(),
        buyerId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
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
                image: listing.image,
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

        if ((listing as any).type === "bono") {
            await ctx.scheduler.runAfter(0, internal.bonos.internalIssueBonosForOrder, {
                orderId,
            });
        }

        return { success: true, newStock, orderId };
    },
});

export const updateListing = mutation({
    args: {
        sessionToken: v.optional(v.string()),
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
            discountValue: v.optional(v.number()),
            discountType: v.optional(v.string()),
            validUntil: v.optional(v.string()),
            validityDays: v.optional(v.number()),
        })
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const listing = await ctx.db.get(args.id);
        if (!listing) {
            throw new Error("Producto no encontrado");
        }
        const isOwner = listing.sellerId === actor.idString;
        const isCreator =
            (listing as any).createdByInfluencerId === actor.idString;
        const isAdmin = actor.role === "admin" || actor.role === "developer";
        if (!isOwner && !isAdmin && !isCreator) {
            throw new Error("No autorizado.");
        }

        if (args.updates.openPromotion === true) {
            const rate =
                args.updates.openCommissionRate ??
                listing.openCommissionRate ??
                0;
            if (rate <= 0 || rate > 0.5) {
                throw new Error(
                    "La comisión de promoción abierta debe estar entre 1% y 50%.",
                );
            }
        }

        const patch: Record<string, unknown> = { ...args.updates };
        if (patch.validityDays != null) {
            const days = Math.floor(Number(patch.validityDays));
            if (!Number.isFinite(days) || days < 1) {
                throw new Error("La duración del bono debe ser al menos 1 día.");
            }
            patch.validityDays = Math.min(days, 365);
        }

        if ((listing as any).type === "bono") {
            const nextPrice =
                patch.price !== undefined
                    ? Number(patch.price)
                    : Number(listing.price);
            const nextCredit =
                patch.discountValue !== undefined
                    ? Number(patch.discountValue)
                    : Number((listing as any).discountValue);
            assertBonoEconomics({
                price: nextPrice,
                discountValue: nextCredit,
                discountPercent: null,
            });
            patch.discountType = "fixed";
            // Strip any attempt to set percent via loose patch keys
            delete (patch as any).discountPercent;
        }

        patch.updatedAt = new Date().toISOString();
        await ctx.db.patch(args.id, patch);
        return { success: true };
    },
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
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        id: v.id("listings"),
        sellerId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
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
        sessionToken: v.optional(v.string()),
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
        // ponytail: all active listings; KYC gated at publish
        let listings = await ctx.db
            .query("listings")
            .withIndex("by_status", (q) => q.eq("status", "active"))
            .collect();

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
