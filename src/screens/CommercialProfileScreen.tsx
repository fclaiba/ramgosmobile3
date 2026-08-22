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
    Modal,
    Image,
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
    Package,
    Ticket,
    PartyPopper,
    Briefcase,
    ShoppingCart,
    Share2,
    ShoppingBag,
    Wrench,
    Tag,
    Mail,
    Copy,
    SearchX,
    FileText,
    ArrowRight,
    Pencil,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useFavorites } from '../hooks/useFavorites';
import { useMarketplace } from '../contexts/MarketplaceContext';
import { userProfileLink } from '../config/appOrigin';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { formatCompactCount } from '../utils/formatCompactCount';
import Animated, { useAnimatedStyle, useSharedValue, useAnimatedScrollHandler, interpolate, Extrapolation } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { glassShadow, Radius, colors } from '../theme/tokens';
import { SocialProfileFeed } from '../components/social/SocialProfileFeed';
import FormFillScreen from './FormFillScreen';


const HERO_HEIGHT = 260;
const MIN_HEADER_HEIGHT = Platform.OS === 'ios' ? 90 : 72;

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

type TabType = 'product' | 'service' | 'event' | 'bono';

const typeMeta: Record<TabType, { label: string; icon: any; color: string }> = {
    product: { label: 'Producto', icon: ShoppingBag, color: '#4FC3F7' },
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
    const routeSellerId = route?.params?.sellerId || route?.params?.userId || route?.params?.id;
    const handle = route?.params?.handle;
    
    const userByHandle = useQuery(api.users.getUserByHandle, !routeSellerId && handle ? { handle } : "skip");
    const profileById = useQuery(api.users.getUser, routeSellerId ? { id: routeSellerId as any } : "skip");
    const profile = handle ? userByHandle : profileById;
    const sellerId = profile?._id;

    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark, insets);

    const { isFavorite, toggleFavorite } = useFavorites();
    const { addItem, openCart } = useCart();
    const { user: authUser, sessionToken } = useAuth();
    const { show } = useToast();
    const currentUserId = (authUser as any)?.id;

    const followMut = useMutation(api.social.follow);
    const unfollowMut = useMutation(api.social.unfollow);
    const createChatMut = useMutation(api.social.dm.getOrCreateDirectChat);

    const isFollowingResult = useQuery(api.social.isFollowing, (currentUserId && sellerId) ? { followerUserId: currentUserId, followeeUserId: sellerId, sessionToken: sessionToken || '' } : 'skip');
    const alreadyFollowing = isFollowingResult === true;

    const socialStats = useQuery(
        api.social.getPublicSocialStats,
        sellerId ? { userId: String(sellerId) } : 'skip',
    );

    const [activeTab, setActiveTab] = useState<TabType>('product');
    const [profileMode, setProfileMode] = useState<'social' | 'comercial'>('social');
    const [followLoading, setFollowLoading] = useState(false);
    const [contactLoading, setContactLoading] = useState(false);
    /** `null` = cerrado. Si no, con qué arranca `FormFillScreen`: un formulario
     *  puntual del negocio (`formId`) o directo el selector de día/horario. */
    const [formTarget, setFormTarget] = useState<
        { formId?: string; initialQueryType?: 'visit' } | null
    >(null);


    const listingsRaw = useQuery(
        api.listings.getPublicListingsBySeller,
        sellerId ? { sellerId: String(sellerId) } : "skip",
    );
    const listings = listingsRaw ?? [];

    // Formularios publicados + agenda del negocio: son los que deciden si el
    // CTA de cita tiene sentido, en vez de asumirlo sólo por el rol.
    const publicForms = useQuery(
        api.businessForms.getPublicForms,
        sellerId ? { businessId: String(sellerId) } : "skip",
    );
    const businessSettings = useQuery(
        api.businessSettings.getSettings,
        sellerId ? { businessId: String(sellerId) } : "skip",
    );
    const forms = publicForms ?? [];

    const activeItems = useMemo(() => {
        return listings.filter((item: any) => (item.listingType || item.type || 'product') === activeTab);
    }, [listings, activeTab]);

    const scrollY = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => { scrollY.value = event.contentOffset.y; },
    });

    const isBusiness = profile?.role === 'business';
    const isVerified = isBusiness || profile?.kycStatus === 'approved';
    const isOwnProfile = Boolean(currentUserId && sellerId && String(currentUserId) === String(sellerId));

    /** Pestaña Comercial: sólo si hay algo detrás. Un consumidor común no
     *  necesita un toggle que lleva a una grilla vacía. */
    const hasCommercialSide =
        isBusiness || profile?.role === 'influencer' || listings.length > 0 || forms.length > 0;

    /** Se puede agendar si el negocio configuró horarios, o si publicó algún
     *  formulario de tipo visita. Sin eso el CTA llevaría a un callejón. */
    const canBookAppointment = Boolean(
        isBusiness && (businessSettings || forms.some((f: any) => f.type === 'visit')),
    );

    /** Si el toggle está oculto, el modo comercial no puede quedar "pegado"
     *  de una visita anterior a otro perfil que sí lo tenía. */
    const showCommercialTabs = hasCommercialSide && profileMode === 'comercial';

    const tabs: { id: TabType; label: string; icon: any }[] = [
        { id: 'product', label: 'Productos', icon: Package },
        { id: 'service', label: 'Servicios', icon: Briefcase },
        { id: 'event', label: 'Eventos', icon: PartyPopper },
        { id: 'bono', label: 'Bonos', icon: Ticket },
    ];

    const handleAddToCart = async (item: any) => {
        try {
            await addItem({
                id: String(item._id || item.id),
                name: item.title || item.name,
                price: item.price,
                image: item.image || item.images?.[0]?.url,
                type: item.listingType || item.type || 'product',
                location: item.location?.name || '',
                sellerId: item.seller?.id || item.sellerId || sellerId,
                sellerName: item.seller?.name || item.sellerName || profile?.name,
                condition: item.condition,
                shippingWeightKg: item.shippingProfile?.weightKg,
                shippingDimensionsCm: item.shippingProfile?.dimensionsCm,
                distanceKm: item.location?.distanceKm,
                quantity: 1,
            });
            show('Agregado al carrito', 'success');
            openCart();
        } catch {
            // Toast from CartContext
        }
    };

    const handleToggleFollow = async () => {
        if (!sellerId || !authUser) {
            show('Inicia sesión para seguir a este usuario', 'warning');
            return;
        }
        setFollowLoading(true);
        try {
            if (alreadyFollowing) {
                await unfollowMut({ targetUserId: sellerId, sessionToken: sessionToken || '' });
            } else {
                await followMut({ targetUserId: sellerId, sessionToken: sessionToken || '' });
            }
        } catch (err) {
            console.warn('[CommercialProfile] follow toggle failed', err);
            show('Error al actualizar seguimiento', 'error');
        } finally {
            setTimeout(() => setFollowLoading(false), 500);
        }
    };

    const openFollowersList = () => {
        if (!sellerId) return;
        if (!authUser || !sessionToken) {
            show('Iniciá sesión para ver la lista de seguidores', 'warning');
            return;
        }
        navigation.navigate('UserList', {
            type: 'followers',
            userId: String(sellerId),
        });
    };

    const handleContact = async () => {
        if (!sellerId || !authUser) {
            show('Inicia sesión para contactar a este vendedor', 'warning');
            return;
        }
        setContactLoading(true);
        try {
            const chatId = await createChatMut({ participantId: sellerId, sessionToken: sessionToken || '' });
            navigation.navigate('Chat', { chatId });
        } catch (err) {
            console.warn('[CommercialProfile] createChat failed', err);
            show('Error al iniciar conversación', 'error');
        } finally {
            setContactLoading(false);
        }
    };

    const handleShare = async () => {
        try {
            const url = userProfileLink(profile?.username || socialStats?.username || profile?._id || '');
            const name = profile?.name || 'Perfil comercial';
            await Share.share({
                title: name,
                message: url ? `Mirá el perfil de ${name} en Ramgos\n${url}` : `Mirá el perfil de ${name} en Ramgos`,
                url: url || undefined,
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
                onPress={() =>
                    navigation.navigate('ItemDetail', {
                        itemId: String(item._id || item.id),
                        itemData: item,
                    })
                }
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
                            void toggleFavorite({
                                id: String(item._id || item.id),
                                type: item.listingType || item.type || 'product',
                            });
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
                <LinearGradient colors={['transparent', isDark ? '#09090B' : '#FAFAFA']} style={styles.heroGradient} />
            </View>

            {/* Profile header card */}
            <View style={styles.profileCard}>
                <View style={styles.avatarWrapper}>
                    {profile?.avatar ? (
                        <ImageWithFallback src={profile.avatar} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                            {isBusiness ? (
                                <Image source={require('../../logo.png')} style={{width: 48, height: 48, opacity: 0.8}} resizeMode="contain" />
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
                    <Text style={styles.handle}>
                        @{(profile as any)?.username || profile?.name?.toLowerCase().replace(/\s+/g, '') || 'usuario'}
                    </Text>
                    <View style={[
                        styles.roleTag, 
                        profile?.role === 'business' ? styles.roleTagBusiness : 
                        (profile?.role === 'influencer' ? styles.roleTagInfluencer : { backgroundColor: isDark ? '#4B5563' : '#9CA3AF' })
                    ]}>
                        <Text style={styles.roleTagText}>
                            {profile?.role === 'business' ? 'Negocio verificado' : 
                            (profile?.role === 'influencer' ? 'Influencer' : 'Consumidor')}
                        </Text>
                    </View>
                </View>
                
                <TouchableOpacity 
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, gap: 6 }}
                    onPress={async () => {
                        const url = userProfileLink(profile?.username || socialStats?.username || profile?._id || '');
                        await Clipboard.setStringAsync(url);
                        show('Enlace copiado al portapapeles', 'success');
                    }}
                >
                    <Text style={{ fontSize: 12, color: isDark ? '#60A5FA' : '#2563EB', textDecorationLine: 'underline' }}>
                        {userProfileLink(profile?.username || socialStats?.username || profile?._id || '').replace(/^https?:\/\//, '')}
                    </Text>
                    <Copy size={12} color={isDark ? '#60A5FA' : '#2563EB'} />
                </TouchableOpacity>

                {profile?.bio ? (
                    <Text style={styles.bio}>{profile.bio}</Text>
                ) : null}

                <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                        <MapPin size={14} color={isDark ? '#9CA3AF' : '#6B7280'} />
                        <Text style={styles.metaText}>
                            {(profile as any)?.storeLocation?.name
                                || (profile as any)?.storeLocation?.city
                                || (profile as any)?.location?.name
                                || (profile as any)?.location?.city
                                || (profile as any)?.location?.address
                                || 'Sin ubicación'}
                        </Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Calendar size={14} color={isDark ? '#9CA3AF' : '#6B7280'} />
                        <Text style={styles.metaText}>Desde {profile?.joinedAt ? new Date(profile.joinedAt).getFullYear() : '2025'}</Text>
                    </View>
                </View>

                {/* Stats — followerCount = socialUsers (misma red social) */}
                <View style={styles.statsContainer}>
                    {isBusiness ? (
                        <>
                            <View style={styles.statBox}>
                                <View style={styles.statValueRow}>
                                    <Star size={16} color="#F59E0B" fill="#F59E0B" />
                                    <Text style={styles.statValue}>{profile?.sellerRating ? profile.sellerRating.toFixed(1) : '0.0'}</Text>
                                </View>
                                <Text style={styles.statLabel}>{profile?.sellerReviewCount || 0} reseñas</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <TouchableOpacity
                                style={styles.statBox}
                                onPress={openFollowersList}
                                accessibilityRole="button"
                                accessibilityLabel="Ver seguidores"
                            >
                                <Text style={styles.statValue}>
                                    {formatCompactCount(socialStats?.followerCount ?? 0)}
                                </Text>
                                <Text style={styles.statLabel}>Seguidores</Text>
                            </TouchableOpacity>
                            <View style={styles.statDivider} />
                            <View style={styles.statBox}>
                                <View style={styles.statValueRow}>
                                    <Clock size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                    <Text style={styles.statValue}>{profile?.sellerResponseTimeHours || '< 1'}h</Text>
                                </View>
                                <Text style={styles.statLabel}>Respuesta</Text>
                            </View>
                        </>
                    ) : (
                        <>
                            <TouchableOpacity
                                style={styles.statBox}
                                onPress={openFollowersList}
                                accessibilityRole="button"
                                accessibilityLabel="Ver seguidores"
                            >
                                <Text style={styles.statValue}>
                                    {formatCompactCount(socialStats?.followerCount ?? 0)}
                                </Text>
                                <Text style={styles.statLabel}>Seguidores</Text>
                            </TouchableOpacity>
                            <View style={styles.statDivider} />
                            <View style={styles.statBox}>
                                <Text style={styles.statValue}>
                                    {formatCompactCount(socialStats?.followingCount ?? 0)}
                                </Text>
                                <Text style={styles.statLabel}>Siguiendo</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statBox}>
                                <Text style={styles.statValue}>
                                    {formatCompactCount(socialStats?.postCount ?? 0)}
                                </Text>
                                <Text style={styles.statLabel}>Publicaciones</Text>
                            </View>
                        </>
                    )}
                </View>

                {/* Actions */}
                {isOwnProfile ? (
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={styles.secondaryBtn}
                            onPress={() => navigation.navigate('Profile')}
                        >
                            <Pencil size={18} color={isDark ? '#F9FAFB' : '#111827'} />
                            <Text style={styles.secondaryBtnText}>Editar perfil</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
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
                )}

                {/* Agendar cita: el CTA que el negocio realmente quiere arriba.
                    Entra derecho al selector de día/horario de `FormFillScreen`,
                    salteando el paso de "¿qué tipo de consulta?". */}
                {!isOwnProfile && canBookAppointment && (
                    <TouchableOpacity
                        style={styles.bookBtn}
                        onPress={() => setFormTarget({ initialQueryType: 'visit' })}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`Agendar una cita con ${profile?.name ?? 'este negocio'}`}
                    >
                        <LinearGradient
                            colors={isDark ? ['#3B82F6', '#1D4ED8'] : ['#60A5FA', '#2563EB']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.bookBtnInner}
                        >
                            <Calendar size={20} color="#FFFFFF" />
                            <Text style={styles.bookBtnText}>Agendar cita</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                )}

                {!isOwnProfile && isBusiness && (
                    <TouchableOpacity
                        style={[styles.secondaryBtn, styles.inquiryBtn]}
                        onPress={() => setFormTarget({})}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`Enviar una consulta a ${profile?.name ?? 'este negocio'}`}
                    >
                        <Mail size={18} color={isDark ? '#F9FAFB' : '#111827'} />
                        <Text style={styles.secondaryBtnText}>Enviar consulta</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Profile Mode Toggle — sólo si hay un lado comercial que ver */}
            {hasCommercialSide && (
            <View style={{ flexDirection: 'row', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderRadius: Radius.lg, padding: 4, marginHorizontal: 20, marginBottom: 16 }}>
                <TouchableOpacity
                    style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: Radius.md, gap: 8 }, profileMode === 'social' && { backgroundColor: isDark ? '#374151' : '#FFFFFF', ...glassShadow }]}
                    onPress={() => setProfileMode('social')}
                >
                    <UserCircle size={16} color={profileMode === 'social' ? (isDark ? '#F9FAFB' : '#111827') : (isDark ? '#9CA3AF' : '#6B7280')} />
                    <Text style={[{ fontSize: 14, fontWeight: '600', color: isDark ? '#9CA3AF' : '#6B7280' }, profileMode === 'social' && { color: isDark ? '#F9FAFB' : '#111827' }]}>Social</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: Radius.md, gap: 8 }, profileMode === 'comercial' && { backgroundColor: isDark ? '#374151' : '#FFFFFF', ...glassShadow }]}
                    onPress={() => setProfileMode('comercial')}
                >
                    <Building2 size={16} color={profileMode === 'comercial' ? (isDark ? '#F9FAFB' : '#111827') : (isDark ? '#9CA3AF' : '#6B7280')} />
                    <Text style={[{ fontSize: 14, fontWeight: '600', color: isDark ? '#9CA3AF' : '#6B7280' }, profileMode === 'comercial' && { color: isDark ? '#F9FAFB' : '#111827' }]}>Comercial</Text>
                </TouchableOpacity>
            </View>
            )}

            {/* Servicios y Contacto — una tarjeta por formulario publicado del
                negocio, para entrar directo a ESE formulario en vez de tener que
                elegirlo otra vez adentro. Estaba en el viejo BusinessProfileScreen
                (borrado en ac34bfa) y se perdió al reemplazarlo por este screen. */}
            {showCommercialTabs && forms.length > 0 && !isOwnProfile && (
                <View style={styles.servicesSection}>
                    <Text style={styles.servicesTitle}>Servicios y Contacto</Text>
                    {forms.map((form: any) => (
                        <TouchableOpacity
                            key={String(form._id)}
                            style={styles.formCard}
                            activeOpacity={0.8}
                            onPress={() => setFormTarget({ formId: String(form._id) })}
                            accessibilityRole="button"
                            accessibilityLabel={form.title}
                        >
                            <View style={styles.formIconBox}>
                                {form.type === 'visit' ? (
                                    <Calendar size={20} color="#3B82F6" />
                                ) : (
                                    <FileText size={20} color="#3B82F6" />
                                )}
                            </View>
                            <View style={styles.formCardBody}>
                                <Text style={styles.formTitle} numberOfLines={1}>{form.title}</Text>
                                {form.description ? (
                                    <Text style={styles.formDesc} numberOfLines={2}>{form.description}</Text>
                                ) : null}
                            </View>
                            <ArrowRight size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Tabs */}
            {showCommercialTabs && (
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
            )}
        </View>
    );

    if ((handle && userByHandle === null) || profile === null) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }]}>
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
                    style={[styles.glassBtn, { width: '100%', paddingVertical: 16, backgroundColor: isDark ? '#374151' : '#E5E7EB', borderRadius: 12 }]} 
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
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Sticky header — no touches (buttons live in topBar) */}
            <Animated.View
                pointerEvents="none"
                style={[styles.stickyHeader, headerOpacity]}
            >
                <AnimatedBlurView
                    tint={isDark ? 'dark' : 'light'}
                    intensity={90}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                />
                <View style={[styles.stickyHeaderContent, { paddingTop: insets.top }]}>
                    <Text style={styles.stickyHeaderTitle} numberOfLines={1}>{profile?.name || 'Perfil comercial'}</Text>
                </View>
            </Animated.View>

            {showCommercialTabs ? (
                <FlatList
                    data={activeItems}
                    keyExtractor={(item: any) => (item._id || item.id).toString()}
                    numColumns={2}
                    renderItem={renderGridItem}
                    columnWrapperStyle={styles.gridColumnWrapper}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    ListHeaderComponent={renderHeader}
                    onScroll={
                        Platform.OS === 'web'
                            ? (e: any) => {
                                  scrollY.value = e.nativeEvent.contentOffset.y;
                              }
                            : scrollHandler
                    }
                    scrollEventThrottle={16}
                    ListEmptyComponent={() => (
                        <View style={styles.emptyContainer}>
                            <Package size={48} color={isDark ? '#374151' : '#E5E7EB'} />
                            <Text style={styles.emptyText}>
                                {listingsRaw === undefined
                                    ? 'Cargando…'
                                    : `No hay ${tabs.find(t => t.id === activeTab)?.label.toLowerCase()} disponibles.`}
                            </Text>
                        </View>
                    )}
                />
            ) : (
                <SocialProfileFeed 
                    authorUserId={String(sellerId)} 
                    externalHeader={renderHeader()} 
                />
            )}

            {/* Top floating controls — after list so they win the touch stack */}
            <View
                pointerEvents="box-none"
                style={[styles.topBar, { top: insets.top + 8 }]}
            >
                <AnimatedButton style={styles.glassBtn} onPress={() => {
                    if (navigation.canGoBack()) {
                        navigation.goBack();
                    } else {
                        navigation.replace('Home');
                    }
                }} isDark={isDark}>
                    <ChevronLeft size={24} color={isDark ? '#FFF' : '#000'} />
                </AnimatedButton>
                <View style={styles.topBarActions} pointerEvents="box-none">
                    <AnimatedButton style={styles.glassBtn} onPress={handleShare} isDark={isDark}>
                        <Share2 size={20} color={isDark ? '#FFF' : '#000'} />
                    </AnimatedButton>
                </View>
            </View>

            {/* FormFill Modal — `key` fuerza un remount por target, si no el
                screen conserva el paso/fecha de la apertura anterior. */}
            <Modal
                visible={formTarget !== null}
                animationType="slide"
                onRequestClose={() => setFormTarget(null)}
            >
                {formTarget !== null && (
                    <FormFillScreen
                        key={formTarget.formId ?? formTarget.initialQueryType ?? 'inquiry'}
                        businessId={sellerId}
                        businessName={profile?.name}
                        formId={formTarget.formId}
                        initialQueryType={formTarget.initialQueryType}
                        onClose={() => setFormTarget(null)}
                    />
                )}
            </Modal>
        </View>
    );
}

