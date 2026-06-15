/**
 * SocialContext — Convex-backed social state.
 *
 * Replaces the AsyncStorage / mock-driven legacy implementation. Posts,
 * stories, follows, comments, likes and DMs all live in Convex tables now;
 * this context is just a thin reactive adapter so existing components
 * (`Post`, `StoriesBar`, `DirectMessages`, etc.) keep their public API.
 *
 * - Reactive queries (`useQuery`) hydrate posts/feed/chats/stories
 *   automatically and re-render the consumers when the backend changes.
 * - Mutations call into `convex/social.ts` and rely on the optimistic
 *   patches Convex does for `useMutation` callers — no client-side
 *   shadow state is needed.
 * - All mock users, initial posts mocks, mock chats, etc. were removed:
 *   feed starts empty and is populated by real `createPost` calls.
 */

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from './AuthContext';

// ---------------------------------------------------------------------------
// Public types — kept shape-compatible with the old context so consumers
// (Post.tsx, SocialScreen.tsx, etc.) don't need to change. New backend
// shapes are mapped at adapter boundaries below.
// ---------------------------------------------------------------------------

export interface User {
    id: string;
    username: string;
    name: string;
    displayName: string;
    avatar: string;
    bio: string;
    followers: number;
    following: number;
    isInfluencer: boolean;
    verified: boolean;
}

export interface PollOption {
    id: string;
    text: string;
    votes: number;
}

export interface Poll {
    id: string;
    options: PollOption[];
    totalVotes: number;
    endsAt: string;
    userVoted?: string;
}

export interface CommercialProduct {
    id: string;
    name: string;
    price: number;
    image: string;
    commission: number;
    referralLink: string;
    type: 'product' | 'bono' | 'event';
    location: string;
    description?: string;
    discount?: number;
}

export interface Comment {
    id: string;
    userId: string;
    user: User;
    content: string;
    timestamp: string;
    likes: number;
    likedByUser?: boolean;
}

export interface Post {
    id: string;
    userId: string;
    user: User;
    content: string;
    type: 'text' | 'image' | 'poll' | 'commercial';
    images?: string[];
    poll?: Poll;
    commercialProduct?: CommercialProduct;
    likes: number;
    comments: Comment[];
    retweets: number;
    timestamp: string;
    likedByUser?: boolean;
    retweetedByUser?: boolean;
}

export interface InstagramPost {
    id: string;
    userId: string;
    image: string;
    caption: string;
    likes: number;
    comments: Comment[];
    timestamp: string;
    likedByUser?: boolean;
}

export interface StoryItem {
    id: string;
    type: 'image' | 'video';
    url: string;
    duration: number;
    timestamp: string;
    viewed: boolean;
}

export interface Story {
    id: string;
    userId: string;
    user: User;
    items: StoryItem[];
    lastUpdated: string;
}

export interface HighlightedStory {
    id: string;
    userId: string;
    title: string;
    coverImage: string;
    stories: Story[];
}

export interface TrendingTopic {
    tag: string;
    posts: number;
    color: string;
}

export interface SuggestedUser extends User {
    followers: number;
}

export interface CommunityGroup {
    id: string;
    name: string;
    members: string;
    image: string;
    category: string;
    color: string;
    description: string;
    joined: boolean;
}

export interface Message {
    id: string;
    senderId: string;
    text: string;
    timestamp: string;
    read: boolean;
}

export interface Chat {
    id: string;
    participants: string[];
    messages: Message[];
    lastUpdated: string;
}

