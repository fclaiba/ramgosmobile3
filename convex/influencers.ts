import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireActor, getActorOrNull } from "./authHelpers";
import {
    displayUsernameForUser,
    findUserByHandleOrCode,
    isInfluencer,
    toInfluencerLookupDto,
} from "./userLookup";

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
        if (!isInfluencer(influencer)) {
            throw new Error("El usuario indicado no es un influencer.");
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
                const username = displayUsernameForUser(userObj, social?.username);
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

// 4. Buscar cualquier influencer (role) por @ / alias / nombre
export const searchInfluencers = query({
    args: {
        sessionToken: v.optional(v.string()),
        searchTerm: v.string(),
    },
    handler: async (ctx, args) => {
        // Empty list instead of throw — keeps BusinessDashboard useQuery stable.
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (
            !actor ||
            (actor.role !== "business" &&
                actor.role !== "admin" &&
                actor.role !== "developer")
        ) {
            return [];
        }

        const term = args.searchTerm.toLowerCase().trim().replace(/^@+/, "");
        if (term.length < 2) return [];

        const results: Array<{
            _id: string;
            name: string;
            username: string;
            referralAlias: string | null;
            avatar: string | null;
        }> = [];
        const seen = new Set<string>();

        const push = (user: any, usernameHint?: string | null) => {
            if (!isInfluencer(user)) return;
            const dto = toInfluencerLookupDto(user, usernameHint);
            if (!dto || seen.has(dto._id)) return;
            seen.add(dto._id);
            results.push(dto);
        };

        const exact = await findUserByHandleOrCode(ctx, term);
        if (exact) {
            const social = await ctx.db
                .query("socialUsers")
                .withIndex("by_user", (q) => q.eq("userId", String(exact._id)))
                .first();
            push(exact, social?.username);
        }

        const influencers = await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("role"), "influencer"))
            .take(300);

        for (const u of influencers) {
            if (results.length >= 5) break;
            const uname = displayUsernameForUser(u) || "";
            const nick = u.nickname
                ? String(u.nickname).toLowerCase().replace(/^@+/, "")
                : "";
            const alias = u.referralAlias
                ? String(u.referralAlias).toLowerCase()
                : "";
            const code = u.referralCode
                ? String(u.referralCode).toLowerCase()
                : "";
            if (
                uname.includes(term) ||
                nick.includes(term) ||
                alias.includes(term) ||
                code.includes(term) ||
                u.name.toLowerCase().includes(term)
            ) {
                push(u);
            }
        }

        return results.slice(0, 5);
    },
});
