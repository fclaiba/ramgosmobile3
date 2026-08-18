/**
 * Unificación del saldo de puntos.
 *
 * `economyState` tenía DOS saldos que nadie reconciliaba:
 *
 *   - `rewardsState.points`   — lo escribe y lee toda `convex/economy.ts`
 *                               (compras, desafíos, ruleta, alta con referido).
 *   - `pointsState.balance`   — lo leían `rewards.getMyPoints` y
 *                               `points.getPointsState`, y lo escribían el
 *                               código muerto de `rewards.ts` y la mutation
 *                               pública `points.syncPointsState`.
 *
 * ── Por qué el canónico es `rewardsState.points` y NO la suma de ambos ────
 * Sumar parece lo generoso, pero `pointsState.balance` era escribible desde
 * el cliente (`syncPointsState` aceptaba `pointsState: v.any()` y lo
 * parcheaba sin validar). Sumarlo importaría a la contabilidad definitiva
 * cualquier saldo inventado. `rewardsState.points`, en cambio, sólo se movió
 * por caminos del servidor y tiene su contrapartida en `pointsLedger`.
 *
 * Entonces: `rewardsState.points` gana y `pointsState` se retira. No se lo
 * convierte en un espejo vivo porque ya no queda NADIE que lo lea
 * (`rewards.getMyPoints` y `points.getPointsState` pasaron a
 * `readCanonicalPoints`), y un espejo sin lector sólo garantiza deriva. Se lo
 * reemplaza por una lápida que conserva el valor viejo para auditoría.
 *
 * Para que nada desaparezca en silencio, el `dryRun` reporta cada fila donde
 * `pointsState.balance` era mayor que el canónico —las únicas que "pierden"
 * algo visible— y las lista en `divergences` para revisarlas antes de aplicar.
 *
 *   npx convex run migrations/pointsUnification:unifyPoints '{"dryRun":true}'
 *   npx convex run migrations/pointsUnification:unifyPoints '{"chain":true}'
 *   npx convex run migrations/pointsUnification:unifyPointsStatus
 */

import { v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';
import { internal } from '../_generated/api';
import { hydrateRewardsState } from '../economy/pointsState';

const MIGRATION_NAME = 'pointsUnification.v1';

const canonicalOf = (row: any) => {
    const state = hydrateRewardsState(row.rewardsState);
    return { points: state.points || 0, lifetimePoints: state.lifetimePoints || 0 };
};

const mirrorOf = (row: any) => Number(row.pointsState?.balance ?? 0) || 0;

export const unifyPoints = internalMutation({
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
            .query('economyState')
            .withIndex('by_creation_time', (q: any) => q.gt('_creationTime', args.cursor ?? 0))
            .take(batchSize);

        let mirrored = 0;
        let alreadyInSync = 0;
        let divergent = 0;
        const divergences: any[] = [];

        for (const row of batch) {
            const canonical = canonicalOf(row);
            const mirror = mirrorOf(row);

            if (row.pointsState?.deprecated === true) {
                alreadyInSync += 1;
                continue;
            }

            // Sólo importan las filas donde el espejo tenía MÁS: son las
            // únicas donde la unificación resta algo visible para el usuario.
            if (mirror > canonical.points) {
                divergent += 1;
                divergences.push({
                    userId: row.userId,
                    canonical: canonical.points,
                    mirror,
                    delta: mirror - canonical.points,
                });
            }

            if (!dryRun) {
                await ctx.db.patch(row._id, {
                    pointsState: {
                        deprecated: true,
                        canonicalField: 'rewardsState.points',
                        // Se conserva el valor viejo por si hay que auditar
                        // una diferencia con un usuario.
                        legacyBalance: mirror,
                        canonicalAtMigration: canonical.points,
                        migratedAt: new Date().toISOString(),
                    },
                    updatedAt: new Date().toISOString(),
                });
            }
            mirrored += 1;
        }

        const isDone = batch.length < batchSize;
        const cursor = batch.length ? batch[batch.length - 1]._creationTime : (args.cursor ?? null);

        if (!dryRun) {
            const now = new Date().toISOString();
            const state = await ctx.db
                .query('migrationState')
                .withIndex('by_name', (q: any) => q.eq('name', MIGRATION_NAME))
                .first();
            const stats = { mirrored, alreadyInSync, divergent };
            if (state) {
                await ctx.db.patch(state._id, {
                    cursor,
                    processed: state.processed + batch.length,
                    isDone,
                    updatedAt: now,
                    stats,
                });
            } else {
                await ctx.db.insert('migrationState', {
                    name: MIGRATION_NAME,
                    cursor,
                    processed: batch.length,
                    isDone,
                    startedAt: now,
                    updatedAt: now,
                    stats,
                });
            }

            if (!isDone && args.chain) {
                await ctx.scheduler.runAfter(0, internal.migrations.pointsUnification.unifyPoints, {
                    cursor: cursor ?? undefined,
                    batchSize,
                    chain: true,
                });
            }
        }

        return {
            dryRun,
            scanned: batch.length,
            mirrored,
            alreadyInSync,
            divergent,
            divergences: divergences.slice(0, 50),
            cursor,
            isDone,
        };
    },
});

/** Después de correr, `stillDivergent` tiene que dar 0. */
export const unifyPointsStatus = internalQuery({
    args: { scanLimit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const state = await ctx.db
            .query('migrationState')
            .withIndex('by_name', (q: any) => q.eq('name', MIGRATION_NAME))
            .first();

        const rows = await ctx.db
            .query('economyState')
            .take(Math.min(args.scanLimit ?? 2000, 4000));

        let pendingRows = 0;
        let legacyBalanceAhead = 0;
        let totalCanonical = 0;

        for (const row of rows) {
            const canonical = canonicalOf(row);
            totalCanonical += canonical.points;
            if (row.pointsState?.deprecated !== true) {
                pendingRows += 1;
                if (mirrorOf(row) > canonical.points) legacyBalanceAhead += 1;
            }
        }

        return {
            ran: !!state,
            isDone: state?.isDone ?? false,
            processed: state?.processed ?? 0,
            updatedAt: state?.updatedAt ?? null,
            scannedRows: rows.length,
            /** Debe dar 0 después de correr con `chain: true`. */
            pendingRows,
            legacyBalanceAhead,
            totalCanonical,
        };
    },
});

/**
 * Control de integridad independiente de la migración: para cada usuario,
 * ¿la suma de su `pointsLedger` coincide con su saldo canónico? Una
 * diferencia indica una escritura que no pasó por el motor de puntos.
 */
export const auditLedgerConsistency = internalQuery({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const rows = await ctx.db.query('economyState').take(Math.min(args.limit ?? 200, 500));
        const mismatches: any[] = [];

        for (const row of rows) {
            const canonical = canonicalOf(row).points;
            const ledger = await ctx.db
                .query('pointsLedger')
                .withIndex('by_user', (q: any) => q.eq('userId', row.userId))
                .collect();
            const sum = ledger.reduce((acc: number, e: any) => acc + (Number(e.amount) || 0), 0);
            if (sum !== canonical) {
                mismatches.push({
                    userId: row.userId,
                    canonical,
                    ledgerSum: sum,
                    delta: canonical - sum,
                    ledgerRows: ledger.length,
                });
            }
        }

        return { scanned: rows.length, mismatches: mismatches.slice(0, 50), count: mismatches.length };
    },
});