interface SocialContextType {
    currentUser: User;
    posts: Post[];
    instagramPosts: InstagramPost[];
    stories: Story[];
    highlightedStories: HighlightedStory[];
    users: User[];
    following: string[];
    trendingTopics: TrendingTopic[];
    suggestedUsers: SuggestedUser[];
    communityGroups: CommunityGroup[];
    savedPosts: string[];
    createPost: (content: string, type: 'text' | 'image' | 'poll' | 'commercial', data?: any) => void;
    deletePost: (postId: string) => void;
    createInstagramPost: (image: string, caption: string) => void;
    createStory: (image: string) => void;
    createHighlight: (title: string, storyIds: string[]) => void;
    likePost: (postId: string) => void;
    retweetPost: (postId: string) => void;
    voteOnPoll: (postId: string, optionId: string) => void;
    likeInstagramPost: (postId: string) => void;
    followUser: (userId: string) => void;
    unfollowUser: (userId: string) => void;
    isFollowing: (userId: string) => boolean;
    getUserById: (userId: string) => User | undefined;
    getPostsByUser: (userId: string) => Post[];
    getInstagramPostsByUser: (userId: string) => InstagramPost[];
    getHighlightsByUser: (userId: string) => HighlightedStory[];
    addComment: (postId: string, content: string, isInstagram?: boolean) => void;
    deleteComment: (postId: string, commentId: string, isInstagram?: boolean) => void;
    likeComment: (postId: string, commentId: string, isInstagram?: boolean) => void;
    searchUsers: (query: string) => User[];
    viewStory: (storyId: string) => void;
    markStoryAsViewed: (storyId: string, itemId: string) => void;
    likeStory: (storyId: string, itemId: string) => Promise<void>;
    replyToStory: (storyId: string, itemId: string, message: string) => Promise<void>;
    shareStory: (storyId: string, itemId: string) => Promise<void>;
    getCommercialItemsByUser: (userId: string) => CommercialProduct[];
    savePost: (postId: string) => void;
    unsavePost: (postId: string) => void;
    isPostSaved: (postId: string) => boolean;
    joinGroup: (groupId: string) => void;
    leaveGroup: (groupId: string) => void;
    getPostsByTopic: (topic: string) => Post[];
    chats: Chat[];
    sendMessage: (chatId: string, text: string) => void;
    createChat: (participantId: string) => Promise<string> | string;
    getFollowers: (userId: string) => User[];
    getFollowing: (userId: string) => User[];
}

const SocialContext = createContext<SocialContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Adapters — backend rows → frontend shapes.
// ---------------------------------------------------------------------------

const adaptSocialUserToUser = (
    row: any | null,
    fallbackId: string,
    fallbackName?: string,
    fallbackAvatar?: string,
): User => ({
    id: row?.userId ?? fallbackId,
    username: row?.username ?? 'usuario',
    name: row?.displayName ?? fallbackName ?? 'Usuario',
    displayName: row?.displayName ?? fallbackName ?? 'Usuario',
    avatar: row?.avatar ?? fallbackAvatar ?? '',
    bio: row?.bio ?? '',
    followers: row?.followerCount ?? 0,
    following: row?.followingCount ?? 0,
    isInfluencer: Boolean(row?.isInfluencer),
    verified: Boolean(row?.verified),
});

const adaptPost = (row: any): Post => ({
    id: row._id ?? row.id,
    userId: row.authorUserId,
    user: adaptSocialUserToUser(row.author, row.authorUserId),
    content: row.content,
    type: row.type,
    images: row.images,
    poll: row.poll
        ? {
            id: row._id,
            options: row.poll.options,
            totalVotes: row.poll.totalVotes,
            endsAt: row.poll.endsAt,
            userVoted: row.poll.voters?.find((v: any) => v.userId === row._currentUserId)?.optionId,
        }
        : undefined,
    commercialProduct: row.commercialProduct
        ? {
            id: row.commercialProduct.listingId ?? row._id,
            name: row.commercialProduct.name,
            price: row.commercialProduct.price,
            image: row.commercialProduct.image ?? '',
            commission: row.commercialProduct.commission ?? 0,
            referralLink: row.commercialProduct.referralLink ?? '',
            type: (row.commercialProduct.type ?? 'product') as 'product' | 'bono' | 'event',
            location: row.commercialProduct.location ?? '',
            description: row.commercialProduct.description,
        }
        : undefined,
    likes: row.likeCount ?? 0,
    comments: [],
    retweets: row.retweetCount ?? 0,
    timestamp: row.createdAt ?? new Date().toISOString(),
});

