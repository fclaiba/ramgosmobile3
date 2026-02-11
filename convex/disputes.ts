import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// PHASE 4: Dispute Chat and Evidence Management

export const addDisputeMessage = mutation({
    args: {
        orderId: v.string(),
        senderId: v.string(),
        sender: v.union(v.literal('buyer'), v.literal('seller'), v.literal('support')),
        body: v.string(),
        attachments: v.optional(v.array(v.object({
            type: v.union(v.literal('image'), v.literal('video'), v.literal('document')),
            url: v.string(),
            filename: v.string(),
        }))),
    },
    handler: async (ctx, args) => {
        // Verify order exists
        const orderId = ctx.db.normalizeId("orders", args.orderId);
        if (!orderId) throw new Error("Orden no encontrada");

        const order = await ctx.db.get(orderId);
        if (!order) throw new Error("Orden no encontrada");

        // Verify sender authorization
        if (args.sender === 'buyer' && order.userId !== args.senderId) {
            throw new Error("No autorizado");
        }
        if (args.sender === 'seller' && order.sellerId !== args.senderId) {
            throw new Error("No autorizado");
        }

        await ctx.db.insert("disputeMessages", {
            orderId: args.orderId,
            sender: args.sender,
            senderUserId: args.senderId,
            body: args.body,
            attachments: args.attachments,
            sentAt: new Date().toISOString(),
        });
    },
});

export const getDisputeMessages = query({
    args: { orderId: v.string() },
    handler: async (ctx, args) => {
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
        uploadedBy: v.union(v.literal('buyer'), v.literal('seller'), v.literal('support')),
        uploadedByUserId: v.string(),
        type: v.union(v.literal('photo'), v.literal('video'), v.literal('note')),
        url: v.optional(v.string()),
        description: v.string(),
    },
    handler: async (ctx, args) => {
        // Verify order exists
        const orderId = ctx.db.normalizeId("orders", args.orderId);
        if (!orderId) throw new Error("Orden no encontrada");

        const order = await ctx.db.get(orderId);
        if (!order) throw new Error("Orden no encontrada");

        // Verify authorization
        if (args.uploadedBy === 'buyer' && order.userId !== args.uploadedByUserId) {
            throw new Error("No autorizado");
        }
        if (args.uploadedBy === 'seller' && order.sellerId !== args.uploadedByUserId) {
            throw new Error("No autorizado");
        }

        await ctx.db.insert("disputeEvidence", {
            orderId: args.orderId,
            uploadedBy: args.uploadedBy,
            uploadedByUserId: args.uploadedByUserId,
            type: args.type,
            url: args.url,
            description: args.description,
            uploadedAt: new Date().toISOString(),
        });
    },
});

export const getDisputeEvidence = query({
    args: { orderId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("disputeEvidence")
            .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
            .collect();
    },
});

// Helper to get complete dispute info (messages + evidence)
export const getDisputeDetails = query({
    args: { orderId: v.string() },
    handler: async (ctx, args) => {
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
