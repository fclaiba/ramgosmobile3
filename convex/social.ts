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
import {
    scorePost,
    scoreLoop,
    applyDiversityCap,
    applyAuthorDiversityCap,
    decayedAffinity,
    AFFINITY_CAP,
    AUTHOR_AFFINITY_HALFLIFE_HOURS,
    TAG_AFFINITY_HALFLIFE_HOURS,
    EXPLORATION_SLOT_FRACTION,
    LOOPS_DIVERSITY_PER_KEY,
} from './social/scoring';
import { buildEventKey, revokePoints } from './economy/pointsEngine';
import { assertCanPromoteListing } from './promotionEligibility';

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
        if (!profile) return null;

        // Devolver el documento crudo dejaba el avatar del perfil social sin
        // resolver (`convex-storage:<id>`), o sea roto en toda la pantalla.
        return { ...profile, avatar: await resolveMediaUrl(ctx, profile.avatar) };
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
    // ── Sonidos reutilizables ────────────────────────────────────────────
    // Mutuamente excluyentes — el mux ya pasó client-side (ffmpeg-expo)
    // antes de llamar a esta mutation, acá sólo se registra el resultado:
    //  - `audioTrackId`: el video reusa un sonido existente ("Usar este
    //    sonido"). Bumpea `usageCount` del track, no crea uno nuevo.
    //  - `originalAudioStorageId`: video ORIGINAL — el cliente extrajo su
    //    audio-solo y lo subió aparte. Se crea el `audioTracks` nuevo acá.
    audioTrackId: v.optional(v.id('audioTracks')),
    originalAudioStorageId: v.optional(v.id('_storage')),
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
    audioTrackId?: any;
    originalAudioStorageId?: any;
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

        // El listing etiquetado puede llegar por `attachedListingId` o dentro de
        // `commercialProduct.listingId`. Los DOS caminos tienen que validarse:
        // chequear sólo el primero dejaba que un cliente modificado etiquetara
        // cualquier producto mandando el segundo.
        const taggedListingId =
            args.attachedListingId ??
            (args.commercialProduct?.listingId
                ? ctx.db.normalizeId('listings', args.commercialProduct.listingId)
                : null);

        if (taggedListingId) {
            const listing = await ctx.db.get(taggedListingId);
            if (listing) {
                // Un consumidor sólo etiqueta lo suyo; un influencer, además, lo
                // de los negocios que lo autorizaron. Se valida acá y no sólo en
                // el composer porque el cliente no es confiable.
                await assertCanPromoteListing(ctx, actor, listing);

                // El snapshot se arma desde la base, nunca desde lo que mandó el
                // cliente: si no, el precio y el nombre del producto etiquetado
                // los elegiría quien publica.
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
            } else {
                // Referencia colgante: se descarta en vez de publicar una tarjeta
                // de producto que no existe.
                finalCommercialProduct = undefined;
            }
        }

        // Stamp the author's country so the feed can rank commercial posts
        // locally without re-reading the profile for every candidate.
        const authorProfile = await ctx.db
            .query('socialUsers')
            .withIndex('by_user', (q: any) => q.eq('userId', actor.idString))
            .first();

        // Sonidos reutilizables: si reusa uno existente, validar que exista
        // ANTES de insertar el post — mejor un error claro acá que un post
        // publicado con una referencia colgante.
        let reusedTrack: any = null;
        if (args.audioTrackId && !args.originalAudioStorageId) {
            reusedTrack = await ctx.db.get(args.audioTrackId);
            if (!reusedTrack) {
                throw new ConvexError({ code: 'NOT_FOUND', message: 'El sonido elegido ya no existe.' });
            }
        }

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
            audioTrackId: reusedTrack ? reusedTrack._id : undefined,
            parentPostId,
            rootPostId,
            replyCount: 0,
            quotedPostId: args.quotedPostId ? String(args.quotedPostId) : undefined,
            communityId: args.communityId ? String(args.communityId) : undefined,
            createdAt: now,
        });

        // Sonidos reutilizables: caso "original" (no reusó nada) — crea el
        // track recién ahora que existe `postId` (necesario para
        // `originalPostId`, que es sólo atribución, no cascadea).
        if (args.originalAudioStorageId) {
            const trackId = await ctx.db.insert('audioTracks', {
                name: args.content.trim().slice(0, 60) || 'Sonido original',
                authorId: actor.idString,
                originalPostId: postId,
                storageId: args.originalAudioStorageId,
                usageCount: 1,
            });
            await ctx.db.patch(postId, { audioTrackId: trackId });
        } else if (reusedTrack) {
            await ctx.db.patch(reusedTrack._id, { usageCount: reusedTrack.usageCount + 1 });
        }

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

        // Link preview (Fase 5 del gap analysis, 0% antes de esto): si el
        // texto trae un link, precachear su OG en background. Best-effort —
        // el post se guarda y se ve igual si esto falla o todavía no
        // terminó cuando se renderiza.
        const firstUrl = args.content.match(/https?:\/\/[^\s]+/)?.[0];
        if (firstUrl) {
            await ctx.scheduler.runAfter(0, internal.social.linkPreview.internalFetchLinkPreview, {
                url: firstUrl,
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
        // B4 (moderación de mods): un owner/admin de la comunidad puede
        // borrar cualquier post SCOPEADO A ESA comunidad — no le da poder
        // sobre nada fuera de ella.
        let isCommunityMod = false;
        if (!isAuthor && !isAdmin && post.communityId) {
            const membership = await ctx.db
                .query('communityMembers')
                .withIndex('by_community_user', (q: any) =>
                    q.eq('communityId', post.communityId).eq('userId', actor.idString),
                )
                .first();
            isCommunityMod = Boolean(
                membership && membership.status === 'active' && (membership.role === 'owner' || membership.role === 'admin'),
            );
        }
        if (!isAuthor && !isAdmin && !isCommunityMod) throw new Error('No autorizado.');
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

        // Si lo que se borra es un espejo de repost, hay que revertir la fila
        // de join y el contador del original: si no, el usuario queda con el
        // botón de repost "activo" sobre un espejo que ya no existe y sin
        // forma de des-repostear.
        //
        // El caso inverso (borran el ORIGINAL y quedan espejos huérfanos) NO
        // se cascadea a propósito: serían writes no acotados dentro de una
        // mutation. `decoratePosts` ya los descarta al no poder hidratar el
        // citado, así que no se ven en ningún lado.
        if (isPureRepost(post)) {
            const row = await ctx.db
                .query('socialRetweets')
                .withIndex('by_user_post', (q: any) =>
                    q.eq('userId', post.authorUserId).eq('postId', post.quotedPostId!),
                )
                .first();
            if (row) await ctx.db.delete(row._id);
            const originalId = ctx.db.normalizeId('socialPosts', post.quotedPostId!);
            const original = originalId ? await ctx.db.get(originalId) : null;
            if (original) {
                await ctx.db.patch(original._id, {
                    retweetCount: Math.max(0, (original as any).retweetCount - 1),
                });
            }
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

/**
 * `true` si el post es un REPOST PURO: un espejo sin contenido propio, cuyo
 * único fin es traer el post citado al feed de los seguidores del que
 * reposteó (el modelo del RT de Twitter).
 *
 * Una CITA también tiene `quotedPostId`, pero además tiene texto propio, así
 * que es un post de pleno derecho y no entra acá.
 */
export const isPureRepost = (post: any): boolean =>
    Boolean(post?.quotedPostId) && !String(post?.content ?? '').trim();

/**
 * Cambia cada espejo de repost por el post ORIGINAL, y devuelve aparte quién
 * lo reposteó (mapa `originalId -> reposterUserId`).
 *
 * Corre ANTES de `decoratePosts` por dos motivos, y el segundo es el
 * importante:
 *  1. El original llega decorado ENTERO (like, guardado, encuesta, comercio,
 *     sonido), no con el shape reducido que `quotedPost` usa para las citas.
 *  2. El `_id` de la tarjeta pasa a ser el del original, así que dar like,
 *     comentar o guardar desde un repost impacta el post original. Si la
 *     tarjeta conservara el id del espejo, los likes quedarían repartidos
 *     entre el original y cada espejo, con los contadores partidos.
 */
export const substituteReposts = async (
    ctx: any,
    posts: any[],
): Promise<{ posts: any[]; attribution: Map<string, string> }> => {
    const mirrors = posts.filter(isPureRepost);
    const attribution = new Map<string, string>();
    if (mirrors.length === 0) return { posts, attribution };

    const originals = await Promise.all(
        mirrors.map((m) => {
            const id = ctx.db.normalizeId('socialPosts', m.quotedPostId);
            return id ? ctx.db.get(id) : null;
        }),
    );
    const byMirrorId = new Map<string, any>();
    mirrors.forEach((m, i) => byMirrorId.set(String(m._id), originals[i]));

    const out: any[] = [];
    for (const p of posts) {
        if (!isPureRepost(p)) {
            out.push(p);
            continue;
        }
        const original = byMirrorId.get(String(p._id));
        // Original borrado ⇒ el repost no tiene nada que mostrar.
        if (!original || original.deletedAt) continue;
        attribution.set(String(original._id), p.authorUserId);
        out.push(original);
    }
    return { posts: out, attribution };
};

/** Pega `repostedBy` (perfil del que reposteó) a los items ya decorados. */
export const attachRepostAttribution = async (
    ctx: any,
    items: any[],
    attribution: Map<string, string>,
) => {
    if (attribution.size === 0) return items;
    const reposterIds = Array.from(new Set(attribution.values()));
    const profiles = await Promise.all(
        reposterIds.map((id) =>
            ctx.db
                .query('socialUsers')
                .withIndex('by_user', (q: any) => q.eq('userId', id))
                .first(),
        ),
    );
    const profileMap = new Map<string, any>();
    profiles.forEach((p: any, i) => {
        if (p) profileMap.set(reposterIds[i], p);
    });

    return items.map((item: any) => {
        const reposterId = attribution.get(String(item._id));
        if (!reposterId) return item;
        const prof = profileMap.get(reposterId);
        return {
            ...item,
            repostedBy: {
                userId: reposterId,
                name: prof?.displayName ?? prof?.username ?? 'Alguien',
                username: prof?.username ?? null,
            },
        };
    });
};

/**
 * Mapa userId → perfil social con el avatar YA resuelto.
 *
 * Los avatares se guardan como `convex-storage:<id>`, una referencia interna
 * que el cliente no puede cargar. Varias queries devolvían el documento de
 * `socialUsers` tal cual y dejaban la foto rota en comentarios, seguidores y
 * actividad. `createMediaResolver` memoiza por request, así que resolver el
 * mismo avatar en veinte comentarios cuesta una sola lectura.
 */
export const buildAuthorMap = async (
    ctx: any,
    ids: string[],
    docs: any[],
): Promise<Map<string, any>> => {
    const resolve = createMediaResolver(ctx);
    const map = new Map<string, any>();
    await Promise.all(
        docs.map(async (doc, i) => {
            if (!doc) return;
            map.set(ids[i], { ...doc, avatar: await resolve(doc.avatar) });
        }),
    );
    return map;
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

    // Quote-repost: los posts citados se resuelven ANTES que los perfiles
    // para que sus autores entren en el MISMO batch de `socialUsers` de
    // abajo (si no, serían N lecturas extra y los avatares se resolverían
    // dos veces). Un solo nivel: el shape del citado no anida otro citado,
    // así que la recursión se corta estructuralmente, no con un contador.
    const quotedIds = Array.from(
        new Set(posts.map((p) => p.quotedPostId).filter(Boolean)),
    ) as string[];
    const quotedDocs = new Map<string, any>();
    if (quotedIds.length) {
        const docs = await Promise.all(
            quotedIds.map((id) => {
                const nid = ctx.db.normalizeId('socialPosts', id);
                return nid ? ctx.db.get(nid) : null;
            }),
        );
        docs.forEach((d: any, i) => {
            if (d && !d.deletedAt && d.moderationStatus !== 'removed') {
                quotedDocs.set(quotedIds[i], d);
            }
        });
    }

    const authorIds = Array.from(
        new Set([
            ...posts.map((p) => p.authorUserId),
            ...Array.from(quotedDocs.values()).map((q: any) => q.authorUserId),
        ]),
    ) as string[];
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

    // Ids sobre los que hay que saber si el viewer ya reposteó: el propio
    // post y, si es un espejo/cita, también el citado — la tarjeta de un
    // repost muestra el botón del ORIGINAL, no el del espejo.
    const retweetTargets = Array.from(
        new Set([
            ...visible.map((p) => String(p._id)),
            ...visible.map((p) => p.quotedPostId).filter(Boolean),
        ]),
    ) as string[];

    const [likeRows, saveRows, retweetRows] = await Promise.all([
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
        Promise.all(
            retweetTargets.map((id) =>
                ctx.db
                    .query('socialRetweets')
                    .withIndex('by_user_post', (q: any) =>
                        q.eq('userId', viewerId).eq('postId', id),
                    )
                    .first(),
            ),
        ),
    ]);

    const retweetedIds = new Set<string>();
    retweetRows.forEach((r: any, i) => {
        if (r) retweetedIds.add(retweetTargets[i]);
    });

    // Memoizado por request: la misma referencia de storage (un avatar
    // repetido, una imagen compartida) se resuelve una sola vez por página
    // en vez de una vez por aparición.
    const media = createMediaResolver(ctx);
    await Promise.all(
        Array.from(authorMap.entries()).map(async ([id, a]: [string, any]) => {
            authorMap.set(id, { ...a, avatar: await media(a.avatar) });
        }),
    );

    // Sonidos reutilizables: sólo el nombre + autor del track, para que la
    // píldora del feed no dependa de una query aparte por card. Batcheado
    // igual que `authorMap` — no un `ctx.db.get` por post.
    const trackIds = Array.from(
        new Set(visible.map((p) => (p as any).audioTrackId).filter(Boolean)),
    ) as any[];
    const audioTrackMap = new Map<string, { name: string; authorUsername: string | null }>();
    if (trackIds.length) {
        const tracks = await Promise.all(trackIds.map((id) => ctx.db.get(id)));
        await Promise.all(
            tracks.map(async (t: any) => {
                if (!t) return;
                const trackAuthor = authorMap.get(String(t.authorId));
                audioTrackMap.set(String(t._id), {
                    name: t.name,
                    authorUsername: trackAuthor?.username ?? null,
                });
            }),
        );
    }

    // B3 (badge de comunidad): igual patrón que `audioTrackMap` — batch, no
    // N+1. `communityId` viaja como string suelto (no `v.id`), de ahí el
    // `normalizeId`.
    const communityIds = Array.from(
        new Set(visible.map((p) => (p as any).communityId).filter(Boolean)),
    ) as string[];
    const communityNameMap = new Map<string, string>();
    if (communityIds.length) {
        const communities = await Promise.all(
            communityIds.map((id) => {
                const nid = ctx.db.normalizeId('commercialCommunities', id);
                return nid ? ctx.db.get(nid) : null;
            }),
        );
        communities.forEach((c: any, i) => {
            if (c) communityNameMap.set(communityIds[i], c.name);
        });
    }

    // Post citado, hidratado y con la media resuelta por el mismo `media()`
    // memoizado. El shape es deliberadamente PLANO y reducido: no lleva
    // `quotedPost` propio, y eso es lo que impide que una cita de una cita
    // encadene lecturas sin fin.
    const quotedMap = new Map<string, any>();
    await Promise.all(
        Array.from(quotedDocs.entries()).map(async ([id, q]: [string, any]) => {
            // Una cita no puede ser un bypass del mute/bloqueo: si el viewer
            // silenció al autor del citado o escondió ese post, no lo ve.
            const moderatedOut = isModeratedOut(
                { ...q, authorShadowbanned: shadowbannedAuthors.has(q.authorUserId) },
                viewerId,
                moderation,
            );
            if (moderatedOut) return;
            quotedMap.set(id, {
                _id: q._id,
                authorUserId: q.authorUserId,
                type: q.type,
                content: q.content,
                images: q.images
                    ? await Promise.all(q.images.map((img: string) => media(img)))
                    : q.images,
                imageAlts: q.imageAlts,
                videoUrl: await media(q.videoUrl),
                createdAt: q.createdAt,
                likeCount: q.likeCount ?? 0,
                commentCount: q.commentCount ?? 0,
                retweetCount: q.retweetCount ?? 0,
                isRetweetedByMe: retweetedIds.has(id),
                author: authorMap.get(q.authorUserId) ?? null,
            });
        }),
    );

    const decorated = await Promise.all(
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
            audioTrack: (post as any).audioTrackId
                ? (audioTrackMap.get(String((post as any).audioTrackId)) ?? null)
                : null,
            communityName: (post as any).communityId
                ? (communityNameMap.get((post as any).communityId) ?? null)
                : null,
            isLikedByMe: Boolean(likeRows[i]),
            isSavedByMe: Boolean(saveRows[i]),
            isRetweetedByMe: retweetedIds.has(String(post._id)),
            quotedPost: post.quotedPostId ? (quotedMap.get(post.quotedPostId) ?? null) : null,
            // El front no re-deriva la regla: si la calculara por su cuenta
            // podría desincronizarse de la del servidor.
            isRepost: isPureRepost(post),
        })),
    );

    // Un repost puro sin nada que mostrar (borraron el original, o el viewer
    // silenció a su autor) es una tarjeta vacía: se cae acá, no en el front.
    // Una CITA con el citado ausente sí sobrevive — tiene texto propio, y la
    // UI dibuja "publicación no disponible" en el hueco.
    return decorated.filter((p: any) => !(p.isRepost && !p.quotedPost));
};

// `scorePost`/`scoreLoop`/`applyDiversityCap` viven en `./social/scoring`
// (funciones puras, sin `ctx`, testeadas en
// `convex/__tests__/socialScoring.test.ts`) — importadas arriba.

/**
 * Bump incremental de `socialAuthorAffinity` (Fase 1.1 del plan de ranking).
 * Se llama desde el EVENTO (like, comentario, DM, watch-time≥80%), nunca se
 * recalcula en batch. No-op si viewer===author (no tiene sentido tener
 * afinidad con uno mismo).
 */
export const bumpAuthorAffinity = async (
    ctx: any,
    viewerUserId: string,
    authorUserId: string,
    weight: number,
): Promise<void> => {
    if (viewerUserId === authorUserId) return;
    const now = NOW();
    const existing = await ctx.db
        .query('socialAuthorAffinity')
        .withIndex('by_viewer_author', (q: any) =>
            q.eq('viewerUserId', viewerUserId).eq('authorUserId', authorUserId),
        )
        .first();
    if (existing) {
        const hoursSince = Math.max(0, (Date.now() - Date.parse(existing.lastEventAt)) / 3_600_000);
        await ctx.db.patch(existing._id, {
            score: decayedAffinity(existing.score, hoursSince, AUTHOR_AFFINITY_HALFLIFE_HOURS, weight),
            lastEventAt: now,
            updatedAt: now,
        });
    } else {
        await ctx.db.insert('socialAuthorAffinity', {
            viewerUserId,
            authorUserId,
            score: Math.min(AFFINITY_CAP, weight),
            lastEventAt: now,
            updatedAt: now,
        });
    }
};

/**
 * Bump incremental de `socialTagAffinity` (Fase 2.3). SOLO se llama desde
 * eventos de Loops (posts de video) — nunca desde el Feed — para mantener
 * los dos grafos de personalización genuinamente separados.
 */
export const bumpTagAffinity = async (
    ctx: any,
    viewerUserId: string,
    tag: string,
    weight: number,
): Promise<void> => {
    const now = NOW();
    const existing = await ctx.db
        .query('socialTagAffinity')
        .withIndex('by_viewer_tag', (q: any) => q.eq('viewerUserId', viewerUserId).eq('tag', tag))
        .first();
    if (existing) {
        const hoursSince = Math.max(0, (Date.now() - Date.parse(existing.lastEventAt)) / 3_600_000);
        await ctx.db.patch(existing._id, {
            score: decayedAffinity(existing.score, hoursSince, TAG_AFFINITY_HALFLIFE_HOURS, weight),
            lastEventAt: now,
            updatedAt: now,
        });
    } else {
        await ctx.db.insert('socialTagAffinity', {
            viewerUserId,
            tag,
            score: Math.min(AFFINITY_CAP, weight),
            lastEventAt: now,
            updatedAt: now,
        });
    }
};

/** Aplica `bumpTagAffinity` a los (hasta 10) tags de un post de video. */
export const bumpTagAffinityForPost = async (
    ctx: any,
    viewerUserId: string,
    post: any,
    weight: number,
): Promise<void> => {
    const tags = await ctx.db
        .query('socialPostTags')
        .withIndex('by_post', (q: any) => q.eq('postId', String(post._id)))
        .take(10);
    for (const t of tags) {
        await bumpTagAffinity(ctx, viewerUserId, t.tag, weight);
    }
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
        // DEFAULT ALGORÍTMICO — reversión deliberada de E-080 (2026-08-18,
        // ver bitácora E-085). E-080 había puesto 'recent' (cronológico
        // puro) como default porque con un catálogo chico el ranker
        // escondía posts recién subidos. La decisión de producto de esta
        // sesión es alinear el Feed con cómo funcionan X/Instagram HOY: la
        // pestaña algorítmica ("Para ti") ES el default, con una pestaña
        // cronológica explícita ("Siguiendo", `mode:'following'`) como
        // alternativa — no "cronológico con opción de rankear", al revés.
        //
        // El riesgo que motivó E-080 NO se da por resuelto acá, sólo se
        // mitiga: oversample (`FORYOU_OVERSAMPLE`) + diversity cap por autor
        // (Fase 1.6) para que un catálogo chico no vuelva a esconder un post
        // nuevo. Queda como riesgo abierto explícito — ver tabla de riesgos
        // del plan de ranking ("Cold-start injusto").
        //
        // `mode:'recent'` sigue disponible (ya no default) como fallback/
        // debug; el cliente pasa `mode` explícito en vez de depender de este
        // default, para que el switch de tabs sea trivial y la reversión
        // sea auditable por grep.
        const mode = args.mode ?? 'forYou';

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
            // Loops (Fase 2/3 del plan de ranking): scoring por tasas
            // (`scoreLoop`) + exploración/graduación por etapas, en vez del
            // orden cronológico puro que había antes. La selección de
            // candidatos sigue siendo `by_type_created`; sólo se le agrega
            // scoring in-place — una query nueva duplicaría
            // `loadViewerModerationSets`/`decoratePosts`/paginación que
            // `getFeed` ya comparte bien.
            rawTakeSize = Math.min(cap * FORYOU_OVERSAMPLE, FORYOU_POOL_CAP);
            const rawPool = await ctx.db
                .query('socialPosts')
                .withIndex('by_type_created', (q: any) => olderThan(q.eq('type', 'video')))
                .order('desc')
                .filter((q: any) => q.eq(q.field('deletedAt'), undefined))
                .take(rawTakeSize);
            rawCount = rawPool.length;
            oldestRawCreatedAt = rawPool.length ? rawPool[rawPool.length - 1].createdAt : null;
            const pool = rawPool.filter(isGlobalFeedEligible);

            // Afinidad por tag (Fase 2.3) — la "segmentación" pedida por el
            // usuario. Sólo se alimenta de eventos de Loops (nunca del
            // Feed), así que es un grafo de personalización genuinamente
            // separado del de `socialAuthorAffinity`.
            const tagAffinityRows = await ctx.db
                .query('socialTagAffinity')
                .withIndex('by_viewer', (q: any) => q.eq('viewerUserId', viewerId))
                .take(300);
            const tagAffinity = new Map<string, number>(tagAffinityRows.map((r: any) => [r.tag, r.score]));

            // Tags por post, en batch (cap chico por post: `by_post` no
            // debería tener decenas de filas por publicación real).
            const postTagsMap = new Map<string, string[]>();
            await Promise.all(
                pool.map(async (p: any) => {
                    const rows = await ctx.db
                        .query('socialPostTags')
                        .withIndex('by_post', (q: any) => q.eq('postId', String(p._id)))
                        .take(10);
                    postTagsMap.set(String(p._id), rows.map((r: any) => r.tag));
                }),
            );

            const recentViews = await ctx.db
                .query('socialPostViews')
                .withIndex('by_viewer_created', (q: any) => q.eq('viewerUserId', viewerId))
                .order('desc')
                .take(200);
            const alreadyViewedIds = new Set<string>(recentViews.map((v: any) => v.postId));

            const nowMs = Date.now();

            // Cold-start (Fase 3): un post sin tier asignado ('exploring'
            // implícito) NO compite contra la población general — con
            // `views` chico cualquier like dispara una tasa sin sentido
            // (1 view + 1 like = likeRate:1.0). Sólo compite por su slot
            // garantizado, ordenado por menos-visto-primero (no random) para
            // que cada post avance monótonamente hacia el umbral del cron de
            // graduación (`social/loopsTiering.ts`) en vez de depender de
            // suerte.
            const exploring: any[] = [];
            const graded: any[] = [];
            for (const p of pool) {
                if (!p.loopsTier || p.loopsTier === 'exploring') exploring.push(p);
                else graded.push(p);
            }

            // Con población graduada, el orden de exploración es
            // menos-visto-primero (la regla de equidad de arriba). Sin ella —
            // el caso de una app joven, donde NADIE llegó a las 200 vistas que
            // pide el cron de graduación— la pestaña es de hecho "todo lo que
            // hay", y ahí menos-visto-primero significa que cada loop nuevo
            // (0 vistas) desplaza a los anteriores: el autor ve desaparecer lo
            // que subió ayer. En ese caso ordenamos por recencia, que es lo que
            // un feed chico tiene que mostrar.
            const hasGradedPopulation = graded.length > 0;
            if (hasGradedPopulation) {
                exploring.sort((a: any, b: any) => (a.viewCount ?? 0) - (b.viewCount ?? 0));
            } else {
                exploring.sort((a: any, b: any) =>
                    String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
                );
            }

            const scored = graded
                .map((p: any) => {
                    let score = scoreLoop(p, {
                        tagAffinity,
                        postTags: postTagsMap.get(String(p._id)) ?? [],
                        nowMs,
                        notInterestedAuthors: moderation.notInterestedAuthors,
                        alreadyViewedIds,
                    });
                    // Lookup de tier, nunca recomputo en vivo: 'graduated'
                    // sube, 'suppressed' baja SIN llegar a cero (un post con
                    // mala suerte en su muestra chica sigue circulando a
                    // volumen reducido en vez de quedar invisible siempre).
                    if (p.loopsTier === 'graduated') score *= 1.15;
                    else if (p.loopsTier === 'suppressed') score *= 0.4;
                    return { post: p, score };
                })
                .sort((a, b) => b.score - a.score)
                .map((x) => x.post);

            // Los slots de exploración son un PISO, no un techo: la fracción
            // garantiza un mínimo, pero si no hay suficientes posts graduados
            // para llenar la página, la exploración completa el resto.
            //
            // Sin este backfill la pestaña mostraba como mucho
            // `round(cap * 0.2)` = 4 loops, para siempre: nada sale nunca de
            // 'exploring' hasta que el cron de graduación lo ve con 200 vistas,
            // así que `scored` está vacío en cualquier app que no tenga tráfico
            // masivo. Ese techo de 4 es lo que se veía como "se borraron los
            // loops anteriores cuando subí otros".
            const minExplorationSlots = Math.round(cap * EXPLORATION_SLOT_FRACTION);
            const rest = scored.slice(0, Math.max(0, cap - minExplorationSlots));
            const explorationSlots = Math.max(minExplorationSlots, cap - rest.length);
            const reserved = exploring.slice(0, explorationSlots);

            // Interleave: uno de exploración cada ~N posiciones, para que no
            // quede todo apilado arriba (invisible bajo el scroll) ni abajo
            // (nunca visto) de la página.
            const merged: any[] = [];
            const stride = reserved.length ? Math.max(1, Math.floor(rest.length / reserved.length)) : Infinity;
            let ri = 0;
            for (let si = 0; si < rest.length; si++) {
                merged.push(rest[si]);
                if (ri < reserved.length && (si + 1) % stride === 0) merged.push(reserved[ri++]);
            }
            while (ri < reserved.length) merged.push(reserved[ri++]);

            // Diversity cap por el hashtag de mayor afinidad del viewer para
            // ese post (fallback: primer tag del post, o autor si no tiene
            // tags) — el eje de diversidad de Loops es contenido, no autor,
            // a pedido explícito del usuario ("depende MENOS del grafo
            // social").
            const diversityKeyOf = (p: any) => {
                const tags = postTagsMap.get(String(p._id)) ?? [];
                if (!tags.length) return p.authorUserId;
                let best = tags[0];
                let bestScore = -Infinity;
                for (const t of tags) {
                    const s = tagAffinity.get(t) ?? 0;
                    if (s > bestScore) {
                        bestScore = s;
                        best = t;
                    }
                }
                return best;
            };
            // Si el pool no alcanza a llenar la página, el cap de diversidad
            // sólo puede quitar contenido que no tiene con qué reemplazar: un
            // autor único vería sólo 2 de sus loops y el resto de la pantalla
            // vacía. Con material de sobra sí se aplica, con un tope algo más
            // holgado que el del feed general (4 en vez de 2) porque los loops
            // sin hashtags caen a la clave "autor".
            candidates = merged.length <= cap
                ? merged
                : applyDiversityCap(merged, cap, diversityKeyOf, LOOPS_DIVERSITY_PER_KEY);
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

            // Afinidad graduada (Fase 1.1): una query indexada sobre la
            // tabla EMA persistida, en vez del scan de "últimos 50 likes +
            // hasta 50 ctx.db.get extra" que había antes — más barato Y
            // gradual (score continuo) en vez de un booleano "le gustó
            // alguna vez sí/no".
            const affinityRows = await ctx.db
                .query('socialAuthorAffinity')
                .withIndex('by_viewer', (q: any) => q.eq('viewerUserId', viewerId))
                .take(200);
            const affinityScores = new Map<string, number>(
                affinityRows.map((r: any) => [r.authorUserId, r.score]),
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
                        affinityScores,
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

        // Dedupe de reposts: si en la misma página vienen el original Y un
        // espejo del original (o dos espejos del mismo original), sobra el
        // espejo. Va acá y no en `decoratePosts` porque ese helper lo comparten
        // 5 call-sites, y en el PERFIL sí querés ver las dos cosas: si alguien
        // posteó algo y después lo reposteó, en su perfil van los dos.
        // No afecta la paginación: `rawCount`/`oldestRawCreatedAt` salen del
        // lote crudo, antes de todos los filtros (ver comentario de abajo).
        const idsInPage = new Set(candidates.map((p: any) => String(p._id)));
        const seenQuoted = new Set<string>();
        candidates = candidates.filter((p: any) => {
            if (!isPureRepost(p)) return true;
            const q = String(p.quotedPostId);
            if (idsInPage.has(q) || seenQuoted.has(q)) return false;
            seenQuoted.add(q);
            return true;
        });

        const { posts: resolved, attribution } = await substituteReposts(ctx, candidates);
        const decorated = await decoratePosts(ctx, resolved, viewerId, moderation);
        const items = await attachRepostAttribution(ctx, decorated, attribution);
        // "Se acabó" se decide con el lote crudo: si vino más chico que lo
        // pedido, no hay nada más atrás. Si vino lleno, puede haber más
        // aunque el filtro haya dejado `candidates` por debajo de `cap`.
        const exhausted = rawCount < rawTakeSize;

        // En Loops el cursor avanza hasta el ÚLTIMO POST DEVUELTO, no hasta el
        // final del lote sobremuestreado. El lote trae hasta 4x lo que entra en
        // una página, así que cortar por su extremo saltearía los ~60 loops que
        // quedaron fuera de esta página y nunca se mostrarían. En los feeds
        // rankeados eso es aceptable (el orden no es cronológico), pero acá el
        // orden es por recencia y saltear equivale a perder contenido.
        const oldestReturnedCreatedAt = items.length
            ? items.reduce(
                  (oldest: string | null, p: any) =>
                      !oldest || String(p.createdAt) < oldest ? String(p.createdAt) : oldest,
                  null as string | null,
              )
            : null;

        const nextCursor = exhausted
            ? null
            : mode === 'videos'
              ? oldestReturnedCreatedAt ?? oldestRawCreatedAt
              : oldestRawCreatedAt;

        return { items, nextCursor };
    },
});

