import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { usePoints } from '../../contexts/PointsContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { useMarketplace } from '../../contexts/MarketplaceContext';
import { MobileHeader } from '../../components/MobileHeader';
import { CreditCard, ShieldCheck, MapPin, Truck, CheckCircle, Tag, Ticket, Sparkles } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { useRewards } from '../../contexts/RewardsContext';
import { useReferral } from '../../contexts/ReferralContext';

import { useWallet } from '../../contexts/WalletContext';
import { useActionGate } from '../../utils/useActionGate';

export default function CheckoutScreen({ navigation }: any) {
    const { items, totalPrice, clearCart } = useCart();
    const { placeOrder } = useMarketplace();
    const { points, getAvailableDiscounts, redeemPoints, trackPurchase, previewPurchasePoints } = usePoints();
    const { validateCoupon, processCheckoutTransaction } = useWallet();
    const { updateSubscription } = useAuth();
    const { registerQuarterlyPurchase } = useRewards();
    const { notifyMyFirstPurchase } = useReferral();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();
    const { gateCheckout } = useActionGate();

    const [loading, setLoading] = useState(false);
    const [selectedDiscount, setSelectedDiscount] = useState<{ points: number; discount: number } | null>(null);
    const [couponCode, setCouponCode] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPercent: number; campaignId: string } | null>(null);

    // Mock Form State
    const [address, setAddress] = useState('Av. Libertador 1234');
    const [city, setCity] = useState('Buenos Aires');
    const [cardNumber, setCardNumber] = useState('');

    const availableDiscounts = getAvailableDiscounts();

    // Force clear discount if only subscriptions are in cart
    useEffect(() => {
        if (items.length > 0 && items.every(i => i.type === 'subscription')) {
            setSelectedDiscount(null);
            setAppliedCoupon(null);
        }
    }, [items]);

    const validatePromocode = () => {
        if (!couponCode.trim()) return;
        const result = validateCoupon(couponCode);
        if (result.valid && result.campaign) {
            setAppliedCoupon({
                code: result.campaign.code,
                discountPercent: result.discountPercent || 0,
                campaignId: result.campaign.id
            });
            show('¡Cupón aplicado correctamente!', 'success');
        } else {
            setAppliedCoupon(null);
            show(result.message || 'Cupón inválido', 'error');
        }
    };

    // Calculate eligible total for discounts (exclude subscriptions)
    const subscriptionTotal = items
        .filter(item => item.type === 'subscription')
        .reduce((sum, item) => sum + item.price * item.quantity, 0);

    const eligibleForDiscountTotal = totalPrice - subscriptionTotal;

    const shippingCost = items.every((i) => i.type === 'subscription') ? 0 : 12.0;

    // Calculate Points Discount
    const pointsDiscountAmount = Math.min(selectedDiscount?.discount || 0, eligibleForDiscountTotal);

    // Calculate Coupon Discount (Applied AFTER points or BEFORE? Usually independent. Let's apply to the eligible portion)
    const couponDiscountAmount = appliedCoupon
        ? (eligibleForDiscountTotal * (appliedCoupon.discountPercent / 100))
        : 0;

    const totalDiscount = Math.min(pointsDiscountAmount + couponDiscountAmount, eligibleForDiscountTotal);

    const finalTotal = Math.max(0, totalPrice + shippingCost - totalDiscount);

    // Rewards v2: preview points for the cash portion paid (pure calc, NO mutation)
    const purchaseEligible = Math.max(0, eligibleForDiscountTotal - totalDiscount);
    const purchasePointsPreview = previewPurchasePoints(purchaseEligible);

    const handlePlaceOrder = async () => {
        if (!gateCheckout()) {
            return;
        }

        // Only require card if there's something to pay
        const requiresPayment = finalTotal > 0;
        
        if (!address) {
            show('Completa la dirección de envío', 'error');
            return;
        }
        
        if (requiresPayment && !cardNumber) {
            show('Completa los datos de pago', 'error');
            return;
        }

        setLoading(true);

        try {
            // Simulate API delay (demo-only)
            await new Promise((resolve) => setTimeout(resolve, 2000));

            if (selectedDiscount) {
                const redeemed = redeemPoints(
                    selectedDiscount.points,
                    `Descuento en compra: $${selectedDiscount.discount}`,
                );
                if (!redeemed) {
                    show('No tienes suficientes puntos', 'error');
                    return;
                }
            }

            // Create Order
            const result = placeOrder({
                cartItems: items,
                shippingMethod: 'standard',
                shippingDestination: {
                    fullName: 'Usuario Demo',
                    addressLine1: address,
                    city: city,
                    postalCode: '1425',
                    country: 'Argentina',
                },
                paymentDetails: {
                    // Double check: if eligible total is 0, discount MUST be 0
                    discountApplied: eligibleForDiscountTotal > 0 ? totalDiscount : 0,
                    finalAmount: finalTotal,
                },
            });

            // Process Financials (Escrow & Commissions)
            if (result.success && result.orders) {
                // Process transaction for each created order (multi-vendor support)
                result.orders.forEach((order) => {
                    processCheckoutTransaction({
                        id: order.id,
                        sellerId: order.sellerId,
                        totalAmount: order.totals.grandTotal,
                        items: order.items,
                        couponCode: appliedCoupon?.code,
                    });
                });
            }

            // Subscription Activation Logic (Sprint 2)
            const subscriptionItem = items.find((i) => i.type === 'subscription' && i.subscriptionTier);
            if (result.success && subscriptionItem?.subscriptionTier) {
                await updateSubscription(subscriptionItem.subscriptionTier, 'active');
                show('Membresía activada correctamente', 'success');
            }

            // Rewards v2: only non-subscription purchases award points (1 punto por $1) and count for quarterly mission.
            if (result.success) {
                // Award points for the cash portion paid (1 point per $1)
                if (purchaseEligible > 0) {
                    trackPurchase(purchaseEligible);
                    notifyMyFirstPurchase(purchaseEligible).catch((err) => {
                        console.warn('[Checkout] notifyMyFirstPurchase failed', err);
                    });
                }
                
                // Quarterly mission counts even if paid fully with points (it's still a purchase)
                if (eligibleForDiscountTotal > 0) {
                    registerQuarterlyPurchase();
                }
            }

            if (result.success) {
                clearCart();
                show('¡Compra Exitosa! Orden procesada', 'success');
                setTimeout(() => navigation.navigate('OrderHistory'), 1000);
            } else {
                show('Error al procesar la orden', 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <MobileHeader title="Finalizar Compra" showBack onBack={() => navigation.goBack()} />

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                {/* Shipping */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <MapPin size={20} color="#4B5563" />
                        <Text style={styles.sectionTitle}>Dirección de Envío</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        placeholder="Dirección"
                        value={address}
                        onChangeText={setAddress}
                        placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Ciudad"
                        value={city}
                        onChangeText={setCity}
                        placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
                    />
                </View>

                {/* Delivery Method */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Truck size={20} color="#4B5563" />
                        <Text style={styles.sectionTitle}>Método de Envío</Text>
                    </View>
                    <View style={styles.optionSelected}>
                        <View>
                            <Text style={styles.optionTitle}>Envío Estándar</Text>
                            <Text style={styles.optionDesc}>Llega en 3-5 días hábiles</Text>
                        </View>
                        <Text style={styles.optionPrice}>${shippingCost.toFixed(2)}</Text>
                    </View>
                </View>

                {/* Points Redemption */}
                {/* Coupon Code */}
                {!items.every(item => item.type === 'subscription') && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Tag size={20} color="#4B5563" />
                            <Text style={styles.sectionTitle}>Código de Descuento / Influencer</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TextInput
                                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                                placeholder="Ej: JORGE10"
                                value={couponCode}
                                onChangeText={setCouponCode}
                                autoCapitalize="characters"
                                placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
                            />
                            <TouchableOpacity
                                onPress={validatePromocode}
                                style={{ backgroundColor: '#4B5563', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 8 }}
                            >
                                <Text style={{ color: '#fff', fontWeight: '600' }}>Aplicar</Text>
                            </TouchableOpacity>
                        </View>
                        {appliedCoupon && (
                            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <CheckCircle size={14} color="#16a34a" />
                                <Text style={{ color: '#16a34a', fontSize: 13 }}>
                                    Cupón {appliedCoupon.code} aplicado (-{appliedCoupon.discountPercent}%)
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Points Redemption - Hidden if only subscriptions in cart */}
                {!items.every(item => item.type === 'subscription') && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ticket size={20} color="#7C3AED" />
                            <Text style={styles.sectionTitle}>Canjear Puntos</Text>
                            <View style={{ marginLeft: 'auto', backgroundColor: isDark ? 'rgba(124, 58, 237, 0.2)' : '#EDE9FE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                                <Text style={{ color: '#7C3AED', fontWeight: 'bold', fontSize: 12 }}>Saldo: {points}</Text>
                            </View>
                        </View>

                        {subscriptionTotal > 0 && (
                            <Text style={{ fontSize: 12, color: '#EF4444', marginBottom: 12, fontStyle: 'italic' }}>
                                * Las suscripciones no pueden pagarse con puntos.
                            </Text>
                        )}

                        {availableDiscounts.length > 0 ? (
                            <View style={{ gap: 8 }}>
                                {availableDiscounts.map((tier, index) => (
                                    <TouchableOpacity
                                        key={index}
                                        style={[
                                            styles.discountOption,
                                            selectedDiscount?.points === tier.points && styles.discountOptionSelected
                                        ]}
                                        onPress={() => setSelectedDiscount(selectedDiscount?.points === tier.points ? null : tier)}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <Tag size={16} color={selectedDiscount?.points === tier.points ? '#fff' : '#4B5563'} />
                                            <Text style={[
                                                styles.discountText,
                                                selectedDiscount?.points === tier.points && styles.discountTextSelected
                                            ]}>
                                                ${tier.discount.toFixed(2)} OFF
                                            </Text>
                                        </View>
                                        <Text style={[
                                            styles.pointsCost,
                                            selectedDiscount?.points === tier.points && styles.pointsCostSelected
                                        ]}>
                                            {tier.points} pts
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : (
                            <Text style={{ color: '#6B7280', fontSize: 13, fontStyle: 'italic' }}>
                                No tienes suficientes puntos para canjear descuentos aún. (Mínimo 100 pts)
                            </Text>
                        )}
                    </View>
                )}

                {/* Payment - only show if there's something to pay */}
                {finalTotal > 0 ? (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <CreditCard size={20} color="#4B5563" />
                            <Text style={styles.sectionTitle}>Método de Pago</Text>
                        </View>
                        <TextInput
                            style={styles.input}
                            placeholder="Número de Tarjeta"
                            keyboardType="numeric"
                            value={cardNumber}
                            onChangeText={setCardNumber}
                            placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
                        />
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <TextInput style={[styles.input, { flex: 1 }]} placeholder="MM/YY" placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'} />
                            <TextInput style={[styles.input, { flex: 1 }]} placeholder="CVC" placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'} />
                        </View>
                    </View>
                ) : (
                    <View style={[styles.section, { backgroundColor: isDark ? '#064E3B' : '#D1FAE5', borderColor: '#10B981' }]}>
                        <View style={styles.sectionHeader}>
                            <Sparkles size={20} color="#059669" />
                            <Text style={[styles.sectionTitle, { color: '#059669' }]}>¡Compra gratis con puntos!</Text>
                        </View>
                        <Text style={{ color: isDark ? '#A7F3D0' : '#047857', fontSize: 13 }}>
                            Has cubierto el total con tus puntos. No necesitas ingresar datos de pago.
                        </Text>
                    </View>
                )}

                {/* Legal / Escrow Notice */}
                <View style={styles.escrowNotice}>
                    <ShieldCheck size={28} color="#059669" />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.escrowTitle}>Tu dinero está protegido</Text>
                        <Text style={styles.escrowText}>
                            Al confirmar, el pago será retenido por Ramgos.
                            El vendedor solo recibirá el dinero 10 días después de que confirmes la entrega.
                        </Text>
                    </View>
                </View>

                {/* Summary */}
                <View style={styles.summary}>
                    <View style={styles.row}>
                        <Text style={styles.label}>Subtotal</Text>
                        <Text style={styles.value}>${totalPrice.toFixed(2)}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>Envío</Text>
                        <Text style={styles.value}>${shippingCost.toFixed(2)}</Text>
                    </View>
                    {selectedDiscount && (
                        <View style={styles.row}>
                            <Text style={[styles.label, { color: '#7C3AED' }]}>Descuento (Puntos)</Text>
                            <Text style={[styles.value, { color: '#7C3AED' }]}>-${pointsDiscountAmount.toFixed(2)}</Text>
                        </View>
                    )}
                    {appliedCoupon && (
                        <View style={styles.row}>
                            <Text style={[styles.label, { color: '#16a34a' }]}>Descuento ({appliedCoupon.code})</Text>
                            {/* We need to recalculate or access the variable. Since render is one pass, we can use the variable defined in body */}
                            <Text style={[styles.value, { color: '#16a34a' }]}>
                                -${(eligibleForDiscountTotal * (appliedCoupon.discountPercent / 100)).toFixed(2)}
                            </Text>
                        </View>
                    )}
                    <View style={[styles.row, styles.totalRow]}>
                        <Text style={styles.totalLabel}>Total a Pagar</Text>
                        <Text style={styles.totalValue}>${finalTotal.toFixed(2)}</Text>
                    </View>

                    {/* Points preview (non-mutating) - compact version */}
                    {eligibleForDiscountTotal > 0 && purchaseEligible > 0 && (
                        <View style={styles.pointsPreviewRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Sparkles size={14} color="#F59E0B" />
                                <Text style={styles.pointsPreviewLabel}>Ganás con esta compra</Text>
                            </View>
                            <Text style={styles.pointsPreviewValue}>
                                +{purchasePointsPreview.totalPoints} pts
                            </Text>
                        </View>
                    )}
                    {eligibleForDiscountTotal > 0 && purchaseEligible > 0 && (
                        <Text style={styles.pointsPreviewHint}>
                            1 pt por cada $1 pagado{purchasePointsPreview.bonusPoints > 0 ? ` + bonus ${purchasePointsPreview.tierLabel}` : ''}
                        </Text>
                    )}
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.payBtn, loading && styles.payBtnDisabled]}
                    onPress={handlePlaceOrder}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Text style={styles.payBtnText}>Confirmar Pago</Text>
                            <CheckCircle size={20} color="#fff" />
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#111827' : '#F9FAFB' },
    section: { backgroundColor: isDark ? '#1F2937' : '#fff', padding: 16, borderRadius: 12, marginBottom: 16 },
    sectionHeader: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: isDark ? '#F9FAFB' : '#1F2937' },
    input: { backgroundColor: isDark ? '#374151' : '#F3F4F6', color: isDark ? '#F9FAFB' : '#000', padding: 12, borderRadius: 8, marginBottom: 8, fontSize: 16 },

    optionSelected: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isDark ? 'rgba(30, 64, 175, 0.2)' : '#EFF6FF', padding: 12, borderRadius: 8, borderColor: isDark ? '#1E40AF' : '#BFDBFE', borderWidth: 1 },
    optionTitle: { fontWeight: '600', color: isDark ? '#60A5FA' : '#1E40AF' },
    optionDesc: { fontSize: 12, color: '#60A5FA' },
    optionPrice: { fontWeight: 'bold', color: isDark ? '#60A5FA' : '#1E40AF' },

    escrowNotice: { flexDirection: 'row', gap: 12, backgroundColor: isDark ? 'rgba(6, 95, 70, 0.2)' : '#ECFDF5', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#34D399' },
    escrowTitle: { fontWeight: 'bold', color: isDark ? '#34D399' : '#064E3B', marginBottom: 4 },
    escrowText: { fontSize: 13, color: isDark ? '#D1FAE5' : '#065F46', lineHeight: 18 },

    summary: { backgroundColor: isDark ? '#1F2937' : '#fff', padding: 16, borderRadius: 12 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    label: { color: '#6B7280' },
    value: { fontWeight: '500', color: isDark ? '#F9FAFB' : '#1F2937' },
    totalRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#E5E7EB' },
    totalLabel: { fontWeight: 'bold', fontSize: 16, color: isDark ? '#F9FAFB' : '#000' },
    totalValue: { fontWeight: '900', fontSize: 18, color: '#7C3AED' },

    footer: { padding: 16, backgroundColor: isDark ? '#1F2937' : '#fff', borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#E5E7EB' },
    payBtn: { backgroundColor: '#7C3AED', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 12, gap: 8 },
    payBtnDisabled: { opacity: 0.7 },
    payBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

    discountOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, backgroundColor: isDark ? '#374151' : '#F3F4F6', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB' },
    discountOptionSelected: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
    discountText: { fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },
    discountTextSelected: { color: '#fff' },
    pointsCost: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
    pointsCostSelected: { color: '#E9D5FF' },

    // Points Preview (compact)
    pointsPreviewRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: isDark ? '#374151' : '#E5E7EB',
    },
    pointsPreviewLabel: {
        fontSize: 13,
        color: '#F59E0B',
        fontWeight: '600',
    },
    pointsPreviewValue: {
        fontSize: 15,
        fontWeight: '800',
        color: '#F59E0B',
    },
    pointsPreviewHint: {
        fontSize: 11,
        color: isDark ? '#9CA3AF' : '#78716C',
        marginTop: 4,
        textAlign: 'right',
    },
});
