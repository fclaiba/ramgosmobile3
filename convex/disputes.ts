import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
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