/** Debajo de esto + poco visto, cuenta como "salió rápido" (Loops). */
const QUICK_SKIP_DWELL_MS = 1500;
const QUICK_SKIP_COMPLETION = 0.25;
/** A partir de acá, "lo miró completo" alimenta afinidad (Feed y Loops). */
const HIGH_COMPLETION_THRESHOLD = 0.8;

/**
 * Idempotent impression counter — Y la fuente de watch-time/skip/rewatch
 * para los dos rankers (Feed y Loops, plan de ranking dual). El cliente
 * manda `dwellMs`/`completionPct`/`quickSkip`/`loopCount` al SALIR de cada
 * ítem (no al entrar): `onViewableItemsChanged`/el efecto de "isActive→false"
 * de `LoopItem` disparan cuando un post deja de estar en pantalla, con lo
 * que estuvo visible.
 *
 * `avgCompletionPct` se actualiza con una media incremental
 * (`avg' = avg + (x - avg) / n`) para no tener que releer ni promediar todas
 * las vistas del post en cada request — el costo es O(1) por vista, no
 * O(vistas totales). `quickSkipCount`/`totalLoopCount` son denormalizados
 * igual, mismo motivo.
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
            // Loops (Fase 0.2/0.3 del plan de ranking): "salió rápido y sin
            // ver casi nada" y cuántas vueltas de más reprodujo (rewatch).
            quickSkip: v.optional(v.boolean()),
            loopCount: v.optional(v.number()),
        }))),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const watchByPost = new Map<
            string,
            { dwellMs?: number; completionPct?: number; quickSkip?: boolean; loopCount?: number }
        >((args.watch ?? []).map((w) => [String(w.postId), w]));

        let counted = 0;
        for (const postId of args.postIds.slice(0, 50)) {
            const watch = watchByPost.get(String(postId));
            const clampedCompletion =
                typeof watch?.completionPct === 'number'
                    ? Math.max(0, Math.min(1, watch.completionPct))
                    : undefined;
            const loopCount = Math.max(0, watch?.loopCount ?? 0);

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
                // la impresión ni a bumpear `viewCount`. `loopCount` toma el
                // máximo; `quickSkip` se recalcula del estado COMBINADO (si
                // esta vez miró completo, deja de contar como skip) — no se
                // hace OR de flags viejos contra nuevos.
                const bestCompletion =
                    clampedCompletion !== undefined
                        ? Math.max(existing.completionPct ?? 0, clampedCompletion)
                        : existing.completionPct;
                const bestLoopCount = Math.max(existing.loopCount ?? 0, loopCount);
                const loopDelta = bestLoopCount - (existing.loopCount ?? 0);
                const combinedQuickSkip =
                    (watch?.dwellMs ?? Infinity) < QUICK_SKIP_DWELL_MS &&
                    (bestCompletion ?? 0) < QUICK_SKIP_COMPLETION;

                const viewPatch: any = {};
                if (clampedCompletion !== undefined && (existing.completionPct ?? 0) < clampedCompletion) {
                    viewPatch.completionPct = clampedCompletion;
                    viewPatch.dwellMs = watch?.dwellMs;
                }
                if (loopDelta > 0) viewPatch.loopCount = bestLoopCount;
                if ((existing.quickSkip ?? false) !== combinedQuickSkip) {
                    viewPatch.quickSkip = combinedQuickSkip;
                }
                if (Object.keys(viewPatch).length) {
                    await ctx.db.patch(existing._id, { ...viewPatch, updatedAt: NOW() });
                }

                const postPatch: any = {};
                if (loopDelta > 0) postPatch.totalLoopCount = (post.totalLoopCount ?? 0) + loopDelta;
                if ((existing.quickSkip ?? false) !== combinedQuickSkip) {
                    postPatch.quickSkipCount = Math.max(
                        0,
                        (post.quickSkipCount ?? 0) + (combinedQuickSkip ? 1 : -1),
                    );
                }
                if (Object.keys(postPatch).length) await ctx.db.patch(postId, postPatch);

                if (loopDelta > 0 && post.type === 'video' && post.authorUserId !== actor.idString) {
                    await bumpTagAffinityForPost(ctx, actor.idString, post, 1.0);
                }
                continue;
            }

            const quickSkip =
                (watch?.dwellMs ?? Infinity) < QUICK_SKIP_DWELL_MS &&
                (clampedCompletion ?? 0) < QUICK_SKIP_COMPLETION;

            await ctx.db.insert('socialPostViews', {
                postId: String(postId),
                viewerUserId: actor.idString,
                createdAt: NOW(),
                dwellMs: watch?.dwellMs,
                completionPct: clampedCompletion,
                quickSkip,
                loopCount,
            });

            const insertPatch: any = { viewCount: (post.viewCount ?? 0) + 1 };
            if (quickSkip) insertPatch.quickSkipCount = (post.quickSkipCount ?? 0) + 1;
            if (loopCount > 0) insertPatch.totalLoopCount = (post.totalLoopCount ?? 0) + loopCount;
            await ctx.db.patch(postId, insertPatch);
            counted += 1;

            if (clampedCompletion !== undefined) {
                const n = post.watchSampleCount ?? 0;
                const prevAvg = post.avgCompletionPct ?? 0.5;
                const nextAvg = prevAvg + (clampedCompletion - prevAvg) / (n + 1);
                await ctx.db.patch(postId, { avgCompletionPct: nextAvg, watchSampleCount: n + 1 });
            }

            if (post.authorUserId !== actor.idString) {
                if (clampedCompletion !== undefined && clampedCompletion >= HIGH_COMPLETION_THRESHOLD) {
                    await bumpAuthorAffinity(ctx, actor.idString, post.authorUserId, 0.5);
                    if (post.type === 'video') await bumpTagAffinityForPost(ctx, actor.idString, post, 1.5);
                } else if (quickSkip && post.type === 'video') {
                    await bumpTagAffinityForPost(ctx, actor.idString, post, -1.0);
                }
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
        // Igual que el feed: los reposts del perfil se muestran como el post
        // original con la atribución arriba. Acá NO se deduplica — si alguien
        // posteó algo y después lo reposteó, en su perfil van los dos, como
        // en Twitter.
        const { posts: resolved, attribution } = await substituteReposts(
            ctx,
            posts.filter((p: any) => !p.deletedAt),
        );
        const decorated = await decoratePosts(ctx, resolved, actor.idString, moderation);
        const items = await attachRepostAttribution(ctx, decorated, attribution);

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

        // Ranking (Fase 1.1): comentar señala más interés que un like.
        if (post.authorUserId !== actor.idString) {
            await bumpAuthorAffinity(ctx, actor.idString, post.authorUserId, 2.0);
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
        let actor;
        try {
            actor = await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return { items: [], nextCursor: null };
        }
        const viewerId = actor.idString;
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
        const [authors, likeRows] = await Promise.all([
            Promise.all(
                authorIds.map((id: string) =>
                    ctx.db
                        .query('socialUsers')
                        .withIndex('by_user', (q: any) => q.eq('userId', id))
                        .first(),
                ),
            ),
            // `hasLiked` viewer-scoped — mismo patrón batcheado que `getFeed`.
            Promise.all(
                visible.map((c: any) =>
                    ctx.db
                        .query('socialLikes')
                        .withIndex('by_user_target', (q: any) =>
                            q.eq('userId', viewerId).eq('targetType', 'comment').eq('targetId', String(c._id)),
                        )
                        .first(),
                ),
            ),
        ]);
        // El avatar se guarda como `convex-storage:<id>`, que no es una URL
        // cargable: hay que resolverlo antes de mandarlo. Devolver el documento
        // crudo dejaba los avatares de los comentarios rotos.
        const map = await buildAuthorMap(ctx, authorIds, authors);

        return {
            items: visible.map((c: any, i: number) => ({
                ...c,
                author: map.get(c.authorUserId),
                hasLiked: Boolean(likeRows[i]),
            })),
            nextCursor: result.isDone ? null : result.continueCursor,
        };
    },
});

/** Respuestas de UN comentario de primer nivel, bajo demanda. */
export const getCommentReplies = query({
    args: { sessionToken: v.optional(v.string()), commentId: v.id('socialComments'), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
        const viewerId = actor.idString;
        const cap = Math.min(args.limit ?? 50, 100);
        const replies = await ctx.db
            .query('socialComments')
            .withIndex('by_parent_created', (q: any) => q.eq('parentCommentId', String(args.commentId)))
            .order('asc')
            .take(cap);
        const visible = replies.filter((c: any) => !c.deletedAt && c.moderationStatus !== 'removed');
        const authorIds = Array.from(new Set(visible.map((c: any) => c.authorUserId)));
        const [authors, likeRows] = await Promise.all([
            Promise.all(
                authorIds.map((id: string) =>
                    ctx.db.query('socialUsers').withIndex('by_user', (q: any) => q.eq('userId', id)).first(),
                ),
            ),
            Promise.all(
                visible.map((c: any) =>
                    ctx.db
                        .query('socialLikes')
                        .withIndex('by_user_target', (q: any) =>
                            q.eq('userId', viewerId).eq('targetType', 'comment').eq('targetId', String(c._id)),
                        )
                        .first(),
                ),
            ),
        ]);
        const map = await buildAuthorMap(ctx, authorIds, authors);
        return visible.map((c: any, i: number) => ({
            ...c,
            author: map.get(c.authorUserId),
            hasLiked: Boolean(likeRows[i]),
        }));
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
                    // Ranking (Fase 1.1/2.3): un like es la señal de afinidad
                    // más barata que existe. Sube autor siempre; sube tag
                    // sólo si es un video (Loops), para no mezclar los dos
                    // grafos de personalización.
                    await bumpAuthorAffinity(ctx, actor.idString, (post as any).authorUserId, 1.0);
                    if ((post as any).type === 'video') {
                        await bumpTagAffinityForPost(ctx, actor.idString, post, 1.0);
                    }

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
        } else if (args.targetType === 'story') {
            // Ranking del tray (A1): un like a una historia pesa igual que
            // un like a un post — mismo motor de afinidad, sin duplicar
            // pesos aparte para historias.
            const story = await ctx.db.get(args.targetId as any);
            if (story && (story as any).authorUserId !== actor.idString) {
                await bumpAuthorAffinity(ctx, actor.idString, (story as any).authorUserId, 1.0);
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

    // `p.avatar` es `convex-storage:<id>`: sin resolver, la lista de seguidores
    // mostraba iniciales en vez de fotos.
    const resolve = createMediaResolver(ctx);

    return {
        items: await Promise.all(
            profiles.map(async (p: any, i: number) => ({
                userId: otherIds[i],
                username: p?.username ?? 'usuario',
                displayName: p?.displayName ?? 'Usuario',
                avatar: await resolve(p?.avatar),
                verified: p?.verified ?? false,
                isInfluencer: p?.isInfluencer ?? false,
            })),
        ),
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

// Sticker de historia recibido del cliente — mismo shape que `storySticker`
// en el schema, repetido acá porque los validadores de mutation no pueden
// importar la unión del schema directamente (Convex no expone sus
// sub-validadores). Mantener los dos en sync a mano si se agrega un tipo.
const storyStickerArg = {
    id: v.string(),
    x: v.number(),
    y: v.number(),
    rotation: v.optional(v.number()),
    scale: v.optional(v.number()),
};
const storyStickerValidator = v.union(
    v.object({ ...storyStickerArg, type: v.literal('text'), content: v.string(), color: v.optional(v.string()) }),
    v.object({ ...storyStickerArg, type: v.literal('poll'), question: v.string(), options: v.array(v.string()) }),
    v.object({ ...storyStickerArg, type: v.literal('question'), prompt: v.string() }),
    v.object({ ...storyStickerArg, type: v.literal('countdown'), title: v.string(), endsAt: v.string() }),
    v.object({ ...storyStickerArg, type: v.literal('slider'), emoji: v.string(), question: v.optional(v.string()) }),
    v.object({ ...storyStickerArg, type: v.literal('mention'), userId: v.string(), username: v.string() }),
    v.object({ ...storyStickerArg, type: v.literal('location'), placeId: v.optional(v.string()), name: v.string(), address: v.optional(v.string()) }),
    v.object({ ...storyStickerArg, type: v.literal('hashtag'), tag: v.string() }),
    v.object({ ...storyStickerArg, type: v.literal('music'), audioTrackId: v.id('audioTracks') }),
);

export const createStory = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        type: v.union(v.literal('image'), v.literal('video'), v.literal('text')),
        // Requerido salvo para `type:'text'` (fondo de color, sin media).
        url: v.optional(v.string()),
        backgroundColor: v.optional(v.string()),
        durationSec: v.optional(v.number()),
        /** 'close_friends' (Fase 7) la esconde de todos salvo `socialCloseFriends`. */
        audience: v.optional(v.union(v.literal('everyone'), v.literal('close_friends'))),
        stickers: v.optional(v.array(storyStickerValidator)),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken, { write: 'createStory' });
        if (args.type !== 'text' && !args.url) {
            throw new ConvexError({ code: 'BAD_REQUEST', message: 'Falta el archivo de la historia.' });
        }
        const now = NOW();
        const expiresAt = new Date(Date.now() + STORY_TTL_MS).toISOString();
        const storyId = await ctx.db.insert('socialStories', {
            authorUserId: actor.idString,
            type: args.type,
            url: args.url,
            backgroundColor: args.backgroundColor,
            durationSec: args.durationSec ?? 5,
            viewCount: 0,
            expiresAt,
            audience: args.audience,
            stickers: args.stickers,
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
            // Ranking del tray (A1): mirar es señal débil comparado con un
            // comentario/reply, por eso el peso más bajo del sistema.
            await bumpAuthorAffinity(ctx, actor.idString, story.authorUserId, 0.3);
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

        // Ranking del tray (A1): una sola query para "qué ya vi" y otra
        // para afinidad, en vez de N por historia/autor.
        const [viewedRows, affinityRows] = await Promise.all([
            ctx.db.query('socialStoryViews').withIndex('by_viewer', (q: any) => q.eq('viewerUserId', actor.idString)).collect(),
            ctx.db.query('socialAuthorAffinity').withIndex('by_viewer', (q: any) => q.eq('viewerUserId', actor.idString)).collect(),
        ]);
        const viewedStoryIds = new Set(viewedRows.map((v: any) => v.storyId));
        const affinityByAuthor = new Map(affinityRows.map((a: any) => [a.authorUserId, a.score]));

        const groups: Array<{ author: any; stories: any[]; hasUnseen: boolean; affinityScore: number; lastCreatedAt: string }> = [];
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
                }
            }
            // El avatar se resuelve para las DOS ramas. Antes sólo lo hacía el
            // fallback a `users`, así que el camino normal (que es el que corre
            // casi siempre) devolvía `convex-storage:<id>` y la barra de
            // historias mostraba círculos vacíos.
            if (author?.avatar) {
                author = { ...author, avatar: await resolveMediaUrl(ctx, author.avatar) };
            }
            const resolvedActive = await Promise.all(active.map(async (s: any) => {
                const viewedByMe = viewedStoryIds.has(String(s._id));
                const raw = s.url || s.imageUrl;
                if (raw && raw.startsWith('convex-storage:')) {
                    const resolved = await ctx.storage.getUrl(raw.replace('convex-storage:', ''));
                    if (resolved) return { ...s, url: resolved, imageUrl: resolved, viewedByMe };
                }
                return { ...s, imageUrl: s.url, viewedByMe };
            }));
            groups.push({
                author: author || { userId, displayName: 'Usuario', username: 'user' },
                stories: resolvedActive,
                hasUnseen: resolvedActive.some((s: any) => !s.viewedByMe),
                affinityScore: userId === actor.idString ? Infinity : (affinityByAuthor.get(userId) ?? 0),
                lastCreatedAt: resolvedActive[resolvedActive.length - 1]?.createdAt ?? '',
            });
        }

        // Uno mismo siempre primero (afinidad Infinity lo gana todo); dentro
        // del resto, no-vistas antes que vistas, y adentro de cada bucket por
        // afinidad descendente — mismo motor (`socialAuthorAffinity`) que
        // ordena Feed/Loops, no un sistema de ranking aparte.
        groups.sort((a, b) => {
            if (a.affinityScore === Infinity || b.affinityScore === Infinity) {
                return (b.affinityScore === Infinity ? 1 : 0) - (a.affinityScore === Infinity ? 1 : 0);
            }
            if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
            if (a.affinityScore !== b.affinityScore) return b.affinityScore - a.affinityScore;
            return b.lastCreatedAt.localeCompare(a.lastCreatedAt);
        });

        return groups.map(({ author, stories, hasUnseen }) => ({ author, stories, hasUnseen }));
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
        const rows = await ctx.db
            .query('socialStoryViews')
            .withIndex('by_story', (q) => q.eq('storyId', String(args.storyId)))
            .collect();
        // A4: antes devolvía filas crudas (sin avatar/username) y no lo
        // consumía ninguna pantalla — se hidrata acá, mismo patrón liviano
        // que `listCloseFriends`, no el batching completo de `decoratePosts`
        // porque el volumen de una historia es chico.
        const media = createMediaResolver(ctx);
        const profiles = await Promise.all(
            rows.map((r: any) =>
                ctx.db.query('socialUsers').withIndex('by_user', (q: any) => q.eq('userId', r.viewerUserId)).first(),
            ),
        );
        return await Promise.all(
            rows.map(async (r: any, i: number) => {
                const p = profiles[i];
                return {
                    viewerUserId: r.viewerUserId,
                    viewedAt: r.viewedAt,
                    username: p?.username ?? null,
                    displayName: p?.displayName ?? null,
                    avatar: p?.avatar ? await media(p.avatar) : null,
                };
            }),
        );
    },
});

