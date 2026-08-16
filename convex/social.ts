/**
 * Social module — backend for posts, stories, follows, comments, likes, DMs.
 *
 * Replaces the previous client-side `SocialContext.tsx` mock that lived in
 * AsyncStorage. Posts now persist server-side, like/follow are reactive
 * across devices, and DMs work in real time via Convex `useQuery`.
 *
 * Auth model: every mutation/query goes through `assertSocialActor` which
 * delegates to `requireActor` for now. Future moderation hooks (suspended
 * accounts, shadowbans) plug into that helper without touching call sites.
 *
 * Push integration: `follow`, `addComment`, `toggleLike` (post-only,
 * throttled), and `sendDirectMessage` schedule a `notifications.notifyUser`
 * action so the recipient gets an Expo push.
 *
 * Pagination: feed/comments/messages return `{ items, nextCursor }`. The
 * frontend can call `getFeed({ cursor })` until `nextCursor === null`.
 */

import { v } from 'convex/values';
import { Id } from './_generated/dataModel';
import { requireActor } from './authHelpers';
import {
    mutation,
    query,
    internalQuery,
    internalMutation,
    internalAction,
} from './_generated/server';
import { api, internal } from './_generated/api';
import { assertSocialActor, paginateQuery } from './social/_helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = () => new Date().toISOString();
const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const LIKE_PUSH_THROTTLE_MS = 60 * 60 * 1000; // 1 push/hour/target/recipient

const sortedKey = (ids: string[]) => [...ids].sort().join(':');

const ensureSocialUser = async (
    ctx: any,
    userId: string,
    seedFromAuth?: { name?: string; email?: string; avatar?: string },
) => {
    const existing = await ctx.db
        .query('socialUsers')
        .withIndex('by_user', (q: any) => q.eq('userId', userId))
        .first();
    if (existing) return existing;

    // Seed a social profile lazily on first interaction. The username
    // derives from email or a fallback random suffix; the user can edit
    // via `upsertSocialProfile` later.
    const seedName = seedFromAuth?.name ?? 'Usuario';
    const baseHandle =
        (seedFromAuth?.email?.split('@')[0]?.toLowerCase() ??
            seedName.replace(/\s+/g, '').toLowerCase())
            .replace(/[^a-z0-9_]/g, '')
            .slice(0, 20) || `user_${Date.now().toString(36)}`;

    let handle = baseHandle;
    let attempt = 0;
    while (
        await ctx.db
            .query('socialUsers')
            .withIndex('by_username', (q: any) => q.eq('username', handle))
            .first()
    ) {
        attempt += 1;
        handle = `${baseHandle}_${attempt}`;
        if (attempt > 20) {
            handle = `${baseHandle}_${Date.now().toString(36)}`;
            break;
        }
    }

    const now = NOW();
    const id = await ctx.db.insert('socialUsers', {
        userId,
        username: handle,
        displayName: seedName,
        avatar: seedFromAuth?.avatar,
        followerCount: 0,
        followingCount: 0,
        postCount: 0,
        verified: false,
        isInfluencer: false,
        createdAt: now,
        updatedAt: now,
    });
    return await ctx.db.get(id);
};

/** Load auth user row for seeding a lazy socialUsers profile. */
const loadUserSeed = async (ctx: any, userId: string) => {
    const normId = ctx.db.normalizeId('users', userId);
    const user = normId ? await ctx.db.get(normId) : null;
    if (!user) return undefined;
    return {
        name: user.name || user.nickname || undefined,
        email: user.email || undefined,
        avatar: user.avatar || undefined,
    };
};

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const upsertSocialProfile = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        username: v.optional(v.string()),
        displayName: v.optional(v.string()),
        bio: v.optional(v.string()),
        avatar: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);

        const profile = await ensureSocialUser(ctx, actor.idString, {
            name: args.displayName,
            email: actor.email,
            avatar: args.avatar,
        });

        const patch: Record<string, any> = { updatedAt: NOW() };
        if (args.username) {
            const lowered = args.username.toLowerCase().replace(/[^a-z0-9_]/g, '');
            if (lowered.length < 3) throw new Error('Username debe tener 3+ caracteres.');
            const conflict = await ctx.db
                .query('socialUsers')
                .withIndex('by_username', (q) => q.eq('username', lowered))
                .first();
            if (conflict && conflict._id !== profile!._id) {
                throw new Error('Username ya está en uso.');
            }
            patch.username = lowered;
        }
        if (args.displayName !== undefined) patch.displayName = args.displayName;
        if (args.bio !== undefined) patch.bio = args.bio;
        if (args.avatar !== undefined) patch.avatar = args.avatar;

        await ctx.db.patch(profile!._id, patch);
        return profile!._id;
    },
});

export const lookupUserSocial = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.optional(v.string()),
        username: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Gracefully return null if no valid session — this is a read-only
        // query and should never crash the app's error boundary.
        try {
            await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return null;
        }

        let profile: any = null;
        if (args.userId) {
            profile = await ctx.db
                .query('socialUsers')
                .withIndex('by_user', (q) => q.eq('userId', args.userId!))
                .first();
        } else if (args.username) {
            profile = await ctx.db
                .query('socialUsers')
                .withIndex('by_username', (q) => q.eq('username', args.username!.toLowerCase()))
                .first();
        }
        return profile ?? null;
    },
});

/** Public counters for commercial / hybrid profiles (no session required). */
export const getPublicSocialStats = query({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        const profile = await ctx.db
            .query('socialUsers')
            .withIndex('by_user', (q) => q.eq('userId', args.userId))
            .first();
        if (!profile) {
            return {
                followerCount: 0,
                followingCount: 0,
                postCount: 0,
                username: null as string | null,
            };
        }
        return {
            followerCount: profile.followerCount ?? 0,
            followingCount: profile.followingCount ?? 0,
            postCount: profile.postCount ?? 0,
            username: profile.username ?? null,
        };
    },
});

