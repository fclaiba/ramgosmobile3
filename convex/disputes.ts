import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor } from "./authHelpers";

// PHASE 4: Dispute Chat and Evidence Management

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
        orderId: v.string(),
        actorId: v.optional(v.id("users")),
        senderId: v.optional(v.string()),
        sender: v.union(v.literal('buyer'), v.literal('seller'), v.literal('support')),
        body: v.string(),
        attachments: v.optional(v.array(v.object({
            type: v.union(v.literal('image'), v.literal('video'), v.literal('document')),
            url: v.string(),
            filename: v.string(),
        }))),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.senderId);
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

        // Notify the OTHER party (or both buyer + seller when sender is support).
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
        orderId: v.string(),
        actorId: v.optional(v.id("users")),
        requesterId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.requesterId);
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
        orderId: v.string(),
        actorId: v.optional(v.id("users")),
        uploadedBy: v.union(v.literal('buyer'), v.literal('seller'), v.literal('support')),
        uploadedByUserId: v.optional(v.string()),
        type: v.union(v.literal('photo'), v.literal('video'), v.literal('note')),
        url: v.optional(v.string()),
        description: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.uploadedByUserId);
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
                : null; // support → don't push to anyone synchronously
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
        orderId: v.string(),
        actorId: v.optional(v.id("users")),
        requesterId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.requesterId);
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

// Helper to get complete dispute info (messages + evidence)
export const getDisputeDetails = query({
    args: {
        orderId: v.string(),
        actorId: v.optional(v.id("users")),
        requesterId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId ?? args.requesterId);
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
