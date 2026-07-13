import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor } from "./authHelpers";

// PHASE 4: Dispute Chat and Evidence Management

/**
 * Creates a new dispute for an order.
 * - Transitions order status to 'disputed'.
 * - Creates an initial dispute message with the reason.
 * - Notifies the counter-party.
 */
export const createDispute = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        orderId: v.string(),
        reason: v.string(),
        description: v.string(),
        role: v.union(v.literal('buyer'), v.literal('seller')),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);

        // Validate order
        const orderId = ctx.db.normalizeId("orders", args.orderId);
        if (!orderId) throw new Error("Orden no encontrada");
        const order = await ctx.db.get(orderId);
        if (!order) throw new Error("Orden no encontrada");

        // Verify the caller is either buyer or seller
        if (args.role === 'buyer' && order.userId !== actor.idString) {
            throw new Error("No autorizado — solo el comprador puede abrir una disputa como buyer.");
        }
        if (args.role === 'seller' && order.sellerId !== actor.idString) {
            throw new Error("No autorizado — solo el vendedor puede abrir una disputa como seller.");
        }

        // Prevent duplicate disputes
        if (order.status === 'disputed') {
            throw new Error("Esta orden ya tiene una disputa abierta.");
        }

        // Only allow disputes on certain statuses
        const disputeableStatuses = ['payment_received', 'awaiting_shipment', 'in_transit', 'delivered', 'completed'];
        if (!disputeableStatuses.includes(order.status)) {
            throw new Error(`No se puede disputar una orden con estado "${order.status}".`);
        }

        // Transition order to disputed
        await ctx.db.patch(orderId, {
            status: 'disputed',
            updatedAt: new Date().toISOString(),
        });

        // Create the opening dispute message
        const now = new Date().toISOString();
        await ctx.db.insert("disputeMessages", {
            orderId: args.orderId,
            sender: args.role,
            senderUserId: actor.idString,
            body: `**Motivo:** ${args.reason}\n\n${args.description}`,
            sentAt: now,
        });

        // Notify the counter-party
        const shortOrderId = String(args.orderId).slice(-6);
        const counterPartyId = args.role === 'buyer' ? order.sellerId : order.userId;
        const senderLabel = args.role === 'buyer' ? 'El comprador' : 'El vendedor';

        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            userId: counterPartyId,
            title: `Disputa abierta en orden #${shortOrderId}`,
            body: `${senderLabel} ha abierto una disputa: ${args.reason}`,
            category: 'dispute',
            data: { type: 'dispute_created', orderId: args.orderId, reason: args.reason },
        });

        return { success: true, orderId: args.orderId };
    },
});

const isSupportUser = async (ctx: any, userId: string) => {
    const normalized = ctx.db.normalizeId("users", userId);
    if (!normalized) return false;
    const user = await ctx.db.get(normalized);
    if (!user) return false;
    return user.role === 'admin' || user.role === 'developer';
};

const assertOrderParticipantOrSupport = async (ctx: any, order: any, requesterId: string) => {
    const isParticipant = order.userId === requesterId || order.sellerId === requesterId;
    if (isParticipant) return;
    const support = await isSupportUser(ctx, requesterId);
    if (!support) throw new Error("No autorizado");
};

export const addDisputeMessage = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        orderId: v.string(),
        sender: v.union(v.literal('buyer'), v.literal('seller'), v.literal('support')),
        body: v.string(),
        attachments: v.optional(v.array(v.object({
            type: v.union(v.literal('image'), v.literal('video'), v.literal('document')),
            url: v.string(),
            filename: v.string(),
        }))),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        // Verify order exists
        const orderId = ctx.db.normalizeId("orders", args.orderId);
        if (!orderId) throw new Error("Orden no encontrada");

        const order = await ctx.db.get(orderId);
        if (!order) throw new Error("Orden no encontrada");

        // Verify sender authorization
        if (args.sender === 'buyer' && order.userId !== actor.idString) {
            throw new Error("No autorizado");
        }
        if (args.sender === 'seller' && order.sellerId !== actor.idString) {
            throw new Error("No autorizado");
        }
        if (args.sender === 'support' && !(await isSupportUser(ctx, actor.idString))) {
            throw new Error("No autorizado");
        }

        await ctx.db.insert("disputeMessages", {
            orderId: args.orderId,
            sender: args.sender,
            senderUserId: actor.idString,
            body: args.body,
            attachments: args.attachments,
            sentAt: new Date().toISOString(),
        });

        // Notify the OTHER party
        const shortOrderId = String(args.orderId).slice(-6);
        const preview = args.body.length > 80 ? args.body.slice(0, 77) + '…' : args.body;
        const recipients: string[] = [];
        if (args.sender === 'buyer') recipients.push(order.sellerId);
        else if (args.sender === 'seller') recipients.push(order.userId);
        else if (args.sender === 'support') {
            if (order.userId !== actor.idString) recipients.push(order.userId);
            if (order.sellerId !== actor.idString) recipients.push(order.sellerId);
        }

        for (const recipientId of recipients) {
            await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                userId: recipientId,
                title: `Nuevo mensaje en disputa #${shortOrderId}`,
                body: preview,
                category: 'dispute',
                data: { type: 'dispute_message', orderId: args.orderId, sender: args.sender },
            });
        }
    },
});