/**
 * Respuesta a un sticker interactivo (poll/question/slider) — upsert
 * idempotente por `(storyId, stickerId, viewerUserId)`. No valida que el
 * `stickerId` exista de verdad en `story.stickers` (el cliente ya sólo
 * puede tocar los que están renderizados) — mantiene la mutation liviana.
 */
export const respondToStorySticker = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        storyId: v.id('socialStories'),
        stickerId: v.string(),
        type: v.union(v.literal('poll'), v.literal('question'), v.literal('slider')),
        optionIndex: v.optional(v.number()),
        text: v.optional(v.string()),
        sliderValue: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const existing = await ctx.db
            .query('socialStoryStickerResponses')
            .withIndex('by_story_sticker_viewer', (q: any) =>
                q.eq('storyId', args.storyId).eq('stickerId', args.stickerId).eq('viewerUserId', actor.idString),
            )
            .first();
        const payload = {
            type: args.type,
            optionIndex: args.optionIndex,
            text: args.text,
            sliderValue: args.sliderValue,
        };
        if (existing) {
            await ctx.db.patch(existing._id, payload);
        } else {
            await ctx.db.insert('socialStoryStickerResponses', {
                storyId: args.storyId,
                stickerId: args.stickerId,
                viewerUserId: actor.idString,
                createdAt: NOW(),
                ...payload,
            });
        }
        return { success: true };
    },
});

