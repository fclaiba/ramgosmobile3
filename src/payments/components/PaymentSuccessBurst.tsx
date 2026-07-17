import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Sparkles, ShieldCheck } from 'lucide-react-native';
import Animated, {
    Easing,
    FadeIn,
    FadeInDown,
    FadeInUp,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { glassTokens } from '../../utils/glass';

const { width: W, height: H } = Dimensions.get('window');
const PARTICLE_COUNT = 28;

type Props = {
    amount: number;
    dark?: boolean;
    onDone: () => void;
};

function Particle({ index, dark }: { index: number; dark: boolean }) {
    const progress = useSharedValue(0);
    const angle = (index / PARTICLE_COUNT) * Math.PI * 2 + (index % 3) * 0.2;
    const dist = 90 + (index % 5) * 28;
    const size = 5 + (index % 4) * 3;
    const colors = ['#34D399', '#FBBF24', '#F472B6', '#38BDF8', '#A3E635', '#FB7185'];
    const color = colors[index % colors.length];

    useEffect(() => {
        progress.value = withDelay(
            80 + index * 18,
            withTiming(1, { duration: 1100 + (index % 4) * 200, easing: Easing.out(Easing.cubic) }),
        );
    }, [index, progress]);

    const style = useAnimatedStyle(() => {
        const t = progress.value;
        return {
            opacity: interpolate(t, [0, 0.15, 0.75, 1], [0, 1, 0.85, 0]),
            transform: [
                { translateX: Math.cos(angle) * dist * t },
                { translateY: Math.sin(angle) * dist * t - 40 * t },
                { scale: interpolate(t, [0, 0.3, 1], [0.2, 1.2, 0.4]) },
                { rotate: `${t * 360}deg` },
            ],
        };
    });

    return (
        <Animated.View
            style={[
                styles.particle,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: color,
                    shadowColor: color,
                },
                style,
            ]}
        />
    );
}

function PulseRing({ delay, color }: { delay: number; color: string }) {
    const t = useSharedValue(0);
    useEffect(() => {
        t.value = withDelay(
            delay,
            withRepeat(
                withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }),
                -1,
                false,
            ),
        );
    }, [delay, t]);

    const style = useAnimatedStyle(() => ({
        opacity: interpolate(t.value, [0, 1], [0.55, 0]),
        transform: [{ scale: interpolate(t.value, [0, 1], [0.7, 1.85]) }],
        borderColor: color,
    }));

    return <Animated.View style={[styles.ring, style]} />;
}

