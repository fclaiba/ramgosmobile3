import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert, useWindowDimensions } from 'react-native';
import { ChevronLeft, Share2, Heart, ShieldCheck, MapPin, Truck, AlertTriangle } from 'lucide-react-native';
import { useMarketplace } from '../../contexts/MarketplaceContext';
import { useCart } from '../../contexts/CartContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useToast } from '../../contexts/ToastContext';

// const { width } = Dimensions.get('window'); removed

export default function ProductDetailScreen({ route, navigation }: any) {
    const { width } = useWindowDimensions();
    const { productId } = route.params || {};
    const { getProductById } = useMarketplace();
    const { addItem } = useCart();
    const { show } = useToast();

    const product = useMemo(() => getProductById(productId), [productId, getProductById]);

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

    const handleAddToCart = () => {
        addItem({
            id: product.id,
            name: product.title,
            price: product.price,
            image: product.images?.[0]?.url,
            type: 'product',
            location: product.location?.name || '',
            sellerId: product.seller?.id || '',
            sellerName: product.seller?.name || '',
            condition: product.condition,
            shippingWeightKg: product.shippingProfile?.weightKg || 0,
            shippingDimensionsCm: product.shippingProfile?.dimensionsCm,
            distanceKm: product.location?.distanceKm
        });
        show('Producto agregado al carrito', 'success');
    };

    const handleBuyNow = () => {
        handleAddToCart();
        navigation.navigate('Cart');
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <ChevronLeft size={24} color="#000" />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity style={styles.iconBtn}>
                        <Share2 size={24} color="#000" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn}>
                        <Heart size={24} color="#000" />
                    </TouchableOpacity>
                </View>
            </View>

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
                    <View style={styles.sellerRow}>
                        <Image source={{ uri: product.seller?.avatar || 'https://via.placeholder.com/50' }} style={styles.sellerAvatar} />
                        <View>
                            <Text style={styles.sellerName}>{product.seller?.name || 'Vendedor'}</Text>
                            <Text style={styles.sellerRating}>★ {product.seller?.rating || '0.0'} • Tiempo respuesta: {product.seller?.responseTimeHours || 24}h</Text>
                        </View>
                    </View>

                    <View style={styles.separator} />

                    {/* Safety Badge */}
                    <View style={styles.safetyBox}>
                        <ShieldCheck size={24} color="#7C3AED" />
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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        position: 'absolute',
        top: 40,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        zIndex: 10
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3
    },
    carousel: { height: 350 },
    productImage: { height: 350, resizeMode: 'cover' },
    content: { padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24, backgroundColor: '#fff' },
    title: { fontSize: 24, fontWeight: '400', color: '#1F2937', marginBottom: 12 },
    price: { fontSize: 32, fontWeight: 'bold', color: '#111827', marginBottom: 4 },

    badgesRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
    badgeNew: { backgroundColor: '#ECFDF5', borderColor: '#34D399' },
    badgeUsed: { backgroundColor: '#FFF7ED', borderColor: '#FB923C' },
    badgeText: { fontSize: 12, fontWeight: 'bold' },
    textNew: { color: '#059669' },
    textUsed: { color: '#C2410C' },
    verificationBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, backgroundColor: '#F3F4F6', borderRadius: 12 },
    verificationText: { fontSize: 12, color: '#4B5563' },

    warningBox: { backgroundColor: '#FFFBEB', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FCD34D', marginBottom: 16 },
    warningTitle: { fontSize: 14, fontWeight: 'bold', color: '#92400E', marginBottom: 4 },
    warningText: { fontSize: 14, color: '#B45309' },

    separator: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937', marginBottom: 8 },
    description: { fontSize: 16, color: '#4B5563', lineHeight: 24 },

    sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    sellerAvatar: { width: 48, height: 48, borderRadius: 24 },
    sellerName: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
    sellerRating: { fontSize: 14, color: '#6B7280' },

    safetyBox: { flexDirection: 'row', gap: 12, backgroundColor: '#F5F3FF', padding: 16, borderRadius: 12, alignItems: 'flex-start' },
    shippingBox: { flexDirection: 'row', gap: 12, backgroundColor: '#EFF6FF', padding: 16, borderRadius: 12, marginTop: 12, alignItems: 'flex-start' },
    safetyTitle: { fontSize: 14, fontWeight: 'bold', color: '#1F2937' },
    safetyDesc: { fontSize: 13, color: '#4B5563', marginTop: 2 },

    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        padding: 16,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        gap: 12
    },
    cartBtn: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        padding: 16,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center'
    },
    cartBtnText: { color: '#374151', fontWeight: 'bold', fontSize: 16 },
    buyBtn: {
        flex: 2,
        backgroundColor: '#7C3AED',
        padding: 16,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center'
    },
    buyBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