/**
 * Resultados de un sticker interactivo, agregados AL LEER (ver comentario
 * de `socialStoryStickerResponses` en el schema — sin contador
 * denormalizado, el volumen de 24h no lo justifica todavía). Sólo el autor
 * de la historia puede verlos, mismo criterio que `getStoryViewers`.
 */
export const getStoryStickerResults = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        storyId: v.id('socialStories'),
        stickerId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const story = await ctx.db.get(args.storyId);
        if (!story || story.authorUserId !== actor.idString) return null;
        const responses = await ctx.db
            .query('socialStoryStickerResponses')
            .withIndex('by_story_sticker', (q: any) => q.eq('storyId', args.storyId).eq('stickerId', args.stickerId))
            .collect();
        const optionCounts: Record<number, number> = {};
        const sliderValues: number[] = [];
        for (const r of responses) {
            if (typeof r.optionIndex === 'number') optionCounts[r.optionIndex] = (optionCounts[r.optionIndex] ?? 0) + 1;
            if (typeof r.sliderValue === 'number') sliderValues.push(r.sliderValue);
        }
        return {
            totalResponses: responses.length,
            optionCounts,
            sliderAverage: sliderValues.length ? sliderValues.reduce((a, b) => a + b, 0) / sliderValues.length : null,
        };
    },
});

