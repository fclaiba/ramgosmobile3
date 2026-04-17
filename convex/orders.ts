import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { assertAdminOrDeveloper, assertSelfOrAdmin, requireActor } from "./authHelpers";

// --- QUERIES ---

export const getMyOrders = query({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
        const targetUserId = args.userId ?? actor.idString;
        assertSelfOrAdmin(actor, targetUserId);

        // Fetch orders where userId matches
        const orders = await ctx.db
            .query("orders")
            .withIndex("by_user", (q) => q.eq("userId", targetUserId))
            .order("desc")
            .collect();
        return orders;
    },
});

export const getOrdersBySeller = query({
    args: {
        actorId: v.optional(v.id("users")),
        sellerId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
        const targetSellerId = args.sellerId ?? actor.idString;
        const isSelf = actor.idString === targetSellerId;
        if (!isSelf) {
            assertAdminOrDeveloper(actor);
        }

        const orders = await ctx.db
            .query("orders")
            .withIndex("by_seller", (q) => q.eq("sellerId", targetSellerId))
            .order("desc")
            .collect();
        return orders;
    },
});

// --- MUTATIONS ---

export const createOrder = mutation({
    args: {
        actorId: v.optional(v.id("users")),
        userId: v.optional(v.string()), // Buyer
        sellerId: v.string(),
        idempotencyKey: v.optional(v.string()),
        items: v.array(v.object({
            listingId: v.string(),
            title: v.string(),
            quantity: v.number(),
            price: v.number(),
        })),
        total: v.number(),
        currency: v.literal('USD'),
        shipping: v.optional(v.object({
            method: v.string(),
            cost: v.number(),
            address: v.object({
                fullName: v.string(),
                addressLine1: v.string(),
                city: v.string(),
                postalCode: v.string(),
                country: v.string(),
            })
        })),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);
        const buyerId = args.userId ?? actor.idString;
        assertSelfOrAdmin(actor, buyerId);

        if (args.idempotencyKey) {
            const existing = await ctx.db
                .query("orders")
                .withIndex("by_user_idempotency", (q) =>
                    q.eq("userId", buyerId).eq("idempotencyKey", args.idempotencyKey),
                )
                .first();
            if (existing) {
                return existing._id;
            }
        }

        // 1. Verify Stock for all items
        for (const item of args.items) {
            try {
                const listingId = ctx.db.normalizeId("listings", item.listingId);
                if (listingId) {
                    const listing = await ctx.db.get(listingId);
                    if (!listing) throw new Error(`Producto no encontrado: ${item.title}`);
                    if (listing.stock < item.quantity) throw new Error(`Stock insuficiente para: ${item.title}`);

                    // Decrement Stock
                    await ctx.db.patch(listingId, {
                        stock: listing.stock - item.quantity
                    });
                }
            } catch (e) {
                throw e;
            }
        }

        // 2. Create Order
        // Initially funds are "held" in escrow
        const orderId = await ctx.db.insert("orders", {
            userId: buyerId,
            sellerId: args.sellerId,
            items: args.items,
            total: args.total,
            currency: args.currency,
            shipping: args.shipping,
            idempotencyKey: args.idempotencyKey,
            status: "payment_received",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            escrowState: "held",
        });

        // 3. Move funds to Escrow logic
        // For MVP, "held" status is the implicit freeze.
        // OPTIONAL: If we enforce pre-funded wallet, check balance here:
        /*
        const buyer = await ctx.db.get(ctx.id("users", args.userId)); // naive ID usage
        if ((buyer?.balance ?? 0) < args.total) throw new Error("Saldo insuficiente");
        await ctx.db.patch(buyer._id, { balance: (buyer.balance ?? 0) - args.total });
        */

        return orderId;
    },
});

export const internalUpdateOrderStatus = internalMutation({
    args: {
        orderId: v.id("orders"),
        status: v.string(),
    },
    handler: async (ctx, args) => {
        // Since it's internal, we don't require an actor (it's called by HTTP webhook).
        await ctx.db.patch(args.orderId, {
            status: args.status as any,
            updatedAt: new Date().toISOString()
        });
    }
});


// 1. Mark as Shipped
export const markAsShipped = mutation({
    args: {
        orderId: v.id("orders"),
        trackingNumber: v.string(),
        carrier: v.string(),
        actorId: v.optional(v.id("users")),
        sellerId: v.optional(v.string()), // legacy fallback
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.sellerId);
        const order = await ctx.db.get(args.orderId);
        if (!order) throw new Error("Orden no encontrada");

        // Validate Authority
        const isSeller = order.sellerId === actor.idString;
        const isAdmin = actor.role === "admin" || actor.role === "developer";
        if (!isSeller && !isAdmin) {
            throw new Error("No autorizado. Solo el vendedor puede marcar enviado.");
        }

        // Validate State
        if (order.status !== 'payment_received') {
            throw new Error("Estado inválido. Solo se puede enviar órdenes pagadas.");
        }

        // Update
        await ctx.db.patch(args.orderId, {
            status: "in_transit",
            shipping: order.shipping ? {
                ...order.shipping,
                trackingNumber: args.trackingNumber,
                carrier: args.carrier
            } : undefined,
            updatedAt: new Date().toISOString()
        });
    }
});

