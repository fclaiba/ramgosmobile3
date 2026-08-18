/**
 * Motor ÚNICO de escritura de puntos.
 *
 * Antes de esto había cuatro caminos para acreditar puntos y tres de ellos
 * eran públicos y aceptaban el monto desde el cliente (`economy.addPoints`,
 * `points.syncPointsState`, `points.addLedgerEntry`). Ahora toda escritura
 * pasa por acá, y el monto lo decide siempre el servidor.
 *
 * Es un helper TypeScript plano, no una mutation: las mutations de Convex no
 * pueden llamar `ctx.runMutation`, así que un `internalMutation` no serviría
 * para el 90% de los llamadores. `internalAwardPoints` (al final del archivo)
 * es el envoltorio fino para actions y webhooks, que sí necesitan una función.
 *
 * ── Idempotencia y tope diario en un solo mecanismo ───────────────────────
 * `eventKey` se codifica como `${kind}:${YYYY-MM-DD}:${entityId}`.
 *
 *   - Idempotencia: point-read exacto sobre el índice `by_user_event`.
 *   - Tope diario: range query sobre EL MISMO índice entre `${kind}:${día}:`
 *     y `${kind}:${día}:~` ('~' = 0x7E, mayor que todo carácter imprimible
 *     que usamos en los ids). Contar cuesta una lectura de rango, no un scan
 *     del ledger, y NO hace falta ningún índice nuevo.
 *
 * Por eso el formato del `eventKey` no es cosmético: es el índice.
 */

import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { ensureEconomyState, hydrateRewardsState, todayKey } from './pointsState';

/** Techo duro por acreditación individual. Nada legítimo se acerca. */
export const MAX_SINGLE_AWARD = 5000;

export type LedgerType = 'earn' | 'redeem' | 'convert' | 'challenge';
export type LedgerSource = 'purchase' | 'game' | 'referral' | 'bonus' | 'manual';

const ALLOWED_SOURCES = new Set<string>([
    'purchase',
    'game',
    'referral',
    'bonus',
    'manual',
]);

export type AwardOutcome = {
    awarded: number;
    balance: number;
    reason?: 'duplicate' | 'capped' | 'invalid';
};

/** `kind:YYYY-MM-DD:entityId` — ver el comentario de cabecera. */
export const buildEventKey = (kind: string, entityId: string, day: string = todayKey()) =>
    `${kind}:${day}:${entityId}`;

/** Cuántas veces se acreditó `kind` hoy, sin índices extra ni scans. */
export async function countDailyAwards(
    ctx: any,
    userId: string,
    kind: string,
    day: string = todayKey(),
): Promise<number> {
    const prefix = `${kind}:${day}:`;
    const rows = await ctx.db
        .query('pointsLedger')
        .withIndex('by_user_event', (q: any) =>
            q.eq('userId', userId).gte('eventKey', prefix).lt('eventKey', `${prefix}~`),
        )
        .collect();
    return rows.length;
}

export type AwardArgs = {
    userId: string;
    eventKey: string;
    amount: number;
    description: string;
    type?: LedgerType;
    source?: LedgerSource;
    metadata?: any;
    /** Si se pasan ambos, se aplica tope diario sobre `${kind}:${hoy}:*`. */
    dailyCapKind?: string;
    dailyCapMax?: number;
};

/**
 * Única puerta de escritura. Devuelve cuánto acreditó de verdad — el llamador
 * NO debe asumir que acreditó lo que pidió.
 */
export async function awardPoints(ctx: any, args: AwardArgs): Promise<AwardOutcome> {
    const doc = await ensureEconomyState(ctx, { userId: args.userId });
    const current = hydrateRewardsState(doc!.rewardsState);
    const balance = current.points || 0;

    const type: LedgerType = args.type ?? 'earn';
    const source: string = ALLOWED_SOURCES.has(args.source as string)
        ? (args.source as string)
        : 'bonus';

    // Monto: entero, acotado, y con el signo que corresponde al tipo.
    const raw = Math.trunc(Number(args.amount));
    if (!Number.isFinite(raw) || raw === 0) {
        return { awarded: 0, balance, reason: 'invalid' };
    }
    const signed = type === 'redeem' ? -Math.abs(raw) : Math.abs(raw);
    if (Math.abs(signed) > MAX_SINGLE_AWARD) {
        return { awarded: 0, balance, reason: 'invalid' };
    }
    // Un débito nunca puede dejar el saldo en negativo.
    if (signed < 0 && balance + signed < 0) {
        return { awarded: 0, balance, reason: 'invalid' };
    }

    // Idempotencia.
    const existing = await ctx.db
        .query('pointsLedger')
        .withIndex('by_user_event', (q: any) =>
            q.eq('userId', args.userId).eq('eventKey', args.eventKey),
        )
        .first();
    if (existing) return { awarded: 0, balance, reason: 'duplicate' };

    // Tope diario.
    if (args.dailyCapKind && typeof args.dailyCapMax === 'number') {
        const used = await countDailyAwards(ctx, args.userId, args.dailyCapKind);
        if (used >= args.dailyCapMax) return { awarded: 0, balance, reason: 'capped' };
    }

    const earn = signed > 0 ? signed : 0;
    const nextPoints = balance + signed;
    await ctx.db.patch(doc!._id, {
        rewardsState: {
            ...current,
            points: nextPoints,
            lifetimePoints: (current.lifetimePoints || 0) + earn,
        },
        updatedAt: new Date().toISOString(),
    });

    await ctx.db.insert('pointsLedger', {
        userId: args.userId,
        eventKey: args.eventKey,
        type: type as any,
        source: source as any,
        amount: signed,
        description: args.description,
        metadata: args.metadata,
        createdAt: new Date().toISOString(),
    });

    return { awarded: signed, balance: nextPoints };
}

