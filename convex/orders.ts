import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { assertAdminOrDeveloper, assertSelfOrAdmin, requireActor } from "./authHelpers";

const isStorageId = (url?: string | null) =>
    !!url &&
    !url.startsWith("http") &&
    !url.startsWith("blob:") &&
    !url.startsWith("data:") &&
    url.length < 64;

async function resolveMaybeStorageUrl(ctx: any, url?: string | null): Promise<string | undefined> {
    if (!url) return undefined;
    if (!isStorageId(url)) return url;
    try {
        const resolved = await ctx.storage.getUrl(url);
        return resolved || undefined;
    } catch {
        return undefined;
    }
}

/** Attach a usable product image URL to each order line (snapshot or listing). */
async function enrichOrderItems(ctx: any, items: any[]) {
    return Promise.all(
        (items || []).map(async (item: any) => {
            let image = await resolveMaybeStorageUrl(ctx, item?.image);
            if (!image && item?.listingId) {
                const listingId = ctx.db.normalizeId("listings", item.listingId);
                if (listingId) {
                    const listing: any = await ctx.db.get(listingId);
                    if (listing) {
                        image =
                            (await resolveMaybeStorageUrl(ctx, listing.image)) ||
                            (await resolveMaybeStorageUrl(ctx, listing.gallery?.[0])) ||
                            (await resolveMaybeStorageUrl(ctx, listing.images?.[0]?.url));
                    }
                }
            }
            return image ? { ...item, image } : item;
        }),
    );
}

async function presentOrder(ctx: any, order: any) {
    const items = await enrichOrderItems(ctx, order.items);
    const base = { ...order, items };
    if (order.escrowState) {
        return {
            ...base,
            escrow: {
                state: order.escrowState,
                releaseScheduledAt: new Date(
                    new Date(order.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000,
                ).toISOString(),
            },
        };
    }
    return base;
}

// --- QUERIES ---

export const getMyOrders = query({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await requireActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
        const targetUserId = args.userId ?? actor.idString;
        assertSelfOrAdmin(actor, targetUserId);

        // Fetch orders where userId matches
        const orders = await ctx.db
            .query("orders")
            .withIndex("by_user", (q) => q.eq("userId", targetUserId))
            .order("desc")
            .collect();
        return Promise.all(orders.map((order) => presentOrder(ctx, order)));
    },
});

export const getOrdersBySeller = query({
    args: {
        sessionToken: v.optional(v.string()),
        sellerId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await requireActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
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
        return Promise.all(orders.map((order) => presentOrder(ctx, order)));
    },
});

export const getOrderById = query({
    args: {
        sessionToken: v.optional(v.string()),
        orderId: v.id("orders"),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const order = await ctx.db.get(args.orderId);
        if (!order) return null;
        const isBuyer = order.userId === actor.idString;
        const isSeller = order.sellerId === actor.idString;
        const isAdmin = actor.role === "admin" || actor.role === "developer";
        if (!isBuyer && !isSeller && !isAdmin) {
            throw new Error("No autorizado para ver esta orden.");
        }
        return presentOrder(ctx, order);
    },
});

// --- MUTATIONS ---

export const createOrder = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.optional(v.string()), // Buyer (optional, defaults to self)
        sellerId: v.string(),
        idempotencyKey: v.optional(v.string()),
        items: v.array(v.object({
            listingId: v.string(),
            title: v.string(),
            quantity: v.number(),
            price: v.number(),
            image: v.optional(v.string()),
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
        const actor = await requireActor(ctx, (args as any).sessionToken);
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

        // 3. Notify seller — fire-and-forget so order creation isn't
        // blocked by a slow Expo Push API. Buyer doesn't need a
        // synchronous push because they triggered the action.
        const shortOrderId = String(orderId).slice(-6);
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: args.sellerId,
            title: 'Nueva orden recibida',
            body: `Pedido #${shortOrderId} por $${args.total.toFixed(2)} ${args.currency}`,
            category: 'order',
            data: { type: 'order_created', orderId: String(orderId) },
        });

        // 4. Issue bonos if any items in the order are of type 'bono'
        const hasBonos = args.items.some(i => i.title.toLowerCase().includes('bono')); // Fast heuristic, true check is in the mutation
        await ctx.scheduler.runAfter(0, internal.bonos.internalIssueBonosForOrder, {
            orderId: orderId,
        });

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
        sessionToken: v.optional(v.string()),
        orderId: v.id("orders"),
        trackingNumber: v.string(),
        carrier: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
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

        const shortOrderId = String(args.orderId).slice(-6);
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: order.userId,
            title: 'Tu pedido fue enviado',
            body: `Pedido #${shortOrderId} en camino${args.trackingNumber ? ` (track: ${args.trackingNumber})` : ''}`,
            category: 'order',
            data: { type: 'order_shipped', orderId: String(args.orderId), trackingNumber: args.trackingNumber, carrier: args.carrier },
        });
    }
});

