import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, useWindowDimensions, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, ZoomIn, useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming } from 'react-native-reanimated';
import { CreditCard, Lock, CheckCircle, ShieldCheck, User, Calendar, Cctv, ChevronRight, X, Wallet, Building, ArrowRightLeft, Home, Trophy, Coins } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MobileHeader } from '../components/MobileHeader';
import { useCart } from '../contexts/CartContext';
import { usePoints } from '../contexts/PointsContext';
import { useMarketplace, ShippingMethod } from '../contexts/MarketplaceContext';
import { useFintech, PaymentRecord } from '../contexts/FintechContext';
import { PaymentSplit } from '../services/fintech/paymentSplitter';
import { PaymentProviderKey } from '../services/fintech/paymentProviders';
import { POINT_VALUE_USD } from '../contexts/RewardsContext';
import { useReferral } from '../contexts/ReferralContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useActionGate } from '../utils/useActionGate';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { StripePaymentModal } from '../components/stripe/StripePaymentModal';
import { useAuth } from '../contexts/AuthContext';

export default function PaymentScreen({ route, navigation }: any) {
    const { width } = useWindowDimensions();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();
    const { gateCheckout } = useActionGate();
    const safeMoney = (value?: number) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

    const params = route.params || {};
    const amount: number = params.amount ?? 0;
    const discountUsedPoints: number = params.discountUsedPoints ?? 0;
    const discountAmount: number = params.discountAmount ?? 0;
    const referralDiscount: number = params.referralDiscount ?? 0;
    const currency: string = params.currency ?? 'USD';
    const shippingMethod: string = params.shippingMethod ?? 'pickup';
    const shippingCost: number = params.shippingCost ?? 0;
    const shippingQuote = params.shippingQuote;
    const shippingDestination = params.shippingDestination;
    const cartSnapshot = params.cartSnapshot ?? params.cartItems ?? [];

    const sellerId: string = params.sellerId ?? 'business_demo';
    const sellerName: string = params.sellerName ?? 'Taquería El Sabor';
    const influencerId: string | undefined = params.influencerId;
    const influencerName: string | undefined = influencerId ? params.influencerName ?? 'Influencer Demo' : undefined;
    const commissionRate: number | undefined = params.commissionRate;
    const influencerRate: number | undefined = params.influencerRate;

    const { clearCart } = useCart();
    const { redeemPoints, trackPurchase, points, previewPurchasePoints } = usePoints();
    const { notifyMyFirstPurchase } = useReferral();
    const { placeOrder } = useMarketplace();
    const { previewSplit, providers } = useFintech();
    const { user } = useAuth();

    // Stripe
    const stripeCreatePaymentIntentRef = (api as any).stripe?.createPaymentIntent;
    const createPaymentIntentAction = useAction(stripeCreatePaymentIntentRef || api.users.syncUser);
    const [stripeModalVisible, setStripeModalVisible] = useState(false);
    const [clientSecret, setClientSecret] = useState('');

    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [paymentReceipt, setPaymentReceipt] = useState<PaymentRecord | null>(null);
    const [processingError, setProcessingError] = useState<string | null>(null);
    const [selectedProvider, setSelectedProvider] = useState<PaymentProviderKey>('stripe');
    const [createdOrders, setCreatedOrders] = useState<string[]>([]);

    const shippingLabel =
        shippingMethod === 'express'
            ? 'Express'
            : shippingMethod === 'pickup'
                ? 'Retiro en punto'
                : 'Estándar';

    // Form State
    const [name, setName] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [expiry, setExpiry] = useState('');
    const [cvc, setCvc] = useState('');
    const [saveCard, setSaveCard] = useState(false);
    const [cardBrand, setCardBrand] = useState('VISA');

    // Points Redemption State
    const [localAppliedPoints, setLocalAppliedPoints] = useState<number>(discountUsedPoints);
    const [localDiscountAmount, setLocalDiscountAmount] = useState<number>(discountAmount);
    const [pointsInput, setPointsInput] = useState('');

    // Calculate final totals with local discount
    const finalAmount = Math.max(0, amount - localDiscountAmount - referralDiscount);
    const pointsPreview = useMemo(() => previewPurchasePoints(finalAmount), [finalAmount, previewPurchasePoints]);
    const subtotal = useMemo(() => {
        if (!Array.isArray(cartSnapshot)) return amount;
        return cartSnapshot.reduce((sum: number, item: any) => sum + item.price * (item.quantity || 1), 0);
    }, [cartSnapshot, amount]);
    const itemCount = useMemo(() => {
        if (!Array.isArray(cartSnapshot)) return 0;
        return cartSnapshot.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
    }, [cartSnapshot]);

    useEffect(() => {
        setLocalAppliedPoints(discountUsedPoints);
        setLocalDiscountAmount(discountAmount);
    }, [discountUsedPoints, discountAmount]);

    const handleApplyPoints = () => {
        const pointsToUse = parseInt(pointsInput.replace(/\D/g, ''), 10);

        if (isNaN(pointsToUse) || pointsToUse <= 0) {
            show('Ingresa una cantidad válida de puntos (mínimo 1)', 'error');
            return;
        }

        if (pointsToUse > points) {
            show(`Solo tienes ${points} puntos disponibles`, 'error');
            return;
        }

        // Constitución: 1 punto = $0.01
        const discountValue = pointsToUse * POINT_VALUE_USD;

        if (discountValue > amount) {
            const maxPoints = Math.floor(amount / POINT_VALUE_USD);
            if (pointsToUse > maxPoints) {
                show(`Descuento ajustado al máximo: $${amount.toFixed(2)} (${maxPoints} pts)`, 'info');
                setLocalAppliedPoints(maxPoints);
                setLocalDiscountAmount(maxPoints * POINT_VALUE_USD);
                setPointsInput(maxPoints.toString());
                return;
            }
        }

        setLocalAppliedPoints(pointsToUse);
        setLocalDiscountAmount(discountValue);
        setPointsInput('');
        show(`Se descontaron $${discountValue.toFixed(2)} del total.`, 'success');
    };

    const handleUseMaxPoints = () => {
        if (points <= 0) {
            show('No tienes puntos para canjear.', 'warning');
            return;
        }
        const maxPointsForAmount = Math.floor(amount / POINT_VALUE_USD);
        const pointsToUse = Math.min(points, maxPointsForAmount);

        const discountValue = pointsToUse * POINT_VALUE_USD;

        setLocalAppliedPoints(pointsToUse);
        setLocalDiscountAmount(discountValue);
        setPointsInput(pointsToUse.toString());
    };

    const handleRemovePoints = () => {
        setLocalAppliedPoints(0);
        setLocalDiscountAmount(0);
        setPointsInput('');
    };

    const splitPreview = useMemo<PaymentSplit | null>(() => {
        if (!finalAmount || finalAmount <= 0) {
            return null;
        }
        try {
            return previewSplit({
                total: finalAmount,
                currency,
                sellerId,
                sellerName,
                influencerId,
                influencerName,
                commissionRate,
                influencerRate,
            });
        } catch {
            return null;
        }
    }, [finalAmount, amount, commissionRate, currency, influencerId, influencerName, influencerRate, previewSplit, sellerId, sellerName]);

    const selectedProviderDef = useMemo(
        () => providers.find((provider) => provider.key === selectedProvider),
        [providers, selectedProvider]
    );

    useEffect(() => {
        setProcessingError(null);
    }, [selectedProvider]);

    useEffect(() => {
        setSuccess(false);
        setPaymentReceipt(null);
        setCreatedOrders([]);
    }, [amount]);

    const handlePayment = async () => {
        if (!gateCheckout()) {
            return;
        }

        // If amount is 0 (fully paid with points), skip card validation
        const requiresCard = finalAmount > 0;

        if (requiresCard && (!cardNumber || !expiry || !cvc || !name)) {
            show('Por favor completa todos los detalles de la tarjeta.', 'warning');
            return;
        }

        if (finalAmount < 0) {
            show('El monto a pagar no puede ser negativo.', 'error');
            return;
        }

        const cleanedCardNumber = cardNumber.replace(/\D/g, '');
        if (requiresCard && cleanedCardNumber.length < 12) {
            show('Revisa que el número de tarjeta sea correcto.', 'warning');
            return;
        }

        const [expMonthRaw, expYearRaw] = expiry.split('/');
        if (requiresCard && (!expMonthRaw || !expYearRaw)) {
            show('Ingresa una fecha de expiración en formato MM/YY.', 'warning');
            return;
        }

        setLoading(true);
        setProcessingError(null);

        try {
            if (finalAmount > 0) {
                if (!stripeCreatePaymentIntentRef) {
                    show('Stripe no está inicializado. Configura y redeploya credenciales antes de cobrar.', 'error');
                    setLoading(false);
                    return;
                }
                const amountInCents = Math.round(finalAmount * 100);
                const intentResult = await createPaymentIntentAction({
                    amountInCents,
                    userId: user?.id,
                    sellerId,
                    commissionRate,
                    influencerRate,
                    influencerId,
                    description: params.description ?? `Compra en ${sellerName}`,
                    metadata: {
                        cartItems: cartSnapshot,
                        shippingMethod,
                        shippingCost,
                        discountUsedPoints: localAppliedPoints,
                        discountAmount: localDiscountAmount,
                    },
                });
                if (intentResult && intentResult.clientSecret) {
                    setClientSecret(intentResult.clientSecret);
                    setStripeModalVisible(true);
                    setLoading(false);
                    return;
                } else {
                    show('Error al iniciar el pago seguro', 'error');
                    setLoading(false);
                    return;
                }
            } else {
                // Fully paid with points — no Stripe charge needed
                await finalizeOrderProcess();
            }
        } catch (error: any) {
            console.error('Payment error', error);
            const message = typeof error?.message === 'string' ? error.message : 'No pudimos procesar tu pago. Intenta nuevamente.';
            setProcessingError(message);
            show(message, 'error');
            setLoading(false);
        }
    };

    const finalizeOrderProcess = async () => {
        setLoading(true);
        try {
            // Build a minimal PaymentRecord for the success UI (points-only or post-Stripe confirmation)
            const splitData = previewSplit({
                total: finalAmount,
                currency,
                sellerId,
                sellerName,
                influencerId,
                influencerName,
                commissionRate,
                influencerRate,
            });
            const receipt: PaymentRecord = {
                id: finalAmount > 0 ? `stripe-${Date.now()}` : `pts-${Date.now()}`,
                status: 'succeeded',
                amount: finalAmount,
                currency,
                provider: selectedProvider,
                providerFee: finalAmount > 0 ? Math.round(finalAmount * 0.029 * 100) / 100 + 0.3 : 0,
                method: {
                    brand: finalAmount > 0 ? cardBrand : 'points',
                    last4: finalAmount > 0 ? cardNumber.replace(/\D/g, '').slice(-4).padStart(4, '•') : '0000',
                    expMonth: expiry.split('/')[0] || '00',
                    expYear: expiry.split('/')[1] || '00',
                    ownerName: name.trim() || 'Puntos Ramgos',
                },
                split: splitData,
                gateway: {
                    id: `gw_${Date.now()}`,
                    status: 'succeeded',
                    authorizationCode: finalAmount > 0 ? 'STRIPE' : 'POINTS',
                    providerFee: 0,
                    netAmount: finalAmount,
                    currency,
                    processedAt: new Date().toISOString(),
                    provider: selectedProvider,
                    riskLevel: 'low',
                    rawResponse: { paidWithPoints: finalAmount === 0 },
                },
                metadata: { cartItems: cartSnapshot, shippingMethod, shippingCost },
                description: params.description ?? `Compra en ${sellerName}`,
                createdAt: new Date().toISOString(),
            };

            setPaymentReceipt(receipt);
            setSuccess(true);

            if (Array.isArray(cartSnapshot) && cartSnapshot.length > 0) {
                const safeShippingMethod = (['standard', 'express', 'pickup'].includes(shippingMethod)
                    ? shippingMethod
                    : 'standard') as ShippingMethod;

                const fallbackDestination = shippingDestination ?? {
                    fullName: 'Consumidor Ramgos',
                    addressLine1: 'Retiro a coordinar',
                    city: 'Buenos Aires',
                    postalCode: 'C1000',
                    country: 'Argentina',
                    phone: undefined,
                };

                const orderResult = await placeOrder({
                    cartItems: cartSnapshot,
                    shippingMethod: safeShippingMethod,
                    shippingDestination: fallbackDestination,
                    appliedDiscount: localDiscountAmount + referralDiscount,
                    discountAmount: localDiscountAmount + referralDiscount,
                    shippingQuote,
                });

                if (orderResult.success && orderResult.orders) {
                    setCreatedOrders(orderResult.orders.map((order) => order.id));
                } else if (!orderResult.success && orderResult.error) {
                    setProcessingError(orderResult.error);
                }
            }

            if (localAppliedPoints > 0) {
                redeemPoints(localAppliedPoints, `Descuento de $${localDiscountAmount.toFixed(2)}`);
            }
            trackPurchase(finalAmount);
            await notifyMyFirstPurchase(finalAmount);
            clearCart();

        } catch (error: any) {
            console.error('Finalize order error', error);
            const message = typeof error?.message === 'string' ? error.message : 'No pudimos completar la orden.';
            setProcessingError(message);
            show(message, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Card Number Formatting
    const handleCardNumberChange = (text: string) => {
        const cleaned = text.replace(/\D/g, '');
        const limited = cleaned.slice(0, 19);
        const formatted = limited.replace(/(\d{4})(?=\d)/g, '$1 ');
        setCardNumber(formatted.trim());
        setCardBrand(detectCardBrand(limited));
    };

    // Expiry Formatting
    const handleExpiryChange = (text: string) => {
        const cleaned = text.replace(/\D/g, '');
        if (cleaned.length >= 2) {
            setExpiry(`${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`);
        } else {
            setExpiry(cleaned);
        }
    };

    const receiptProviderName = useMemo(() => {
        if (!paymentReceipt) {
            return undefined;
        }
        const providerMatch = providers.find((provider) => provider.key === paymentReceipt.provider);
        return providerMatch?.displayName ?? paymentReceipt.provider?.toUpperCase?.() ?? 'Puntos';
    }, [paymentReceipt, providers]);

    if (success && paymentReceipt) {
        return (
            <SafeAreaView style={styles.successContainer}>
                <LinearGradient colors={isDark ? ['#111827', '#064E3B'] : ['#fff', '#f0fdf4']} style={StyleSheet.absoluteFill} />
                <ScrollView contentContainerStyle={styles.successScroll}>
                    <View style={styles.successContent}>
                        <Animated.View
                            entering={ZoomIn.springify().damping(12)}
                            style={styles.successHeader}
                        >
                            <View style={styles.successCircle}>
                                <CheckCircle size={width * 0.15} color="#fff" />
                            </View>
                            <Text style={styles.successTitle}>¡Pago Exitoso!</Text>
                            <Text style={styles.successSubtitle}>
                                Tu compra fue confirmada vía {receiptProviderName}.
                            </Text>
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(200).springify()} style={{ width: '100%', alignItems: 'center' }}>
                            <Text style={styles.successAmount}>${safeMoney(paymentReceipt.amount).toFixed(2)}</Text>

                            <View style={styles.breakdownCard}>
                                <View style={styles.breakdownRow}>
                                    <Building size={16} color={isDark ? "#D1D5DB" : "#111827"} />
                                    <Text style={styles.breakdownLabel}>Negocio (pendiente)</Text>
                                    <Text style={styles.breakdownValue}>${safeMoney(paymentReceipt.split?.sellerNet).toFixed(2)}</Text>
                                </View>
                                <View style={styles.breakdownRow}>
                                    <ShieldCheck size={16} color="#2563EB" />
                                    <Text style={styles.breakdownLabel}>
                                        Ramgos {Math.round((paymentReceipt.split?.commissionRate ?? 0) * 100)}%
                                    </Text>
                                    <Text style={styles.breakdownValue}>${safeMoney(paymentReceipt.split?.ramgosCommission).toFixed(2)}</Text>
                                </View>
                                <View style={styles.breakdownRow}>
                                    <CreditCard size={16} color="#6b7280" />
                                    <Text style={styles.breakdownLabel}>Fee pasarela</Text>
                                    <Text style={styles.breakdownValue}>${safeMoney(paymentReceipt.providerFee).toFixed(2)}</Text>
                                </View>
                                {safeMoney(paymentReceipt.split?.influencerAmount) > 0 && paymentReceipt.split?.influencerId && (
                                    <View style={styles.breakdownRow}>
                                        <Wallet size={16} color="#047857" />
                                        <Text style={styles.breakdownLabel}>Influencer</Text>
                                        <Text style={styles.breakdownValue}>${safeMoney(paymentReceipt.split?.influencerAmount).toFixed(2)}</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.breakdownNote}>
                                Los fondos del vendedor se liberan al confirmar la entrega o al finalizar la ventana de disputa.
                            </Text>

                            {createdOrders.length > 0 && (
                                <View style={styles.orderSummary}>
                                    <Text style={styles.orderSummaryTitle}>Órdenes generadas</Text>
                                    {createdOrders.map((id) => (
                                        <Text key={id} style={styles.orderSummaryItem}>#{id}</Text>
                                    ))}
                                    <Text style={styles.orderSummaryHint}>Puedes monitorear el estado desde Historial &gt; Compras.</Text>
                                </View>
                            )}
                        </Animated.View>
                    </View>

                    <TouchableOpacity
                        style={styles.homeButton}
                        onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
                    >
                        <Home size={20} color={isDark ? '#F9FAFB' : '#374151'} style={{ marginRight: 8 }} />
                        <Text style={styles.homeButtonText}>Volver al Inicio</Text>
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        );
    }

    if (success) {
        return (
            <SafeAreaView style={styles.successContainer}>
                <LinearGradient colors={isDark ? ['#111827', '#064E3B'] : ['#fff', '#f0fdf4']} style={StyleSheet.absoluteFill} />
                <ScrollView contentContainerStyle={styles.successScroll}>
                    <View style={styles.successContent}>
                        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.successHeader}>
                            <View style={styles.successCircle}>
                                <CheckCircle size={width * 0.15} color="#fff" />
                            </View>
                            <Text style={styles.successTitle}>¡Pago Exitoso!</Text>
                            <Text style={styles.successSubtitle}>Tu compra ha sido procesada.</Text>
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(200).springify()} style={{ width: '100%', alignItems: 'center' }}>
                            <Text style={styles.successAmount}>${amount.toFixed(2)}</Text>
                            {createdOrders.length > 0 && (
                                <View style={styles.orderSummary}>
                                    <Text style={styles.orderSummaryTitle}>Órdenes generadas</Text>
                                    {createdOrders.map((id) => (
                                        <Text key={id} style={styles.orderSummaryItem}>#{id}</Text>
                                    ))}
                                    <Text style={styles.orderSummaryHint}>Los pagos permanecerán en escrow por 10 días.</Text>
                                </View>
                            )}
                        </Animated.View>
                    </View>

                    <TouchableOpacity
                        style={styles.homeButton}
                        onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
                    >
                        <Home size={20} color={isDark ? '#F9FAFB' : '#374151'} style={{ marginRight: 8 }} />
                        <Text style={styles.homeButtonText}>Volver al Inicio</Text>
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        );
    }

    return (
        <View style={styles.container}>
            <LinearGradient colors={isDark ? ['#111827', '#1F2937'] : ['#F3F4F6', '#E5E7EB']} style={StyleSheet.absoluteFill} />
            <MobileHeader title="Pago Seguro" backButton={true} onBack={() => navigation.goBack()} />

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    {/* Amount Summary */}
                    <View style={styles.summaryContainer}>
                        <View style={styles.summaryHeader}>
                            <Text style={styles.summaryTitle}>Resumen de compra</Text>
                            <Text style={styles.summaryMeta}>{itemCount} ítems</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Subtotal</Text>
                            <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Envío</Text>
                            <Text style={styles.summaryValue}>
                                {shippingMethod === 'pickup' ? '$0.00' : `$${shippingCost.toFixed(2)}`}
                            </Text>
                        </View>
                        {localDiscountAmount > 0 && (
                            <View style={styles.summaryRow}>
                                <Text style={[styles.summaryLabel, { color: '#16a34a' }]}>Descuento (Puntos)</Text>
                                <Text style={[styles.summaryValue, { color: '#16a34a' }]}>
                                    -${localDiscountAmount.toFixed(2)} ({localAppliedPoints} pts)
                                </Text>
                            </View>
                        )}
                        {referralDiscount > 0 && (
                            <View style={styles.summaryRow}>
                                <Text style={[styles.summaryLabel, { color: '#3B82F6' }]}>Descuento (Referido)</Text>
                                <Text style={[styles.summaryValue, { color: '#3B82F6' }]}>
                                    -${referralDiscount.toFixed(2)}
                                </Text>
                            </View>
                        )}
                        <View style={styles.summarySeparator} />
                        <View style={styles.summaryRow}>
                            <Text style={styles.totalLabel}>Total a pagar</Text>
                            <Text style={styles.totalValue}>${finalAmount.toFixed(2)}</Text>
                        </View>
                        <View style={[styles.summaryRow, { marginTop: 6 }]}>
                            <Text style={[styles.summaryLabel, { color: '#F59E0B' }]}>Ganás en puntos</Text>
                            <Text style={[styles.summaryValue, { color: '#F59E0B', fontWeight: '800' }]}>
                                {pointsPreview.totalPoints} pts
                            </Text>
                        </View>
                        {finalAmount === 0 && (
                            <Text style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
                                Los puntos se calculan sobre el monto pagado en efectivo.
                            </Text>
                        )}
                        <Text style={styles.summaryShipping}>
                            {shippingMethod === 'pickup'
                                ? 'Retiro sin costo en punto acordado.'
                                : `Envío ${shippingLabel} · ${shippingDestination?.city ?? 'Destino'}`}
                        </Text>
                    </View>

                    {/* Points Redemption Section */}
                    <View style={styles.pointsCard}>
                        <View style={styles.pointsHeader}>
                            <Trophy size={18} color="#F59E0B" />
                            <Text style={styles.pointsTitle}>Canjear Puntos Ramgos</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <Text style={styles.pointsBalance}>Disponible: <Text style={{ fontWeight: '700', color: isDark ? '#D1D5DB' : '#4B5563' }}>{points}</Text></Text>
                            <View style={styles.pointsConversionBadge}>
                                <Coins size={12} color="#fff" />
                                <Text style={styles.pointsConversionText}>100 pts = $1.00</Text>
                            </View>
                        </View>

                        <View style={styles.pointsInputRow}>
                            <View style={styles.pointsInputWrap}>
                                <TextInput
                                    style={styles.pointsInput}
                                    placeholder="0"
                                    keyboardType="numeric"
                                    value={pointsInput}
                                    onChangeText={setPointsInput}
                                    placeholderTextColor="#9CA3AF"
                                />
                                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>pts</Text>
                            </View>
                            <TouchableOpacity style={styles.applyPointsBtn} onPress={handleApplyPoints}>
                                <Text style={styles.applyPointsText}>Aplicar</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity onPress={handleUseMaxPoints} style={{ alignSelf: 'flex-start', marginTop: 8 }}>
                            <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' }}>
                                Simular usar todos mis puntos (Max. posible)
                            </Text>
                        </TouchableOpacity>
                        {localAppliedPoints > 0 && (
                            <TouchableOpacity onPress={handleRemovePoints} style={{ marginTop: 12, alignSelf: 'center' }}>
                                <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '500' }}>Remover descuento</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {splitPreview && (
                        <View style={styles.splitCard}>
                            <View style={styles.splitHeader}>
                                <ArrowRightLeft size={16} color={isDark ? '#F9FAFB' : '#111827'} />
                                <Text style={styles.splitTitle}>Split de pagos Ramgos</Text>
                            </View>
                            <View style={styles.splitRow}>
                                <Building size={16} color={isDark ? "#D1D5DB" : "#111827"} style={{ marginRight: 8 }} />
                                <Text style={styles.splitRowLabel}>Negocio</Text>
                                <Text style={styles.splitRowValue}>${safeMoney(splitPreview?.sellerGross).toFixed(2)}</Text>
                            </View>
                            <View style={styles.splitRow}>
                                <ShieldCheck size={16} color="#2563EB" style={{ marginRight: 8 }} />
                                <Text style={styles.splitRowLabel}>Ramgos</Text>
                                <Text style={styles.splitRowValue}>${safeMoney(splitPreview?.ramgosCommission).toFixed(2)}</Text>
                            </View>
                            {safeMoney(splitPreview?.influencerAmount) > 0 && splitPreview?.influencerId && (
                                <View style={styles.splitRow}>
                                    <Wallet size={16} color="#047857" style={{ marginRight: 8 }} />
                                    <Text style={styles.splitRowLabel}>Influencer</Text>
                                    <Text style={styles.splitRowValue}>${safeMoney(splitPreview?.influencerAmount).toFixed(2)}</Text>
                                </View>
                            )}
                            <Text style={styles.splitHint}>El fee de la pasarela se resta al confirmar el cobro.</Text>
                        </View>
                    )}

                    {providers.length > 0 && (
                        <View style={styles.providerContainer}>
                            <Text style={styles.sectionTitle}>Pasarela de Pagos</Text>
                            <View style={styles.providerRow}>
                                {providers.map((provider) => {
                                    const isSelected = provider.key === selectedProvider;
                                    return (
                                        <TouchableOpacity
                                            key={provider.key}
                                            style={[styles.providerOption, isSelected && styles.providerOptionActive]}
                                            onPress={() => setSelectedProvider(provider.key)}
                                            activeOpacity={0.85}
                                        >
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.providerName, isSelected && styles.providerNameActive]}>
                                                    {provider.displayName}
                                                </Text>
                                                <Text style={styles.providerCaption}>
                                                    {provider.supportsSplit
                                                        ? 'Split automático y conciliación instantánea'
                                                        : 'Procesamiento estándar'}
                                                </Text>
                                            </View>
                                            {isSelected && <CheckCircle size={16} color={isDark ? "#F9FAFB" : "#111827"} />}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            {selectedProviderDef && (
                                <Text style={styles.providerHelper}>
                                    Procesado por {selectedProviderDef.displayName} • fondos seguros en custodia Ramgos.
                                </Text>
                            )}
                        </View>
                    )}

                    {processingError && (
                        <View style={styles.errorBanner}>
                            <Cctv size={14} color="#b91c1c" style={{ marginRight: 6 }} />
                            <Text style={styles.errorBannerText}>{processingError}</Text>
                        </View>
                    )}

                    {/* Credit Card Visual */}
                    <View style={styles.cardVisualContainer}>
                        <LinearGradient
                            colors={['#1e1b4b', '#4338ca', '#6366f1']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.cardVisual, { width: width - 40 }]}
                        >
                            <View style={styles.cardHeader}>
                                <Chip />
                                <Text style={styles.cardBrand}>{cardBrand.toUpperCase()}</Text>
                            </View>
                            <Text style={styles.cardNumberVisual}>{cardNumber || '•••• •••• •••• ••••'}</Text>
                            <View style={styles.cardFooter}>
                                <View>
                                    <Text style={styles.cardLabel}>TITULAR</Text>
                                    <Text style={styles.cardValue}>{name.toUpperCase() || 'NOMBRE'}</Text>
                                </View>
                                <View>
                                    <Text style={styles.cardLabel}>EXPIRA</Text>
                                    <Text style={styles.cardValue}>{expiry || 'MM/YY'}</Text>
                                </View>
                            </View>
                        </LinearGradient>
                    </View>

                    {/* Form */}
                    <View style={styles.formContainer}>
                        <Text style={styles.sectionTitle}>Detalles de la Tarjeta</Text>

                        <View style={styles.inputGroup}>
                            <View style={styles.inputWrapper}>
                                <User size={20} color="#6b7280" style={styles.inputIcon} />
                                <TextInput
                                    placeholder="Nombre del Titular"
                                    style={styles.input}
                                    value={name}
                                    onChangeText={setName}
                                    placeholderTextColor="#9ca3af"
                                />
                            </View>

                            <View style={styles.inputWrapper}>
                                <CreditCard size={20} color="#6b7280" style={styles.inputIcon} />
                                <TextInput
                                    placeholder="Número de Tarjeta"
                                    style={styles.input}
                                    value={cardNumber}
                                    onChangeText={handleCardNumberChange}
                                    keyboardType="numeric"
                                    maxLength={19}
                                    placeholderTextColor="#9ca3af"
                                />
                            </View>

                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <View style={[styles.inputWrapper, { flex: 1 }]}>
                                    <Calendar size={20} color="#6b7280" style={styles.inputIcon} />
                                    <TextInput
                                        placeholder="MM/YY"
                                        style={styles.input}
                                        value={expiry}
                                        onChangeText={handleExpiryChange}
                                        keyboardType="numeric"
                                        maxLength={5}
                                        placeholderTextColor="#9ca3af"
                                    />
                                </View>
                                <View style={[styles.inputWrapper, { flex: 1 }]}>
                                    <Lock size={20} color="#6b7280" style={styles.inputIcon} />
                                    <TextInput
                                        placeholder="CVC"
                                        style={styles.input}
                                        value={cvc}
                                        onChangeText={setCvc}
                                        keyboardType="numeric"
                                        maxLength={3}
                                        secureTextEntry
                                        placeholderTextColor="#9ca3af"
                                    />
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.saveCardRow} onPress={() => setSaveCard(!saveCard)}>
                            <View style={[styles.checkbox, saveCard && styles.checkboxChecked]}>
                                {saveCard && <CheckCircle size={14} color="#fff" />}
                            </View>
                            <Text style={styles.saveCardText}>Guardar tarjeta para futuras compras</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Security Badge */}
                    <View style={styles.securityBadge}>
                        <ShieldCheck size={16} color="#059669" />
                        <Text style={styles.securityText}>Tus datos están protegidos con encriptación SSL.</Text>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>

            {/* Footer */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.payButton, loading && styles.payButtonDisabled]}
                    onPress={handlePayment}
                    disabled={loading}
                    activeOpacity={0.8}
                >
                    <LinearGradient
                        colors={['#111827', '#374151']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.payButtonGradient}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Text style={styles.payButtonText}>Pagar ${finalAmount.toFixed(2)}</Text>
                                <ChevronRight size={20} color="#fff" />
                            </>
                        )}
                    </LinearGradient>
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