/**
 * Clawback: descuenta una acreditación previa. Sin esto el ciclo
 * "publicar → cobrar → borrar → repetir" es dinero infinito.
 * Idempotente por su propio `eventKey` (`revoke:<original>`).
 */
export async function revokePoints(
    ctx: any,
    args: { userId: string; eventKey: string; reason: string },
): Promise<AwardOutcome> {
    const original = await ctx.db
        .query('pointsLedger')
        .withIndex('by_user_event', (q: any) =>
            q.eq('userId', args.userId).eq('eventKey', args.eventKey),
        )
        .first();

    const doc = await ensureEconomyState(ctx, { userId: args.userId });
    const current = hydrateRewardsState(doc!.rewardsState);
    const balance = current.points || 0;

    if (!original || original.amount <= 0) {
        return { awarded: 0, balance, reason: 'invalid' };
    }

    const revokeKey = `revoke:${args.eventKey}`;
    const already = await ctx.db
        .query('pointsLedger')
        .withIndex('by_user_event', (q: any) =>
            q.eq('userId', args.userId).eq('eventKey', revokeKey),
        )
        .first();
    if (already) return { awarded: 0, balance, reason: 'duplicate' };

    // El saldo puede haberse gastado; nunca lo dejamos negativo.
    const delta = -Math.min(original.amount, balance);
    const nextPoints = balance + delta;

    await ctx.db.patch(doc!._id, {
        rewardsState: {
            ...current,
            points: nextPoints,
            lifetimePoints: Math.max(0, (current.lifetimePoints || 0) - original.amount),
        },
        updatedAt: new Date().toISOString(),
    });

    await ctx.db.insert('pointsLedger', {
        userId: args.userId,
        eventKey: revokeKey,
        type: 'redeem' as any,
        source: (original.source ?? 'manual') as any,
        amount: delta,
        description: `Reversión: ${args.reason}`,
        metadata: { revokedEventKey: args.eventKey, originalAmount: original.amount },
        createdAt: new Date().toISOString(),
    });

    return { awarded: delta, balance: nextPoints };
}

/** Saldo canónico. Única lectura autorizada. */
export async function readCanonicalPoints(
    ctx: any,
    userId: string,
): Promise<{ balance: number; lifetimePoints: number }> {
    const doc = await ctx.db
        .query('economyState')
        .withIndex('by_user', (q: any) => q.eq('userId', userId))
        .first();
    const state = hydrateRewardsState(doc?.rewardsState);
    return { balance: state.points || 0, lifetimePoints: state.lifetimePoints || 0 };
}

/**
 * Envoltorio para llamadores que NO son mutations (actions, webhooks de
 * Stripe, schedulers). Interno a propósito: no existe versión pública.
 */
export const internalAwardPoints = internalMutation({
    args: {
        userId: v.string(),
        eventKey: v.string(),
        amount: v.number(),
        description: v.string(),
        type: v.optional(v.string()),
        source: v.optional(v.string()),
        metadata: v.optional(v.any()),
        dailyCapKind: v.optional(v.string()),
        dailyCapMax: v.optional(v.number()),
    },
    handler: async (ctx, args) =>
        awardPoints(ctx, {
            userId: args.userId,
            eventKey: args.eventKey,
            amount: args.amount,
            description: args.description,
            type: args.type as LedgerType | undefined,
            source: args.source as LedgerSource | undefined,
            metadata: args.metadata,
            dailyCapKind: args.dailyCapKind,
            dailyCapMax: args.dailyCapMax,
        }),
});

export const internalRevokePoints = internalMutation({
    args: { userId: v.string(), eventKey: v.string(), reason: v.string() },
    handler: async (ctx, args) => revokePoints(ctx, args),
});
