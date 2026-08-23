/**
 * Comunidades Comerciales — "pasillos digitales" (Sprint 4 del doc). El
 * schema (`commercialCommunities`, `communityMembers`) ya existía; este
 * archivo es toda la lógica que faltaba.
 *
 * Decisiones de diseño:
 *   - El chat de comunidad NO es un sistema nuevo: reusa `socialChats` con
 *     `kind: 'group'` + `communityId`, así hereda typing, reacciones, roles
 *     y mute/archive de `social/dm.ts` (1700+ líneas) gratis.
 *   - El catálogo (`communityListings`) no duplica `listings`; sólo
 *     referencia cuáles decidió mostrar la comunidad.
 *   - **Sin reparto de comisiones entre miembros, a propósito.** Una
 *     comunidad es un nicho compartido donde varios vendedores postean y
 *     COMPITEN por vender más de ese rubro — no un vehículo para que un
 *     miembro cobre comisión de las ventas de otro. La única figura que
 *     puede cobrar comisión de una venta en toda la app es un usuario
 *     `role: 'influencer'` promocionando vía campaña (`campaigns.ts`,
 *     `internalResolveCartAttribution`), nunca un miembro de comunidad como
 *     tal. Este archivo tuvo en algún momento un sistema de "convenios"
 *     (`communityAgreements`) para comisión cruzada entre miembros — se
 *     eliminó por completo (código + tabla del schema) por decisión de
 *     producto; no quedó ni a medio implementar.
 */

import { v, ConvexError } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { api } from '../_generated/api';
import { requireActor } from '../authHelpers';
import { assertSocialActor, assertSocialRate, paginateQuery, socialViewer } from './_helpers';
import { awardSocialAction } from './gamification';

import { recordActivity } from './activity';
import { createMediaResolver } from '../mediaUrl';
import { loadViewerModerationSets } from '../social';
import { scoreLoop, applyAuthorDiversityCap } from './scoring';

/**
 * Adjunta a cada fila de membresía su perfil social con el avatar resuelto.
 * Sin esto se devolvía el documento crudo con `convex-storage:<id>`, que el
 * cliente no puede cargar: la lista de miembros salía sin fotos.
 */
async function withResolvedUsers(ctx: any, rows: any[], users: any[]) {
    const resolve = createMediaResolver(ctx);
    return await Promise.all(
        rows.map(async (row: any, i: number) => {
            const user = users[i];
            return {
                ...row,
                user: user ? { ...user, avatar: await resolve(user.avatar) } : null,
            };
        }),
    );
}

const NOW = () => new Date().toISOString();

const requireOwnerOrAdmin = async (ctx: any, communityId: string, userId: string) => {
    const membership = await ctx.db
        .query('communityMembers')
        .withIndex('by_community_user', (q: any) => q.eq('communityId', communityId).eq('userId', userId))
        .first();
    if (!membership || membership.status !== 'active' || (membership.role !== 'owner' && membership.role !== 'admin')) {
        throw new ConvexError({ code: 'FORBIDDEN', message: 'No sos admin de esta comunidad.' });
    }
    return membership;
};

export const createCommunity = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        name: v.string(),
        description: v.optional(v.string()),
        coverImage: v.optional(v.string()),
        kind: v.union(v.literal('business'), v.literal('user')),
        visibility: v.union(v.literal('public'), v.literal('private')),
        location: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await assertSocialRate(ctx, actor, 'createCommunity');

        const name = args.name.trim();
        if (name.length < 3) throw new ConvexError({ code: 'FORBIDDEN', message: 'El nombre es demasiado corto.' });

        const now = NOW();
        const communityId = await ctx.db.insert('commercialCommunities', {
            name,
            description: args.description,
            coverImage: args.coverImage,
            ownerUserId: actor.idString,
            kind: args.kind,
            visibility: args.visibility,
            location: args.location,
            memberCount: 1,
            createdAt: now,
        });

        await ctx.db.insert('communityMembers', {
            communityId: String(communityId),
            userId: actor.idString,
            role: 'owner',
            status: 'active',
            createdAt: now,
        });

        return communityId;
    },
});

