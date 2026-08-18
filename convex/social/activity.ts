/**
 * Bandeja de "Actividad" real (likes, comentarios, follows, menciones,
 * reposts, ventas). NO se deriva de `pushDeliveries`: esa tabla es un log de
 * auditoría de ENVÍOS de push — si el push falla o el usuario no tiene
 * token registrado, la interacción no queda registrada ahí, y tampoco tiene
 * estado de leído ni un `targetId` navegable. `socialActivity` es la fuente
 * de verdad de "qué pasó", separada de "qué se empujó al teléfono".
 */

import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { assertSocialActor, paginateQuery, socialViewer } from './_helpers';

const NOW = () => new Date().toISOString();

export type ActivityType =
    | 'like'
    | 'comment'
    | 'reply'
    | 'follow'
    | 'mention'
    | 'repost'
    | 'quote'
    | 'sale'
    | 'community_invite'
    | 'moderation'
    | 'match';

/**
 * Agrupa interacciones del mismo tipo sobre el mismo target en el mismo día
 * ("le gustó a Fran y 12 personas más") en vez de insertar una fila por
 * evento — así un post viral no genera cientos de filas de actividad.
 * `groupKey = tipo:targetId:día`. Se llama desde las mutations que generan
 * la interacción (toggleLike, addComment, follow, etc), nunca desde el
 * cliente directamente.
 */
export const recordActivity = async (
    ctx: any,
    args: {
        userId: string; // destinatario
        type: ActivityType;
        actorUserId?: string;
        targetType?: string;
        targetId?: string;
        preview?: string;
    },
): Promise<void> => {
    // Nadie recibe actividad de sí mismo (darte like a tu propio post, etc).
    if (args.actorUserId && args.actorUserId === args.userId) return;

    try {
        if (args.targetId) {
            const day = NOW().slice(0, 10);
            const groupKey = `${args.type}:${args.targetId}:${day}`;
            const existing = await ctx.db
                .query('socialActivity')
                .withIndex('by_user_group', (q: any) => q.eq('userId', args.userId).eq('groupKey', groupKey))
                .first();
            if (existing) {
                await ctx.db.patch(existing._id, {
                    groupCount: (existing.groupCount ?? 1) + 1,
                    actorUserId: args.actorUserId ?? existing.actorUserId,
                    createdAt: NOW(),
                    readAt: undefined, // reabre como no-leído al sumar un interactor nuevo
                });
                return;
            }
            await ctx.db.insert('socialActivity', {
                userId: args.userId,
                type: args.type,
                actorUserId: args.actorUserId,
                targetType: args.targetType,
                targetId: args.targetId,
                preview: args.preview,
                groupKey,
                groupCount: 1,
                createdAt: NOW(),
            });
            return;
        }

        await ctx.db.insert('socialActivity', {
            userId: args.userId,
            type: args.type,
            actorUserId: args.actorUserId,
            targetType: args.targetType,
            targetId: args.targetId,
            preview: args.preview,
            createdAt: NOW(),
        });
    } catch (e) {
        // La actividad es secundaria: si falla, no debe tumbar la mutation
        // social que la disparó (un like que no se pudo registrar en la
        // bandeja igual tiene que contarse como like).
        console.warn('[social.activity] recordActivity failed', e);
    }
};

export const listActivity = query({
    args: {
        sessionToken: v.optional(v.string()),
        filter: v.optional(v.union(v.literal('all'), v.literal('mentions'), v.literal('sales'))),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return { items: [], nextCursor: null };
        const page = await paginateQuery(
            ctx.db
                .query('socialActivity')
                .withIndex('by_user_created', (q: any) => q.eq('userId', actor.idString))
                .order('desc'),
            args.cursor,
            args.limit ?? 30,
        );
        const filter = args.filter ?? 'all';
        const items =
            filter === 'all'
                ? page.items
                : page.items.filter((i: any) =>
                      filter === 'mentions' ? i.type === 'mention' : i.type === 'sale',
                  );

        // Hidratar actor para mostrar avatar/nombre sin una segunda ida y
        // vuelta del cliente.
        const actorIds = Array.from(new Set(items.map((i: any) => i.actorUserId).filter(Boolean)));
        const actors = await Promise.all(
            actorIds.map((id: any) =>
                ctx.db.query('socialUsers').withIndex('by_user', (q: any) => q.eq('userId', id)).first(),
            ),
        );
        const actorMap = new Map(actorIds.map((id, i) => [id, actors[i]]));

        return {
            items: items.map((i: any) => ({ ...i, actor: i.actorUserId ? actorMap.get(i.actorUserId) ?? null : null })),
            nextCursor: page.nextCursor,
        };
    },
});

// `by_user_read` existe para el índice compuesto, pero comparar `eq` contra
// `undefined` en un range de índice no es un patrón usado en el resto del
// código: se prefiere el filtro en JS que ya usa `getFeed`/`decoratePosts`
// para campos opcionales (`.filter(q.eq(q.field(...), undefined))`), acotado
// por `take`. El orden desc por fecha hace que lo no leído esté siempre
// cerca del principio, así que la ventana acotada es una aproximación segura
// para un badge ("0 / algo / 99+"), no para un conteo exacto.
const UNREAD_SCAN_WINDOW = 200;

export const getUnreadActivityCount = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return { count: 0 };
        const rows = await ctx.db
            .query('socialActivity')
            .withIndex('by_user_created', (q: any) => q.eq('userId', actor.idString))
            .order('desc')
            .take(UNREAD_SCAN_WINDOW);
        return { count: rows.filter((r: any) => !r.readAt).length };
    },
});

export const markActivityRead = mutation({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const rows = await ctx.db
            .query('socialActivity')
            .withIndex('by_user_created', (q: any) => q.eq('userId', actor.idString))
            .order('desc')
            .take(UNREAD_SCAN_WINDOW);
        const unread = rows.filter((r: any) => !r.readAt);
        const now = NOW();
        await Promise.all(unread.map((r: any) => ctx.db.patch(r._id, { readAt: now })));
        return { marked: unread.length };
    },
});
