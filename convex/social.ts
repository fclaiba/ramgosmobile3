/**
 * Social module — backend for posts, stories, follows, comments, likes, DMs.
 *
 * Replaces the previous client-side `SocialContext.tsx` mock that lived in
 * AsyncStorage. Posts now persist server-side, like/follow are reactive
 * across devices, and DMs work in real time via Convex `useQuery`.
 *
 * Auth model: every mutation/query goes through `assertSocialActor` which
 * delegates to `requireActor` for now. Future moderation hooks (suspended
 * accounts, shadowbans) plug into that helper without touching call sites.
 *
 * Push integration: `follow`, `addComment`, `toggleLike` (post-only,
 * throttled), and `sendDirectMessage` schedule a `notifications.notifyUser`
 * action so the recipient gets an Expo push.
 *
 * Pagination: feed/comments/messages return `{ items, nextCursor }`. The
 * frontend can call `getFeed({ cursor })` until `nextCursor === null`.
 */

import { v, ConvexError } from 'convex/values';
import { Id } from './_generated/dataModel';
import { requireActor } from './authHelpers';
import {
    mutation,
    query,
    internalQuery,
    internalMutation,
    internalAction,
} from './_generated/server';
import { api, internal } from './_generated/api';
import { assertSocialActor, paginateQuery, socialViewer } from './social/_helpers';
import { resolveMediaUrl, createMediaResolver } from './mediaUrl';
import { findFreeHandle, normalizeHandle, writeUserIdentity } from './users/identity';
import { searchDirectoryImpl } from './userDirectory';
import { toUserCardById } from './userCard';
import { assertTextAllowed, extractHashtags, extractMentions } from './social/moderationText';
import { attachHashtags } from './social/hashtags';
import { attachMentions } from './social/mentions';
import { awardSocialAction, qualifiesForReward } from './social/gamification';
import { recordActivity } from './social/activity';
import { buildEventKey, revokePoints } from './economy/pointsEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = () => new Date().toISOString();
const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const LIKE_PUSH_THROTTLE_MS = 60 * 60 * 1000; // 1 push/hour/target/recipient

const sortedKey = (ids: string[]) => [...ids].sort().join(':');

/**
 * Perfil social perezoso. El handle YA NO se deriva del prefijo del email:
 * se toma el canónico de `users.username`. Derivarlo era la causa de que
 * alguien registrado como `@fran` apareciera en el módulo social como
 * `@fklaisse` y de que buscarlo por su @ real no diera nada.
 *
 * Si el usuario todavía no tiene handle (cuentas viejas, seeds), se le asigna
 * uno y se escribe en `users` — no en `socialUsers`, para que no vuelva a
 * haber dos identidades.
 */
const ensureSocialUser = async (ctx: any, userId: string) => {
    const existing = await ctx.db
        .query('socialUsers')
        .withIndex('by_user', (q: any) => q.eq('userId', userId))
        .first();
    if (existing) return existing;

    const normId = ctx.db.normalizeId('users', userId);
    const user = normId ? await ctx.db.get(normId) : null;

    let handle = normalizeHandle(user?.username);
    if (!handle && user) {
        handle = await findFreeHandle(
            ctx,
            normalizeHandle(user.email?.split('@')[0]) ??
                normalizeHandle(user.nickname) ??
                normalizeHandle(user.name) ??
                'user',
        );
        await writeUserIdentity(ctx, user._id, { username: handle });
    }
    if (!handle) handle = await findFreeHandle(ctx, 'user');

    // `displayName` NUNCA con el email: era lo que hacía `createPost`.
    const displayName = user?.nickname?.trim() || user?.name?.trim() || 'Usuario';

    const now = NOW();
    const id = await ctx.db.insert('socialUsers', {
        userId,
        username: handle,
        displayName,
        avatar: user?.avatar,
        followerCount: 0,
        followingCount: 0,
        postCount: 0,
        verified: false,
        isInfluencer: user?.role === 'influencer',
        createdAt: now,
        updatedAt: now,
    });
    return await ctx.db.get(id);
};

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const upsertSocialProfile = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        username: v.optional(v.string()),
        displayName: v.optional(v.string()),
        bio: v.optional(v.string()),
        avatar: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);

        const profile = await ensureSocialUser(ctx, actor.idString);

        const patch: Record<string, any> = { updatedAt: NOW() };
        if (args.displayName !== undefined) patch.displayName = args.displayName;
        if (args.bio !== undefined) patch.bio = args.bio;
        if (args.avatar !== undefined) patch.avatar = args.avatar;

        await ctx.db.patch(profile!._id, patch);

        // El handle es uno solo y vive en `users`. Cambiarlo sólo acá creaba
        // una segunda identidad que el resto de la app no veía.
        if (args.username || args.displayName !== undefined || args.avatar !== undefined) {
            const userRef = ctx.db.normalizeId('users', actor.idString);
            if (userRef) {
                await writeUserIdentity(ctx, userRef, {
                    ...(args.username ? { username: args.username } : {}),
                    ...(args.avatar !== undefined ? { avatar: args.avatar } : {}),
                });
            }
        }
        return profile!._id;
    },
});

export const lookupUserSocial = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.optional(v.string()),
        username: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Gracefully return null if no valid session — this is a read-only
        // query and should never crash the app's error boundary.
        try {
            await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return null;
        }

        let profile: any = null;
        if (args.userId) {
            profile = await ctx.db
                .query('socialUsers')
                .withIndex('by_user', (q) => q.eq('userId', args.userId!))
                .first();
        } else if (args.username) {
            profile = await ctx.db
                .query('socialUsers')
                .withIndex('by_username', (q) => q.eq('username', args.username!.toLowerCase()))
                .first();
        }
        return profile ?? null;
    },
});

/** Public counters for commercial / hybrid profiles (no session required). */
export const getPublicSocialStats = query({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        const profile = await ctx.db
            .query('socialUsers')
            .withIndex('by_user', (q) => q.eq('userId', args.userId))
            .first();
        if (!profile) {
            return {
                followerCount: 0,
                followingCount: 0,
                postCount: 0,
                username: null as string | null,
            };
        }
        return {
            followerCount: profile.followerCount ?? 0,
            followingCount: profile.followingCount ?? 0,
            postCount: profile.postCount ?? 0,
            username: profile.username ?? null,
        };
    },
});

/**
 * Compatibilidad. El buscador real vive en `api.userDirectory.search`; este
 * export se mantiene porque lo consume un bundle web ya desplegado que no
 * podemos forzar a refrescar.
 *
 * `UserCardDto` es un superconjunto de lo que ese cliente lee (`userId`,
 * `username`, `displayName`, `avatar`, `verified`, `followerCount`), así que
 * los clientes viejos siguen andando y encima mejoran sin desplegar nada.
 *
 * Dos cambios a propósito: ya no TIRA con la sesión vencida (devuelve `[]`,
 * como manda la convención de queries), y no devuelve `_id` — el viejo era un
 * id de `socialUsers`; devolver uno de `users` bajo la misma clave sería
 * silenciosamente incorrecto.
 */
export const searchUsers = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        term: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<any[]> =>
        await searchDirectoryImpl(ctx, (args as any).sessionToken, args.term, args.limit ?? 20, {
            excludeSelf: true,
        }),
});

export const getSuggestedUsers = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
        const cap = Math.min(args.limit ?? 10, 20);

        const follows = await ctx.db
            .query('socialFollows')
            .withIndex('by_follower', (q) => q.eq('followerUserId', actor.idString))
            .take(500);
        const followingIds = new Set(follows.map((f: any) => f.followeeUserId));
        followingIds.add(actor.idString);

        // Ranking real por el índice, en vez de tomar 100 filas arbitrarias
        // y ordenarlas en JS — eso no era una sugerencia, era una muestra.
        const top = await ctx.db
            .query('socialUsers')
            .withIndex('by_follower_count')
            .order('desc')
            .take(cap * 5);

        return top.filter((u: any) => !followingIds.has(u.userId)).slice(0, cap);
    },
});

export const getUsersByIds = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userIds: v.array(v.string()),
    },
    handler: async (ctx, args) => {
        try {
            await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
        if (args.userIds.length === 0) return [];

        const profiles = await Promise.all(
            args.userIds.map((id) =>
                ctx.db
                    .query('socialUsers')
                    .withIndex('by_user', (q: any) => q.eq('userId', id))
                    .first(),
            ),
        );
        return profiles.filter(Boolean);
    },
});

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

/**
 * Límite de caracteres de un post (decisión de producto, 2026-08-18).
 * Espejo en `src/utils/inputLimits.ts` (`LIMITS.socialPost`) — ese es sólo
 * para que el `TextInput` corte al escribir; la validación real es ésta,
 * porque `saveDraft` reusa este mismo validador y `publishDraftNow`/el cron
 * de programados reusan `createPostImpl` — un límite sólo en la UI del
 * composer se saltea guardando un borrador con más texto.
 */
export const SOCIAL_POST_MAX_LENGTH = 320;

const assertPostLength = (content: string) => {
    if (content.length > SOCIAL_POST_MAX_LENGTH) {
        throw new ConvexError({
            code: 'CONTENT_TOO_LONG',
            message: `Los posts no pueden superar los ${SOCIAL_POST_MAX_LENGTH} caracteres.`,
        });
    }
};

/**
 * Validador de `createPost`, exportado para que `social/drafts.ts` pueda
 * validar el payload de un borrador con EXACTAMENTE el mismo esquema — sin
 * esto un borrador podría guardar campos que la publicación real rechaza, y
 * el error aparecería recién al publicar, no al guardar.
 */
