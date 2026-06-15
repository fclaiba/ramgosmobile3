import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireActor } from "./authHelpers";

// 1. Añadir Influencer a Whitelist
export const addToWhitelist = mutation({
    args: {
        influencerId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx);
        if (actor.role !== "business") {
            throw new Error("Only businesses can manage whitelists.");
        }

        const existing = await ctx.db
            .query("influencerWhitelists")
            .withIndex("by_business_and_influencer", (q) => 
                q.eq("businessId", String(actor.id)).eq("influencerId", args.influencerId)
            )
            .first();

        if (existing) {
            if (existing.status === 'revoked') {
                await ctx.db.patch(existing._id, { status: 'active', updatedAt: new Date().toISOString() });
            }
            return existing._id;
        }

        return await ctx.db.insert("influencerWhitelists", {
            businessId: String(actor.id),
            influencerId: args.influencerId,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
    }
});

// 2. Remover Influencer de Whitelist
export const removeFromWhitelist = mutation({
    args: {
        influencerId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx);
        
        const existing = await ctx.db
            .query("influencerWhitelists")
            .withIndex("by_business_and_influencer", (q) => 
                q.eq("businessId", String(actor.id)).eq("influencerId", args.influencerId)
            )
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, { status: 'revoked', updatedAt: new Date().toISOString() });
        }
        return { success: true };
    }
});

// 3. Obtener Whitelist del negocio
export const getWhitelist = query({
    args: {},
    handler: async (ctx) => {
        const actor = await requireActor(ctx);
        
        const whitelistItems = await ctx.db
            .query("influencerWhitelists")
            .withIndex("by_business", (q) => q.eq("businessId", String(actor.id)))
            .filter(q => q.eq(q.field("status"), "active"))
            .collect();
            
        // Fetch user details for each influencer
        const influencers = await Promise.all(
            whitelistItems.map(async (item) => {
                const userObj = await ctx.db
                    .query("users")
                    .filter(q => q.eq(q.field("_id"), ctx.db.normalizeId("users", item.influencerId) || ""))
                    .first();
                return {
                    whitelistId: item._id,
                    influencerId: item.influencerId,
                    name: userObj?.name || 'Usuario',
                    email: userObj?.email || '',
                    avatar: userObj?.avatar || '',
                    addedAt: item.createdAt,
                };
            })
        );
        
        return influencers;
    }
});

// 4. Buscar influencer para añadir a Whitelist
export const searchInfluencers = query({
    args: { searchTerm: v.string() },
    handler: async (ctx, args) => {
        const term = args.searchTerm.toLowerCase().trim();
        if (term.length < 3) return [];
        
        const influencers = await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("role"), "influencer"))
            .collect();
            
        return influencers.filter(u => 
            u.name.toLowerCase().includes(term) || 
            (u.email && u.email.toLowerCase().includes(term))
        ).slice(0, 10).map(u => ({
            id: String(u._id),
            name: u.name,
            email: u.email,
            avatar: u.avatar
        }));
    }
});