export const searchUsers = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        term: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        await assertSocialActor(ctx, (args as any).sessionToken);
        const term = args.term.trim().toLowerCase();
        if (!term) return [];

        const cap = Math.min(args.limit ?? 20, 50);
        const results = await ctx.db
            .query('socialUsers')
            .withSearchIndex('search_username', (q) => q.search('username', term))
            .take(cap);
        return results;
    },
});

export const getSuggestedUsers = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
        const cap = Math.min(args.limit ?? 10, 20);
        
        const follows = await ctx.db
            .query('socialFollows')
            .withIndex('by_follower', (q) => q.eq('followerUserId', actor.idString))
            .collect();
        const followingIds = new Set(follows.map((f: any) => f.followeeUserId));
        followingIds.add(actor.idString);

        // Fetch up to 100 users, filter out already following/self, sort by followers
        const users = await ctx.db.query('socialUsers').take(100);
        const suggested = users
            .filter((u: any) => !followingIds.has(u.userId))
            .sort((a: any, b: any) => (b.followerCount ?? 0) - (a.followerCount ?? 0))
            .slice(0, cap);
            
        return suggested;
    },
});

export const getUsersByIds = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userIds: v.array(v.string()),
    },
    handler: async (ctx, args) => {
        try {
            await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
        if (args.userIds.length === 0) return [];

        const profiles = await Promise.all(
            args.userIds.map((id) =>
                ctx.db
                    .query('socialUsers')
                    .withIndex('by_user', (q: any) => q.eq('userId', id))
                    .first(),
            ),
        );
        return profiles.filter(Boolean);
    },
});

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export const createPost = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        type: v.union(
            v.literal('text'),
            v.literal('image'),
            v.literal('video'),
            v.literal('poll'),
            v.literal('commercial'),
        ),
        content: v.string(),
        images: v.optional(v.array(v.string())),
        videoUrl: v.optional(v.string()),
        poll: v.optional(v.object({
            options: v.array(v.object({
                id: v.string(),
                text: v.string(),
            })),
            durationHours: v.optional(v.number()),
        })),
        commercialProduct: v.optional(v.object({
            listingId: v.optional(v.string()),
            name: v.string(),
            price: v.number(),
            image: v.optional(v.string()),
            commission: v.optional(v.number()),
            referralLink: v.optional(v.string()),
            type: v.optional(v.string()),
            location: v.optional(v.string()),
            description: v.optional(v.string()),
            discountPercent: v.optional(v.number()),
        })),
        attachedListingId: v.optional(v.id('listings')),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        await ensureSocialUser(ctx, actor.idString, { name: actor.email, email: actor.email });

        const now = NOW();
        const pollPayload = args.poll
            ? {
                options: args.poll.options.map((o) => ({ ...o, votes: 0 })),
                totalVotes: 0,
                endsAt: new Date(
                    Date.now() + (args.poll.durationHours ?? 24) * 3600_000,
                ).toISOString(),
                voters: [],
            }
            : undefined;

        let finalCommercialProduct = args.commercialProduct;
        
        if (args.attachedListingId) {
            const listing = await ctx.db.get(args.attachedListingId);
            if (listing) {
                finalCommercialProduct = {
                    listingId: listing._id,
                    name: listing.title,
                    price: listing.price,
                    image:
                        listing.images?.find((i: any) => i.isPrimary)?.url ??
                        listing.images?.[0]?.url ??
                        listing.image ??
                        listing.gallery?.[0],
                    type: listing.type,
                    description: listing.description,
                    // Commission the creator earns if the seller opened this
                    // listing to promotion; the payment path re-resolves it.
                    commission: listing.openPromotion === true
                        ? listing.openCommissionRate
                        : undefined,
                    discountPercent: listing.discountPercent,
                };
            }
        }

        // Stamp the author's country so the feed can rank commercial posts
        // locally without re-reading the profile for every candidate.
        const authorProfile = await ctx.db
            .query('socialUsers')
            .withIndex('by_user', (q) => q.eq('userId', actor.idString))
            .first();

        const postId = await ctx.db.insert('socialPosts', {
            authorUserId: actor.idString,
            type: args.type,
            content: args.content,
            images: args.images,
            videoUrl: args.videoUrl,
            poll: pollPayload,
            commercialProduct: finalCommercialProduct,
            likeCount: 0,
            commentCount: 0,
            retweetCount: 0,
            viewCount: 0,
            geoCountry: (authorProfile as any)?.country ?? undefined,
            createdAt: now,
        });

        // Bump postCount on the social profile.
        if (authorProfile) {
            await ctx.db.patch(authorProfile._id, {
                postCount: authorProfile.postCount + 1,
                updatedAt: now,
            });
        }

        return postId;
    },
});

export const deletePost = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postId: v.id('socialPosts'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const post = await ctx.db.get(args.postId);
        if (!post) throw new Error('Post no encontrado.');
        const isAuthor = post.authorUserId === actor.idString;
        const isAdmin = actor.role === 'admin' || actor.role === 'developer';
        if (!isAuthor && !isAdmin) throw new Error('No autorizado.');
        await ctx.db.patch(args.postId, { deletedAt: NOW() });
    },
});

export const votePoll = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postId: v.id('socialPosts'),
        optionId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const post = await ctx.db.get(args.postId);
        if (!post) throw new Error('Post no encontrado.');
        if (!post.poll) throw new Error('Este post no es una encuesta.');
        const voters: any[] = post.poll.voters ?? [];
        if (voters.some((vt: any) => vt.userId === actor.idString)) {
            throw new Error('Ya votaste en esta encuesta.');
        }
        if (new Date(post.poll.endsAt).getTime() < Date.now()) {
            throw new Error('La encuesta ya finalizó.');
        }
        const updatedOptions = post.poll.options.map((opt: any) =>
            opt.id === args.optionId ? { ...opt, votes: opt.votes + 1 } : opt,
        );
        await ctx.db.patch(args.postId, {
            poll: {
                ...post.poll,
                options: updatedOptions,
                totalVotes: post.poll.totalVotes + 1,
                voters: [...voters, { userId: actor.idString, optionId: args.optionId }],
            },
        });
    },
});

