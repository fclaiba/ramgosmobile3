import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Image,
    useWindowDimensions,
    Platform,
    StatusBar,
    ScrollView,
    ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    ArrowLeft,
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
    Briefcase
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
import { ItemDetailView } from '../components/ItemDetailView';
import { DirectMessages } from '../components/social/DirectMessages';

type TabType = 'product' | 'service' | 'event' | 'bono';

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
    const [detailItemId, setDetailItemId] = useState<string | null>(null);
    const [followLoading, setFollowLoading] = useState(false);
    const [dmOpen, setDmOpen] = useState(false);
    const [contactLoading, setContactLoading] = useState(false);

    // Fetch Profile
    const profile = useQuery(api.users.getUser, sellerId ? { id: sellerId as any } : "skip");

    // Fetch Listings
    const allListings = useQuery(api.listings.getFeed);
    
    // Process items
    // In a real scenario, we'd also fetch influencerCampaigns if role === 'influencer'
    const listings = useMemo(() => {
        if (!allListings) return [];
        return allListings.filter(l => (l.seller as any)?.id === sellerId || l.sellerId === sellerId);
    }, [allListings, sellerId]);

    const activeItems = useMemo(() => {
        return listings.filter(item => (item.listingType || item.type || 'product') === activeTab);
    }, [listings, activeTab]);

    const handleAddToCart = (item: any) => {
        addItem({
            id: item._id || item.id,
            name: item.title || item.name,
            price: item.price,
            image: item.image || item.images?.[0]?.url,
            type: item.listingType || item.type || 'product',
            location: item.location?.name || '',
            sellerId: item.sellerId,
            sellerName: item.sellerName,
        });
        openCart();
    };

    const selectedItem = useMemo(() => listings.find(p => p._id === detailItemId || p.id === detailItemId), [listings, detailItemId]);

    const isBusiness = profile?.role === 'business';
    const isVerified = isBusiness || profile?.kycStatus === 'approved';

    const tabs: { id: TabType; label: string; icon: any }[] = [
        { id: 'product', label: 'Productos', icon: Package },
        { id: 'service', label: 'Servicios', icon: Briefcase },
        { id: 'event', label: 'Eventos', icon: PartyPopper },
        { id: 'bono', label: 'Bonos', icon: Ticket },
    ];

    // Follow state
    const alreadyFollowing = sellerId ? isFollowing(sellerId) : false;

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
            // Small delay so the reactive query catches up
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

    const renderGridItem = ({ item }: any) => {
        const saved = isFavorite(item._id || item.id);
        const imageUrl = item.image || item.images?.[0]?.url;

        return (
            <TouchableOpacity
                style={[styles.gridCard, { width: (width - 48) / 2 }]}
                activeOpacity={0.9}
                onPress={() => setDetailItemId(item._id || item.id)}
            >
                <View style={styles.gridImgContainer}>
                    <ImageWithFallback src={imageUrl} style={styles.cardImg} />
                    <TouchableOpacity
                        style={[styles.favBtn, saved && styles.favBtnActive]}
                        onPress={(e) => {
                            e.stopPropagation();
                            toggleFavorite({ id: item._id || item.id, type: item.listingType || item.type || 'product' } as any);
                        }}
                    >
                        <Heart size={16} color={saved ? styles.favIconActive.color : styles.iconMuted.color} fill={saved ? styles.favIconActive.color : 'transparent'} />
                    </TouchableOpacity>
                </View>

                <View style={styles.gridContent}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{item.title || item.name}</Text>
                    <View style={styles.priceRow}>
                        <Text style={styles.price}>${item.price}</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.btnSm}
                        onPress={(e) => {
                            e.stopPropagation();
                            handleAddToCart(item);
                        }}
                    >
                        <Text style={styles.btnSmText}>Agregar</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        );
    };

    const renderHeader = () => (
        <View style={styles.headerWrapper}>
            {/* Hero Cover */}
            <View style={styles.coverPhotoContainer}>
                {(profile as any)?.coverImage ? (
                    <Image source={{ uri: (profile as any).coverImage }} style={StyleSheet.absoluteFillObject} />
                ) : (
                    <LinearGradient
                        colors={styles.coverGradient as [string, string]}
                        style={StyleSheet.absoluteFillObject}
                    />
                )}
            </View>

            {/* Top Bar Floating */}
            <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft size={24} color={styles.iconMain.color} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.backBtn}>
                    <MoreVertical size={24} color={styles.iconMain.color} />
                </TouchableOpacity>
            </View>

            {/* Profile Info */}
            <View style={styles.profileHeader}>
                <View style={styles.avatarWrapper}>
                    {profile?.avatar ? (
                        <Image source={{ uri: profile.avatar }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                            {isBusiness ? (
                                <Building2 size={36} color={styles.iconMuted.color} />
                            ) : (
                                <UserCircle size={36} color={styles.iconMuted.color} />
                            )}
                        </View>
                    )}
                    {isVerified && (
                        <View style={styles.verifiedBadge}>
                            <ShieldCheck size={16} color={styles.verifiedBadgeIcon.color} fill={styles.verifiedBadgeIcon.backgroundColor} />
                        </View>
                    )}
                </View>

                <Text style={styles.name}>{profile?.name || 'Usuario Comercial'}</Text>
                
                <View style={styles.handleRow}>
                    <Text style={styles.handle}>@{profile?.name?.toLowerCase().replace(/\s+/g, '') || 'usuario'}</Text>
                    {isBusiness ? (
                        <View style={styles.roleTag}>
                            <Text style={styles.roleTagText}>Negocio</Text>
                        </View>
                    ) : (
                        <View style={[styles.roleTag, styles.roleTagInfluencer]}>
                            <Text style={styles.roleTagText}>Influencer</Text>
                        </View>
                    )}
                </View>

                {profile?.bio && (
                    <Text style={styles.bio}>{profile.bio}</Text>
                )}

                <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                        <MapPin size={14} color={styles.iconMuted.color} />
                        <Text style={styles.metaText}>Montevideo, UY</Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Calendar size={14} color={styles.iconMuted.color} />
                        <Text style={styles.metaText}>
                            Desde {profile?.joinedAt ? new Date(profile.joinedAt).getFullYear() : '2025'}
                        </Text>
                    </View>
                </View>

                {/* Stats */}
                <View style={styles.statsContainer}>
                    <View style={styles.statBox}>
                        <View style={styles.statValueRow}>
                            <Star size={16} color={styles.ratingStar.color} fill={styles.ratingStar.color} />
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
                            <Clock size={16} color={styles.iconMuted.color} />
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
                                <UserCheck size={18} color={styles.iconMain.color} />
                                <Text style={[styles.primaryBtnText, styles.followingBtnText]}>Siguiendo</Text>
                            </>
                        ) : (
                            <>
                                <UserPlus size={18} color={styles.primaryBtnIcon.color} />
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
                            <ActivityIndicator size="small" color={styles.iconMain.color} />
                        ) : (
                            <>
                                <MessageCircle size={18} color={styles.iconMain.color} />
                                <Text style={styles.secondaryBtnText}>Contactar</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Catalog Tabs */}
            <View style={styles.tabsContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <TouchableOpacity
                                key={tab.id}
                                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                                onPress={() => setActiveTab(tab.id)}
                            >
                                <Icon size={16} color={isActive ? styles.tabTextActive.color : styles.iconMuted.color} />
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
            <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
            
            <FlatList
                data={activeItems}
                keyExtractor={(item) => (item._id || item.id).toString()}
                numColumns={2}
                renderItem={renderGridItem}
                columnWrapperStyle={styles.gridColumnWrapper}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={renderHeader}
                ListEmptyComponent={() => (
                    <View style={styles.emptyContainer}>
                        <Package size={48} color={styles.emptyIcon.color} />
                        <Text style={styles.emptyText}>No hay {tabs.find(t => t.id === activeTab)?.label.toLowerCase()} disponibles.</Text>
                    </View>
                )}
            />

            {selectedItem && (
                <ItemDetailView
                    item={{ ...selectedItem, id: selectedItem._id || selectedItem.id, name: selectedItem.title, image: selectedItem.image || selectedItem.images?.[0]?.url, type: selectedItem.listingType || selectedItem.type } as any}
                    product={selectedItem}
                    onClose={() => setDetailItemId(null)}
                    onAddToCart={() => handleAddToCart(selectedItem)}
                    onOpenCart={openCart}
                />
            )}

            {/* Direct Messages Sheet */}
            {dmOpen && (
                <DirectMessages onClose={() => setDmOpen(false)} />
            )}
        </View>
    );
}

