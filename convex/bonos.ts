/**
 * convex/bonos.ts — Bono (gift voucher) lifecycle.
 *
 * Lifecycle:
 *   1. Buyer purchases a `listings` row of type 'bono' through the marketplace
 *      checkout. PaymentIntent succeeds and webhook calls
 *      `internal.bonos.internalIssueBonosForPayment` → emits one
 *      `bonoRedemptions` row per quantity unit, status = 'issued'.
 *   2. App displays bonoCode + QR to the buyer.
 *   3. Business POS scans the code via `redeemBono` mutation. We validate:
 *        - the actor is the seller (or admin)
 *        - bono is currently 'issued'
 *        - validUntil is not past
 *      Then we mark it 'redeemed', and AUTO-CONFIRM the order line so
 *      escrow releases to the seller (no waiting period — fulfillment
 *      happens at scan time).
 *
 * QR payload:
 *   We use the bonoCode as the QR text. The scanner only needs to call
 *   redeemBono({ bonoCode }) — no signature needed because:
 *     - the code is high-entropy (UUID v4 + check digit)
 *     - the redeemBono mutation does the auth check (only the seller of
 *       the bono's listing can redeem it).
 */

import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getActorOrNull, requireActor } from "./authHelpers";

/** User-facing errors — ConvexError so the client gets a clean `.data` string. */
function bonoUserError(message: string): never {
    throw new ConvexError(message);
}

// Generates an opaque, sufficiently-unique code for a bono. We don't need
// cryptographic randomness here — Convex queries / mutations execute in V8
// isolates so Math.random is fine, and the code is also indexed.
const generateBonoCode = (): string => {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    const rand2 = Math.random().toString(36).slice(2, 6);
    return `BNO-${ts}-${rand}${rand2}`.toUpperCase();
};

/** Default economics: pay $50 → $100 credit at the business. */
export const DEFAULT_BONO_PAID = 50;
export const DEFAULT_BONO_CREDIT = 100;
/** Standard redemption window when the store doesn't set one. */
export const DEFAULT_BONO_VALIDITY_DAYS = 7;

function resolveBonoEconomics(listing: any) {
    const paidRaw = Number(listing?.price);
    const creditRaw = Number(listing?.discountValue);
    const paidAmount =
        Number.isFinite(paidRaw) && paidRaw > 0 ? paidRaw : DEFAULT_BONO_PAID;
    let creditTotal =
        Number.isFinite(creditRaw) && creditRaw > 0 ? creditRaw : paidAmount * 2;
    if (creditTotal <= paidAmount) creditTotal = DEFAULT_BONO_CREDIT;
    return {
        paidAmount,
        creditTotal,
        creditRemaining: creditTotal,
        usesTotal: 1,
        usesRemaining: 1,
    };
}

/**
 * Redemption expiry for a newly issued bono.
 * Prefer store-configured `validityDays` (relative from purchase).
 * Fall back to listing.validUntil if still in the future (legacy absolute).
 * Otherwise standard = 7 days.
 */