export const updateCommunity = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        communityId: v.id('commercialCommunities'),
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        coverImage: v.optional(v.string()),
        visibility: v.optional(v.union(v.literal('public'), v.literal('private'))),
        location: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await requireOwnerOrAdmin(ctx, String(args.communityId), actor.idString);

        const patch: Record<string, any> = {};
        if (args.name !== undefined) patch.name = args.name.trim();
        if (args.description !== undefined) patch.description = args.description;
        if (args.coverImage !== undefined) patch.coverImage = args.coverImage;
        if (args.visibility !== undefined) patch.visibility = args.visibility;
        if (args.location !== undefined) patch.location = args.location;
        if (Object.keys(patch).length) await ctx.db.patch(args.communityId, patch);
        return { success: true };
    },
});

/** B4: reglas de la comunidad (estilo Twitter Communities) — se muestran
 *  en el detalle, sin gate de aceptación obligatoria (fricción mínima). */
export const setCommunityRules = mutation({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities'), rules: v.array(v.string()) },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await requireOwnerOrAdmin(ctx, String(args.communityId), actor.idString);
        await ctx.db.patch(args.communityId, { rules: args.rules.map((r) => r.trim()).filter(Boolean) });
        return { success: true };
    },
});

/** B4: post fijado — mismo patrón exacto que `socialUsers.pinnedPostId`
 *  (`social.ts`, `pinPost`/`unpinPost` de perfil). */
export const pinCommunityPost = mutation({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities'), postId: v.id('socialPosts') },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await requireOwnerOrAdmin(ctx, String(args.communityId), actor.idString);
        const post = await ctx.db.get(args.postId);
        if (!post || post.communityId !== String(args.communityId)) {
            throw new ConvexError({ code: 'BAD_REQUEST', message: 'El post no pertenece a esta comunidad.' });
        }
        await ctx.db.patch(args.communityId, { pinnedPostId: args.postId });
        return { success: true };
    },
});

export const unpinCommunityPost = mutation({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities') },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await requireOwnerOrAdmin(ctx, String(args.communityId), actor.idString);
        await ctx.db.patch(args.communityId, { pinnedPostId: undefined });
        return { success: true };
    },
});

export const deleteCommunity = mutation({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities') },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const community = await ctx.db.get(args.communityId);
        if (!community) return { success: true };
        if (community.ownerUserId !== actor.idString) {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'Sólo el dueño puede eliminar la comunidad.' });
        }
        await ctx.db.patch(args.communityId, { deletedAt: NOW() });
        return { success: true };
    },
});

export const getCommunity = query({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities') },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return null;
        const community = await ctx.db.get(args.communityId);
        if (!community || community.deletedAt) return null;

        const membership = await ctx.db
            .query('communityMembers')
            .withIndex('by_community_user', (q: any) =>
                q.eq('communityId', String(args.communityId)).eq('userId', actor.idString),
            )
            .first();

        // Privada: invisible para quien no sea miembro activo, ni por id.
        if (community.visibility === 'private' && (!membership || membership.status !== 'active')) {
            return null;
        }

        const media = createMediaResolver(ctx);
        return {
            ...community,
            coverImage: await media(community.coverImage),
            myMembership: membership ?? null,
        };
    },
});

