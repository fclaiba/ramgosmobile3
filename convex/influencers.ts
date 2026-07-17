import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireActor, getActorFromAuth } from "./authHelpers";

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
        const actor = await getActorFromAuth(ctx);
        if (!actor) return [];

        const whitelistItems = await ctx.db
            .query("influencerWhitelists")
            .withIndex("by_business", (q) => q.eq("businessId", String(actor.id)))
            .filter(q => q.eq(q.field("status"), "active"))
            .collect();
            
        // Fetch user details for each influencer — cite @username, never email
        const influencers = await Promise.all(
            whitelistItems.map(async (item) => {
                const userNorm = ctx.db.normalizeId("users", item.influencerId);
                const userObj = userNorm ? await ctx.db.get(userNorm) : null;
                const social = await ctx.db
                    .query("socialUsers")
                    .withIndex("by_user", (q) => q.eq("userId", item.influencerId))
                    .first();
                const username =
                    social?.username ||
                    (userObj?.nickname
                        ? String(userObj.nickname).toLowerCase().replace(/^@+/, "")
                        : null);
                return {
                    whitelistId: item._id,
                    influencerId: item.influencerId,
                    name: userObj?.name || "Usuario",
                    username: username || "",
                    avatar: userObj?.avatar || social?.avatar || "",
                    addedAt: item.createdAt,
                };
            })
        );
        
        return influencers;
    }
});

// 4. Buscar influencer para añadir a Whitelist (por @ / nombre — no email)
export const searchInfluencers = query({
    args: { searchTerm: v.string() },
    handler: async (ctx, args) => {
        const term = args.searchTerm.toLowerCase().trim().replace(/^@+/, "");
        if (term.length < 2) return [];

        const socialHits = await ctx.db
            .query("socialUsers")
            .withSearchIndex("search_username", (q) => q.search("username", term))
            .take(20);

        const results: Array<{
            id: string;
            name: string;
            username: string;
            avatar?: string;
        }> = [];

        for (const social of socialHits) {
            const userNorm = ctx.db.normalizeId("users", social.userId);
            const user = userNorm ? await ctx.db.get(userNorm) : null;
            if (!user || user.role !== "influencer") continue;
            results.push({
                id: String(user._id),
                name: user.name,
                username: social.username,
                avatar: user.avatar || social.avatar,
            });
            if (results.length >= 10) break;
        }

        if (results.length > 0) return results;

        // Fallback: nickname / display name among influencers
        const influencers = await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("role"), "influencer"))
            .take(200);

        return influencers
            .filter(
                (u) =>
                    u.name.toLowerCase().includes(term) ||
                    (u.nickname &&
                        String(u.nickname)
                            .toLowerCase()
                            .replace(/^@+/, "")
                            .includes(term)),
            )
            .slice(0, 10)
            .map((u) => ({
                id: String(u._id),
                name: u.name,
                username: u.nickname
                    ? String(u.nickname).toLowerCase().replace(/^@+/, "")
                    : "",
                avatar: u.avatar,
            }));
    }
});