function resolveBonoValidUntil(listing: any, fromMs: number = Date.now()): string {
    const daysRaw = Number(listing?.validityDays);
    if (Number.isFinite(daysRaw) && daysRaw > 0) {
        const days = Math.min(Math.floor(daysRaw), 365);
        return new Date(fromMs + days * 24 * 60 * 60 * 1000).toISOString();
    }
    if (listing?.validUntil) {
        const abs = new Date(listing.validUntil).getTime();
        if (Number.isFinite(abs) && abs > fromMs) {
            return new Date(abs).toISOString();
        }
    }
    return new Date(
        fromMs + DEFAULT_BONO_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
}

// ---------------------------------------------------------------------------
// internalIssueBonosForPayment — called from the Stripe webhook handler
// when a payment line of type='bono' succeeds.
// ---------------------------------------------------------------------------
export const internalIssueBonosForPayment = internalMutation({
    args: {
        paymentId: v.id("payments"),
    },
    handler: async (ctx, args) => {
        const payment = await ctx.db.get(args.paymentId);
        if (!payment) return;
        if (!payment.sellerId) return;

        const meta = (payment.metadata ?? {}) as any;
        const listingId: string | undefined = meta.listingId;
        const type: string | undefined = meta.type;
        if (type !== "bono" || !listingId) return;

        // Resolve the listing for validUntil + sanity checks.
        const listingNormId = ctx.db.normalizeId("listings", listingId);
        const listing = listingNormId ? await ctx.db.get(listingNormId) : null;
        if (!listing) {
            console.warn(`[Bonos] Listing not found for payment ${args.paymentId}`);
            return;
        }
        if ((listing as any).type !== "bono") {
            console.warn(`[Bonos] Listing ${listingId} is not a bono`);
            return;
        }

        // Idempotency: skip if we already emitted bonos for this payment.
        const existing = await ctx.db
            .query("bonoRedemptions")
            .withIndex("by_listing", (q) => q.eq("listingId", listingId))
            .filter((q) => q.eq(q.field("paymentId"), String(args.paymentId)))
            .collect();
        if (existing.length > 0) {
            console.log(
                `[Bonos] ${existing.length} already issued for payment ${args.paymentId}; skipping`,
            );
            return;
        }

        // Quantity defaults to 1 if metadata doesn't specify it. For bonos,
        // each unit becomes its own redeemable code.
        const quantity = Number((meta.quantity as number) ?? 1) || 1;

        const economics = resolveBonoEconomics(listing);
        const validUntil = resolveBonoValidUntil(listing);
        for (let i = 0; i < quantity; i++) {
            const code = generateBonoCode();
            await ctx.db.insert("bonoRedemptions", {
                bonoCode: code,
                listingId,
                ownerUserId: payment.userId,
                sellerId: payment.sellerId,
                paymentId: String(args.paymentId),
                orderId: payment.orderId ?? undefined,
                validUntil,
                ...economics,
                status: "issued",
                createdAt: new Date().toISOString(),
            });
        }

        console.log(
            `[Bonos] Issued ${quantity} bono(s) for payment ${args.paymentId}`,
        );
    },
});

// ---------------------------------------------------------------------------
// internalIssueBonosForOrder — called from order creation when a buyer
// pays for a cart containing bonos.
// ---------------------------------------------------------------------------
export const internalIssueBonosForOrder = internalMutation({
    args: {
        orderId: v.id("orders"),
    },
    handler: async (ctx, args) => {
        const order = await ctx.db.get(args.orderId);
        if (!order) return;

        for (const item of order.items) {
            const listingNormId = ctx.db.normalizeId("listings", item.listingId);
            if (!listingNormId) continue;
            
            const listing = await ctx.db.get(listingNormId);
            if (!listing || (listing as any).type !== "bono") continue;

            // Idempotency check per item inside the order
            const existing = await ctx.db
                .query("bonoRedemptions")
                .withIndex("by_listing", (q) => q.eq("listingId", item.listingId))
                .filter((q) => q.eq(q.field("orderId"), String(args.orderId)))
                .collect();
            
            if (existing.length > 0) {
                console.log(`[Bonos] Already issued bonos for order ${args.orderId} listing ${item.listingId}`);
                continue;
            }

            const economics = resolveBonoEconomics(listing);
            const validUntil = resolveBonoValidUntil(listing);
            for (let i = 0; i < item.quantity; i++) {
                const code = generateBonoCode();
                await ctx.db.insert("bonoRedemptions", {
                    bonoCode: code,
                    listingId: item.listingId,
                    ownerUserId: order.userId,
                    sellerId: order.sellerId,
                    orderId: String(args.orderId),
                    validUntil,
                    ...economics,
                    status: "issued",
                    createdAt: new Date().toISOString(),
                });
            }
        }
    },
});

// ---------------------------------------------------------------------------
// redeemBono — called from the business POS scanner.
// ---------------------------------------------------------------------------
export const redeemBono = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        sellerId: v.optional(v.string()), // legacy fallback
        bonoCode: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);

        const bono = await ctx.db
            .query("bonoRedemptions")
            .withIndex("by_code", (q) => q.eq("bonoCode", args.bonoCode))
            .first();
        if (!bono) {
            bonoUserError("No encontramos ese código. Revisalo e intentá de nuevo.");
        }

        // Auth: only the seller (or admin) of THIS bono can redeem it.
        const isSeller = bono.sellerId === actor.idString;
        const isAdmin = actor.role === "admin" || actor.role === "developer";
        if (!isSeller && !isAdmin) {
            bonoUserError(
                "Este bono es de otro negocio. Pedile al cliente el QR correcto.",
            );
        }

        if (bono.status === "redeemed") {
            bonoUserError("Este bono ya fue canjeado.");
        }
        if (bono.status === "cancelled") {
            bonoUserError("Este bono fue cancelado.");
        }

        // Expiration check
        if (bono.validUntil) {
            const expiresAt = new Date(bono.validUntil).getTime();
            if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
                await ctx.db.patch(bono._id, {
                    status: "expired",
                });
                bonoUserError("Este bono está vencido.");
            }
        }

        // Mark as redeemed — consume remaining credit/uses in one POS scan.
        await ctx.db.patch(bono._id, {
            status: "redeemed",
            creditRemaining: 0,
            usesRemaining: 0,
            redeemedByBusinessUserId: actor.idString,
            redeemedAt: new Date().toISOString(),
        });

        // Auto-release escrow for the order this bono came from.
        // Bonos are fulfilled at scan time — there's no shipping wait,
        // so we don't make the buyer manually press "Confirm receipt".
        if (bono.orderId) {
            const orderNormId = ctx.db.normalizeId("orders", bono.orderId);
            if (orderNormId) {
                const order = await ctx.db.get(orderNormId);
                if (
                    order &&
                    (order.status === "payment_received" ||
                        order.status === "delivered" ||
                        order.status === "paid_escrow" ||
                        order.escrowState === "held")
                ) {
                    await ctx.db.patch(orderNormId, {
                        status: "completed",
                        escrowState: "released",
                        updatedAt: new Date().toISOString(),
                    });
                    try {
                        await ctx.runMutation(
                            internal.stripe.internalReleasePayment,
                            { orderId: orderNormId },
                        );
                    } catch (err) {
                        // Escrow release is best-effort after redeem; bono stays redeemed.
                        console.warn("[Bonos] Escrow release after redeem failed:", err);
                    }
                }
            }
        }

        return {
            success: true,
            bonoId: String(bono._id),
            listingId: bono.listingId,
        };
    },
});

