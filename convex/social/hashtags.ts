/**
 * Hashtags: extracción al publicar, feed por tag, y trending. `socialPosts`
 * ya tiene el `searchIndex search_content`, pero eso es full-text sobre el
 * texto libre — no sirve para "todos los posts con #asado" ordenados por
 * fecha, ni para un ranking de tendencias sin escanear la tabla entera.
 */

import { v } from 'convex/values';
import { internalMutation, query } from '../_generated/server';
import { internal } from '../_generated/api';
import { paginateQuery, socialViewer } from './_helpers';
import { decoratePosts, loadViewerModerationSets } from '../social';

const NOW = () => new Date().toISOString();

/** Inserta las filas de `socialPostTags` y bump del contador `countTotal`. */
export const attachHashtags = async (
    ctx: any,
    postId: string,
    authorUserId: string,
    tags: string[],
): Promise<void> => {
    const now = NOW();
    for (const tag of tags) {
        await ctx.db.insert('socialPostTags', { postId, tag, authorUserId, createdAt: now });

        const stats = await ctx.db.query('socialTagStats').withIndex('by_tag', (q: any) => q.eq('tag', tag)).first();
        if (stats) {
            await ctx.db.patch(stats._id, {
                count24h: stats.count24h + 1,
                count7d: stats.count7d + 1,
                countTotal: stats.countTotal + 1,
                lastPostAt: now,
                updatedAt: now,
            });
        } else {
            await ctx.db.insert('socialTagStats', {
                tag,
                count24h: 1,
                count7d: 1,
                countTotal: 1,
                lastPostAt: now,
                updatedAt: now,
            });
        }
    }
};

/**
 * Feed de un hashtag, hidratado. Antes hacía `ctx.db.get` de cada post para
 * poder filtrar borrados/removidos y **tiraba el documento**, devolviendo
 * sólo `String(p._id)` — el cliente tendría que hacer N queries más para
 * mostrar algo. Ahora reusa `decoratePosts`/`loadViewerModerationSets` de
 * `social.ts`, el mismo camino que usa `getFeed`: aplica moderación, mutes
 * y resuelve media, en vez de duplicar esa lógica acá.
 */
export const getPostsByTag = query({
    args: { sessionToken: v.optional(v.string()), tag: v.string(), cursor: v.optional(v.string()), limit: v.optional(v.number()) },
    handler: async (ctx, args): Promise<any> => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return { items: [], nextCursor: null };

        const tag = args.tag.trim().toLowerCase().replace(/^#/, '');
        const page = await paginateQuery(
            ctx.db.query('socialPostTags').withIndex('by_tag_created', (q: any) => q.eq('tag', tag)).order('desc'),
            args.cursor,
            args.limit ?? 20,
        );

        const rawPosts = await Promise.all(
            page.items.map((t: any) => {
                const nid = ctx.db.normalizeId('socialPosts', t.postId);
                return nid ? ctx.db.get(nid) : null;
            }),
        );
        const visible = rawPosts.filter(
            (p: any) => p && !p.deletedAt && p.moderationStatus !== 'removed' && p.communityId === undefined,
        );

        const moderation = await loadViewerModerationSets(ctx, actor.idString);
        const items = await decoratePosts(ctx, visible, actor.idString, moderation);

        return { items, nextCursor: page.nextCursor };
    },
});

export const getTrendingTags = query({
    args: { sessionToken: v.optional(v.string()), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        if (!(await socialViewer(ctx, args.sessionToken))) return [];
        const rows = await ctx.db
            .query('socialTagStats')
            .withIndex('by_count24h', (q: any) => q)
            .order('desc')
            .take(Math.min(args.limit ?? 20, 50));
        return rows.map((r: any) => ({ tag: r.tag, count24h: r.count24h, countTotal: r.countTotal }));
    },
});

/**
 * Cron horario (registrado en `convex/crons.ts`): recalcula `count24h` desde
 * `socialPostTags.by_tag_created` en vez de dejar el contador crecer para
 * siempre. `count7d` queda como aproximación (no se decae acá) — suficiente
 * para ordenar tendencias, no para analytics exactos.
 *
 * Por lotes con marca de agua sobre `_creationTime`, mismo patrón que
 * `migrations/userDirectory.ts`: antes hacía `.collect()` de TODA
 * `socialTagStats` y después un `.collect()` de `socialPostTags` por cada
 * tag — con miles de tags eso revienta los límites de lectura de Convex. El
 * cron sólo dispara el primer lote (`cursor: undefined`); cada lote se
 * autoencadena hasta terminar, así que una tanda grande no espera a la
 * próxima hora para seguir.
 */
export const internalRecomputeTagStats = internalMutation({
    args: {
        cursor: v.optional(v.number()),
        batchSize: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const batchSize = Math.max(1, Math.min(args.batchSize ?? 100, 200));
        const cutoff24h = new Date(Date.now() - 24 * 3_600_000).toISOString();

        const batch = await ctx.db
            .query('socialTagStats')
            .withIndex('by_creation_time', (q: any) => q.gt('_creationTime', args.cursor ?? 0))
            .take(batchSize);

        let updated = 0;
        for (const s of batch) {
            const recent = await ctx.db
                .query('socialPostTags')
                .withIndex('by_tag_created', (q: any) => q.eq('tag', s.tag).gt('createdAt', cutoff24h))
                .collect();
            if (recent.length !== s.count24h) {
                await ctx.db.patch(s._id, { count24h: recent.length, updatedAt: NOW() });
                updated += 1;
            }
        }

        const isDone = batch.length < batchSize;
        const cursor = batch.length ? batch[batch.length - 1]._creationTime : (args.cursor ?? null);

        if (!isDone) {
            await ctx.scheduler.runAfter(0, internal.social.hashtags.internalRecomputeTagStats, {
                cursor: cursor ?? undefined,
                batchSize,
            });
        }

        return { scanned: batch.length, updated, isDone };
    },
});