function getStyles(isDark: boolean, insets: any) {
    const bg = isDark ? '#111827' : '#F9FAFB';
    const cardBg = isDark ? '#1F2937' : '#FFFFFF';
    const textMain = isDark ? '#F9FAFB' : '#111827';
    const textMuted = isDark ? '#9CA3AF' : '#6B7280';
    const border = isDark ? '#374151' : '#E5E7EB';
    
    // Extracted dynamic colors for icons
    const iconMainColor = isDark ? '#F9FAFB' : '#111827';
    const iconMutedColor = isDark ? '#9CA3AF' : '#6B7280';
    const emptyIconColor = isDark ? '#374151' : '#E5E7EB';
    const btnSecondaryBg = isDark ? '#374151' : '#E5E7EB';
    const favBtnBg = isDark ? '#1F2937' : '#FFFFFF';
    const favBtnBorder = isDark ? '#374151' : '#F3F4F6';
    const btnSmBg = isDark ? '#374151' : '#F3F4F6';
    const backBtnBg = isDark ? 'rgba(31, 41, 55, 0.7)' : 'rgba(255, 255, 255, 0.8)';
    
    // Premium theme colors
    const primary = isDark ? '#8B5CF6' : '#7C3AED';
    const roleBusiness = isDark ? '#3B82F6' : '#2563EB';
    const roleInfluencer = primary;
    const price = isDark ? '#34D399' : '#10B981';
    const error = isDark ? '#F87171' : '#EF4444';
    const verifiedBg = isDark ? '#111827' : '#FFFFFF';
    const verifiedBadge = isDark ? '#3B82F6' : '#2563EB';
    const coverGradient = isDark ? ['#1F2937', '#111827'] : ['#E0E7FF', '#F9FAFB'];

    const rawColors = {
        iconMain: { color: iconMainColor },
        iconMuted: { color: iconMutedColor },
        emptyIcon: { color: emptyIconColor },
        ratingStar: { color: '#F59E0B' },
        favIconActive: { color: error },
        primaryBtnIcon: { color: '#FFFFFF' },
        verifiedBadgeIcon: { color: '#FFFFFF', backgroundColor: verifiedBadge },
        coverGradient: coverGradient,
    };

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: bg,
        },
        headerWrapper: {
            backgroundColor: bg,
        },
        coverPhotoContainer: {
            width: '100%',
            height: 180,
            backgroundColor: border,
        },
        topBar: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            zIndex: 10,
        },
        backBtn: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: backBtnBg,
            alignItems: 'center',
            justifyContent: 'center',
        },
        profileHeader: {
            paddingHorizontal: 24,
            paddingBottom: 24,
            marginTop: -50,
            alignItems: 'center',
        },
        avatarWrapper: {
            position: 'relative',
            marginBottom: 12,
        },
        avatar: {
            width: 100,
            height: 100,
            borderRadius: 50,
            borderWidth: 4,
            borderColor: bg,
            backgroundColor: cardBg,
        },
        avatarPlaceholder: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        verifiedBadge: {
            position: 'absolute',
            bottom: 4,
            right: 4,
            backgroundColor: verifiedBg,
            borderRadius: 12,
            padding: 2,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 2,
        },
        name: {
            fontSize: 24,
            fontWeight: 'bold',
            color: textMain,
            marginBottom: 4,
            textAlign: 'center',
        },
        handleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
        },
        handle: {
            fontSize: 15,
            color: textMuted,
        },
        roleTag: {
            backgroundColor: roleBusiness,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 8,
        },
        roleTagText: {
            color: '#FFFFFF',
            fontSize: 11,
            fontWeight: '600',
        },
        roleTagInfluencer: {
            backgroundColor: roleInfluencer,
        },
        bio: {
            fontSize: 14,
            color: textMain,
            textAlign: 'center',
            marginBottom: 16,
            lineHeight: 20,
        },
        metaRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            marginBottom: 24,
        },
        metaItem: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
        },
        metaText: {
            fontSize: 13,
            color: textMuted,
        },
        statsContainer: {
            flexDirection: 'row',
            backgroundColor: cardBg,
            borderRadius: 16,
            paddingVertical: 16,
            paddingHorizontal: 20,
            width: '100%',
            marginBottom: 24,
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
            fontSize: 16,
            fontWeight: 'bold',
            color: textMain,
        },
        statLabel: {
            fontSize: 12,
            color: textMuted,
        },
        statDivider: {
            width: 1,
            backgroundColor: border,
            marginHorizontal: 12,
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
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
        },
        primaryBtnText: {
            color: '#FFFFFF',
            fontWeight: '600',
            fontSize: 15,
        },
        secondaryBtn: {
            flex: 1,
            flexDirection: 'row',
            backgroundColor: btnSecondaryBg,
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
        },
        secondaryBtnText: {
            color: textMain,
            fontWeight: '600',
            fontSize: 15,
        },
        followingBtn: {
            backgroundColor: btnSecondaryBg,
            borderWidth: 1,
            borderColor: border,
        },
        followingBtnText: {
            color: textMain,
        },
        tabsContainer: {
            borderBottomWidth: 1,
            borderBottomColor: border,
            backgroundColor: bg,
        },
        tabsScroll: {
            paddingHorizontal: 16,
            gap: 8,
            paddingBottom: 12,
        },
        tabBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 20,
            backgroundColor: cardBg,
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
            color: textMuted,
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
            backgroundColor: cardBg,
            borderRadius: 16,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: border,
            marginBottom: 16,
        },
        gridImgContainer: {
            width: '100%',
            height: 140,
            backgroundColor: border,
            position: 'relative',
        },
        cardImg: {
            width: '100%',
            height: '100%',
            resizeMode: 'cover',
        },
        favBtn: {
            position: 'absolute',
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            borderRadius: 16,
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10,
            overflow: 'hidden',
            backgroundColor: favBtnBg,
            borderWidth: 1,
            borderColor: favBtnBorder
        },
        favBtnActive: {
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 2
        },
        gridContent: {
            padding: 12,
        },
        cardTitle: {
            fontSize: 14,
            fontWeight: '600',
            color: textMain,
            marginBottom: 8,
            lineHeight: 20,
        },
        priceRow: {
            marginBottom: 12,
        },
        price: {
            fontSize: 16,
            fontWeight: 'bold',
            color: price,
        },
        btnSm: {
            backgroundColor: btnSmBg,
            paddingVertical: 8,
            borderRadius: 8,
            alignItems: 'center',
        },
        btnSmText: {
            fontSize: 13,
            fontWeight: '600',
            color: textMain,
        },
        emptyContainer: {
            padding: 40,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
        },
        emptyText: {
            fontSize: 15,
            color: textMuted,
            textAlign: 'center',
        }
    });

    return { ...styles, ...rawColors } as any;
}