// ---------------------------------------------------------------------------
// Buyer-facing query: list a user's purchased bonos.
// ---------------------------------------------------------------------------
export const getMyBonos = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // ponytail: empty on missing session — don't crash HistoryScreen
        const actor = await getActorOrNull(ctx, (args as any).sessionToken);
        if (!actor) return [];
        const userId = args.userId ?? actor.idString;
        if (userId !== actor.idString && actor.role !== "admin") {
            throw new Error("No autorizado.");
        }
        const bonos = await ctx.db
            .query("bonoRedemptions")
            .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
            .order("desc")
            .collect();
            
        return await Promise.all(
            bonos.map(async (bono) => {
                const listingNormId = ctx.db.normalizeId("listings", bono.listingId);
                const listing = listingNormId ? await ctx.db.get(listingNormId) : null;
                
                const sellerNormId = ctx.db.normalizeId("users", bono.sellerId);
                const seller = sellerNormId ? await ctx.db.get(sellerNormId) : null;

                // Backfill economics for older rows that predate credit fields.
                const eco = resolveBonoEconomics(listing);
                const paidAmount = bono.paidAmount ?? eco.paidAmount;
                const creditTotal = bono.creditTotal ?? eco.creditTotal;
                const usesTotal = bono.usesTotal ?? 1;
                const isOpen = bono.status === "issued";
                const creditRemaining =
                    bono.creditRemaining ?? (isOpen ? creditTotal : 0);
                const usesRemaining =
                    bono.usesRemaining ?? (isOpen ? usesTotal : 0);
                
                return {
                    ...bono,
                    listing,
                    seller,
                    paidAmount,
                    creditTotal,
                    creditRemaining,
                    usesTotal,
                    usesRemaining,
                };
            })
        );
    },
});