export const createPostArgsValidator = {
    type: v.union(
        v.literal('text'),
        v.literal('image'),
        v.literal('video'),
        v.literal('poll'),
        v.literal('commercial'),
    ),
    content: v.string(),
    images: v.optional(v.array(v.string())),
    imageAlts: v.optional(v.array(v.string())),
    videoUrl: v.optional(v.string()),
    poll: v.optional(v.object({
        options: v.array(v.object({
            id: v.string(),
            text: v.string(),
        })),
        durationHours: v.optional(v.number()),
    })),
    commercialProduct: v.optional(v.object({
        listingId: v.optional(v.string()),
        name: v.string(),
        price: v.number(),
        image: v.optional(v.string()),
        commission: v.optional(v.number()),
        referralLink: v.optional(v.string()),
        type: v.optional(v.string()),
        location: v.optional(v.string()),
        description: v.optional(v.string()),
        discountPercent: v.optional(v.number()),
    })),
    attachedListingId: v.optional(v.id('listings')),
    // Hilos / quote-repost (Fase 4).
    parentPostId: v.optional(v.id('socialPosts')),
    quotedPostId: v.optional(v.id('socialPosts')),
    // Comunidades comerciales (Fase 6): post scoped a una comunidad.
    communityId: v.optional(v.id('commercialCommunities')),
};

type CreatePostArgs = {
    type: 'text' | 'image' | 'video' | 'poll' | 'commercial';
    content: string;
    images?: string[];
    imageAlts?: string[];
    videoUrl?: string;
    poll?: { options: Array<{ id: string; text: string }>; durationHours?: number };
    commercialProduct?: any;
    attachedListingId?: any;
    parentPostId?: any;
    quotedPostId?: any;
    communityId?: any;
};

/**
 * Cuerpo real de `createPost`, extraído a función plana para que
 * `social/drafts.ts` pueda publicar un borrador/programado llamando
 * EXACTAMENTE el mismo camino que una publicación en vivo — mismo filtro de
 * texto, mismos hashtags/menciones, misma gamificación. Nunca se llama
 * directo desde el cliente; para eso está la mutation `createPost` de abajo.
 */
export const createPostImpl = async (ctx: any, actor: { idString: string; role: string }, args: CreatePostArgs) => {
        assertPostLength(args.content);
        await ensureSocialUser(ctx, actor.idString);

        // Filtro de palabras (Fase 2). `block` corta acá; `flag` deja pasar
        // pero el post nace `flagged` para la cola de moderación.
        const textVerdict = await assertTextAllowed(ctx, args.content, 'post');

        let parentPostId: string | undefined;
        let rootPostId: string | undefined;
        let parentDoc: any = null;
        if (args.parentPostId) {
            parentDoc = await ctx.db.get(args.parentPostId);
            if (!parentDoc || parentDoc.deletedAt) {
                throw new ConvexError({ code: 'FORBIDDEN', message: 'El post al que respondés ya no existe.' });
            }
            parentPostId = String(args.parentPostId);
            rootPostId = parentDoc.rootPostId ?? String(args.parentPostId);
        }

        if (args.communityId) {
            const membership = await ctx.db
                .query('communityMembers')
                .withIndex('by_community_user', (q: any) =>
                    q.eq('communityId', String(args.communityId)).eq('userId', actor.idString),
                )
                .first();
            if (!membership || membership.status !== 'active') {
                throw new ConvexError({ code: 'FORBIDDEN', message: 'No sos miembro de esta comunidad.' });
            }
        }

        const now = NOW();
        const pollPayload = args.poll
            ? {
                options: args.poll.options.map((o) => ({ ...o, votes: 0 })),
                totalVotes: 0,
                endsAt: new Date(
                    Date.now() + (args.poll.durationHours ?? 24) * 3600_000,
                ).toISOString(),
                voters: [],
            }
            : undefined;

        let finalCommercialProduct = args.commercialProduct;

        if (args.attachedListingId) {
            const listing = await ctx.db.get(args.attachedListingId);
            if (listing) {
                finalCommercialProduct = {
                    listingId: listing._id,
                    name: listing.title,
                    price: listing.price,
                    image:
                        listing.images?.find((i: any) => i.isPrimary)?.url ??
                        listing.images?.[0]?.url ??
                        listing.image ??
                        listing.gallery?.[0],
                    type: listing.type,
                    description: listing.description,
                    // Commission the creator earns if the seller opened this
                    // listing to promotion; the payment path re-resolves it.
                    commission: listing.openPromotion === true
                        ? listing.openCommissionRate
                        : undefined,
                    discountPercent: listing.discountPercent,
                };
            }
        }

        // Stamp the author's country so the feed can rank commercial posts
        // locally without re-reading the profile for every candidate.
        const authorProfile = await ctx.db
            .query('socialUsers')
            .withIndex('by_user', (q: any) => q.eq('userId', actor.idString))
            .first();

        const postId = await ctx.db.insert('socialPosts', {
            authorUserId: actor.idString,
            type: args.type,
            content: args.content,
            images: args.images,
            imageAlts: args.imageAlts,
            videoUrl: args.videoUrl,
            poll: pollPayload,
            commercialProduct: finalCommercialProduct,
            likeCount: 0,
            commentCount: 0,
            retweetCount: 0,
            viewCount: 0,
            geoCountry: (authorProfile as any)?.country ?? undefined,
            moderationStatus: textVerdict.verdict === 'flag' ? 'flagged' : 'visible',
            parentPostId,
            rootPostId,
            replyCount: 0,
            quotedPostId: args.quotedPostId ? String(args.quotedPostId) : undefined,
            communityId: args.communityId ? String(args.communityId) : undefined,
            createdAt: now,
        });

        // Auto-reporte cuando el filtro sólo marcó (no bloqueó): entra a la
        // cola de admin sin que nadie tenga que reportarlo a mano.
        if (textVerdict.verdict === 'flag') {
            await ctx.db.insert('socialReports', {
                reporterUserId: 'system',
                targetType: 'post',
                targetId: String(postId),
                targetUserId: actor.idString,
                reason: 'other',
                details: `Filtro automático: ${textVerdict.matches.join(', ')}`,
                status: 'open',
                createdAt: now,
            });
        }

        if (parentPostId && parentDoc) {
            await ctx.db.patch(parentDoc._id, { replyCount: (parentDoc.replyCount ?? 0) + 1 });
        }

        // Bump postCount on the social profile.
        if (authorProfile) {
            await ctx.db.patch(authorProfile._id, {
                postCount: authorProfile.postCount + 1,
                updatedAt: now,
            });
        }

        // Hashtags + menciones: una sola pasada de regex sobre el texto ya
        // hecha en `moderationText.ts`; acá sólo se persiste.
        const hashtags = extractHashtags(args.content);
        if (hashtags.length) await attachHashtags(ctx, String(postId), actor.idString, hashtags);

        const mentionHandles = extractMentions(args.content);
        if (mentionHandles.length) {
            await attachMentions(ctx, {
                sourceType: 'post',
                sourceId: String(postId),
                actorUserId: actor.idString,
                handles: mentionHandles,
                preview: args.content.slice(0, 120),
            });
        }

        if (args.quotedPostId) {
            const quoted = await ctx.db.get(args.quotedPostId);
            if (quoted && quoted.authorUserId !== actor.idString) {
                await recordActivity(ctx, {
                    userId: quoted.authorUserId,
                    type: 'quote',
                    actorUserId: actor.idString,
                    targetType: 'post',
                    targetId: String(postId),
                    preview: args.content.slice(0, 120),
                });
            }
        }
        if (parentPostId && parentDoc && parentDoc.authorUserId !== actor.idString) {
            await recordActivity(ctx, {
                userId: parentDoc.authorUserId,
                type: 'reply',
                actorUserId: actor.idString,
                targetType: 'post',
                targetId: String(postId),
                preview: args.content.slice(0, 120),
            });
        }

        // Gamificación social (Fase 3): sólo si el contenido pasa un umbral
        // mínimo de calidad y no viene ya marcado por el filtro de texto.
        if (textVerdict.verdict === 'clean' && qualifiesForReward(args.content, Boolean(args.images?.length || args.videoUrl))) {
            await awardSocialAction(ctx, actor.idString, 'sp_post', String(postId));
        }

        return postId;
};

export const createPost = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        ...createPostArgsValidator,
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken, { write: 'createPost' });
        return createPostImpl(ctx, actor, args);
    },
});

export const deletePost = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postId: v.id('socialPosts'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const post = await ctx.db.get(args.postId);
        if (!post) throw new Error('Post no encontrado.');
        const isAuthor = post.authorUserId === actor.idString;
        const isAdmin = actor.role === 'admin' || actor.role === 'developer';
        if (!isAuthor && !isAdmin) throw new Error('No autorizado.');
        await ctx.db.patch(args.postId, { deletedAt: NOW() });

        if (post.parentPostId) {
            const parentId = ctx.db.normalizeId('socialPosts', post.parentPostId);
            const parent = parentId ? await ctx.db.get(parentId) : null;
            if (parent) await ctx.db.patch(parent._id, { replyCount: Math.max(0, (parent.replyCount ?? 0) - 1) });
        }

        // Cascade de hashtags (Fase B): el índice `by_post` existía desde
        // que se creó `socialPostTags` — el comentario del schema decía
        // "para poder borrar en cascada" pero nadie lo usaba, así que un tag
        // seguía contando para trending para siempre aunque su único post se
        // hubiera borrado.
        const tagRows = await ctx.db
            .query('socialPostTags')
            .withIndex('by_post', (q: any) => q.eq('postId', String(args.postId)))
            .collect();
        for (const row of tagRows) {
            const stats = await ctx.db
                .query('socialTagStats')
                .withIndex('by_tag', (q: any) => q.eq('tag', row.tag))
                .first();
            if (stats) {
                await ctx.db.patch(stats._id, {
                    countTotal: Math.max(0, stats.countTotal - 1),
                    count24h: Math.max(0, stats.count24h - 1),
                    count7d: Math.max(0, stats.count7d - 1),
                    updatedAt: NOW(),
                });
            }
            await ctx.db.delete(row._id);
        }

        // Clawback anti-abuso (Fase 3): "publicar → cobrar → borrar →
        // repetir" sólo se cierra si borrar dentro de las 24h revierte el
        // punto. Fuera de esa ventana, se asume que el punto ya "se ganó" de
        // verdad y no se toca — evita revertir contenido viejo que un admin
        // ni tocó.
        const ageMs = Date.now() - Date.parse(post.createdAt);
        if (ageMs < 24 * 60 * 60 * 1000) {
            await revokePoints(ctx, {
                userId: post.authorUserId,
                eventKey: buildEventKey('sp_post', String(args.postId), String(post.createdAt).slice(0, 10)),
                reason: 'Post borrado por su autor dentro de las 24h',
            });
        }
    },
});

