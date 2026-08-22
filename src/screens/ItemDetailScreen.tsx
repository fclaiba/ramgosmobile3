import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Dimensions,
    StatusBar,
    ScrollView,
    Share,
} from 'react-native';
import {
    ChevronLeft,
    Star,
    MapPin,
    Share2,
    MessageCircle,
    Heart,
    ShoppingBag,
    Plus as PlusIcon,
    Minus,
    Truck,
    ShieldCheck,
    Clock,
    Building2,
    UserCircle,
    ShoppingCart,
    Wrench,
    Calendar,
    Tag,
    Package,
    Info,
    AlertTriangle,
    Check,
    Store,
    HeartHandshake,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useFavorites } from '../hooks/useFavorites';
import { usePoints } from '../contexts/PointsContext';
import { useToast } from '../contexts/ToastContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { ReviewsList } from '../components/ReviewsList';
import { AddReviewModal } from '../components/AddReviewModal';
import { ShareListingModal } from '../components/social/ShareListingModal';
import { useTheme } from '../contexts/ThemeContext';
import Animated, { useAnimatedStyle, useSharedValue, useAnimatedScrollHandler, interpolate, Extrapolation, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { Radius, colors } from '../theme/tokens';
import { webPath, productShareLink } from '../config/appOrigin';
import { openUserProfile } from '../navigation/openUserProfile';


const { width } = Dimensions.get('window');
const HERO_HEIGHT = 420;
const MIN_HEADER_HEIGHT = Platform.OS === 'ios' ? 96 : 80;

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const AnimatedButton = ({ onPress, style, children, isDark, active = true, hitSlop }: any) => {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: active ? 1 : 0.5,
    }));

    const handlePressIn = () => {
        if (!active) return;
        scale.value = withSpring(0.96);
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handlePressOut = () => {
        scale.value = withSpring(1);
    };

    return (
        <AnimatedTouchable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={active ? onPress : undefined}
            style={[style, animatedStyle]}
            activeOpacity={0.9}
            hitSlop={hitSlop ?? { top: 8, bottom: 8, left: 8, right: 8 }}
        >
            {children}
        </AnimatedTouchable>
    );
};

// ─── Helpers ─────────────────────────────────────────────
const listingType = (item: any): 'product' | 'service' | 'event' | 'bono' | 'business' => {
    const t = item?.type || item?.listingType || 'product';
    if (t === 'bonus') return 'bono';
    return t;
};

const typeMeta = (type: string) => {
    switch (type) {
        case 'service': return { label: 'Servicio', icon: Wrench, color: '#38BDF8', cta: 'Contratar', ctaSecondary: 'Consultar' };
        case 'event': return { label: 'Evento', icon: Calendar, color: '#F59E0B', cta: 'Reservar', ctaSecondary: 'Ver detalles' };
        case 'bono': return { label: 'Bono', icon: Tag, color: '#10B981', cta: 'Comprar Bono', ctaSecondary: 'Ver bono' };
        case 'business': return { label: 'Negocio', icon: Store, color: '#EC4899', cta: 'Ver catálogo', ctaSecondary: 'Ver perfil' };
        default: return { label: 'Producto', icon: ShoppingBag, color: '#4FC3F7', cta: 'Comprar ahora', ctaSecondary: 'Agregar al carrito' };
    }
};

const normalizeItem = (raw: any) => {
    if (!raw) return null;
    const type = listingType(raw);
    const meta = typeMeta(type);
    const images = raw.images || (raw.image ? [{ url: raw.image }] : []);
    const gallery = raw.gallery || images.map((img: any) => img.url || img).filter(Boolean);
    const primaryImage = raw.image || images[0]?.url || gallery[0] || 'https://placehold.co/800x800.png';
    const seller = raw.seller || {
        id: raw.sellerId,
        name: raw.sellerName || raw.seller?.name || 'Vendedor Verificado',
        username: raw.sellerUsername,
        avatar: raw.sellerAvatar,
        type: raw.sellerType || 'individual',
    };
    const location = raw.location || {};
    const shippingProfile = raw.shippingProfile || {};

    return {
        ...raw,
        id: raw._id || raw.id,
        type,
        title: raw.title || raw.name || 'Sin título',
        name: raw.name || raw.title || 'Sin título',
        price: Number(raw.price || 0),
        originalPrice: raw.originalPrice ? Number(raw.originalPrice) : undefined,
        discount: raw.discount ? Number(raw.discount) : undefined,
        discountValue: raw.discountValue ? Number(raw.discountValue) : undefined,
        stock: raw.stock ?? 1,
        status: raw.status || 'active',
        description: raw.description || 'Este artículo no tiene una descripción detallada.',
        image: primaryImage,
        gallery: gallery.length ? gallery : [primaryImage],
        category: raw.category || meta.label,
        condition: raw.condition,
        damageDescription: raw.damageDescription,
        averageRating: raw.averageRating || raw.rating || 0,
        reviewCount: raw.reviewCount || raw.reviews || 0,
        locationName: typeof location === 'string' ? location : (location.name || 'Online'),
        locationAddress: location.address,
        locationDistance: location.distanceKm,
        seller,
        meta,
        shippingProfile,
        tags: raw.tags || [],
        eventDate: raw.eventDate || raw.date,
        eventTime: raw.eventTime || raw.time,
        validUntil: raw.validUntil,
        validityDays: raw.validityDays != null ? Number(raw.validityDays) : undefined,
    };
};