// 2. Mark as Delivered
export const markAsDelivered = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        orderId: v.id("orders"),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
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

        const shortOrderId = String(args.orderId).slice(-6);
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: order.userId,
            title: 'Confirmá la recepción',
            body: `Tu pedido #${shortOrderId} fue marcado como entregado. Confirmá para liberar fondos.`,
            category: 'order',
            data: { type: 'order_delivered', orderId: String(args.orderId) },
        });
    }
});

// 3. Confirm Receipt (Releases Escrow)
export const confirmReceipt = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        orderId: v.id("orders"),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const order = await ctx.db.get(args.orderId);
        if (!order) throw new Error("Orden no encontrada");

        // Validate Authority
        if (order.userId !== actor.idString) {
            throw new Error("No autorizado. Solo el comprador puede confirmar recepción.");
        }

        // Validate State — paid_escrow is the marketplace held state
        const releasable = ['delivered', 'payment_received', 'paid_escrow'];
        if (!releasable.includes(order.status)) {
            throw new Error("Estado inválido. La orden debe estar entregada o lista para liberar.");
        }

        await ctx.db.patch(args.orderId, {
            status: "completed",
            escrowState: "released",
            updatedAt: new Date().toISOString()
        });

        // Hand off to the Stripe-aware release flow.
        await ctx.runMutation(internal.stripe.internalReleasePayment, {
            orderId: args.orderId,
        });

        const shortOrderId = String(args.orderId).slice(-6);
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: order.sellerId,
            title: 'Fondos liberados',
            body: `El comprador confirmó la recepción del pedido #${shortOrderId}. Tus fondos están disponibles.`,
            category: 'payment',
            data: { type: 'escrow_released', orderId: String(args.orderId), amount: order.total },
        });
    }
});

// 4. Cancel Order
export const cancelOrder = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        orderId: v.id("orders"),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
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
        sessionToken: v.optional(v.string()),
        orderId: v.id("orders"),
        reason: v.string(),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
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
            escrowState: "disputed",
            updatedAt: new Date().toISOString()
        });

        // Notify the OTHER party
        const initiatorIsBuyer = actor.idString === order.userId;
        const otherPartyId = initiatorIsBuyer ? order.sellerId : order.userId;
        const shortOrderId = String(args.orderId).slice(-6);
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: otherPartyId,
            title: 'Disputa abierta en tu orden',
            body: `${initiatorIsBuyer ? 'El comprador' : 'El vendedor'} abrió una disputa en el pedido #${shortOrderId}.`,
            category: 'dispute',
            data: { type: 'dispute_opened', orderId: String(args.orderId), reason: args.reason },
        });
    }
});

export const escalateDispute = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        orderId: v.id("orders"),
        role: v.union(v.literal('buyer'), v.literal('seller')),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
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

        // Notify both parties + admins.
        const shortOrderId = String(args.orderId).slice(-6);
        const otherPartyId = args.role === 'buyer' ? order.sellerId : order.userId;
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: otherPartyId,
            title: 'Disputa escalada al equipo',
            body: `La disputa del pedido #${shortOrderId} fue escalada al soporte de Ramgos.`,
            category: 'dispute',
            data: { type: 'dispute_escalated', orderId: String(args.orderId) },
        });
        await ctx.scheduler.runAfter(0, internal.notifications.internalNotifyAdmins, {
            title: 'Disputa escalada',
            body: `Pedido #${shortOrderId} escalado por ${args.role === 'buyer' ? 'el comprador' : 'el vendedor'}.`,
            category: 'dispute',
            data: { type: 'dispute_escalated_admin', orderId: String(args.orderId) },
        });
    }
});
