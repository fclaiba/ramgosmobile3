/**
 * Sonidos reutilizables (estilo Reels/TikTok). El mux del audio elegido
 * dentro del video exportado pasa client-side (ffmpeg-expo, ver
 * `CreateReelScreen`) — acá sólo se sirve el catálogo: detalle de un track y
 * el feed de posts que lo usan. `createPost` (en `social.ts`) es quien crea
 * la fila y bumpea `usageCount`, no este archivo.
 */

import { v } from 'convex/values';
import { query } from '../_generated/server';
import { paginateQuery, socialViewer } from './_helpers';
import { decoratePosts, loadViewerModerationSets } from '../social';
import { resolveMediaUrl } from '../mediaUrl';

export const getAudioTrack = query({
    args: { sessionToken: v.optional(v.string()), trackId: v.id('audioTracks') },
    handler: async (ctx, args) => {
        if (!(await socialViewer(ctx, args.sessionToken))) return null;

        const track = await ctx.db.get(args.trackId);
        if (!track) return null;

        const author = await ctx.db
            .query('socialUsers')
            .withIndex('by_user', (q: any) => q.eq('userId', String(track.authorId)))
            .first();

        const audioUrl = await resolveMediaUrl(ctx, `convex-storage:${track.storageId}`);

        return {
            _id: track._id,
            name: track.name,
            usageCount: track.usageCount,
            authorUserId: String(track.authorId),
            authorUsername: author?.username ?? null,
            authorAvatar: author?.avatar ? await resolveMediaUrl(ctx, author.avatar) : null,
            audioUrl,
        };
    },
});

export const getPostsByAudioTrack = query({
    args: {
        sessionToken: v.optional(v.string()),
        trackId: v.id('audioTracks'),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<any> => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return { items: [], nextCursor: null };

        const page = await paginateQuery(
            ctx.db
                .query('socialPosts')
                .withIndex('by_audioTrack', (q: any) => q.eq('audioTrackId', args.trackId))
                .order('desc'),
            args.cursor,
            args.limit ?? 30,
        );

        const visible = page.items.filter(
            (p: any) => !p.deletedAt && p.moderationStatus !== 'removed' && p.communityId === undefined,
        );

        const moderation = await loadViewerModerationSets(ctx, actor.idString);
        const items = await decoratePosts(ctx, visible, actor.idString, moderation);

        return { items, nextCursor: page.nextCursor };
    },
});

/** Picker de música para el sticker `music` de historias — búsqueda simple
 *  por nombre, mismo patrón que `commercialCommunities.search_name`. */
export const searchAudioTracks = query({
    args: { sessionToken: v.optional(v.string()), query: v.string(), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        if (!(await socialViewer(ctx, args.sessionToken))) return [];
        const q = args.query.trim();
        if (!q) return [];
        const rows = await ctx.db
            .query('audioTracks')
            .withSearchIndex('search_name', (s: any) => s.search('name', q))
            .take(Math.min(args.limit ?? 20, 50));
        return rows.map((t: any) => ({ _id: t._id, name: t.name, usageCount: t.usageCount }));
    },
});
