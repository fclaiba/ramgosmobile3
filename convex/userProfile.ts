import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { assertSelfOrAdmin, requireActor } from "./authHelpers";

// PHASE 1: User Addresses Management

export const addAddress = mutation({
    args: { sessionToken: v.optional(v.string()),
        userId: v.string(),
        address: v.object({
            label: v.string(),
            fullName: v.string(),
            addressLine1: v.string(),
            addressLine2: v.optional(v.string()),
            city: v.string(),
            state: v.optional(v.string()),
            postalCode: v.string(),
            country: v.string(),
            phone: v.optional(v.string()),
            isDefault: v.boolean(),
        }),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        // If this address is marked as default, unset other defaults
        if (args.address.isDefault) {
            const existingAddresses = await ctx.db
                .query("savedAddresses")
                .withIndex("by_user", (q) => q.eq("userId", args.userId))
                .collect();

            for (const addr of existingAddresses) {
                if (addr.isDefault) {
                    await ctx.db.patch(addr._id, { isDefault: false });
                }
            }
        }

        const addressId = await ctx.db.insert("savedAddresses", {
            userId: args.userId,
            ...args.address,
            createdAt: new Date().toISOString(),
        });

        return addressId;
    },
});

export const getMyAddresses = query({
    args: { sessionToken: v.optional(v.string()), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        return await ctx.db
            .query("savedAddresses")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect();
    },
});

export const updateAddress = mutation({
    args: { sessionToken: v.optional(v.string()),
        addressId: v.id("savedAddresses"),
        userId: v.string(), // For authorization
        updates: v.object({
            label: v.optional(v.string()),
            fullName: v.optional(v.string()),
            addressLine1: v.optional(v.string()),
            addressLine2: v.optional(v.string()),
            city: v.optional(v.string()),
            state: v.optional(v.string()),
            postalCode: v.optional(v.string()),
            country: v.optional(v.string()),
            phone: v.optional(v.string()),
            isDefault: v.optional(v.boolean()),
        }),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const address = await ctx.db.get(args.addressId);
        if (!address || address.userId !== args.userId) {
            throw new Error("No autorizado");
        }

        // If marking as default, unset others
        if (args.updates.isDefault) {
            const existingAddresses = await ctx.db
                .query("savedAddresses")
                .withIndex("by_user", (q) => q.eq("userId", args.userId))
                .collect();

            for (const addr of existingAddresses) {
                if (addr.isDefault && addr._id !== args.addressId) {
                    await ctx.db.patch(addr._id, { isDefault: false });
                }
            }
        }

        await ctx.db.patch(args.addressId, args.updates);
    },
});

export const deleteAddress = mutation({
    args: { sessionToken: v.optional(v.string()),
        addressId: v.id("savedAddresses"),
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const address = await ctx.db.get(args.addressId);
        if (!address || address.userId !== args.userId) {
            throw new Error("No autorizado");
        }

        await ctx.db.delete(args.addressId);
    },
});

// PHASE 1: User Preferences

export const updatePreferences = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.string(),
        preferences: v.object({
            language: v.optional(v.string()),
            currency: v.optional(v.string()),
            notifications: v.optional(v.object({
                email: v.boolean(),
                push: v.boolean(),
                sms: v.boolean(),
                marketingEmails: v.boolean(),
            })),
            searchRadius: v.optional(v.number()),
            preferredCategories: v.optional(v.array(v.string())),
        }),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        // Check if preferences exist
        const existing = await ctx.db
            .query("userPreferences")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .first();

        if (existing) {
            // Update
            await ctx.db.patch(existing._id, {
                ...args.preferences,
                updatedAt: new Date().toISOString(),
            });
            return existing._id;
        } else {
            // Create with defaults
            return await ctx.db.insert("userPreferences", {
                userId: args.userId,
                language: args.preferences.language || 'es',
                currency: args.preferences.currency || 'USD',
                notifications: args.preferences.notifications || {
                    email: true,
                    push: true,
                    sms: false,
                    marketingEmails: true,
                },
                searchRadius: args.preferences.searchRadius || 50, // 50km default
                preferredCategories: args.preferences.preferredCategories || [],
                updatedAt: new Date().toISOString(),
            });
        }
    },
});

export const getPreferences = query({
    args: { sessionToken: v.optional(v.string()), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const prefs = await ctx.db
            .query("userPreferences")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .first();

        // Return defaults if not found
        if (!prefs) {
            return {
                userId: args.userId,
                language: 'es',
                currency: 'USD',
                notifications: {
                    email: true,
                    push: true,
                    sms: false,
                    marketingEmails: true,
                },
                searchRadius: 50,
                preferredCategories: [],
                updatedAt: new Date().toISOString(),
            };
        }

        return prefs;
    },
});

// PHASE 1: Search History

export const recordSearch = mutation({
    args: { sessionToken: v.optional(v.string()),
        userId: v.string(),
        query: v.string(),
        filters: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        // Insert search
        await ctx.db.insert("searchHistory", {
            userId: args.userId,
            query: args.query,
            filters: args.filters,
            searchedAt: new Date().toISOString(),
        });

        // Keep only last 50 searches
        const allSearches = await ctx.db
            .query("searchHistory")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .order("desc")
            .collect();

        if (allSearches.length > 50) {
            const toDelete = allSearches.slice(50);
            for (const search of toDelete) {
                await ctx.db.delete(search._id);
            }
        }
    },
});

export const getSearchHistory = query({
    args: { sessionToken: v.optional(v.string()),
        userId: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        return await ctx.db
            .query("searchHistory")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .order("desc")
            .take(args.limit || 10);
    },
});

export const clearSearchHistory = mutation({
    args: { sessionToken: v.optional(v.string()), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, args.userId);

        const searches = await ctx.db
            .query("searchHistory")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect();

        for (const search of searches) {
            await ctx.db.delete(search._id);
        }
    },
});