/**
 * Uploads are stored as `convex-storage:<id>`, which is not a URL any
 * `<Image>` or `<VideoView>` can load. Every read path that hands media to the
 * client has to swap it for the signed HTTPS URL first.
 */
const resolveMediaUrl = async (ctx: any, raw?: string | null) => {
    if (!raw) return raw ?? undefined;
    if (!raw.startsWith('convex-storage:')) return raw;
    try {
        const url = await ctx.storage.getUrl(raw.replace('convex-storage:', ''));
        return url ?? raw;
    } catch {
        return raw;
    }
};

/**
 * Hydrates a page of posts with the author profile, the viewer's own
 * like/save state, and playable media URLs. Without this the client cannot
 * paint a correct heart on first render and has to issue one query per post to
 * find out — and images/videos would never load.
 */
const decoratePosts = async (ctx: any, posts: any[], viewerId: string) => {
    if (posts.length === 0) return [];

    const authorIds = Array.from(new Set(posts.map((p) => p.authorUserId))) as string[];
    const authorProfiles = await Promise.all(
        authorIds.map((id) =>
            ctx.db
                .query('socialUsers')
                .withIndex('by_user', (q: any) => q.eq('userId', id))
                .first(),
        ),
    );
    const authorMap = new Map<string, any>();
    authorProfiles.forEach((p, i) => {
        if (p) authorMap.set(authorIds[i], p);
    });

    const [likeRows, saveRows] = await Promise.all([
        Promise.all(
            posts.map((p) =>
                ctx.db
                    .query('socialLikes')
                    .withIndex('by_user_target', (q: any) =>
                        q
                            .eq('userId', viewerId)
                            .eq('targetType', 'post')
                            .eq('targetId', String(p._id)),
                    )
                    .first(),
            ),
        ),
        Promise.all(
            posts.map((p) =>
                ctx.db
                    .query('socialSavedPosts')
                    .withIndex('by_user_post', (q: any) =>
                        q.eq('userId', viewerId).eq('postId', String(p._id)),
                    )
                    .first(),
            ),
        ),
    ]);

    // Resolve every author avatar once, not once per post.
    await Promise.all(
        Array.from(authorMap.entries()).map(async ([id, a]: [string, any]) => {
            authorMap.set(id, { ...a, avatar: await resolveMediaUrl(ctx, a.avatar) });
        }),
    );

    return await Promise.all(
        posts.map(async (post, i) => ({
            ...post,
            viewCount: post.viewCount ?? 0,
            images: post.images
                ? await Promise.all(
                      post.images.map((img: string) => resolveMediaUrl(ctx, img)),
                  )
                : post.images,
            videoUrl: await resolveMediaUrl(ctx, post.videoUrl),
            commercialProduct: post.commercialProduct
                ? {
                      ...post.commercialProduct,
                      image: await resolveMediaUrl(ctx, post.commercialProduct.image),
                  }
                : post.commercialProduct,
            author: authorMap.get(post.authorUserId) ?? null,
            isLikedByMe: Boolean(likeRows[i]),
            isSavedByMe: Boolean(saveRows[i]),
        })),
    );
};

/**
 * Ranking for the "forYou" mode. Recency is the spine; engagement lifts a
 * post and, per the social-commerce spec, commercial posts are boosted only
 * when they are local to the viewer — social content stays borderless.
 */
const scorePost = (
    post: any,
    opts: { affinityAuthors: Set<string>; viewerCountry?: string; nowMs: number },
) => {
    const ageHours = Math.max(0, (opts.nowMs - Date.parse(post.createdAt)) / 3_600_000);
    // Half-life of ~18h keeps the feed fresh without burying the first page.
    let score = 100 / (1 + ageHours / 18);

    const engagement = (post.likeCount ?? 0) * 2 + (post.commentCount ?? 0) * 3;
    score += Math.log1p(engagement) * 6;

    if (opts.affinityAuthors.has(post.authorUserId)) score += 25;

    if (post.commercialProduct) {
        const sameCountry =
            opts.viewerCountry && post.geoCountry
                ? post.geoCountry === opts.viewerCountry
                : true; // unknown geo → neither boosted nor punished
        score += sameCountry ? 15 : -40;
    }
    return score;
};

const FOLLOW_FANOUT_CAP = 200;