// ---------------------------------------------------------------------------
// Debug interno del ranker (Fase 4.4 del plan de ranking) — NO público, a
// propósito (lección de E-048 sobre endpoints de dev accidentalmente
// públicos). Corre la misma selección + scoring que `getFeed` para un
// `viewerUserId` y devuelve el desglose, para verificar a ojo que los pesos
// producen un orden sensato antes de exponer un cambio a usuarios reales.
//
//   npx convex run social:debugScoreFeed '{"viewerUserId":"..."}'
//   npx convex run social:debugScoreLoops '{"viewerUserId":"..."}'
// ---------------------------------------------------------------------------

export const debugScoreFeed = internalQuery({
    args: { viewerUserId: v.string(), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const limit = Math.min(args.limit ?? 20, 50);
        const moderation = await loadViewerModerationSets(ctx, args.viewerUserId);
        const rawPool = await ctx.db
            .query('socialPosts')
            .withIndex('by_created', (q: any) => q)
            .order('desc')
            .filter((q: any) => q.eq(q.field('deletedAt'), undefined))
            .take(Math.min(limit * FORYOU_OVERSAMPLE, FORYOU_POOL_CAP));
        const pool = rawPool.filter(isGlobalFeedEligible);

        const affinityRows = await ctx.db
            .query('socialAuthorAffinity')
            .withIndex('by_viewer', (q: any) => q.eq('viewerUserId', args.viewerUserId))
            .take(200);
        const affinityScores = new Map<string, number>(affinityRows.map((r: any) => [r.authorUserId, r.score]));

        const recentViews = await ctx.db
            .query('socialPostViews')
            .withIndex('by_viewer_created', (q: any) => q.eq('viewerUserId', args.viewerUserId))
            .order('desc')
            .take(200);
        const alreadyViewedIds = new Set<string>(recentViews.map((v: any) => v.postId));

        const viewer = await ctx.db
            .query('socialUsers')
            .withIndex('by_user', (q: any) => q.eq('userId', args.viewerUserId))
            .first();
        const nowMs = Date.now();

        return pool
            .map((p: any) => ({
                postId: String(p._id),
                authorUserId: p.authorUserId,
                content: (p.content ?? '').slice(0, 60),
                createdAt: p.createdAt,
                affinity: affinityScores.get(p.authorUserId) ?? 0,
                score: scorePost(p, {
                    affinityScores,
                    viewerCountry: (viewer as any)?.country,
                    nowMs,
                    notInterestedAuthors: moderation.notInterestedAuthors,
                    alreadyViewedIds,
                }),
            }))
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, limit);
    },
});

