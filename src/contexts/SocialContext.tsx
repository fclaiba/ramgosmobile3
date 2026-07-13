import React, { createContext, useContext } from 'react';

export type Post = any;
export type InstagramPost = any;
export type Story = any;
export type User = any;
export type CommercialProduct = any;

export interface SocialContextValue {
    posts: Post[];
    instagramPosts: InstagramPost[];
    trendingTopics: string[];
    suggestedUsers: User[];
    communityGroups: any[];
    stories: Story[];
    followUser: (userId: string) => void;
    unfollowUser: (userId: string) => void;
    isFollowing: (userId: string) => boolean;
    joinGroup: (groupId: string) => void;
    leaveGroup: (groupId: string) => void;
    createChat: (userId: string) => Promise<string> | string;
    createPost: (...args: any[]) => void;
    createInstagramPost: (...args: any[]) => void;
    createStory: (...args: any[]) => void;
    likeInstagramPost: (postId: string) => void;
    currentUser: User;
    savePost: (postId: string) => void;
    unsavePost: (postId: string) => void;
    isPostSaved: (postId: string) => boolean;
    deletePost: (postId: string) => void;
    addComment: (postId: string, text: string) => void;
    sendMessage: (chatId: string, text: string) => void;
    markStoryAsViewed: (storyId: string, itemId?: string) => void;
    likeStory: (storyId: string, itemId?: string) => void;
    replyToStory: (storyId: string, itemId: string, text: string) => void;
    shareStory: (storyId: string, itemId?: string) => void;
    getUserById: (userId: string) => User | undefined;
    getPostsByUser: (userId: string) => Post[];
    getInstagramPostsByUser: (userId: string) => InstagramPost[];
    getHighlightsByUser: (userId: string) => any[];
    getCommercialItemsByUser: (userId: string) => CommercialProduct[];
}

const defaultValue: SocialContextValue = {
    posts: [],
    instagramPosts: [],
    trendingTopics: [],
    suggestedUsers: [],
    communityGroups: [],
    stories: [],
    followUser: () => {},
    unfollowUser: () => {},
    isFollowing: () => false,
    joinGroup: () => {},
    leaveGroup: () => {},
    createChat: async () => '',
    createPost: () => {},
    createInstagramPost: () => {},
    createStory: () => {},
    likeInstagramPost: () => {},
    currentUser: { id: '' },
    savePost: () => {},
    unsavePost: () => {},
    isPostSaved: () => false,
    deletePost: () => {},
    addComment: () => {},
    sendMessage: () => {},
    markStoryAsViewed: () => {},
    likeStory: () => {},
    replyToStory: () => {},
    shareStory: () => {},
    getUserById: () => undefined,
    getPostsByUser: () => [],
    getInstagramPostsByUser: () => [],
    getHighlightsByUser: () => [],
    getCommercialItemsByUser: () => [],
};

const SocialContext = createContext<SocialContextValue>(defaultValue);

export function SocialProvider({ children }: { children: React.ReactNode }) {
    return (
        <SocialContext.Provider value={defaultValue}>
            {children}
        </SocialContext.Provider>
    );
}

export function useSocial(): SocialContextValue {
    return useContext(SocialContext) ?? defaultValue;
}
