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
import {
    adjustMemberCount,
    assertSocialActor,
    assertSocialRate,
    paginateQuery,
    requireCommunityAdmin,
    resolveJoinPolicy,
    socialViewer,
} from './_helpers';
import { slugCandidates, slugify } from './_communityPolicy';
import { awardSocialAction } from './gamification';

import { recordActivity } from './activity';
import { createMediaResolver } from '../mediaUrl';
import { decoratePosts, loadViewerModerationSets } from '../social';
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

/**
 * Devuelve el primer slug libre. Los candidatos (y las rutas reservadas) los
 * genera `_communityPolicy.slugCandidates`, que está testeado; acá sólo queda
 * la parte que necesita la base de datos. `selfId` permite que una comunidad
 * conserve el suyo al editarse.
 */
async function normalizeFreeSlug(
    ctx: any,
    requested: string | undefined,
    fallbackSource: string,
    selfId?: string,
): Promise<string | undefined> {
    const candidates = slugCandidates(slugify(requested?.trim() || fallbackSource));
    for (const candidate of candidates) {
        const taken = await ctx.db
            .query('commercialCommunities')
            .withIndex('by_slug', (q: any) => q.eq('slug', candidate))
            .first();
        if (!taken || (selfId && String(taken._id) === selfId)) return candidate;
    }
    // Todas colisionadas: se deja sin slug antes que colgarse. La comunidad
    // sigue siendo alcanzable por `/c/{id}`.
    return undefined;
}

// Movido a `_helpers.ts` para compartirlo con `communityAccess.ts`; se
// conserva el nombre local para no tocar los ~10 call sites de este archivo.
const requireOwnerOrAdmin = requireCommunityAdmin;

/**
 * Cierra la solicitud abierta de un usuario al aprobarlo o rechazarlo.
 *
 * La membresía y la solicitud son dos filas distintas a propósito: la primera
 * dice si hoy pertenece, la segunda guarda las respuestas del cuestionario y
 * quién decidió. Sin esto, aprobar desde la pantalla de miembros dejaba la
 * solicitud colgada en `pending` para siempre.
 */
async function closeJoinRequest(
    ctx: any,
    communityId: string,
    userId: string,
    status: 'approved' | 'rejected',
    decidedByUserId: string,
) {
    const request = await ctx.db
        .query('communityJoinRequests')
        .withIndex('by_community_user', (q: any) =>
            q.eq('communityId', communityId).eq('userId', userId),
        )
        .filter((q: any) => q.eq(q.field('status'), 'pending'))
        .first();
    if (!request) return;
    await ctx.db.patch(request._id, {
        status,
        decidedAt: NOW(),
        decidedByUserId,
    });
}

