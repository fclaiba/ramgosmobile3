import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    useWindowDimensions,
    Platform,
    StatusBar,
    ScrollView,
    ActivityIndicator,
    Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    ChevronLeft,
    Star,
    Heart,
    Building2,
    UserCircle,
    ShieldCheck,
    MessageCircle,
    UserPlus,
    UserCheck,
    MapPin,
    Calendar,
    Clock,
    MoreVertical,
    Package,
    Ticket,
    PartyPopper,
    Briefcase,
    ShoppingCart,
    Share2,
    ShoppingBag,
    Wrench,
    Tag,
} from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useCart } from '../contexts/CartContext';
import { useSocial } from '../contexts/SocialContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { DirectMessages } from '../components/social/DirectMessages';
import Animated, { useAnimatedStyle, useSharedValue, useAnimatedScrollHandler, interpolate, Extrapolation } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

const HERO_HEIGHT = 260;
const MIN_HEADER_HEIGHT = Platform.OS === 'ios' ? 90 : 72;

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

type TabType = 'product' | 'service' | 'event' | 'bono';

const typeMeta: Record<TabType, { label: string; icon: any; color: string }> = {
    product: { label: 'Producto', icon: ShoppingBag, color: '#8B5CF6' },
    service: { label: 'Servicio', icon: Wrench, color: '#38BDF8' },
    event: { label: 'Evento', icon: Calendar, color: '#F59E0B' },
    bono: { label: 'Bono', icon: Tag, color: '#10B981' },
};

const AnimatedButton = ({ onPress, style, children, isDark, active = true }: any) => {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: active ? 1 : 0.5,
    }));

    const handlePressIn = () => {
        if (!active) return;
        scale.value = 0.96;
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handlePressOut = () => {
        scale.value = 1;
    };

    return (
        <AnimatedTouchable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={active ? onPress : undefined}
            style={[style, animatedStyle]}
            activeOpacity={0.9}
        >
            {children}
        </AnimatedTouchable>
    );
};

