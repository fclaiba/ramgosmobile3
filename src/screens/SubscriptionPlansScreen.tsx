import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Platform, StatusBar, Linking, ActivityIndicator } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Crown, ShieldCheck, ArrowRight, Star, RefreshCw } from 'lucide-react-native';
import { useToast } from '../contexts/ToastContext';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    FadeInDown,
} from 'react-native-reanimated';
import { SUBSCRIPTION_PLANS } from '../config/subscriptionPlans';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
    initIapConnection,
    isIapSupported,
    requestSubscription,
    restorePurchases,
    finishPurchase,
    endIapConnection,
    type IapPurchaseResult,
} from '../services/iap/iapService';
import { glassShadow, Radius, colors } from '../theme/tokens';

const { width } = Dimensions.get('window');

export default function SubscriptionPlansScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { user, sessionToken } = useAuth();
    const { show } = useToast();
    const [busyTier, setBusyTier] = useState<null | 'pro' | 'business'>(null);
    const [restoring, setRestoring] = useState(false);

    // Subscription routing (per Sprint 4):
    //   - business → Stripe Subscriptions (B2B exempt from IAP).
    //   - pro (consumer)
    //       on iOS/Android with native IAP available → Apple IAP / Google Play Billing.
    //       on web/Expo Go                          → Stripe Checkout fallback.
    const createSubscriptionCheckoutAction = useAction(
        api.subscriptions.createSubscriptionCheckout
    );
    const validateAppleReceiptAction = useAction(
        api.iapActions.validateAppleReceipt
    );
    const validateGoogleReceiptAction = useAction(api.iapActions.validateGoogleReceipt);
    const plansData = useQuery(api.subscriptions.getPlans);

    useEffect(() => {
        if (isIapSupported()) {
            void initIapConnection();
        }
        return () => {
            void endIapConnection();
        };
    }, []);

    const validatePurchase = async (purchase: IapPurchaseResult) => {
        if (!user) throw new Error('Usuario no autenticado.');
        if (Platform.OS === 'ios') {
            return await validateAppleReceiptAction({
                receiptData: purchase.transactionReceipt,
                jwsRepresentation: purchase.jwsRepresentationIos,
                productId: purchase.sku,
                sessionToken, userId: user.id as any,
            });
        }
        if (Platform.OS === 'android') {
            return await validateGoogleReceiptAction({
                productId: purchase.sku,
                purchaseToken: purchase.purchaseToken ?? purchase.transactionId,
                sessionToken, userId: user.id as any,
            });
        }
        throw new Error('Plataforma no soportada para IAP.');
    };

    const handleSubscribe = async (tier: 'pro' | 'business') => {
        if (!user) {
            show('Inicia sesión para suscribirte', 'error');
            return;
        }
        setBusyTier(tier);
        try {
            // Consumer pro on mobile MUST go through IAP per store rules.
            const useNativeIap =
                tier === 'pro' &&
                (Platform.OS === 'ios' || Platform.OS === 'android') &&
                isIapSupported();

            if (useNativeIap) {
                show('Abriendo tienda...', 'info');
                const purchase = await requestSubscription('pro');
                show('Validando recibo...', 'info');
                const result = await validatePurchase(purchase);
                if ((result as any)?.success) {
                    await finishPurchase(purchase);
                    show('¡Suscripción activada!', 'success');
                } else {
                    show('No pudimos validar tu compra. Contactá soporte.', 'error');
                }
                return;
            }

            // Pro on web (or Expo Go fallback) → Stripe Checkout
            // OR Business tier → Stripe Subscriptions.
            if (tier === 'pro' && (Platform.OS === 'ios' || Platform.OS === 'android')) {
                show(
                    'IAP nativo no disponible (requiere development build). Abrimos Stripe.',
                    'info',
                );
            }
            const result = await createSubscriptionCheckoutAction({
                tier,
                sessionToken, userId: user.id as any,
            });
            const url = (result as any)?.url;
            if (url && typeof url === 'string') {
                await Linking.openURL(url);
                show('Te llevamos a Stripe para completar el pago.', 'success');
            } else {
                show('No se pudo iniciar el checkout. Intenta de nuevo.', 'error');
            }
        } catch (e: any) {
            show(e?.message || 'No se pudo iniciar la suscripción.', 'error');
        } finally {
            setBusyTier(null);
        }
    };

    const handleRestore = async () => {
        if (!user) {
            show('Inicia sesión para restaurar compras', 'error');
            return;
        }
        if (!isIapSupported()) {
            show('Restaurar solo está disponible en iOS / Android nativo.', 'info');
            return;
        }
        setRestoring(true);
        try {
            const purchases = await restorePurchases();
            if (purchases.length === 0) {
                show('No encontramos compras previas para restaurar.', 'info');
                return;
            }
            let restoredCount = 0;
            for (const p of purchases) {
                try {
                    const result = await validatePurchase(p);
                    if ((result as any)?.success) {
                        await finishPurchase(p);
                        restoredCount++;
                    }
                } catch (err) {
                    console.warn('[IAP restore] one item failed:', err);
                }
            }
            show(
                restoredCount > 0
                    ? `Restauramos ${restoredCount} suscripción(es).`
                    : 'No pudimos validar las compras encontradas.',
                restoredCount > 0 ? 'success' : 'error',
            );
        } catch (e: any) {
            show(e?.message || 'Error restaurando compras.', 'error');
        } finally {
            setRestoring(false);
        }
    };

    const AnimatedBtn = Animated.createAnimatedComponent(TouchableOpacity);

    const PlanCard = ({ title, price, features, tier, icon: Icon, color, gradient, recommended = false }: any) => {
        const scale = useSharedValue(1);

        const animatedStyle = useAnimatedStyle(() => ({
            transform: [{ scale: scale.value }],
        }));

        const onPressIn = () => {
            scale.value = withSpring(0.98);
        };

        const onPressOut = () => {
            scale.value = withSpring(1);
        };

        return (
            <Animated.View
                entering={Platform.OS === 'web' ? undefined : FadeInDown.delay(300).springify()}
                style={[
                    styles.cardContainer,
                    {
                        shadowColor: color,
                        shadowOpacity: isDark ? 0.3 : 0.15,
                    }
                ]}
            >
                {recommended && (
                    <View style={[styles.recommendedBadge, { backgroundColor: color }]}>
                        <Text style={styles.recommendedText}>MÁS POPULAR</Text>
                    </View>
                )}

                <View style={[
                    styles.card,
                    {
                        backgroundColor: colors(isDark).glass,
                        borderColor: recommended ? color : (isDark ? '#374151' : '#E5E7EB'),
                        borderWidth: recommended ? 2 : 1
                    }
                ]}>
                    {/* Header Gradient */}
                    <LinearGradient
                        colors={gradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.cardHeader}
                    >
                        <View style={styles.iconContainer}>
                            <Icon color="#FFFFFF" size={32} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitle}>{title}</Text>
                            <Text style={styles.cardSubtitle}>
                                {tier === 'business' ? 'Para comercios y marcas' : 'Para usuarios exigentes'}
                            </Text>
                        </View>
                        {tier === user?.subscriptionTier && (
                            <View style={styles.currentBadge}>
                                <Text style={styles.currentBadgeText}>ACTUAL</Text>
                            </View>
                        )}
                    </LinearGradient>

                    {/* Content */}
                    <View style={styles.cardContent}>
                        <View style={styles.priceContainer}>
                            <Text style={[styles.currency, { color: colors(isDark).textMuted }]}>$</Text>
                            <Text style={[styles.price, { color: colors(isDark).text }]}>{price}</Text>
                            <Text style={[styles.period, { color: colors(isDark).textMuted }]}>/mes</Text>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.featuresList}>
                            {features.map((feature: string, index: number) => (
                                <Animated.View
                                    key={index}
                                    entering={Platform.OS === 'web' ? undefined : FadeInDown.delay(400 + (index * 100)).duration(400)}
                                    style={styles.featureItem}
                                >
                                    <View style={[styles.checkCircle, { backgroundColor: color + '15' }]}>
                                        <Check size={14} color={color} strokeWidth={3} />
                                    </View>
                                    <Text style={[styles.featureText, { color: colors(isDark).textMuted }]}>
                                        {feature}
                                    </Text>
                                </Animated.View>
                            ))}
                        </View>

                        <AnimatedBtn
                            style={[
                                styles.subscribeButton,
                                { backgroundColor: color },
                                animatedStyle
                            ]}
                            onPress={() => handleSubscribe(tier)}
                            onPressIn={onPressIn}
                            onPressOut={onPressOut}
                            disabled={tier === user?.subscriptionTier || busyTier === tier}
                        >
                            <Text style={styles.subscribeButtonText}>
                                {tier === user?.subscriptionTier
                                    ? 'Tu Plan Actual'
                                    : busyTier === tier
                                        ? 'Procesando...'
                                        : 'Obtener Ahora'}
                            </Text>
                            {tier !== user?.subscriptionTier && busyTier !== tier && <ArrowRight color="white" size={20} />}
                        </AnimatedBtn>

                        <Text style={styles.cancelText}>Cancela cuando quieras.</Text>
                    </View>
                </View>
            </Animated.View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#F3F4F6' }]}>
            <StatusBar barStyle="light-content" />

            {/* Background Atmosphere */}
            <View style={StyleSheet.absoluteFill}>
                <LinearGradient
                    colors={isDark ? ['#111827', '#000'] : ['#E0E7FF', '#F3F4F6']}
                    style={{ flex: 1 }}
                />
                {/* Decorative circles */}
                <View style={[styles.circle, { top: -100, right: -100, backgroundColor: '#2196F3', opacity: 0.1 }]} />
                <View style={[styles.circle, { bottom: -100, left: -50, backgroundColor: '#EC4899', opacity: 0.1 }]} />
            </View>

            <SafeAreaView style={{ flex: 1 }}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <Animated.View
                        entering={Platform.OS === 'web' ? undefined : FadeInDown.duration(600).springify()}
                        style={styles.header}
                    >
                        <View style={styles.headerTag}>
                            <Star size={12} color="#F59E0B" fill="#F59E0B" />
                            <Text style={styles.headerTagText}>NIVEL SUPERIOR</Text>
                        </View>
                        <Text style={[styles.headerTitle, { color: colors(isDark).text }]}>
                            Elige tu Potencial
                        </Text>
                        <Text style={[styles.headerSubtitle, { color: colors(isDark).textMuted }]}>
                            Desbloquea beneficios exclusivos y lleva tu experiencia Ramgos al siguiente nivel.
                        </Text>
                    </Animated.View>

                    <View style={styles.plansContainer}>
                        {user?.role !== 'business' && (
                            <PlanCard
                                title="Usuario PRO"
                                price={plansData?.pro?.priceMonthlyUsd || 2.99.toFixed(2)}
                                tier="pro"
                                icon={Crown}
                                color="#F59E0B"
                                gradient={['#F59E0B', '#D97706']}
                                recommended={true}
                                features={plansData?.pro?.perks || []}
                            />
                        )}

                        {user?.role === 'business' && (
                            <PlanCard
                                title="Negocio Verificado"
                                price={plansData?.business?.priceMonthlyUsd || 5.99.toFixed(2)}
                                tier="business"
                                icon={ShieldCheck}
                                color="#3B82F6"
                                gradient={['#3B82F6', '#2563EB']}
                                recommended={true}
                                features={plansData?.business?.perks || []}
                            />
                        )}
                    </View>

                    {/* Restore button — required by App Store guidelines. */}
                    {(Platform.OS === 'ios' || Platform.OS === 'android') && (
                        <TouchableOpacity
                            onPress={handleRestore}
                            disabled={restoring}
                            style={styles.restoreButton}
                            accessibilityRole="button"
                            accessibilityLabel="Restaurar compras anteriores"
                        >
                            {restoring ? (
                                <ActivityIndicator color={isDark ? '#D1D5DB' : '#4B5563'} />
                            ) : (
                                <RefreshCw size={16} color={isDark ? '#D1D5DB' : '#4B5563'} />
                            )}
                            <Text style={[styles.restoreText, { color: colors(isDark).textMuted }]}>
                                {restoring ? 'Restaurando...' : 'Restaurar compras'}
                            </Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity onPress={() => navigation.goBack()} style={{ alignSelf: 'center', marginTop: 20, padding: 10 }}>
                        <Text style={{ color: '#9CA3AF', fontSize: 14 }}>No, gracias. Volver al inicio.</Text>
                    </TouchableOpacity>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const getStyles = (isDark: any) => StyleSheet.create({
    container: {
        flex: 1,
    },
    circle: {
        position: 'absolute',
        width: '100%', maxWidth: 400,
        height: 400,
        borderRadius: Radius.full,
    },
    scrollContent: {
        padding: 24,
    },
    header: {
        marginBottom: 40,
        alignItems: 'center',
    },
    headerTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: Radius.xl,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)'
    },
    headerTagText: {
        color: '#F59E0B',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '800',
        marginBottom: 12,
        textAlign: 'center',
        letterSpacing: -0.5
    },
    headerSubtitle: {
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: '85%'
    },
    plansContainer: {
        gap: 24,
    },
    cardContainer: {
        borderRadius: Radius.xl,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 20,
        elevation: 8,
    },
    card: {
        borderRadius: Radius.xl,
        overflow: 'hidden',
    },
    recommendedBadge: {
        position: 'absolute',
        top: -12,
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingVertical: 4,
        borderRadius: Radius.md,
        zIndex: 10,
        ...glassShadow(isDark),},
    recommendedText: {
        color: isDark ? '#1F2937' : 'white',
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1
    },
    cardHeader: {
        padding: 24,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: Radius['2xl'],
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)'
    },
    cardTitle: {
        color: isDark ? '#1F2937' : 'white',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    cardSubtitle: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 13,
    },
    currentBadge: {
        backgroundColor: isDark ? '#1F2937' : 'white',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: Radius.md,
    },
    currentBadgeText: {
        color: isDark ? '#F9FAFB' : '#000',
        fontSize: 10,
        fontWeight: '800',
    },
    cardContent: {
        padding: 24,
    },
    priceContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'center',
        marginBottom: 24,
    },
    currency: {
        fontSize: 24,
        fontWeight: '600',
        marginTop: 8,
        marginRight: 4
    },
    price: {
        fontSize: 48,
        fontWeight: '800',
        letterSpacing: -1
    },
    period: {
        fontSize: 16,
        fontWeight: '500',
        marginTop: 28,
        marginLeft: 4
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.05)',
        marginBottom: 24,
        width: '100%'
    },
    featuresList: {
        marginBottom: 32,
        gap: 16,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    checkCircle: {
        width: 24,
        height: 24,
        borderRadius: Radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    featureText: {
        fontSize: 15,
        fontWeight: '500',
        flex: 1,
        lineHeight: 20
    },
    subscribeButton: {
        paddingVertical: 18,
        borderRadius: Radius.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        ...glassShadow(isDark),},
    subscribeButtonText: {
        color: isDark ? '#1F2937' : 'white',
        fontSize: 18,
        fontWeight: 'bold',
        letterSpacing: 0.5
    },
    cancelText: {
        textAlign: 'center',
        color: isDark ? '#6B7280' : '#9CA3AF',
        fontSize: 12,
        marginTop: 16
    },
    restoreButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 24,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: Radius.md,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignSelf: 'center',
    },
    restoreText: {
        fontSize: 14,
        fontWeight: '600',
    },
});
