/**
 * Shapes returned by `convex/social.ts` to the feed components.
 *
 * These mirror `decoratePosts` in the backend — the previous `Post = any`
 * alias in SocialContext meant a renamed field (likeCount → likesCount) failed
 * silently at runtime instead of at build time.
 */

export interface SocialFeedAuthor {
    userId: string;
    username: string;
    displayName: string;
    avatar?: string;
    verified?: boolean;
    isInfluencer?: boolean;
}

export interface SocialCommercialProduct {
    listingId?: string;
    name: string;
    price: number;
    image?: string;
    commission?: number;
    type?: string;
    description?: string;
    discountPercent?: number;
}

export interface SocialFeedPost {
    _id: string;
    /** Some legacy callers still key off `id`. */
    id?: string;
    authorUserId: string;
    type: 'text' | 'image' | 'video' | 'poll' | 'commercial';
    content: string;
    images?: string[];
    videoUrl?: string;
    commercialProduct?: SocialCommercialProduct;
    likeCount: number;
    commentCount: number;
    retweetCount: number;
    viewCount: number;
    author: SocialFeedAuthor | null;
    isLikedByMe: boolean;
    isSavedByMe: boolean;
    createdAt: string;
}