export const debugScoreLoops = internalQuery({
    args: { viewerUserId: v.string(), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const limit = Math.min(args.limit ?? 20, 50);
        const moderation = await loadViewerModerationSets(ctx, args.viewerUserId);
        const rawPool = await ctx.db
            .query('socialPosts')
            .withIndex('by_type_created', (q: any) => q.eq('type', 'video'))
            .order('desc')
            .filter((q: any) => q.eq(q.field('deletedAt'), undefined))
            .take(Math.min(limit * FORYOU_OVERSAMPLE, FORYOU_POOL_CAP));
        const pool = rawPool.filter(isGlobalFeedEligible);

        const tagAffinityRows = await ctx.db
            .query('socialTagAffinity')
            .withIndex('by_viewer', (q: any) => q.eq('viewerUserId', args.viewerUserId))
            .take(300);
        const tagAffinity = new Map<string, number>(tagAffinityRows.map((r: any) => [r.tag, r.score]));

        const postTagsMap = new Map<string, string[]>();
        await Promise.all(
            pool.map(async (p: any) => {
                const rows = await ctx.db
                    .query('socialPostTags')
                    .withIndex('by_post', (q: any) => q.eq('postId', String(p._id)))
                    .take(10);
                postTagsMap.set(String(p._id), rows.map((r: any) => r.tag));
            }),
        );

        const recentViews = await ctx.db
            .query('socialPostViews')
            .withIndex('by_viewer_created', (q: any) => q.eq('viewerUserId', args.viewerUserId))
            .order('desc')
            .take(200);
        const alreadyViewedIds = new Set<string>(recentViews.map((v: any) => v.postId));
        const nowMs = Date.now();

        return pool
            .map((p: any) => {
                const postTags = postTagsMap.get(String(p._id)) ?? [];
                let score = scoreLoop(p, {
                    tagAffinity,
                    postTags,
                    nowMs,
                    notInterestedAuthors: moderation.notInterestedAuthors,
                    alreadyViewedIds,
                });
                const tier = p.loopsTier ?? 'exploring';
                if (tier === 'graduated') score *= 1.15;
                else if (tier === 'suppressed') score *= 0.4;
                return {
                    postId: String(p._id),
                    authorUserId: p.authorUserId,
                    tags: postTags,
                    tier,
                    viewCount: p.viewCount ?? 0,
                    avgCompletionPct: p.avgCompletionPct ?? null,
                    quickSkipCount: p.quickSkipCount ?? 0,
                    shareCount: p.shareCount ?? 0,
                    score,
                };
            })
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, limit);
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
            // A3: una historia guardada en un highlight sobrevive a su
            // propio vencimiento — el highlight es justamente eso.
            if (story.isHighlighted) continue;
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
        let post = await ctx.db.get(args.postId);
        if (!post || post.deletedAt) throw new Error('Post no encontrado.');

        // Repostear un espejo redirige al ORIGINAL (lo mismo que hace
        // Twitter). Sin esto se encadenan espejos de espejos sin fondo.
        let targetId: Id<'socialPosts'> = args.postId;
        if (isPureRepost(post)) {
            const originalId = ctx.db.normalizeId('socialPosts', post.quotedPostId!);
            const original = originalId ? await ctx.db.get(originalId) : null;
            if (!original || original.deletedAt) throw new Error('Post no encontrado.');
            targetId = original._id;
            post = original;
        }

        // Un post de comunidad NO se puede repostear: el espejo no heredaría
        // el `communityId`, y `isGlobalFeedEligible` sólo excluye del feed
        // global a los posts QUE LO TIENEN — o sea que el espejo filtraría
        // contenido privado de la comunidad al feed público.
        if (post.communityId) {
            throw new ConvexError({
                code: 'FORBIDDEN',
                message: 'Los posts de una comunidad no se pueden repostear.',
            });
        }

        const existing = await ctx.db
            .query('socialRetweets')
            .withIndex('by_user_post', (q) =>
                q.eq('userId', actor.idString).eq('postId', String(targetId))
            )
            .first();

        if (existing) {
            // Soft delete del espejo, igual que `deletePost` — borrarlo de
            // verdad dejaría colgando cualquier referencia (un comentario
            // sobre el espejo, un share).
            if (existing.repostPostId) {
                const mirror = await ctx.db.get(existing.repostPostId);
                if (mirror && !mirror.deletedAt) {
                    await ctx.db.patch(mirror._id, { deletedAt: NOW() });
                }
            }
            await ctx.db.delete(existing._id);
            await ctx.db.patch(targetId, { retweetCount: Math.max(0, post.retweetCount - 1) });
            return { retweeted: false, repostPostId: null };
        }

        // El espejo se inserta a mano y NO por `createPostImpl`: ese camino
        // corre el filtro de texto sobre un string vacío, bumpea `postCount`
        // del perfil, extrae hashtags/menciones, dispara link preview y
        // evalúa recompensas. Nada de eso aplica a un repost sin texto, y un
        // `postCount` inflado por reposts sería un bug de producto.
        const authorProfile = await ctx.db
            .query('socialUsers')
            .withIndex('by_user', (q: any) => q.eq('userId', actor.idString))
            .first();
        const mirrorId = await ctx.db.insert('socialPosts', {
            authorUserId: actor.idString,
            type: 'text',
            content: '',
            likeCount: 0,
            commentCount: 0,
            retweetCount: 0,
            viewCount: 0,
            replyCount: 0,
            moderationStatus: 'visible',
            quotedPostId: String(targetId),
            geoCountry: (authorProfile as any)?.country ?? undefined,
            createdAt: NOW(),
        });

        await ctx.db.insert('socialRetweets', {
            userId: actor.idString,
            postId: String(targetId),
            repostPostId: mirrorId,
            createdAt: NOW(),
        });
        await ctx.db.patch(targetId, { retweetCount: post.retweetCount + 1 });

        if (post.authorUserId !== actor.idString) {
            await recordActivity(ctx, {
                userId: post.authorUserId,
                type: 'repost',
                actorUserId: actor.idString,
                targetType: 'post',
                targetId: String(targetId),
            });

            // Mismos efectos que un like/comentario. Va en try/catch como en
            // `toggleLike`: que falle un push no puede abortar el repost.
            try {
                // Peso 2.0, igual que un comentario: repostear es poner tu
                // nombre sobre el contenido de otro, señal mucho más fuerte
                // que un like (1.0).
                await bumpAuthorAffinity(ctx, actor.idString, post.authorUserId, 2.0);
                if (post.type === 'video') {
                    await bumpTagAffinityForPost(ctx, actor.idString, post, 2.0);
                }
                // Sin el throttle que usan los likes: un repost es un evento
                // raro y significativo, no llega en ráfagas.
                await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                    sendEmail: true,
                    userId: post.authorUserId,
                    title: 'Republicaron tu post',
                    body: 'Mirá quién compartió tu publicación.',
                    category: 'social',
                    data: { type: 'repost', targetType: 'post', targetId: String(targetId) },
                });
            } catch (e) {
                console.warn('[social.repost] side-effects failed', e);
            }
        }

        return { retweeted: true, repostPostId: mirrorId };
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
        const highlightId = await ctx.db.insert('socialHighlights', {
            userId: actor.idString,
            title: args.title,
            coverImage: args.coverImage,
            storyIds: args.storyIds,
            createdAt: NOW(),
        });
        await markStoriesHighlighted(ctx, args.storyIds);
        return highlightId;
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