export const votePoll = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postId: v.id('socialPosts'),
        optionId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const post = await ctx.db.get(args.postId);
        if (!post) throw new Error('Post no encontrado.');
        if (!post.poll) throw new Error('Este post no es una encuesta.');
        const voters: any[] = post.poll.voters ?? [];
        if (voters.some((vt: any) => vt.userId === actor.idString)) {
            throw new Error('Ya votaste en esta encuesta.');
        }
        if (new Date(post.poll.endsAt).getTime() < Date.now()) {
            throw new Error('La encuesta ya finalizó.');
        }
        const updatedOptions = post.poll.options.map((opt: any) =>
            opt.id === args.optionId ? { ...opt, votes: opt.votes + 1 } : opt,
        );
        await ctx.db.patch(args.postId, {
            poll: {
                ...post.poll,
                options: updatedOptions,
                totalVotes: post.poll.totalVotes + 1,
                voters: [...voters, { userId: actor.idString, optionId: args.optionId }],
            },
        });
    },
});

/**
 * Hydrates a page of posts with the author profile, the viewer's own
 * like/save state, and playable media URLs. Without this the client cannot
 * paint a correct heart on first render and has to issue one query per post to
 * find out — and images/videos would never load.
 */
/**
 * Sets de moderación del viewer para UNA página del feed: quién muteó,
 * quién bloqueó, qué ocultó a mano. Se cargan una vez por request — antes de
 * esto no existían (Fase 2) — y `decoratePosts`/`getFeed` los usan para
 * descartar candidatos ANTES de gastar lecturas en decorarlos.
 */
export type ViewerModerationSets = {
    mutedAuthors: Set<string>;
    hiddenPostIds: Set<string>;
    /** Autores marcados "No me interesa" en los últimos 30 días — señal
     *  negativa para el ranker (Fase 5), no un bloqueo duro. */
    notInterestedAuthors: Set<string>;
};

const NOT_INTERESTED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const loadViewerModerationSets = async (
    ctx: any,
    viewerId: string,
): Promise<ViewerModerationSets> => {
    const [mutes, hidden] = await Promise.all([
        ctx.db
            .query('socialMutes')
            .withIndex('by_muter', (q: any) => q.eq('muterUserId', viewerId))
            .take(500),
        ctx.db
            .query('socialHiddenPosts')
            .withIndex('by_user_created', (q: any) => q.eq('userId', viewerId))
            .order('desc')
            .take(500),
    ]);
    const cutoff = new Date(Date.now() - NOT_INTERESTED_WINDOW_MS).toISOString();
    const notInterestedAuthors = new Set<string>(
        hidden
            .filter((h: any) => h.reason === 'not_interested' && h.createdAt > cutoff)
            .map((h: any) => h.authorUserId),
    );
    return {
        mutedAuthors: new Set(mutes.map((m: any) => m.mutedUserId)),
        hiddenPostIds: new Set(hidden.map((h: any) => h.postId)),
        notInterestedAuthors,
    };
};

/** `true` si este post no debería llegar al feed/comentarios del viewer. */
const isModeratedOut = (
    post: any,
    viewerId: string,
    sets?: ViewerModerationSets,
): boolean => {
    if (post.moderationStatus === 'removed') return true;
    // Shadowbanned: sólo el propio autor lo ve. El resto del mundo, nada —
    // si tirara un error acá, el shadowban dejaría de ser "shadow".
    if (post.authorShadowbanned && post.authorUserId !== viewerId) return true;
    if (!sets) return false;
    if (sets.mutedAuthors.has(post.authorUserId)) return true;
    if (sets.hiddenPostIds.has(String(post._id))) return true;
    return false;
};

// Exportado para que `social/hashtags.ts` (`getPostsByTag`) hidrate posts sin
// duplicar la resolución de media ni el filtro de moderación/mute.
export const decoratePosts = async (
    ctx: any,
    posts: any[],
    viewerId: string,
    moderation?: ViewerModerationSets,
) => {
    if (posts.length === 0) return [];

    const authorIds = Array.from(new Set(posts.map((p) => p.authorUserId))) as string[];
    const authorProfiles = await Promise.all(
        authorIds.map((id) =>
            ctx.db
                .query('socialUsers')
                .withIndex('by_user', (q: any) => q.eq('userId', id))
                .first(),
        ),
    );
    const authorMap = new Map<string, any>();
    authorProfiles.forEach((p, i) => {
        if (p) authorMap.set(authorIds[i], p);
    });

    // El shadowban vive en `users.socialStatus`, no en `socialUsers` — hay
    // que resolverlo por autor para poder esconder sus posts de terceros.
    const shadowbannedAuthors = new Set<string>();
    if (moderation) {
        const authorUsers = await Promise.all(
            authorIds.map((id) => {
                const nid = ctx.db.normalizeId('users', id);
                return nid ? ctx.db.get(nid) : null;
            }),
        );
        authorUsers.forEach((u: any, i) => {
            if (u?.socialStatus === 'shadowbanned') shadowbannedAuthors.add(authorIds[i]);
        });
    }

    const visible = posts.filter(
        (p) =>
            !isModeratedOut(
                { ...p, authorShadowbanned: shadowbannedAuthors.has(p.authorUserId) },
                viewerId,
                moderation,
            ),
    );

    const [likeRows, saveRows] = await Promise.all([
        Promise.all(
            visible.map((p) =>
                ctx.db
                    .query('socialLikes')
                    .withIndex('by_user_target', (q: any) =>
                        q
                            .eq('userId', viewerId)
                            .eq('targetType', 'post')
                            .eq('targetId', String(p._id)),
                    )
                    .first(),
            ),
        ),
        Promise.all(
            visible.map((p) =>
                ctx.db
                    .query('socialSavedPosts')
                    .withIndex('by_user_post', (q: any) =>
                        q.eq('userId', viewerId).eq('postId', String(p._id)),
                    )
                    .first(),
            ),
        ),
    ]);

    // Memoizado por request: la misma referencia de storage (un avatar
    // repetido, una imagen compartida) se resuelve una sola vez por página
    // en vez de una vez por aparición.
    const media = createMediaResolver(ctx);
    await Promise.all(
        Array.from(authorMap.entries()).map(async ([id, a]: [string, any]) => {
            authorMap.set(id, { ...a, avatar: await media(a.avatar) });
        }),
    );

    return await Promise.all(
        visible.map(async (post, i) => ({
            ...post,
            viewCount: post.viewCount ?? 0,
            images: post.images
                ? await Promise.all(post.images.map((img: string) => media(img)))
                : post.images,
            videoUrl: await media(post.videoUrl),
            commercialProduct: post.commercialProduct
                ? {
                      ...post.commercialProduct,
                      image: await media(post.commercialProduct.image),
                  }
                : post.commercialProduct,
            author: authorMap.get(post.authorUserId) ?? null,
            isLikedByMe: Boolean(likeRows[i]),
            isSavedByMe: Boolean(saveRows[i]),
        })),
    );
};

/**
 * Ranking v2 para "forYou". La v1 sólo tenía recencia + engagement +
 * afinidad + geo comercial. Esta suma las dos señales que le faltaban al
 * doc original (§5 y §3):
 *
 *   - **Watch-time**: la palanca real de TikTok. Un video que se mira
 *     completo pesa más que uno que se saltea, más allá de cuántos likes
 *     tenga — `avgCompletionPct` se actualiza incrementalmente en `addView`.
 *   - **Conversión comercial**: el "Zero-Penalty Algorithm" que el doc
 *     promete en §3 ("el algoritmo premia los posts que generan
 *     transacciones") y que la v1 nunca implementó.
 *
 * Más dos frenos que la v1 tampoco tenía: penalizar autores marcados
 * "No me interesa" y penalizar posts que el viewer ya vio (sin esto el feed
 * repite contenido entre refrescos).
 */
const scorePost = (
    post: any,
    opts: {
        affinityAuthors: Set<string>;
        viewerCountry?: string;
        nowMs: number;
        notInterestedAuthors: Set<string>;
        alreadyViewedIds: Set<string>;
    },
) => {
    const ageHours = Math.max(0, (opts.nowMs - Date.parse(post.createdAt)) / 3_600_000);
    // Half-life of ~18h keeps the feed fresh without burying the first page.
    let score = 100 / (1 + ageHours / 18);

    const engagement = (post.likeCount ?? 0) * 2 + (post.commentCount ?? 0) * 3;
    score += Math.log1p(engagement) * 6;

    if (opts.affinityAuthors.has(post.authorUserId)) score += 25;

    if (post.commercialProduct) {
        const sameCountry =
            opts.viewerCountry && post.geoCountry
                ? post.geoCountry === opts.viewerCountry
                : true; // unknown geo → neither boosted nor punished
        score += sameCountry ? 15 : -40;
    }

    // Watch-time: sólo cuenta con muestra real, para no castigar un video
    // recién publicado que todavía no tiene reproducciones.
    if ((post.watchSampleCount ?? 0) > 0) {
        score += ((post.avgCompletionPct ?? 0.5) - 0.5) * 40;
    }

    // Conversión: log1p para que la 1ª venta pese mucho y la 50ª ya no tanto.
    if (post.salesCount) score += Math.log1p(post.salesCount) * 15;

    if (opts.notInterestedAuthors.has(post.authorUserId)) score -= 60;
    if (opts.alreadyViewedIds.has(String(post._id))) score -= 80;

    return score;
};

/**
 * Cap de diversidad: máximo 2 posts del mismo autor por página. Sin esto un
 * creador prolífico monopoliza el feed y perjudica el retention — 5 líneas
 * que valen más que la mitad de los pesos del ranker.
 */
const applyAuthorDiversityCap = (ranked: any[], cap: number, perAuthor = 2): any[] => {
    const counts = new Map<string, number>();
    const kept: any[] = [];
    for (const post of ranked) {
        const n = counts.get(post.authorUserId) ?? 0;
        if (n >= perAuthor) continue;
        counts.set(post.authorUserId, n + 1);
        kept.push(post);
        if (kept.length >= cap) break;
    }
    return kept;
};

