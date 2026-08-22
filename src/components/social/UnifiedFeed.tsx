import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { ViewToken } from 'react-native';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useNavigation } from '@react-navigation/native';
import { PostCard } from './PostCard';
import { PostCommentsModal } from './PostCommentsModal';
import { PostActionsSheet } from './PostActionsSheet';
import { RepostSheet } from './RepostSheet';
import { QuoteComposerModal } from './QuoteComposerModal';
import { QuotedPost } from './QuotedPostCard';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useCart } from '../../contexts/CartContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors } from '../../theme/tokens';
import { useSocialFeed, SocialFeedMode } from '../../hooks/useSocialFeed';
import { mapPostToCardProps } from '../../utils/mapPostToCard';
import { openUserProfile } from '../../navigation/openUserProfile';

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
    // Un solo sheet/composer para toda la lista, no uno por tarjeta — mismo
    // patrón que `PostCommentsModal`/`PostActionsSheet` acá abajo.
    const [repostTargetId, setRepostTargetId] = useState<string | null>(null);
    const [quoteTarget, setQuoteTarget] = useState<QuotedPost | null>(null);

    const toggleLike = useMutation(api.social.toggleLike);
    const toggleRetweet = useMutation(api.social.toggleRetweet);
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

    const handleToggleRepost = useCallback(
        (postId: Id<'socialPosts'>) => {
            if (!sessionToken) return;
            toggleRetweet({ sessionToken, postId }).catch((e: any) => {
                show(e?.data?.message || e?.message || 'No se pudo repostear', 'error');
            });
        },
        [sessionToken, toggleRetweet, show],
    );

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
                      username: item.author.username,
                  }
                : null;

            return (
                <PostCard
                    post={mappedPost}
                    author={authorInfo}
                    repostedBy={item.repostedBy ?? null}
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
                    onOpenRepostMenu={() => setRepostTargetId(String(mappedPost._id))}
                    onToggleRepost={() => handleToggleRepost(mappedPost._id)}
                    onOpenQuoted={(postId) => navigation.navigate('PostDetail', { postId })}
                    onUserPress={(userId) => openUserProfile(navigation, userId)}
                />
            );
        },
        [focusedIds, handleLike, handleComment, handleCommercePress, handleVotePoll, handleToggleRepost, navigation, user?.id],
    );

    /** El post sobre el que está abierto el menú de repost, como cita. */
    const repostTargetAsQuoted = useMemo((): QuotedPost | null => {
        if (!repostTargetId) return null;
        const item = posts.find((p: any) => String(p._id) === repostTargetId);
        if (!item) return null;
        return {
            _id: item._id,
            authorUserId: item.authorUserId,
            type: item.type,
            content: item.content,
            images: item.images,
            imageAlts: item.imageAlts,
            videoUrl: item.videoUrl,
            createdAt: item.createdAt,
            likeCount: item.likeCount ?? 0,
            commentCount: item.commentCount ?? 0,
            retweetCount: item.retweetCount ?? 0,
            isRetweetedByMe: item.isRetweetedByMe ?? false,
            author: item.author ?? null,
        };
    }, [repostTargetId, posts]);

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
                // Lista vertical normal (Twitter/IG): las tarjetas miden lo que
                // mide su contenido y v2 de FlashList estima el tamaño solo.
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                onEndReached={loadMore}
                onEndReachedThreshold={0.5}
                ListHeaderComponent={listHeaderComponent ?? undefined}
                onViewableItemsChanged={onViewableItemsChanged as any}
                viewabilityConfig={{
                    // Con scroll libre (ya no paginado) hay varias tarjetas a la
                    // vez: media tarjeta visible ya cuenta como "en foco" para
                    // el autoplay y el watch-time.
                    itemVisiblePercentThreshold: 50,
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

            <RepostSheet
                visible={repostTargetId !== null}
                onClose={() => setRepostTargetId(null)}
                onRepost={() => {
                    if (repostTargetId) handleToggleRepost(repostTargetId as any);
                }}
                onQuote={() => setQuoteTarget(repostTargetAsQuoted)}
            />

            <QuoteComposerModal
                visible={quoteTarget !== null}
                onClose={() => setQuoteTarget(null)}
                quoted={quoteTarget}
                // Refresca para que la cita recién publicada aparezca arriba.
                onPosted={refresh}
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
    listContent: {
        paddingHorizontal: 12,
        paddingBottom: 24,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
});
