/**
 * Migración de un solo uso: split del cursor de reconciliación por modo.
 *
 * Antes de este merge (Stripe Connect bi-modal), `reconciliationCursor` tenía
 * una única fila fija con `scope = "stripe-bt"`. El código nuevo
 * (`convex/reconciliation.ts`, `cursorScope()`) busca/escribe por
 * `scope = "stripe-bt:live"` / `"stripe-bt:test"`. Sin esta migración, el
 * cron `stripe-bt-reconciliation` no encuentra fila para `"stripe-bt:live"`
 * en su primera corrida post-deploy, arranca desde cursor nulo, y
 * re-camina TODO el historial de `stripe.balanceTransactions.list` una vez
 * (potencialmente pesado en llamadas a la API de Stripe).
 *
 * Esta migración copia el valor de la fila vieja (`"stripe-bt"`) a una fila
 * nueva (`"stripe-bt:live"`) — no hace `patch` de la vieja, para preservarla
 * como registro histórico. No toca `"stripe-bt:test"`: nunca se reconcilió
 * test antes de este merge, así que arrancar limpio ahí es correcto.
 *
 * Uso (correr UNA vez contra prod, idealmente antes de que corra el cron
 * diario — ver horario en `convex/crons.ts`):
 *
 *   npx convex run migrations/reconciliationCursorScopeSplit:copyLegacyCursorToLive
 *
 * Verificación: la respuesta trae `{ copied, oldValue, newRowId }`. Confirmar
 * en el dashboard de Convex que la tabla `reconciliationCursor` tiene ahora
 * una fila `stripe-bt:live` con el mismo `lastBalanceTransactionId` que tenía
 * la fila vieja `stripe-bt`. Una vez confirmado que la reconciliación en
 * modo live viene andando bien por unos días, la fila vieja `stripe-bt`
 * (huérfana, inerte, nadie más la lee) puede borrarse a mano — este archivo
 * también puede borrarse en ese momento, es de un solo uso.
 */

import { internalMutation } from "../_generated/server";

const LEGACY_SCOPE = "stripe-bt";
const LIVE_SCOPE = "stripe-bt:live";

export const copyLegacyCursorToLive = internalMutation({
    args: {},
    handler: async (ctx) => {
        const legacy = await ctx.db
            .query("reconciliationCursor")
            .withIndex("by_scope", (q) => q.eq("scope", LEGACY_SCOPE))
            .first();

        if (!legacy) {
            return { copied: false, reason: "no_legacy_row" as const, oldValue: null, newRowId: null };
        }

        const existingLive = await ctx.db
            .query("reconciliationCursor")
            .withIndex("by_scope", (q) => q.eq("scope", LIVE_SCOPE))
            .first();

        if (existingLive) {
            // Ya corrió antes (o alguien insertó la fila live a mano) — no
            // pisamos nada, la migración es idempotente.
            return {
                copied: false,
                reason: "live_row_already_exists" as const,
                oldValue: legacy.lastBalanceTransactionId ?? null,
                newRowId: String(existingLive._id),
            };
        }

        const newRowId = await ctx.db.insert("reconciliationCursor", {
            scope: LIVE_SCOPE,
            lastBalanceTransactionId: legacy.lastBalanceTransactionId,
            lastRunAt: legacy.lastRunAt,
            runsCompleted: legacy.runsCompleted,
        });

        return {
            copied: true,
            reason: "ok" as const,
            oldValue: legacy.lastBalanceTransactionId ?? null,
            newRowId: String(newRowId),
        };
    },
});