export function PaymentSuccessBurst({ amount, dark = true, onDone }: Props) {
    const glass = glassTokens(dark);
    const orb = useSharedValue(0);
    const check = useSharedValue(0);
    const glow = useSharedValue(0);
    const shimmer = useSharedValue(0);
    const floatY = useSharedValue(0);

    useEffect(() => {
        if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setTimeout(() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
            }, 220);
        }

        orb.value = withSpring(1, { damping: 10, stiffness: 120 });
        check.value = withDelay(180, withSpring(1, { damping: 8, stiffness: 160 }));
        glow.value = withDelay(
            100,
            withRepeat(
                withSequence(
                    withTiming(1, { duration: 900 }),
                    withTiming(0.35, { duration: 900 }),
                ),
                -1,
                true,
            ),
        );
        shimmer.value = withDelay(
            400,
            withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }), -1, false),
        );
        floatY.value = withRepeat(
            withSequence(
                withTiming(-8, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
                withTiming(8, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
            ),
            -1,
            true,
        );
    }, [check, floatY, glow, orb, shimmer]);

    const orbStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: interpolate(orb.value, [0, 1], [0.2, 1]) },
            { translateY: floatY.value },
        ],
        opacity: orb.value,
    }));

    const checkStyle = useAnimatedStyle(() => ({
        transform: [{ scale: check.value }, { rotate: `${interpolate(check.value, [0, 1], [-40, 0])}deg` }],
        opacity: check.value,
    }));

    const glowStyle = useAnimatedStyle(() => ({
        opacity: glow.value * 0.7,
        transform: [{ scale: interpolate(glow.value, [0, 1], [0.95, 1.15]) }],
    }));

    const shimmerStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-W * 0.6, W * 0.6]) }],
    }));

    const particles = useMemo(() => Array.from({ length: PARTICLE_COUNT }, (_, i) => i), []);

    return (
        <View style={styles.root}>
            <LinearGradient
                colors={dark ? ['#042F2E', '#064E3B', '#0F172A', '#1E1B4B'] : ['#ECFDF5', '#FEF3C7', '#EEF2FF']}
                locations={[0, 0.35, 0.7, 1]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            {/* ambient blobs */}
            <Animated.View entering={FadeIn.duration(600)} style={[styles.blob, styles.blobA]} />
            <Animated.View entering={FadeIn.delay(120).duration(700)} style={[styles.blob, styles.blobB]} />

            <View style={styles.stage}>
                {particles.map((i) => (
                    <Particle key={i} index={i} dark={dark} />
                ))}

                <Animated.View style={[styles.glow, glowStyle]} />
                <PulseRing delay={0} color="rgba(52,211,153,0.55)" />
                <PulseRing delay={500} color="rgba(251,191,36,0.4)" />

                <Animated.View style={[styles.orbWrap, orbStyle]}>
                    {Platform.OS === 'web' ? (
                        <View
                            style={[
                                styles.orb,
                                {
                                    backgroundColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.55)',
                                    borderColor: dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.9)',
                                },
                                glass.shadow,
                                glass.backdrop,
                            ]}
                        >
                            <LinearGradient
                                colors={['rgba(52,211,153,0.45)', 'rgba(16,185,129,0.15)', 'transparent']}
                                style={StyleSheet.absoluteFill}
                            />
                            <Animated.View style={checkStyle}>
                                <View style={styles.checkBadge}>
                                    <Check size={48} color="#ECFDF5" strokeWidth={3.2} />
                                </View>
                            </Animated.View>
                        </View>
                    ) : (
                        <BlurView intensity={55} tint={dark ? 'dark' : 'light'} style={styles.orb}>
                            <LinearGradient
                                colors={['rgba(52,211,153,0.45)', 'rgba(16,185,129,0.15)', 'transparent']}
                                style={StyleSheet.absoluteFill}
                            />
                            <Animated.View style={checkStyle}>
                                <View style={styles.checkBadge}>
                                    <Check size={48} color="#ECFDF5" strokeWidth={3.2} />
                                </View>
                            </Animated.View>
                        </BlurView>
                    )}
                </Animated.View>
            </View>

            <Animated.View entering={FadeInUp.delay(280).springify().damping(14)} style={styles.copy}>
                <View style={styles.pill}>
                    <Sparkles size={14} color="#FBBF24" />
                    <Text style={styles.pillText}>¡Listo!</Text>
                </View>
                <Text style={[styles.title, { color: dark ? '#F8FAFC' : '#0F172A' }]}>Pago exitoso</Text>
                <Text style={[styles.amount, { color: dark ? '#6EE7B7' : '#059669' }]}>
                    ${amount.toFixed(2)}
                </Text>
                <Text style={[styles.sub, { color: dark ? '#94A3B8' : '#64748B' }]}>
                    Protegido con escrow · confirmación instantánea
                </Text>
            </Animated.View>

            <Animated.View
                entering={FadeInDown.delay(420).springify()}
                style={[
                    styles.glassCard,
                    {
                        backgroundColor: glass.bg,
                        borderColor: glass.border,
                    },
                    glass.shadow,
                    glass.backdrop,
                ]}
            >
                <Animated.View style={[styles.shimmer, shimmerStyle]} pointerEvents="none">
                    <LinearGradient
                        colors={['transparent', 'rgba(255,255,255,0.22)', 'transparent']}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={StyleSheet.absoluteFill}
                    />
                </Animated.View>
                <View style={styles.cardRow}>
                    <ShieldCheck size={20} color="#34D399" />
                    <Text style={[styles.cardText, { color: dark ? '#E2E8F0' : '#1E293B' }]}>
                        Fondos en custodia segura
                    </Text>
                </View>
                <View style={[styles.cardDivider, { backgroundColor: glass.border }]} />
                <Text style={[styles.cardHint, { color: dark ? '#94A3B8' : '#64748B' }]}>
                    Vas a recibir el comprobante y el vendedor ya fue notificado.
                </Text>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(560).springify()} style={styles.ctaWrap}>
                <TouchableOpacity activeOpacity={0.9} onPress={onDone} style={styles.cta}>
                    <LinearGradient
                        colors={['#10B981', '#059669', '#047857']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.ctaGrad}
                    >
                        <Text style={styles.ctaText}>Seguir comprando</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
    blob: { position: 'absolute', borderRadius: 999, opacity: 0.35 },
    blobA: {
        width: W * 0.7,
        height: W * 0.7,
        top: H * 0.08,
        left: -W * 0.15,
        backgroundColor: 'rgba(16,185,129,0.35)',
    },
    blobB: {
        width: W * 0.55,
        height: W * 0.55,
        bottom: H * 0.12,
        right: -W * 0.12,
        backgroundColor: 'rgba(251,191,36,0.28)',
    },
    stage: {
        height: 220,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    particle: {
        position: 'absolute',
        shadowOpacity: 0.8,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
    },
    glow: {
        position: 'absolute',
        width: 180,
        height: 180,
        borderRadius: 90,
        backgroundColor: 'rgba(52,211,153,0.35)',
    },
    ring: {
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: 70,
        borderWidth: 2,
    },
    orbWrap: { alignItems: 'center', justifyContent: 'center' },
    orb: {
        width: 128,
        height: 128,
        borderRadius: 64,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    checkBadge: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: '#059669',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#34D399',
        shadowOpacity: 0.65,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10,
    },
    copy: { alignItems: 'center', gap: 6, marginBottom: 20 },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: 'rgba(251,191,36,0.18)',
        marginBottom: 4,
    },
    pillText: { color: '#FBBF24', fontWeight: '800', fontSize: 12, letterSpacing: 0.6 },
    title: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
    amount: { fontSize: 40, fontWeight: '900', marginTop: 2 },
    sub: { fontSize: 14, fontWeight: '500', textAlign: 'center', marginTop: 4 },
    glassCard: {
        borderRadius: 20,
        borderWidth: 1,
        padding: 18,
        overflow: 'hidden',
        marginBottom: 22,
    },
    shimmer: {
        ...StyleSheet.absoluteFillObject,
        width: W * 0.45,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardText: { fontSize: 15, fontWeight: '700' },
    cardDivider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
    cardHint: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
    ctaWrap: { paddingBottom: 12 },
    cta: { borderRadius: 18, overflow: 'hidden' },
    ctaGrad: {
        height: 58,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 18,
    },
    ctaText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
});
