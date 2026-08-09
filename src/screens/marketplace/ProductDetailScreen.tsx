import React, { useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Image,
    TouchableOpacity,
    Share,
    useWindowDimensions,
    ActivityIndicator,
} from 'react-native';
import { ChevronLeft, Share2, Heart, ShieldCheck, Truck, AlertTriangle } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useMarketplace } from '../../contexts/MarketplaceContext';
import { useCart } from '../../contexts/CartContext';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useFavorites } from '../../hooks/useFavorites';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { glassShadow, Radius, colors } from '../../theme/tokens';
import { webPath } from '../../config/appOrigin';

export default function ProductDetailScreen({ route, navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();
    const styles = getStyles(isDark);
    const { width } = useWindowDimensions();
    const { productId } = route.params || {};
    const { getProductById } = useMarketplace();
    const { addItem } = useCart();
    const { show } = useToast();
    const { user, sessionToken } = useAuth();
    const { isFavorite, toggleFavorite } = useFavorites();

    const listingId =
        typeof productId === 'string' && productId.length > 10
            ? (productId as Id<'listings'>)
            : null;
    const listingFromDb = useQuery(
        api.listings.getListing,
        listingId ? { id: listingId } : 'skip',
    );
    const feedProduct = useMemo(
        () => (!listingId ? getProductById(productId) : null),
        [listingId, productId, getProductById],
    );

    const product = useMemo(() => {
        const raw = listingFromDb || feedProduct;
        if (!raw) return null;
        const images = (raw as any).images?.length
            ? (raw as any).images
            : (raw as any).image
                ? [{ id: '1', url: (raw as any).image }]
                : [];
        return {
            id: String((raw as any)._id || (raw as any).id),
            title: (raw as any).title || (raw as any).name,
            price: Number((raw as any).price || 0),
            description: (raw as any).description || '',
            condition: (raw as any).condition,
            damageDescription: (raw as any).damageDescription,
            category: (raw as any).category,
            images,
            location: (raw as any).location,
            shippingProfile: (raw as any).shippingProfile,
            seller: (raw as any).seller || {
                id: (raw as any).sellerId,
                name: (raw as any).sellerName,
            },
            type: (raw as any).type || 'product',
        };
    }, [listingFromDb, feedProduct]);

    const isSaved = product ? isFavorite(product.id) : false;

    const handleShare = useCallback(async () => {
        if (!product) return;
        try {
            const url = webPath(`/p/${encodeURIComponent(String(product.id))}`);
            await Share.share({
                title: product.title,
                message: `Mirá esto: ${product.title} - $${product.price}\n${url}`,
                url,
            });
        } catch {
            /* user cancelled */
        }
    }, [product]);

    const handleToggleFavorite = useCallback(async () => {
        if (!product) return;
        if (!user || !sessionToken) {
            show('Iniciá sesión para guardar', 'warning');
            return;
        }
        try {
            await toggleFavorite({
                id: product.id,
                name: product.title,
                price: product.price,
                image: product.images?.[0]?.url ?? '',
                type: 'product',
                category: product.category || '',
            });
        } catch (e: any) {
            show(e?.message || 'No se pudo guardar el producto', 'error');
        }
    }, [product, user, sessionToken, toggleFavorite, show]);

    if (listingId && listingFromDb === undefined) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#2196F3" />
            </View>
        );
    }

    if (!product) {
        return (
            <View style={styles.center}>
                <Text>Producto no encontrado</Text>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={{ color: 'blue' }}>Volver</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const handleAddToCart = async () => {
        try {
            await addItem({
                id: product.id,
                name: product.title,
                price: product.price,
                image: product.images?.[0]?.url ?? '',
                type: product.type || 'product',
                location: product.location?.name ?? '',
                sellerId: product.seller?.id ?? '',
                sellerName: product.seller?.name ?? '',
                condition: product.condition,
                shippingWeightKg: product.shippingProfile?.weightKg ?? 0,
                shippingDimensionsCm: product.shippingProfile?.dimensionsCm,
                distanceKm: product.location?.distanceKm,
                quantity: 1,
            });
            show('Producto agregado al carrito', 'success');
        } catch {
            /* CartContext toast */
        }
    };

    const handleBuyNow = async () => {
        await handleAddToCart();
        navigation.navigate('Cart');
    };

    const iconColor = isDark ? '#FFF' : '#000';

    return (
        <View style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Image Carousel */}
                <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.carousel}>
                    {product.images?.map((img) => (
                        <Image key={img.id} source={{ uri: img.url }} style={[styles.productImage, { width }]} />
                    ))}
                </ScrollView>

                <View style={styles.content}>
                    {/* Title & Price */}
                    <Text style={styles.price}>${product.price} USD</Text>
                    <Text style={styles.title}>{product.title}</Text>

                    {/* Condition Badge */}
                    <View style={styles.badgesRow}>
                        <View style={[
                            styles.badge,
                            product.condition === 'new' ? styles.badgeNew : styles.badgeUsed
                        ]}>
                            <Text style={[
                                styles.badgeText,
                                product.condition === 'new' ? styles.textNew : styles.textUsed
                            ]}>
                                {product.condition === 'new' ? 'NUEVO' : 'USADO'}
                            </Text>
                        </View>
                        {product.condition === 'used' && (
                            <View style={styles.verificationBadge}>
                                <ShieldCheck size={14} color="#059669" />
                                <Text style={styles.verificationText}>Verificado</Text>
                            </View>
                        )}
                    </View>

                    {/* Used Warning */}
                    {product.condition === 'used' && product.damageDescription && (
                        <View style={styles.warningBox}>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <AlertTriangle size={20} color="#B45309" />
                                <Text style={styles.warningTitle}>Detalle de Estado</Text>
                            </View>
                            <Text style={styles.warningText}>{product.damageDescription}</Text>
                        </View>
                    )}

                    <View style={styles.separator} />

                    {/* Description */}
                    <Text style={styles.sectionTitle}>Descripción</Text>
                    <Text style={styles.description}>{product.description}</Text>

                    <View style={styles.separator} />

                    {/* Seller Info */}
                    <Text style={styles.sectionTitle}>Vendedor</Text>
                    <TouchableOpacity
                        style={styles.sellerRow}
                        activeOpacity={0.8}
                        disabled={!product.seller?.id}
                        onPress={() =>
                            product.seller?.id &&
                            navigation.navigate('CommercialProfile', {
                                sellerId: String(product.seller.id),
                            })
                        }
                    >
                        <Image source={{ uri: product.seller?.avatar || 'https://placehold.co/100x100.png' }} style={styles.sellerAvatar} />
                        <View>
                            <Text style={styles.sellerName}>{product.seller?.name || 'Vendedor'}</Text>
                            <Text style={styles.sellerRating}>★ {product.seller?.rating || '0.0'} • Tiempo respuesta: {product.seller?.responseTimeHours || 24}h</Text>
                        </View>
                    </TouchableOpacity>

                    <View style={styles.separator} />

                    {/* Safety Badge */}
                    <View style={styles.safetyBox}>
                        <ShieldCheck size={24} color="#2196F3" />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.safetyTitle}>Compra Protegida</Text>
                            <Text style={styles.safetyDesc}>Recibe el producto que esperabas o te devolvemos tu dinero. Retenemos el pago por 10 días.</Text>
                        </View>
                    </View>

                    <View style={styles.shippingBox}>
                        <Truck size={24} color="#2563EB" />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.safetyTitle}>Envío Asegurado</Text>
                            <Text style={styles.safetyDesc}>Calculado en el checkout según tu ubicación.</Text>
                        </View>
                    </View>
                </View>
            </ScrollView>

            {/* Header after scroll — wins touch stack on mobile */}
            <View
                pointerEvents="box-none"
                style={[styles.header, { top: Math.max(insets.top, 8) + 8 }]}
            >
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.iconBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Volver"
                >
                    <ChevronLeft size={24} color={iconColor} />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 12 }} pointerEvents="box-none">
                    <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={handleShare}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Compartir"
                    >
                        <Share2 size={24} color={iconColor} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={handleToggleFavorite}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Guardar"
                    >
                        <Heart
                            size={24}
                            color={isSaved ? '#EF4444' : iconColor}
                            fill={isSaved ? '#EF4444' : 'transparent'}
                        />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Bottom Actions */}
            <View style={styles.bottomBar}>
                <TouchableOpacity style={styles.cartBtn} onPress={handleAddToCart}>
                    <Text style={styles.cartBtnText}>Agregar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.buyBtn} onPress={handleBuyNow}>
                    <Text style={styles.buyBtnText}>Comprar Ahora</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const getStyles = (isDark: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors(isDark).bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        position: 'absolute',
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        zIndex: 200,
        elevation: 24,
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: Radius.xl,
        backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 201,
        elevation: 28,
        ...glassShadow(isDark),
    },
    carousel: { height: 350 },
    productImage: { height: 350, resizeMode: 'contain' },
    content: { padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24, backgroundColor: colors(isDark).glass },
    title: { fontSize: 24, fontWeight: '400', color: isDark ? '#F9FAFB' : '#1F2937', marginBottom: 12 },
    price: { fontSize: 32, fontWeight: 'bold', color: isDark ? '#FAFAFA' : '#111827', marginBottom: 4 },

    badgesRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.md, borderWidth: 1 },
    badgeNew: { backgroundColor: '#ECFDF5', borderColor: '#34D399' },
    badgeUsed: { backgroundColor: '#FFF7ED', borderColor: '#FB923C' },
    badgeText: { fontSize: 12, fontWeight: 'bold' },
    textNew: { color: '#059669' },
    textUsed: { color: '#C2410C' },
    verificationBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, backgroundColor: colors(isDark).glass, borderRadius: Radius.md },
    verificationText: { fontSize: 12, color: isDark ? '#9CA3AF' : '#4B5563' },

    warningBox: { backgroundColor: '#FFFBEB', padding: 12, borderRadius: Radius.sm, borderWidth: 1, borderColor: '#FCD34D', marginBottom: 16 },
    warningTitle: { fontSize: 14, fontWeight: 'bold', color: '#92400E', marginBottom: 4 },
    warningText: { fontSize: 14, color: '#B45309' },

    separator: { height: 1, backgroundColor: colors(isDark).glass, marginVertical: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#1F2937', marginBottom: 8 },
    description: { fontSize: 16, color: isDark ? '#9CA3AF' : '#4B5563', lineHeight: 24 },

    sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    sellerAvatar: { width: 48, height: 48, borderRadius: Radius.xl },
    sellerName: { fontSize: 16, fontWeight: '600', color: isDark ? '#F9FAFB' : '#1F2937' },
    sellerRating: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280' },

    safetyBox: { flexDirection: 'row', gap: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FAFAFA', padding: 16, borderRadius: Radius.md, alignItems: 'flex-start' },
    shippingBox: { flexDirection: 'row', gap: 12, backgroundColor: isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF', padding: 16, borderRadius: Radius.md, marginTop: 12, alignItems: 'flex-start' },
    safetyTitle: { fontSize: 14, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#1F2937' },
    safetyDesc: { fontSize: 13, color: isDark ? '#9CA3AF' : '#4B5563', marginTop: 2 },

        bottomBar: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            elevation: 20,
        flexDirection: 'row',
        padding: 16,
        backgroundColor: colors(isDark).glass,
        borderTopWidth: 1,
        borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
        gap: 12,
        zIndex: 50,
        elevation: 12,
    },
    cartBtn: {
        flex: 1,
        backgroundColor: colors(isDark).glass,
        padding: 16,
        borderRadius: Radius.md,
        justifyContent: 'center',
        alignItems: 'center'
    },
    cartBtnText: { color: isDark ? '#D1D5DB' : '#374151', fontWeight: 'bold', fontSize: 16 },
    buyBtn: {
        flex: 2,
        backgroundColor: '#2196F3',
        padding: 16,
        borderRadius: Radius.md,
        justifyContent: 'center',
        alignItems: 'center'
    },
    buyBtnText: { color: '#FAFAFA', fontWeight: 'bold', fontSize: 16 }
});