async function applyBonoEconomicsNormalization(
    ctx: any,
    opts?: { sellerIdFilter?: string },
) {
    const listings = await ctx.db
        .query("listings")
        .withIndex("by_type", (q: any) => q.eq("type", "bono"))
        .collect();

    let listingsPatched = 0;
    for (const listing of listings) {
        if (opts?.sellerIdFilter && listing.sellerId !== opts.sellerIdFilter) continue;
        const nextPrice = DEFAULT_BONO_PAID;
        const nextCredit = DEFAULT_BONO_CREDIT;
        const needsPatch =
            listing.price !== nextPrice ||
            listing.discountValue !== nextCredit ||
            listing.discountType !== "fixed" ||
            listing.validityDays == null;
        if (!needsPatch) continue;
        await ctx.db.patch(listing._id, {
            price: nextPrice,
            discountValue: nextCredit,
            discountType: "fixed",
            validityDays: listing.validityDays ?? DEFAULT_BONO_VALIDITY_DAYS,
            description:
                listing.description ||
                `Pagás $${nextPrice} y tenés $${nextCredit} de crédito para consumir en el negocio. Válido ${DEFAULT_BONO_VALIDITY_DAYS} días desde la compra.`,
            updatedAt: new Date().toISOString(),
        });
        listingsPatched++;
    }

    const redemptions = await ctx.db.query("bonoRedemptions").collect();
    let redemptionsPatched = 0;
    for (const bono of redemptions) {
        if (opts?.sellerIdFilter && bono.sellerId !== opts.sellerIdFilter) continue;
        if (
            bono.paidAmount != null &&
            bono.creditTotal != null &&
            bono.creditRemaining != null &&
            bono.usesTotal != null &&
            bono.usesRemaining != null
        ) {
            continue;
        }
        const listingNormId = ctx.db.normalizeId("listings", bono.listingId);
        const listing = listingNormId ? await ctx.db.get(listingNormId) : null;
        const eco = resolveBonoEconomics(listing);
        const isOpen = bono.status === "issued";
        await ctx.db.patch(bono._id, {
            paidAmount: bono.paidAmount ?? eco.paidAmount,
            creditTotal: bono.creditTotal ?? eco.creditTotal,
            creditRemaining:
                bono.creditRemaining ?? (isOpen ? eco.creditTotal : 0),
            usesTotal: bono.usesTotal ?? 1,
            usesRemaining: bono.usesRemaining ?? (isOpen ? 1 : 0),
        });
        redemptionsPatched++;
    }

    return { success: true as const, listingsPatched, redemptionsPatched };
}

/**
 * Normalize all active bono listings to pay $50 → $100 credit (fixed).
 * Also backfills issued redemptions missing credit fields.
 */
export const normalizeBonoEconomics = mutation({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        if (
            actor.role !== "admin" &&
            actor.role !== "developer" &&
            actor.role !== "business"
        ) {
            throw new Error("No autorizado para normalizar bonos");
        }

        return await applyBonoEconomicsNormalization(
            ctx,
            actor.role === "business" ? { sellerIdFilter: actor.idString } : undefined,
        );
    },
});

/** One-shot migration (CLI): npx convex run bonos:internalNormalizeBonoEconomics */
export const internalNormalizeBonoEconomics = internalMutation({
    args: {},
    handler: async (ctx) => applyBonoEconomicsNormalization(ctx),
});

// Seller-facing query: list bonos issued by a seller (history of all
// emitted vouchers — useful for the "Mis Bonos" tab in BusinessDashboard).
export const getBonosBySeller = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        sellerId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // ponytail: empty on missing session — don't crash HistoryScreen
        const actor = await getActorOrNull(ctx, (args as any).sessionToken);
        if (!actor) return [];
        const sellerId = args.sellerId ?? actor.idString;
        if (sellerId !== actor.idString && actor.role !== "admin") {
            throw new Error("No autorizado.");
        }
        const bonos = await ctx.db
            .query("bonoRedemptions")
            .withIndex("by_seller", (q) => q.eq("sellerId", sellerId))
            .order("desc")
            .collect();

        return await Promise.all(
            bonos.map(async (bono) => {
                const listingNormId = ctx.db.normalizeId("listings", bono.listingId);
                const listing = listingNormId ? await ctx.db.get(listingNormId) : null;
                
                const buyerNormId = ctx.db.normalizeId("users", bono.ownerUserId);
                const buyer = buyerNormId ? await ctx.db.get(buyerNormId) : null;
                
                return { ...bono, listing, buyer };
            })
        );
    },
});

