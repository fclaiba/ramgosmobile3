import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Animated, Dimensions, Modal, SafeAreaView, Platform, StatusBar } from 'react-native';
import { ShoppingCart as CartIcon, Trash2, Plus as PlusIcon, Minus, X, Star, ArrowRight, Ticket } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { useCart } from '../contexts/CartContext';
import { usePoints, DISCOUNT_TIERS } from '../contexts/PointsContext';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useNavigation } from '@react-navigation/native';

import { useWindowDimensions } from 'react-native';

// Removed static width
// const { width } = Dimensions.get('window');
// const SIDEBAR_WIDTH = width * 0.90;

export default function CartSidebar() {
    const { items, removeItem, updateQuantity, totalItems, totalPrice, clearCart, isOpen, closeCart } = useCart();
    const { points } = usePoints();
    const [selectedDiscount, setSelectedDiscount] = React.useState<number>(0);
    const navigation = useNavigation<any>();
    const useNativeDriver = Platform.OS !== 'web';

    const { width, height } = useWindowDimensions();
    const SIDEBAR_WIDTH = Math.min(width * 0.85, 400); // Max width 400px or 85%

    const slideAnim = useRef(new Animated.Value(width)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isOpen) {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: width - SIDEBAR_WIDTH, // Move to position
                    duration: 400,
                    useNativeDriver,
                    // easing: Easing.out(Easing.exp) // would need import
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: width,
                    duration: 300,
                    useNativeDriver,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver,
                }),
            ]).start();
        }
    }, [isOpen]);

    const availableDiscounts = DISCOUNT_TIERS.filter((tier) =>
        points >= tier.points && totalPrice >= tier.discount
    );

    const appliedDiscount = selectedDiscount > 0
        ? DISCOUNT_TIERS.find((t) => t.points === selectedDiscount)?.discount || 0
        : 0;

    const finalPrice = Math.max(0, totalPrice - appliedDiscount);

    const handleCheckout = () => {
        closeCart();
        navigation.navigate('Payment', {
            amount: finalPrice,
            discountUsedPoints: selectedDiscount,
            discountAmount: appliedDiscount,
            shippingMethod: 'pickup',
            shippingCost: 0,
            shippingDestination: {
                fullName: 'Consumidor Ramgos',
                addressLine1: 'Retiro a coordinar',
                city: 'Buenos Aires',
                postalCode: 'C1000',
                country: 'Argentina',
            },
            cartItems: items,
            cartSnapshot: items,
        });
    };

    if (!isOpen && !items) return null;

    return (
        <Modal
            transparent
            visible={isOpen}
            animationType="none"
            onRequestClose={closeCart}
            statusBarTranslucent
        >
            <View style={styles.overlayContainer}>
                {/* Backdrop */}
                <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={closeCart} activeOpacity={1} />
                </Animated.View>

                {/* Sidebar */}
                <Animated.View style={[styles.sidebar, { width: SIDEBAR_WIDTH, transform: [{ translateX: slideAnim }] }]}>
                    <LinearGradient
                        colors={['#fff', '#F9FAFB']}
                        style={StyleSheet.absoluteFill}
                    />

                    <SafeAreaView style={{ flex: 1 }}>
                        <View style={styles.header}>
                            <View>
                                <Text style={styles.headerTitle}>Tu Carrito</Text>
                                <Text style={styles.headerSubtitle}>{totalItems} ítems seleccionados</Text>
                            </View>
                            <TouchableOpacity onPress={closeCart} style={styles.closeBtn}>
                                <X size={24} color="#1F2937" />
                            </TouchableOpacity>
                        </View>

                        {items.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <View style={styles.emptyIconBg}>
                                    <CartIcon size={48} color="#9CA3AF" />
                                </View>
                                <Text style={styles.emptyTitle}>Carrito vacío</Text>
                                <Text style={styles.emptyText}>Explora el marketplace y encuentra lo que necesitas.</Text>
                                <Button variant="outline" onPress={closeCart} style={styles.shopBtn}>
                                    <Text style={{ fontWeight: '600' }}>Ir a la Tienda</Text>
                                </Button>
                            </View>
                        ) : (
                            <>
                                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
                                    {items.map((item) => (
                                        <View key={item.id} style={styles.itemRow}>
                                            <ImageWithFallback src={item.image} style={styles.itemImage} />
                                            <View style={styles.itemContent}>
                                                <View style={styles.itemHeader}>
                                                    <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                                                    <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.deleteBtn}>
                                                        <Trash2 size={16} color="#EF4444" />
                                                    </TouchableOpacity>
                                                </View>

                                                <View style={styles.itemFooter}>
                                                    <View style={styles.qtyControl}>
                                                        <TouchableOpacity onPress={() => updateQuantity(item.id, item.quantity - 1)} style={styles.qtyBtn}>
                                                            <Minus size={12} color="#4B5563" />
                                                        </TouchableOpacity>
                                                        <Text style={styles.qtyText}>{item.quantity}</Text>
                                                        <TouchableOpacity onPress={() => updateQuantity(item.id, item.quantity + 1)} style={styles.qtyBtn}>
                                                            <PlusIcon size={12} color="#111827" />
                                                        </TouchableOpacity>
                                                    </View>
                                                    <Text style={styles.priceText}>${(item.price * item.quantity).toFixed(2)}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    ))}

                                    {/* Points Section */}
                                    {availableDiscounts.length > 0 && (
                                        <View style={styles.discountSection}>
                                            <LinearGradient
                                                colors={['#F5F3FF', '#EDE9FE']}
                                                style={StyleSheet.absoluteFill}
                                            />
                                            <View style={styles.discountHeader}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <Ticket size={16} color="#7C3AED" />
                                                    <Text style={styles.discountTitle}>Canjear Puntos</Text>
                                                </View>
                                                <Badge variant="secondary" style={{ backgroundColor: 'rgba(124, 58, 237, 0.1)' }}>
                                                    <Text style={{ color: '#7C3AED', fontWeight: 'bold' }}>{points} pts</Text>
                                                </Badge>
                                            </View>

                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
                                                <TouchableOpacity
                                                    style={[styles.discountChip, selectedDiscount === 0 && styles.discountChipSelected]}
                                                    onPress={() => setSelectedDiscount(0)}
                                                >
                                                    <Text style={[styles.discountText, selectedDiscount === 0 && styles.discountTextSelected]}>Sin descuento</Text>
                                                </TouchableOpacity>
                                                {availableDiscounts.map(tier => (
                                                    <TouchableOpacity
                                                        key={tier.points}
                                                        style={[styles.discountChip, selectedDiscount === tier.points && styles.discountChipSelected]}
                                                        onPress={() => setSelectedDiscount(tier.points)}
                                                    >
                                                        <Text style={[styles.discountText, selectedDiscount === tier.points && styles.discountTextSelected]}>
                                                            -${tier.discount} ({tier.points}p)
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </ScrollView>
                                        </View>
                                    )}
                                </ScrollView>

                                <View style={styles.footer}>
                                    <View style={styles.summaryRow}>
                                        <Text style={styles.summaryLabel}>Subtotal</Text>
                                        <Text style={styles.summaryValue}>${totalPrice.toFixed(2)}</Text>
                                    </View>
                                    {appliedDiscount > 0 && (
                                        <View style={styles.summaryRow}>
                                            <Text style={[styles.summaryLabel, { color: '#16a34a' }]}>Descuento</Text>
                                            <Text style={[styles.summaryValue, { color: '#16a34a' }]}>-${appliedDiscount.toFixed(2)}</Text>
                                        </View>
                                    )}
                                    <View style={[styles.summaryRow, { marginTop: 12, marginBottom: 20 }]}>
                                        <Text style={styles.totalLabel}>Total</Text>
                                        <Text style={styles.totalValue}>${finalPrice.toFixed(2)}</Text>
                                    </View>

                                    <TouchableOpacity style={styles.checkoutBtn} onPress={handleCheckout} activeOpacity={0.9}>
                                        <LinearGradient
                                            colors={['#111827', '#374151']}
                                            style={styles.checkoutBtnGradient}
                                        >
                                            <Text style={styles.checkoutBtnText}>Proceder al Pago</Text>
                                            <ArrowRight size={18} color="#fff" />
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </SafeAreaView>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlayContainer: { flex: 1 },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
    sidebar: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0, // Handled by translate
        // width set dynamically
        shadowColor: "#000",
        shadowOffset: { width: -5, height: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        padding: 20,
        paddingTop: Platform.OS === 'android' ? 40 : 20, // Adjusted padding
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
    headerSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
    closeBtn: { padding: 8, backgroundColor: '#F3F4F6', borderRadius: 20 },

    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emptyIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', marginBottom: 8 },
    emptyText: { fontSize: 15, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
    shopBtn: { width: '100%' },

    // Items
    itemRow: { flexDirection: 'row', backgroundColor: '#fff', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 2 },
    itemImage: { width: 70, height: 70, borderRadius: 12, backgroundColor: '#F9FAFB' },
    itemContent: { flex: 1, marginLeft: 12, justifyContent: 'space-between' },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    itemName: { fontSize: 14, fontWeight: '600', color: '#1F2937', flex: 1, marginRight: 8 },
    deleteBtn: { padding: 4 },
    itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    qtyControl: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 8, padding: 2 },
    qtyBtn: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center', borderRadius: 6, backgroundColor: '#fff' },
    qtyText: { fontSize: 13, fontWeight: '600', paddingHorizontal: 8 },
    priceText: { fontSize: 15, fontWeight: 'bold', color: '#111827' },

    // Discount
    discountSection: { padding: 16, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#EDE9FE' },
    discountHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    discountTitle: { color: '#7C3AED', fontWeight: 'bold', fontSize: 14 },
    discountChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDD6FE', marginRight: 8 },
    discountChipSelected: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
    discountText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
    discountTextSelected: { color: '#fff' },

    // Footer
    footer: { padding: 24, paddingBottom: 34, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    summaryLabel: { fontSize: 14, color: '#6B7280' },
    summaryValue: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
    totalLabel: { fontSize: 18, fontWeight: '800', color: '#111827' },
    totalValue: { fontSize: 24, fontWeight: '800', color: '#111827' },

    checkoutBtn: { height: 50, borderRadius: 25, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
    checkoutBtnGradient: { flex: 1, borderRadius: 25, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    checkoutBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