export const getFeed = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
        authorUserId: v.optional(v.string()),
        mode: v.optional(
            v.union(
                v.literal('forYou'),
                v.literal('following'),
                v.literal('videos'),
                v.literal('recent'),
            ),
        ),
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return { items: [], nextCursor: null };
        }
        const viewerId = actor.idString;
        const cap = Math.min(args.limit ?? 20, 50);
        const cursor = args.cursor ?? undefined;
        const mode = args.mode ?? (args.authorUserId ? 'recent' : 'forYou');

        // Every mode uses the same `createdAt` cursor so the client paginates
        // identically regardless of which tab it is on.
        const olderThan = (q: any, field = 'createdAt') =>
            cursor ? q.lt(field, cursor) : q;

        let candidates: any[] = [];

        if (args.authorUserId) {
            candidates = await ctx.db
                .query('socialPosts')
                .withIndex('by_author_created', (q: any) =>
                    olderThan(q.eq('authorUserId', args.authorUserId!)),
                )
                .order('desc')
                .filter((q: any) => q.eq(q.field('deletedAt'), undefined))
                .take(cap);
        } else if (mode === 'videos') {
            candidates = await ctx.db
                .query('socialPosts')
                .withIndex('by_type_created', (q: any) => olderThan(q.eq('type', 'video')))
                .order('desc')
                .filter((q: any) => q.eq(q.field('deletedAt'), undefined))
                .take(cap);
        } else if (mode === 'following') {
            const follows = await ctx.db
                .query('socialFollows')
                .withIndex('by_follower', (q: any) => q.eq('followerUserId', viewerId))
                .take(FOLLOW_FANOUT_CAP);
            const authors = Array.from(
                new Set([viewerId, ...follows.map((f: any) => f.followeeUserId)]),
            );
            const perAuthor = await Promise.all(
                authors.map((a) =>
                    ctx.db
                        .query('socialPosts')
                        .withIndex('by_author_created', (q: any) => olderThan(q.eq('authorUserId', a)))
                        .order('desc')
                        .filter((q: any) => q.eq(q.field('deletedAt'), undefined))
                        .take(cap),
                ),
            );
            candidates = perAuthor
                .flat()
                .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1))
                .slice(0, cap);
        } else if (mode === 'forYou') {
            // Pull a wider window than we return, then rank it. Over-fetching
            // 3x keeps ranking meaningful without unbounded reads.
            const pool = await ctx.db
                .query('socialPosts')
                .withIndex('by_created', (q: any) => olderThan(q))
                .order('desc')
                .filter((q: any) => q.eq(q.field('deletedAt'), undefined))
                .take(Math.min(cap * 3, 90));

            const recentLikes = await ctx.db
                .query('socialLikes')
                .withIndex('by_user_target', (q: any) =>
                    q.eq('userId', viewerId).eq('targetType', 'post'),
                )
                .order('desc')
                .take(50);
            const likedPosts = await Promise.all(
                recentLikes.map((l: any) => {
                    const id = ctx.db.normalizeId('socialPosts', l.targetId);
                    return id ? ctx.db.get(id) : null;
                }),
            );
            const affinityAuthors = new Set<string>(
                likedPosts.filter(Boolean).map((p: any) => p.authorUserId),
            );

            const viewer = await ctx.db
                .query('socialUsers')
                .withIndex('by_user', (q: any) => q.eq('userId', viewerId))
                .first();
            const viewerCountry = (viewer as any)?.country ?? undefined;

            const nowMs = Date.now();
            candidates = pool
                .map((p: any) => ({
                    post: p,
                    score: scorePost(p, { affinityAuthors, viewerCountry, nowMs }),
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, cap)
                .map((x) => x.post);

            // The cursor must stay chronological even though the page is
            // ranked, otherwise pagination would loop over the same window.
            const items = await decoratePosts(ctx, candidates, viewerId);
            const oldestInPool = pool.length ? pool[pool.length - 1].createdAt : null;
            return {
                items,
                nextCursor: pool.length < Math.min(cap * 3, 90) ? null : oldestInPool,
            };
        } else {
            candidates = await ctx.db
                .query('socialPosts')
                .withIndex('by_created', (q: any) => olderThan(q))
                .order('desc')
                .filter((q: any) => q.eq(q.field('deletedAt'), undefined))
                .take(cap);
        }

        const items = await decoratePosts(ctx, candidates, viewerId);
        const nextCursor =
            candidates.length < cap ? null : candidates[candidates.length - 1].createdAt;

        return { items, nextCursor };
    },
});

/**
 * Idempotent impression counter. The client batches these (one call per
 * post that actually became visible), so a duplicate is cheap and silent.
 */
export const addView = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postIds: v.array(v.id('socialPosts')),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        let counted = 0;
        for (const postId of args.postIds.slice(0, 50)) {
            const existing = await ctx.db
                .query('socialPostViews')
                .withIndex('by_post_viewer', (q: any) =>
                    q.eq('postId', String(postId)).eq('viewerUserId', actor.idString),
                )
                .first();
            if (existing) continue;

            const post = await ctx.db.get(postId);
            if (!post || post.deletedAt) continue;

            await ctx.db.insert('socialPostViews', {
                postId: String(postId),
                viewerUserId: actor.idString,
                createdAt: NOW(),
            });
            await ctx.db.patch(postId, { viewCount: (post.viewCount ?? 0) + 1 });
            counted += 1;
        }
        return { counted };
    },
});

export const getPostById = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postId: v.id('socialPosts'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const post = await ctx.db.get(args.postId);
        if (!post || post.deletedAt) return null;
        const [decorated] = await decoratePosts(ctx, [post], actor.idString);
        return decorated;
    },
});

export const getPostsByUser = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const cap = Math.min(args.limit ?? 50, 200);
        const posts = await ctx.db
            .query('socialPosts')
            .withIndex('by_author', (q) => q.eq('authorUserId', args.userId))
            .order('desc')
            .take(cap);
        const items = await decoratePosts(
            ctx,
            posts.filter((p: any) => !p.deletedAt),
            actor.idString,
        );
        return { items };
    },
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export const addComment = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postId: v.id('socialPosts'),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const post = await ctx.db.get(args.postId);
        if (!post || post.deletedAt) throw new Error('Post no encontrado.');

        const now = NOW();
        const commentId = await ctx.db.insert('socialComments', {
            postId: String(args.postId),
            authorUserId: actor.idString,
            content: args.content,
            likeCount: 0,
            createdAt: now,
        });
        await ctx.db.patch(args.postId, {
            commentCount: post.commentCount + 1,
        });

        // Notify post author (skip if self-comment).
        if (post.authorUserId !== actor.idString) {
            const preview = args.content.length > 80 ? args.content.slice(0, 77) + '…' : args.content;
            await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: post.authorUserId,
                title: 'Nuevo comentario en tu post',
                body: preview,
                category: 'social',
                data: { type: 'comment', postId: String(args.postId), commentId: String(commentId) },
            });
        }
        return commentId;
    },
});

export const deleteComment = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        commentId: v.id('socialComments'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const comment = await ctx.db.get(args.commentId);
        if (!comment) throw new Error('Comentario no encontrado.');
        const isAuthor = comment.authorUserId === actor.idString;
        const isAdmin = actor.role === 'admin' || actor.role === 'developer';
        if (!isAuthor && !isAdmin) throw new Error('No autorizado.');
        await ctx.db.patch(args.commentId, { deletedAt: NOW() });
        const post = await ctx.db.get(comment.postId as any);
        if (post) {
            await ctx.db.patch(post._id, {
                commentCount: Math.max(0, (post as any).commentCount - 1),
            });
        }
    },
});