export const getDisputeMessages = query({
    args: {
        sessionToken: v.optional(v.string()),
        orderId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const orderId = ctx.db.normalizeId("orders", args.orderId);
        if (!orderId) throw new Error("Orden no encontrada");
        const order = await ctx.db.get(orderId);
        if (!order) throw new Error("Orden no encontrada");
        await assertOrderParticipantOrSupport(ctx, order, actor.idString);

        return await ctx.db
            .query("disputeMessages")
            .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
            .order("asc") // Chronological
            .collect();
    },
});

export const addEvidence = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        orderId: v.string(),
        uploadedBy: v.union(v.literal('buyer'), v.literal('seller'), v.literal('support')),
        type: v.union(v.literal('photo'), v.literal('video'), v.literal('note')),
        url: v.optional(v.string()),
        description: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        // Verify order exists
        const orderId = ctx.db.normalizeId("orders", args.orderId);
        if (!orderId) throw new Error("Orden no encontrada");

        const order = await ctx.db.get(orderId);
        if (!order) throw new Error("Orden no encontrada");

        // Verify authorization
        if (args.uploadedBy === 'buyer' && order.userId !== actor.idString) {
            throw new Error("No autorizado");
        }
        if (args.uploadedBy === 'seller' && order.sellerId !== actor.idString) {
            throw new Error("No autorizado");
        }
        if (args.uploadedBy === 'support' && !(await isSupportUser(ctx, actor.idString))) {
            throw new Error("No autorizado");
        }

        await ctx.db.insert("disputeEvidence", {
            orderId: args.orderId,
            uploadedBy: args.uploadedBy,
            uploadedByUserId: actor.idString,
            type: args.type,
            url: args.url,
            description: args.description,
            uploadedAt: new Date().toISOString(),
        });

        // Notify the other party that new evidence was uploaded.
        const shortOrderId = String(args.orderId).slice(-6);
        const otherPartyId = args.uploadedBy === 'buyer'
            ? order.sellerId
            : args.uploadedBy === 'seller'
                ? order.userId
                : null;
        if (otherPartyId) {
            await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                userId: otherPartyId,
                title: `Nueva evidencia en disputa #${shortOrderId}`,
                body: `${args.uploadedBy === 'buyer' ? 'El comprador' : 'El vendedor'} agregó ${args.type === 'photo' ? 'una foto' : args.type === 'video' ? 'un video' : 'una nota'}.`,
                category: 'dispute',
                data: { type: 'dispute_evidence', orderId: args.orderId, evidenceType: args.type },
            });
        }
    },
});

export const getDisputeEvidence = query({
    args: {
        sessionToken: v.optional(v.string()),
        orderId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const orderId = ctx.db.normalizeId("orders", args.orderId);
        if (!orderId) throw new Error("Orden no encontrada");
        const order = await ctx.db.get(orderId);
        if (!order) throw new Error("Orden no encontrada");
        await assertOrderParticipantOrSupport(ctx, order, actor.idString);

        return await ctx.db
            .query("disputeEvidence")
            .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
            .collect();
    },
});

/**
 * Internal query: gets order + user role for dispute resolution auth.
 */
export const internalGetOrderAndRole = internalQuery({
    args: {
        orderIdString: v.string(),
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        const orderId = ctx.db.normalizeId("orders", args.orderIdString);
        if (!orderId) return null;
        const order = await ctx.db.get(orderId);
        if (!order) return null;

        const userDocId = ctx.db.normalizeId("users", args.userId);
        const user = userDocId ? await ctx.db.get(userDocId) : null;
        const isSupport = user?.role === 'admin' || user?.role === 'developer';

        return {
            orderId,
            order,
            isSupport,
        };
    },
});

/**
 * Internal mutation: applies dispute resolution DB changes.
 */
