import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Platform, StatusBar } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Crown, ShieldCheck, ArrowRight, Star, Award, Zap } from 'lucide-react-native';
import { useToast } from '../contexts/ToastContext';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withDelay,
    FadeInDown,
    withRepeat,
    withSequence,
    withTiming
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { SUBSCRIPTION_PLANS } from '../config/subscriptionPlans';

const { width } = Dimensions.get('window');

export default function SubscriptionPlansScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { user } = useAuth();
    const { show } = useToast();
    const { addItem, openCart } = useCart();

    const handleSubscribe = async (tier: 'pro' | 'business') => {
        const plan = SUBSCRIPTION_PLANS[tier];
        addItem({
            id: `sub-${tier}-${Date.now()}`,
            name: plan.displayName,
            price: plan.priceMonthlyUsd,
            image: tier === 'business'
                ? 'https://cdn-icons-png.flaticon.com/512/2921/2921222.png'
                : 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
            type: 'subscription',
            subscriptionTier: tier,
            quantity: 1
        });

        show('¡Excelente elección! Membresía agregada al carrito', 'success');
        openCart();
        navigation.navigate('Cart');
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
                entering={FadeInDown.delay(300).springify()}
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
                        backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
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
                            <Text style={[styles.currency, { color: isDark ? '#D1D5DB' : '#4B5563' }]}>$</Text>
                            <Text style={[styles.price, { color: isDark ? '#F9FAFB' : '#111827' }]}>{price}</Text>
                            <Text style={[styles.period, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>/mes</Text>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.featuresList}>
                            {features.map((feature: string, index: number) => (
                                <Animated.View
                                    key={index}
                                    entering={FadeInDown.delay(400 + (index * 100)).duration(400)}
                                    style={styles.featureItem}
                                >
                                    <View style={[styles.checkCircle, { backgroundColor: color + '15' }]}>
                                        <Check size={14} color={color} strokeWidth={3} />
                                    </View>
                                    <Text style={[styles.featureText, { color: isDark ? '#D1D5DB' : '#4B5563' }]}>
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
                            disabled={tier === user?.subscriptionTier}
                        >
                            <Text style={styles.subscribeButtonText}>
                                {tier === user?.subscriptionTier ? 'Tu Plan Actual' : 'Obtener Ahora'}
                            </Text>
                            {tier !== user?.subscriptionTier && <ArrowRight color="white" size={20} />}
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
                <View style={[styles.circle, { top: -100, right: -100, backgroundColor: '#7C3AED', opacity: 0.1 }]} />
                <View style={[styles.circle, { bottom: -100, left: -50, backgroundColor: '#EC4899', opacity: 0.1 }]} />
            </View>

            <SafeAreaView style={{ flex: 1 }}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <Animated.View
                        entering={FadeInDown.duration(600).springify()}
                        style={styles.header}
                    >
                        <View style={styles.headerTag}>
                            <Star size={12} color="#F59E0B" fill="#F59E0B" />
                            <Text style={styles.headerTagText}>NIVEL SUPERIOR</Text>
                        </View>
                        <Text style={[styles.headerTitle, { color: isDark ? '#F9FAFB' : '#111827' }]}>
                            Elige tu Potencial
                        </Text>
                        <Text style={[styles.headerSubtitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                            Desbloquea beneficios exclusivos y lleva tu experiencia Ramgos al siguiente nivel.
                        </Text>
                    </Animated.View>

                    <View style={styles.plansContainer}>
                        {user?.role !== 'business' && (
                            <PlanCard
                                title="Usuario PRO"
                                price={SUBSCRIPTION_PLANS.pro.priceMonthlyUsd.toFixed(2)}
                                tier="pro"
                                icon={Crown}
                                color="#F59E0B"
                                gradient={['#F59E0B', '#D97706']}
                                recommended={true}
                                features={SUBSCRIPTION_PLANS.pro.perks}
                            />
                        )}

                        {user?.role === 'business' && (
                            <PlanCard
                                title="Negocio Verificado"
                                price={SUBSCRIPTION_PLANS.business.priceMonthlyUsd.toFixed(2)}
                                tier="business"
                                icon={ShieldCheck}
                                color="#3B82F6"
                                gradient={['#3B82F6', '#2563EB']}
                                recommended={true}
                                features={SUBSCRIPTION_PLANS.business.perks}
                            />
                        )}
                    </View>

                    <TouchableOpacity onPress={() => navigation.goBack()} style={{ alignSelf: 'center', marginTop: 20, padding: 10 }}>
                        <Text style={{ color: '#9CA3AF', fontSize: 14 }}>No, gracias. Volver al inicio.</Text>
                    </TouchableOpacity>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    circle: {
        position: 'absolute',
        width: 400,
        height: 400,
        borderRadius: 200,
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
        borderRadius: 20,
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
        borderRadius: 24,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 20,
        elevation: 8,
    },
    card: {
        borderRadius: 24,
        overflow: 'hidden',
    },
    recommendedBadge: {
        position: 'absolute',
        top: -12,
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingVertical: 4,
        borderRadius: 12,
        zIndex: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    recommendedText: {
        color: 'white',
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
        borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)'
    },
    cardTitle: {
        color: 'white',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    cardSubtitle: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 13,
    },
    currentBadge: {
        backgroundColor: 'white',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
    },
    currentBadgeText: {
        color: '#000',
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
        borderRadius: 12,
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
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4
    },
    subscribeButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        letterSpacing: 0.5
    },
    cancelText: {
        textAlign: 'center',
        color: '#9CA3AF',
        fontSize: 12,
        marginTop: 16
    }
});