const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatNumber = (n?: number) => {
    if (n === undefined || n === null) return null;
    return n.toFixed(2).replace(/\.00$/, '');
};

export default function ItemDetailScreen({ route, navigation }: any) {
    const slug = route.params?.slug;
    const itemId = route.params?.itemId ?? route.params?.id;
    const referralCodeFromRoute =
        typeof route.params?.referralCode === 'string' ? route.params.referralCode.trim() : '';
    // Always subscribe when we have an id/slug — itemData is only a loading placeholder.
    const listingFromSlug = useQuery(api.listings.getListingBySlug, slug ? { slug } : "skip");
    const listingById = useQuery(
        api.listings.getListing,
        itemId ? { id: itemId as Id<"listings"> } : "skip",
    );
    const passedItem = route.params?.itemData || route.params?.item;
    const rawItem = useMemo(() => {
        const hasDbSource = Boolean(slug || itemId);
        if (!hasDbSource) return passedItem ?? null;
        const slugLoading = Boolean(slug) && listingFromSlug === undefined;
        const idLoading = Boolean(itemId) && listingById === undefined;
        if (slugLoading || idLoading) return passedItem ?? null;
        return listingFromSlug ?? listingById ?? null;
    }, [slug, itemId, listingFromSlug, listingById, passedItem]);
    const item = useMemo(() => normalizeItem(rawItem), [rawItem]);
    const dbSettled =
        (!slug || listingFromSlug !== undefined) && (!itemId || listingById !== undefined);

    const { addItem, openCart } = useCart();
    const { user, sessionToken } = useAuth();
    const { isFavorite, toggleFavorite } = useFavorites();
    const { progressChallenge } = usePoints();
    const { show } = useToast();
    const [quantity, setQuantity] = useState(1);
    const [addingToCart, setAddingToCart] = useState(false);
    const [dmShareOpen, setDmShareOpen] = useState(false);
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const recordView = useMutation(api.listings.recordView);
    const insets = useSafeAreaInsets();

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark, insets);

    const scrollY = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => { scrollY.value = event.contentOffset.y; },
    });
    const MainScrollView = Platform.OS === 'web' ? ScrollView : Animated.ScrollView;
    const mainScrollProps =
        Platform.OS === 'web'
            ? { onScroll: (e: any) => { scrollY.value = e.nativeEvent.contentOffset.y; } }
            : { onScroll: scrollHandler };

    useEffect(() => {
        if (item?.id) {
            const sessionId = 'session-' + Math.random().toString(36).substr(2, 9);
            recordView({
                listingId: String(item.id),
                sessionId,
                userId: user?.id ? (user.id as any) : undefined,
            }).catch(e => console.log("View record failed", e));
            if (user?.id) void progressChallenge('daily_browse', 1);
        }
    }, [item?.id, user?.id]);

    const sellerId = item?.seller?.id || item?.sellerId;
    const sellerProfile = useQuery(api.users.getUser, sellerId ? { id: sellerId as any } : "skip");

    const isSaved = item ? isFavorite(item.id) : false;

    const handleToggleFavorite = useCallback(async () => {
        if (!item) return;
        if (!user || !sessionToken) {
            show('Iniciá sesión para guardar', 'warning');
            return;
        }
        try {
            await toggleFavorite(item);
        } catch (e: any) {
            show(e?.message || 'No se pudo guardar el producto', 'error');
        }
    }, [item, user, sessionToken, toggleFavorite, show]);

    const handleShare = useCallback(async () => {
        if (!item) return;
        try {
            const handle = (item.seller as any)?.username || item.sellerUsername || item.sellerId || '';
            const pathKey = item.slug || item.id || '';
            const url = productShareLink(handle, String(pathKey));
            const message = url
                ? `Mirá esto: ${item.name} - $${item.price}\n${url}`
                : `Mirá esto: ${item.name} - $${item.price}`;
            await Share.share({
                title: item.name,
                message,
                url: url || undefined,
            });
        } catch (e) { /* user cancelled */ }
    }, [item]);

    const handleAddToCart = useCallback(async () => {
        if (!item || addingToCart) return;
        setAddingToCart(true);
        try {
            if (Platform.OS !== 'web') {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            await addItem({
                id: String(item.id),
                name: item.name,
                price: item.price,
                image: item.image,
                type: item.type,
                location: item.locationName,
                sellerId: item.seller?.id || item.sellerId,
                sellerName: item.seller?.name,
                condition: item.condition,
                shippingWeightKg: item.shippingProfile?.weightKg,
                shippingDimensionsCm: item.shippingProfile?.dimensionsCm,
                distanceKm: item.locationDistance,
                quantity,
                ...(referralCodeFromRoute ? { referralCode: referralCodeFromRoute } : {}),
            });
            show('Agregado al carrito', 'success');
            openCart();
        } catch {
            // Toast already shown by CartContext
        } finally {
            setAddingToCart(false);
        }
    }, [item, quantity, addItem, openCart, referralCodeFromRoute, addingToCart, show]);

    const handleBuyNow = useCallback(() => {
        if (!item) return;
        if (item.type === 'business') {
            const businessId = item.seller?.id || item.sellerId || item.id;
            openUserProfile(navigation, businessId);
            return;
        }
        void handleAddToCart();
    }, [item, handleAddToCart, navigation]);

    const headerOpacity = useAnimatedStyle(() => ({
        opacity: interpolate(scrollY.value, [HERO_HEIGHT - MIN_HEADER_HEIGHT - 40, HERO_HEIGHT - MIN_HEADER_HEIGHT + 20], [0, 1], Extrapolation.CLAMP),
    }));

    const heroScale = useAnimatedStyle(() => ({
        transform: [
            { translateY: interpolate(scrollY.value, [-100, 0, HERO_HEIGHT], [-30, 0, HERO_HEIGHT * 0.4], Extrapolation.CLAMP) },
            { scale: Platform.OS === 'web' ? 1 : interpolate(scrollY.value, [-100, 0], [1.15, 1], Extrapolation.CLAMP) },
        ],
    }));

    if ((slug || itemId) && !item && !dbSettled) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: isDark ? '#fff' : '#000' }}>Cargando...</Text>
            </View>
        );
    }

    if (!item) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: isDark ? '#fff' : '#000' }}>Producto no encontrado</Text>
            </View>
        );
    }

    const TypeIcon = item.meta.icon;
    const sellerName = sellerProfile?.name || item.seller?.name || 'Vendedor Verificado';
    const sellerHandle =
        sellerProfile?.username ||
        item.seller?.username ||
        sellerName.toLowerCase().replace(/\s/g, '');
    const sellerRole = sellerProfile?.role || item.seller?.type || 'individual';
    /** El rating venía hardcodeado ("4.9 · 120 ventas") en la tarjeta que ahora
     *  lleva al perfil. Si el backend no lo hidrata, mejor no mostrar nada que
     *  mostrar un número inventado. */
    const sellerRating = item.seller?.rating ?? (item as any).sellerRating ?? null;
    const isOutOfStock = item.type === 'product' && item.stock <= 0;
    const isListingActive = !item.status || item.status === 'active';
    const canPurchase = item.type !== 'business' && !isOutOfStock && isListingActive;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Sticky header background — no touches (buttons live in topBar) */}
            <Animated.View
                pointerEvents="none"
                style={[styles.stickyHeader, headerOpacity]}
            >
                <AnimatedBlurView tint={isDark ? 'dark' : 'light'} intensity={90} style={StyleSheet.absoluteFill} />
                <View style={[styles.stickyHeaderContent, { paddingTop: insets.top }]}>
                    <Text style={styles.stickyHeaderTitle} numberOfLines={1}>{item.name}</Text>
                </View>
            </Animated.View>

            <MainScrollView
                {...mainScrollProps}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 160 }}
            >
                {/* ── HERO: full-width image gallery ── */}
                <View style={styles.heroContainer}>
                    <Animated.View style={[styles.heroInner, heroScale]}>
                        <ScrollView
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            scrollEventThrottle={16}
                            onScroll={() => {}}
                            onMomentumScrollEnd={(e) => {
                                const idx = Math.round(e.nativeEvent.contentOffset.x / width);
                                setCurrentImageIndex(idx);
                            }}
                        >
                            {item.gallery.map((url: string, index: number) => (
                                <View key={`${url}-${index}`} style={styles.heroSlide}>
                                    <ImageWithFallback src={url} style={styles.heroImage} resizeMode="cover" />
                                </View>
                            ))}
                        </ScrollView>
                    </Animated.View>
                    <LinearGradient colors={['transparent', isDark ? '#09090B' : '#FAFAFA']} style={styles.heroGradient} />
                    {item.gallery.length > 1 && (
                        <View style={styles.paginationRow}>
                            {item.gallery.map((_: any, index: number) => (
                                <View
                                    key={index}
                                    style={[styles.paginationDot, currentImageIndex === index && styles.paginationDotActive]}
                                />
                            ))}
                        </View>
                    )}
                    {item.discount ? (
                        <View style={styles.heroDiscountBadge}>
                            <Text style={styles.heroDiscountText}>-{item.discount}%</Text>
                        </View>
                    ) : null}
                </View>

                {/* ── CONTENT ── */}
                <View style={styles.content}>
                    {/* Type & category */}
                    <View style={styles.typeRow}>
                        <View style={[styles.typeBadge, { backgroundColor: `${item.meta.color}15` }]}>
                            <TypeIcon size={14} color={item.meta.color} />
                            <Text style={[styles.typeText, { color: item.meta.color }]}>{item.meta.label}</Text>
                        </View>
                        {item.category && item.category !== item.meta.label ? (
                            <Text style={styles.categoryText}>{item.category}</Text>
                        ) : null}
                    </View>

                    {/* Title */}
                    <Text style={styles.title}>{item.name}</Text>

                    {/* Rating + location */}
                    <View style={styles.metaRow}>
                        <View style={styles.ratingBadge}>
                            <Star size={14} color={styles.star.color} fill={styles.star.color} />
                            <Text style={styles.ratingText}>{item.averageRating ? item.averageRating.toFixed(1) : 'Nuevo'}</Text>
                            <Text style={styles.reviewCount}>({item.reviewCount})</Text>
                        </View>
                        <View style={styles.dot} />
                        <View style={styles.locationRow}>
                            <MapPin size={14} color={isDark ? '#A1A1AA' : '#6B7280'} />
                            <Text style={styles.locationText} numberOfLines={1}>{item.locationName}</Text>
                        </View>
                    </View>

                    {/* Price */}
                    <View style={styles.priceBlock}>
                        <View>
                            {item.originalPrice ? (
                                <View style={styles.originalPriceRow}>
                                    <Text style={styles.originalPrice}>${formatNumber(item.originalPrice)}</Text>
                                    <View style={styles.discountBadge}>
                                        <Text style={styles.discountBadgeText}>-{item.discount}%</Text>
                                    </View>
                                </View>
                            ) : null}
                            <Text style={styles.price}>${formatNumber(item.price)}</Text>
                        </View>
                        {item.type === 'bono' && item.discountValue ? (
                            <View style={styles.bonoValueBadge}>
                                <Text style={styles.bonoValueLabel}>Valor real</Text>
                                <Text style={styles.bonoValueText}>${formatNumber(item.discountValue)}</Text>
                            </View>
                        ) : null}
                    </View>

                    {/* Stock / availability */}
                    <View style={styles.availabilityRow}>
                        {item.type === 'product' ? (
                            <>
                                <View style={[styles.stockBadge, isOutOfStock && styles.stockBadgeOut]}>
                                    <Package size={14} color={isOutOfStock ? '#EF4444' : '#10B981'} />
                                    <Text style={[styles.stockText, isOutOfStock && styles.stockTextOut]}>
                                        {isOutOfStock ? 'Sin stock' : `${item.stock} disponibles`}
                                    </Text>
                                </View>
                                <View style={styles.conditionBadge}>
                                    <Check size={14} color={item.condition === 'used' ? '#F59E0B' : '#10B981'} />
                                    <Text style={styles.conditionText}>{item.condition === 'used' ? 'Usado' : 'Nuevo'}</Text>
                                </View>
                            </>
                        ) : item.type === 'event' ? (
                            <View style={styles.stockBadge}>
                                <Calendar size={14} color="#F59E0B" />
                                <Text style={styles.stockText}>{formatDate(item.eventDate) || 'Fecha a confirmar'}</Text>
                            </View>
                        ) : item.type === 'service' ? (
                            <View style={styles.stockBadge}>
                                <Clock size={14} color="#38BDF8" />
                                <Text style={styles.stockText}>Disponibilidad a coordinar</Text>
                            </View>
                        ) : (
                            <View style={styles.stockBadge}>
                                <ShieldCheck size={14} color="#10B981" />
                                <Text style={styles.stockText}>Disponible</Text>
                            </View>
                        )}
                    </View>

                    {/* Used damage warning */}
                    {item.condition === 'used' && (
                        <View style={styles.warningCard}>
                            <AlertTriangle size={20} color="#B45309" />
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={styles.warningTitle}>Estado declarado por el vendedor</Text>
                                <Text style={styles.warningText}>{item.damageDescription || 'El vendedor no reportó daños visibles.'}</Text>
                            </View>
                        </View>
                    )}

                    {/* Event / Service / Bono details */}
                    {item.type === 'event' && (item.eventDate || item.eventTime || item.locationName) && (
                        <View style={styles.infoCard}>
                            <Text style={styles.infoCardTitle}>Detalles del evento</Text>
                            {item.eventDate ? <InfoRow icon={Calendar} label="Fecha" value={formatDate(item.eventDate) || item.eventDate} isDark={isDark} /> : null}
                            {item.eventTime ? <InfoRow icon={Clock} label="Horario" value={item.eventTime} isDark={isDark} /> : null}
                            {item.locationName ? <InfoRow icon={MapPin} label="Lugar" value={item.locationName} isDark={isDark} /> : null}
                        </View>
                    )}

                    {/* Matching de eventos (Fase 8) — sólo con entrada confirmada
                        se puede activar; la pantalla misma valida eso. */}
                    {item.type === 'event' && (
                        <TouchableOpacity
                            style={styles.matchingBtn}
                            onPress={() => navigation.navigate('EventMatching', { eventId: item._id })}
                        >
                            <HeartHandshake size={20} color="#EC4899" />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.matchingBtnTitle}>Conocé gente en este evento</Text>
                                <Text style={styles.matchingBtnSubtitle}>Matching opt-in, sólo con entrada confirmada</Text>
                            </View>
                        </TouchableOpacity>
                    )}

                    {item.type === 'service' && (
                        <View style={styles.infoCard}>
                            <Text style={styles.infoCardTitle}>Detalles del servicio</Text>
                            <InfoRow icon={Clock} label="Modalidad" value="A coordinar con el vendedor" isDark={isDark} />
                            <InfoRow icon={MapPin} label="Ubicación" value={item.locationName || 'A definir'} isDark={isDark} />
                        </View>
                    )}

                    {item.type === 'bono' && (
                        <View style={styles.infoCard}>
                            <Text style={styles.infoCardTitle}>Detalles del bono</Text>
                            {item.discountValue ? <InfoRow icon={Tag} label="Valor de consumo" value={`$${formatNumber(item.discountValue)}`} isDark={isDark} /> : null}
                            <InfoRow
                                icon={Calendar}
                                label="Vigencia"
                                value={
                                    item.validityDays
                                        ? `${item.validityDays} día${item.validityDays === 1 ? '' : 's'} desde la compra`
                                        : item.validUntil
                                          ? formatDate(item.validUntil) || item.validUntil
                                          : '7 días desde la compra'
                                }
                                isDark={isDark}
                            />
                            <InfoRow icon={MapPin} label="Canje" value={item.locationName || 'Consultar al vendedor'} isDark={isDark} />
                        </View>
                    )}

                    {/* Description */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Descripción</Text>
                        <Text style={styles.description}>{item.description}</Text>
                    </View>

                    {/* Shipping */}
                    {item.type === 'product' && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Envío y entrega</Text>
                            <View style={styles.shippingGrid}>
                                <ShippingCard
                                    icon={Truck}
                                    title="Envío calculado"
                                    subtitle="En checkout según tu ubicación"
                                    color="#4FC3F7"
                                    isDark={isDark}
                                />
                                {item.shippingProfile?.weightKg ? (
                                    <ShippingCard
                                        icon={Package}
                                        title={`${item.shippingProfile.weightKg.toFixed(2)} kg`}
                                        subtitle="Peso estimado"
                                        color="#3B82F6"
                                        isDark={isDark}
                                    />
                                ) : null}
                                {item.shippingProfile?.dimensionsCm ? (
                                    <ShippingCard
                                        icon={Info}
                                        title={`${item.shippingProfile.dimensionsCm.length}×${item.shippingProfile.dimensionsCm.width}×${item.shippingProfile.dimensionsCm.height} cm`}
                                        subtitle="Dimensiones"
                                        color="#10B981"
                                        isDark={isDark}
                                    />
                                ) : null}
                                <ShippingCard
                                    icon={item.shippingProfile?.allowPickup ? Check : Info}
                                    title={item.shippingProfile?.allowPickup ? 'Retiro disponible' : 'Solo envío'}
                                    subtitle={item.shippingProfile?.allowPickup ? 'Acordar con el vendedor' : 'No incluye retiro en persona'}
                                    color="#F59E0B"
                                    isDark={isDark}
                                />
                            </View>
                        </View>
                    )}

                    {/* Seller card */}
                    <TouchableOpacity
                        style={styles.sellerCard}
                        activeOpacity={0.8}
                        onPress={() => openUserProfile(navigation, sellerId)}
                    >
                        <View style={styles.sellerAvatarWrap}>
                            {sellerProfile?.avatar ? (
                                <ImageWithFallback src={sellerProfile.avatar} style={styles.sellerAvatar} />
                            ) : (
                                <View style={[styles.sellerAvatar, styles.sellerAvatarPlaceholder]}>
                                    {sellerRole === 'business' ? (
                                        <Building2 size={24} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                    ) : (
                                        <UserCircle size={24} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                    )}
                                </View>
                            )}
                        </View>
                        <View style={styles.sellerInfo}>
                            <Text style={styles.sellerName}>{sellerName}</Text>
                            <Text style={styles.sellerHandle}>
                                @{String(sellerHandle).replace(/^@/, '')}
                            </Text>
                            {sellerRating != null && (
                                <View style={styles.sellerRating}>
                                    <Star size={12} color={styles.star.color} fill={styles.star.color} />
                                    <Text style={styles.sellerRatingText}>
                                        {Number(sellerRating).toFixed(1)}
                                    </Text>
                                </View>
                            )}
                        </View>
                        <ChevronLeft size={20} color={isDark ? '#6B7280' : '#9CA3AF'} style={{ transform: [{ rotate: '180deg' }] }} />
                    </TouchableOpacity>

                    {/* Tags */}
                    {item.tags?.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Etiquetas</Text>
                            <View style={styles.tagsRow}>
                                {item.tags.map((tag: string) => (
                                    <View key={tag} style={styles.tagChip}>
                                        <Text style={styles.tagText}>#{tag}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Escrow */}
                    <View style={styles.escrowCard}>
                        <ShieldCheck size={24} color="#2563EB" />
                        <View style={{ flex: 1, marginLeft: 16 }}>
                            <Text style={styles.escrowTitle}>Compra protegida con Escrow</Text>
                            <Text style={styles.escrowText}>
                                Tu pago se retiene de forma segura hasta 10 días después de que recibas el producto. Si hay algún problema, te devolvemos tu dinero.
                            </Text>
                        </View>
                    </View>

                    {/* Reviews */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Reseñas</Text>
                            <TouchableOpacity onPress={() => setIsReviewOpen(true)}>
                                <Text style={styles.writeReviewText}>Escribir reseña</Text>
                            </TouchableOpacity>
                        </View>
                        <ReviewsList listingId={String(item.id)} onWriteReview={() => setIsReviewOpen(true)} />
                    </View>
                </View>
            </MainScrollView>

            {/* Top floating controls — after scroll so they win the touch stack */}
            <View
                pointerEvents="box-none"
                style={[styles.topBar, { top: insets.top + 8 }]}
            >
                <AnimatedButton style={styles.glassBtn} onPress={() => navigation.goBack()} isDark={isDark}>
                    <ChevronLeft size={24} color={isDark ? '#FFF' : '#000'} />
                </AnimatedButton>
                <View style={styles.topBarActions} pointerEvents="box-none">
                    <AnimatedButton style={styles.glassBtn} onPress={openCart} isDark={isDark}>
                        <ShoppingCart size={22} color={isDark ? '#FFF' : '#000'} />
                    </AnimatedButton>
                    <AnimatedButton
                        style={styles.glassBtn}
                        onPress={handleShare}
                        onLongPress={() => setDmShareOpen(true)}
                        isDark={isDark}
                    >
                        <Share2 size={22} color={isDark ? '#FFF' : '#000'} />
                    </AnimatedButton>
                    <AnimatedButton style={styles.glassBtn} onPress={() => setDmShareOpen(true)} isDark={isDark}>
                        <MessageCircle size={22} color={isDark ? '#FFF' : '#000'} />
                    </AnimatedButton>
                    <AnimatedButton style={styles.glassBtn} onPress={handleToggleFavorite} isDark={isDark}>
                        <Heart size={22} color={isSaved ? '#EF4444' : (isDark ? '#FFF' : '#000')} fill={isSaved ? '#EF4444' : 'transparent'} />
                    </AnimatedButton>
                </View>
            </View>

            {/* ── STICKY FOOTER: single action button ── */}
            <View style={styles.footer} pointerEvents="box-none">
                <BlurView
                    tint={isDark ? 'dark' : 'light'}
                    intensity={90}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                />
                <View style={[styles.footerInner, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                    {item.type === 'product' && !isOutOfStock && item.stock > 1 ? (
                        <View style={styles.qtyWrapper}>
                            <TouchableOpacity onPress={() => setQuantity(Math.max(1, quantity - 1))} style={styles.qtyBtn}>
                                <Minus size={18} color={isDark ? '#FFF' : '#000'} />
                            </TouchableOpacity>
                            <Text style={styles.qtyText}>{quantity}</Text>
                            <TouchableOpacity onPress={() => setQuantity(Math.min(item.stock || 99, quantity + 1))} style={styles.qtyBtn}>
                                <PlusIcon size={18} color={isDark ? '#FFF' : '#000'} />
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    {item.type === 'product' && item.stock === 1 ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
                            <Package size={16} color="#F59E0B" />
                            <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '700', color: '#F59E0B' }}>Última unidad</Text>
                        </View>
                    ) : null}

                    <View style={[styles.footerActions, { flex: 1 }]}>
                        {canPurchase ? (
                            <AnimatedButton
                                style={[styles.footerBtn, styles.footerBtnPrimary, { flex: 1 }]}
                                onPress={handleAddToCart}
                                isDark={isDark}
                                active={!addingToCart}
                            >
                                <ShoppingCart size={18} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.footerBtnPrimaryText}>
                                    {addingToCart
                                        ? 'Agregando…'
                                        : `${item.meta.cta} • $${formatNumber(item.price * quantity)}`}
                                </Text>
                            </AnimatedButton>
                        ) : item.type === 'business' ? (
                            <AnimatedButton style={[styles.footerBtn, styles.footerBtnPrimary, { flex: 1 }]} onPress={handleBuyNow} isDark={isDark}>
                                <Text style={styles.footerBtnPrimaryText}>{item.meta.cta}</Text>
                            </AnimatedButton>
                        ) : (
                            <AnimatedButton style={[styles.footerBtn, styles.footerBtnPrimary, { flex: 1 }]} onPress={() => {}} isDark={isDark} active={false}>
                                <Text style={styles.footerBtnPrimaryText}>
                                    {isOutOfStock ? 'Sin stock' : 'No disponible'}
                                </Text>
                            </AnimatedButton>
                        )}
                    </View>
                </View>
            </View>

            <AddReviewModal
                visible={isReviewOpen}
                onClose={() => setIsReviewOpen(false)}
                listingId={String(item.id)}
            />

            <ShareListingModal
                visible={dmShareOpen}
                onClose={() => setDmShareOpen(false)}
                listingId={String(item.id)}
            />
        </View>
    );
}

// ─── Subcomponents ───────────────────────────────────────
function InfoRow({ icon: Icon, label, value, isDark }: { icon: any; label: string; value: string; isDark: boolean }) {
    const muted = isDark ? '#A1A1AA' : '#6B7280';
    const text = isDark ? '#FAFAFA' : '#111827';
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Icon size={16} color={muted} />
            <Text style={{ marginLeft: 10, fontSize: 14, color: muted, width: 90 }}>{label}</Text>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: text }}>{value}</Text>
        </View>
    );
}