const FOLLOW_FANOUT_CAP = 200;
const FORYOU_POOL_CAP = 90;
const FORYOU_OVERSAMPLE = 4; // 3x en v1; sube a 4x para compensar el filtro de moderación.

/** `true` si el post no debe considerarse para el feed global (ni ranking). */
const isGlobalFeedEligible = (post: any): boolean =>
    !post.deletedAt && post.parentPostId === undefined && post.communityId === undefined;

export const getFeed = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
        authorUserId: v.optional(v.string()),
        mode: v.optional(
            v.union(
                v.literal('forYou'),
                v.literal('following'),
                v.literal('videos'),
                v.literal('recent'),
            ),
        ),
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return { items: [], nextCursor: null };
        }
        const viewerId = actor.idString;
        const cap = Math.min(args.limit ?? 20, 50);
        const cursor = args.cursor ?? undefined;
        // DEFAULT CRONOLÓGICO (decisión de producto, 2026-08-18).
        //
        // El feed sale por **orden de subida**: lo más nuevo primero, sin
        // reordenar. `forYou` (el ranker de `scorePost`: watch-time,
        // conversión, afinidad, geo) sigue existiendo pero SÓLO si el cliente
        // lo pide explícitamente con `mode: 'forYou'` — ya no es el default.
        //
        // Esto reemplaza lo que §5 del doc de arquitectura describía como
        // motor de recomendación por defecto. El motivo práctico: con un
        // catálogo chico de posts, un feed rankeado hace que una publicación
        // recién subida no aparezca arriba (o que el cap de diversidad por
        // autor directamente la saque de la página), y se lee como que la
        // app "perdió" el post.
        const mode = args.mode ?? 'recent';

        // Every mode uses the same `createdAt` cursor so the client paginates
        // identically regardless of which tab it is on.
        const olderThan = (q: any, field = 'createdAt') =>
            cursor ? q.lt(field, cursor) : q;

        // Una sola carga por página, reusada por todos los modos (Fase 2).
        const moderation = await loadViewerModerationSets(ctx, viewerId);

        let candidates: any[] = [];
        // Tamaño y "createdAt" más viejo del LOTE CRUDO (antes de filtrar
        // replies/comunidad/moderación). El cursor se calcula sobre esto, no
        // sobre `candidates`: si el filtro descarta la mitad del lote, usar
        // `candidates.length` para decidir "se acabó" cortaría la paginación
        // mucho antes de que en verdad se acabaran los posts.
        let rawCount = 0;
        let oldestRawCreatedAt: string | null = null;
        let rawTakeSize = cap;

        if (args.authorUserId) {
            // Perfil: SÍ incluye replies del autor (es lo que muestra su
            // pestaña de posts), pero nunca posts de comunidad.
            rawTakeSize = cap * 2;
            const raw = await ctx.db
                .query('socialPosts')
                .withIndex('by_author_created', (q: any) =>
                    olderThan(q.eq('authorUserId', args.authorUserId!)),
                )
                .order('desc')
                .filter((q: any) => q.eq(q.field('deletedAt'), undefined))
                .take(rawTakeSize);
            rawCount = raw.length;
            oldestRawCreatedAt = raw.length ? raw[raw.length - 1].createdAt : null;
            candidates = raw.filter((p: any) => p.communityId === undefined).slice(0, cap);
        } else if (mode === 'videos') {
            rawTakeSize = cap * 2;
            const raw = await ctx.db
                .query('socialPosts')
                .withIndex('by_type_created', (q: any) => olderThan(q.eq('type', 'video')))
                .order('desc')
                .filter((q: any) => q.eq(q.field('deletedAt'), undefined))
                .take(rawTakeSize);
            rawCount = raw.length;
            oldestRawCreatedAt = raw.length ? raw[raw.length - 1].createdAt : null;
            candidates = raw.filter(isGlobalFeedEligible).slice(0, cap);
        } else if (mode === 'following') {
            const follows = await ctx.db
                .query('socialFollows')
                .withIndex('by_follower', (q: any) => q.eq('followerUserId', viewerId))
                .take(FOLLOW_FANOUT_CAP);
            const authors = Array.from(
                new Set([viewerId, ...follows.map((f: any) => f.followeeUserId)]),
            );
            const perAuthor = await Promise.all(
                authors.map((a) =>
                    ctx.db
                        .query('socialPosts')
                        .withIndex('by_author_created', (q: any) => olderThan(q.eq('authorUserId', a)))
                        .order('desc')
                        .filter((q: any) => q.eq(q.field('deletedAt'), undefined))
                        .take(cap),
                ),
            );
            const raw = perAuthor.flat().sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
            rawCount = raw.length;
            oldestRawCreatedAt = raw.length ? raw[raw.length - 1].createdAt : null;
            candidates = raw.filter(isGlobalFeedEligible).slice(0, cap);
        } else if (mode === 'forYou') {
            rawTakeSize = Math.min(cap * FORYOU_OVERSAMPLE, FORYOU_POOL_CAP);
            const rawPool = await ctx.db
                .query('socialPosts')
                .withIndex('by_created', (q: any) => olderThan(q))
                .order('desc')
                .filter((q: any) => q.eq(q.field('deletedAt'), undefined))
                .take(rawTakeSize);
            rawCount = rawPool.length;
            oldestRawCreatedAt = rawPool.length ? rawPool[rawPool.length - 1].createdAt : null;
            const pool = rawPool.filter(isGlobalFeedEligible);

            const recentLikes = await ctx.db
                .query('socialLikes')
                .withIndex('by_user_target', (q: any) =>
                    q.eq('userId', viewerId).eq('targetType', 'post'),
                )
                .order('desc')
                .take(50);
            const likedPosts = await Promise.all(
                recentLikes.map((l: any) => {
                    const id = ctx.db.normalizeId('socialPosts', l.targetId);
                    return id ? ctx.db.get(id) : null;
                }),
            );
            const affinityAuthors = new Set<string>(
                likedPosts.filter(Boolean).map((p: any) => p.authorUserId),
            );

            const recentViews = await ctx.db
                .query('socialPostViews')
                .withIndex('by_viewer_created', (q: any) => q.eq('viewerUserId', viewerId))
                .order('desc')
                .take(200);
            const alreadyViewedIds = new Set<string>(recentViews.map((v: any) => v.postId));

            const viewer = await ctx.db
                .query('socialUsers')
                .withIndex('by_user', (q: any) => q.eq('userId', viewerId))
                .first();
            const viewerCountry = (viewer as any)?.country ?? undefined;

            const nowMs = Date.now();
            const ranked = pool
                .map((p: any) => ({
                    post: p,
                    score: scorePost(p, {
                        affinityAuthors,
                        viewerCountry,
                        nowMs,
                        notInterestedAuthors: moderation.notInterestedAuthors,
                        alreadyViewedIds,
                    }),
                }))
                .sort((a, b) => b.score - a.score)
                .map((x) => x.post);

            // The cursor must stay chronological even though the page is
            // ranked, otherwise pagination would loop over the same window.
            candidates = applyAuthorDiversityCap(ranked, cap);
        } else {
            rawTakeSize = cap * 2;
            const raw = await ctx.db
                .query('socialPosts')
                .withIndex('by_created', (q: any) => olderThan(q))
                .order('desc')
                .filter((q: any) => q.eq(q.field('deletedAt'), undefined))
                .take(rawTakeSize);
            rawCount = raw.length;
            oldestRawCreatedAt = raw.length ? raw[raw.length - 1].createdAt : null;
            candidates = raw.filter(isGlobalFeedEligible).slice(0, cap);
        }

        const items = await decoratePosts(ctx, candidates, viewerId, moderation);
        // "Se acabó" se decide con el lote crudo: si vino más chico que lo
        // pedido, no hay nada más atrás. Si vino lleno, puede haber más
        // aunque el filtro haya dejado `candidates` por debajo de `cap`.
        const nextCursor = rawCount < rawTakeSize ? null : oldestRawCreatedAt;

        return { items, nextCursor };
    },
});

/**
 * Idempotent impression counter — Y la fuente de la señal de watch-time
 * (Fase 5). El cliente manda `dwellMs`/`completionPct` al SALIR de cada
 * ítem (no al entrar): `onViewableItemsChanged` dispara cuando un post deja
 * de estar en pantalla, con lo que estuvo visible.
 *
 * `avgCompletionPct` se actualiza con una media incremental
 * (`avg' = avg + (x - avg) / n`) para no tener que releer ni promediar todas
 * las vistas del post en cada request — el costo es O(1) por vista, no
 * O(vistas totales).
 */
export const addView = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postIds: v.array(v.id('socialPosts')),
        watch: v.optional(v.array(v.object({
            postId: v.id('socialPosts'),
            dwellMs: v.optional(v.number()),
            completionPct: v.optional(v.number()),
        }))),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const watchByPost = new Map<string, { dwellMs?: number; completionPct?: number }>(
            (args.watch ?? []).map((w) => [String(w.postId), w]),
        );

        let counted = 0;
        for (const postId of args.postIds.slice(0, 50)) {
            const watch = watchByPost.get(String(postId));
            const clampedCompletion =
                typeof watch?.completionPct === 'number'
                    ? Math.max(0, Math.min(1, watch.completionPct))
                    : undefined;

            const existing = await ctx.db
                .query('socialPostViews')
                .withIndex('by_post_viewer', (q: any) =>
                    q.eq('postId', String(postId)).eq('viewerUserId', actor.idString),
                )
                .first();

            const post = await ctx.db.get(postId);
            if (!post || post.deletedAt) continue;

            if (existing) {
                // Re-vio el mismo post (scroll de vuelta): actualiza SU fila
                // de watch-time si vio más esta vez, pero no vuelve a contar
                // la impresión ni a bumpear `viewCount`.
                if (clampedCompletion !== undefined && (existing.completionPct ?? 0) < clampedCompletion) {
                    await ctx.db.patch(existing._id, {
                        completionPct: clampedCompletion,
                        dwellMs: watch?.dwellMs,
                        updatedAt: NOW(),
                    });
                }
                continue;
            }

            await ctx.db.insert('socialPostViews', {
                postId: String(postId),
                viewerUserId: actor.idString,
                createdAt: NOW(),
                dwellMs: watch?.dwellMs,
                completionPct: clampedCompletion,
            });
            await ctx.db.patch(postId, { viewCount: (post.viewCount ?? 0) + 1 });
            counted += 1;

            if (clampedCompletion !== undefined) {
                const n = post.watchSampleCount ?? 0;
                const prevAvg = post.avgCompletionPct ?? 0.5;
                const nextAvg = prevAvg + (clampedCompletion - prevAvg) / (n + 1);
                await ctx.db.patch(postId, { avgCompletionPct: nextAvg, watchSampleCount: n + 1 });
            }
        }
        return { counted };
    },
});