export const getCommentsForPost = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postId: v.id('socialPosts'),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        try {
            await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return { items: [], nextCursor: null };
        }
        const cap = Math.min(args.limit ?? 50, 100);
        const result = await ctx.db
            .query('socialComments')
            .withIndex('by_post_created', (q) => q.eq('postId', String(args.postId)))
            .order('desc')
            .paginate({ cursor: args.cursor ?? null, numItems: cap });

        const visible = result.page.filter((c: any) => !c.deletedAt);
        const authorIds = Array.from(new Set(visible.map((c: any) => c.authorUserId)));
        const authors = await Promise.all(
            authorIds.map((id: string) =>
                ctx.db
                    .query('socialUsers')
                    .withIndex('by_user', (q: any) => q.eq('userId', id))
                    .first(),
            ),
        );
        const map = new Map<string, any>();
        authors.forEach((a, i) => { if (a) map.set(authorIds[i], a); });

        return {
            items: visible.map((c: any) => ({ ...c, author: map.get(c.authorUserId) })),
            nextCursor: result.isDone ? null : result.continueCursor,
        };
    },
});

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

export const toggleLike = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        targetType: v.union(
            v.literal('post'),
            v.literal('comment'),
            v.literal('story'),
        ),
        targetId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const existing = await ctx.db
            .query('socialLikes')
            .withIndex('by_user_target', (q) =>
                q
                    .eq('userId', actor.idString)
                    .eq('targetType', args.targetType)
                    .eq('targetId', args.targetId),
            )
            .first();

        if (existing) {
            await ctx.db.delete(existing._id);
            await adjustLikeCount(ctx, args.targetType, args.targetId, -1);
            return { liked: false };
        }

        await ctx.db.insert('socialLikes', {
            userId: actor.idString,
            targetType: args.targetType,
            targetId: args.targetId,
            createdAt: NOW(),
        });
        await adjustLikeCount(ctx, args.targetType, args.targetId, +1);

        // Throttled push notification (post likes only) to author.
        if (args.targetType === 'post') {
            try {
                const post = await ctx.db.get(args.targetId as any);
                if (post && (post as any).authorUserId !== actor.idString) {
                    const recentPushes = await ctx.db
                        .query('pushDeliveries')
                        .withIndex('by_user_category', (q) =>
                            q.eq('userId', (post as any).authorUserId).eq('category', 'social'),
                        )
                        .filter((q) =>
                            q.gt(
                                q.field('sentAt'),
                                new Date(Date.now() - LIKE_PUSH_THROTTLE_MS).toISOString(),
                            ),
                        )
                        .collect();
                    const alreadyPushed = recentPushes.some(
                        (r: any) => r.data?.targetId === args.targetId && r.data?.type === 'like',
                    );
                    if (!alreadyPushed) {
                        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: (post as any).authorUserId,
                            title: 'A alguien le gustó tu post',
                            body: 'Mirá quién interactuó con tu publicación.',
                            category: 'social',
                            data: { type: 'like', targetType: 'post', targetId: args.targetId },
                        });
                    }
                }
            } catch (e) {
                console.warn('[social.like] push lookup failed', e);
            }
        }

        return { liked: true };
    },
});

const adjustLikeCount = async (
    ctx: any,
    targetType: string,
    targetId: string,
    delta: number,
) => {
    if (targetType === 'post') {
        try {
            const post = await ctx.db.get(targetId as any);
            if (post) {
                await ctx.db.patch(post._id, {
                    likeCount: Math.max(0, (post as any).likeCount + delta),
                });
            }
        } catch (e) { /* swallow */ }
    } else if (targetType === 'comment') {
        try {
            const comment = await ctx.db.get(targetId as any);
            if (comment) {
                await ctx.db.patch(comment._id, {
                    likeCount: Math.max(0, (comment as any).likeCount + delta),
                });
            }
        } catch (e) { /* swallow */ }
    }
    // Stories don't keep a denormalized like counter.
};

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------

export const follow = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        targetUserId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        if (actor.idString === args.targetUserId) {
            throw new Error('No podés seguirte a vos mismo.');
        }

        const existing = await ctx.db
            .query('socialFollows')
            .withIndex('by_pair', (q) =>
                q.eq('followerUserId', actor.idString).eq('followeeUserId', args.targetUserId),
            )
            .first();
        if (existing) return { followed: true };

        // Ensure both sides have socialUsers so commercial profiles accumulate followers.
        const [actorSeed, targetSeed] = await Promise.all([
            loadUserSeed(ctx, actor.idString),
            loadUserSeed(ctx, args.targetUserId),
        ]);
        const [followerProfile, followeeProfile] = await Promise.all([
            ensureSocialUser(ctx, actor.idString, actorSeed ?? {
                name: actor.email,
                email: actor.email,
            }),
            ensureSocialUser(ctx, args.targetUserId, targetSeed),
        ]);

        await ctx.db.insert('socialFollows', {
            followerUserId: actor.idString,
            followeeUserId: args.targetUserId,
            createdAt: NOW(),
        });

        await ctx.db.patch(followerProfile._id, {
            followingCount: (followerProfile.followingCount ?? 0) + 1,
            updatedAt: NOW(),
        });
        await ctx.db.patch(followeeProfile._id, {
            followerCount: (followeeProfile.followerCount ?? 0) + 1,
            updatedAt: NOW(),
        });

        // Push to followed user.
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: args.targetUserId,
            title: 'Tenés un nuevo seguidor',
            body: `${followerProfile?.displayName ?? 'Alguien'} empezó a seguirte.`,
            category: 'social',
            data: { type: 'follow', followerUserId: actor.idString },
        });
        return { followed: true };
    },
});