const Chip = () => (
    <View style={{ width: 40, height: 28, borderRadius: 6, overflow: 'hidden', backgroundColor: '#fbbf24', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: 30, height: 18, borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)', borderRadius: 4 }} />
    </View>
);

const detectCardBrand = (digits: string): string => {
    const cleaned = digits.replace(/\D/g, '');
    if (cleaned.startsWith('4')) {
        return 'Visa';
    }
    if (/^5[1-5]/.test(cleaned)) {
        return 'Mastercard';
    }
    if (/^3[47]/.test(cleaned)) {
        return 'Amex';
    }
    if (/^6(?:011|5)/.test(cleaned)) {
        return 'Discover';
    }
    if (/^35/.test(cleaned)) {
        return 'JCB';
    }
    return 'Tarjeta';
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#111827' : '#fff' },
    scrollContent: { padding: 20, paddingBottom: 100 },

    // Success View Styles
    successContainer: { flex: 1, backgroundColor: isDark ? '#111827' : '#fff' },
    successScroll: { flexGrow: 1, padding: 24, paddingBottom: 24 },
    successContent: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', marginBottom: 32 },
    successHeader: { alignItems: 'center', marginBottom: 24, width: '100%' },
    successCircle: {
        width: 100, height: 100, borderRadius: 50, backgroundColor: '#22c55e',
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
        shadowColor: '#22c55e', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10
    },
    successTitle: { fontSize: 24, fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 8 },
    successSubtitle: { fontSize: 16, color: isDark ? '#9CA3AF' : '#6b7280', textAlign: 'center', paddingHorizontal: 20 },
    successAmount: { fontSize: 40, fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827', marginVertical: 24, textAlign: 'center' },

    breakdownCard: { backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: isDark ? '#374151' : '#e5e7eb', width: '100%', marginBottom: 16 },
    breakdownRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    breakdownLabel: { flex: 1, marginLeft: 8, fontSize: 13, color: isDark ? '#9CA3AF' : '#374151' },
    breakdownValue: { fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },
    breakdownNote: { fontSize: 12, color: '#9ca3af', textAlign: 'center', fontStyle: 'italic', marginBottom: 24 },

    orderSummary: { backgroundColor: isDark ? '#1F2937' : '#f9fafb', padding: 16, borderRadius: 12, width: '100%', marginBottom: 24 },
    orderSummaryTitle: { fontSize: 13, fontWeight: 'bold', color: isDark ? '#D1D5DB' : '#374151', marginBottom: 8, textTransform: 'uppercase' },
    orderSummaryItem: { fontSize: 15, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 4 },
    orderSummaryHint: { fontSize: 11, color: '#6b7280', marginTop: 8 },

    homeButton: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: isDark ? '#374151' : '#fff', paddingVertical: 14, paddingHorizontal: 24,
        borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#4B5563' : '#e5e7eb',
        width: '100%', marginTop: 12,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2
    },
    homeButtonText: { fontSize: 16, fontWeight: '600', color: isDark ? '#F9FAFB' : '#374151' },
    summaryContainer: {
        marginBottom: 24,
        marginTop: 8,
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    summaryTitle: { fontSize: 15, fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827' },
    summaryMeta: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280' },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    summaryLabel: { fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280' },
    summaryValue: { fontSize: 13, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },
    summarySeparator: { height: 1, backgroundColor: isDark ? '#374151' : '#E5E7EB', marginVertical: 8 },
    totalLabel: { fontSize: 14, fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827' },
    totalValue: { fontSize: 18, fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827' },
    discountBadge: { backgroundColor: '#dcfce7', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginTop: 8 },
    discountText: { color: '#166534', fontWeight: '600', fontSize: 12 },
    summaryShipping: { marginTop: 8, fontSize: 12, color: '#6B7280' },

    pointsCard: { backgroundColor: isDark ? '#1F2937' : '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: isDark ? '#B45309' : '#F59E0B', marginBottom: 24, shadowColor: '#F59E0B', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    pointsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    pointsTitle: { fontWeight: '700', color: isDark ? '#D97706' : '#B45309', fontSize: 14 },
    pointsBalance: { fontSize: 13, color: isDark ? '#D1D5DB' : '#4B5563' },
    pointsConversionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F59E0B', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
    pointsConversionText: { fontSize: 10, color: '#fff', fontWeight: '600' },

    pointsInputRow: { flexDirection: 'row', gap: 12 },
    pointsInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#374151' : '#F9FAFB', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB', borderRadius: 12, paddingHorizontal: 12, height: 48 },
    pointsInput: { flex: 1, fontSize: 16, color: isDark ? '#F9FAFB' : '#111827', height: '100%' },
    applyPointsBtn: { backgroundColor: '#F59E0B', borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
    applyPointsText: { color: '#fff', fontWeight: '600', fontSize: 14 },

    splitCard: { backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: isDark ? '#374151' : '#e5e7eb', marginBottom: 16 },
    splitHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    splitTitle: { fontSize: 14, fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827' },
    splitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
    splitRowLabel: { flex: 1, color: isDark ? '#9CA3AF' : '#374151', fontSize: 13 },
    splitRowValue: { fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827', fontSize: 14 },
    splitHint: { marginTop: 12, fontSize: 11, color: '#6b7280' },

    providerContainer: { marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 16, marginTop: 8 },
    providerRow: { flexDirection: 'column', gap: 8 },
    providerOption: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#e5e7eb', borderRadius: 12, padding: 12, gap: 12, backgroundColor: isDark ? '#1F2937' : '#fff' },
    providerOptionActive: { borderColor: isDark ? '#F9FAFB' : '#111827', backgroundColor: isDark ? 'rgba(249, 250, 251, 0.1)' : 'rgba(17,24,39,0.05)' },
    providerName: { fontWeight: '600', color: isDark ? '#D1D5DB' : '#4b5563', fontSize: 14 },
    providerNameActive: { color: isDark ? '#F9FAFB' : '#111827' },
    providerCaption: { fontSize: 11, color: '#6b7280', marginTop: 4 },
    providerHelper: { marginTop: 8, fontSize: 11, color: '#6b7280' },

    errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fee2e2', borderRadius: 12, padding: 10, marginBottom: 16 },
    errorBannerText: { color: '#b91c1c', fontSize: 12, flex: 1 },

    cardVisualContainer: { alignItems: 'center', marginVertical: 24, shadowColor: '#4f46e5', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
    cardVisual: { height: 200, borderRadius: 20, padding: 24, flexDirection: 'column', justifyContent: 'space-between' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardBrand: { color: 'rgba(255,255,255,0.8)', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
    cardNumberVisual: { color: '#fff', fontSize: 24, fontWeight: '700', letterSpacing: 2, marginVertical: 20, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    cardLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600', marginBottom: 4 },
    cardValue: { color: '#fff', fontSize: 14, fontWeight: '600', textTransform: 'uppercase' },

    formContainer: { backgroundColor: isDark ? '#1F2937' : '#f9fafb', borderRadius: 20, padding: 20, marginBottom: 24 },
    inputGroup: { gap: 16 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#374151' : '#fff', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#e5e7eb', borderRadius: 12, height: 50, paddingHorizontal: 12 },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, fontSize: 16, color: isDark ? '#F9FAFB' : '#111827', height: '100%' },

    saveCardRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#6b7280', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    checkboxChecked: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
    saveCardText: { color: isDark ? '#D1D5DB' : '#4b5563', fontSize: 14, fontWeight: '500' },

    securityBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 40, gap: 8 },
    securityText: { color: '#059669', fontSize: 12, fontWeight: '500' },

    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: isDark ? '#111827' : '#fff', padding: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 20, borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#e5e7eb' },
    payButton: { height: 56, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
    payButtonDisabled: { opacity: 0.7 },
    payButtonGradient: { flex: 1, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
    payButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