export const createCommunity = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        name: v.string(),
        description: v.optional(v.string()),
        coverImage: v.optional(v.string()),
        kind: v.union(v.literal('business'), v.literal('user')),
        visibility: v.union(v.literal('public'), v.literal('private'), v.literal('secret')),
        joinPolicy: v.optional(
            v.union(
                v.literal('open'),
                v.literal('approval'),
                v.literal('questionnaire'),
                v.literal('invite'),
            ),
        ),
        slug: v.optional(v.string()),
        topic: v.optional(v.string()),
        location: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await assertSocialRate(ctx, actor, 'createCommunity');

        const name = args.name.trim();
        if (name.length < 3) throw new ConvexError({ code: 'FORBIDDEN', message: 'El nombre es demasiado corto.' });

        const slug = await normalizeFreeSlug(ctx, args.slug, name);

        const now = NOW();
        const communityId = await ctx.db.insert('commercialCommunities', {
            name,
            description: args.description,
            coverImage: args.coverImage,
            ownerUserId: actor.idString,
            kind: args.kind,
            visibility: args.visibility,
            // Una comunidad secreta sin política explícita sólo puede ser por
            // invitación: si cayera en 'open', el link filtrado la abriría.
            joinPolicy: args.joinPolicy ?? resolveJoinPolicy({ visibility: args.visibility }),
            slug,
            topic: args.topic?.trim() || undefined,
            location: args.location,
            memberCount: 1,
            lastActivityAt: now,
            createdAt: now,
            updatedAt: now,
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
        bannerImage: v.optional(v.string()),
        visibility: v.optional(
            v.union(v.literal('public'), v.literal('private'), v.literal('secret')),
        ),
        joinPolicy: v.optional(
            v.union(
                v.literal('open'),
                v.literal('approval'),
                v.literal('questionnaire'),
                v.literal('invite'),
            ),
        ),
        slug: v.optional(v.string()),
        topic: v.optional(v.string()),
        location: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await requireOwnerOrAdmin(ctx, String(args.communityId), actor.idString);

        const patch: Record<string, any> = {};
        if (args.name !== undefined) patch.name = args.name.trim();
        if (args.description !== undefined) patch.description = args.description;
        if (args.coverImage !== undefined) patch.coverImage = args.coverImage;
        if (args.bannerImage !== undefined) patch.bannerImage = args.bannerImage;
        if (args.visibility !== undefined) patch.visibility = args.visibility;
        if (args.joinPolicy !== undefined) patch.joinPolicy = args.joinPolicy;
        if (args.topic !== undefined) patch.topic = args.topic.trim() || undefined;
        if (args.location !== undefined) patch.location = args.location;
        if (args.slug !== undefined) {
            const existing = await ctx.db.get(args.communityId);
            patch.slug = await normalizeFreeSlug(
                ctx,
                args.slug,
                existing?.name ?? 'comunidad',
                String(args.communityId),
            );
        }
        if (Object.keys(patch).length) {
            patch.updatedAt = NOW();
            await ctx.db.patch(args.communityId, patch);
        }
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

        const isActiveMember = membership?.status === 'active';
        const media = createMediaResolver(ctx);

        // Secreta: no existe para quien no sea miembro. Ni siquiera se confirma
        // que el id sea real — si devolviera un stub, cualquiera podría
        // enumerar comunidades secretas probando ids. La única puerta es
        // `communityAccess.previewInvite` con un token válido.
        if (community.visibility === 'secret' && !isActiveMember) return null;

        // Privada: antes devolvía `null`, así que el usuario que llegaba por un
        // link no veía NADA y no tenía cómo pedir entrar. Ahora devuelve una
        // ficha pública — lo justo para decidir si solicitar — pero sin feed,
        // sin miembros y sin post fijado.
        if (community.visibility === 'private' && !isActiveMember) {
            return {
                _id: community._id,
                name: community.name,
                description: community.description,
                coverImage: await media(community.coverImage),
                bannerImage: await media(community.bannerImage),
                kind: community.kind,
                visibility: community.visibility,
                joinPolicy: resolveJoinPolicy(community),
                hasQuestionnaire: community.hasQuestionnaire ?? false,
                topic: community.topic,
                location: community.location,
                memberCount: community.memberCount,
                rules: community.rules ?? [],
                createdAt: community.createdAt,
                isPreview: true as const,
                myMembership: membership ?? null,
            };
        }

        return {
            ...community,
            coverImage: await media(community.coverImage),
            bannerImage: await media(community.bannerImage),
            joinPolicy: resolveJoinPolicy(community),
            isPreview: false as const,
            myMembership: membership ?? null,
        };
    },
});