/** Marca `isHighlighted:true` en cada storyId — el cron de expiración
 *  (`internalExpireStories`) las salta. `ctx.db.normalizeId` porque
 *  `storyIds` viaja como `string[]` (mismo motivo que otras referencias
 *  cruzadas del módulo social), no como `Id<'socialStories'>[]`. */
const markStoriesHighlighted = async (ctx: any, storyIds: string[]) => {
    for (const raw of storyIds) {
        const id = ctx.db.normalizeId('socialStories', raw);
        if (id) await ctx.db.patch(id, { isHighlighted: true });
    }
};

/** A3: `addHighlight` sólo crea con un set fijo — esto agrega una historia
 *  a una destacada YA existente (autor-only). */
export const addStoryToHighlight = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        highlightId: v.id('socialHighlights'),
        storyId: v.id('socialStories'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const highlight = await ctx.db.get(args.highlightId);
        if (!highlight || highlight.userId !== actor.idString) throw new Error('No autorizado.');
        if (highlight.storyIds.includes(String(args.storyId))) return { success: true };
        await ctx.db.patch(args.highlightId, { storyIds: [...highlight.storyIds, String(args.storyId)] });
        await markStoriesHighlighted(ctx, [String(args.storyId)]);
        return { success: true };
    },
});

export const removeStoryFromHighlight = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        highlightId: v.id('socialHighlights'),
        storyId: v.id('socialStories'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const highlight = await ctx.db.get(args.highlightId);
        if (!highlight || highlight.userId !== actor.idString) throw new Error('No autorizado.');
        await ctx.db.patch(args.highlightId, {
            storyIds: highlight.storyIds.filter((id: string) => id !== String(args.storyId)),
        });
        // `isHighlighted` no se recalcula acá a propósito (ver comentario del
        // schema) — caso borde aceptado, no reference-counting completo.
        return { success: true };
    },
});

