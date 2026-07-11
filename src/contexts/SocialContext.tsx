import React, { createContext, useContext } from 'react';

interface SocialContextValue {
    posts: any[];
    instagramPosts: any[];
    trendingTopics: any[];
    suggestedUsers: any[];
    communityGroups: any[];
    followUser: (userId: string) => void;
    unfollowUser: (userId: string) => void;
    isFollowing: (userId: string) => boolean;
    joinGroup: (groupId: string) => void;
    leaveGroup: (groupId: string) => void;
    createChat: (userId: string) => Promise<string> | string;
    currentUser: any;
    savePost?: (postId: string) => void;
    unsavePost?: (postId: string) => void;
    isPostSaved?: (postId: string) => boolean;
    deletePost?: (postId: string) => void;
    addComment?: (postId: string, text: string) => void;
    sendMessage: (chatId: string, text: string) => void;
    stories?: any[];
    markStoryAsViewed?: (storyId: string) => void;
    likeStory?: (storyId: string) => void;
    replyToStory?: (storyId: string, text: string) => void;
    shareStory?: (storyId: string) => void;
}

const SocialContext = createContext<SocialContextValue | null>(null);

export function SocialProvider({ children }: { children: React.ReactNode }) {
    const value: SocialContextValue = {
        posts: [],
        instagramPosts: [],
        trendingTopics: [],
        suggestedUsers: [],
        communityGroups: [],
        followUser: () => {},
        unfollowUser: () => {},
        isFollowing: () => false,
        joinGroup: () => {},
        leaveGroup: () => {},
        createChat: async () => '',
        currentUser: { id: '' },
        savePost: () => {},
        unsavePost: () => {},
        isPostSaved: () => false,
        deletePost: () => {},
        addComment: () => {},
        sendMessage: () => {},
        stories: [],
        markStoryAsViewed: () => {},
        likeStory: () => {},
        replyToStory: () => {},
        shareStory: () => {},
    };

    return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
    const ctx = useContext(SocialContext);
    if (ctx) return ctx;
    // Fallback for screens outside the provider (should not happen in app)
    return {
        posts: [],
        instagramPosts: [],
        trendingTopics: [],
        suggestedUsers: [],
        communityGroups: [],
        followUser: () => {},
        unfollowUser: () => {},
        isFollowing: () => false,
        joinGroup: () => {},
        leaveGroup: () => {},
        createChat: async () => '',
        currentUser: { id: '' },
        sendMessage: () => {},
    } as SocialContextValue;
}

export type Post = any;
export type InstagramPost = any;
export type Story = any;