export default function CommercialProfileScreen({ navigation, route }: any) {
    const sellerId = route?.params?.sellerId;
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark, insets);

    const { isFavorite, toggleFavorite } = useFavorites();
    const { addItem, openCart } = useCart();
    const { followUser, unfollowUser, isFollowing, createChat } = useSocial();
    const { user: authUser } = useAuth();
    const { show } = useToast();

    const [activeTab, setActiveTab] = useState<TabType>('product');
    const [followLoading, setFollowLoading] = useState(false);
    const [dmOpen, setDmOpen] = useState(false);
    const [contactLoading, setContactLoading] = useState(false);

    const profile = useQuery(api.users.getUser, sellerId ? { id: sellerId as any } : "skip");
    const allListings = useQuery(api.listings.getFeed);

    const listings = useMemo(() => {
        if (!allListings) return [];
        return allListings.filter((l: any) => (l.seller as any)?.id === sellerId || l.sellerId === sellerId);
    }, [allListings, sellerId]);

    const activeItems = useMemo(() => {
        return listings.filter((item: any) => (item.listingType || item.type || 'product') === activeTab);
    }, [listings, activeTab]);

    const scrollY = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => { scrollY.value = event.contentOffset.y; },
    });

    const isBusiness = profile?.role === 'business';
    const isVerified = isBusiness || profile?.kycStatus === 'approved';
    const alreadyFollowing = sellerId ? isFollowing(sellerId) : false;

    const tabs: { id: TabType; label: string; icon: any }[] = [
        { id: 'product', label: 'Productos', icon: Package },
        { id: 'service', label: 'Servicios', icon: Briefcase },
        { id: 'event', label: 'Eventos', icon: PartyPopper },
        { id: 'bono', label: 'Bonos', icon: Ticket },
    ];

    const handleAddToCart = (item: any) => {
        addItem({
            id: String(item._id || item.id),
            name: item.title || item.name,
            price: item.price,
            image: item.image || item.images?.[0]?.url,
            type: item.listingType || item.type || 'product',
            location: item.location?.name || '',
            sellerId: item.seller?.id || item.sellerId,
            sellerName: item.seller?.name || item.sellerName,
            condition: item.condition,
            shippingWeightKg: item.shippingProfile?.weightKg,
            shippingDimensionsCm: item.shippingProfile?.dimensionsCm,
            distanceKm: item.location?.distanceKm,
            quantity: 1,
        });
        openCart();
    };

    const handleToggleFollow = async () => {
        if (!sellerId || !authUser) {
            show('Inicia sesión para seguir a este usuario', 'warning');
            return;
        }
        setFollowLoading(true);
        try {
            if (alreadyFollowing) {
                unfollowUser(sellerId);
            } else {
                followUser(sellerId);
            }
        } catch (err) {
            console.warn('[CommercialProfile] follow toggle failed', err);
            show('Error al actualizar seguimiento', 'error');
        } finally {
            setTimeout(() => setFollowLoading(false), 500);
        }
    };

    const handleContact = async () => {
        if (!sellerId || !authUser) {
            show('Inicia sesión para contactar a este vendedor', 'warning');
            return;
        }
        setContactLoading(true);
        try {
            await createChat(sellerId);
            setDmOpen(true);
        } catch (err) {
            console.warn('[CommercialProfile] createChat failed', err);
            show('Error al iniciar conversación', 'error');
        } finally {
            setContactLoading(false);
        }
    };

    const handleShare = async () => {
        try {
            await Share.share({
                title: profile?.name || 'Perfil comercial',
                message: `Mirá el perfil de ${profile?.name || 'este vendedor'} en Ramgos`,
            });
        } catch (e) { /* ignore */ }
    };

    const headerOpacity = useAnimatedStyle(() => ({
        opacity: interpolate(scrollY.value, [HERO_HEIGHT - MIN_HEADER_HEIGHT - 40, HERO_HEIGHT - MIN_HEADER_HEIGHT + 20], [0, 1], Extrapolation.CLAMP),
    }));

    const renderGridItem = ({ item }: any) => {
        const saved = isFavorite(item._id || item.id);
        const imageUrl = item.image || item.images?.[0]?.url;
        const meta = typeMeta[(item.listingType || item.type || 'product') as TabType] || typeMeta.product;
        const TypeIcon = meta.icon;

        return (
            <TouchableOpacity
                style={[styles.gridCard, { width: (width - 48) / 2 }]}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('ItemDetail', { itemId: item._id || item.id, itemData: item })}
            >
                <View style={styles.gridImgContainer}>
                    <ImageWithFallback src={imageUrl} style={styles.cardImg} />
                    <View style={[styles.typePill, { backgroundColor: `${meta.color}20` }]}>
                        <TypeIcon size={10} color={meta.color} />
                        <Text style={[styles.typePillText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.favBtn, saved && styles.favBtnActive]}
                        onPress={(e) => {
                            e.stopPropagation();
                            toggleFavorite({ id: item._id || item.id, type: item.listingType || item.type || 'product' });
                        }}
                    >
                        <Heart size={16} color={saved ? '#EF4444' : (isDark ? '#E5E7EB' : '#4B5563')} fill={saved ? '#EF4444' : 'transparent'} />
                    </TouchableOpacity>
                </View>

                <View style={styles.gridContent}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{item.title || item.name}</Text>
                    <View style={styles.priceRow}>
                        {item.originalPrice ? (
                            <Text style={styles.originalPrice}>${item.originalPrice}</Text>
                        ) : null}
                        <Text style={styles.price}>${item.price}</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.btnSm}
                        onPress={(e) => {
                            e.stopPropagation();
                            handleAddToCart(item);
                        }}
                    >
                        <ShoppingCart size={14} color={isDark ? '#E5E7EB' : '#374151'} style={{ marginRight: 6 }} />
                        <Text style={styles.btnSmText}>Agregar</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        );
    };

    const renderHeader = () => (
        <View>
            {/* Hero cover */}
            <View style={styles.heroContainer}>
                {(profile as any)?.coverImage ? (
                    <ImageWithFallback src={(profile as any).coverImage} style={styles.heroImage} resizeMode="cover" />
                ) : (
                    <LinearGradient
                        colors={isDark ? ['#1F2937', '#111827'] : ['#E0E7FF', '#F9FAFB']}
                        style={StyleSheet.absoluteFill}
                    />
                )}
                <LinearGradient colors={['transparent', isDark ? '#09090B' : '#FFFFFF']} style={styles.heroGradient} />
            </View>

            {/* Floating top bar */}
            <View style={[styles.topBar, { top: insets.top + 8 }]}>
                <AnimatedButton style={styles.glassBtn} onPress={() => navigation.goBack()} isDark={isDark}>
                    <ChevronLeft size={24} color={isDark ? '#FFF' : '#000'} />
                </AnimatedButton>
                <View style={styles.topBarActions}>
                    <AnimatedButton style={styles.glassBtn} onPress={handleShare} isDark={isDark}>
                        <Share2 size={20} color={isDark ? '#FFF' : '#000'} />
                    </AnimatedButton>
                    <AnimatedButton style={styles.glassBtn} onPress={() => {}} isDark={isDark}>
                        <MoreVertical size={20} color={isDark ? '#FFF' : '#000'} />
                    </AnimatedButton>
                </View>
            </View>

            {/* Profile header card */}
            <View style={styles.profileCard}>
                <View style={styles.avatarWrapper}>
                    {profile?.avatar ? (
                        <ImageWithFallback src={profile.avatar} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                            {isBusiness ? (
                                <Building2 size={36} color={isDark ? '#9CA3AF' : '#6B7280'} />
                            ) : (
                                <UserCircle size={36} color={isDark ? '#9CA3AF' : '#6B7280'} />
                            )}
                        </View>
                    )}
                    {isVerified && (
                        <View style={styles.verifiedBadge}>
                            <ShieldCheck size={16} color="#fff" fill="#2563EB" />
                        </View>
                    )}
                </View>

                <Text style={styles.name}>{profile?.name || 'Usuario Comercial'}</Text>

                <View style={styles.handleRow}>
                    <Text style={styles.handle}>@{profile?.name?.toLowerCase().replace(/\s+/g, '') || 'usuario'}</Text>
                    <View style={[styles.roleTag, isBusiness ? styles.roleTagBusiness : styles.roleTagInfluencer]}>
                        <Text style={styles.roleTagText}>{isBusiness ? 'Negocio verificado' : 'Vendedor'}</Text>
                    </View>
                </View>

                {profile?.bio ? (
                    <Text style={styles.bio}>{profile.bio}</Text>
                ) : null}

                <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                        <MapPin size={14} color={isDark ? '#9CA3AF' : '#6B7280'} />
                        <Text style={styles.metaText}>{(profile as any)?.location?.name || (profile as any)?.location?.city || 'Nueva York, NY'}</Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Calendar size={14} color={isDark ? '#9CA3AF' : '#6B7280'} />
                        <Text style={styles.metaText}>Desde {profile?.joinedAt ? new Date(profile.joinedAt).getFullYear() : '2025'}</Text>
                    </View>
                </View>

                {/* Stats */}
                <View style={styles.statsContainer}>
                    <View style={styles.statBox}>
                        <View style={styles.statValueRow}>
                            <Star size={16} color="#F59E0B" fill="#F59E0B" />
                            <Text style={styles.statValue}>{profile?.sellerRating?.toFixed(1) || '4.9'}</Text>
                        </View>
                        <Text style={styles.statLabel}>{profile?.sellerReviewCount || 120} reseñas</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{profile?.sellerTotalSales || 350}+</Text>
                        <Text style={styles.statLabel}>Ventas</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                        <View style={styles.statValueRow}>
                            <Clock size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                            <Text style={styles.statValue}>{profile?.sellerResponseTimeHours || '< 1'}h</Text>
                        </View>
                        <Text style={styles.statLabel}>Respuesta</Text>
                    </View>
                </View>

                {/* Actions */}
                <View style={styles.actionRow}>
                    <TouchableOpacity
                        style={[styles.primaryBtn, alreadyFollowing && styles.followingBtn]}
                        onPress={handleToggleFollow}
                        disabled={followLoading}
                    >
                        {followLoading ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : alreadyFollowing ? (
                            <>
                                <UserCheck size={18} color={isDark ? '#F9FAFB' : '#111827'} />
                                <Text style={[styles.primaryBtnText, styles.followingBtnText]}>Siguiendo</Text>
                            </>
                        ) : (
                            <>
                                <UserPlus size={18} color="#FFFFFF" />
                                <Text style={styles.primaryBtnText}>Seguir</Text>
                            </>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.secondaryBtn}
                        onPress={handleContact}
                        disabled={contactLoading}
                    >
                        {contactLoading ? (
                            <ActivityIndicator size="small" color={isDark ? '#F9FAFB' : '#111827'} />
                        ) : (
                            <>
                                <MessageCircle size={18} color={isDark ? '#F9FAFB' : '#111827'} />
                                <Text style={styles.secondaryBtnText}>Contactar</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Tabs */}
            <View style={styles.tabsContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll} nestedScrollEnabled>
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <TouchableOpacity
                                key={tab.id}
                                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                                onPress={() => setActiveTab(tab.id)}
                            >
                                <Icon size={16} color={isActive ? '#fff' : (isDark ? '#9CA3AF' : '#6B7280')} />
                                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                                    {tab.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Sticky header */}
            <Animated.View style={[styles.stickyHeader, headerOpacity]}>
                <AnimatedBlurView tint={isDark ? 'dark' : 'light'} intensity={90} style={StyleSheet.absoluteFill} />
                <View style={[styles.stickyHeaderContent, { paddingTop: insets.top }]}>
                    <Text style={styles.stickyHeaderTitle} numberOfLines={1}>{profile?.name || 'Perfil comercial'}</Text>
                </View>
            </Animated.View>

            <FlatList
                data={activeItems}
                keyExtractor={(item: any) => (item._id || item.id).toString()}
                numColumns={2}
                renderItem={renderGridItem}
                columnWrapperStyle={styles.gridColumnWrapper}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={renderHeader}
                ListEmptyComponent={() => (
                    <View style={styles.emptyContainer}>
                        <Package size={48} color={isDark ? '#374151' : '#E5E7EB'} />
                        <Text style={styles.emptyText}>No hay {tabs.find(t => t.id === activeTab)?.label.toLowerCase()} disponibles.</Text>
                    </View>
                )}
            />

            {/* Direct Messages Sheet */}
            {dmOpen && (
                <DirectMessages onClose={() => setDmOpen(false)} initialUserId={sellerId} />
            )}
        </View>
    );
}

function getStyles(isDark: boolean, insets: any) {
    const bg = isDark ? '#09090B' : '#FFFFFF';
    const surface = isDark ? '#18181B' : '#F9FAFB';
    const text = isDark ? '#FAFAFA' : '#111827';
    const muted = isDark ? '#A1A1AA' : '#6B7280';
    const border = isDark ? '#27272A' : '#E5E7EB';
    const primary = isDark ? '#8B5CF6' : '#7C3AED';
    const price = isDark ? '#34D399' : '#10B981';

    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: bg,
        },

        stickyHeader: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            overflow: 'hidden',
            height: MIN_HEADER_HEIGHT + insets.top,
        },
        stickyHeaderContent: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 60,
        },
        stickyHeaderTitle: {
            color: text,
            fontSize: 16,
            fontWeight: '700',
        },

        heroContainer: {
            width: '100%',
            height: HERO_HEIGHT,
            position: 'relative',
            backgroundColor: isDark ? '#1F2937' : '#E0E7FF',
        },
        heroImage: {
            width: '100%',
            height: '100%',
        },
        heroGradient: {
            position: 'absolute',
            bottom: -2,
            left: 0,
            right: 0,
            height: 120,
        },

        topBar: {
            position: 'absolute',
            left: 16,
            right: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
            zIndex: 100,
        },
        topBarActions: { flexDirection: 'row', gap: 10 },
        glassBtn: {
            width: 42,
            height: 42,
            borderRadius: 21,
            overflow: 'hidden',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.9)',
        },

        profileCard: {
            backgroundColor: bg,
            borderRadius: 28,
            marginTop: -60,
            marginHorizontal: 16,
            padding: 24,
            paddingTop: 0,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: border,
        },
        avatarWrapper: {
            position: 'relative',
            marginTop: -50,
            marginBottom: 16,
        },
        avatar: {
            width: 100,
            height: 100,
            borderRadius: 50,
            borderWidth: 4,
            borderColor: bg,
            backgroundColor: surface,
        },
        avatarPlaceholder: {
            justifyContent: 'center',
            alignItems: 'center',
        },
        verifiedBadge: {
            position: 'absolute',
            bottom: 4,
            right: 4,
            backgroundColor: isDark ? '#111827' : '#FFFFFF',
            borderRadius: 12,
            padding: 3,
        },
        name: {
            fontSize: 26,
            fontWeight: '800',
            color: text,
            marginBottom: 6,
            textAlign: 'center',
        },
        handleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginBottom: 14,
        },
        handle: {
            fontSize: 15,
            color: muted,
            fontWeight: '500',
        },
        roleTag: {
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 10,
        },
        roleTagBusiness: {
            backgroundColor: '#2563EB',
        },
        roleTagInfluencer: {
            backgroundColor: primary,
        },
        roleTagText: {
            color: '#FFFFFF',
            fontSize: 11,
            fontWeight: '700',
        },
        bio: {
            fontSize: 15,
            color: muted,
            textAlign: 'center',
            marginBottom: 18,
            lineHeight: 22,
        },
        metaRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            marginBottom: 22,
        },
        metaItem: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        metaText: {
            fontSize: 13,
            color: muted,
            fontWeight: '500',
        },
        statsContainer: {
            flexDirection: 'row',
            backgroundColor: surface,
            borderRadius: 18,
            paddingVertical: 16,
            paddingHorizontal: 20,
            width: '100%',
            marginBottom: 22,
            borderWidth: 1,
            borderColor: border,
        },
        statBox: {
            flex: 1,
            alignItems: 'center',
        },
        statValueRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginBottom: 4,
        },
        statValue: {
            fontSize: 17,
            fontWeight: '800',
            color: text,
        },
        statLabel: {
            fontSize: 12,
            color: muted,
            fontWeight: '500',
        },
        statDivider: {
            width: 1,
            backgroundColor: border,
            marginHorizontal: 10,
        },
        actionRow: {
            flexDirection: 'row',
            gap: 12,
            width: '100%',
        },
        primaryBtn: {
            flex: 1,
            flexDirection: 'row',
            backgroundColor: primary,
            paddingVertical: 14,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
        },
        primaryBtnText: {
            color: '#FFFFFF',
            fontWeight: '700',
            fontSize: 15,
        },
        secondaryBtn: {
            flex: 1,
            flexDirection: 'row',
            backgroundColor: surface,
            paddingVertical: 14,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: border,
        },
        secondaryBtnText: {
            color: text,
            fontWeight: '700',
            fontSize: 15,
        },
        followingBtn: {
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: border,
        },
        followingBtnText: {
            color: text,
        },

        tabsContainer: {
            borderBottomWidth: 1,
            borderBottomColor: border,
            backgroundColor: bg,
            marginTop: 8,
        },
        tabsScroll: {
            paddingHorizontal: 16,
            gap: 10,
            paddingVertical: 14,
        },
        tabBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 20,
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: border,
        },
        tabBtnActive: {
            backgroundColor: primary,
            borderColor: primary,
        },
        tabText: {
            fontSize: 14,
            fontWeight: '600',
            color: muted,
        },
        tabTextActive: {
            color: '#FFFFFF',
        },

        scrollContent: {
            paddingBottom: 100,
        },
        gridColumnWrapper: {
            paddingHorizontal: 16,
            gap: 16,
        },
        gridCard: {
            backgroundColor: surface,
            borderRadius: 18,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: border,
            marginBottom: 16,
        },
        gridImgContainer: {
            width: '100%',
            height: 150,
            backgroundColor: border,
            position: 'relative',
        },
        cardImg: {
            width: '100%',
            height: '100%',
        },
        typePill: {
            position: 'absolute',
            top: 10,
            left: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 10,
        },
        typePillText: {
            fontSize: 10,
            fontWeight: '800',
        },
        favBtn: {
            position: 'absolute',
            top: 10,
            right: 10,
            width: 32,
            height: 32,
            borderRadius: 16,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
            borderWidth: 1,
            borderColor: isDark ? '#374151' : '#F3F4F6',
        },
        favBtnActive: {
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 2,
        },
        gridContent: {
            padding: 12,
        },
        cardTitle: {
            fontSize: 14,
            fontWeight: '700',
            color: text,
            marginBottom: 8,
            lineHeight: 19,
        },
        priceRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
        },
        originalPrice: {
            fontSize: 13,
            color: muted,
            textDecorationLine: 'line-through',
            fontWeight: '500',
        },
        price: {
            fontSize: 17,
            fontWeight: '800',
            color: price,
        },
        btnSm: {
            flexDirection: 'row',
            backgroundColor: isDark ? '#27272A' : '#F3F4F6',
            paddingVertical: 9,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
        },
        btnSmText: {
            fontSize: 13,
            fontWeight: '700',
            color: text,
        },
        emptyContainer: {
            padding: 40,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
        },
        emptyText: {
            fontSize: 15,
            color: muted,
            textAlign: 'center',
        },
    });
}