function ShippingCard({ icon: Icon, title, subtitle, color, isDark }: { icon: any; title: string; subtitle: string; color: string; isDark: boolean }) {
    const text = isDark ? '#FAFAFA' : '#111827';
    const muted = isDark ? '#A1A1AA' : '#6B7280';
    const surface = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)';
    const border = isDark ? '#27272A' : '#E5E7EB';
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: surface, borderRadius: Radius.lg, padding: 14, borderWidth: 1, borderColor: border }}>
            <View style={{ width: 44, height: 44, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', backgroundColor: `${color}15` }}>
                <Icon size={18} color={color} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: text }}>{title}</Text>
                <Text style={{ fontSize: 13, color: muted, marginTop: 2 }}>{subtitle}</Text>
            </View>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────
function getStyles(isDark: boolean, insets: any) {
    const bg = isDark ? '#09090B' : '#FAFAFA';
    const surface = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)';
    const text = isDark ? '#FAFAFA' : '#111827';
    const muted = isDark ? '#A1A1AA' : '#6B7280';
    const border = isDark ? '#27272A' : '#E5E7EB';
    const primary = isDark ? '#5DD3F3' : '#2196F3';
    const primaryDarker = isDark ? '#4FC3F7' : '#1565C0';
    const starColor = '#FBBF24';

    return StyleSheet.create({
        container: { flex: 1, backgroundColor: bg },

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

        heroContainer: {
            width: '100%',
            height: HERO_HEIGHT,
            position: 'relative',
            backgroundColor: colors(isDark).glass,
        },
        heroInner: {
            width: '100%',
            height: '100%',
        },
        heroSlide: {
            width,
            height: HERO_HEIGHT,
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
            height: 140,
        },
        paginationRow: {
            position: 'absolute',
            bottom: 20,
            left: 0,
            right: 0,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
        },
        paginationDot: {
            width: 8,
            height: 8,
            borderRadius: Radius.sm,
            backgroundColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)',
        },
        paginationDotActive: {
            width: 20,
            backgroundColor: 'rgba(255,255,255,0.62)',
        },
        heroDiscountBadge: {
            position: 'absolute',
            top: 16 + insets.top + 50,
            left: 16,
            backgroundColor: '#EF4444',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: Radius.md,
        },
        heroDiscountText: {
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: '800',
        },

        content: {
            backgroundColor: bg,
            paddingHorizontal: 20,
            paddingTop: 8,
        },

        typeRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12,
        },
        typeBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: Radius.xl,
        },
        typeText: {
            fontSize: 12,
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        categoryText: {
            fontSize: 13,
            color: muted,
            fontWeight: '500',
        },

        title: {
            fontSize: 30,
            fontWeight: '800',
            color: text,
            lineHeight: 36,
            letterSpacing: -0.8,
            marginBottom: 14,
        },

        metaRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 20,
        },
        ratingBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors(isDark).glass,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: Radius.md,
        },
        ratingText: {
            fontSize: 14,
            fontWeight: '800',
            color: text,
            marginLeft: 6,
        },
        reviewCount: {
            fontSize: 13,
            color: muted,
            marginLeft: 4,
            fontWeight: '500',
        },
        dot: {
            width: 4,
            height: 4,
            borderRadius: Radius.sm,
            backgroundColor: muted,
            marginHorizontal: 12,
        },
        locationRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            flex: 1,
        },
        locationText: {
            fontSize: 14,
            color: muted,
            fontWeight: '500',
            flex: 1,
        },

        priceBlock: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 16,
        },
        originalPriceRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginBottom: 4,
        },
        originalPrice: {
            fontSize: 16,
            color: muted,
            textDecorationLine: 'line-through',
            fontWeight: '600',
        },
        discountBadge: {
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: Radius.sm,
        },
        discountBadgeText: {
            fontSize: 12,
            color: '#EF4444',
            fontWeight: '800',
        },
        price: {
            fontSize: 40,
            fontWeight: '800',
            color: text,
            letterSpacing: -1.2,
        },
        bonoValueBadge: {
            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: Radius.lg,
            alignItems: 'center',
        },
        bonoValueLabel: {
            fontSize: 11,
            color: muted,
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        bonoValueText: {
            fontSize: 18,
            color: '#10B981',
            fontWeight: '800',
        },

        availabilityRow: {
            flexDirection: 'row',
            gap: 10,
            marginBottom: 16,
            flexWrap: 'wrap',
        },
        stockBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: Radius.xl,
        },
        stockBadgeOut: {
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEE2E2',
        },
        stockText: {
            fontSize: 13,
            fontWeight: '700',
            color: '#10B981',
        },
        stockTextOut: {
            color: '#EF4444',
        },
        conditionBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: isDark ? 'rgba(79, 195, 247, 0.12)' : '#F3E8FF',
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: Radius.xl,
        },
        conditionText: {
            fontSize: 13,
            fontWeight: '700',
            color: '#4FC3F7',
        },

        warningCard: {
            flexDirection: 'row',
            backgroundColor: isDark ? 'rgba(180, 83, 9, 0.12)' : '#FFFBEB',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(180, 83, 9, 0.25)' : '#FDE68A',
            borderRadius: Radius.lg,
            padding: 16,
            marginBottom: 24,
        },
        warningTitle: {
            fontSize: 15,
            fontWeight: '800',
            color: isDark ? '#FCD34D' : '#92400E',
            marginBottom: 4,
        },
        warningText: {
            fontSize: 14,
            color: isDark ? '#D1D5DB' : '#92400E',
            lineHeight: 20,
        },

        infoCard: {
            backgroundColor: surface,
            borderRadius: Radius.xl,
            padding: 18,
            marginBottom: 24,
            borderWidth: 1,
            borderColor: border,
        },
        matchingBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: isDark ? 'rgba(236,72,153,0.12)' : 'rgba(236,72,153,0.08)',
            borderRadius: Radius.xl,
            padding: 16,
            marginBottom: 24,
            borderWidth: 1,
            borderColor: 'rgba(236,72,153,0.3)',
        },
        matchingBtnTitle: { fontSize: 14, fontWeight: '700', color: text },
        matchingBtnSubtitle: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280', marginTop: 2 },
        infoCardTitle: {
            fontSize: 16,
            fontWeight: '800',
            color: text,
            marginBottom: 14,
        },

        section: {
            marginBottom: 28,
        },
        sectionHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
        },
        sectionTitle: {
            fontSize: 20,
            fontWeight: '800',
            color: text,
            letterSpacing: -0.3,
        },
        writeReviewText: {
            fontSize: 14,
            fontWeight: '700',
            color: primary,
        },
        description: {
            fontSize: 15,
            lineHeight: 25,
            color: muted,
        },

        shippingGrid: {
            gap: 10,
        },
        shippingCard: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            backgroundColor: surface,
            borderRadius: Radius.lg,
            padding: 14,
            borderWidth: 1,
            borderColor: border,
        },
        shippingIconBox: {
            width: 44,
            height: 44,
            borderRadius: Radius.md,
            justifyContent: 'center',
            alignItems: 'center',
        },
        shippingCardTitle: {
            fontSize: 14,
            fontWeight: '700',
            color: text,
        },
        shippingCardSubtitle: {
            fontSize: 13,
            color: muted,
            marginTop: 2,
        },

        sellerCard: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: surface,
            borderRadius: Radius.xl,
            padding: 16,
            marginBottom: 28,
            borderWidth: 1,
            borderColor: border,
        },
        sellerAvatarWrap: {
            width: 60,
            height: 60,
            borderRadius: Radius['2xl'],
            overflow: 'hidden',
            marginRight: 16,
        },
        sellerAvatar: {
            width: '100%',
            height: '100%',
        },
        sellerAvatarPlaceholder: {
            backgroundColor: colors(isDark).glass,
            justifyContent: 'center',
            alignItems: 'center',
        },
        sellerInfo: {
            flex: 1,
        },
        sellerName: {
            fontSize: 16,
            fontWeight: '800',
            color: text,
            marginBottom: 3,
        },
        sellerHandle: {
            fontSize: 14,
            color: muted,
            fontWeight: '500',
            marginBottom: 5,
        },
        sellerRating: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
        },
        sellerRatingText: {
            fontSize: 13,
            fontWeight: '600',
            color: muted,
        },

        tagsRow: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
        },
        tagChip: {
            backgroundColor: surface,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: Radius.xl,
            borderWidth: 1,
            borderColor: border,
        },
        tagText: {
            fontSize: 13,
            fontWeight: '600',
            color: muted,
        },

        escrowCard: {
            flexDirection: 'row',
            backgroundColor: isDark ? 'rgba(37, 99, 235, 0.12)' : '#EFF6FF',
            borderRadius: Radius.xl,
            padding: 18,
            marginBottom: 28,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(37, 99, 235, 0.2)' : '#DBEAFE',
        },
        escrowTitle: {
            fontSize: 15,
            fontWeight: '800',
            color: isDark ? '#60A5FA' : '#1D4ED8',
            marginBottom: 6,
        },
        escrowText: {
            fontSize: 14,
            color: isDark ? '#93C5FD' : '#1E3A8A',
            lineHeight: 21,
        },

        footer: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            elevation: 20,
            overflow: 'hidden',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
        },
        footerInner: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingTop: 16,
            gap: 12,
        },
        qtyWrapper: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.9)',
            borderRadius: Radius.lg,
            padding: 5,
            borderWidth: 1,
            borderColor: border,
        },
        qtyBtn: {
            width: 38,
            height: 38,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: Radius.md,
        },
        qtyText: {
            fontSize: 17,
            fontWeight: '800',
            color: text,
            width: 32,
            textAlign: 'center',
        },
        footerActions: {
            flex: 1,
            flexDirection: 'row',
            gap: 10,
        },
        footerBtn: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: Radius.lg,
            paddingVertical: 14,
            gap: 6,
        },
        footerBtnPrimary: {
            backgroundColor: primary,
        },
        footerBtnSecondary: {
            backgroundColor: colors(isDark).glass,
        },
        footerBtnPrimaryText: {
            color: '#fff',
            fontSize: 15,
            fontWeight: '800',
        },
        footerBtnSecondaryText: {
            color: colors(isDark).text,
            fontSize: 14,
            fontWeight: '700',
        },

        star: { color: starColor },
    });
}