export const unfollow = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        targetUserId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const existing = await ctx.db
            .query('socialFollows')
            .withIndex('by_pair', (q) =>
                q.eq('followerUserId', actor.idString).eq('followeeUserId', args.targetUserId),
            )
            .first();
        if (!existing) return { followed: false };

        await ctx.db.delete(existing._id);

        const [actorSeed, targetSeed] = await Promise.all([
            loadUserSeed(ctx, actor.idString),
            loadUserSeed(ctx, args.targetUserId),
        ]);
        const [followerProfile, followeeProfile] = await Promise.all([
            ensureSocialUser(ctx, actor.idString, actorSeed ?? {
                name: actor.email,
                email: actor.email,
            }),
            ensureSocialUser(ctx, args.targetUserId, targetSeed),
        ]);

        await ctx.db.patch(followerProfile._id, {
            followingCount: Math.max(0, (followerProfile.followingCount ?? 0) - 1),
            updatedAt: NOW(),
        });
        await ctx.db.patch(followeeProfile._id, {
            followerCount: Math.max(0, (followeeProfile.followerCount ?? 0) - 1),
            updatedAt: NOW(),
        });
        return { followed: false };
    },
});

/**
 * Shared body for the two follow-list queries. Returns hydrated social
 * profiles rather than raw edges so the client renders a list from one
 * round-trip, and paginates so a popular account cannot blow the read limit.
 */
const followList = async (
    ctx: any,
    opts: {
        sessionToken?: string;
        userId: string;
        direction: 'followers' | 'following';
        cursor?: string;
        limit?: number;
    },
) => {
    try {
        await assertSocialActor(ctx, opts.sessionToken);
    } catch {
        return { items: [], nextCursor: null };
    }
    const cap = Math.min(opts.limit ?? 30, 100);

    const page = await paginateQuery<any>(
        opts.direction === 'followers'
            ? ctx.db
                .query('socialFollows')
                .withIndex('by_followee', (q: any) => q.eq('followeeUserId', opts.userId))
                .order('desc')
            : ctx.db
                .query('socialFollows')
                .withIndex('by_follower', (q: any) => q.eq('followerUserId', opts.userId))
                .order('desc'),
        opts.cursor,
        cap,
    );

    const otherIds = page.items.map((row: any) =>
        opts.direction === 'followers' ? row.followerUserId : row.followeeUserId,
    );
    const profiles = await Promise.all(
        otherIds.map((id: string) =>
            ctx.db
                .query('socialUsers')
                .withIndex('by_user', (q: any) => q.eq('userId', id))
                .first(),
        ),
    );

    return {
        items: profiles.map((p: any, i: number) => ({
            userId: otherIds[i],
            username: p?.username ?? 'usuario',
            displayName: p?.displayName ?? 'Usuario',
            avatar: p?.avatar,
            verified: p?.verified ?? false,
            isInfluencer: p?.isInfluencer ?? false,
        })),
        nextCursor: page.nextCursor,
    };
};

export const getFollowers = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.string(),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) =>
        followList(ctx, {
            sessionToken: (args as any).sessionToken,
            userId: args.userId,
            direction: 'followers',
            cursor: args.cursor,
            limit: args.limit,
        }),
});

export const getFollowing = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        userId: v.string(),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) =>
        followList(ctx, {
            sessionToken: (args as any).sessionToken,
            userId: args.userId,
            direction: 'following',
            cursor: args.cursor,
            limit: args.limit,
        }),
});

export const isFollowing = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        followerUserId: v.string(),
        followeeUserId: v.string(),
    },
    handler: async (ctx, args) => {
        await assertSocialActor(ctx, (args as any).sessionToken);
        const row = await ctx.db
            .query('socialFollows')
            .withIndex('by_pair', (q) =>
                q.eq('followerUserId', args.followerUserId).eq('followeeUserId', args.followeeUserId),
            )
            .first();
        return Boolean(row);
    },
});

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const createStory = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        type: v.union(v.literal('image'), v.literal('video')),
        url: v.string(),
        durationSec: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const now = NOW();
        const expiresAt = new Date(Date.now() + STORY_TTL_MS).toISOString();
        return await ctx.db.insert('socialStories', {
            authorUserId: actor.idString,
            type: args.type,
            url: args.url,
            durationSec: args.durationSec ?? 5,
            viewCount: 0,
            expiresAt,
            createdAt: now,
        });
    },
});

export const deleteStory = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        storyId: v.id('socialStories'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const story = await ctx.db.get(args.storyId);
        if (!story) throw new Error('Historia no encontrada');
        if (story.authorUserId !== actor.idString) throw new Error('No autorizado');
        await ctx.db.patch(args.storyId, { deletedAt: NOW() });
    }
});

export const viewStory = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        storyId: v.id('socialStories'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const existing = await ctx.db
            .query('socialStoryViews')
            .withIndex('by_story_viewer', (q) =>
                q.eq('storyId', String(args.storyId)).eq('viewerUserId', actor.idString),
            )
            .first();
        if (existing) return; // idempotent

        await ctx.db.insert('socialStoryViews', {
            storyId: String(args.storyId),
            viewerUserId: actor.idString,
            viewedAt: NOW(),
        });
        const story = await ctx.db.get(args.storyId);
        if (story) {
            await ctx.db.patch(args.storyId, { viewCount: story.viewCount + 1 });
        }
    },
});

