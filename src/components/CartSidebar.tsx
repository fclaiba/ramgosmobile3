import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, SafeAreaView, Platform, TextInput, Alert } from 'react-native';
import { ShoppingCart as CartIcon, Trash2, Plus as PlusIcon, Minus, X, ArrowRight, Ticket } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useCart } from '../contexts/CartContext';
import { usePoints, DISCOUNT_TIERS } from '../contexts/PointsContext';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';

export default function CartSidebar() {
    const { items, removeItem, updateQuantity, totalItems, totalPrice, closeCart, isOpen } = useCart();
    const { points } = usePoints();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [selectedDiscount, setSelectedDiscount] = React.useState<number>(0);
    const [referralCode, setReferralCode] = React.useState('');
    const [appliedReferralDiscount, setAppliedReferralDiscount] = React.useState(0);
    const navigation = useNavigation<any>();

    const availableDiscounts = DISCOUNT_TIERS.filter((tier) =>
        points >= tier.points && totalPrice >= tier.discount
    );

    const appliedDiscount = selectedDiscount > 0
        ? DISCOUNT_TIERS.find((t) => t.points === selectedDiscount)?.discount || 0
        : 0;

    const finalPrice = Math.max(0, totalPrice - appliedDiscount - appliedReferralDiscount);

    const handleApplyReferral = () => {
        // Mock validation logic
        const validCodes: Record<string, number> = {
            'WELCOME20': 20,
            'RAMGOS10': totalPrice * 0.10,
            'REF2024': 15,
        };

        const discount = validCodes[referralCode.trim().toUpperCase()];

        if (discount) {
            setAppliedReferralDiscount(discount);
            Alert.alert('Código Aplicado', `Descuento de $${discount.toFixed(2)} aplicado.`);
        } else {
            // Check for potential user ID format or generic fallback for demo
            if (referralCode.length > 5) {
                // Simulate a 5% discount for any "valid looking" code not in list
                const genericDiscount = totalPrice * 0.05;
                setAppliedReferralDiscount(genericDiscount);
                Alert.alert('Código de Referido', 'Descuento de referido (5%) aplicado.');
            } else {
                Alert.alert('Código Inválido', 'El código ingresado no existe o expiró.');
                setAppliedReferralDiscount(0);
            }
        }
    };

    const handleCheckout = () => {
        closeCart();
        navigation.navigate('Payment', {
            amount: totalPrice, // Sending GROSS amount so PaymentScreen can subtract discounts correctly
            discountUsedPoints: selectedDiscount,
            discountAmount: appliedDiscount,
            referralCode: referralCode || undefined,
            referralDiscount: appliedReferralDiscount,
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
                            <View style={styles.emptyIconBg}>
                                <CartIcon size={48} color={isDark ? '#9CA3AF' : '#9CA3AF'} />
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
                                                {item.type === 'subscription' ? (
                                                    <View style={{ backgroundColor: isDark ? 'rgba(124, 58, 237, 0.2)' : '#EDE9FE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                                                        <Text style={{ color: '#7C3AED', fontWeight: 'bold', fontSize: 12 }}>Facturación Mensual</Text>
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

                                {/* Points Section - Hide if only subscriptions in cart */}
                                {availableDiscounts.length > 0 && !items.every(item => item.type === 'subscription') && (
                                    <View style={styles.discountSection}>
                                        <LinearGradient
                                            colors={isDark ? ['#4C1D95', '#5B21B6'] : ['#F5F3FF', '#EDE9FE']}
                                            style={StyleSheet.absoluteFill}
                                        />
                                        <View style={styles.discountHeader}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Ticket size={16} color={isDark ? '#C4B5FD' : '#7C3AED'} />
                                                <Text style={styles.discountTitle}>Canjear Puntos</Text>
                                            </View>
                                            <Badge variant="secondary" style={{ backgroundColor: isDark ? 'rgba(124, 58, 237, 0.4)' : 'rgba(124, 58, 237, 0.1)' }}>
                                                <Text style={{ color: isDark ? '#DDD6FE' : '#7C3AED', fontWeight: 'bold' }}>{points} pts</Text>
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

                                {/* Referral Code Section */}
                                <View style={styles.discountSection}>
                                    <View style={styles.discountHeader}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Ticket size={16} color={isDark ? '#C4B5FD' : '#7C3AED'} />
                                            <Text style={styles.discountTitle}>Código de Referido</Text>
                                        </View>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <TextInput
                                            style={[styles.input, { flex: 1 }]}
                                            placeholder="Ingresa tu código"
                                            placeholderTextColor="#9CA3AF"
                                            value={referralCode}
                                            onChangeText={setReferralCode}
                                            autoCapitalize="characters"
                                        />
                                        <TouchableOpacity
                                            style={[styles.applyBtn, !referralCode && styles.applyBtnDisabled]}
                                            onPress={handleApplyReferral}
                                            disabled={!referralCode}
                                        >
                                            <Text style={styles.applyBtnText}>Aplicar</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {appliedReferralDiscount > 0 && (
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                                            <Text style={{ fontSize: 13, color: '#16a34a' }}>Descuento aplicado</Text>
                                            <TouchableOpacity onPress={() => { setAppliedReferralDiscount(0); setReferralCode(''); }}>
                                                <Text style={{ fontSize: 13, color: '#EF4444' }}>Remover</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>

                            </ScrollView>

                            <View style={styles.footer}>
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>Subtotal</Text>
                                    <Text style={styles.summaryValue}>${totalPrice.toFixed(2)}</Text>
                                </View>
                                {appliedDiscount > 0 && (
                                    <View style={styles.summaryRow}>
                                        <Text style={[styles.summaryLabel, { color: isDark ? '#86EFAC' : '#16a34a' }]}>Descuento</Text>
                                        <Text style={[styles.summaryValue, { color: isDark ? '#86EFAC' : '#16a34a' }]}>-${appliedDiscount.toFixed(2)}</Text>
                                    </View>
                                )}
                                <View style={[styles.summaryRow, { marginTop: 12, marginBottom: 20 }]}>
                                    <Text style={styles.totalLabel}>Total</Text>
                                    <Text style={styles.totalValue}>${finalPrice.toFixed(2)}</Text>
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
        backgroundColor: isDark ? '#111827' : '#FFFFFF',
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
    headerTitle: { fontSize: 24, fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827' },
    headerSubtitle: { fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280', marginTop: 2 },
    closeBtn: { padding: 8, backgroundColor: isDark ? '#374151' : '#F3F4F6', borderRadius: 20 },

    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emptyIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: isDark ? '#374151' : '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 20, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#1F2937', marginBottom: 8 },
    emptyText: { fontSize: 15, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', marginBottom: 24 },
    shopBtn: { width: '100%' },

    // Items
    itemRow: { flexDirection: 'row', backgroundColor: isDark ? '#1F2937' : '#fff', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: isDark ? '#374151' : '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 2 },
    itemImage: { width: 70, height: 70, borderRadius: 12, backgroundColor: isDark ? '#374151' : '#F9FAFB' },
    itemContent: { flex: 1, marginLeft: 12, justifyContent: 'space-between' },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    itemName: { fontSize: 14, fontWeight: '600', color: isDark ? '#F9FAFB' : '#1F2937', flex: 1, marginRight: 8 },
    deleteBtn: { padding: 4 },
    itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    qtyControl: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#374151' : '#F3F4F6', borderRadius: 8, padding: 2 },
    qtyBtn: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center', borderRadius: 6, backgroundColor: isDark ? '#4B5563' : '#fff' },
    qtyText: { fontSize: 13, fontWeight: '600', paddingHorizontal: 8, color: isDark ? '#F9FAFB' : '#000' },
    priceText: { fontSize: 15, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827' },

    // Discount
    discountSection: { padding: 16, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? '#5B21B6' : '#EDE9FE' },
    discountHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    discountTitle: { color: isDark ? '#C4B5FD' : '#7C3AED', fontWeight: 'bold', fontSize: 14 },
    discountChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: isDark ? '#374151' : '#fff', borderWidth: 1, borderColor: isDark ? '#6D28D9' : '#DDD6FE', marginRight: 8 },
    discountChipSelected: { backgroundColor: isDark ? '#7C3AED' : '#7C3AED', borderColor: isDark ? '#7C3AED' : '#7C3AED' },
    discountText: { fontSize: 12, color: isDark ? '#D1D5DB' : '#6B7280', fontWeight: '500' },
    discountTextSelected: { color: '#fff' },

    // Footer
    footer: { padding: 24, paddingBottom: 34, backgroundColor: isDark ? '#1F2937' : '#fff', borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#F3F4F6' },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    summaryLabel: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280' },
    summaryValue: { fontSize: 16, fontWeight: '600', color: isDark ? '#F9FAFB' : '#1F2937' },
    totalLabel: { fontSize: 18, fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827' },
    totalValue: { fontSize: 24, fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827' },

    checkoutBtn: { height: 50, borderRadius: 25, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
    checkoutBtnGradient: { flex: 1, borderRadius: 25, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    checkoutBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

    input: { backgroundColor: isDark ? '#374151' : '#F9FAFB', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: isDark ? '#F9FAFB' : '#111827' },
    applyBtn: { backgroundColor: isDark ? '#7C3AED' : '#7C3AED', paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    applyBtnDisabled: { backgroundColor: isDark ? '#4B5563' : '#E5E7EB' },
    applyBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
