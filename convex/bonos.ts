/**
 * convex/bonos.ts — Bono (prepaid credit voucher) lifecycle.
 *
 * Economics (NOT % discount / 2x1):
 *   Buyer pays listing.price (e.g. $50) and receives listing.discountValue
 *   credit (e.g. $100) to spend at the issuing business (sellerId).
 *
 * Lifecycle:
 *   1. Buyer purchases a `listings` row of type 'bono' through marketplace
 *      checkout. Payment succeeds → `internalIssueBonosForPayment` /
 *      `internalIssueBonosForOrder` emit `bonoRedemptions` (status=issued).
 *   2. App shows bonoCode + QR to the buyer.
 *   3. Business POS scans via `redeemBono`. Validates seller + issued +
 *      not expired, then marks redeemed and auto-releases escrow.
 *
 * Influencer attribution on sale uses cart line `referralCode` (campaigns),
 * not sellerId. Influencers may create listings with sellerId=business and
 * createdByInfluencerId=self when campaign/whitelist is active.
 */

import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getActorOrNull, requireActor } from "./authHelpers";
import {
    DEFAULT_BONO_CREDIT,
    DEFAULT_BONO_PAID,
    DEFAULT_BONO_VALIDITY_DAYS,
    resolveBonoEconomics,
} from "./bonoEconomics";

export {
    DEFAULT_BONO_CREDIT,
    DEFAULT_BONO_PAID,
    DEFAULT_BONO_VALIDITY_DAYS,
    assertBonoEconomics,
    resolveBonoEconomics,
} from "./bonoEconomics";

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

/**
 * Redemption expiry for a newly issued bono.
 * Prefer store-configured `validityDays` (relative from purchase).
 * Fall back to listing.validUntil if still in the future (legacy absolute).
 * Otherwise standard = 4 days.
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
        const issuerSellerId =
            String((listing as any).sellerId || payment.sellerId || "");
        if (!issuerSellerId) {
            console.warn(
                `[Bonos] No sellerId for payment ${args.paymentId}; skipping`,
            );
            return;
        }
        for (let i = 0; i < quantity; i++) {
            const code = generateBonoCode();
            await ctx.db.insert("bonoRedemptions", {
                bonoCode: code,
                listingId,
                ownerUserId: payment.userId,
                sellerId: issuerSellerId,
                paymentId: String(args.paymentId),
                orderId: payment.orderId ?? undefined,
                validUntil,
                ...economics,
                status: "issued",
                createdAt: new Date().toISOString(),
            });
            if (payment.userId) {
                await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                    userId: String(payment.userId),
                    title: "Tu bono está listo",
                    body: `Crédito ${economics.creditTotal} acreditado. Mostralo desde Historial → Usar bono.`,
                    category: "order" as const,
                    data: { type: "bono_issued", bonoCode: code, listingId },
                });
            }
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
            const issuerSellerId = String(
                (listing as any).sellerId || order.sellerId || "",
            );
            if (!issuerSellerId) continue;
            for (let i = 0; i < item.quantity; i++) {
                const code = generateBonoCode();
                await ctx.db.insert("bonoRedemptions", {
                    bonoCode: code,
                    listingId: item.listingId,
                    ownerUserId: order.userId,
                    sellerId: issuerSellerId,
                    orderId: String(args.orderId),
                    validUntil,
                    ...economics,
                    status: "issued",
                    createdAt: new Date().toISOString(),
                });
                if (order.userId) {
                    const title =
                        (listing as any).title ||
                        (item as any).title ||
                        "tu bono";
                    await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                        userId: String(order.userId),
                        title: "Tu bono está listo",
                        body: `${title}: crédito $${economics.creditTotal} acreditado. Abrí Historial → Usar bono.`,
                        category: "order" as const,
                        data: {
                            type: "bono_issued",
                            bonoCode: code,
                            listingId: item.listingId,
                            orderId: String(args.orderId),
                        },
                    });
                }
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
        const code = String(args.bonoCode || "")
            .trim()
            .replace(/\s+/g, "")
            .toUpperCase();

        const bono = await ctx.db
            .query("bonoRedemptions")
            .withIndex("by_code", (q) => q.eq("bonoCode", code))
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
                if (order && order.escrowState === "held" && !order.escrowReleaseError) {
                    // La liberación real (transfer) la hace stripe.ts; el bono
                    // queda canjeado aunque el transfer falle (queda visible).
                    await ctx.scheduler.runAfter(0, internal.stripe.internalReleaseOrderEscrow, {
                        orderId: orderNormId,
                        trigger: "bono_redeemed",
                    });
                }
            }
        }

        if (bono.ownerUserId) {
            let listingTitle = "tu bono";
            const listingNorm = ctx.db.normalizeId("listings", bono.listingId);
            if (listingNorm) {
                const listing = await ctx.db.get(listingNorm);
                if (listing && (listing as any).title) {
                    listingTitle = String((listing as any).title);
                }
            }
            await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                userId: String(bono.ownerUserId),
                title: "Bono canjeado",
                body: `${listingTitle} fue canjeado en el negocio. El crédito ya se usó.`,
                category: "order" as const,
                data: {
                    type: "bono_redeemed",
                    bonoCode: bono.bonoCode,
                    listingId: bono.listingId,
                },
            });
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

/** Alias — buyer purchased / issued vouchers. */
export const getMyIssuedBonos = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Delegate to same logic as getMyBonos (keep one implementation path).
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
                const eco = resolveBonoEconomics(listing);
                const paidAmount = bono.paidAmount ?? eco.paidAmount;
                const creditTotal = bono.creditTotal ?? eco.creditTotal;
                const usesTotal = bono.usesTotal ?? 1;
                const isOpen = bono.status === "issued";
                return {
                    ...bono,
                    listing,
                    seller,
                    paidAmount,
                    creditTotal,
                    creditRemaining:
                        bono.creditRemaining ?? (isOpen ? creditTotal : 0),
                    usesTotal,
                    usesRemaining: bono.usesRemaining ?? (isOpen ? usesTotal : 0),
                };
            }),
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

                const eco = resolveBonoEconomics(listing);
                return {
                    ...bono,
                    listing,
                    buyer,
                    paidAmount: bono.paidAmount ?? eco.paidAmount,
                    creditTotal: bono.creditTotal ?? eco.creditTotal,
                    creditRemaining:
                        bono.creditRemaining ??
                        (bono.status === "issued" ? eco.creditTotal : 0),
                };
            })
        );
    },
});

