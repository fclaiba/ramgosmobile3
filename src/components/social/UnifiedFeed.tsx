import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, RefreshControl, ActivityIndicator } from 'react-native';
import { ViewToken } from 'react-native';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useNavigation } from '@react-navigation/native';
import { PostCard } from './PostCard';
import { PostCommentsModal } from './PostCommentsModal';
import { PostActionsSheet } from './PostActionsSheet';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useCart } from '../../contexts/CartContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors } from '../../theme/tokens';
import { useSocialFeed, SocialFeedMode } from '../../hooks/useSocialFeed';
import { mapPostToCardProps } from '../../utils/mapPostToCard';

const { height } = Dimensions.get('window');

// Restamos el área del botttom tab aprox (ajustable según el layout padre)
const ITEM_HEIGHT = height - 85;
const PAGE_SIZE = 10;

export type UnifiedFeedMode = SocialFeedMode;

export interface UnifiedFeedProps {
    /** Restricts the feed to one author — used by profile screens. */
    authorUserId?: string;
    mode?: UnifiedFeedMode;
    /** Cambiar este valor fuerza un refresh del feed (ej: se creó un post
     *  nuevo desde un composer montado por el caller, fuera de este componente). */
    refreshKey?: string | number;
    /** Header de la lista — ej. `StoriesBar` + `InlineComposer` en `SocialScreen`. */
    listHeaderComponent?: React.ReactElement | null;
    /** B2: tab "Feed" de `CommunityDetailScreen` — anula `authorUserId`/`mode`. */
    communityId?: string;
    /** B4: el caller (`CommunityDetailScreen`) ya sabe si el viewer es
     *  owner/admin de ESA comunidad — se lo pasa acá en vez de que
     *  `PostActionsSheet` intente resolverlo de nuevo. */
    canModerate?: boolean;
}

export const UnifiedFeed = ({ authorUserId, mode, refreshKey, listHeaderComponent, communityId, canModerate }: UnifiedFeedProps = {}) => {
    const { sessionToken, user } = useAuth();
    const { show } = useToast();
    const navigation = useNavigation<any>();
    const isDark = useTheme().colorScheme === 'dark';
    const tint = colors(isDark).primary;

    const { posts, isLoadingFirstPage, loadMore, refresh, viewedIds } = useSocialFeed({
        authorUserId,
        mode,
        pageSize: PAGE_SIZE,
        refreshKey,
        communityId,
    });
    const [refreshing, setRefreshing] = useState(false);

    const [focusedIds, setFocusedIds] = useState<Set<string>>(new Set());
    // Cuándo entró cada post en foco — para calcular `dwellMs` al salir.
    const focusStartedAt = useRef<Map<string, number>>(new Map());

    const { addPostProduct, openCart } = useCart();
    const [addingToCart, setAddingToCart] = useState(false);
    const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
    const [actionsPost, setActionsPost] = useState<{ id: string; authorUserId: string } | null>(null);

    const toggleLike = useMutation(api.social.toggleLike);
    const votePoll = useMutation(api.social.votePoll);
    const addView = useMutation(api.social.addView);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        refresh();
        setRefreshing(false);
    }, [refresh]);

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

    const handleVotePoll = useCallback(
        (postId: Id<'socialPosts'>, optionId: string) => {
            if (!sessionToken) return;
            votePoll({ sessionToken, postId, optionId }).catch(() => {});
        },
        [sessionToken, votePoll],
    );

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
                await addPostProduct(postId);
                show('Agregado al carrito', 'success');
                openCart();
            } catch (e: any) {
                // error handled and shown by CartContext
            } finally {
                setAddingToCart(false);
            }
        },
        [sessionToken, addingToCart, addPostProduct, navigation, show],
    );

    /**
     * Registra impresión + watch-time al SALIR de cada post (no al entrar):
     * `dwellMs` es cuánto estuvo en foco, y para video se manda `completionPct`
     * estimado a partir de eso — una aproximación razonable sin instrumentar
     * cada `expo-video` player acá (`PostCard`/`LoopItem` son quienes conocen
     * la posición real de reproducción; esto cubre el resto de los tipos).
     */
    const flushExit = useCallback(
        (id: string) => {
            if (!sessionToken) return;
            const startedAt = focusStartedAt.current.get(id);
            focusStartedAt.current.delete(id);
            if (viewedIds.current.has(id)) return;
            viewedIds.current.add(id);

            const dwellMs = startedAt ? Date.now() - startedAt : undefined;
            addView({
                sessionToken,
                postIds: [id as any],
                watch: dwellMs ? [{ postId: id as any, dwellMs, completionPct: Math.min(1, dwellMs / 4000) }] : undefined,
            }).catch(() => {
                viewedIds.current.delete(id);
            });
        },
        [sessionToken, addView, viewedIds],
    );

    const onViewableItemsChanged = useRef(
        ({ viewableItems }: { viewableItems: ViewToken[] }) => {
            const visibleIds = new Set<string>();
            viewableItems.forEach((item) => {
                if (item.isViewable && item.item?._id) {
                    const id = String(item.item._id);
                    visibleIds.add(id);
                    if (!focusStartedAt.current.has(id)) focusStartedAt.current.set(id, Date.now());
                }
            });
            // Todo lo que estaba en foco y ya no está: se fue, se cierra su
            // ventana de watch-time.
            focusedIds.forEach((id) => {
                if (!visibleIds.has(id)) flushExit(id);
            });
            setFocusedIds(visibleIds);
        },
    ).current;

    const renderItem = useCallback(
        ({ item }: ListRenderItemInfo<any>) => {
            const mappedPost = mapPostToCardProps(item);

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
                        onOpenActions={() =>
                            setActionsPost({ id: String(mappedPost._id), authorUserId: item.authorUserId })
                        }
                        onVotePoll={(optionId) => handleVotePoll(mappedPost._id, optionId)}
                        currentUserId={user?.id}
                    />
                </View>
            );
        },
        [focusedIds, handleLike, handleComment, handleCommercePress, handleVotePoll, user?.id],
    );

    if (isLoadingFirstPage) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator color={tint} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlashList
                data={posts}
                renderItem={renderItem}
                keyExtractor={(item) => String(item._id ?? item.id)}
                // v2 de FlashList estima el tamaño automáticamente; ITEM_HEIGHT
                // fijo en el wrapper de cada celda sigue siendo lo que da el
                // efecto "un post por pantalla" del scroll paginado.
                pagingEnabled
                showsVerticalScrollIndicator={false}
                onEndReached={loadMore}
                onEndReachedThreshold={0.5}
                ListHeaderComponent={listHeaderComponent ?? undefined}
                onViewableItemsChanged={onViewableItemsChanged as any}
                viewabilityConfig={{
                    itemVisiblePercentThreshold: 70,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={tint}
                    />
                }
            />

            <PostCommentsModal
                postId={commentsPostId as any}
                visible={commentsPostId !== null}
                onClose={() => setCommentsPostId(null)}
            />

            <PostActionsSheet
                visible={actionsPost !== null}
                onClose={() => setActionsPost(null)}
                postId={actionsPost?.id ?? ''}
                authorUserId={actionsPost?.authorUserId ?? ''}
                canModerate={canModerate}
                communityId={communityId}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // Transparente: el caller (ej. `SocialScreen`'s gradient de fondo)
        // decide el color. Antes era negro fijo, pensado para un feed de
        // videos a pantalla completa — pero este componente ahora también
        // sirve el tab "Feed" (texto/imagen) sobre fondo claro u oscuro.
        backgroundColor: 'transparent',
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
});