export const getPostById = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postId: v.id('socialPosts'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const post = await ctx.db.get(args.postId);
        if (!post || post.deletedAt) return null;
        const moderation = await loadViewerModerationSets(ctx, actor.idString);
        // `isModeratedOut` deja pasar al autor sólo si está shadowbanned (el
        // shadowban tiene que seguir siendo invisible PARA ÉL); un post
        // `removed` por moderación es un take-down real y no lo ve nadie,
        // ni siquiera su autor — acá devuelve `null` como si no existiera.
        const [decorated] = await decoratePosts(ctx, [post], actor.idString, moderation);
        return decorated ?? null;
    },
});

export const getPostsByUser = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const cap = Math.min(args.limit ?? 50, 200);
        const posts = await ctx.db
            .query('socialPosts')
            .withIndex('by_author', (q) => q.eq('authorUserId', args.userId))
            .order('desc')
            .take(cap);
        const moderation = await loadViewerModerationSets(ctx, actor.idString);
        const items = await decoratePosts(
            ctx,
            posts.filter((p: any) => !p.deletedAt),
            actor.idString,
            moderation,
        );

        // Post fijado primero, si lo hay y sigue en esta página.
        const profile = await ctx.db
            .query('socialUsers')
            .withIndex('by_user', (q: any) => q.eq('userId', args.userId))
            .first();
        const pinnedId = profile?.pinnedPostId;
        const ordered = pinnedId
            ? [
                  ...items.filter((p: any) => String(p._id) === pinnedId),
                  ...items.filter((p: any) => String(p._id) !== pinnedId),
              ]
            : items;

        return { items: ordered, pinnedPostId: pinnedId ?? null };
    },
});

/** Fija un post en el perfil propio. Reemplaza al anterior si había uno. */
export const pinPost = mutation({
    args: { sessionToken: v.optional(v.string()), postId: v.id('socialPosts') },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const post = await ctx.db.get(args.postId);
        if (!post || post.authorUserId !== actor.idString) {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'Sólo podés fijar tus propios posts.' });
        }
        const profile = await ctx.db
            .query('socialUsers')
            .withIndex('by_user', (q: any) => q.eq('userId', actor.idString))
            .first();
        if (profile) await ctx.db.patch(profile._id, { pinnedPostId: String(args.postId) });
        return { success: true };
    },
});

export const unpinPost = mutation({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const profile = await ctx.db
            .query('socialUsers')
            .withIndex('by_user', (q: any) => q.eq('userId', actor.idString))
            .first();
        if (profile) await ctx.db.patch(profile._id, { pinnedPostId: undefined });
        return { success: true };
    },
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export const addComment = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postId: v.id('socialPosts'),
        content: v.string(),
        // Un nivel de respuesta, estilo IG: si `parentCommentId` a su vez
        // tiene padre, se aplana contra ESE padre en vez de anidar un tercer
        // nivel — así el árbol nunca se descontrola.
        parentCommentId: v.optional(v.id('socialComments')),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken, { write: 'addComment' });
        const post = await ctx.db.get(args.postId);
        if (!post || post.deletedAt) throw new Error('Post no encontrado.');

        const textVerdict = await assertTextAllowed(ctx, args.content, 'comment');

        let parentCommentId: string | undefined;
        let parentComment: any = null;
        if (args.parentCommentId) {
            const rawParent = await ctx.db.get(args.parentCommentId);
            if (rawParent && !rawParent.deletedAt) {
                if (rawParent.parentCommentId) {
                    // Ya era una respuesta: aplanar contra su padre.
                    const grandparentId = ctx.db.normalizeId('socialComments', rawParent.parentCommentId);
                    parentComment = grandparentId ? await ctx.db.get(grandparentId) : null;
                    parentCommentId = parentComment ? String(parentComment._id) : undefined;
                } else {
                    parentComment = rawParent;
                    parentCommentId = String(rawParent._id);
                }
            }
        }

        const now = NOW();
        const commentId = await ctx.db.insert('socialComments', {
            postId: String(args.postId),
            authorUserId: actor.idString,
            content: args.content,
            likeCount: 0,
            parentCommentId,
            replyCount: 0,
            moderationStatus: textVerdict.verdict === 'flag' ? 'flagged' : 'visible',
            createdAt: now,
        });
        await ctx.db.patch(args.postId, {
            commentCount: post.commentCount + 1,
        });
        if (parentComment) {
            await ctx.db.patch(parentComment._id, { replyCount: (parentComment.replyCount ?? 0) + 1 });
        }

        if (textVerdict.verdict === 'flag') {
            await ctx.db.insert('socialReports', {
                reporterUserId: 'system',
                targetType: 'comment',
                targetId: String(commentId),
                targetUserId: actor.idString,
                reason: 'other',
                details: `Filtro automático: ${textVerdict.matches.join(', ')}`,
                status: 'open',
                createdAt: now,
            });
        }

        const mentionHandles = extractMentions(args.content);
        if (mentionHandles.length) {
            await attachMentions(ctx, {
                sourceType: 'comment',
                sourceId: String(commentId),
                actorUserId: actor.idString,
                handles: mentionHandles,
                preview: args.content.slice(0, 120),
            });
        }

        // Actividad + push: al autor del comentario padre si es una
        // respuesta, o al autor del post si es un comentario de primer nivel.
        const recipientUserId = parentComment ? parentComment.authorUserId : post.authorUserId;
        const activityType = parentComment ? 'reply' : 'comment';
        await recordActivity(ctx, {
            userId: recipientUserId,
            type: activityType,
            actorUserId: actor.idString,
            targetType: 'post',
            targetId: String(args.postId),
            preview: args.content.slice(0, 120),
        });

        if (recipientUserId !== actor.idString) {
            const preview = args.content.length > 80 ? args.content.slice(0, 77) + '…' : args.content;
            await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                sendEmail: true,
                userId: recipientUserId,
                title: parentComment ? 'Te respondieron un comentario' : 'Nuevo comentario en tu post',
                body: preview,
                category: 'social',
                data: { type: 'comment', postId: String(args.postId), commentId: String(commentId) },
            });
        }

        // Gamificación: sólo comentarios de calidad mínima y limpios.
        if (textVerdict.verdict === 'clean' && qualifiesForReward(args.content, false)) {
            await awardSocialAction(ctx, actor.idString, 'sp_cmt', String(commentId));
        }

        return commentId;
    },
});

export const deleteComment = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        commentId: v.id('socialComments'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const comment = await ctx.db.get(args.commentId);
        if (!comment) throw new Error('Comentario no encontrado.');
        const isAuthor = comment.authorUserId === actor.idString;
        const isAdmin = actor.role === 'admin' || actor.role === 'developer';
        if (!isAuthor && !isAdmin) throw new Error('No autorizado.');
        await ctx.db.patch(args.commentId, { deletedAt: NOW() });
        const post = await ctx.db.get(comment.postId as any);
        if (post) {
            await ctx.db.patch(post._id, {
                commentCount: Math.max(0, (post as any).commentCount - 1),
            });
        }
        if (comment.parentCommentId) {
            const parentId = ctx.db.normalizeId('socialComments', comment.parentCommentId);
            const parent = parentId ? await ctx.db.get(parentId) : null;
            if (parent) await ctx.db.patch(parent._id, { replyCount: Math.max(0, (parent.replyCount ?? 0) - 1) });
        }

        const ageMs = Date.now() - Date.parse(comment.createdAt);
        if (ageMs < 24 * 60 * 60 * 1000) {
            await revokePoints(ctx, {
                userId: comment.authorUserId,
                eventKey: buildEventKey('sp_cmt', String(args.commentId), String(comment.createdAt).slice(0, 10)),
                reason: 'Comentario borrado por su autor dentro de las 24h',
            });
        }
    },
});

export const getCommentsForPost = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postId: v.id('socialPosts'),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        try {
            await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return { items: [], nextCursor: null };
        }
        const cap = Math.min(args.limit ?? 50, 100);
        const result = await ctx.db
            .query('socialComments')
            .withIndex('by_post_created', (q) => q.eq('postId', String(args.postId)))
            .order('desc')
            .paginate({ cursor: args.cursor ?? null, numItems: cap });

        // Sólo el primer nivel entra a la página principal; las respuestas
        // se piden aparte (`getCommentReplies`) cuando el usuario las abre —
        // así un comentario con 200 respuestas no infla la primera carga.
        const visible = result.page.filter(
            (c: any) => !c.deletedAt && c.moderationStatus !== 'removed' && !c.parentCommentId,
        );
        const authorIds = Array.from(new Set(visible.map((c: any) => c.authorUserId)));
        const authors = await Promise.all(
            authorIds.map((id: string) =>
                ctx.db
                    .query('socialUsers')
                    .withIndex('by_user', (q: any) => q.eq('userId', id))
                    .first(),
            ),
        );
        const map = new Map<string, any>();
        authors.forEach((a, i) => { if (a) map.set(authorIds[i], a); });

        return {
            items: visible.map((c: any) => ({ ...c, author: map.get(c.authorUserId) })),
            nextCursor: result.isDone ? null : result.continueCursor,
        };
    },
});