function getStyles(isDark: boolean, insets: any) {
    const bg = isDark ? '#09090B' : '#FAFAFA';
    const surface = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)';
    const text = isDark ? '#FAFAFA' : '#111827';
    const muted = isDark ? '#A1A1AA' : '#6B7280';
    const border = isDark ? '#27272A' : '#E5E7EB';
    const primary = isDark ? '#4FC3F7' : '#2196F3';
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
            zIndex: 200,
            elevation: 24,
        },
        topBarActions: { flexDirection: 'row', gap: 10 },
        glassBtn: {
            width: 42,
            height: 42,
            borderRadius: Radius.xl,
            overflow: 'hidden',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.9)',
            zIndex: 201,
            elevation: 28,
        },

        profileCard: {
            backgroundColor: bg,
            borderRadius: Radius['2xl'],
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
            borderRadius: Radius.full,
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
            backgroundColor: colors(isDark).glass,
            borderRadius: Radius.md,
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
            borderRadius: Radius.md,
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
            borderRadius: Radius.lg,
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
        bookBtn: {
            marginTop: 12,
            width: '100%',
            overflow: 'hidden',
            borderRadius: Radius.xl,
            ...glassShadow,
        },
        bookBtnInner: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 16,
            gap: 10,
        },
        bookBtnText: {
            color: '#FFFFFF',
            fontWeight: '800',
            fontSize: 16,
            letterSpacing: 0.5,
        },
        inquiryBtn: {
            marginTop: 10,
            flex: undefined,
            width: '100%',
        },
        servicesSection: {
            paddingHorizontal: 20,
            marginBottom: 20,
            gap: 10,
        },
        servicesTitle: {
            fontSize: 16,
            fontWeight: '800',
            color: text,
            marginBottom: 2,
        },
        formCard: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: surface,
            borderRadius: Radius.lg,
            borderWidth: 1,
            borderColor: border,
            paddingVertical: 14,
            paddingHorizontal: 14,
            gap: 12,
        },
        formIconBox: {
            width: 40,
            height: 40,
            borderRadius: Radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDark ? 'rgba(59,130,246,0.16)' : 'rgba(59,130,246,0.1)',
        },
        formCardBody: {
            flex: 1,
        },
        formTitle: {
            fontSize: 15,
            fontWeight: '700',
            color: text,
        },
        formDesc: {
            fontSize: 13,
            color: muted,
            marginTop: 2,
        },
        primaryBtn: {
            flex: 1,
            flexDirection: 'row',
            backgroundColor: primary,
            paddingVertical: 14,
            borderRadius: Radius.lg,
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
            borderRadius: Radius.lg,
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
            borderRadius: Radius.xl,
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
            borderRadius: Radius.lg,
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
            borderRadius: Radius.md,
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
            borderRadius: Radius.lg,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors(isDark).glass,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
        },
        favBtnActive: {
            ...glassShadow(isDark),
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
            backgroundColor: colors(isDark).glass,
            paddingVertical: 9,
            borderRadius: Radius.md,
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
