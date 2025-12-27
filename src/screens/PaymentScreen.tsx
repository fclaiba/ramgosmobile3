import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, useWindowDimensions, Pressable } from 'react-native';
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

export default function PaymentScreen({ route, navigation }: any) {
    const { width } = useWindowDimensions();
    const params = route.params || {};
    const amount: number = params.amount ?? 0;
    const discountUsedPoints: number = params.discountUsedPoints ?? 0;
    const discountAmount: number = params.discountAmount ?? 0;
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
    const { redeemPoints, trackPurchase, points } = usePoints();
    const { placeOrder } = useMarketplace();
    const { processPayment, previewSplit, providers } = useFintech();

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
    const finalAmount = Math.max(0, amount - localDiscountAmount);

    useEffect(() => {
        setLocalAppliedPoints(discountUsedPoints);
        setLocalDiscountAmount(discountAmount);
    }, [discountUsedPoints, discountAmount]);

    const handleApplyPoints = () => {
        const pointsToUse = parseInt(pointsInput.replace(/\D/g, ''), 10);

        if (isNaN(pointsToUse) || pointsToUse <= 0) {
            Alert.alert('Error', 'Ingresa una cantidad válida de puntos (mínimo 1).');
            return;
        }

        if (pointsToUse > points) {
            Alert.alert('Saldo insuficiente', `Solo tienes ${points} puntos disponibles.`);
            return;
        }

        // Conversion: 100 points = $1.00 => 1 point = $0.01
        const discountValue = pointsToUse * 0.01;

        if (discountValue > amount) {
            // Cap it to the amount if they try to overpay
            // Actually, usually we alert, or auto-cap?
            // User said "totality", so maybe auto-cap.
            // But let's alert to be safe, or just cap it? Use cap for better UX.
            const maxPoints = Math.floor(amount * 100);
            if (pointsToUse > maxPoints) {
                Alert.alert('Aviso', `El descuento máximo posible es de $${amount.toFixed(2)} (${maxPoints} pts). Se ajustará a este valor.`);
                setLocalAppliedPoints(maxPoints);
                setLocalDiscountAmount(maxPoints * 0.01);
                setPointsInput(maxPoints.toString());
                return;
            }
        }

        setLocalAppliedPoints(pointsToUse);
        setLocalDiscountAmount(discountValue);
        setPointsInput('');
        Alert.alert('Puntos aplicados', `Se descontaron $${discountValue.toFixed(2)} del total.`);
    };

    const handleUseMaxPoints = () => {
        if (points <= 0) {
            Alert.alert('Sin puntos', 'No tienes puntos para canjear.');
            return;
        }
        // Calculate max usable points (limited by total amount or total balance)
        const maxPointsForAmount = Math.floor(amount * 100);
        const pointsToUse = Math.min(points, maxPointsForAmount);

        const discountValue = pointsToUse * 0.01;

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
        if (!amount || amount <= 0) {
            return null;
        }
        try {
            return previewSplit({
                total: finalAmount, // Use final amount for split calculation? Or original? Usually split is on what is moved. 
                // Important: If points cover everything, moved money is 0. 
                // But commission is usually on the *Transaction*. 
                // Let's assume split is based on the actual money moved (finalAmount).
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
        if (!cardNumber || !expiry || !cvc || !name) {
            Alert.alert('Campos incompletos', 'Por favor completa todos los detalles de la tarjeta.');
            return;
        }

        if (finalAmount < 0) {
            Alert.alert('Error', 'El monto a pagar no puede ser negativo.');
            return;
        }

        const cleanedCardNumber = cardNumber.replace(/\D/g, '');
        if (cleanedCardNumber.length < 12) {
            Alert.alert('Número de tarjeta inválido', 'Revisa que el número de tarjeta sea correcto.');
            return;
        }

        const [expMonthRaw, expYearRaw] = expiry.split('/');
        if (!expMonthRaw || !expYearRaw) {
            Alert.alert('Fecha inválida', 'Ingresa una fecha de expiración en formato MM/YY.');
            return;
        }

        setLoading(true);
        setProcessingError(null);

        try {
            const paymentMethod = {
                brand: cardBrand,
                last4: cleanedCardNumber.slice(-4).padStart(4, '•'),
                expMonth: expMonthRaw,
                expYear: expYearRaw,
                ownerName: name.trim(),
            };

            const receipt = await processPayment({
                amount: finalAmount,
                currency,
                providerKey: selectedProvider,
                sellerId,
                sellerName,
                influencerId,
                influencerName,
                commissionRate,
                influencerRate,
                paymentMethod,
                metadata: {
                    discountUsedPoints: localAppliedPoints,
                    discountAmount: localDiscountAmount,
                    cartItems: cartSnapshot,
                    shippingMethod,
                    shippingCost,
                    saveCard,
                },
                description: params.description ?? `Compra en ${sellerName}`,
            });

            if (receipt.status !== 'succeeded') {
                throw new Error('La pasarela requiere una acción adicional para completar el pago.');
            }

            setProcessingError(null);
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

                const orderResult = placeOrder({
                    cartItems: cartSnapshot,
                    shippingMethod: safeShippingMethod,
                    shippingDestination: fallbackDestination,
                    appliedDiscount: localDiscountAmount,
                    discountAmount: localDiscountAmount,
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
            clearCart();

            // Removed auto-navigation to let user see the success screen
            // setTimeout(() => {
            //     navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            //     navigation.navigate('History');
            // }, 2500);
        } catch (error: any) {
            console.error('Payment error', error);
            const message = typeof error?.message === 'string' ? error.message : 'No pudimos procesar tu pago. Intenta nuevamente.';
            setProcessingError(message);
            Alert.alert('Error al procesar el pago', message);
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
        return providerMatch?.displayName ?? paymentReceipt.provider.toUpperCase();
    }, [paymentReceipt, providers]);

    if (success && paymentReceipt) {
        return (
            <View style={styles.successContainer}>
                <LinearGradient colors={['#fff', '#f0fdf4']} style={StyleSheet.absoluteFill} />
                <ScrollView contentContainerStyle={styles.successScroll}>
                    <Animated.View
                        entering={ZoomIn.springify().damping(12)}
                        style={styles.successHeader}
                    >
                        <View style={styles.successCircle}>
                            <CheckCircle size={64} color="#fff" />
                        </View>
                        <Text style={styles.successTitle}>¡Pago Exitoso!</Text>
                        <Text style={styles.successSubtitle}>
                            Tu compra fue confirmada vía {receiptProviderName}.
                        </Text>
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(200).springify()}>
                        <Text style={styles.successAmount}>${paymentReceipt.amount.toFixed(2)}</Text>

                        <View style={styles.breakdownCard}>
                            <View style={styles.breakdownRow}>
                                <Building size={16} color="#111827" />
                                <Text style={styles.breakdownLabel}>Negocio (pendiente)</Text>
                                <Text style={styles.breakdownValue}>${paymentReceipt.split.sellerNet.toFixed(2)}</Text>
                            </View>
                            <View style={styles.breakdownRow}>
                                <ShieldCheck size={16} color="#2563EB" />
                                <Text style={styles.breakdownLabel}>
                                    Ramgos {Math.round(paymentReceipt.split.commissionRate * 100)}%
                                </Text>
                                <Text style={styles.breakdownValue}>${paymentReceipt.split.ramgosCommission.toFixed(2)}</Text>
                            </View>
                            <View style={styles.breakdownRow}>
                                <CreditCard size={16} color="#6b7280" />
                                <Text style={styles.breakdownLabel}>Fee pasarela</Text>
                                <Text style={styles.breakdownValue}>${paymentReceipt.providerFee.toFixed(2)}</Text>
                            </View>
                            {paymentReceipt.split.influencerAmount > 0 && paymentReceipt.split.influencerId && (
                                <View style={styles.breakdownRow}>
                                    <Wallet size={16} color="#047857" />
                                    <Text style={styles.breakdownLabel}>Influencer</Text>
                                    <Text style={styles.breakdownValue}>${paymentReceipt.split.influencerAmount.toFixed(2)}</Text>
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

                        <TouchableOpacity
                            style={styles.homeButton}
                            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
                        >
                            <Home size={20} color="#374151" style={{ marginRight: 8 }} />
                            <Text style={styles.homeButtonText}>Volver al Inicio</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </ScrollView>
            </View>
        );
    }

    if (success) {
        return (
            <View style={styles.successContainer}>
                <LinearGradient colors={['#fff', '#f0fdf4']} style={StyleSheet.absoluteFill} />
                <ScrollView contentContainerStyle={styles.successScroll}>
                    <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.successHeader}>
                        <View style={styles.successCircle}>
                            <CheckCircle size={64} color="#fff" />
                        </View>
                        <Text style={styles.successTitle}>¡Pago Exitoso!</Text>
                        <Text style={styles.successSubtitle}>Tu compra ha sido procesada.</Text>
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(200).springify()}>
                        <Text style={styles.successAmount}>${amount.toFixed(2)}</Text>
                        {createdOrders.length > 0 && (
                            <View style={styles.orderSummary}>
                                <Text style={styles.orderSummaryTitle}>Órdenes generadas</Text>
                                {createdOrders.map((id) => (
                                    <Text key={id} style={styles.orderSummaryItem}>#{id}</Text>
                                ))}
                                <Text style={styles.orderSummaryHint}>Los pagos permanecerán en escrow por 15 días.</Text>
                            </View>
                        )}
                        <TouchableOpacity
                            style={styles.homeButton}
                            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
                        >
                            <Home size={20} color="#374151" style={{ marginRight: 8 }} />
                            <Text style={styles.homeButtonText}>Volver al Inicio</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </ScrollView>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#F3F4F6', '#E5E7EB']} style={StyleSheet.absoluteFill} />
            <MobileHeader title="Pago Seguro" backButton={true} onBack={() => navigation.goBack()} />

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    {/* Amount Summary */}
                    <View style={styles.summaryContainer}>
                        <Text style={styles.summaryLabel}>Total a Pagar</Text>
                        <Text style={styles.summaryAmount}>${finalAmount.toFixed(2)}</Text>
                        {localDiscountAmount > 0 && (
                            <View style={styles.discountBadge}>
                                <Text style={styles.discountText}>Ahorraste ${localDiscountAmount.toFixed(2)} ({localAppliedPoints} pts)</Text>
                            </View>
                        )}
                        {/* Original Amount Strikethrough if discounted */}
                        {localDiscountAmount > 0 && (
                            <Text style={{ textDecorationLine: 'line-through', color: '#9CA3AF', marginTop: 4 }}>
                                Total: ${amount.toFixed(2)}
                            </Text>
                        )}

                        <Text style={styles.summaryShipping}>
                            {shippingMethod === 'pickup'
                                ? 'Retiro sin costo en punto acordado.'
                                : `Incluye envío ${shippingLabel} ($${shippingCost.toFixed(2)})`}
                        </Text>
                    </View>

                    {/* Points Redemption Section */}
                    <View style={styles.pointsCard}>
                        <View style={styles.pointsHeader}>
                            <Trophy size={18} color="#F59E0B" />
                            <Text style={styles.pointsTitle}>Canjear Puntos Ramgos</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <Text style={styles.pointsBalance}>Disponible: <Text style={{ fontWeight: '700' }}>{points}</Text></Text>
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
                                <ArrowRightLeft size={16} color="#111827" />
                                <Text style={styles.splitTitle}>Split de pagos Ramgos</Text>
                            </View>
                            <View style={styles.splitRow}>
                                <Building size={16} color="#111827" style={{ marginRight: 8 }} />
                                <Text style={styles.splitRowLabel}>Negocio</Text>
                                <Text style={styles.splitRowValue}>${splitPreview.sellerGross.toFixed(2)}</Text>
                            </View>
                            <View style={styles.splitRow}>
                                <ShieldCheck size={16} color="#2563EB" style={{ marginRight: 8 }} />
                                <Text style={styles.splitRowLabel}>Ramgos</Text>
                                <Text style={styles.splitRowValue}>${splitPreview.ramgosCommission.toFixed(2)}</Text>
                            </View>
                            {splitPreview.influencerAmount > 0 && splitPreview.influencerId && (
                                <View style={styles.splitRow}>
                                    <Wallet size={16} color="#047857" style={{ marginRight: 8 }} />
                                    <Text style={styles.splitRowLabel}>Influencer</Text>
                                    <Text style={styles.splitRowValue}>${splitPreview.influencerAmount.toFixed(2)}</Text>
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
                                            {isSelected && <CheckCircle size={16} color="#111827" />}
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
                                <Text style={styles.payButtonText}>Pagar ${amount.toFixed(2)}</Text>
                                <ChevronRight size={20} color="#fff" />
                            </>
                        )}
                    </LinearGradient>
                </TouchableOpacity>
            </View>
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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    scrollContent: { padding: 20, paddingBottom: 100 },

    // Success View Styles
    successContainer: { flex: 1, backgroundColor: '#fff' },
    successScroll: { flexGrow: 1, padding: 24, paddingBottom: 60, alignItems: 'center', justifyContent: 'center' },
    successHeader: { alignItems: 'center', marginBottom: 24 },
    successCircle: {
        width: 100, height: 100, borderRadius: 50, backgroundColor: '#22c55e',
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
        shadowColor: '#22c55e', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10
    },
    successTitle: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 8 },
    successSubtitle: { fontSize: 16, color: '#6b7280', textAlign: 'center', paddingHorizontal: 20 },
    successAmount: { fontSize: 40, fontWeight: '800', color: '#111827', marginVertical: 24, textAlign: 'center' },

    breakdownCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#e5e7eb', width: '100%', marginBottom: 16 },
    breakdownRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    breakdownLabel: { flex: 1, marginLeft: 8, fontSize: 13, color: '#374151' },
    breakdownValue: { fontWeight: '600', color: '#111827' },
    breakdownNote: { fontSize: 12, color: '#9ca3af', textAlign: 'center', fontStyle: 'italic', marginBottom: 24 },

    orderSummary: { backgroundColor: '#f9fafb', padding: 16, borderRadius: 12, width: '100%', marginBottom: 24 },
    orderSummaryTitle: { fontSize: 13, fontWeight: 'bold', color: '#374151', marginBottom: 8, textTransform: 'uppercase' },
    orderSummaryItem: { fontSize: 15, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: '#111827', marginBottom: 4 },
    orderSummaryHint: { fontSize: 11, color: '#6b7280', marginTop: 8 },

    homeButton: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#fff', paddingVertical: 14, paddingHorizontal: 24,
        borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
        width: '100%', marginTop: 12,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2
    },
    homeButtonText: { fontSize: 16, fontWeight: '600', color: '#374151' },
    summaryContainer: { alignItems: 'center', marginBottom: 24, marginTop: 8 },
    summaryLabel: { fontSize: 14, color: '#6b7280', marginBottom: 4, fontWeight: '500' },
    summaryAmount: { fontSize: 36, fontWeight: 'bold', color: '#111827' },
    discountBadge: { backgroundColor: '#dcfce7', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginTop: 8 },
    discountText: { color: '#166534', fontWeight: '600', fontSize: 12 },
    summaryShipping: { marginTop: 8, fontSize: 13, color: '#4B5563', textAlign: 'center' },

    pointsCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F59E0B', marginBottom: 24, shadowColor: '#F59E0B', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    pointsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    pointsTitle: { fontWeight: '700', color: '#B45309', fontSize: 14 },
    pointsBalance: { fontSize: 13, color: '#4B5563' },
    pointsConversionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F59E0B', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
    pointsConversionText: { fontSize: 10, color: '#fff', fontWeight: '600' },

    pointsInputRow: { flexDirection: 'row', gap: 12 },
    pointsInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 12, height: 48 },
    pointsInput: { flex: 1, fontSize: 16, color: '#111827', height: '100%' },
    applyPointsBtn: { backgroundColor: '#F59E0B', borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
    applyPointsText: { color: '#fff', fontWeight: '600', fontSize: 14 },

    splitCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16 },
    splitHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    splitTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
    splitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
    splitRowLabel: { flex: 1, color: '#374151', fontSize: 13 },
    splitRowValue: { fontWeight: '600', color: '#111827', fontSize: 14 },
    splitHint: { marginTop: 12, fontSize: 11, color: '#6b7280' },

    providerContainer: { marginBottom: 16 },
    providerRow: { flexDirection: 'column', gap: 8 },
    providerOption: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 12, backgroundColor: '#fff' },
    providerOptionActive: { borderColor: '#111827', backgroundColor: 'rgba(17,24,39,0.05)' },
    providerName: { fontWeight: '600', color: '#4b5563', fontSize: 14 },
    providerNameActive: { color: '#111827' },
    providerCaption: { fontSize: 11, color: '#6b7280', marginTop: 4 },
    providerHelper: { marginTop: 8, fontSize: 11, color: '#6b7280' },

    errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fee2e2', borderRadius: 12, padding: 10, marginBottom: 16 },
    errorBannerText: { color: '#b91c1c', fontSize: 12, flex: 1 },

    // Card Visual
    cardVisualContainer: {
        alignItems: 'center',
        marginBottom: 32,
        shadowColor: "#4f46e5",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 10,
    },
    cardVisual: {
        height: 200,
        borderRadius: 20,
        padding: 24,
        justifyContent: 'space-between',
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardBrand: { color: '#fff', fontSize: 18, fontWeight: 'bold', fontStyle: 'italic' },
    cardNumberVisual: {
        color: '#fff',
        fontSize: 22,
        letterSpacing: 2,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        ...Platform.select({
            web: { textShadow: '0px 0px 2px rgba(0,0,0,0.3)' } as any,
            default: { textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 2 }
        })
    },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
    cardLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginBottom: 4, fontWeight: '600' },
    cardValue: { color: '#fff', fontSize: 14, fontWeight: '600', minWidth: 60 },

    // Form
    formContainer: { backgroundColor: '#fff', borderRadius: 24, padding: 4, gap: 16 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#374151', marginBottom: 8, marginLeft: 4 },
    inputGroup: { gap: 12 },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56
    },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, fontSize: 16, color: '#111827', height: '100%' },

    saveCardRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingLeft: 4 },
    checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', marginRight: 10, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
    saveCardText: { color: '#4b5563', fontSize: 14 },

    securityBadge: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 32, opacity: 0.8 },
    securityText: { fontSize: 12, color: '#059669', fontWeight: '500' },

    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'transparent' }, // Transparent to let linear gradient bg show through if needed, but safe area?
    // Actually putting a white fade or just button is cleaner. 
    // Let's make it sit on top with no background for clean look, button has shadow.
    // Payment Button
    payButton: {
        borderRadius: 16, overflow: 'hidden',
        shadowColor: '#4338ca', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5
    },
    payButtonDisabled: { opacity: 0.7 },
    payButtonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 10 },
    payButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },


});
