import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    useWindowDimensions,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { Search, Plus as PlusIcon, Send, Film, List } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

import { MobileHeader } from '../components/MobileHeader';
import { MobileNav } from '../components/MobileNav';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
    Post,
    LoopFeed,
    StoriesBar,
    StoryViewer,
    CreateStory,
    UserSearch,
    DirectMessages,
} from '../components/social';
import { CreatorStudioModal } from '../components/social/CreatorStudioModal';

import { useResponsive } from '../hooks/useResponsive';
import { ResponsiveLayout } from '../components/ResponsiveLayout';
import { DesktopSidebar } from '../components/DesktopSidebar';
import { Radius, colors, glassShadow } from '../theme/tokens';
import { glassSurface } from '../utils/glass';

export default function SocialScreen({ navigation, onMenuPress, isTabMode }: any) {
    const { width: _width } = useWindowDimensions();
    const { colorScheme } = useTheme();
    const { sessionToken } = useAuth();
    const { isDesktop } = useResponsive();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [activeTab, setActiveTab] = useState<'feed' | 'reels'>('feed');
    const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
    const [showCreatePost, setShowCreatePost] = useState(false);
    const [showCreateStory, setShowCreateStory] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [showMessages, setShowMessages] = useState(false);

    const { show } = useToast();
    const addPostProductToCart = useMutation(api.commerce.addPostProductToCart);
    const [addingToCart, setAddingToCart] = useState(false);

    const [feedCursor, setFeedCursor] = useState<string | null>(null);
    const [accumulatedPosts, setAccumulatedPosts] = useState<any[]>([]);
    const [loadingMore, setLoadingMore] = useState(false);

    const postsResult = useQuery(
        api.social.getFeed,
        sessionToken
            ? {
                  limit: 20,
                  sessionToken,
                  ...(feedCursor ? { cursor: feedCursor } : {}),
              }
            : 'skip',
    );

    useEffect(() => {
        if (!postsResult?.items) return;
        if (!feedCursor) {
            setAccumulatedPosts(postsResult.items);
            return;
        }
        setAccumulatedPosts((prev) => {
            const ids = new Set(prev.map((p) => String(p._id)));
            const next = postsResult.items.filter((p: any) => !ids.has(String(p._id)));
            return next.length ? [...prev, ...next] : prev;
        });
        setLoadingMore(false);
    }, [postsResult, feedCursor]);

    const posts = accumulatedPosts;
    const nextCursor = postsResult?.nextCursor ?? null;

    const feedPosts = useMemo(
        () => posts.filter((p: any) => p.type !== 'video'),
        [posts],
    );

    // Los loops NO se derivan del feed general: el ranking "forYou" puede no
    // traer ningún video en las primeras páginas y la pestaña quedaba vacía
    // aunque el video existiera. `mode: 'videos'` va directo al índice
    // by_type_created y devuelve todos los videos, del más nuevo al más viejo.
    const reelsResult = useQuery(
        api.social.getFeed,
        sessionToken ? { sessionToken, limit: 20, mode: 'videos' as const } : 'skip',
    );
    const reelPosts = reelsResult?.items ?? [];

    const handleUserClick = useCallback(
        (userId: string) => {
            if (!userId) return;
            // Social hub → hybrid profile (feed + catálogo + bonos)
            navigation.navigate('HybridProfile', { userId: String(userId) });
        },
        [navigation],
    );

    /**
     * El feed no cobra: agrega el producto real al carrito del marketplace
     * (con la atribución del creador) y lleva al carrito para que la compra
     * siga por el checkout normal.
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

    const loadMore = () => {
        if (!nextCursor || loadingMore || postsResult === undefined) return;
        setLoadingMore(true);
        setFeedCursor(nextCursor);
    };

    const renderTabs = () => (
        <View style={styles.tabContainer}>
            <View style={[styles.tabSegment, glassSurface(isDark, 'subtle')]}>
                <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'feed' && styles.tabButtonActive]}
                    onPress={() => setActiveTab('feed')}
                >
                    <List
                        size={18}
                        color={activeTab === 'feed' ? (isDark ? '#fff' : '#000') : '#6B7280'}
                    />
                    <Text
                        style={[styles.tabText, activeTab === 'feed' && styles.tabTextActive]}
                    >
                        Feed
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'reels' && styles.tabButtonActive]}
                    onPress={() => setActiveTab('reels')}
                >
                    <Film
                        size={18}
                        color={activeTab === 'reels' ? (isDark ? '#fff' : '#000') : '#6B7280'}
                    />
                    <Text
                        style={[styles.tabText, activeTab === 'reels' && styles.tabTextActive]}
                    >
                        Loops
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <ResponsiveLayout
            style={styles.container}
            sidebar={
                !isTabMode ? (
                    <DesktopSidebar
                        activeSection="social"
                        onSectionChange={(section) => {
                            if (section === 'home') navigation.navigate('Home');
                            else if (section === 'marketplace')
                                navigation.navigate('Marketplace');
                        }}
                    />
                ) : undefined
            }
        >
            <LinearGradient
                colors={isDark ? ['#09090B', '#000'] : ['#FAFAFA', '#F3F4F6']}
                style={StyleSheet.absoluteFill}
            />

            <MobileHeader
                title="Social"
                subtitle="Conecta con la comunidad"
                onMenuPress={onMenuPress}
                actions={
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            style={styles.iconBtn}
                            onPress={() => setShowSearch(true)}
                        >
                            <Search size={20} color={isDark ? '#fff' : '#111827'} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.iconBtn}
                            onPress={() => setShowMessages(true)}
                        >
                            <Send size={20} color={isDark ? '#fff' : '#111827'} />
                        </TouchableOpacity>
                    </View>
                }
            />

            {renderTabs()}

            {activeTab === 'feed' ? (
                <FlatList
                    data={feedPosts}
                    keyExtractor={(item) => item._id || item.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.4}
                    renderItem={({ item }) => (
                        <Post
                            post={item}
                            onUserClick={handleUserClick}
                            onCommercePress={handleCommercePress}
                        />
                    )}
                    ListHeaderComponent={
                        <>
                            <StoriesBar
                                onStoryClick={(id) => setSelectedStoryId(id)}
                                onAddStory={() => setShowCreateStory(true)}
                            />
                            <TouchableOpacity
                                style={styles.createPostBar}
                                onPress={() => setShowCreatePost(true)}
                            >
                                <View style={styles.avatarPlaceholder}>
                                    <Text style={styles.avatarLetter}>R</Text>
                                </View>
                                <View style={styles.cpInput}>
                                    <Text style={styles.cpText}>¿Qué estás pensando?</Text>
                                </View>
                                <PlusIcon size={20} color={isDark ? '#fff' : '#000'} />
                            </TouchableOpacity>
                        </>
                    }
                    ListEmptyComponent={
                        postsResult === undefined ? (
                            <ActivityIndicator
                                style={{ marginTop: 40 }}
                                color={colors(isDark).primary}
                            />
                        ) : (
                            <Text
                                style={{
                                    textAlign: 'center',
                                    color: 'gray',
                                    marginTop: 40,
                                }}
                            >
                                No hay publicaciones aún. ¡Sé el primero!
                            </Text>
                        )
                    }
                    ListFooterComponent={
                        loadingMore ? (
                            <ActivityIndicator
                                style={{ marginVertical: 16 }}
                                color={colors(isDark).primary}
                            />
                        ) : null
                    }
                />
            ) : (
                <View style={styles.reelsContainer}>
                    {reelsResult === undefined ? (
                        <View style={styles.emptyReels}>
                            <ActivityIndicator color={colors(isDark).primary} />
                        </View>
                    ) : reelPosts.length > 0 ? (
                        <LoopFeed
                            posts={reelPosts}
                            onUserClick={handleUserClick}
                            onCommercePress={handleCommercePress}
                        />
                    ) : (
                        <View style={styles.emptyReels}>
                            <Film size={48} color={isDark ? '#374151' : '#D1D5DB'} />
                            <Text style={styles.emptyReelsText}>No hay loops disponibles</Text>
                        </View>
                    )}
                </View>
            )}

            {activeTab === 'feed' && (
                <TouchableOpacity
                    style={styles.fab}
                    onPress={() => setShowCreatePost(true)}
                >
                    <LinearGradient
                        colors={['#4FC3F7', '#29B6F6']}
                        style={styles.fabGradient}
                    >
                        <PlusIcon size={24} color="#fff" />
                    </LinearGradient>
                </TouchableOpacity>
            )}

            {selectedStoryId && (
                <StoryViewer
                    storyId={selectedStoryId}
                    onClose={() => setSelectedStoryId(null)}
                    onNavigateProfile={handleUserClick}
                />
            )}

            {!isTabMode && !isDesktop && (
                <MobileNav
                    activeSection="social"
                    onSectionChange={(section) => {
                        if (section === 'home') navigation.navigate('Home');
                        else if (section === 'marketplace')
                            navigation.navigate('Marketplace');
                    }}
                />
            )}

            <CreatorStudioModal
                visible={showCreatePost}
                onClose={() => {
                    setShowCreatePost(false);
                    setFeedCursor(null);
                    setAccumulatedPosts([]);
                }}
            />
            {showCreateStory && (
                <CreateStory onClose={() => setShowCreateStory(false)} />
            )}
            {showSearch && (
                <UserSearch
                    onClose={() => setShowSearch(false)}
                    onUserSelect={handleUserClick}
                />
            )}
            {showMessages && <DirectMessages onClose={() => setShowMessages(false)} />}
        </ResponsiveLayout>
    );
}

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        container: { flex: 1 },
        headerActions: { flexDirection: 'row', gap: 12 },
        iconBtn: {
            padding: 8,
            backgroundColor: c.surface2,
            borderRadius: Radius.full,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
        },

        tabContainer: {
            paddingHorizontal: 16,
            paddingVertical: 8,
            alignItems: 'center',
        },
        tabSegment: {
            flexDirection: 'row',
            padding: 4,
            borderRadius: Radius.full,
            width: '100%',
            maxWidth: 400,
        },
        tabButton: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 8,
            borderRadius: Radius.full,
            gap: 6,
        },
        tabButtonActive: {
            backgroundColor: c.surface3,
            ...glassShadow(isDark),
        },
        tabText: {
            fontSize: 14,
            fontWeight: '600',
            color: c.textMuted,
        },
        tabTextActive: {
            color: c.text,
            fontWeight: '700',
        },

        createPostBar: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: c.surface1,
            padding: 12,
            borderRadius: Radius.xl,
            marginBottom: 16,
            gap: 12,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
            ...glassShadow(isDark),
        },
        avatarPlaceholder: {
            width: 40,
            height: 40,
            borderRadius: Radius.full,
            backgroundColor: c.surface2,
            justifyContent: 'center',
            alignItems: 'center',
        },
        avatarLetter: {
            fontSize: 16,
            fontWeight: 'bold',
            color: c.textMuted,
        },
        cpInput: {
            flex: 1,
            backgroundColor: c.surface2,
            height: 36,
            borderRadius: Radius.full,
            justifyContent: 'center',
            paddingHorizontal: 16,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
        },
        cpText: { color: c.textMuted, fontSize: 13 },

        reelsContainer: {
            flex: 1,
            backgroundColor: c.surface1,
            borderRadius: isDark ? Radius.xl : 0,
            overflow: 'hidden',
        },
        emptyReels: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
        },
        emptyReelsText: {
            color: c.textMuted,
            fontSize: 16,
        },

        fab: {
            position: 'absolute',
            bottom: Platform.OS === 'ios' ? 100 : 80,
            right: 20,
            ...glassShadow(isDark),
        },
        fabGradient: {
            width: 56,
            height: 56,
            borderRadius: 28,
            justifyContent: 'center',
            alignItems: 'center',
        },
    });
};