const adaptStoriesGroup = (group: any): Story => ({
    id: `story-group-${group.author?._id ?? group.author?.userId ?? 'unknown'}`,
    userId: group.author?.userId ?? '',
    user: adaptSocialUserToUser(group.author, group.author?.userId ?? ''),
    items: (group.stories ?? []).map((s: any) => ({
        id: s._id,
        type: s.type,
        url: s.url,
        duration: s.durationSec ?? 5,
        timestamp: s.createdAt,
        viewed: false,
    })),
    lastUpdated: (group.stories ?? []).slice(-1)[0]?.createdAt ?? new Date().toISOString(),
});

const adaptChat = (row: any, currentUserId: string): Chat => ({
    id: row._id,
    participants: row.participantIds ?? [],
    // Messages are loaded lazily inside DirectMessages via `getChatMessages`.
    // The chat list query only carries preview metadata.
    messages: row.lastMessagePreview
        ? [
            {
                id: `${row._id}-preview`,
                senderId:
                    row.participantIds?.find((p: string) => p !== currentUserId) ?? currentUserId,
                text: row.lastMessagePreview,
                timestamp: row.lastMessageAt,
                read: (row.unreadCount ?? 0) === 0,
            },
        ]
        : [],
    lastUpdated: row.lastMessageAt,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SocialProvider({ children }: { children: ReactNode }) {
    const { user: authUser } = useAuth();
    const actorId = authUser?.id as any;

    // Reactive queries.
    const profileRow = useQuery(
        api.social.lookupUserSocial,
        authUser ? { actorId, userId: authUser.id as any } : 'skip',
    );
    const feedResult = useQuery(api.social.getFeed, authUser ? { actorId, limit: 50 } : 'skip');
    const storiesGroups = useQuery(
        api.social.getStoriesForFollowing,
        authUser ? { actorId } : 'skip',
    );
    const chatsRows = useQuery(api.social.getMyChats, authUser ? { actorId } : 'skip');
    const followingRows = useQuery(
        api.social.getFollowing,
        authUser ? { actorId, userId: authUser.id as any } : 'skip',
    );
    const suggestedUsersRows = useQuery(
        api.social.getSuggestedUsers,
        authUser ? { actorId, limit: 10 } : 'skip',
    );
    const savedPostsResult = useQuery(
        api.social.getSavedPosts,
        authUser ? { actorId, limit: 100 } : 'skip',
    );
    const highlightsResult = useQuery(
        api.social.getHighlights,
        authUser ? { actorId, userId: authUser.id as any } : 'skip',
    );

    // Mutations.
    const createPostMut = useMutation(api.social.createPost);
    const deletePostMut = useMutation(api.social.deletePost);
    const votePollMut = useMutation(api.social.votePoll);
    const toggleLikeMut = useMutation(api.social.toggleLike);
    const followMut = useMutation(api.social.follow);
    const unfollowMut = useMutation(api.social.unfollow);
    const addCommentMut = useMutation(api.social.addComment);
    const deleteCommentMut = useMutation(api.social.deleteComment);
    const createStoryMut = useMutation(api.social.createStory);
    const viewStoryMut = useMutation(api.social.viewStory);
    const createChatMut = useMutation(api.social.createChat);
    const sendDirectMessageMut = useMutation(api.social.sendDirectMessage);
    const upsertProfileMut = useMutation(api.social.upsertSocialProfile);
    const toggleSavePostMut = useMutation(api.social.toggleSavePost);
    const toggleRetweetMut = useMutation(api.social.toggleRetweet);
    const addHighlightMut = useMutation(api.social.addHighlight);

    // ---- Derived state for the legacy API surface ---------------------

    const currentUser: User = useMemo(
        () =>
            adaptSocialUserToUser(
                profileRow,
                authUser?.id ?? 'guest',
                authUser?.name,
                authUser?.avatar,
            ),
        [profileRow, authUser],
    );

    // Lazy-create a social profile on first sign-in so the user has a
    // username and the feed adapters can hydrate the author block.
    React.useEffect(() => {
        if (authUser && profileRow === null) {
            upsertProfileMut({
                actorId,
                displayName: authUser.name ?? 'Usuario',
                avatar: authUser.avatar,
            }).catch((err) => console.warn('[social] upsertProfile failed', err));
        }
    }, [authUser, profileRow, upsertProfileMut, actorId]);

    const posts: Post[] = useMemo(
        () => (feedResult?.items ?? []).map(adaptPost),
        [feedResult],
    );

    const instagramPosts: InstagramPost[] = [];

    const stories: Story[] = useMemo(
        () => (storiesGroups ?? []).map(adaptStoriesGroup),
        [storiesGroups],
    );

    const chats: Chat[] = useMemo(
        () => (chatsRows ?? []).map((c: any) => adaptChat(c, currentUser.id)),
        [chatsRows, currentUser.id],
    );

    const followingIds: string[] = useMemo(
        () => (followingRows ?? []).map((r: any) => r.followeeUserId),
        [followingRows],
    );

    const suggestedUsers: SuggestedUser[] = useMemo(
        () => (suggestedUsersRows ?? []).map((r: any) => ({
            ...adaptSocialUserToUser(r, r.userId),
            followers: r.followerCount ?? 0,
        })),
        [suggestedUsersRows],
    );

    // Cache of users we've encountered (for `getUserById`).
    const userCache = useMemo(() => {
        const map = new Map<string, User>();
        if (currentUser.id) map.set(currentUser.id, currentUser);
        for (const post of posts) map.set(post.userId, post.user);
        for (const story of stories) map.set(story.userId, story.user);
        return map;
    }, [currentUser, posts, stories]);

    // ---- Mutations / actions ------------------------------------------

    const createPost = (
        content: string,
        type: 'text' | 'image' | 'poll' | 'commercial',
        data?: any,
    ) => {
        if (!authUser) return;
        createPostMut({
            actorId,
            type,
            content,
            images: type === 'image' ? data?.images : undefined,
            poll: type === 'poll' && data?.poll
                ? {
                    options: (data.poll.options ?? []).map((o: any) => ({
                        id: o.id,
                        text: o.text,
                    })),
                    durationHours: data.poll.durationHours,
                }
                : undefined,
            commercialProduct: type === 'commercial' && data?.product
                ? {
                    listingId: data.product.id,
                    name: data.product.name,
                    price: data.product.price,
                    image: data.product.image,
                    commission: data.product.commission,
                    referralLink: data.product.referralLink,
                    type: data.product.type,
                    location: data.product.location,
                    description: data.product.description,
                }
                : undefined,
        }).catch((err) => console.warn('[social] createPost failed', err));
    };

    const deletePost = (postId: string) => {
        if (!authUser) return;
        deletePostMut({ actorId, postId: postId as any }).catch((err) =>
            console.warn('[social] deletePost failed', err),
        );
    };

    // Instagram-style posts collapse to type='image'.
    const createInstagramPost = (image: string, caption: string) => {
        createPost(caption, 'image', { images: [image] });
    };

    const createStory = (image: string) => {
        if (!authUser) return;
        createStoryMut({ actorId, type: 'image', url: image }).catch((err) =>
            console.warn('[social] createStory failed', err),
        );
    };

    const createHighlight = (title: string, storyIds: string[]) => {
        if (!authUser) return;
        addHighlightMut({ actorId, title, coverImage: '', storyIds }).catch((err) =>
            console.warn('[social] createHighlight failed', err),
        );
    };

    const likePost = (postId: string) => {
        if (!authUser) return;
        toggleLikeMut({ actorId, targetType: 'post', targetId: postId }).catch((err) =>
            console.warn('[social] likePost failed', err),
        );
    };

    const retweetPost = (postId: string) => {
        if (!authUser) return;
        toggleRetweetMut({ actorId, postId: postId as any }).catch((err) =>
            console.warn('[social] retweetPost failed', err),
        );
    };

    const voteOnPoll = (postId: string, optionId: string) => {
        if (!authUser) return;
        votePollMut({ actorId, postId: postId as any, optionId }).catch((err) =>
            console.warn('[social] voteOnPoll failed', err),
        );
    };

    const likeInstagramPost = (postId: string) => likePost(postId);

    const followUser = (userId: string) => {
        if (!authUser) return;
        followMut({ actorId, targetUserId: userId }).catch((err) =>
            console.warn('[social] follow failed', err),
        );
    };

    const unfollowUser = (userId: string) => {
        if (!authUser) return;
        unfollowMut({ actorId, targetUserId: userId }).catch((err) =>
            console.warn('[social] unfollow failed', err),
        );
    };

    const isFollowing = (userId: string) => followingIds.includes(userId);

    const getUserById = (userId: string) => userCache.get(userId);

    const getPostsByUser = (userId: string) => posts.filter((p) => p.userId === userId);

    const getInstagramPostsByUser = (userId: string): InstagramPost[] => {
        return posts
            .filter((p) => p.userId === userId && p.type === 'image' && p.images && p.images.length > 0)
            .map((p) => ({
                id: p.id,
                userId: p.userId,
                image: p.images![0],
                caption: p.content,
                likes: p.likes,
                comments: p.comments,
                timestamp: p.timestamp,
                likedByUser: p.likedByUser,
            }));
    };

    const getHighlightsByUser = (userId: string): HighlightedStory[] => {
        if (userId === currentUser.id && highlightsResult) {
            return highlightsResult.map((h: any) => ({
                id: h._id,
                userId: h.userId,
                title: h.title,
                coverImage: h.coverImage,
                stories: [],
            }));
        }
        return [];
    };

    const addComment = (postId: string, content: string, _isInstagram?: boolean) => {
        if (!authUser) return;
        addCommentMut({ actorId, postId: postId as any, content }).catch((err) =>
            console.warn('[social] addComment failed', err),
        );
    };

    const deleteComment = (postId: string, commentId: string, _isInstagram?: boolean) => {
        if (!authUser) return;
        deleteCommentMut({ actorId, commentId: commentId as any }).catch((err) =>
            console.warn('[social] deleteComment failed', err),
        );
    };

    const likeComment = (_postId: string, commentId: string, _isInstagram?: boolean) => {
        if (!authUser) return;
        toggleLikeMut({ actorId, targetType: 'comment', targetId: commentId }).catch((err) =>
            console.warn('[social] likeComment failed', err),
        );
    };

    // searchUsers is synchronous in the legacy API but our backend is async.
    // Components that need a real search should use `api.social.searchUsers`
    // via `useQuery` directly. Here we match against the locally cached set.
    const searchUsers = (q: string): User[] => {
        if (!q.trim()) return [];
        const lowered = q.toLowerCase();
        return Array.from(userCache.values()).filter(
            (u) =>
                u.username.toLowerCase().includes(lowered) ||
                u.displayName.toLowerCase().includes(lowered),
        );
    };

    const viewStory = (_storyId: string) => {
        // No-op: the StoryViewer calls markStoryAsViewed per item.
    };

    const markStoryAsViewed = (_storyId: string, itemId: string) => {
        if (!authUser) return;
        viewStoryMut({ actorId, storyId: itemId as any }).catch((err) =>
            console.warn('[social] viewStory failed', err),
        );
    };

    const likeStory = async (_storyId: string, itemId: string) => {
        if (!authUser) return;
        try {
            await toggleLikeMut({ actorId, targetType: 'story', targetId: itemId });
        } catch (err) {
            console.warn('[social] likeStory failed', err);
        }
    };

    const replyToStory = async (storyId: string, _itemId: string, message: string) => {
        if (!authUser) return;
        try {
            // Resolve story author → DM them the reply.
            const story = stories.find((s) => s.items.some((i) => i.id === storyId)) ??
                stories.find((s) => s.id === storyId);
            const targetUserId = story?.userId;
            if (!targetUserId) {
                console.warn('[social] replyToStory: target user not resolved');
                return;
            }
            const chatId = await createChatMut({ actorId, participantId: targetUserId });
            await sendDirectMessageMut({ actorId, chatId: chatId as any, body: message });
        } catch (err) {
            console.warn('[social] replyToStory failed', err);
        }
    };

    const shareStory = async (storyId: string, itemId: string) => {
        try {
            const story = stories.find((s) => s.items.some((i) => i.id === itemId)) ??
                stories.find((s) => s.id === storyId);
            const item = story?.items.find((i) => i.id === itemId);
            if (!item?.url) return;
            try {
                const Sharing = await import('expo-sharing');
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(item.url);
                }
            } catch (e) {
                console.warn('[social] expo-sharing not available', e);
            }
        } catch (err) {
            console.warn('[social] shareStory failed', err);
        }
    };

    const getCommercialItemsByUser = (userId: string): CommercialProduct[] =>
        posts
            .filter((p) => p.userId === userId && p.type === 'commercial' && p.commercialProduct)
            .map((p) => p.commercialProduct as CommercialProduct);

    const savedPosts = useMemo(
        () => (savedPostsResult?.items ?? []).map((p: any) => p._id),
        [savedPostsResult]
    );

    const savePost = (postId: string) => {
        if (!authUser) return;
        toggleSavePostMut({ actorId, postId: postId as any }).catch((err) =>
            console.warn('[social] savePost failed', err),
        );
    };
    
    const unsavePost = (postId: string) => {
        if (!authUser) return;
        toggleSavePostMut({ actorId, postId: postId as any }).catch((err) =>
            console.warn('[social] unsavePost failed', err),
        );
    };
    
    const isPostSaved = (postId: string) => savedPosts.includes(postId);

    const joinGroup = (_groupId: string) => {
        // Groups functionality not implemented in v1
    };
    const leaveGroup = (_groupId: string) => {
        // Groups functionality not implemented in v1
    };

    const getPostsByTopic = (topic: string) =>
        posts.filter((p) => p.content.toLowerCase().includes(topic.toLowerCase()));

    const sendMessage = (chatId: string, text: string) => {
        if (!authUser) return;
        sendDirectMessageMut({ actorId, chatId: chatId as any, body: text }).catch((err) =>
            console.warn('[social] sendMessage failed', err),
        );
    };

    const createChat = async (participantId: string): Promise<string> => {
        if (!authUser) throw new Error('No autenticado.');
        const id = await createChatMut({ actorId, participantId });
        return String(id);
    };

    const getFollowers = (_userId: string): User[] => {
        // Lightweight: list resolved via `api.social.getFollowers` query in
        // dedicated screens. The legacy sync API only had mock data.
        return [];
    };

    const getFollowing = (userId: string): User[] => {
        if (userId === currentUser.id) {
            return followingIds
                .map((id) => userCache.get(id))
                .filter(Boolean) as User[];
        }
        return [];
    };

    const value: SocialContextType = {
        currentUser,
        posts,
        instagramPosts,
        stories,
        highlightedStories: [],
        users: Array.from(userCache.values()),
        following: followingIds,
        trendingTopics: [],
        suggestedUsers,
        communityGroups: [],
        savedPosts: savedPosts,
        createPost,
        deletePost,
        createInstagramPost,
        createStory,
        createHighlight,
        likePost,
        retweetPost,
        voteOnPoll,
        likeInstagramPost,
        followUser,
        unfollowUser,
        isFollowing,
        getUserById,
        getPostsByUser,
        getInstagramPostsByUser,
        getHighlightsByUser,
        addComment,
        deleteComment,
        likeComment,
        searchUsers,
        viewStory,
        markStoryAsViewed,
        likeStory,
        replyToStory,
        shareStory,
        getCommercialItemsByUser,
        savePost,
        unsavePost,
        isPostSaved,
        joinGroup,
        leaveGroup,
        getPostsByTopic,
        chats,
        sendMessage,
        createChat,
        getFollowers,
        getFollowing,
    };

    return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
    const context = useContext(SocialContext);
    if (!context) {
        throw new Error('useSocial must be used within SocialProvider');
    }
    return context;
}