// Lookup by code (used by the scanner before calling redeemBono, so the
// UI can preview seller name / amount before confirming).
export const lookupBono = query({
    args: { bonoCode: v.string() },
    handler: async (ctx, args) => {
        const bono = await ctx.db
            .query("bonoRedemptions")
            .withIndex("by_code", (q) => q.eq("bonoCode", args.bonoCode))
            .first();
        if (!bono) return null;
        
        // Hydrate listing for display.
        const listingNormId = ctx.db.normalizeId("listings", bono.listingId);
        const listing = listingNormId ? await ctx.db.get(listingNormId) : null;
        
        // Hydrate user for display
        const ownerNormId = ctx.db.normalizeId("users", bono.ownerUserId);
        const owner = ownerNormId ? await ctx.db.get(ownerNormId) : null;
        
        return { 
            ...bono, 
            listing,
            ownerName: owner ? (owner.name || owner.nickname || 'Cliente') : 'Cliente'
        };
    },
});

// ---------------------------------------------------------------------------
// Dev/Testing: seedMockBonos
// ---------------------------------------------------------------------------
export const seedMockBonos = mutation({
    args: {},
    handler: async (ctx) => {
        // Find a business user
        const businessUsers = await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("role"), "business"))
            .collect();
        
        if (businessUsers.length === 0) {
            throw new Error("No hay usuarios negocio en la DB");
        }

        // Pick the first business user as the mock seller
        const mockSeller = businessUsers[0];

        // Ensure this business has a bono listing
        let bonoListing = await ctx.db
            .query("listings")
            .withIndex("by_seller", (q) => q.eq("sellerId", mockSeller._id))
            .filter((q) => q.eq(q.field("type"), "bono"))
            .first();

        if (!bonoListing) {
            const listingId = await ctx.db.insert("listings", {
                sellerId: mockSeller._id,
                title: `Bono $${DEFAULT_BONO_CREDIT} (pagás $${DEFAULT_BONO_PAID})`,
                description: `Pagás $${DEFAULT_BONO_PAID} y tenés $${DEFAULT_BONO_CREDIT} de crédito en el negocio.`,
                price: DEFAULT_BONO_PAID,
                discountValue: DEFAULT_BONO_CREDIT,
                discountType: "fixed",
                currency: "USD",
                category: "bonos",
                tags: ["mock", "test"],
                slug: "bono-50-por-100-mock",
                stock: 9999,
                status: "active",
                type: "bono",
                condition: "new",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                validityDays: DEFAULT_BONO_VALIDITY_DAYS,
                validUntil: resolveBonoValidUntil({
                    validityDays: DEFAULT_BONO_VALIDITY_DAYS,
                }),
            });
            bonoListing = await ctx.db.get(listingId);
        } else {
            await ctx.db.patch(bonoListing._id, {
                price: DEFAULT_BONO_PAID,
                discountValue: DEFAULT_BONO_CREDIT,
                discountType: "fixed",
                validityDays: bonoListing.validityDays ?? DEFAULT_BONO_VALIDITY_DAYS,
                updatedAt: new Date().toISOString(),
            });
            bonoListing = await ctx.db.get(bonoListing._id);
        }

        // Give a bono to ALL users
        const allUsers = await ctx.db.query("users").collect();
        let seededCount = 0;

        for (const user of allUsers) {
            // Check if user already has a bono for this listing
            const existing = await ctx.db
                .query("bonoRedemptions")
                .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
                .filter((q) => q.eq(q.field("listingId"), String(bonoListing!._id)))
                .first();
            
            if (!existing) {
                const ts = Date.now().toString(36);
                const rand = Math.random().toString(36).slice(2, 6);
                const code = `MOCK-${ts}-${rand}`.toUpperCase();
                
                const eco = resolveBonoEconomics(bonoListing);
                await ctx.db.insert("bonoRedemptions", {
                    bonoCode: code,
                    listingId: String(bonoListing!._id),
                    ownerUserId: user._id,
                    sellerId: mockSeller._id,
                    validUntil: (bonoListing as any).validUntil,
                    ...eco,
                    status: "issued",
                    createdAt: new Date().toISOString(),
                });
                seededCount++;
            }
        }

        return `Seeded ${seededCount} bonos to mock users for seller ${mockSeller.name}`;
    }
});