/** Respuestas de UN comentario de primer nivel, bajo demanda. */
export const getCommentReplies = query({
    args: { sessionToken: v.optional(v.string()), commentId: v.id('socialComments'), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        try {
            await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
        const cap = Math.min(args.limit ?? 50, 100);
        const replies = await ctx.db
            .query('socialComments')
            .withIndex('by_parent_created', (q: any) => q.eq('parentCommentId', String(args.commentId)))
            .order('asc')
            .take(cap);
        const visible = replies.filter((c: any) => !c.deletedAt && c.moderationStatus !== 'removed');
        const authorIds = Array.from(new Set(visible.map((c: any) => c.authorUserId)));
        const authors = await Promise.all(
            authorIds.map((id: string) =>
                ctx.db.query('socialUsers').withIndex('by_user', (q: any) => q.eq('userId', id)).first(),
            ),
        );
        const map = new Map<string, any>();
        authors.forEach((a, i) => { if (a) map.set(authorIds[i], a); });
        return visible.map((c: any) => ({ ...c, author: map.get(c.authorUserId) }));
    },
});

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

export const toggleLike = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        targetType: v.union(
            v.literal('post'),
            v.literal('comment'),
            v.literal('story'),
        ),
        targetId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken, { write: 'toggleLike' });
        const existing = await ctx.db
            .query('socialLikes')
            .withIndex('by_user_target', (q) =>
                q
                    .eq('userId', actor.idString)
                    .eq('targetType', args.targetType)
                    .eq('targetId', args.targetId),
            )
            .first();

        if (existing) {
            await ctx.db.delete(existing._id);
            await adjustLikeCount(ctx, args.targetType, args.targetId, -1);
            return { liked: false };
        }

        await ctx.db.insert('socialLikes', {
            userId: actor.idString,
            targetType: args.targetType,
            targetId: args.targetId,
            createdAt: NOW(),
        });
        await adjustLikeCount(ctx, args.targetType, args.targetId, +1);

        // Throttled push notification (post likes only) to author.
        if (args.targetType === 'post') {
            try {
                const post = await ctx.db.get(args.targetId as any);
                if (post && (post as any).authorUserId !== actor.idString) {
                    await recordActivity(ctx, {
                        userId: (post as any).authorUserId,
                        type: 'like',
                        actorUserId: actor.idString,
                        targetType: 'post',
                        targetId: args.targetId,
                    });

                    // Gamificación: al cruzar 10 likes el post premia a su
                    // autor. `eventKey` con el propio postId lo hace 1 sola
                    // vez, más allá de que después sume 11, 12...
                    if (((post as any).likeCount ?? 0) + 1 === 10) {
                        await awardSocialAction(ctx, (post as any).authorUserId, 'sp_post_milestone_10', args.targetId);
                    }

                    const recentPushes = await ctx.db
                        .query('pushDeliveries')
                        .withIndex('by_user_category', (q) =>
                            q.eq('userId', (post as any).authorUserId).eq('category', 'social'),
                        )
                        .filter((q) =>
                            q.gt(
                                q.field('sentAt'),
                                new Date(Date.now() - LIKE_PUSH_THROTTLE_MS).toISOString(),
                            ),
                        )
                        .collect();
                    const alreadyPushed = recentPushes.some(
                        (r: any) => r.data?.targetId === args.targetId && r.data?.type === 'like',
                    );
                    if (!alreadyPushed) {
                        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: (post as any).authorUserId,
                            title: 'A alguien le gustó tu post',
                            body: 'Mirá quién interactuó con tu publicación.',
                            category: 'social',
                            data: { type: 'like', targetType: 'post', targetId: args.targetId },
                        });
                    }
                }
            } catch (e) {
                console.warn('[social.like] push lookup failed', e);
            }
        }

        return { liked: true };
    },
});

const adjustLikeCount = async (
    ctx: any,
    targetType: string,
    targetId: string,
    delta: number,
) => {
    if (targetType === 'post') {
        try {
            const post = await ctx.db.get(targetId as any);
            if (post) {
                await ctx.db.patch(post._id, {
                    likeCount: Math.max(0, (post as any).likeCount + delta),
                });
            }
        } catch (e) { /* swallow */ }
    } else if (targetType === 'comment') {
        try {
            const comment = await ctx.db.get(targetId as any);
            if (comment) {
                await ctx.db.patch(comment._id, {
                    likeCount: Math.max(0, (comment as any).likeCount + delta),
                });
            }
        } catch (e) { /* swallow */ }
    }
    // Stories don't keep a denormalized like counter.
};

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------

export const follow = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        targetUserId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken, { write: 'follow' });
        if (actor.idString === args.targetUserId) {
            throw new Error('No podés seguirte a vos mismo.');
        }

        const existing = await ctx.db
            .query('socialFollows')
            .withIndex('by_pair', (q) =>
                q.eq('followerUserId', actor.idString).eq('followeeUserId', args.targetUserId),
            )
            .first();
        if (existing) return { followed: true };

        // Ensure both sides have socialUsers so commercial profiles accumulate followers.
        const [followerProfile, followeeProfile] = await Promise.all([
            ensureSocialUser(ctx, actor.idString),
            ensureSocialUser(ctx, args.targetUserId),
        ]);

        await ctx.db.insert('socialFollows', {
            followerUserId: actor.idString,
            followeeUserId: args.targetUserId,
            createdAt: NOW(),
        });

        await ctx.db.patch(followerProfile._id, {
            followingCount: (followerProfile.followingCount ?? 0) + 1,
            updatedAt: NOW(),
        });
        await ctx.db.patch(followeeProfile._id, {
            followerCount: (followeeProfile.followerCount ?? 0) + 1,
            updatedAt: NOW(),
        });

        await recordActivity(ctx, {
            userId: args.targetUserId,
            type: 'follow',
            actorUserId: actor.idString,
            targetType: 'user',
            targetId: args.targetUserId,
        });

        // Push to followed user.
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: args.targetUserId,
            title: 'Tenés un nuevo seguidor',
            body: `${followerProfile?.displayName ?? 'Alguien'} empezó a seguirte.`,
            category: 'social',
            data: { type: 'follow', followerUserId: actor.idString },
        });
        return { followed: true };
    },
});

export const unfollow = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        targetUserId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const existing = await ctx.db
            .query('socialFollows')
            .withIndex('by_pair', (q) =>
                q.eq('followerUserId', actor.idString).eq('followeeUserId', args.targetUserId),
            )
            .first();
        if (!existing) return { followed: false };

        await ctx.db.delete(existing._id);

        const [followerProfile, followeeProfile] = await Promise.all([
            ensureSocialUser(ctx, actor.idString),
            ensureSocialUser(ctx, args.targetUserId),
        ]);

        await ctx.db.patch(followerProfile._id, {
            followingCount: Math.max(0, (followerProfile.followingCount ?? 0) - 1),
            updatedAt: NOW(),
        });
        await ctx.db.patch(followeeProfile._id, {
            followerCount: Math.max(0, (followeeProfile.followerCount ?? 0) - 1),
            updatedAt: NOW(),
        });
        return { followed: false };
    },
});

/**
 * Shared body for the two follow-list queries. Returns hydrated social
 * profiles rather than raw edges so the client renders a list from one
 * round-trip, and paginates so a popular account cannot blow the read limit.
 */
const followList = async (
    ctx: any,
    opts: {
        sessionToken?: string;
        userId: string;
        direction: 'followers' | 'following';
        cursor?: string;
        limit?: number;
    },
) => {
    try {
        await assertSocialActor(ctx, opts.sessionToken);
    } catch {
        return { items: [], nextCursor: null };
    }
    const cap = Math.min(opts.limit ?? 30, 100);

    const page = await paginateQuery<any>(
        opts.direction === 'followers'
            ? ctx.db
                .query('socialFollows')
                .withIndex('by_followee', (q: any) => q.eq('followeeUserId', opts.userId))
                .order('desc')
            : ctx.db
                .query('socialFollows')
                .withIndex('by_follower', (q: any) => q.eq('followerUserId', opts.userId))
                .order('desc'),
        opts.cursor,
        cap,
    );

    const otherIds = page.items.map((row: any) =>
        opts.direction === 'followers' ? row.followerUserId : row.followeeUserId,
    );
    const profiles = await Promise.all(
        otherIds.map((id: string) =>
            ctx.db
                .query('socialUsers')
                .withIndex('by_user', (q: any) => q.eq('userId', id))
                .first(),
        ),
    );

    return {
        items: profiles.map((p: any, i: number) => ({
            userId: otherIds[i],
            username: p?.username ?? 'usuario',
            displayName: p?.displayName ?? 'Usuario',
            avatar: p?.avatar,
            verified: p?.verified ?? false,
            isInfluencer: p?.isInfluencer ?? false,
        })),
        nextCursor: page.nextCursor,
    };
};

export const getFollowers = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.string(),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) =>
        followList(ctx, {
            sessionToken: (args as any).sessionToken,
            userId: args.userId,
            direction: 'followers',
            cursor: args.cursor,
            limit: args.limit,
        }),
});

export const getFollowing = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.string(),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) =>
        followList(ctx, {
            sessionToken: (args as any).sessionToken,
            userId: args.userId,
            direction: 'following',
            cursor: args.cursor,
            limit: args.limit,
        }),
});

export const isFollowing = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        followerUserId: v.string(),
        followeeUserId: v.string(),
    },
    handler: async (ctx, args) => {
        await assertSocialActor(ctx, (args as any).sessionToken);
        const row = await ctx.db
            .query('socialFollows')
            .withIndex('by_pair', (q) =>
                q.eq('followerUserId', args.followerUserId).eq('followeeUserId', args.followeeUserId),
            )
            .first();
        return Boolean(row);
    },
});

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const createStory = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        type: v.union(v.literal('image'), v.literal('video')),
        url: v.string(),
        durationSec: v.optional(v.number()),
        /** 'close_friends' (Fase 7) la esconde de todos salvo `socialCloseFriends`. */
        audience: v.optional(v.union(v.literal('everyone'), v.literal('close_friends'))),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken, { write: 'createStory' });
        const now = NOW();
        const expiresAt = new Date(Date.now() + STORY_TTL_MS).toISOString();
        const storyId = await ctx.db.insert('socialStories', {
            authorUserId: actor.idString,
            type: args.type,
            url: args.url,
            durationSec: args.durationSec ?? 5,
            viewCount: 0,
            expiresAt,
            audience: args.audience,
            createdAt: now,
        });
        await awardSocialAction(ctx, actor.idString, 'sp_story', String(storyId));
        return storyId;
    },
});

