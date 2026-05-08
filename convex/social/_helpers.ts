// Shared utilities for the social module — kept apart from `social.ts` so
// they can be unit-tested in isolation and imported by future split files
// (e.g. `social/feed.ts`, `social/dm.ts`).

import { Id } from "../_generated/dataModel";
import { AuthActor, requireActor } from "../authHelpers";

// Re-exports requireActor with a domain-specific name so future blocking
// rules (suspended accounts, shadow-banned, etc.) can be added in one place
// without touching every social mutation/query.
export const assertSocialActor = async (
    ctx: any,
    fallbackActorId?: Id<"users"> | string,
): Promise<AuthActor> => {
    const actor = await requireActor(ctx, fallbackActorId);
    // Future: check `users.socialBanned` or moderation flags here.
    return actor;
};

// Stub — intentional. Block lists are not part of the v1 social model.
// The function is exported so call-sites already wire it in; switching
// from no-op to real check later is an internal change.
export const assertNotBlocked = async (
    _ctx: any,
    _byUserId: string,
    _targetUserId: string,
): Promise<void> => {
    return;
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
