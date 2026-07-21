import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { ShoppingCart as CartIcon, Trash2, Plus as PlusIcon, Minus, X, ArrowRight, ShoppingBag, Search } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCart } from '../contexts/CartContext';
import { usePoints } from '../contexts/PointsContext';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useActionGate } from '../utils/useActionGate';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { glassShadow, Radius, colors } from '../theme/tokens';


export default function CartSidebar() {
    const { items, removeItem, updateQuantity, totalItems, totalPrice, closeCart, isOpen } = useCart();
    const { points } = usePoints();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();
    const { gateCheckout } = useActionGate();

    const navigation = useNavigation<any>();

    const handleCheckout = () => {
        // CART-03 (Fase 4): same gate as CartScreen — guests never reach PaymentScreen.
        // On anonymous block we close the sheet first so the Login screen (reached via
        // the alert CTA) isn't hidden behind this Modal.
        const allowed = gateCheckout({
            onBlocked: (block) => {
                if (block.reason === 'anonymous') closeCart();
            },
        });
        if (!allowed) return;

        closeCart();
        
        // Use a slight delay to allow the modal/sheet closing animation to finish 
        // before pushing the new screen. This prevents the sidebar from visually
        // remaining stuck open over the Payment screen transition.
        setTimeout(() => {
            navigation.navigate('Payment', {
                amount: totalPrice,
                discountUsedPoints: 0,
                discountAmount: 0,
                referralCode: undefined,
                referralDiscount: 0,
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
        }, Platform.OS === 'ios' ? 300 : 150);
    };

    const handleOpenChange = (open: boolean) => {
        if (!open) closeCart();
    };

    if (!isOpen && (!items || items.length === 0)) return null;

    return (
        <Sheet open={isOpen} onOpenChange={handleOpenChange}>
            <SheetContent side="right" style={styles.sheetContent}>
                <SafeAreaView style={{ flex: 1 }}>
                    <SheetHeader style={styles.header}>
                        <View>
                            <SheetTitle style={styles.headerTitle}>Tu Carrito</SheetTitle>
                            <Text style={styles.headerSubtitle}>{totalItems} ítems seleccionados</Text>
                        </View>
                        <TouchableOpacity onPress={closeCart} style={styles.closeBtn}>
                            <X size={24} color={isDark ? '#D1D5DB' : '#1F2937'} />
                        </TouchableOpacity>
                    </SheetHeader>

                    {Number(items?.length || 0) === 0 ? (
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyIconContainer}>
                                <LinearGradient
                                    colors={isDark ? ['rgba(33, 150, 243, 0.25)', 'rgba(59, 130, 246, 0.25)'] : ['rgba(33, 150, 243, 0.15)', 'rgba(59, 130, 246, 0.15)']}
                                    style={styles.emptyIconBg}
                                >
                                    <ShoppingBag size={56} color={isDark ? '#5DD3F3' : '#2196F3'} strokeWidth={1.5} />
                                </LinearGradient>
                                <View style={[styles.decorativeDot, { top: 10, right: 10, width: 14, height: 14, backgroundColor: '#3B82F6' }]} />
                                <View style={[styles.decorativeDot, { bottom: 20, left: -5, width: 10, height: 10, backgroundColor: '#EC4899' }]} />
                                <View style={[styles.decorativeDot, { top: 40, right: -15, width: 8, height: 8, backgroundColor: '#10B981' }]} />
                            </View>
                            <Text style={styles.emptyTitle}>Tu carrito está vacío</Text>
                            <Text style={styles.emptyText}>Parece que aún no has añadido nada. {"\n"}¡Descubre productos locales y ofertas exclusivas!</Text>
                            
                            <TouchableOpacity
                                style={styles.shopBtnContainer}
                                onPress={() => {
                                    closeCart();
                                    navigation.navigate('Marketplace');
                                }}
                                activeOpacity={0.85}
                            >
                                <LinearGradient
                                    colors={isDark ? ['#3B82F6', '#2196F3'] : ['#2563EB', '#1565C0']}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={styles.shopBtnGradient}
                                >
                                    <Search size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                                    <Text style={styles.shopBtnText}>Explorar la Tienda</Text>
                                </LinearGradient>
                            </TouchableOpacity>
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
                                                {item.type === 'subscription' ? (
                                                    <View style={{ backgroundColor: isDark ? 'rgba(33, 150, 243, 0.2)' : '#EDE9FE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm }}>
                                                        <Text style={{ color: '#2196F3', fontWeight: 'bold', fontSize: 12 }}>Facturación Mensual</Text>
                                                    </View>
                                                ) : (
                                                    <View style={styles.qtyControl}>
                                                        <TouchableOpacity onPress={() => updateQuantity(item.id, item.quantity - 1)} style={styles.qtyBtn}>
                                                            <Minus size={12} color={isDark ? '#D1D5DB' : '#4B5563'} />
                                                        </TouchableOpacity>
                                                        <Text style={styles.qtyText}>{item.quantity}</Text>
                                                        <TouchableOpacity onPress={() => updateQuantity(item.id, item.quantity + 1)} style={styles.qtyBtn}>
                                                            <PlusIcon size={12} color={isDark ? '#F9FAFB' : '#111827'} />
                                                        </TouchableOpacity>
                                                    </View>
                                                )}
                                                <Text style={styles.priceText}>${(item.price * item.quantity).toFixed(2)}</Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}

                            </ScrollView>

                            <View style={styles.footer}>
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>Subtotal</Text>
                                    <Text style={styles.summaryValue}>${totalPrice.toFixed(2)}</Text>
                                </View>
                                <View style={[styles.summaryRow, { marginTop: 12, marginBottom: 20 }]}>
                                    <Text style={styles.totalLabel}>Total</Text>
                                    <Text style={styles.totalValue}>${totalPrice.toFixed(2)}</Text>
                                </View>

                                <TouchableOpacity style={styles.checkoutBtn} onPress={handleCheckout} activeOpacity={0.9}>
                                    <LinearGradient
                                        colors={isDark ? ['#374151', '#4B5563'] : ['#111827', '#374151']}
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
            </SheetContent>
        </Sheet >
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    sheetContent: {
        backgroundColor: colors(isDark).glass,
        width: '85%', // Matching original SIDEBAR_WIDTH ratio roughly
        maxWidth: 400
    },
    header: {
        padding: 20,
        paddingTop: Platform.OS === 'android' ? 20 : 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    headerTitle: { fontSize: 24, fontWeight: '800', color: colors(isDark).text },
    headerSubtitle: { fontSize: 13, color: colors(isDark).textMuted, marginTop: 2 },
    closeBtn: { padding: 8, backgroundColor: colors(isDark).glass, borderRadius: Radius.xl },

    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    emptyIconContainer: { position: 'relative', marginBottom: 32 },
    emptyIconBg: { width: 120, height: 120, borderRadius: Radius.full, justifyContent: 'center', alignItems: 'center', ...glassShadow(isDark),},
    decorativeDot: { position: 'absolute', borderRadius: Radius.xl },
    emptyTitle: { fontSize: 24, fontWeight: '800', color: colors(isDark).text, marginBottom: 12, textAlign: 'center' },
    emptyText: { fontSize: 15, lineHeight: 22, color: colors(isDark).textMuted, textAlign: 'center', marginBottom: 40, paddingHorizontal: 10 },
    shopBtnContainer: { width: '100%', maxWidth: 280, ...glassShadow(isDark),},
    shopBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 24, borderRadius: Radius.lg },
    shopBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

    // Items
    itemRow: { flexDirection: 'row', backgroundColor: colors(isDark).glass, padding: 12, borderRadius: Radius.lg, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', ...glassShadow(isDark),},
    itemImage: { width: 70, height: 70, borderRadius: Radius.md, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)' },
    itemContent: { flex: 1, marginLeft: 12, justifyContent: 'space-between' },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    itemName: { fontSize: 14, fontWeight: '600', color: colors(isDark).text, flex: 1, marginRight: 8 },
    deleteBtn: { padding: 4 },
    itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    qtyControl: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors(isDark).glass, borderRadius: Radius.sm, padding: 2 },
    qtyBtn: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center', borderRadius: Radius.sm, backgroundColor: isDark ? '#4B5563' : '#fff' },
    qtyText: { fontSize: 13, fontWeight: '600', paddingHorizontal: 8, color: isDark ? '#F9FAFB' : '#000' },
    priceText: { fontSize: 15, fontWeight: 'bold', color: colors(isDark).text },

    // Footer
    footer: { padding: 24, paddingBottom: 34, backgroundColor: colors(isDark).glass, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    summaryLabel: { fontSize: 14, color: colors(isDark).textMuted },
    summaryValue: { fontSize: 16, fontWeight: '600', color: colors(isDark).text },
    totalLabel: { fontSize: 18, fontWeight: '800', color: colors(isDark).text },
    totalValue: { fontSize: 24, fontWeight: '800', color: colors(isDark).text },

    checkoutBtn: { height: 50, borderRadius: Radius['2xl'], ...glassShadow(isDark),},
    checkoutBtnGradient: { flex: 1, borderRadius: Radius['2xl'], flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    checkoutBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
