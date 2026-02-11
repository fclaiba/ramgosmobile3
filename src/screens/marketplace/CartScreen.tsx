import React, { useMemo, useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Image,
    Animated,
    Dimensions,
    ScrollView,
} from 'react-native';
import {
    ShoppingCart,
    Trash2,
    Plus,
    Minus,
    ArrowRight,
    Sparkles,
    Package,
    Shield,
    MapPin,
    ChevronRight,
    Tag,
} from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { usePoints } from '../../contexts/PointsContext';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CartScreen({ navigation }: any) {
    const { items, removeItem, updateQuantity, totalPrice } = useCart();
    const { isAuthenticated } = useAuth();
    const { colorScheme } = useTheme();
    const { points } = usePoints();
    const availablePoints = points;
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    // Calculate potential savings with points
    const maxPointsDiscount = Math.min(availablePoints * 0.01, totalPrice * 0.3);
    const estimatedShipping = items.length > 0 ? 5.99 : 0;
    const finalTotal = totalPrice + estimatedShipping;

    const handleCheckout = () => {
        if (!isAuthenticated) {
            navigation.navigate('Login');
            return;
        }
        if (items.length === 0) return;
        navigation.navigate('Checkout');
    };

    const CartItemCard = ({ item, index }: { item: any; index: number }) => {
        const [isRemoving, setIsRemoving] = useState(false);
        const fadeAnim = useRef(new Animated.Value(1)).current;
        const scaleAnim = useRef(new Animated.Value(1)).current;

        const handleRemove = () => {
            setIsRemoving(true);
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 0.8,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                removeItem(item.id);
            });
        };

        const subtotal = item.price * item.quantity;

        return (
            <Animated.View
                style={[
                    styles.itemCard,
                    {
                        opacity: fadeAnim,
                        transform: [{ scale: scaleAnim }],
                    },
                ]}
            >
                {/* Item Image with Badge */}
                <View style={styles.imageContainer}>
                    <Image source={{ uri: item.image }} style={styles.itemImage} />
                    {item.type === 'bono' && (
                        <View style={styles.typeBadge}>
                            <Tag size={10} color="#fff" />
                        </View>
                    )}
                </View>

                {/* Item Details */}
                <View style={styles.itemContent}>
                    <View style={styles.itemHeader}>
                        <Text style={styles.itemTitle} numberOfLines={2}>
                            {item.name}
                        </Text>
                        <TouchableOpacity
                            onPress={handleRemove}
                            style={styles.removeBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Trash2 size={18} color="#EF4444" />
                        </TouchableOpacity>
                    </View>

                    {item.seller && (
                        <Text style={styles.sellerText}>Vendido por {item.seller}</Text>
                    )}

                    <View style={styles.itemFooter}>
                        {/* Price */}
                        <View>
                            <Text style={styles.itemPrice}>${subtotal.toFixed(2)}</Text>
                            {item.quantity > 1 && (
                                <Text style={styles.unitPrice}>
                                    ${item.price.toFixed(2)} c/u
                                </Text>
                            )}
                        </View>

                        {/* Quantity Controls */}
                        <View style={styles.qtyControls}>
                            <TouchableOpacity
                                onPress={() =>
                                    updateQuantity(item.id, Math.max(1, item.quantity - 1))
                                }
                                style={[
                                    styles.qtyBtn,
                                    item.quantity === 1 && styles.qtyBtnDisabled,
                                ]}
                                disabled={item.quantity === 1}
                            >
                                <Minus
                                    size={16}
                                    color={
                                        item.quantity === 1
                                            ? isDark
                                                ? '#4B5563'
                                                : '#D1D5DB'
                                            : isDark
                                            ? '#E5E7EB'
                                            : '#374151'
                                    }
                                />
                            </TouchableOpacity>
                            <View style={styles.qtyDisplay}>
                                <Text style={styles.qtyValue}>{item.quantity}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => updateQuantity(item.id, item.quantity + 1)}
                                style={styles.qtyBtn}
                            >
                                <Plus
                                    size={16}
                                    color={isDark ? '#E5E7EB' : '#374151'}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Animated.View>
        );
    };

    const EmptyCart = () => (
        <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrapper}>
                <LinearGradient
                    colors={isDark ? ['#4C1D95', '#7C3AED'] : ['#EDE9FE', '#DDD6FE']}
                    style={styles.emptyIconGradient}
                >
                    <ShoppingCart
                        size={48}
                        color={isDark ? '#E9D5FF' : '#7C3AED'}
                        strokeWidth={1.5}
                    />
                </LinearGradient>
            </View>

            <Text style={styles.emptyTitle}>Tu carrito está vacío</Text>
            <Text style={styles.emptySubtitle}>
                Descubre productos únicos, bonos exclusivos y eventos cerca de ti
            </Text>

            <View style={styles.emptyFeatures}>
                <View style={styles.emptyFeature}>
                    <View style={[styles.featureIcon, { backgroundColor: isDark ? '#1E3A5F' : '#DBEAFE' }]}>
                        <Shield size={16} color={isDark ? '#60A5FA' : '#2563EB'} />
                    </View>
                    <Text style={styles.featureText}>Compra protegida con escrow</Text>
                </View>
                <View style={styles.emptyFeature}>
                    <View style={[styles.featureIcon, { backgroundColor: isDark ? '#3D1F47' : '#F3E8FF' }]}>
                        <Sparkles size={16} color={isDark ? '#C084FC' : '#9333EA'} />
                    </View>
                    <Text style={styles.featureText}>Gana puntos en cada compra</Text>
                </View>
                <View style={styles.emptyFeature}>
                    <View style={[styles.featureIcon, { backgroundColor: isDark ? '#1C3829' : '#DCFCE7' }]}>
                        <MapPin size={16} color={isDark ? '#4ADE80' : '#16A34A'} />
                    </View>
                    <Text style={styles.featureText}>Encuentra ofertas cercanas</Text>
                </View>
            </View>

            <TouchableOpacity
                style={styles.exploreCTA}
                onPress={() => navigation.navigate('Home')}
                activeOpacity={0.8}
            >
                <LinearGradient
                    colors={['#7C3AED', '#6D28D9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.exploreCTAGradient}
                >
                    <Text style={styles.exploreCTAText}>Explorar Marketplace</Text>
                    <ArrowRight size={20} color="#fff" />
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );

    const CartSummary = () => (
        <View style={styles.summaryCard}>
            {/* Points Banner */}
            {availablePoints > 0 && (
                <View style={styles.pointsBanner}>
                    <View style={styles.pointsLeft}>
                        <Sparkles size={16} color="#F59E0B" />
                        <Text style={styles.pointsText}>
                            {availablePoints.toLocaleString()} pts disponibles
                        </Text>
                    </View>
                    <Text style={styles.pointsSave}>
                        Ahorra hasta ${maxPointsDiscount.toFixed(2)}
                    </Text>
                </View>
            )}

            {/* Summary Lines */}
            <View style={styles.summaryLines}>
                <View style={styles.summaryLine}>
                    <Text style={styles.summaryLabel}>
                        Subtotal ({items.length} {items.length === 1 ? 'artículo' : 'artículos'})
                    </Text>
                    <Text style={styles.summaryValue}>${totalPrice.toFixed(2)}</Text>
                </View>

                <View style={styles.summaryLine}>
                    <View style={styles.shippingLabel}>
                        <Package size={14} color={isDark ? '#9CA3AF' : '#6B7280'} />
                        <Text style={styles.summaryLabel}>Envío estimado</Text>
                    </View>
                    <Text style={styles.summaryValue}>${estimatedShipping.toFixed(2)}</Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryLine}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <View style={styles.totalRight}>
                        <Text style={styles.totalValue}>${finalTotal.toFixed(2)}</Text>
                        <Text style={styles.totalCurrency}>USD</Text>
                    </View>
                </View>
            </View>

            {/* Checkout Button */}
            <TouchableOpacity
                style={styles.checkoutBtn}
                onPress={handleCheckout}
                activeOpacity={0.85}
            >
                <LinearGradient
                    colors={['#7C3AED', '#6D28D9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.checkoutGradient}
                >
                    <Text style={styles.checkoutText}>Continuar al pago</Text>
                    <View style={styles.checkoutArrow}>
                        <ArrowRight size={18} color="#fff" />
                    </View>
                </LinearGradient>
            </TouchableOpacity>

            {/* Security Note */}
            <View style={styles.securityNote}>
                <Shield size={12} color={isDark ? '#6B7280' : '#9CA3AF'} />
                <Text style={styles.securityText}>
                    Pago seguro • Tu dinero protegido hasta confirmar recepción
                </Text>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Mi Carrito"
                showBack
                onBack={() => navigation.goBack()}
            />

            {items.length === 0 ? (
                <EmptyCart />
            ) : (
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Items Count Header */}
                    <View style={styles.itemsHeader}>
                        <Text style={styles.itemsCount}>
                            {items.length} {items.length === 1 ? 'artículo' : 'artículos'} en tu carrito
                        </Text>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Home')}
                            style={styles.addMoreBtn}
                        >
                            <Plus size={14} color={isDark ? '#A78BFA' : '#7C3AED'} />
                            <Text style={styles.addMoreText}>Agregar más</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Cart Items */}
                    {items.map((item, index) => (
                        <CartItemCard key={item.id} item={item} index={index} />
                    ))}

                    {/* Summary */}
                    <CartSummary />

                    {/* Bottom spacing */}
                    <View style={{ height: 24 }} />
                </ScrollView>
            )}
        </View>
    );
}

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
        },
        scrollView: {
            flex: 1,
        },
        scrollContent: {
            padding: 16,
        },

        // Items Header
        itemsHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
        },
        itemsCount: {
            fontSize: 14,
            fontWeight: '600',
            color: isDark ? '#94A3B8' : '#64748B',
        },
        addMoreBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
        },
        addMoreText: {
            fontSize: 14,
            fontWeight: '600',
            color: isDark ? '#A78BFA' : '#7C3AED',
        },

        // Item Card
        itemCard: {
            flexDirection: 'row',
            backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
            borderRadius: 16,
            padding: 12,
            marginBottom: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.3 : 0.06,
            shadowRadius: 8,
            elevation: 3,
            borderWidth: 1,
            borderColor: isDark ? '#334155' : '#F1F5F9',
        },
        imageContainer: {
            position: 'relative',
        },
        itemImage: {
            width: 88,
            height: 88,
            borderRadius: 12,
            backgroundColor: isDark ? '#334155' : '#F1F5F9',
        },
        typeBadge: {
            position: 'absolute',
            top: 4,
            left: 4,
            backgroundColor: '#7C3AED',
            borderRadius: 6,
            padding: 4,
        },
        itemContent: {
            flex: 1,
            marginLeft: 12,
        },
        itemHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
        },
        itemTitle: {
            flex: 1,
            fontSize: 15,
            fontWeight: '600',
            color: isDark ? '#F1F5F9' : '#1E293B',
            lineHeight: 20,
            marginRight: 8,
        },
        removeBtn: {
            padding: 4,
        },
        sellerText: {
            fontSize: 12,
            color: isDark ? '#64748B' : '#94A3B8',
            marginTop: 2,
        },
        itemFooter: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginTop: 'auto',
            paddingTop: 8,
        },
        itemPrice: {
            fontSize: 18,
            fontWeight: '700',
            color: isDark ? '#F1F5F9' : '#0F172A',
        },
        unitPrice: {
            fontSize: 12,
            color: isDark ? '#64748B' : '#94A3B8',
            marginTop: 2,
        },

        // Quantity Controls
        qtyControls: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? '#334155' : '#F1F5F9',
            borderRadius: 10,
            overflow: 'hidden',
        },
        qtyBtn: {
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
        },
        qtyBtnDisabled: {
            opacity: 0.5,
        },
        qtyDisplay: {
            minWidth: 32,
            alignItems: 'center',
            justifyContent: 'center',
        },
        qtyValue: {
            fontSize: 15,
            fontWeight: '700',
            color: isDark ? '#F1F5F9' : '#0F172A',
        },

        // Empty State
        emptyContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
        },
        emptyIconWrapper: {
            marginBottom: 24,
        },
        emptyIconGradient: {
            width: 100,
            height: 100,
            borderRadius: 50,
            alignItems: 'center',
            justifyContent: 'center',
        },
        emptyTitle: {
            fontSize: 22,
            fontWeight: '700',
            color: isDark ? '#F1F5F9' : '#0F172A',
            marginBottom: 8,
            textAlign: 'center',
        },
        emptySubtitle: {
            fontSize: 15,
            color: isDark ? '#94A3B8' : '#64748B',
            textAlign: 'center',
            lineHeight: 22,
            maxWidth: 280,
            marginBottom: 32,
        },
        emptyFeatures: {
            width: '100%',
            gap: 12,
            marginBottom: 32,
        },
        emptyFeature: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: isDark ? '#334155' : '#F1F5F9',
        },
        featureIcon: {
            width: 32,
            height: 32,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
        },
        featureText: {
            fontSize: 14,
            fontWeight: '500',
            color: isDark ? '#E2E8F0' : '#334155',
        },
        exploreCTA: {
            width: '100%',
        },
        exploreCTAGradient: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 16,
            paddingHorizontal: 24,
            borderRadius: 14,
            gap: 8,
        },
        exploreCTAText: {
            fontSize: 16,
            fontWeight: '700',
            color: '#FFFFFF',
        },

        // Summary Card
        summaryCard: {
            backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
            borderRadius: 20,
            padding: 16,
            marginTop: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.4 : 0.08,
            shadowRadius: 12,
            elevation: 5,
            borderWidth: 1,
            borderColor: isDark ? '#334155' : '#F1F5F9',
        },
        pointsBanner: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
            padding: 12,
            borderRadius: 10,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FEF3C7',
        },
        pointsLeft: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
        },
        pointsText: {
            fontSize: 13,
            fontWeight: '600',
            color: isDark ? '#FCD34D' : '#B45309',
        },
        pointsSave: {
            fontSize: 13,
            fontWeight: '700',
            color: isDark ? '#FCD34D' : '#92400E',
        },
        summaryLines: {
            gap: 12,
        },
        summaryLine: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        shippingLabel: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        summaryLabel: {
            fontSize: 14,
            color: isDark ? '#94A3B8' : '#64748B',
        },
        summaryValue: {
            fontSize: 14,
            fontWeight: '600',
            color: isDark ? '#E2E8F0' : '#334155',
        },
        summaryDivider: {
            height: 1,
            backgroundColor: isDark ? '#334155' : '#E2E8F0',
            marginVertical: 4,
        },
        totalLabel: {
            fontSize: 16,
            fontWeight: '700',
            color: isDark ? '#F1F5F9' : '#0F172A',
        },
        totalRight: {
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 4,
        },
        totalValue: {
            fontSize: 24,
            fontWeight: '800',
            color: isDark ? '#F1F5F9' : '#0F172A',
        },
        totalCurrency: {
            fontSize: 12,
            fontWeight: '600',
            color: isDark ? '#64748B' : '#94A3B8',
        },
        checkoutBtn: {
            marginTop: 16,
            borderRadius: 14,
            overflow: 'hidden',
        },
        checkoutGradient: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 16,
            paddingHorizontal: 24,
            gap: 8,
        },
        checkoutText: {
            fontSize: 16,
            fontWeight: '700',
            color: '#FFFFFF',
        },
        checkoutArrow: {
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: 8,
            padding: 4,
        },
        securityNote: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: 12,
        },
        securityText: {
            fontSize: 11,
            color: isDark ? '#64748B' : '#94A3B8',
        },
    });