export const searchCommunities = query({
    args: {
        sessionToken: v.optional(v.string()),
        term: v.optional(v.string()),
        kind: v.optional(v.union(v.literal('business'), v.literal('user'))),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        if (!(await socialViewer(ctx, args.sessionToken))) return [];
        const cap = Math.min(args.limit ?? 20, 50);

        let results: any[];
        if (args.term && args.term.trim()) {
            results = await ctx.db
                .query('commercialCommunities')
                .withSearchIndex('search_name', (q: any) => {
                    let s = q.search('name', args.term!.trim());
                    if (args.kind) s = s.eq('kind', args.kind);
                    return s.eq('visibility', 'public');
                })
                .take(cap);
        } else {
            results = await ctx.db
                .query('commercialCommunities')
                .withIndex('by_kind', (q: any) => (args.kind ? q.eq('kind', args.kind) : q))
                .order('desc')
                .take(cap * 2);
            results = results.filter((c: any) => c.visibility === 'public');
        }

        const media = createMediaResolver(ctx);
        return await Promise.all(
            results
                .filter((c: any) => !c.deletedAt)
                .slice(0, cap)
                .map(async (c: any) => ({ ...c, coverImage: await media(c.coverImage) })),
        );
    },
});

export const listMyCommunities = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return [];
        const memberships = await ctx.db
            .query('communityMembers')
            .withIndex('by_user', (q: any) => q.eq('userId', actor.idString))
            .collect();
        const active = memberships.filter((m: any) => m.status === 'active');
        const media = createMediaResolver(ctx);
        const communities = await Promise.all(
            active.map(async (m: any) => {
                const nid = ctx.db.normalizeId('commercialCommunities', m.communityId);
                const c = nid ? await ctx.db.get(nid) : null;
                if (!c || c.deletedAt) return null;
                return { ...c, coverImage: await media(c.coverImage), myRole: m.role };
            }),
        );
        return communities.filter(Boolean);
    },
});

/** Solicitudes pendientes de aprobación — para el dueño/admin. */
export const listPendingRequests = query({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities') },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return [];
        try {
            await requireOwnerOrAdmin(ctx, String(args.communityId), actor.idString);
        } catch {
            return [];
        }
        const pending = await ctx.db
            .query('communityMembers')
            .withIndex('by_community_status', (q: any) => q.eq('communityId', String(args.communityId)).eq('status', 'pending'))
            .collect();
        const users = await Promise.all(
            pending.map((m: any) =>
                ctx.db.query('socialUsers').withIndex('by_user', (q: any) => q.eq('userId', m.userId)).first(),
            ),
        );
        return await withResolvedUsers(ctx, pending, users);
    },
});

export const listMembers = query({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities'), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        if (!(await socialViewer(ctx, args.sessionToken))) return [];
        const cap = Math.min(args.limit ?? 50, 200);
        const members = await ctx.db
            .query('communityMembers')
            .withIndex('by_community', (q: any) => q.eq('communityId', String(args.communityId)))
            .take(cap);
        const active = members.filter((m: any) => m.status === 'active');
        const users = await Promise.all(
            active.map((m: any) =>
                ctx.db.query('socialUsers').withIndex('by_user', (q: any) => q.eq('userId', m.userId)).first(),
            ),
        );
        return await withResolvedUsers(ctx, active, users);
    },
});

export const joinCommunity = mutation({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities') },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await assertSocialRate(ctx, actor, 'joinCommunity');

        const community = await ctx.db.get(args.communityId);
        if (!community || community.deletedAt) {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'Comunidad no encontrada.' });
        }

        const existing = await ctx.db
            .query('communityMembers')
            .withIndex('by_community_user', (q: any) =>
                q.eq('communityId', String(args.communityId)).eq('userId', actor.idString),
            )
            .first();
        if (existing && existing.status === 'active') return { status: 'active' as const };
        if (existing && existing.status === 'pending') return { status: 'pending' as const };

        // v1: comunidades públicas se unen directo; privadas quedan `pending`
        // hasta que un admin apruebe. No hay política `invite`-only separada
        // todavía — se puede sumar sin romper el schema (agregar el literal).
        const status = community.visibility === 'public' ? 'active' : 'pending';

        if (existing) {
            await ctx.db.patch(existing._id, { status, createdAt: NOW() });
        } else {
            await ctx.db.insert('communityMembers', {
                communityId: String(args.communityId),
                userId: actor.idString,
                role: 'member',
                status,
                createdAt: NOW(),
            });
        }

        if (status === 'active') {
            await ctx.db.patch(args.communityId, { memberCount: community.memberCount + 1 });
            await awardSocialAction(ctx, actor.idString, 'sp_community_join', String(args.communityId));
        } else {
            await recordActivity(ctx, {
                userId: community.ownerUserId,
                type: 'community_invite',
                actorUserId: actor.idString,
                targetType: 'community',
                targetId: String(args.communityId),
            });
        }

        return { status };
    },
});