export const getStoriesForFollowing = query({
    args: {
        sessionToken: v.optional(v.string()), actorId: v.optional(v.any()) },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await assertSocialActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }

        const follows = await ctx.db
            .query('socialFollows')
            .withIndex('by_follower', (q) => q.eq('followerUserId', actor.idString))
            .collect();
        const followIds = follows.map((f: any) => f.followeeUserId);
        // Include the current user's own stories at the top.
        const targetIds = [actor.idString, ...followIds];
        const now = NOW();

        const groups: Array<{ author: any; stories: any[] }> = [];
        for (const userId of targetIds) {
            const stories = await ctx.db
                .query('socialStories')
                .withIndex('by_author', (q) => q.eq('authorUserId', userId))
                .collect();
            const active = stories
                .filter((s: any) => !s.deletedAt && s.expiresAt > now)
                .sort((a: any, b: any) => a.createdAt.localeCompare(b.createdAt));
            if (active.length === 0) continue;
            let author: any = await ctx.db
                .query('socialUsers')
                .withIndex('by_user', (q) => q.eq('userId', userId))
                .first();
            // ponytail: Fallback to main users table if socialUsers doesn't exist yet
            if (!author) {
                const mainUser: any = await ctx.db.get(userId as any);
                if (mainUser) {
                    author = {
                        userId: String(mainUser._id),
                        displayName: mainUser.name || mainUser.username || 'Usuario',
                        username: mainUser.username || mainUser.email?.split('@')[0] || 'usuario',
                        avatar: mainUser.avatar,
                    };
                    if (author.avatar && author.avatar.startsWith('convex-storage:')) {
                        const resolved = await ctx.storage.getUrl(author.avatar.replace('convex-storage:', ''));
                        if (resolved) author.avatar = resolved;
                    }
                }
            }
            const resolvedActive = await Promise.all(active.map(async (s: any) => {
                const raw = s.url || s.imageUrl;
                if (raw && raw.startsWith('convex-storage:')) {
                    const resolved = await ctx.storage.getUrl(raw.replace('convex-storage:', ''));
                    if (resolved) return { ...s, url: resolved, imageUrl: resolved };
                }
                return { ...s, imageUrl: s.url };
            }));
            groups.push({ author: author || { userId, displayName: 'Usuario', username: 'user' }, stories: resolvedActive });
        }
        return groups;
    },
});

export const getStoryViewers = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        storyId: v.id('socialStories'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const story = await ctx.db.get(args.storyId);
        if (!story) return [];
        if (story.authorUserId !== actor.idString) {
            throw new Error('Solo el autor puede ver la lista de visualizaciones.');
        }
        return await ctx.db
            .query('socialStoryViews')
            .withIndex('by_story', (q) => q.eq('storyId', String(args.storyId)))
            .collect();
    },
});

// Cron-driven soft-delete of expired stories.
export const internalExpireStories = internalMutation({
    args: {},
    handler: async (ctx, args) => {
        const now = NOW();
        const expired = await ctx.db
            .query('socialStories')
            .withIndex('by_expires', (q) => q.lt('expiresAt', now))
            .collect();
        let count = 0;
        for (const story of expired) {
            if (story.deletedAt) continue;
            await ctx.db.patch(story._id, { deletedAt: now });
            count++;
        }
        return { expired: count };
    },
});



// ---------------------------------------------------------------------------
// DM — shims de compatibilidad.
//
// La mensajería vive ahora en `convex/social/dm.ts` sobre el modelo de
// `socialChatMembers`. Estas seis funciones quedan como adaptadores finos
// porque el bundle web desplegado todavía las llama: borrarlas rompería
// producción hasta el próximo deploy del frontend (exactamente el desfasaje
// de contrato que ya nos costó una caída). Se eliminan cuando el frontend
// nuevo esté publicado.
// ---------------------------------------------------------------------------

export const createChat = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        participantId: v.string(),
    },
    handler: async (ctx, args): Promise<string> =>
        await ctx.runMutation(api.social.dm.getOrCreateDirectChat, {
            sessionToken: args.sessionToken,
            participantId: args.participantId,
        }),
});

export const sendDirectMessage = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        chatId: v.id('socialChats'),
        body: v.string(),
        attachments: v.optional(v.array(v.object({
            type: v.union(
                v.literal('image'),
                v.literal('video'),
                v.literal('document'),
                v.literal('post'),
                v.literal('listing'),
            ),
            url: v.string(),
            metadata: v.optional(v.any()),
        }))),
    },
    handler: async (ctx, args): Promise<string> =>
        await ctx.runMutation(api.social.dm.sendMessage, {
            sessionToken: args.sessionToken,
            chatId: args.chatId,
            body: args.body,
            attachments: args.attachments,
        }),
});

export const markChatAsRead = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        chatId: v.id('socialChats'),
    },
    handler: async (ctx, args): Promise<null> => {
        await ctx.runMutation(api.social.dm.markChatRead, {
            sessionToken: args.sessionToken,
            chatId: args.chatId,
        });
        return null;
    },
});

/** Forma vieja: array plano con `otherParticipants` y `unreadCount`. */
export const getMyChats = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
    },
    handler: async (ctx, args): Promise<any[]> => {
        const page: any = await ctx.runQuery(api.social.dm.listChats, {
            sessionToken: args.sessionToken,
            folder: 'inbox',
            limit: 50,
        });
        return page.items.map((chat: any) => ({
            _id: chat.chatId,
            participantIds: [],
            lastMessagePreview: chat.lastMessagePreview ?? undefined,
            lastMessageAt: chat.lastMessageAt,
            otherParticipants: chat.participants.map((p: any) => ({
                userId: p.userId,
                username: p.username,
                displayName: p.displayName,
                avatar: p.avatar,
                verified: p.verified,
            })),
            unreadCount: chat.unreadCount,
        }));
    },
});

export const getChatMessages = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        chatId: v.id('socialChats'),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<any> => {
        const page: any = await ctx.runQuery(api.social.dm.getChatMessages, {
            sessionToken: args.sessionToken,
            chatId: args.chatId,
            cursor: args.cursor,
            limit: args.limit,
        });
        return {
            items: page.items.map((m: any) => ({
                _id: m._id,
                senderUserId: m.senderUserId,
                body: m.body,
                attachments: m.attachments,
                createdAt: m.createdAt,
            })),
            nextCursor: page.nextCursor,
        };
    },
});

// ---------------------------------------------------------------------------
// Internal — used by future moderation / analytics / push fan-out.
// ---------------------------------------------------------------------------

export const internalGetMutualFollowers = internalQuery({
    args: { userIdA: v.string(), userIdB: v.string() },
    handler: async (ctx, args): Promise<string[]> => {
        const followsByA = await ctx.db
            .query('socialFollows')
            .withIndex('by_follower', (q) => q.eq('followerUserId', args.userIdA))
            .collect();
        const aFollows = new Set(followsByA.map((f: any) => f.followeeUserId));
        const followsByB = await ctx.db
            .query('socialFollows')
            .withIndex('by_follower', (q) => q.eq('followerUserId', args.userIdB))
            .collect();
        return followsByB.map((f: any) => f.followeeUserId).filter((id: string) => aFollows.has(id));
    },
});

