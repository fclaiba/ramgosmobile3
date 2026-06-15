import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { usePoints } from '../../contexts/PointsContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { useMarketplace } from '../../contexts/MarketplaceContext';
import { MobileHeader } from '../../components/MobileHeader';
import { CreditCard, ShieldCheck, MapPin, Truck, CheckCircle, Tag, Ticket, Sparkles, User, Calendar, Lock } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { useRewards } from '../../contexts/RewardsContext';
import { useReferral } from '../../contexts/ReferralContext';
import { useSecurePayment } from '../../hooks/useSecurePayment';

import { useActionGate } from '../../utils/useActionGate';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export default function CheckoutScreen({ navigation }: any) {
    const { items, totalPrice, clearCart } = useCart();
    const { placeOrder } = useMarketplace();
    const { points, getAvailableDiscounts, redeemPoints, trackPurchase, previewPurchasePoints } = usePoints();
    const { registerQuarterlyPurchase } = useRewards();
    const { notifyMyFirstPurchase } = useReferral();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();
    const { gateCheckout } = useActionGate();
    const { processPayment } = useSecurePayment();
    const createPaymentIntent = useAction(api.stripe.createPaymentIntent);

    const [loading, setLoading] = useState(false);
    const [selectedDiscount, setSelectedDiscount] = useState<{ points: number; discount: number } | null>(null);
    const [referralCodeInput, setReferralCodeInput] = useState('');


    // Event capacity holds
    const holdEventCapacity = useMutation(api.events.holdEventCapacity);
    const releaseEventCapacity = useMutation(api.events.releaseEventCapacity);

    // Form State
    const [address, setAddress] = useState('Av. Libertador 1234');
    const [city, setCity] = useState('Buenos Aires');
    const [focusedField, setFocusedField] = useState<string>('');

    const availableDiscounts = getAvailableDiscounts();

    useEffect(() => {
        if (items.length > 0 && items.every(i => i.type === 'subscription')) {
            setSelectedDiscount(null);
        }
    }, [items]);

    const subscriptionTotal = items
        .filter(item => item.type === 'subscription')
        .reduce((sum, item) => sum + item.price * item.quantity, 0);

    const eligibleForDiscountTotal = totalPrice - subscriptionTotal;
    const shippingCost = items.every((i) => i.type === 'subscription') ? 0 : 12.0;
    const pointsDiscountAmount = Math.min(selectedDiscount?.discount || 0, eligibleForDiscountTotal);
    const totalDiscount = Math.min(pointsDiscountAmount, eligibleForDiscountTotal);
    const finalTotal = Math.max(0, totalPrice + shippingCost - totalDiscount);

    const handlePlaceOrder = async () => {
        if (!gateCheckout()) {
            return;
        }

        const requiresPayment = finalTotal > 0;
        
        if (!address) {
            show('Completa la dirección de envío', 'error');
            return;
        }
        
        if (requiresPayment) {
            // Con PaymentSheet, los datos de la tarjeta se piden en el modal nativo.
            // Ya no validamos isCardComplete o name aquí.
        }

        setLoading(true);

        try {
            if (requiresPayment) {
                if (!createPaymentIntent) {
                    show('Stripe no está inicializado en el backend. Configura y redeploya credenciales antes de cobrar.', 'error');
                    setLoading(false);
                    return;
                }

                // Build lineItems with full split context per item:
                //   - sellerId: who receives the seller leg of the transfer
                //   - influencerId: optional, derived from item-level
                //     referralCode (server-side will resolve later in Sprint 5)
                //   - type: drives commissionRate (bonos = 30%, others = 12%)
                //   - amountInCents per UNIT (server multiplies by quantity)
                //
                // Subscriptions are EXCLUDED from this checkout in Sprint 4
                // (they go through Stripe Subscriptions / IAP, not the cart).
                // Until Sprint 4 lands we still allow them through to avoid
                // breaking the demo flow — they just have no sellerId so
                // the transfer step is a no-op for them.
                const totalCents = Math.round(finalTotal * 100);
                const subtotalCents = Math.round(totalPrice * 100);

                // Step A: hold capacity for any event line item. If the hold
                // fails for any item we abort and rollback the previous holds.
                const eventItems = items.filter((it) => it.type === 'event');
                const heldEvents: Array<{ listingId: string; quantity: number }> = [];
                for (const ev of eventItems) {
                    try {
                        await holdEventCapacity({
                            listingId: String(ev.id) as any,
                            quantity: ev.quantity,
                        });
                        heldEvents.push({ listingId: String(ev.id), quantity: ev.quantity });
                    } catch (e: any) {
                        // Rollback any previously held capacity for THIS checkout.
                        for (const held of heldEvents) {
                            try {
                                await releaseEventCapacity({
                                    listingId: held.listingId as any,
                                    quantity: held.quantity,
                                });
                            } catch (_) { /* best-effort */ }
                        }
                        show(e?.message || 'Capacidad agotada en uno de los eventos.', 'error');
                        setLoading(false);
                        return;
                    }
                }

                // Step B: build line items with proportional discount/shipping.
                const linesRaw = items
                    .filter((it) => it.type !== 'subscription')
                    .map((it) => {
                        const lineSubtotalCents = Math.round(it.price * it.quantity * 100);
                        const proportion = subtotalCents > 0 ? lineSubtotalCents / subtotalCents : 0;
                        const shippingShareCents = Math.round(shippingCost * 100 * proportion);
                        const discountShareCents = Math.round(totalDiscount * 100 * proportion);
                        const adjustedLineCents = Math.max(
                            0,
                            lineSubtotalCents + shippingShareCents - discountShareCents,
                        );
                        return {
                            listingId: String(it.id),
                            sellerId: it.sellerId,
                            type: it.type,
                            amountInCents: adjustedLineCents,
                            // referralCode is the influencer attribution
                            // hint. The server resolves it to a userId via
                            // users.by_referral_code and credits the
                            // influencer's wallet on payment_intent.succeeded.
                            // Cart-item code wins over the manual checkout
                            // input fallback so deep-linked attribution
                            // can't be silently overridden.
                            referralCode:
                                it.referralCode ||
                                (referralCodeInput.trim().toUpperCase() || undefined),
                            // We bake quantity into amountInCents already, but
                            // we still pass `quantity` in metadata so the
                            // bono / event emitter knows how many units to
                            // emit downstream.
                            quantity: 1,
                            description: it.name,
                        };
                    });

                let intentResult: any;
                try {
                    intentResult = await createPaymentIntent({
                        amountInCents: linesRaw.length > 0 ? undefined : totalCents,
                        lineItems: linesRaw.length > 0 ? linesRaw : undefined,
                    });
                } catch (intentErr: any) {
                    // Release held event capacity on failure
                    for (const held of heldEvents) {
                        try {
                            await releaseEventCapacity({
                                listingId: held.listingId as any,
                                quantity: held.quantity,
                            });
                        } catch (_) { /* best-effort */ }
                    }
                    show(intentErr.message || 'No se pudo procesar el pago.', 'error');
                    setLoading(false);
                    return;
                }

                if (intentResult && intentResult.success && intentResult.clientSecret) {
                    const confirmRes = await processPayment(intentResult.clientSecret);

                    if (!confirmRes.success) {
                        // Release held event capacity on failure
                        for (const held of heldEvents) {
                            try {
                                await releaseEventCapacity({
                                    listingId: held.listingId as any,
                                    quantity: held.quantity,
                                });
                            } catch (_) { /* best-effort */ }
                        }
                        show(confirmRes.error || 'Error al confirmar el pago en la pasarela.', 'error');
                        setLoading(false);
                        return;
                    }

                    // Payment confirmed — finalize order
                    await finalizeOrderProcess();
                    return;
                } else if (intentResult && intentResult.status) {
                    // Release held event capacity on failure
                    for (const held of heldEvents) {
                        try {
                            await releaseEventCapacity({
                                listingId: held.listingId as any,
                                quantity: held.quantity,
                            });
                        } catch (_) { /* best-effort */ }
                    }
                    show(`El pago requiere validación o falló: ${intentResult.status}`, 'error');
                    setLoading(false);
                    return;
                } else {
                    // Release held event capacity on failure
                    for (const held of heldEvents) {
                        try {
                            await releaseEventCapacity({
                                listingId: held.listingId as any,
                                quantity: held.quantity,
                            });
                        } catch (_) { /* best-effort */ }
                    }
                    show(intentResult?.error || 'Error al procesar el pago', 'error');
                    setLoading(false);
                    return;
                }
            } else {
                // Free via points, proceed directly
                finalizeOrderProcess();
            }
        } catch (error) {
            console.error(error);
            show('Error de conexión', 'error');
            setLoading(false);
        }
    };

    const finalizeOrderProcess = async () => {
        setLoading(true);
        try {
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

            const checkoutRequestId = `checkout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const result = await placeOrder({
                cartItems: items,
                requestId: checkoutRequestId,
                shippingMethod: 'standard',
                shippingDestination: {
                    fullName: 'Usuario Demo',
                    addressLine1: address,
                    city: city,
                    postalCode: '1425',
                    country: 'Argentina',
                },
                paymentDetails: {
                    discountApplied: eligibleForDiscountTotal > 0 ? totalDiscount : 0,
                    finalAmount: finalTotal,
                },
            });

            if (result.success) {
                if (eligibleForDiscountTotal > 0) {
                    trackPurchase(eligibleForDiscountTotal);
                    notifyMyFirstPurchase(eligibleForDiscountTotal).catch((err) => {
                        console.warn('[Checkout] notifyMyFirstPurchase failed', err);
                    });
                    registerQuarterlyPurchase();
                }
                clearCart();
                show('¡Compra Exitosa! Orden procesada', 'success');
                setTimeout(() => navigation.navigate('History', { tab: 'purchases' }), 1000);
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

                {!items.every(item => item.type === 'subscription') && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Tag size={20} color="#4B5563" />
                            <Text style={styles.sectionTitle}>Código de Influencer (opcional)</Text>
                        </View>
                        <TextInput
                            style={[styles.input, { marginBottom: 4 }]}
                            placeholder="Ej: JORGE10"
                            value={referralCodeInput}
                            onChangeText={setReferralCodeInput}
                            autoCapitalize="characters"
                            placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
                        />
                        <Text style={{ fontSize: 11, color: isDark ? '#9CA3AF' : '#6B7280' }}>
                            Acreditá tu compra al influencer que te recomendó. El precio no cambia.
                        </Text>
                    </View>
                )}

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

                {finalTotal > 0 ? (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <CreditCard size={20} color="#4B5563" />
                            <Text style={styles.sectionTitle}>Método de Pago</Text>
                        </View>
                        <View style={styles.inputGroup}>
                            <View style={[styles.inputWrapper, { backgroundColor: isDark ? '#374151' : '#F3F4F6', borderColor: 'transparent' }]}>
                                <Lock size={20} color="#059669" style={styles.inputIcon} />
                                <Text style={{ color: isDark ? '#D1D5DB' : '#4B5563', flex: 1 }}>
                                    Los datos de tu tarjeta se solicitarán de forma segura en el siguiente paso.
                                </Text>
                            </View>
                        </View>
                    </View>
                ) : (
                    <View style={[styles.section, { backgroundColor: isDark ? '#064E3B' : '#D1FAE5', borderColor: '#10B981' }]}>
                        <View style={styles.sectionHeader}>
                            <Sparkles size={20} color="#059669" />
                            <Text style={[styles.sectionTitle, { color: '#059669' }]}>¡Compra gratis con puntos!</Text>
                        </View>
                        <Text style={{ color: isDark ? '#A7F3D0' : '#047857', fontSize: 13 }}>
                            Has cubierto el total con tus puntos. <Text style={{ color: isDark ? '#A7F3D0' : '#047857', fontWeight: 'bold' }}>+{previewPurchasePoints(eligibleForDiscountTotal).totalPoints} Puntos Ramgos</Text>. No necesitas ingresar datos de pago.
                        </Text>
                    </View>
                )}

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
                    <View style={[styles.row, styles.totalRow]}>
                        <Text style={styles.totalLabel}>Total a Pagar</Text>
                        <Text style={styles.totalValue}>${finalTotal.toFixed(2)}</Text>
                    </View>

                    {eligibleForDiscountTotal > 0 && (
                        <View style={styles.pointsPreviewRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Sparkles size={14} color="#F59E0B" />
                                <Text style={styles.pointsPreviewLabel}>Ganás con esta compra</Text>
                            </View>
                            <Text style={styles.pointsPreviewValue}>
                                ¡Completá tu compra y sumá {previewPurchasePoints(eligibleForDiscountTotal).totalPoints} puntos!
                            </Text>
                        </View>
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
    inputGroup: { gap: 16 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#374151' : '#fff', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#e5e7eb', borderRadius: 12, height: 50, paddingHorizontal: 12 },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, fontSize: 16, color: isDark ? '#F9FAFB' : '#111827', height: '100%' },

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