export const approveMember = mutation({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities'), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await requireOwnerOrAdmin(ctx, String(args.communityId), actor.idString);

        const membership = await ctx.db
            .query('communityMembers')
            .withIndex('by_community_user', (q: any) => q.eq('communityId', String(args.communityId)).eq('userId', args.userId))
            .first();
        if (!membership || membership.status !== 'pending') return { success: false };

        await ctx.db.patch(membership._id, { status: 'active' });
        const community = await ctx.db.get(args.communityId);
        if (community) await ctx.db.patch(args.communityId, { memberCount: community.memberCount + 1 });
        await awardSocialAction(ctx, args.userId, 'sp_community_join', String(args.communityId));
        return { success: true };
    },
});

export const rejectMember = mutation({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities'), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await requireOwnerOrAdmin(ctx, String(args.communityId), actor.idString);
        const membership = await ctx.db
            .query('communityMembers')
            .withIndex('by_community_user', (q: any) => q.eq('communityId', String(args.communityId)).eq('userId', args.userId))
            .first();
        if (membership) await ctx.db.delete(membership._id);
        return { success: true };
    },
});

export const leaveCommunity = mutation({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities') },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const membership = await ctx.db
            .query('communityMembers')
            .withIndex('by_community_user', (q: any) =>
                q.eq('communityId', String(args.communityId)).eq('userId', actor.idString),
            )
            .first();
        if (!membership || membership.status !== 'active') return { success: true };
        if (membership.role === 'owner') {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'El dueño no puede irse; transferí la propiedad o eliminá la comunidad.' });
        }
        await ctx.db.patch(membership._id, { status: 'left' });
        const community = await ctx.db.get(args.communityId);
        if (community) await ctx.db.patch(args.communityId, { memberCount: Math.max(0, community.memberCount - 1) });
        return { success: true };
    },
});

export const removeMember = mutation({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities'), userId: v.string() },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await requireOwnerOrAdmin(ctx, String(args.communityId), actor.idString);
        const membership = await ctx.db
            .query('communityMembers')
            .withIndex('by_community_user', (q: any) => q.eq('communityId', String(args.communityId)).eq('userId', args.userId))
            .first();
        if (!membership || membership.status !== 'active') return { success: true };
        if (membership.role === 'owner') throw new ConvexError({ code: 'FORBIDDEN', message: 'No podés echar al dueño.' });
        await ctx.db.patch(membership._id, { status: 'left' });
        const community = await ctx.db.get(args.communityId);
        if (community) await ctx.db.patch(args.communityId, { memberCount: Math.max(0, community.memberCount - 1) });
        return { success: true };
    },
});

export const setMemberRole = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        communityId: v.id('commercialCommunities'),
        userId: v.string(),
        role: v.union(v.literal('admin'), v.literal('member')),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const requesterMembership = await requireOwnerOrAdmin(ctx, String(args.communityId), actor.idString);
        if (requesterMembership.role !== 'owner') {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'Sólo el dueño puede cambiar roles.' });
        }
        const membership = await ctx.db
            .query('communityMembers')
            .withIndex('by_community_user', (q: any) => q.eq('communityId', String(args.communityId)).eq('userId', args.userId))
            .first();
        if (!membership || membership.role === 'owner') return { success: false };
        await ctx.db.patch(membership._id, { role: args.role });
        return { success: true };
    },
});