export const searchCommunities = query({
    args: {
        sessionToken: v.optional(v.string()),
        term: v.optional(v.string()),
        kind: v.optional(v.union(v.literal('business'), v.literal('user'))),
        topic: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        if (!(await socialViewer(ctx, args.sessionToken))) return [];
        const cap = Math.min(args.limit ?? 20, 50);

        // Las privadas SÍ se descubren: se ven en el directorio y desde ahí se
        // solicita ingreso — es lo que las distingue de las secretas. Las
        // secretas no aparecen jamás, en ninguna rama.
        //
        // El filtro del search index es sólo por igualdad, así que no se puede
        // expresar "distinto de secret" ahí: se pide de más y se descarta acá.
        let results: any[];
        if (args.term && args.term.trim()) {
            results = await ctx.db
                .query('commercialCommunities')
                .withSearchIndex('search_name', (q: any) => {
                    let s = q.search('name', args.term!.trim());
                    if (args.kind) s = s.eq('kind', args.kind);
                    if (args.topic) s = s.eq('topic', args.topic);
                    return s;
                })
                .take(cap * 3);
        } else if (args.topic) {
            results = await ctx.db
                .query('commercialCommunities')
                .withIndex('by_topic_activity', (q: any) => q.eq('topic', args.topic))
                .order('desc')
                .take(cap * 3);
        } else {
            // Directorio en reposo: las más pobladas primero, sin tocar el
            // search index (que además puede estar reconstruyéndose).
            const pub = await ctx.db
                .query('commercialCommunities')
                .withIndex('by_visibility_members', (q: any) => q.eq('visibility', 'public'))
                .order('desc')
                .take(cap * 2);
            const priv = await ctx.db
                .query('commercialCommunities')
                .withIndex('by_visibility_members', (q: any) => q.eq('visibility', 'private'))
                .order('desc')
                .take(cap);
            results = [...pub, ...priv].sort(
                (a: any, b: any) => (b.memberCount ?? 0) - (a.memberCount ?? 0),
            );
            if (args.kind) results = results.filter((c: any) => c.kind === args.kind);
        }

        const media = createMediaResolver(ctx);
        return await Promise.all(
            results
                .filter((c: any) => !c.deletedAt && c.visibility !== 'secret')
                .slice(0, cap)
                .map(async (c: any) => ({
                    ...c,
                    coverImage: await media(c.coverImage),
                    joinPolicy: resolveJoinPolicy(c),
                })),
        );
    },
});

