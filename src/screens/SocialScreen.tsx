import React, { useCallback, useState } from 'react';
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
import * as Haptics from 'expo-haptics';
import { Search, Plus as PlusIcon, Send, Film, List, ShoppingCart, Bell } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

import { MobileHeader } from '../components/MobileHeader';
import { GlobalHeaderActions } from '../components/GlobalHeaderActions';
import { MobileNav } from '../components/MobileNav';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCart, OPEN_CART_AFTER_ADD } from '../contexts/CartContext';
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
import { useFeedTabs } from '../hooks/useFeedTabs';
import { useSocialFeed } from '../hooks/useSocialFeed';
import { FeedTabBar } from '../components/social/FeedTabBar';
import { PinnedCommunityTabs, type PinnedCommunity } from '../components/social/PinnedCommunityTabs';
import { EmptyCommunitiesFeed } from '../components/social/EmptyCommunitiesFeed';
import { useUnreadMessages } from '../hooks/useMessaging';
import { ResponsiveLayout } from '../components/ResponsiveLayout';
import { DesktopSidebar } from '../components/DesktopSidebar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Space, colors, glassShadow } from '../theme/tokens';
import { glassSurface } from '../utils/glass';
import { openUserProfile } from '../navigation/openUserProfile';

export default function SocialScreen({ navigation: navProp, onMenuPress, isTabMode }: any) {
    // En modo tab (HomeScreen monta esta pantalla sin props de navegación)
    // `navigation` llega undefined, así que caemos al hook del navigator.
    const navFromHook = useNavigation<any>();
    const navigation = navProp ?? navFromHook;

    const { width: _width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
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
    // "Comunidades" y las comunidades fijadas se suman desde `useFeedTabs`.
    // Las fijadas las carga `PinnedCommunityTabs` detrás de una error
    // boundary: si esa query falla, se pierden esas tabs y no la pantalla.
    const [pinnedCommunities, setPinnedCommunities] = useState<PinnedCommunity[]>([]);
    const feedTabs = useFeedTabs(pinnedCommunities);
    const setCommunityPinned = useMutation(api.social.communityAccess.setCommunityPinned);
    const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
    const [showSearch, setShowSearch] = useState(false);

    const { show } = useToast();
    const [addingToCart, setAddingToCart] = useState(false);

    const handleUnpinCommunity = useCallback(
        (tabKey: string) => {
            const communityId = feedTabs.communityIdOf(tabKey);
            if (!communityId || !sessionToken) return;
            setCommunityPinned({ sessionToken, communityId: communityId as any, pinned: false }).catch(
                () => show('No se pudo desfijar la comunidad', 'error'),
            );
        },
        [feedTabs, sessionToken, setCommunityPinned, show],
    );

    // Fuerza un refresh del `UnifiedFeed` (posteo nuevo desde el composer,
    // que vive en el header de la lista, fuera del componente del feed).
    const [feedRefreshKey, setFeedRefreshKey] = useState(0);

    /**
     * Los loops NO se derivan del feed general: el ranking "forYou" puede no
     * traer ningún video en las primeras páginas y la pestaña quedaba vacía
     * aunque el video existiera. `mode: 'videos'` va directo al índice
     * by_type_created y devuelve todos los videos, del más nuevo al más viejo.
     *
     * Esto eran ~65 líneas de cursor + acumulación + dedupe escritas a mano
     * acá: la cuarta copia de la misma lógica. `useSocialFeed` ya la tiene, y
     * además sólo resetea cuando cambia la IDENTIDAD del feed (modo, autor,
     * sesión), no en cada actualización reactiva de la página 1 — que es justo
     * el colapso del scroll infinito que se arregló en E-092.
     */
    const {
        posts: reelPosts,
        isLoadingFirstPage: reelsLoading,
        loadMore: handleReelsEndReached,
    } = useSocialFeed({ mode: 'videos', pageSize: 20 });

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
                if (Platform.OS !== 'web') {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
                show('Agregado al carrito', 'success');
                if (OPEN_CART_AFTER_ADD) openCart();
            } catch (e: any) {
                // El detalle lo muestra CartContext; acá sólo se cierra el
                // ciclo háptico, que antes quedaba mudo al fallar.
                if (Platform.OS !== 'web') {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                }
            } finally {
                setAddingToCart(false);
            }
        },
        [sessionToken, addingToCart, addPostProduct, openCart, show],
    );

    /**
     * Antes acá había dos botones escritos a mano ("Para ti" / "Siguiendo").
     * Ahora las tabs son datos y las sirve `useFeedTabs`, así que sumar
     * "Comunidades" — y más adelante una tab por comunidad fijada — no toca
     * esta pantalla.
     */
    const renderFeedModeTabs = () => (
        <>
            <PinnedCommunityTabs onLoaded={setPinnedCommunities} />
            <FeedTabBar
                tabs={feedTabs.tabs}
                activeKey={feedTabs.activeKey}
                onChange={feedTabs.setActiveKey}
                onUnpin={handleUnpinCommunity}
                onDiscover={() => navigation.navigate('Communities')}
            />
        </>
    );

    const renderTabs = () => (
        <View
            style={[
                styles.tabContainer,
                activeTab === 'reels' && styles.tabContainerAbsolute,
                // Sobre el video los tabs flotan, así que el offset tiene que
                // salir del safe area real y no de un `Platform.OS` fijo.
                activeTab === 'reels' && { top: insets.top + Space[2] },
            ]}
        >
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
                            {/* El ícono de comunidades vivía acá y era la ÚNICA
                                puerta de entrada — invisible en la pestaña
                                Loops, además. Ahora las comunidades son una
                                tab del feed y el chip "Descubrir" de
                                `FeedTabBar` lleva al directorio. */}
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
                    mode={feedTabs.source.mode}
                    communityId={feedTabs.source.communityId}
                    refreshKey={feedRefreshKey}
                    listEmptyComponent={
                        feedTabs.activeKey === 'communities' ? (
                            <EmptyCommunitiesFeed
                                onOpenDirectory={() => navigation.navigate('Communities')}
                                onOpenCommunity={(communityId) =>
                                    navigation.navigate('CommunityDetail', { communityId })
                                }
                            />
                        ) : null
                    }
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
                    {reelsLoading ? (
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
            // `top` lo inyecta el componente desde `insets.top`.
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

        /* Los estilos feedMode* murieron con renderFeedModeTabs: las tabs de fuente ahora las dibuja FeedTabBar con sus propios tokens. */

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

        // `fab` y `fabGradient` vivían acá sin que ningún JSX los usara, con un
        // `bottom` de `Platform.OS` que no llegaba a la pantalla. Eliminados.
    });
};