/** Feed de UNA comunidad — nunca aparece en el feed global (`getFeed`). */
export const getCommunityFeed = query({
    args: {
        sessionToken: v.optional(v.string()),
        communityId: v.id('commercialCommunities'),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
        // B2: ausente = mixto (comportamiento de siempre, tab "Feed").
        // `'video'` = sólo Loops de esta comunidad (tab "Loops" nuevo).
        type: v.optional(v.literal('video')),
    },
    handler: async (ctx, args): Promise<any> => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return { items: [], nextCursor: null };
        const community = await ctx.db.get(args.communityId);
        if (!community || community.deletedAt) return { items: [], nextCursor: null };

        const membership = await ctx.db
            .query('communityMembers')
            .withIndex('by_community_user', (q: any) =>
                q.eq('communityId', String(args.communityId)).eq('userId', actor.idString),
            )
            .first();
        // Una query NO lanza (ver convención en `social/dm.ts`): un no-miembro
        // de una comunidad privada recibe una lista vacía, no una excepción
        // que le tumbe la pantalla.
        if (community.visibility === 'private' && (!membership || membership.status !== 'active')) {
            return { items: [], nextCursor: null };
        }

        const page = await paginateQuery(
            ctx.db
                .query('socialPosts')
                .withIndex('by_community_created', (q: any) => {
                    const base = q.eq('communityId', String(args.communityId));
                    return args.cursor ? base.lt('createdAt', args.cursor) : base;
                })
                .order('desc')
                .filter((q: any) => q.eq(q.field('deletedAt'), undefined)),
            args.cursor,
            args.limit ?? (args.type === 'video' ? 30 : 20),
        );

        if (args.type !== 'video') {
            return { items: page.items, nextCursor: page.nextCursor };
        }

        // Tab Loops de la comunidad: rankea con `scoreLoop`, versión
        // simplificada de la que usa `getFeed({mode:'videos'})` — sin
        // exploración/graduación por etapas (ese mecanismo existe para el
        // cold-start del catálogo GLOBAL; el pool de video de una comunidad
        // es chico, no vale la pena duplicar esa máquina acá) y diversidad
        // por AUTOR en vez de por tag (más simple, misma idea).
        const videos = page.items.filter((p: any) => p.type === 'video');
        const moderation = await loadViewerModerationSets(ctx, actor.idString);
        const recentViews = await ctx.db
            .query('socialPostViews')
            .withIndex('by_viewer_created', (q: any) => q.eq('viewerUserId', actor.idString))
            .order('desc')
            .take(200);
        const alreadyViewedIds = new Set<string>(recentViews.map((v: any) => v.postId));
        const nowMs = Date.now();

        const scored = videos
            .map((p: any) => ({
                post: p,
                score: scoreLoop(p, {
                    tagAffinity: new Map(),
                    postTags: [],
                    nowMs,
                    notInterestedAuthors: moderation.notInterestedAuthors,
                    alreadyViewedIds,
                }),
            }))
            .sort((a, b) => b.score - a.score)
            .map((x) => x.post);

        const capped = applyAuthorDiversityCap(scored, args.limit ?? 30);
        return { items: capped, nextCursor: page.nextCursor };
    },
});

// ---------------------------------------------------------------------------
// Catálogo compartido — "la vidriera del pasillo digital"
// ---------------------------------------------------------------------------

