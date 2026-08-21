/**
 * Backfill de `loopsTier` para videos EXISTENTES (Fase 3.6/4.6 del plan de
 * ranking — bitácora E-086).
 *
 * Sin esto, todo el catálogo actual de Loops arrancaría en 'exploring' el
 * día del lanzamiento del scoring por etapas, desperdiciando el gate de
 * exploración (slots garantizados, sin competir contra la población
 * general) en contenido que YA probó su calidad con vistas reales.
 *
 * Regla: video con `viewCount >= EXPLORATION_SAMPLE_SIZE` y sin tier
 * asignado → 'graduated' directo, sin percentil — es una clasificación
 * única de arranque; el cron (`social/loopsTiering.ts`) ya retoma con
 * percentiles de ahí en más. Por debajo del umbral queda sin campo —
 * tratado como 'exploring' por el resto del sistema (ausente = implícito).
 *
 * Mismo template que `migrations/pointsUnification.ts`: dry-run → reporte →
 * `chain:true` aplica, batcheado por `_creationTime`.
 *
 *   npx convex run migrations/loopsTierBackfill:backfillTiers '{"dryRun":true}'
 *   npx convex run migrations/loopsTierBackfill:backfillTiers '{"chain":true}'
 */

import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { internal } from '../_generated/api';
import { EXPLORATION_SAMPLE_SIZE } from '../social/loopsTiering';

const NOW = () => new Date().toISOString();

export const backfillTiers = internalMutation({
    args: {
        cursor: v.optional(v.number()),
        batchSize: v.optional(v.number()),
        dryRun: v.optional(v.boolean()),
        chain: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<any> => {
        const batchSize = Math.max(1, Math.min(args.batchSize ?? 100, 200));
        const dryRun = args.dryRun === true;

        const batch = await ctx.db
            .query('socialPosts')
            .withIndex('by_creation_time', (q: any) => q.gt('_creationTime', args.cursor ?? 0))
            .take(batchSize);

        let graduated = 0;
        let skipped = 0;
        const now = NOW();

        for (const post of batch) {
            const eligible =
                post.type === 'video' &&
                post.loopsTier === undefined &&
                (post.viewCount ?? 0) >= EXPLORATION_SAMPLE_SIZE;
            if (!eligible) {
                skipped += 1;
                continue;
            }
            if (!dryRun) {
                await ctx.db.patch(post._id, {
                    loopsTier: 'graduated',
                    loopsTierDecidedAt: now,
                    loopsTierCycles: 1,
                });
            }
            graduated += 1;
        }

        const isDone = batch.length < batchSize;
        const cursor = batch.length ? batch[batch.length - 1]._creationTime : (args.cursor ?? null);

        if (!dryRun && !isDone && args.chain) {
            await ctx.scheduler.runAfter(0, internal.migrations.loopsTierBackfill.backfillTiers, {
                cursor: cursor ?? undefined,
                batchSize,
                chain: true,
            });
        }

        return { dryRun, scanned: batch.length, graduated, skipped, cursor, isDone };
    },
});
