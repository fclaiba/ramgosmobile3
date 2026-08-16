// Shared utilities for the social module — kept apart from `social.ts` so
// they can be unit-tested in isolation and imported by future split files
// (e.g. `social/feed.ts`, `social/dm.ts`).

import { ConvexError } from "convex/values";
import { AuthActor, requireActor } from "../authHelpers";

// Re-exports requireActor with a domain-specific name so future blocking
// rules (suspended accounts, shadow-banned, etc.) can be added in one place
// without touching every social mutation/query.
export const assertSocialActor = async (
    ctx: any,
    sessionToken?: string,
): Promise<AuthActor> => {
    const actor = await requireActor(ctx, sessionToken);
    // Future: check `users.socialBanned` or moderation flags here.
    return actor;
};

// Bloqueo real (antes era un stub no-op). Dos point-reads sobre `by_pair`:
// el bloqueo corta en las dos direcciones, así que da igual quién bloqueó a
// quién — ninguno de los dos puede escribirle al otro.
export const assertNotBlocked = async (
    ctx: any,
    byUserId: string,
    targetUserId: string,
): Promise<void> => {
    if (byUserId === targetUserId) return;
    const [aToB, bToA] = await Promise.all([
        ctx.db
            .query('socialBlocks')
            .withIndex('by_pair', (q: any) =>
                q.eq('blockerUserId', byUserId).eq('blockedUserId', targetUserId),
            )
            .first(),
        ctx.db
            .query('socialBlocks')
            .withIndex('by_pair', (q: any) =>
                q.eq('blockerUserId', targetUserId).eq('blockedUserId', byUserId),
            )
            .first(),
    ]);
    if (aToB || bToA) {
        throw new ConvexError({
            code: 'FORBIDDEN',
            message: 'No es posible enviar mensajes a esta cuenta.',
        });
    }
};

export const isBlockedBetween = async (
    ctx: any,
    a: string,
    b: string,
): Promise<boolean> => {
    try {
        await assertNotBlocked(ctx, a, b);
        return false;
    } catch {
        return true;
    }
};

// Cursor-based pagination helper used across feed/comments/messages queries.
// Convex queries accept a string cursor; here we standardize the shape so
// the frontend can paginate every social list with the same UX.
export type PageResult<T> = {
    items: T[];
    nextCursor: string | null;
};

export const paginateQuery = async <T>(
    queryBuilder: any,
    cursor: string | null | undefined,
    limit: number,
): Promise<PageResult<T>> => {
    const safeLimit = Math.max(1, Math.min(limit ?? 20, 100));
    const result = await queryBuilder.paginate({
        cursor: cursor ?? null,
        numItems: safeLimit,
    });
    return {
        items: result.page as T[],
        nextCursor: result.isDone ? null : (result.continueCursor as string | null),
    };
};

// Throttle helper: returns true if a "similar" notification was already
// dispatched within `windowMs` ms for the same (userId, category, key).
// Used in social to avoid spamming an author with one push per like.
export const wasNotifiedRecently = async (
    ctx: any,
    userId: string,
    category: string,
    titleSubstring: string,
    windowMs: number,
): Promise<boolean> => {
    try {
        const cutoff = new Date(Date.now() - windowMs).toISOString();
        const recent = await ctx.db
            .query('pushDeliveries')
            .withIndex('by_user_category', (q: any) => q.eq('userId', userId).eq('category', category))
            .filter((q: any) => q.gt(q.field('sentAt'), cutoff))
            .collect();
        return recent.some((r: any) => r.title?.includes(titleSubstring));
    } catch (e) {
        return false;
    }
};