// 2. Mark as Delivered
export const markAsDelivered = mutation({
    args: {
        orderId: v.id("orders"),
        actorId: v.optional(v.id("users")),
        sellerId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.sellerId);
        const order = await ctx.db.get(args.orderId);
        if (!order) throw new Error("Orden no encontrada");

        const isSeller = order.sellerId === actor.idString;
        const isAdmin = actor.role === "admin" || actor.role === "developer";
        if (!isSeller && !isAdmin) {
            throw new Error("No autorizado. Solo el vendedor puede marcar entregado.");
        }

        // Validate State
        if (order.status !== 'in_transit') {
            throw new Error("Estado inválido. La orden debe estar en tránsito.");
        }

        // Update
        await ctx.db.patch(args.orderId, {
            status: "delivered",
            updatedAt: new Date().toISOString()
            // Escrow timer would start here ideally
        });
    }
});

// 3. Confirm Receipt (Releases Escrow)
export const confirmReceipt = mutation({
    args: {
        orderId: v.id("orders"),
        actorId: v.optional(v.id("users")),
        userId: v.optional(v.string()), // Legacy buyer
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.userId);
        const order = await ctx.db.get(args.orderId);
        if (!order) throw new Error("Orden no encontrada");

        // Validate Authority
        if (order.userId !== actor.idString) {
            throw new Error("No autorizado. Solo el comprador puede confirmar recepción.");
        }

        // Validate State
        if (order.status !== 'delivered') {
            throw new Error("Estado inválido. La orden debe estar marcada como entregada.");
        }

        // RELEASE FUNDS
        await ctx.db.patch(args.orderId, {
            status: "completed",
            escrowState: "released",
            updatedAt: new Date().toISOString()
        });

        // Update Seller Wallet (Credit +total)
        // We need to resolve seller ID properly. 
        // Order has sellerId (string from earlier insert). 
        // We assume it maps to a user ID or we query it. 
        // In this architecture sellerId IS the user ID.
        try {
            // Need to fetch order again or trust we have it? We have 'order' var above.
            const sellerId = order.sellerId as Id<"users">; // Cast assuming strict linkage
            const seller = await ctx.db.get(sellerId);
            if (seller) {
                await ctx.db.patch(sellerId, {
                    balance: (seller.balance ?? 0) + order.total
                });
            }
        } catch (e) {
            console.error("Failed to credit seller wallet", e);
            // Critical error logging required here in prod
        }
    }
});

// 4. Cancel Order
export const cancelOrder = mutation({
    args: {
        orderId: v.id("orders"),
        actorId: v.optional(v.id("users")),
        userId: v.optional(v.string()), // Buyer (legacy)
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.userId);
        const order = await ctx.db.get(args.orderId);
        if (!order) throw new Error("Orden no encontrada");

        // Validate Authority
        if (order.userId !== actor.idString) {
            throw new Error("No autorizado.");
        }

        // Validate State
        if (order.status !== 'payment_received') {
            throw new Error("No se puede cancelar la orden en este estado (ya enviada o completada).");
        }

        // Update Status
        await ctx.db.patch(args.orderId, {
            status: "cancelled",
            escrowState: "refunded", // Implicit refund
            updatedAt: new Date().toISOString()
        });

        // Refund Buyer (Mirroring the deduction logic)
        try {
            // In a real implementation we would have deducted this amount at creation.
            // We return it here.
            const buyerId = order.userId as Id<"users">;
            const buyer = await ctx.db.get(buyerId);
            if (buyer) {
                await ctx.db.patch(buyerId, {
                    balance: (buyer.balance ?? 0) + order.total
                });
            }
        } catch (e) {
            console.error("Failed to refund buyer", e);
        }

        // Restore Stock
        for (const item of order.items) {
            const listingId = ctx.db.normalizeId("listings", item.listingId);
            if (listingId) {
                const listing = await ctx.db.get(listingId);
                if (listing) {
                    await ctx.db.patch(listingId, {
                        stock: listing.stock + item.quantity
                    });
                }
            }
        }
    }
});

// 5. Open Dispute
export const openDispute = mutation({
    args: {
        orderId: v.id("orders"),
        actorId: v.optional(v.id("users")),
        userId: v.optional(v.string()), // Buyer or Seller (legacy)
        reason: v.string()
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.userId);
        const order = await ctx.db.get(args.orderId);
        if (!order) throw new Error("Orden no encontrada");

        // Validate Authority
        if (order.userId !== actor.idString && order.sellerId !== actor.idString) {
            throw new Error("No autorizado.");
        }

        // Validate State
        if (order.status === 'completed' || order.status === 'cancelled') {
            throw new Error("No se puede disputar una orden ya finalizada.");
        }

        // FREEZE FUNDS
        await ctx.db.patch(args.orderId, {
            status: "disputed",
            escrowState: "frozen",
            updatedAt: new Date().toISOString()
        });
    }
});

export const escalateDispute = mutation({
    args: {
        orderId: v.id("orders"),
        actorId: v.optional(v.id("users")),
        userId: v.optional(v.string()),
        role: v.union(v.literal('buyer'), v.literal('seller')),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.userId);
        const order = await ctx.db.get(args.orderId);
        if (!order) throw new Error("Orden no encontrada");

        const isBuyer = order.userId === actor.idString && args.role === 'buyer';
        const isSeller = order.sellerId === actor.idString && args.role === 'seller';
        if (!isBuyer && !isSeller) {
            throw new Error("No autorizado para escalar esta disputa.");
        }

        if (order.status !== 'disputed') {
            throw new Error("Solo se pueden escalar órdenes en disputa.");
        }

        await ctx.db.patch(args.orderId, {
            updatedAt: new Date().toISOString(),
        });

        await ctx.db.insert("audit_logs", {
            actorUserId: actor.idString,
            targetUserId: order.sellerId,
            action: "DISPUTE_ESCALATED",
            timestamp: new Date().toISOString(),
            metadata: { orderId: args.orderId, role: args.role }
        });
    }
});