// ---------------------------------------------------------------------------
// Saved Posts, Retweets, Highlights
// ---------------------------------------------------------------------------

export const toggleSavePost = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postId: v.id('socialPosts'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const existing = await ctx.db
            .query('socialSavedPosts')
            .withIndex('by_user_post', (q) =>
                q.eq('userId', actor.idString).eq('postId', String(args.postId))
            )
            .first();

        if (existing) {
            await ctx.db.delete(existing._id);
            return { saved: false };
        }

        await ctx.db.insert('socialSavedPosts', {
            userId: actor.idString,
            postId: String(args.postId),
            createdAt: NOW(),
        });
        return { saved: true };
    },
});

export const getSavedPosts = query({
    args: {
        sessionToken: v.optional(v.string()), actorId: v.optional(v.any()), cursor: v.optional(v.string()), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const cap = Math.min(args.limit ?? 20, 50);
        const result = await ctx.db
            .query('socialSavedPosts')
            .withIndex('by_user', (q) => q.eq('userId', actor.idString))
            .order('desc')
            .paginate({ cursor: args.cursor ?? null, numItems: cap });
            
        // Hydrate posts
        const postIds = result.page.map((r: any) => r.postId);
        const posts = await Promise.all(postIds.map((id: any) => ctx.db.get(id)));
        const visiblePosts = posts.filter((p: any) => p && !p.deletedAt);
        
        // Hydrate authors
        const authorIds = Array.from(new Set(visiblePosts.map((p: any) => p.authorUserId)));
        const authorProfiles = await Promise.all(
            authorIds.map((id: any) => ctx.db.query('socialUsers').withIndex('by_user', (q: any) => q.eq('userId', id)).first())
        );
        const authorMap = new Map();
        authorProfiles.forEach((p, i) => { if (p) authorMap.set(authorIds[i], p); });

        return {
            items: visiblePosts.map((post: any) => ({
                ...post,
                author: authorMap.get(post.authorUserId) ?? null,
            })),
            nextCursor: result.isDone ? null : result.continueCursor,
        };
    },
});

export const toggleRetweet = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        postId: v.id('socialPosts'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const post = await ctx.db.get(args.postId);
        if (!post || post.deletedAt) throw new Error('Post no encontrado.');

        const existing = await ctx.db
            .query('socialRetweets')
            .withIndex('by_user_post', (q) =>
                q.eq('userId', actor.idString).eq('postId', String(args.postId))
            )
            .first();

        if (existing) {
            await ctx.db.delete(existing._id);
            await ctx.db.patch(args.postId, { retweetCount: Math.max(0, post.retweetCount - 1) });
            return { retweeted: false };
        }

        await ctx.db.insert('socialRetweets', {
            userId: actor.idString,
            postId: String(args.postId),
            createdAt: NOW(),
        });
        await ctx.db.patch(args.postId, { retweetCount: post.retweetCount + 1 });
        return { retweeted: true };
    },
});

export const getRetweetsByUser = query({
    args: {
        sessionToken: v.optional(v.string()), actorId: v.optional(v.any()), userId: v.string(), cursor: v.optional(v.string()), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        await assertSocialActor(ctx, (args as any).sessionToken);
        const cap = Math.min(args.limit ?? 20, 50);
        const result = await ctx.db
            .query('socialRetweets')
            .withIndex('by_user_post', (q) => q.eq('userId', args.userId))
            .paginate({ cursor: args.cursor ?? null, numItems: cap });
            
        // Hydrate posts
        const postIds = result.page.map((r: any) => r.postId);
        const posts = await Promise.all(postIds.map((id: any) => ctx.db.get(id)));
        const visiblePosts = posts.filter((p: any) => p && !p.deletedAt);
        
        return {
            items: visiblePosts,
            nextCursor: result.isDone ? null : result.continueCursor,
        };
    },
});

export const addHighlight = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        title: v.string(),
        coverImage: v.string(),
        storyIds: v.array(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        return await ctx.db.insert('socialHighlights', {
            userId: actor.idString,
            title: args.title,
            coverImage: args.coverImage,
            storyIds: args.storyIds,
            createdAt: NOW(),
        });
    },
});

export const getHighlights = query({
    args: {
        sessionToken: v.optional(v.string()), actorId: v.optional(v.any()), userId: v.string() },
    handler: async (ctx, args) => {
        await assertSocialActor(ctx, (args as any).sessionToken);
        return await ctx.db
            .query('socialHighlights')
            .withIndex('by_user', (q) => q.eq('userId', args.userId))
            .collect();
    },
});

// ---------------------------------------------------------------------------
// Social Commerce & Gamification (Sprint 3)
// ---------------------------------------------------------------------------

/**
 * DESCARTADO (integración social-commerce).
 *
 * La red social ya no cobra: el CommerceTag de un post agrega el producto real
 * al carrito del marketplace vía `api.commerce.addPostProductToCart` y la
 * compra sigue por el checkout normal (stock, envío, escrow, disputas).
 *
 * Esta mutación movía plata parcheando `users.balance` a mano: sin Stripe, sin
 * orden, sin escrow, sin webhook, y leyendo el campo de puntos equivocado
 * (`pointsState.pointsBalance` en vez del canónico `rewardsState.points`).
 * Se deja lanzando error para que ningún call site viejo cobre en silencio.
 * Se elimina junto con el resto del código muerto en Fase 8d.
 */
export const simulateSocialCommercePayment = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        postId: v.id("socialPosts"),
        pointsToRedeem: v.optional(v.number()),
    },
    handler: async (): Promise<never> => {
        throw new Error(
            "simulateSocialCommercePayment fue reemplazado por api.commerce.addPostProductToCart (el feed agrega al carrito; el pago va por el checkout).",
        );
    },
});

export const followUser = follow;
export const sendMessage = sendDirectMessage;
