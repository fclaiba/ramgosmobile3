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

import { useActionGate } from '../../utils/useActionGate';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { StripePaymentModal } from '../../components/stripe/StripePaymentModal';

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

    const [loading, setLoading] = useState(false);
    const [selectedDiscount, setSelectedDiscount] = useState<{ points: number; discount: number } | null>(null);
    // Optional referral code input — propagated to every line item that
    // doesn't already have one, so the buyer can credit an influencer at
    // checkout. The server (convex/stripe.ts) is the source of truth for
    // resolving + validating the attribution; we DON'T grant a discount
    // here. (The legacy discount-coupon path was removed when campaigns
    // moved to the backend; influencer commission is paid out of the
    // platform/seller take, not deducted from the buyer.)
    const [referralCodeInput, setReferralCodeInput] = useState('');

    // Stripe
    const [stripeModalVisible, setStripeModalVisible] = useState(false);
    const [clientSecret, setClientSecret] = useState('');
    const stripeCreatePaymentIntentRef = (api as any).stripe?.createPaymentIntent;
    const createPaymentIntent = useAction(stripeCreatePaymentIntentRef || api.users.syncUser);

    // Event capacity holds — call BEFORE the PaymentIntent. If hold fails
    // (sold out / oversold) we never charge the buyer.
    const holdEventCapacityFn = (api as any).events?.holdEventCapacity;
    const releaseEventCapacityFn = (api as any).events?.releaseEventCapacity;
    const holdEventCapacity = useMutation(holdEventCapacityFn || api.users.syncUser);
    const releaseEventCapacity = useMutation(releaseEventCapacityFn || api.users.syncUser);

    // Mock Form State
    const [address, setAddress] = useState('Av. Libertador 1234');
    const [city, setCity] = useState('Buenos Aires');
    const [cardNumber, setCardNumber] = useState('');

    const availableDiscounts = getAvailableDiscounts();

    // Force clear discount if only subscriptions are in cart
    useEffect(() => {
        if (items.length > 0 && items.every(i => i.type === 'subscription')) {
            setSelectedDiscount(null);
        }
    }, [items]);

    // Calculate eligible total for discounts (exclude subscriptions)
    const subscriptionTotal = items
        .filter(item => item.type === 'subscription')
        .reduce((sum, item) => sum + item.price * item.quantity, 0);

    const eligibleForDiscountTotal = totalPrice - subscriptionTotal;

    const shippingCost = items.every((i) => i.type === 'subscription') ? 0 : 12.0;

    // Calculate Points Discount
    const pointsDiscountAmount = Math.min(selectedDiscount?.discount || 0, eligibleForDiscountTotal);

    const totalDiscount = Math.min(pointsDiscountAmount, eligibleForDiscountTotal);

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
            if (requiresPayment) {
                if (!stripeCreatePaymentIntentRef) {
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
                            actorId: undefined as any,
                            listingId: String(ev.id) as any,
                            quantity: ev.quantity,
                        });
                        heldEvents.push({ listingId: String(ev.id), quantity: ev.quantity });
                    } catch (e: any) {
                        // Rollback any previously held capacity for THIS checkout.
                        for (const held of heldEvents) {
                            try {
                                await releaseEventCapacity({
                                    actorId: undefined as any,
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
                    // PaymentIntent creation failed — release held event
                    // capacity so we don't oversell.
                    for (const held of heldEvents) {
                        try {
                            await releaseEventCapacity({
                                actorId: undefined as any,
                                listingId: held.listingId as any,
                                quantity: held.quantity,
                            });
                        } catch (_) { /* best-effort */ }
                    }
                    throw intentErr;
                }
                if (intentResult && intentResult.clientSecret) {
                    setClientSecret(intentResult.clientSecret);
                    setStripeModalVisible(true);
                    setLoading(false); // Modal will handle its own presentation
                    return; // Wait for onPaymentSuccess
                } else {
                    show('Error al iniciar el pago seguro', 'error');
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

            // Create Order
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

            // Financial splits are handled server-side by the Stripe webhook (internalMarkPaymentSucceeded).
            // No client-side processCheckoutTransaction needed.

            // Subscriptions are NOT handled through the cart anymore (Sprint 4):
            //   - business merchant → Stripe Subscriptions (SubscriptionPlansScreen).
            //   - consumer pro      → Apple IAP / Google Play Billing.
            // If a subscription somehow still slipped into the cart we just log it
            // — `users.subscriptionTier` is now driven by the webhook stream.
            const stillHasSubscriptionInCart = items.some((i) => i.type === 'subscription');
            if (stillHasSubscriptionInCart) {
                console.warn('[Checkout] Subscription item in cart ignored — use SubscriptionPlansScreen instead.');
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

                {/* Influencer Referral Code (optional) — does NOT change
                    the buyer's price. The server uses it to credit a
                    commission to the influencer when the listing's
                    business has either openPromotion enabled or an
                    active campaign with that influencer. */}
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

            {stripeModalVisible && (
                <StripePaymentModal
                    visible={stripeModalVisible}
                    clientSecret={clientSecret}
                    onPaymentSuccess={() => {
                        setStripeModalVisible(false);
                        finalizeOrderProcess();
                    }}
                    onPaymentError={(err) => {
                        setStripeModalVisible(false);
                        show(err, 'error');
                    }}
                    onCancel={() => {
                        setStripeModalVisible(false);
                        show('Pago cancelado', 'info');
                    }}
                />
            )}
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