export const addListingToCommunity = mutation({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities'), listingId: v.id('listings') },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const membership = await ctx.db
            .query('communityMembers')
            .withIndex('by_community_user', (q: any) =>
                q.eq('communityId', String(args.communityId)).eq('userId', actor.idString),
            )
            .first();
        if (!membership || membership.status !== 'active') {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'No sos miembro de esta comunidad.' });
        }
        const listing = await ctx.db.get(args.listingId);
        if (!listing) throw new ConvexError({ code: 'FORBIDDEN', message: 'Producto no encontrado.' });
        if (String(listing.sellerId) !== actor.idString && actor.role !== 'admin') {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'Sólo podés agregar tus propios productos.' });
        }

        const existing = await ctx.db
            .query('communityListings')
            .withIndex('by_community_listing', (q: any) =>
                q.eq('communityId', String(args.communityId)).eq('listingId', String(args.listingId)),
            )
            .first();
        if (existing) return existing._id;

        return await ctx.db.insert('communityListings', {
            communityId: String(args.communityId),
            listingId: String(args.listingId),
            addedByUserId: actor.idString,
            sellerId: String(listing.sellerId ?? actor.idString),
            createdAt: NOW(),
        });
    },
});

export const removeListingFromCommunity = mutation({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities'), listingId: v.string() },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const row = await ctx.db
            .query('communityListings')
            .withIndex('by_community_listing', (q: any) =>
                q.eq('communityId', String(args.communityId)).eq('listingId', args.listingId),
            )
            .first();
        if (!row) return { success: true };
        const isOwnerOfListing = row.addedByUserId === actor.idString || row.sellerId === actor.idString;
        if (!isOwnerOfListing) await requireOwnerOrAdmin(ctx, String(args.communityId), actor.idString);
        await ctx.db.delete(row._id);
        return { success: true };
    },
});

export const listCommunityCatalog = query({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities'), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        if (!(await socialViewer(ctx, args.sessionToken))) return [];
        const cap = Math.min(args.limit ?? 30, 100);
        const rows = await ctx.db
            .query('communityListings')
            .withIndex('by_community_created', (q: any) => q.eq('communityId', String(args.communityId)))
            .order('desc')
            .take(cap);
        const listings = await Promise.all(
            rows.map((r: any) => {
                const nid = ctx.db.normalizeId('listings', r.listingId);
                return nid ? ctx.db.get(nid) : null;
            }),
        );
        return rows.map((r: any, i: number) => ({ ...r, listing: listings[i] ?? null })).filter((r: any) => r.listing);
    },
});

// ---------------------------------------------------------------------------
// Chat de comunidad — reusa `social/dm.ts`
// ---------------------------------------------------------------------------

/**
 * Devuelve el chat grupal de la comunidad, creándolo la primera vez que un
 * miembro entra a la pestaña. No se crea en `createCommunity` porque una
 * comunidad recién creada con un solo miembro (el dueño) no necesita un chat
 * todavía — se crea perezosamente con quien esté en ese momento.
 */
export const getOrCreateCommunityChat = mutation({
    args: { sessionToken: v.optional(v.string()), communityId: v.id('commercialCommunities') },
    handler: async (ctx, args): Promise<string> => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const membership = await ctx.db
            .query('communityMembers')
            .withIndex('by_community_user', (q: any) =>
                q.eq('communityId', String(args.communityId)).eq('userId', actor.idString),
            )
            .first();
        if (!membership || membership.status !== 'active') {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'No sos miembro de esta comunidad.' });
        }

        const existing = await ctx.db
            .query('socialChats')
            .withIndex('by_community', (q: any) => q.eq('communityId', String(args.communityId)))
            .first();
        if (existing) return String(existing._id);

        const community = await ctx.db.get(args.communityId);
        const members = await ctx.db
            .query('communityMembers')
            .withIndex('by_community', (q: any) => q.eq('communityId', String(args.communityId)))
            .collect();
        const activeIds = members.filter((m: any) => m.status === 'active').map((m: any) => m.userId);

        const chatId: string = await ctx.runMutation(api.social.dm.createGroupChat, {
            sessionToken: args.sessionToken,
            participantIds: activeIds,
            title: community?.name ?? 'Comunidad',
        });

        await ctx.db.patch(ctx.db.normalizeId('socialChats', chatId)!, { communityId: String(args.communityId) });
        return chatId;
    },
});