export const deleteStory = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        storyId: v.id('socialStories'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const story = await ctx.db.get(args.storyId);
        if (!story) throw new Error('Historia no encontrada');
        if (story.authorUserId !== actor.idString) throw new Error('No autorizado');
        await ctx.db.patch(args.storyId, { deletedAt: NOW() });
    }
});

export const viewStory = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        storyId: v.id('socialStories'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const existing = await ctx.db
            .query('socialStoryViews')
            .withIndex('by_story_viewer', (q) =>
                q.eq('storyId', String(args.storyId)).eq('viewerUserId', actor.idString),
            )
            .first();
        if (existing) return; // idempotent

        await ctx.db.insert('socialStoryViews', {
            storyId: String(args.storyId),
            viewerUserId: actor.idString,
            viewedAt: NOW(),
        });
        const story = await ctx.db.get(args.storyId);
        if (story) {
            await ctx.db.patch(args.storyId, { viewCount: story.viewCount + 1 });
        }
    },
});

export const getStoriesForFollowing = query({
    args: {
        sessionToken: v.optional(v.string()), actorId: v.optional(v.any()) },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }

        const follows = await ctx.db
            .query('socialFollows')
            .withIndex('by_follower', (q) => q.eq('followerUserId', actor.idString))
            .collect();
        const followIds = follows.map((f: any) => f.followeeUserId);
        // Include the current user's own stories at the top.
        const targetIds = [actor.idString, ...followIds];
        const now = NOW();

        const groups: Array<{ author: any; stories: any[] }> = [];
        for (const userId of targetIds) {
            const stories = await ctx.db
                .query('socialStories')
                .withIndex('by_author', (q) => q.eq('authorUserId', userId))
                .collect();
            // Close friends: si esta historia es 'close_friends' y el viewer
            // no es ni el propio autor ni alguien que el autor agregó a su
            // lista, no la ve — ni sabe que existe.
            const isCloseFriendOfAuthor =
                userId === actor.idString
                    ? true
                    : Boolean(
                          await ctx.db
                              .query('socialCloseFriends')
                              .withIndex('by_owner_friend', (q: any) =>
                                  q.eq('ownerUserId', userId).eq('friendUserId', actor.idString),
                              )
                              .first(),
                      );
            const active = stories
                .filter((s: any) => !s.deletedAt && s.expiresAt > now)
                .filter((s: any) => s.audience !== 'close_friends' || isCloseFriendOfAuthor)
                .sort((a: any, b: any) => a.createdAt.localeCompare(b.createdAt));
            if (active.length === 0) continue;
            let author: any = await ctx.db
                .query('socialUsers')
                .withIndex('by_user', (q) => q.eq('userId', userId))
                .first();
            // ponytail: Fallback to main users table if socialUsers doesn't exist yet
            if (!author) {
                const mainUser: any = await ctx.db.get(userId as any);
                if (mainUser) {
                    author = {
                        userId: String(mainUser._id),
                        displayName: mainUser.name || mainUser.username || 'Usuario',
                        username: mainUser.username || mainUser.email?.split('@')[0] || 'usuario',
                        avatar: mainUser.avatar,
                    };
                    if (author.avatar && author.avatar.startsWith('convex-storage:')) {
                        const resolved = await ctx.storage.getUrl(author.avatar.replace('convex-storage:', ''));
                        if (resolved) author.avatar = resolved;
                    }
                }
            }
            const resolvedActive = await Promise.all(active.map(async (s: any) => {
                const raw = s.url || s.imageUrl;
                if (raw && raw.startsWith('convex-storage:')) {
                    const resolved = await ctx.storage.getUrl(raw.replace('convex-storage:', ''));
                    if (resolved) return { ...s, url: resolved, imageUrl: resolved };
                }
                return { ...s, imageUrl: s.url };
            }));
            groups.push({ author: author || { userId, displayName: 'Usuario', username: 'user' }, stories: resolvedActive });
        }
        return groups;
    },
});

export const addCloseFriend = mutation({
    args: { sessionToken: v.optional(v.string()), friendUserId: v.string() },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        if (actor.idString === args.friendUserId) return { success: false };
        const existing = await ctx.db
            .query('socialCloseFriends')
            .withIndex('by_owner_friend', (q: any) => q.eq('ownerUserId', actor.idString).eq('friendUserId', args.friendUserId))
            .first();
        if (existing) return { success: true };
        await ctx.db.insert('socialCloseFriends', {
            ownerUserId: actor.idString,
            friendUserId: args.friendUserId,
            createdAt: NOW(),
        });
        return { success: true };
    },
});

export const removeCloseFriend = mutation({
    args: { sessionToken: v.optional(v.string()), friendUserId: v.string() },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const existing = await ctx.db
            .query('socialCloseFriends')
            .withIndex('by_owner_friend', (q: any) => q.eq('ownerUserId', actor.idString).eq('friendUserId', args.friendUserId))
            .first();
        if (existing) await ctx.db.delete(existing._id);
        return { success: true };
    },
});

export const listCloseFriends = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, (args as any).sessionToken);
        if (!actor) return [];
        const rows = await ctx.db
            .query('socialCloseFriends')
            .withIndex('by_owner', (q: any) => q.eq('ownerUserId', actor.idString))
            .collect();
        const profiles = await Promise.all(
            rows.map((r: any) => ctx.db.query('socialUsers').withIndex('by_user', (q: any) => q.eq('userId', r.friendUserId)).first()),
        );
        return rows.map((r: any, i: number) => ({ friendUserId: r.friendUserId, profile: profiles[i] ?? null }));
    },
});

export const getStoryViewers = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        storyId: v.id('socialStories'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const story = await ctx.db.get(args.storyId);
        if (!story) return [];
        if (story.authorUserId !== actor.idString) {
            throw new Error('Solo el autor puede ver la lista de visualizaciones.');
        }
        return await ctx.db
            .query('socialStoryViews')
            .withIndex('by_story', (q) => q.eq('storyId', String(args.storyId)))
            .collect();
    },
});

// Cron-driven soft-delete of expired stories.
export const internalExpireStories = internalMutation({
    args: {},
    handler: async (ctx, args) => {
        const now = NOW();
        const expired = await ctx.db
            .query('socialStories')
            .withIndex('by_expires', (q) => q.lt('expiresAt', now))
            .collect();
        let count = 0;
        for (const story of expired) {
            if (story.deletedAt) continue;
            await ctx.db.patch(story._id, { deletedAt: now });
            count++;
        }
        return { expired: count };
    },
});



// ---------------------------------------------------------------------------
// DM — shims de compatibilidad.
//
// La mensajería vive ahora en `convex/social/dm.ts` sobre el modelo de
// `socialChatMembers`. Estas seis funciones quedan como adaptadores finos
// porque el bundle web desplegado todavía las llama: borrarlas rompería
// producción hasta el próximo deploy del frontend (exactamente el desfasaje
// de contrato que ya nos costó una caída). Se eliminan cuando el frontend
// nuevo esté publicado.
// ---------------------------------------------------------------------------

export const createChat = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        participantId: v.string(),
    },
    handler: async (ctx, args): Promise<string> =>
        await ctx.runMutation(api.social.dm.getOrCreateDirectChat, {
            sessionToken: args.sessionToken,
            participantId: args.participantId,
        }),
});

export const sendDirectMessage = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        chatId: v.id('socialChats'),
        body: v.string(),
        attachments: v.optional(v.array(v.object({
            type: v.union(
                v.literal('image'),
                v.literal('video'),
                v.literal('document'),
                v.literal('post'),
                v.literal('listing'),
            ),
            url: v.string(),
            metadata: v.optional(v.any()),
        }))),
    },
    handler: async (ctx, args): Promise<string> =>
        await ctx.runMutation(api.social.dm.sendMessage, {
            sessionToken: args.sessionToken,
            chatId: args.chatId,
            body: args.body,
            attachments: args.attachments,
        }),
});

export const markChatAsRead = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        chatId: v.id('socialChats'),
    },
    handler: async (ctx, args): Promise<null> => {
        await ctx.runMutation(api.social.dm.markChatRead, {
            sessionToken: args.sessionToken,
            chatId: args.chatId,
        });
        return null;
    },
});

/** Forma vieja: array plano con `otherParticipants` y `unreadCount`. */
export const getMyChats = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
    },
    handler: async (ctx, args): Promise<any[]> => {
        const page: any = await ctx.runQuery(api.social.dm.listChats, {
            sessionToken: args.sessionToken,
            folder: 'inbox',
            limit: 50,
        });
        return page.items.map((chat: any) => ({
            _id: chat.chatId,
            participantIds: [],
            lastMessagePreview: chat.lastMessagePreview ?? undefined,
            lastMessageAt: chat.lastMessageAt,
            otherParticipants: chat.participants.map((p: any) => ({
                userId: p.userId,
                username: p.username,
                displayName: p.displayName,
                avatar: p.avatar,
                verified: p.verified,
            })),
            unreadCount: chat.unreadCount,
        }));
    },
});

export const getChatMessages = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        chatId: v.id('socialChats'),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<any> => {
        const page: any = await ctx.runQuery(api.social.dm.getChatMessages, {
            sessionToken: args.sessionToken,
            chatId: args.chatId,
            cursor: args.cursor,
            limit: args.limit,
        });
        return {
            items: page.items.map((m: any) => ({
                _id: m._id,
                senderUserId: m.senderUserId,
                body: m.body,
                attachments: m.attachments,
                createdAt: m.createdAt,
            })),
            nextCursor: page.nextCursor,
        };
    },
});

// ---------------------------------------------------------------------------
// Internal — used by future moderation / analytics / push fan-out.
// ---------------------------------------------------------------------------

