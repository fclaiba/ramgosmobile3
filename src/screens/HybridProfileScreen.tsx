import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    TouchableOpacity,
    Image,
    Platform,
    FlatList,
    Share,
    ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Grid, ShoppingBag, Ticket, Star, ChevronLeft, Share2, Copy, SearchX, TrendingUp } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Radius } from '../theme/tokens';
import { userProfileLink } from '../config/appOrigin';
import { UnifiedFeed } from '../components/social/UnifiedFeed';
import { CreatorEarningsPanel } from '../components/social/CreatorEarningsPanel';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { formatCompactCount } from '../utils/formatCompactCount';

const { width } = Dimensions.get('window');

type TabType = 'feed' | 'catalogo' | 'bonos' | 'ingresos';

export function HybridProfileScreen({ route, navigation }: any) {
    const { userId: routeUserId, handle } = route?.params || {};
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { user: authUser, sessionToken } = useAuth();
    const { show } = useToast();
    const [activeTab, setActiveTab] = useState<TabType>('feed');
    const isOwnProfile =
        !!authUser?.id && String(authUser.id) === String(routeUserId ?? '');

    const userByHandle = useQuery(api.users.getUserByHandle, !routeUserId && handle ? { handle } : "skip");
    const profileById = useQuery(api.users.getUser, routeUserId ? { id: routeUserId as Id<'users'> } : "skip");
    const profile = handle ? userByHandle : profileById;

    const resolvedUserId = profile?._id;

    const profileId =
        typeof resolvedUserId === 'string' && resolvedUserId.length > 10
            ? (resolvedUserId as Id<'users'>)
            : null;


    const socialStats = useQuery(
        api.social.getPublicSocialStats,
        profileId ? { userId: String(profileId) } : 'skip',
    );
    const listings = useQuery(
        api.listings.getPublicListingsBySeller,
        profileId ? { sellerId: String(profileId) } : 'skip',
    );



    const catalogItems = useMemo(() => {
        const rows = listings || [];
        return rows.filter((l: any) => (l.type || l.listingType) !== 'bono');
    }, [listings]);

    const bonoItems = useMemo(() => {
        const rows = listings || [];
        return rows.filter((l: any) => (l.type || l.listingType) === 'bono');
    }, [listings]);

    const handleShare = async () => {
        const name = profile?.name || 'Perfil';
        const url = userProfileLink(profile?.username || '');
        try {
            await Share.share({
                title: name,
                message: url ? `Mirá el perfil de ${name} en Ramgos\n${url}` : `Mirá el perfil de ${name} en Ramgos`,
                url: url || undefined,
            });
        } catch {
            /* cancelled */
        }
    };

    const openItem = (item: any) => {
        navigation.navigate('ItemDetail', {
            itemId: String(item._id || item.id),
            itemData: item,
        });
    };

    const renderListing = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={[styles.listingCard, { backgroundColor: isDark ? '#111827' : '#FFF' }]}
            onPress={() => openItem(item)}
            activeOpacity={0.85}
        >
            <ImageWithFallback
                src={item.image || item.images?.[0]?.url}
                style={styles.listingImg}
            />
            <View style={{ flex: 1, paddingHorizontal: 12 }}>
                <Text style={[styles.listingTitle, { color: isDark ? '#FFF' : '#111' }]} numberOfLines={2}>
                    {item.title || item.name}
                </Text>
                <Text style={styles.listingPrice}>${item.price}</Text>
            </View>
        </TouchableOpacity>
    );

    if (profileId && profile === undefined) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color="#4F46E5" />
            </View>
        );
    }

    const displayName = profile?.nickname || profile?.name || 'Usuario';
    const username = (profile as any)?.username || 'usuario';
    const avatar = profile?.avatar || 'https://i.pravatar.cc/150?u=ramgos';
    const bio = profile?.bio || '';
    const followers = socialStats?.followerCount ?? 0;
    const following = socialStats?.followingCount ?? 0;
    const rating = profile?.sellerRating ?? 0;

    const openFollowersList = () => {
        if (!profileId) return;
        if (!authUser || !sessionToken) {
            show('Iniciá sesión para ver la lista de seguidores', 'warning');
            return;
        }
        navigation.navigate('UserList', {
            type: 'followers',
            userId: String(profileId),
        });
    };

    const renderHeader = () => (
        <View style={styles.headerContainer}>
            <LinearGradient
                colors={isDark ? ['#1E1B4B', '#312E81', '#000000'] : ['#E0E7FF', '#C7D2FE', '#F3F4F6']}
                style={StyleSheet.absoluteFill}
            />

            <View style={styles.topNav}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => {
                    if (navigation.canGoBack()) {
                        navigation.goBack();
                    } else {
                        navigation.replace('Home');
                    }
                }}>
                    <ChevronLeft size={24} color={isDark ? '#FFF' : '#000'} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={handleShare}>
                    <Share2 size={22} color={isDark ? '#FFF' : '#000'} />
                </TouchableOpacity>
            </View>

            <View style={styles.profileInfo}>
                <Image source={{ uri: avatar }} style={styles.avatar} />
                <View style={styles.nameRow}>
                    <Text style={[styles.name, !isDark && { color: '#111827' }]}>{displayName}</Text>
                    {profile?.role === 'influencer' && (
                        <View style={styles.badge}>
                            <Star size={10} color="#FCD34D" fill="#FCD34D" />
                            <Text style={styles.badgeText}>PRO</Text>
                        </View>
                    )}
                </View>
                <Text style={[styles.username, !isDark && { color: '#6B7280' }]}>@{username}</Text>

                <TouchableOpacity 
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 8, gap: 6 }}
                    onPress={async () => {
                        const url = userProfileLink(profile?.username || '');
                        await Clipboard.setStringAsync(url);
                        show('Enlace copiado al portapapeles', 'success');
                    }}
                >
                    <Text style={{ fontSize: 12, color: isDark ? '#60A5FA' : '#2563EB', textDecorationLine: 'underline' }}>
                        {userProfileLink(profile?.username || '').replace(/^https?:\/\//, '')}
                    </Text>
                    <Copy size={12} color={isDark ? '#60A5FA' : '#2563EB'} />
                </TouchableOpacity>

                {bio ? (
                    <Text style={[styles.bio, !isDark && { color: '#374151' }]}>{bio}</Text>
                ) : null}

                <View style={styles.statsRow}>
                    <TouchableOpacity
                        style={styles.statBox}
                        onPress={openFollowersList}
                        accessibilityRole="button"
                        accessibilityLabel="Ver seguidores"
                    >
                        <Text style={styles.statValue}>{formatCompactCount(followers)}</Text>
                        <Text style={styles.statLabel}>Seguidores</Text>
                    </TouchableOpacity>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{formatCompactCount(following)}</Text>
                        <Text style={styles.statLabel}>Seguidos</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{Number(rating).toFixed(1)}</Text>
                        <Text style={styles.statLabel}>Rating</Text>
                    </View>
                </View>
            </View>

            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'feed' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('feed')}
                >
                    <Grid size={20} color={activeTab === 'feed' ? (isDark ? '#FFF' : '#000') : '#9CA3AF'} />
                    <Text style={[styles.tabText, activeTab === 'feed' && styles.tabTextActive]}>Feed</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'catalogo' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('catalogo')}
                >
                    <ShoppingBag
                        size={20}
                        color={activeTab === 'catalogo' ? (isDark ? '#FFF' : '#000') : '#9CA3AF'}
                    />
                    <Text style={[styles.tabText, activeTab === 'catalogo' && styles.tabTextActive]}>
                        Catálogo
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'bonos' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('bonos')}
                >
                    <Ticket size={20} color={activeTab === 'bonos' ? (isDark ? '#FFF' : '#000') : '#9CA3AF'} />
                    <Text style={[styles.tabText, activeTab === 'bonos' && styles.tabTextActive]}>Bonos</Text>
                </TouchableOpacity>
                {isOwnProfile && (
                    <TouchableOpacity
                        style={[styles.tabBtn, activeTab === 'ingresos' && styles.tabBtnActive]}
                        onPress={() => setActiveTab('ingresos')}
                    >
                        <TrendingUp size={20} color={activeTab === 'ingresos' ? (isDark ? '#FFF' : '#000') : '#9CA3AF'} />
                        <Text style={[styles.tabText, activeTab === 'ingresos' && styles.tabTextActive]}>Ingresos</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );

    if (!profileId) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, backgroundColor: isDark ? '#000' : '#F9FAFB' }]}>
                <View style={{
                    width: 120, height: 120, borderRadius: 60,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
                    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                }}>
                    <SearchX size={56} color={isDark ? '#4B5563' : '#9CA3AF'} strokeWidth={1.5} />
                </View>
                <Text style={{ fontSize: 24, fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827', textAlign: 'center', marginBottom: 12 }}>Perfil no encontrado</Text>
                <Text style={{ fontSize: 16, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', lineHeight: 24, marginBottom: 32 }}>El creador o negocio que buscas no existe, o el enlace es incorrecto.</Text>
                
                <TouchableOpacity 
                    style={[{ width: '100%', paddingVertical: 16, backgroundColor: isDark ? '#374151' : '#E5E7EB', borderRadius: 12 }]} 
                    onPress={() => {
                        if (navigation.canGoBack()) {
                            navigation.goBack();
                        } else {
                            navigation.replace('Home');
                        }
                    }}
                    activeOpacity={0.8}
                >
                    <Text style={{ color: isDark ? '#FFF' : '#111827', fontWeight: '700', fontSize: 16, textAlign: 'center' }}>Volver al Inicio</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#F9FAFB' }]}>
            {renderHeader()}

            <View style={styles.contentContainer}>
                {activeTab === 'feed' && profileId && (
                    <UnifiedFeed authorUserId={String(profileId)} />
                )}

                {activeTab === 'ingresos' && <CreatorEarningsPanel />}

                {activeTab === 'catalogo' && (
                    listings === undefined ? (
                        <View style={styles.center}>
                            <ActivityIndicator color="#4F46E5" />
                        </View>
                    ) : catalogItems.length === 0 ? (
                        <View style={styles.placeholderContainer}>
                            <ShoppingBag size={48} color="#9CA3AF" />
                            <Text style={styles.placeholderText}>Catálogo vacío</Text>
                            <Text style={styles.placeholderSub}>
                                Este creador aún no publicó productos o servicios.
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={catalogItems}
                            keyExtractor={(item: any) => String(item._id || item.id)}
                            renderItem={renderListing}
                            contentContainerStyle={{ padding: 16, gap: 10 }}
                        />
                    )
                )}

                {activeTab === 'bonos' && (
                    listings === undefined ? (
                        <View style={styles.center}>
                            <ActivityIndicator color="#4F46E5" />
                        </View>
                    ) : bonoItems.length === 0 ? (
                        <View style={styles.placeholderContainer}>
                            <Ticket size={48} color="#9CA3AF" />
                            <Text style={styles.placeholderText}>Sin bonos</Text>
                            <Text style={styles.placeholderSub}>
                                Todavía no hay bonos públicos de este perfil.
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={bonoItems}
                            keyExtractor={(item: any) => String(item._id || item.id)}
                            renderItem={renderListing}
                            contentContainerStyle={{ padding: 16, gap: 10 }}
                        />
                    )
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerContainer: {
        paddingTop: Platform.OS === 'ios' ? 50 : 30,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(156, 163, 175, 0.2)',
        position: 'relative',
    },
    topNav: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileInfo: {
        alignItems: 'center',
        marginBottom: 24,
    },
    avatar: {
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 3,
        borderColor: '#4F46E5',
        marginBottom: 16,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    name: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(252, 211, 77, 0.3)',
        gap: 4,
    },
    badgeText: {
        color: '#FCD34D',
        fontSize: 10,
        fontWeight: 'bold',
    },
    username: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 12,
    },
    bio: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
        textAlign: 'center',
        marginBottom: 20,
        paddingHorizontal: 20,
        lineHeight: 20,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 24,
        gap: 20,
    },
    statBox: { alignItems: 'center' },
    statValue: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
    statDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.2)' },
    tabBar: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: 'rgba(156, 163, 175, 0.2)',
    },
    tabBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 8,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabBtnActive: { borderBottomColor: '#4F46E5' },
    tabText: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
    tabTextActive: { color: '#4F46E5' },
    contentContainer: { flex: 1 },
    placeholderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    placeholderText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#9CA3AF',
        marginTop: 16,
        marginBottom: 8,
    },
    placeholderSub: {
        fontSize: 14,
        color: '#9CA3AF',
        textAlign: 'center',
    },
    listingCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: Radius.lg,
        overflow: 'hidden',
        marginBottom: 10,
    },
    listingImg: { width: 72, height: 72 },
    listingTitle: { fontSize: 14, fontWeight: '700' },
    listingPrice: { fontSize: 15, fontWeight: '800', color: '#10B981', marginTop: 4 },
});
