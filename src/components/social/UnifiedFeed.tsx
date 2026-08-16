import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, RefreshControl, ActivityIndicator } from 'react-native';
import { FlatList, ViewToken } from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useNavigation } from '@react-navigation/native';
import { PostCard, PostCardProps } from './PostCard';
import { PostCommentsModal } from './PostCommentsModal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

const { height } = Dimensions.get('window');

// Restamos el área del botttom tab aprox (ajustable según el layout padre)
const ITEM_HEIGHT = height - 85;
const PAGE_SIZE = 10;

export type UnifiedFeedMode = 'forYou' | 'following' | 'videos' | 'recent';

export interface UnifiedFeedProps {
    /** Restricts the feed to one author — used by profile screens. */
    authorUserId?: string;
    mode?: UnifiedFeedMode;
}

export const UnifiedFeed = ({ authorUserId, mode }: UnifiedFeedProps = {}) => {
    const { sessionToken } = useAuth();
    const { show } = useToast();
    const navigation = useNavigation<any>();

    // Cursor pagination: page 0 stays reactive (new posts stream in), older
    // pages are appended snapshots. `getFeed` returns `{ items, nextCursor }`.
    const [cursor, setCursor] = useState<string | undefined>(undefined);
    const [olderPages, setOlderPages] = useState<any[]>([]);
    const [exhausted, setExhausted] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const [focusedIds, setFocusedIds] = useState<Set<string>>(new Set());

    const [addingToCart, setAddingToCart] = useState(false);
    const [commentsPostId, setCommentsPostId] = useState<string | null>(null);

    const page = useQuery(
        api.social.getFeed,
        sessionToken
            ? {
                  sessionToken,
                  limit: PAGE_SIZE,
                  cursor,
                  ...(authorUserId ? { authorUserId } : {}),
                  ...(mode ? { mode } : {}),
              }
            : 'skip',
    );

    const toggleLike = useMutation(api.social.toggleLike);
    const addView = useMutation(api.social.addView);
    const addPostProductToCart = useMutation(api.commerce.addPostProductToCart);
    const viewedIds = useRef<Set<string>>(new Set());

    // Reset accumulated pages whenever the feed identity changes.
    useEffect(() => {
        setCursor(undefined);
        setOlderPages([]);
        setExhausted(false);
        viewedIds.current = new Set();
    }, [authorUserId, mode, sessionToken]);

    // Fold each newly fetched page (beyond the live first one) into the tail.
    useEffect(() => {
        if (!page || !cursor) return;
        setOlderPages((prev) =>
            prev.some((p) => p.cursor === cursor)
                ? prev
                : [...prev, { cursor, items: page.items }],
        );
        if (!page.nextCursor) setExhausted(true);
    }, [page, cursor]);

    const posts = useMemo(() => {
        const livePage = cursor ? [] : page?.items ?? [];
        const tail = olderPages.flatMap((p) => p.items);
        // The live page is re-queried on every cursor change, so dedupe.
        const seen = new Set<string>();
        return [...livePage, ...tail].filter((item) => {
            const id = String(item?._id ?? '');
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }, [page, cursor, olderPages]);

    const isLoadingFirstPage = page === undefined && olderPages.length === 0;

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        setCursor(undefined);
        setOlderPages([]);
        setExhausted(false);
        viewedIds.current = new Set();
        // Convex re-runs the query on its own; this just releases the spinner
        // once the reset has been committed.
        setRefreshing(false);
    }, []);

    const handleEndReached = useCallback(() => {
        if (exhausted || !page?.nextCursor) return;
        if (page.nextCursor === cursor) return;
        setCursor(page.nextCursor);
    }, [exhausted, page, cursor]);

    const handleLike = useCallback(
        (postId: Id<'socialPosts'>) => {
            if (!sessionToken) return;
            toggleLike({ sessionToken, targetType: 'post', targetId: postId }).catch(
                console.error,
            );
        },
        [sessionToken, toggleLike],
    );

    const handleComment = useCallback((postId: string) => {
        setCommentsPostId(postId);
    }, []);

    /**
     * El feed no cobra. Agrega el producto real al carrito del marketplace
     * (con la atribución del creador) y navega al carrito; la compra sigue por
     * el checkout normal, con stock, envío y escrow.
     */
    const handleCommercePress = useCallback(
        async (_listingId: string, postId: string) => {
            if (!sessionToken) {
                show('Iniciá sesión para comprar', 'warning');
                return;
            }
            if (addingToCart) return;
            setAddingToCart(true);
            try {
                await addPostProductToCart({
                    sessionToken,
                    postId: postId as any,
                    quantity: 1,
                });
                show('Agregado al carrito', 'success');
                navigation.navigate('Cart');
            } catch (e: any) {
                show(e?.message || 'No se pudo agregar al carrito', 'error');
            } finally {
                setAddingToCart(false);
            }
        },
        [sessionToken, addingToCart, addPostProductToCart, navigation, show],
    );

    const onViewableItemsChanged = useRef(
        ({ viewableItems }: { viewableItems: ViewToken[] }) => {
            const visibleIds = new Set<string>();
            viewableItems.forEach((item) => {
                if (item.isViewable && item.item?._id) {
                    visibleIds.add(String(item.item._id));
                }
            });
            setFocusedIds(visibleIds);
        },
    ).current;

    // Impressions drive creator payouts, so record one per post that actually
    // became visible. `addView` is idempotent per (post, viewer) server-side.
    useEffect(() => {
        if (!sessionToken || focusedIds.size === 0) return;
        const fresh = Array.from(focusedIds).filter((id) => !viewedIds.current.has(id));
        if (fresh.length === 0) return;
        fresh.forEach((id) => viewedIds.current.add(id));
        addView({ sessionToken, postIds: fresh as any }).catch(() => {
            fresh.forEach((id) => viewedIds.current.delete(id));
        });
    }, [focusedIds, sessionToken, addView]);

    const renderItem = useCallback(
        ({ item }: { item: any }) => {
            // Field names here must track convex/social.ts `decoratePosts`.
            const mappedPost: PostCardProps['post'] = {
                _id: item._id,
                authorUserId: item.authorUserId,
                type: item.type,
                content: item.content,
                images: item.images,
                videoUrl: item.videoUrl,
                commercialProduct: item.commercialProduct,
                likesCount: item.likeCount ?? 0,
                commentsCount: item.commentCount ?? 0,
                hasLiked: item.isLikedByMe ?? false,
            };

            const authorInfo = item.author
                ? {
                      name: item.author.displayName || item.author.username || 'Usuario',
                      avatar: item.author.avatar,
                      role: item.author.isInfluencer ? 'influencer' : undefined,
                  }
                : null;

            return (
                <View style={{ height: ITEM_HEIGHT }}>
                    <PostCard
                        post={mappedPost}
                        author={authorInfo}
                        onLike={() => handleLike(mappedPost._id)}
                        onComment={() => handleComment(String(mappedPost._id))}
                        onCommercePress={(lId) =>
                            handleCommercePress(lId, String(mappedPost._id))
                        }
                        isFocused={focusedIds.has(String(item._id))}
                    />
                </View>
            );
        },
        [focusedIds, handleLike, handleComment, handleCommercePress],
    );

    if (isLoadingFirstPage) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator color="#FFF" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={posts}
                renderItem={renderItem}
                keyExtractor={(item) => String(item._id ?? item.id)}
                pagingEnabled
                showsVerticalScrollIndicator={false}
                onEndReached={handleEndReached}
                onEndReachedThreshold={0.5}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={{
                    itemVisiblePercentThreshold: 70,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#ffffff"
                    />
                }
            />

            <PostCommentsModal
                postId={commentsPostId as any}
                visible={commentsPostId !== null}
                onClose={() => setCommentsPostId(null)}
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
    },
});
