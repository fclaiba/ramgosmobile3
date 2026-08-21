/**
 * Graduación por etapas de Loops ("bandit-lite", Fase 3 del plan de ranking
 * dual — ver `docs/PLAN_ESTRATEGICO_MAESTRO.md` bitácora E-086).
 *
 * Sin datos logueados todavía para un bandit/ML real (este mismo sistema es
 * lo que empieza a producirlos), la exploración/graduación se aproxima con
 * un cron que grada por PERCENTIL dentro de cada lote — no contra un umbral
 * absoluto, para no tener que retunear a mano cuando cambien las normas de
 * engagement del catálogo.
 *
 * Mismo patrón self-scheduling/batcheado por `_creationTime` que
 * `internalRecomputeTagStats` (`convex/social/hashtags.ts`). Registrado en
 * `convex/crons.ts` cada 2 horas.
 */

import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { internal } from '../_generated/api';

const NOW = () => new Date().toISOString();

/** Vistas mínimas antes de que un video compita por graduación — por debajo
 *  de esto sigue en 'exploring' (sólo circula por su slot garantizado, ver
 *  `social.ts` → `getFeed` rama `mode:'videos'`). Punto de partida
 *  razonable, a recalibrar con datos reales — no es una constante derivada. */
export const EXPLORATION_SAMPLE_SIZE = 200;

/** Tope de ciclos sin cruzar ningún corte antes de graduar por default — no
 *  queda en limbo para siempre. */
const MAX_EXPLORATION_CYCLES = 3;

/** Eco reducido de los pesos de `scoreLoop` (a propósito: la graduación no
 *  debería poder contradecir filosóficamente al scorer que va a usar). */
const compositeRateOf = (post: any): number => {
    const views = Math.max(1, post.viewCount ?? 0);
    const completionRate = post.avgCompletionPct ?? 0.5;
    const likeRate = (post.likeCount ?? 0) / views;
    const shareRate = (post.shareCount ?? 0) / views;
    const rewatchRate = (post.totalLoopCount ?? 0) / views;
    const quickSkipRate = (post.quickSkipCount ?? 0) / views;
    return (
        completionRate * 0.4 +
        likeRate * 0.2 +
        shareRate * 0.25 +
        rewatchRate * 0.15 -
        quickSkipRate * 0.3
    );
};

export const internalGradeLoopsTier = internalMutation({
    args: {
        cursor: v.optional(v.number()),
        batchSize: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const batchSize = Math.max(1, Math.min(args.batchSize ?? 100, 200));

        const raw = await ctx.db
            .query('socialPosts')
            .withIndex('by_creation_time', (q: any) => q.gt('_creationTime', args.cursor ?? 0))
            .take(batchSize);

        const candidates = raw.filter(
            (p: any) =>
                p.type === 'video' &&
                !p.deletedAt &&
                (p.loopsTier === undefined || p.loopsTier === 'exploring') &&
                (p.viewCount ?? 0) >= EXPLORATION_SAMPLE_SIZE,
        );

        const graded = candidates
            .map((p: any) => ({ post: p, rate: compositeRateOf(p) }))
            .sort((a: any, b: any) => b.rate - a.rate);

        const topCut = Math.ceil(graded.length * 0.3);
        const bottomCut = Math.floor(graded.length * 0.15);
        const now = NOW();
        let graduated = 0;
        let suppressed = 0;
        let stillExploring = 0;

        for (let i = 0; i < graded.length; i++) {
            const { post } = graded[i];
            const cycles = (post.loopsTierCycles ?? 0) + 1;
            if (i < topCut) {
                await ctx.db.patch(post._id, {
                    loopsTier: 'graduated',
                    loopsTierDecidedAt: now,
                    loopsTierCycles: cycles,
                });
                graduated += 1;
            } else if (i >= graded.length - bottomCut) {
                await ctx.db.patch(post._id, {
                    loopsTier: 'suppressed',
                    loopsTierDecidedAt: now,
                    loopsTierCycles: cycles,
                });
                suppressed += 1;
            } else if (cycles >= MAX_EXPLORATION_CYCLES) {
                // No queda en limbo para siempre: gradúa por default.
                await ctx.db.patch(post._id, {
                    loopsTier: 'graduated',
                    loopsTierDecidedAt: now,
                    loopsTierCycles: cycles,
                });
                graduated += 1;
            } else {
                await ctx.db.patch(post._id, { loopsTierCycles: cycles });
                stillExploring += 1;
            }
        }

        const isDone = raw.length < batchSize;
        const cursor = raw.length ? raw[raw.length - 1]._creationTime : (args.cursor ?? null);

        if (!isDone) {
            await ctx.scheduler.runAfter(0, internal.social.loopsTiering.internalGradeLoopsTier, {
                cursor: cursor ?? undefined,
                batchSize,
            });
        }

        return {
            scanned: raw.length,
            evaluated: graded.length,
            graduated,
            suppressed,
            stillExploring,
            isDone,
        };
    },
});