export const internalApplyDisputeResolution = internalMutation({
    args: {
        orderId: v.id("orders"),
        resolveInFavorOf: v.union(v.literal('buyer'), v.literal('seller')),
        resolutionNote: v.optional(v.string()),
        resolverUserId: v.string(),
        sellerId: v.string(),
        buyerId: v.string(),
    },
    handler: async (ctx, args) => {
        const now = new Date().toISOString();

        if (args.resolveInFavorOf === 'buyer') {
            await ctx.db.patch(args.orderId, {
                status: 'cancelled',
                escrowState: 'refunded',
                updatedAt: now,
            });
        } else {
            await ctx.db.patch(args.orderId, {
                status: 'completed',
                escrowState: 'released',
                updatedAt: now,
            });
        }

        if (args.resolutionNote) {
            await ctx.db.insert("disputeMessages", {
                orderId: String(args.orderId),
                sender: 'support',
                senderUserId: args.resolverUserId,
                body: `**Resolución:** ${args.resolutionNote}`,
                sentAt: now,
            });
        }

        await ctx.db.insert("audit_logs", {
            actorUserId: args.resolverUserId,
            targetUserId: args.sellerId,
            action: "DISPUTE_RESOLVED",
            timestamp: now,
            metadata: {
                orderId: String(args.orderId),
                resolveInFavorOf: args.resolveInFavorOf,
                resolutionNote: args.resolutionNote,
            },
        });
    },
});

/**
 * Resolves a dispute — admin/support decides outcome.
 * - resolveInFavorOf: "buyer" → refund (escrow → refunded), "seller" → release (escrow → released)
 * Transitions order from "disputed" to "completed" or "cancelled".
 */
export const resolveDispute = action({
    args: {
        sessionToken: v.optional(v.string()),
        orderId: v.string(),
        resolveInFavorOf: v.union(v.literal('buyer'), v.literal('seller')),
        resolutionNote: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);

        const data = await ctx.runQuery(internal.disputes.internalGetOrderAndRole, {
            orderIdString: args.orderId,
            userId: actor.idString,
        });

        if (!data) throw new Error("Orden no encontrada");
        if (!data.isSupport) throw new Error("No autorizado — solo soporte/admin puede resolver disputas.");

        const { orderId, order } = data;
        if (order.status !== 'disputed') {
            throw new Error("La orden no está en estado de disputa.");
        }

        await ctx.runMutation(internal.disputes.internalApplyDisputeResolution, {
            orderId,
            resolveInFavorOf: args.resolveInFavorOf,
            resolutionNote: args.resolutionNote,
            resolverUserId: actor.idString,
            sellerId: order.sellerId,
            buyerId: order.userId,
        });

        if (args.resolveInFavorOf === 'seller') {
            await ctx.runMutation(internal.stripe.internalReleasePayment, {
                orderId,
            });
        }

        const shortOrderId = String(args.orderId).slice(-6);
        const outcomeMsg = args.resolveInFavorOf === 'buyer'
            ? 'a favor del comprador (reembolso)'
            : 'a favor del vendedor (liberación de fondos)';

        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            userId: order.userId,
            title: `Disputa resuelta #${shortOrderId}`,
            body: `La disputa se resolvió ${outcomeMsg}.`,
            category: 'dispute',
            data: { type: 'dispute_resolved', orderId: args.orderId, resolveInFavorOf: args.resolveInFavorOf },
        });
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            userId: order.sellerId,
            title: `Disputa resuelta #${shortOrderId}`,
            body: `La disputa se resolvió ${outcomeMsg}.`,
            category: 'dispute',
            data: { type: 'dispute_resolved', orderId: args.orderId, resolveInFavorOf: args.resolveInFavorOf },
        });

        return { success: true, orderId: args.orderId, resolveInFavorOf: args.resolveInFavorOf };
    },
});

// Helper to get complete dispute info (messages + evidence)
export const getDisputeDetails = query({
    args: {
        sessionToken: v.optional(v.string()),
        orderId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const orderId = ctx.db.normalizeId("orders", args.orderId);
        if (!orderId) throw new Error("Orden no encontrada");
        const order = await ctx.db.get(orderId);
        if (!order) throw new Error("Orden no encontrada");
        await assertOrderParticipantOrSupport(ctx, order, actor.idString);

        const messages = await ctx.db
            .query("disputeMessages")
            .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
            .order("asc")
            .collect();

        const evidence = await ctx.db
            .query("disputeEvidence")
            .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
            .collect();

        return {
            messages,
            evidence,
        };
    },
});
