import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireActor, getActorOrNull } from "./authHelpers";

// 1. Añadir Influencer a Whitelist
export const addToWhitelist = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        influencerId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        if (actor.role !== "business") {
            throw new Error("Solo los negocios pueden gestionar la whitelist.");
        }

        const influencerNorm = ctx.db.normalizeId("users", args.influencerId);
        const influencer = influencerNorm ? await ctx.db.get(influencerNorm) : null;
        if (!influencer || influencer.role !== "influencer") {
            throw new Error("El usuario indicado no es un influencer válido.");
        }

        const businessId = actor.idString;
        const influencerId = String(influencer._id);

        const existing = await ctx.db
            .query("influencerWhitelists")
            .withIndex("by_business_and_influencer", (q) =>
                q.eq("businessId", businessId).eq("influencerId", influencerId),
            )
            .first();

        if (existing) {
            if (existing.status === "revoked") {
                await ctx.db.patch(existing._id, {
                    status: "active",
                    updatedAt: new Date().toISOString(),
                });
            }
            return existing._id;
        }

        return await ctx.db.insert("influencerWhitelists", {
            businessId,
            influencerId,
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
    },
});

// 2. Remover Influencer de Whitelist
export const removeFromWhitelist = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        influencerId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        if (actor.role !== "business") {
            throw new Error("Solo los negocios pueden gestionar la whitelist.");
        }

        const existing = await ctx.db
            .query("influencerWhitelists")
            .withIndex("by_business_and_influencer", (q) =>
                q
                    .eq("businessId", actor.idString)
                    .eq("influencerId", args.influencerId),
            )
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                status: "revoked",
                updatedAt: new Date().toISOString(),
            });
        }
        return { success: true };
    },
});

// 3. Obtener Whitelist del negocio
export const getWhitelist = query({
    args: {
        sessionToken: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor) return [];

        const whitelistItems = await ctx.db
            .query("influencerWhitelists")
            .withIndex("by_business", (q) => q.eq("businessId", actor.idString))
            .filter((q) => q.eq(q.field("status"), "active"))
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
            }),
        );

        return influencers;
    },
});

// 3b. Negocios que whitelistearon al influencer autenticado (para crear bonos)
export const getMyWhitelistedBusinesses = query({
    args: {
        sessionToken: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor || actor.role !== "influencer") return [];

        const rows = await ctx.db
            .query("influencerWhitelists")
            .withIndex("by_influencer", (q) => q.eq("influencerId", actor.idString))
            .filter((q) => q.eq(q.field("status"), "active"))
            .collect();

        const businesses: Array<{ businessId: string; name: string }> = [];
        for (const row of rows) {
            const norm = ctx.db.normalizeId("users", row.businessId);
            const business = norm ? await ctx.db.get(norm) : null;
            if (!business) continue;
            businesses.push({
                businessId: String(business._id),
                name: business.name || "Negocio",
            });
        }
        return businesses;
    },
});

// 4. Buscar influencer para añadir a Whitelist (por @ / nombre — no email)
export const searchInfluencers = query({
    args: {
        sessionToken: v.optional(v.string()),
        searchTerm: v.string(),
    },
    handler: async (ctx, args) => {
        await requireActor(ctx, args.sessionToken);
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
    },
});
