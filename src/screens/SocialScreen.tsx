import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    useWindowDimensions,
    Platform,
    ActivityIndicator,
    Image,
} from 'react-native';
import { Search, Plus as PlusIcon, Send, Film, List, ShoppingCart, Bell, Users2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';

import { MobileHeader } from '../components/MobileHeader';
import { GlobalHeaderActions } from '../components/GlobalHeaderActions';
import { MobileNav } from '../components/MobileNav';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useToast } from '../contexts/ToastContext';
import {
    LoopFeed,
    StoriesBar,
    StoryViewer,
    UserSearch,
    UnifiedFeed,
} from '../components/social';
import { InlineComposer } from '../components/social/InlineComposer';

import { useResponsive } from '../hooks/useResponsive';
import { useUnreadMessages } from '../hooks/useMessaging';
import { ResponsiveLayout } from '../components/ResponsiveLayout';
import { DesktopSidebar } from '../components/DesktopSidebar';
import { Radius, colors, glassShadow } from '../theme/tokens';
import { glassSurface } from '../utils/glass';
import { openUserProfile } from '../navigation/openUserProfile';

export default function SocialScreen({ navigation: navProp, onMenuPress, isTabMode }: any) {
    // En modo tab (HomeScreen monta esta pantalla sin props de navegación)
    // `navigation` llega undefined, así que caemos al hook del navigator.
    const navFromHook = useNavigation<any>();
    const navigation = navProp ?? navFromHook;

    const { width: _width } = useWindowDimensions();
    const { colorScheme } = useTheme();
    const { sessionToken, user } = useAuth();
    const { isDesktop } = useResponsive();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { unreadCount } = useUnreadMessages();
    const unreadActivity = useQuery(
        api.social.activity.getUnreadActivityCount,
        sessionToken ? { sessionToken } : 'skip',
    );
    const { openCart, items: cartItems, addPostProduct } = useCart();

    const [activeTab, setActiveTab] = useState<'feed' | 'reels'>('feed');
    // Paridad X/Instagram (plan de ranking, E-085): "Para ti" (algorítmico,
    // `scorePost`) es el default; "Siguiendo" es el tab cronológico puro.
    const [feedMode, setFeedMode] = useState<'forYou' | 'following'>('forYou');
    const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
    const [showSearch, setShowSearch] = useState(false);

    const { show } = useToast();
    const [addingToCart, setAddingToCart] = useState(false);

    // Fuerza un refresh del `UnifiedFeed` (posteo nuevo desde el composer,
    // que vive en el header de la lista, fuera del componente del feed).
    const [feedRefreshKey, setFeedRefreshKey] = useState(0);

    // Los loops NO se derivan del feed general: el ranking "forYou" puede no
    // traer ningún video en las primeras páginas y la pestaña quedaba vacía
    // aunque el video existiera. `mode: 'videos'` va directo al índice
    // by_type_created y devuelve todos los videos, del más nuevo al más viejo.
    const reelsResult = useQuery(
        api.social.getFeed,
        sessionToken ? { sessionToken, limit: 20, mode: 'videos' as const } : 'skip',
    );

    // Paginación de loops. La primera página es reactiva (`useQuery`), las
    // siguientes se piden a demanda con el cursor y se acumulan: sin esto el
    // scroll terminaba en el post 20 y no había forma de llegar a los
    // anteriores, que es parte de por qué "desaparecían".
    const convex = useConvex();
    const [extraReels, setExtraReels] = useState<any[]>([]);
    const [reelsCursor, setReelsCursor] = useState<string | null | undefined>(undefined);
    const loadingMoreRef = useRef(false);

    // Una página nueva de la query reactiva invalida lo acumulado.
    useEffect(() => {
        setExtraReels([]);
        setReelsCursor(reelsResult?.nextCursor ?? null);
    }, [reelsResult]);

    const reelPosts = useMemo(
        () => [...(reelsResult?.items ?? []), ...extraReels],
        [reelsResult, extraReels],
    );

    const handleReelsEndReached = useCallback(async () => {
        if (!sessionToken || !reelsCursor || loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        try {
            const page = await convex.query(api.social.getFeed, {
                sessionToken,
                limit: 20,
                mode: 'videos' as const,
                cursor: reelsCursor,
            });
            const items = page?.items ?? [];
            if (items.length) {
                // Dedupe por id: el ranking puede repetir un post entre páginas
                // y FlatList necesita claves únicas.
                setExtraReels((prev) => {
                    const seen = new Set([
                        ...(reelsResult?.items ?? []).map((p: any) => String(p._id)),
                        ...prev.map((p: any) => String(p._id)),
                    ]);
                    return [...prev, ...items.filter((p: any) => !seen.has(String(p._id)))];
                });
            }
            setReelsCursor(page?.nextCursor ?? null);
        } catch {
            // Sin más páginas o error de red: dejamos lo que ya está cargado.
        } finally {
            loadingMoreRef.current = false;
        }
    }, [convex, sessionToken, reelsCursor, reelsResult]);

    const handleUserClick = useCallback(
        (userId: string) => {
            if (!userId) return;
            // Social hub → hybrid profile (feed + catálogo + bonos)
            openUserProfile(navigation, userId);
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
                await addPostProduct(postId);
                show('Agregado al carrito', 'success');
                openCart();
            } catch (e: any) {
                // error is already handled and shown by CartContext
            } finally {
                setAddingToCart(false);
            }
        },
        [sessionToken, addingToCart, addPostProduct, navigation, show],
    );

    const renderFeedModeTabs = () => (
        <View style={styles.feedModeRow}>
            <TouchableOpacity
                style={[styles.feedModeBtn, feedMode === 'forYou' && styles.feedModeBtnActive]}
                onPress={() => setFeedMode('forYou')}
            >
                <Text style={[styles.feedModeText, feedMode === 'forYou' && styles.feedModeTextActive]}>
                    Para ti
                </Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.feedModeBtn, feedMode === 'following' && styles.feedModeBtnActive]}
                onPress={() => setFeedMode('following')}
            >
                <Text style={[styles.feedModeText, feedMode === 'following' && styles.feedModeTextActive]}>
                    Siguiendo
                </Text>
            </TouchableOpacity>
        </View>
    );

    const renderTabs = () => (
        <View style={[styles.tabContainer, activeTab === 'reels' && styles.tabContainerAbsolute]}>
            <View style={[styles.tabSegment, glassSurface(isDark, 'subtle'), activeTab === 'reels' && styles.tabSegmentDark]}>
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

            {activeTab === 'feed' && (
                <MobileHeader
                    title="Social"
                    subtitle="Conecta con la comunidad"
                    onMenuPress={onMenuPress}
                    actions={
                        <GlobalHeaderActions>
                            <TouchableOpacity
                                style={styles.iconBtn}
                                onPress={() => navigation.navigate('Communities')}
                            >
                                <Users2 size={20} color={isDark ? '#fff' : '#111827'} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.iconBtn}
                                onPress={() => navigation.navigate('Activity')}
                            >
                                <Bell size={20} color={isDark ? '#fff' : '#111827'} />
                                {unreadActivity?.count ? <View style={styles.activityBadge} /> : null}
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.iconBtn}
                                onPress={() => setShowSearch(true)}
                            >
                                <Search size={20} color={isDark ? '#fff' : '#111827'} />
                            </TouchableOpacity>
                        </GlobalHeaderActions>
                    }
                />
            )}

            {renderTabs()}
            {activeTab === 'feed' && renderFeedModeTabs()}

            {activeTab === 'feed' ? (
                // Migrado a `UnifiedFeed`/`useSocialFeed` (Fase 0.1 del plan
                // de ranking): antes esta pantalla hacía su propia query
                // manual a `api.social.getFeed` y no mandaba NINGUNA señal de
                // vista (`addView`) — la pantalla que el usuario realmente ve
                // no alimentaba ni Feed ni Loops. `UnifiedFeed` ya trackea
                // dwell/completion al salir de cada post y tiene el wiring de
                // "No me interesa"/silenciar (`PostActionsSheet`).
                <UnifiedFeed
                    mode={feedMode}
                    refreshKey={feedRefreshKey}
                    listHeaderComponent={
                        <View>
                            <StoriesBar
                                onStoryClick={(id) => setSelectedStoryId(id)}
                                onAddStory={() => navigation.navigate('StoryComposer')}
                            />
                            <InlineComposer
                                onPostCreated={() => setFeedRefreshKey((k) => k + 1)}
                            />
                        </View>
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
                            onEndReached={handleReelsEndReached}
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

            {showSearch && (
                <UserSearch
                    onClose={() => setShowSearch(false)}
                    onUserSelect={handleUserClick}
                />
            )}
        </ResponsiveLayout>
    );
}

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        container: { flex: 1 },
        iconBtn: {
            padding: 8,
            backgroundColor: c.surface2,
            borderRadius: Radius.full,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
        },
        msgBadge: {
            position: 'absolute',
            top: -2,
            right: -2,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#EF4444',
        },
        msgBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
        activityBadge: {
            position: 'absolute',
            top: 6,
            right: 6,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#EF4444',
        },
        cartBadge: {
            position: 'absolute',
            top: 4,
            right: 4,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#EF4444',
        },

        tabContainer: {
            paddingHorizontal: 16,
            paddingVertical: 8,
            alignItems: 'center',
            zIndex: 10,
        },
        tabContainerAbsolute: {
            position: 'absolute',
            top: Platform.OS === 'ios' ? 50 : 20,
            left: 0,
            right: 0,
        },
        tabSegment: {
            flexDirection: 'row',
            padding: 4,
            borderRadius: Radius.full,
            width: '100%',
            maxWidth: 400,
        },
        tabSegmentDark: {
            backgroundColor: 'rgba(0,0,0,0.4)',
            borderWidth: 0,
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

        feedModeRow: {
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 20,
            paddingBottom: 8,
        },
        feedModeBtn: {
            paddingVertical: 4,
            paddingHorizontal: 4,
            borderBottomWidth: 2,
            borderBottomColor: 'transparent',
        },
        feedModeBtnActive: {
            borderBottomColor: c.primary,
        },
        feedModeText: {
            fontSize: 14,
            fontWeight: '600',
            color: c.textMuted,
        },
        feedModeTextActive: {
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
            overflow: 'hidden',
        },
        avatarImage: {
            width: 40,
            height: 40,
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