export const internalGetMutualFollowers = internalQuery({
    args: { userIdA: v.string(), userIdB: v.string() },
    handler: async (ctx, args): Promise<string[]> => {
        const followsByA = await ctx.db
            .query('socialFollows')
            .withIndex('by_follower', (q) => q.eq('followerUserId', args.userIdA))
            .collect();
        const aFollows = new Set(followsByA.map((f: any) => f.followeeUserId));
        const followsByB = await ctx.db
            .query('socialFollows')
            .withIndex('by_follower', (q) => q.eq('followerUserId', args.userIdB))
            .collect();
        return followsByB.map((f: any) => f.followeeUserId).filter((id: string) => aFollows.has(id));
    },
});

// ---------------------------------------------------------------------------
// Saved Posts, Retweets, Highlights
// ---------------------------------------------------------------------------

export const toggleSavePost = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postId: v.id('socialPosts'),
        collectionId: v.optional(v.id('socialSavedCollections')),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const existing = await ctx.db
            .query('socialSavedPosts')
            .withIndex('by_user_post', (q) =>
                q.eq('userId', actor.idString).eq('postId', String(args.postId))
            )
            .first();

        if (existing) {
            await ctx.db.delete(existing._id);
            return { saved: false };
        }

        await ctx.db.insert('socialSavedPosts', {
            userId: actor.idString,
            postId: String(args.postId),
            collectionId: args.collectionId ? String(args.collectionId) : undefined,
            createdAt: NOW(),
        });
        return { saved: true };
    },
});

/** Mueve un guardado ya existente a otra colección (o lo saca de todas con `collectionId: undefined`). */
export const movePostToCollection = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        postId: v.id('socialPosts'),
        collectionId: v.optional(v.id('socialSavedCollections')),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const existing = await ctx.db
            .query('socialSavedPosts')
            .withIndex('by_user_post', (q) => q.eq('userId', actor.idString).eq('postId', String(args.postId)))
            .first();
        if (!existing) return { success: false };
        await ctx.db.patch(existing._id, {
            collectionId: args.collectionId ? String(args.collectionId) : undefined,
        });
        return { success: true };
    },
});

export const createSavedCollection = mutation({
    args: { sessionToken: v.optional(v.string()), name: v.string(), coverImage: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const name = args.name.trim().slice(0, 60);
        if (name.length < 1) throw new ConvexError({ code: 'FORBIDDEN', message: 'Ponele un nombre a la colección.' });
        return await ctx.db.insert('socialSavedCollections', {
            userId: actor.idString,
            name,
            coverImage: args.coverImage,
            createdAt: NOW(),
        });
    },
});

export const listMySavedCollections = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, (args as any).sessionToken);
        if (!actor) return [];
        return await ctx.db
            .query('socialSavedCollections')
            .withIndex('by_user', (q: any) => q.eq('userId', actor.idString))
            .order('desc')
            .collect();
    },
});

export const deleteSavedCollection = mutation({
    args: { sessionToken: v.optional(v.string()), collectionId: v.id('socialSavedCollections') },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const collection = await ctx.db.get(args.collectionId);
        if (!collection || collection.userId !== actor.idString) return { success: false };
        await ctx.db.delete(args.collectionId);
        // Los guardados de esta colección no se borran: vuelven a "sueltos".
        const members = await ctx.db
            .query('socialSavedPosts')
            .withIndex('by_collection', (q: any) => q.eq('collectionId', String(args.collectionId)))
            .collect();
        await Promise.all(members.map((m: any) => ctx.db.patch(m._id, { collectionId: undefined })));
        return { success: true };
    },
});

export const getSavedPosts = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
        /** `null` explícito = sólo guardados sueltos (sin colección). Ausente = todos. */
        collectionId: v.optional(v.union(v.id('socialSavedCollections'), v.null())),
    },
    handler: async (ctx, args) => {
        // Query: degrada. La consume `SavedPostsScreen`, que se monta antes de
        // saber si el token sigue vivo.
        const actor = await socialViewer(ctx, (args as any).sessionToken);
        if (!actor) return { items: [], nextCursor: null };
        const cap = Math.min(args.limit ?? 20, 50);

        // Con una colección puntual se usa `by_collection` directo — evita el
        // bug de paginación de filtrar DESPUÉS de `.paginate()` (cortar la
        // página antes de tiempo si el filtro descarta filas). "Todos" o
        // "sueltos" siguen sobre `by_user`, porque no hay un índice para
        // "de este user, sin colección" y el volumen esperado es chico.
        let result;
        let filteredPage: any[];
        if (args.collectionId) {
            result = await ctx.db
                .query('socialSavedPosts')
                .withIndex('by_collection', (q: any) => q.eq('collectionId', String(args.collectionId)))
                .order('desc')
                .paginate({ cursor: args.cursor ?? null, numItems: cap });
            filteredPage = result.page.filter((r: any) => r.userId === actor.idString);
        } else {
            result = await ctx.db
                .query('socialSavedPosts')
                .withIndex('by_user', (q) => q.eq('userId', actor.idString))
                .order('desc')
                .paginate({ cursor: args.cursor ?? null, numItems: cap });
            filteredPage =
                args.collectionId === null ? result.page.filter((r: any) => !r.collectionId) : result.page;
        }

        // Hydrate posts
        const postIds = filteredPage.map((r: any) => r.postId);
        const posts = await Promise.all(postIds.map((id: any) => ctx.db.get(id)));
        const visiblePosts = posts.filter((p: any) => p && !p.deletedAt);
        
        // Hydrate authors
        const authorIds = Array.from(new Set(visiblePosts.map((p: any) => p.authorUserId)));
        const authorProfiles = await Promise.all(
            authorIds.map((id: any) => ctx.db.query('socialUsers').withIndex('by_user', (q: any) => q.eq('userId', id)).first())
        );
        const authorMap = new Map();
        authorProfiles.forEach((p, i) => { if (p) authorMap.set(authorIds[i], p); });

        return {
            items: visiblePosts.map((post: any) => ({
                ...post,
                author: authorMap.get(post.authorUserId) ?? null,
            })),
            nextCursor: result.isDone ? null : result.continueCursor,
        };
    },
});

export const toggleRetweet = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postId: v.id('socialPosts'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const post = await ctx.db.get(args.postId);
        if (!post || post.deletedAt) throw new Error('Post no encontrado.');

        const existing = await ctx.db
            .query('socialRetweets')
            .withIndex('by_user_post', (q) =>
                q.eq('userId', actor.idString).eq('postId', String(args.postId))
            )
            .first();

        if (existing) {
            await ctx.db.delete(existing._id);
            await ctx.db.patch(args.postId, { retweetCount: Math.max(0, post.retweetCount - 1) });
            return { retweeted: false };
        }

        await ctx.db.insert('socialRetweets', {
            userId: actor.idString,
            postId: String(args.postId),
            createdAt: NOW(),
        });
        await ctx.db.patch(args.postId, { retweetCount: post.retweetCount + 1 });
        if (post.authorUserId !== actor.idString) {
            await recordActivity(ctx, {
                userId: post.authorUserId,
                type: 'repost',
                actorUserId: actor.idString,
                targetType: 'post',
                targetId: String(args.postId),
            });
        }
        return { retweeted: true };
    },
});

export const getRetweetsByUser = query({
    args: {
        sessionToken: v.optional(v.string()), actorId: v.optional(v.any()), userId: v.string(), cursor: v.optional(v.string()), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        await assertSocialActor(ctx, (args as any).sessionToken);
        const cap = Math.min(args.limit ?? 20, 50);
        const result = await ctx.db
            .query('socialRetweets')
            .withIndex('by_user_post', (q) => q.eq('userId', args.userId))
            .paginate({ cursor: args.cursor ?? null, numItems: cap });
            
        // Hydrate posts
        const postIds = result.page.map((r: any) => r.postId);
        const posts = await Promise.all(postIds.map((id: any) => ctx.db.get(id)));
        const visiblePosts = posts.filter((p: any) => p && !p.deletedAt);
        
        return {
            items: visiblePosts,
            nextCursor: result.isDone ? null : result.continueCursor,
        };
    },
});

export const addHighlight = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        title: v.string(),
        coverImage: v.string(),
        storyIds: v.array(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        return await ctx.db.insert('socialHighlights', {
            userId: actor.idString,
            title: args.title,
            coverImage: args.coverImage,
            storyIds: args.storyIds,
            createdAt: NOW(),
        });
    },
});

export const getHighlights = query({
    args: {
        sessionToken: v.optional(v.string()), actorId: v.optional(v.any()), userId: v.string() },
    handler: async (ctx, args) => {
        await assertSocialActor(ctx, (args as any).sessionToken);
        return await ctx.db
            .query('socialHighlights')
            .withIndex('by_user', (q) => q.eq('userId', args.userId))
            .collect();
    },
});

// ---------------------------------------------------------------------------
// Social Commerce & Gamification (Sprint 3)
// ---------------------------------------------------------------------------

/**
 * DESCARTADO (integración social-commerce).
 *
 * La red social ya no cobra: el CommerceTag de un post agrega el producto real
 * al carrito del marketplace vía `api.commerce.addPostProductToCart` y la
 * compra sigue por el checkout normal (stock, envío, escrow, disputas).
 *
 * Esta mutación movía plata parcheando `users.balance` a mano: sin Stripe, sin
 * orden, sin escrow, sin webhook, y leyendo el campo de puntos equivocado
 * (`pointsState.pointsBalance` en vez del canónico `rewardsState.points`).
 * Se deja lanzando error para que ningún call site viejo cobre en silencio.
 * Se elimina junto con el resto del código muerto en Fase 8d.
 */
export const simulateSocialCommercePayment = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        postId: v.id("socialPosts"),
        pointsToRedeem: v.optional(v.number()),
    },
    handler: async (): Promise<never> => {
        throw new Error(
            "simulateSocialCommercePayment fue reemplazado por api.commerce.addPostProductToCart (el feed agrega al carrito; el pago va por el checkout).",
        );
    },
});

export const followUser = follow;
export const sendMessage = sendDirectMessage;