export const listMyCommunities = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return [];
        // Antes: `by_user` + `collect()` + filtro en memoria, así que traía
        // también las membresías left/pending/rejected para descartarlas acá.
        const active = await ctx.db
            .query('communityMembers')
            .withIndex('by_user_status', (q: any) =>
                q.eq('userId', actor.idString).eq('status', 'active'),
            )
            .collect();
        const media = createMediaResolver(ctx);
        const communities = await Promise.all(
            active.map(async (m: any) => {
                const nid = ctx.db.normalizeId('commercialCommunities', m.communityId);
                const c = nid ? await ctx.db.get(nid) : null;
                if (!c || c.deletedAt) return null;
                return {
                    ...c,
                    coverImage: await media(c.coverImage),
                    myRole: m.role,
                    pinnedAt: m.pinnedAt ?? null,
                    pinnedOrder: m.pinnedOrder ?? null,
                };
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
        if (existing && existing.status === 'banned') {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'No podés unirte a esta comunidad.' });
        }

        const policy = resolveJoinPolicy(community);

        // `questionnaire` e `invite` no se resuelven por acá: la primera exige
        // respuestas (`communityAccess.submitJoinRequest`) y la segunda un
        // token (`communityAccess.acceptInvite`). Entrar por este camino las
        // saltearía, así que se rechaza explícitamente en vez de degradar.
        if (policy === 'questionnaire') {
            throw new ConvexError({
                code: 'FORBIDDEN',
                message: 'Esta comunidad pide completar un cuestionario para entrar.',
            });
        }
        if (policy === 'invite') {
            throw new ConvexError({
                code: 'FORBIDDEN',
                message: 'Esta comunidad es sólo por invitación.',
            });
        }

        const status = policy === 'open' ? 'active' : 'pending';
        const now = NOW();

        if (existing) {
            await ctx.db.patch(existing._id, {
                status,
                createdAt: now,
                ...(status === 'active' ? { joinedAt: now } : {}),
            });
        } else {
            await ctx.db.insert('communityMembers', {
                communityId: String(args.communityId),
                userId: actor.idString,
                role: 'member',
                status,
                createdAt: now,
                ...(status === 'active' ? { joinedAt: now } : {}),
            });
        }

        if (status === 'active') {
            await adjustMemberCount(ctx, String(args.communityId), 1);
            await awardSocialAction(ctx, actor.idString, 'sp_community_join', String(args.communityId));
        } else {
            await ctx.db.insert('communityJoinRequests', {
                communityId: String(args.communityId),
                userId: actor.idString,
                answers: [],
                status: 'pending',
                createdAt: now,
            });
            await recordActivity(ctx, {
                userId: community.ownerUserId,
                // Antes se emitía `community_invite`, que significa lo
                // contrario (invitar a alguien, no pedir entrar).
                type: 'community_join_request',
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

        // El quién/cuándo de la decisión vive en `communityJoinRequests`, que
        // es la fila que representa el trámite; la membresía sólo dice si hoy
        // pertenece. Ver `closeJoinRequest`.
        const now = NOW();
        await ctx.db.patch(membership._id, { status: 'active', joinedAt: now });
        await adjustMemberCount(ctx, String(args.communityId), 1);
        await closeJoinRequest(ctx, String(args.communityId), args.userId, 'approved', actor.idString);
        await awardSocialAction(ctx, args.userId, 'sp_community_join', String(args.communityId));
        await recordActivity(ctx, {
            userId: args.userId,
            type: 'community_join_approved',
            actorUserId: actor.idString,
            targetType: 'community',
            targetId: String(args.communityId),
        });
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
        // Antes se borraba la fila, así que no quedaba rastro: el admin no
        // podía distinguir "nunca pidió" de "ya lo rechacé", y el solicitante
        // podía volver a pedir en loop sin que nada lo registrara.
        if (membership) await ctx.db.patch(membership._id, { status: 'rejected' });
        await closeJoinRequest(ctx, String(args.communityId), args.userId, 'rejected', actor.idString);
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
        await ctx.db.patch(membership._id, { status: 'left', pinnedAt: undefined, pinnedOrder: undefined });
        await adjustMemberCount(ctx, String(args.communityId), -1);
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
        await ctx.db.patch(membership._id, { status: 'left', pinnedAt: undefined, pinnedOrder: undefined });
        await adjustMemberCount(ctx, String(args.communityId), -1);
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
            // MISMA hidratación que el feed global. Antes esto devolvía las
            // filas crudas de `socialPosts`, y por eso el feed de una comunidad
            // mostraba "posts que no existen": sin `decoratePosts` no se
            // resolvía el autor (salían usuarios en blanco), no se aplicaba la
            // moderación del viewer (silenciados y ocultos seguían apareciendo),
            // la media quedaba como `convex-storage:<id>` sin resolver, y sobre
            // todo NO se descartaban los posts cuyo perfil de autor no se puede
            // hidratar — que es literalmente contenido fantasma.
            const moderationSets = await loadViewerModerationSets(ctx, actor.idString);
            const decorated = await decoratePosts(ctx, page.items, actor.idString, moderationSets);
            return { items: decorated, nextCursor: page.nextCursor };
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
        // La decoración va DESPUÉS de rankear: `scoreLoop` sólo mira contadores
        // del propio post, así que hidratar antes sería trabajo tirado sobre los
        // que el cap de diversidad descarta.
        const decoratedVideos = await decoratePosts(ctx, capped, actor.idString, moderation);
        return { items: decoratedVideos, nextCursor: page.nextCursor };
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
        // Las imágenes se resuelven acá por la misma razón que en el resto del
        // módulo (E-091): un `convex-storage:<id>` crudo el cliente no lo puede
        // cargar y la vidriera sale sin fotos. `resolve` deja pasar sin tocar
        // las URLs que ya son absolutas, así que no cuesta nada.
        const media = createMediaResolver(ctx);
        return await Promise.all(
            rows
                .map((r: any, i: number) => ({ ...r, listing: listings[i] ?? null }))
                .filter((r: any) => r.listing)
                .map(async (r: any) => ({
                    ...r,
                    listing: {
                        ...r.listing,
                        images: Array.isArray(r.listing.images)
                            ? await Promise.all(r.listing.images.map((img: string) => media(img)))
                            : r.listing.images,
                    },
                })),
        );
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