/** Alias — business POS / history of issued vouchers. */
export const getBusinessBonos = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        sellerId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
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
                const eco = resolveBonoEconomics(listing);
                return {
                    ...bono,
                    listing,
                    buyer,
                    paidAmount: bono.paidAmount ?? eco.paidAmount,
                    creditTotal: bono.creditTotal ?? eco.creditTotal,
                    creditRemaining:
                        bono.creditRemaining ??
                        (bono.status === "issued" ? eco.creditTotal : 0),
                };
            }),
        );
    },
});

// Lookup by code (POS preview before redeemBono). Auth required — business/admin only.
export const lookupBono = query({
    args: {
        sessionToken: v.optional(v.string()),
        bonoCode: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, (args as any).sessionToken);
        if (!actor) return null;
        const role = actor.role;
        if (
            role !== "business" &&
            role !== "admin" &&
            role !== "developer"
        ) {
            return null;
        }

        const code = String(args.bonoCode || "")
            .trim()
            .replace(/\s+/g, "")
            .toUpperCase();
        if (!code) return null;

        const bono = await ctx.db
            .query("bonoRedemptions")
            .withIndex("by_code", (q) => q.eq("bonoCode", code))
            .first();
        if (!bono) return null;

        const listingNormId = ctx.db.normalizeId("listings", bono.listingId);
        const listing = listingNormId ? await ctx.db.get(listingNormId) : null;

        const ownerNormId = ctx.db.normalizeId("users", bono.ownerUserId);
        const owner = ownerNormId ? await ctx.db.get(ownerNormId) : null;

        const eco = resolveBonoEconomics(listing);

        return {
            ...bono,
            listing,
            ownerName: owner
                ? owner.name || owner.nickname || "Cliente"
                : "Cliente",
            paidAmount: bono.paidAmount ?? eco.paidAmount,
            creditTotal: bono.creditTotal ?? eco.creditTotal,
            creditRemaining:
                bono.creditRemaining ??
                (bono.status === "issued" ? eco.creditTotal : 0),
            usesTotal: bono.usesTotal ?? eco.usesTotal,
            usesRemaining:
                bono.usesRemaining ??
                (bono.status === "issued" ? eco.usesTotal : 0),
        };
    },
});

// ---------------------------------------------------------------------------
// Dev/Testing: seedMockBonos
//
// Era `mutation` pública sin `requireActor`: cualquier cliente con la URL del
// deployment (pública en el bundle) podía invocarla y crear bonos `issued`
// sobre un negocio real, canjeables como crédito de verdad (E-149, TRV-01).
// `internalMutation` sólo se invoca desde el dashboard o `npx convex run`.
// ---------------------------------------------------------------------------
export const seedMockBonos = internalMutation({
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