export const deleteHighlight = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        highlightId: v.id('socialHighlights'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const highlight = await ctx.db.get(args.highlightId);
        if (!highlight || highlight.userId !== actor.idString) throw new Error('No autorizado.');
        await ctx.db.delete(args.highlightId);
        return { success: true };
    },
});

/** Resuelve las historias de una destacada — a diferencia del tray, NO
 *  filtra por `expiresAt` (esa es exactamente la idea de un highlight). Sí
 *  respeta `deletedAt` (borrado explícito del autor). */
export const getHighlightStories = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        highlightId: v.id('socialHighlights'),
    },
    handler: async (ctx, args) => {
        await assertSocialActor(ctx, (args as any).sessionToken);
        const highlight = await ctx.db.get(args.highlightId);
        if (!highlight) return null;
        const media = createMediaResolver(ctx);
        const stories = await Promise.all(
            highlight.storyIds.map((id: string) => {
                const nid = ctx.db.normalizeId('socialStories', id);
                return nid ? ctx.db.get(nid) : null;
            }),
        );
        const resolved = await Promise.all(
            stories
                .filter((s: any) => s && !s.deletedAt)
                .map(async (s: any) => ({ ...s, url: s.url ? await media(s.url) : s.url })),
        );
        return { title: highlight.title, coverImage: highlight.coverImage, stories: resolved };
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
