import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, RefreshControl, Platform } from 'react-native';
import { FlatList, ViewToken } from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { PostCard, PostCardProps } from './PostCard';
import { OneClickCheckoutSheet } from './OneClickCheckoutSheet';
import { useAuth } from '../../contexts/AuthContext';

const { height } = Dimensions.get('window');

// Restamos el área del botttom tab aprox (ajustable según el layout padre)
const ITEM_HEIGHT = height - 85; 

export const UnifiedFeed = () => {
    const { sessionToken, user } = useAuth();
    const [refreshing, setRefreshing] = useState(false);
    
    // Rastreamos qué posts están en foco para auto-play de videos
    const [focusedIds, setFocusedIds] = useState<Set<string>>(new Set());

    // Estado del Checkout
    const [checkoutListingId, setCheckoutListingId] = useState<string | null>(null);
    const [checkoutPostId, setCheckoutPostId] = useState<string | null>(null);
    const [checkoutVisible, setCheckoutVisible] = useState(false);

    const postsResult = useQuery(api.social.getFeed, sessionToken ? { limit: 10, sessionToken } : 'skip');
    const posts = postsResult?.items || [];
    const status = postsResult ? 'CanLoadMore' : 'LoadingFirstPage';

    const toggleLike = useMutation(api.social.toggleLike);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        // El hook usePaginatedQuery no expone un "refetch" directo,
        // pero podemos simular la recarga recargando la página entera o forzando la cache
        // Por ahora lo desactivamos visualmente rápido.
        setTimeout(() => setRefreshing(false), 1000);
    }, []);

    const handleEndReached = () => {
        // Ponytail: Pagination is deferred
    };

    const handleLike = useCallback((postId: Id<'socialPosts'>) => {
        if (!sessionToken) return;
        toggleLike({ sessionToken, targetType: 'post', targetId: postId }).catch(console.error);
    }, [sessionToken, toggleLike]);

    const handleComment = useCallback((postId: Id<'socialPosts'>) => {
        console.log("Abrir modal de comentarios para:", postId);
        // TODO: Implementar Sheet de comentarios (Sprint posterior)
    }, []);

    const handleCommercePress = useCallback((listingId: string, postId: string) => {
        setCheckoutListingId(listingId);
        setCheckoutPostId(postId);
        setCheckoutVisible(true);
    }, []);

    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        const visibleIds = new Set<string>();
        viewableItems.forEach(item => {
            if (item.isViewable && item.item?._id) {
                visibleIds.add(item.item._id);
            }
        });
        setFocusedIds(visibleIds);
    }).current;

    const renderItem = useCallback(({ item }: { item: any }) => {
        // Mapeo seguro del backend al prop del PostCard
        const mappedPost: PostCardProps['post'] = {
            _id: item._id,
            authorUserId: item.authorUserId,
            type: item.type,
            content: item.content,
            images: item.images,
            videoUrl: item.videoUrl,
            commercialProduct: item.commercialProduct,
            likesCount: item.likesCount || 0,
            commentsCount: item.commentsCount || 0,
            hasLiked: item.isLikedByMe || false,
        };

        const authorInfo = item.author ? {
            name: item.author.name,
            avatar: item.author.avatar,
            role: item.author.role
        } : null;

        return (
            <View style={{ height: ITEM_HEIGHT }}>
                <PostCard
                    post={mappedPost}
                    author={authorInfo}
                    onLike={() => handleLike(mappedPost._id)}
                    onComment={() => handleComment(mappedPost._id)}
                    onCommercePress={(lId) => handleCommercePress(lId, mappedPost._id)}
                    isFocused={focusedIds.has(item._id)}
                />
            </View>
        );
    }, [focusedIds, handleLike, handleComment, handleCommercePress]);

    if (status === 'LoadingFirstPage') {
        return (
            <View style={[styles.container, styles.center]}>
                {/* Fallback de carga, idealmente Skeleton */}
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={posts}
                renderItem={renderItem}
                keyExtractor={(item) => item._id || item.id}
                pagingEnabled
                showsVerticalScrollIndicator={false}
                onEndReached={handleEndReached}
                onEndReachedThreshold={0.5}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={{
                    itemVisiblePercentThreshold: 70
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#ffffff"
                    />
                }
            />
            
            <OneClickCheckoutSheet 
                visible={checkoutVisible}
                postId={checkoutPostId}
                listingId={checkoutListingId}
                onClose={() => setCheckoutVisible(false)}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000', // El feed de videos siempre es negro de fondo
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    }
});
