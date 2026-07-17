import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';

const CARD_ASPECT = 0.63;
const MAX_CARD_WIDTH = 360;

interface Props {
    brand: string;
    number: string;
    expiry: string;
    cvc: string;
    isFlipped: boolean;
}

export function AnimatedCreditCard({ brand, number, expiry, cvc, isFlipped }: Props) {
    const flip = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(flip, {
            toValue: isFlipped ? 1 : 0,
            friction: 8,
            tension: 50,
            useNativeDriver: Platform.OS !== 'web',
        }).start();
    }, [isFlipped]);

    const frontRotate = flip.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });
    const backRotate = flip.interpolate({
        inputRange: [0, 1],
        outputRange: ['180deg', '360deg'],
    });
    const frontOpacity = flip.interpolate({
        inputRange: [0.5, 0.501],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });
    const backOpacity = flip.interpolate({
        inputRange: [0.5, 0.501],
        outputRange: [0, 1],
        extrapolate: 'clamp',
    });

    const brandNorm = (brand || '').toLowerCase();
    const gradientTop = brandNorm.includes('visa') ? '#1a1f71'
        : brandNorm.includes('master') ? '#eb001b'
        : brandNorm.includes('amex') ? '#002663'
        : '#374151';
    const gradientBot = brandNorm.includes('visa') ? '#0070BA'
        : brandNorm.includes('master') ? '#ff5f00'
        : brandNorm.includes('amex') ? '#4d7bc4'
        : '#111827';

    const brandLabel = brandNorm.includes('visa') ? 'VISA'
        : brandNorm.includes('master') ? 'Mastercard'
        : brandNorm.includes('amex') ? 'AMEX'
        : brandNorm.includes('discover') ? 'Discover'
        : '';

    let formattedNumber = number ? number.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim() : '';
    const maskedNumber = formattedNumber || '•••• •••• •••• ••••';

    return (
        <View style={s.wrap}>
            {/* FRONT */}
            <Animated.View
                style={[
                    s.face,
                    { backgroundColor: gradientTop, opacity: frontOpacity },
                    { transform: [{ perspective: 1200 }, { rotateY: frontRotate }] },
                ]}
            >
                <View style={[s.gradientOverlay, { backgroundColor: gradientBot }]} />

                <View style={s.frontContent}>
                    {/* top row */}
                    <View style={s.topRow}>
                        <View style={s.chip}>
                            <View style={s.chipLine} />
                            <View style={[s.chipLine, { width: '60%' }]} />
                        </View>
                        {brandLabel ? (
                            <Text style={s.brandText}>{brandLabel}</Text>
                        ) : null}
                    </View>

                    {/* number */}
                    <Text style={s.number}>{maskedNumber}</Text>

                    {/* bottom row */}
                    <View style={s.bottomRow}>
                        <View>
                            <Text style={s.label}>TITULAR</Text>
                            <Text style={s.val}>RAMGOS USER</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={s.label}>VENCE</Text>
                            <Text style={s.val}>{expiry || '••/••'}</Text>
                        </View>
                    </View>
                </View>
            </Animated.View>

            {/* BACK */}
            <Animated.View
                style={[
                    s.face,
                    { backgroundColor: gradientTop, opacity: backOpacity },
                    { transform: [{ perspective: 1200 }, { rotateY: backRotate }] },
                ]}
            >
                <View style={[s.gradientOverlay, { backgroundColor: gradientBot }]} />
                <View style={s.backContent}>
                    <View style={s.magStripe} />
                    <View style={s.sigRow}>
                        <View style={s.sigStripe} />
                        <View style={s.cvvBadge}>
                            <Text style={s.cvvText}>{cvc || '•••'}</Text>
                        </View>
                    </View>
                    <Text style={s.disclaimer}>
                        Protegido por cifrado bancario PCI DSS Nivel 1
                    </Text>
                </View>
            </Animated.View>
        </View>
    );
}

const s = StyleSheet.create({
    wrap: {
        width: '100%',
        maxWidth: MAX_CARD_WIDTH,
        aspectRatio: 1 / CARD_ASPECT,
        alignSelf: 'center',
        marginBottom: 20,
    },
    face: {
        ...StyleSheet.absoluteFill,
        borderRadius: 18,
        overflow: 'hidden',
        backfaceVisibility: 'hidden',
        // shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 14,
    },
    gradientOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '55%',
        opacity: 0.6,
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 18,
    },
    frontContent: {
        flex: 1,
        padding: 22,
        justifyContent: 'space-between',
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    chip: {
        width: 42,
        height: 30,
        backgroundColor: 'rgba(255,215,0,0.85)',
        borderRadius: 5,
        justifyContent: 'center',
        paddingHorizontal: 6,
        gap: 3,
    },
    chipLine: {
        height: 2,
        width: '80%',
        backgroundColor: 'rgba(180,140,0,0.5)',
        borderRadius: 1,
    },
    brandText: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '900',
        fontStyle: 'italic',
        opacity: 0.95,
        letterSpacing: 1,
    },
    number: {
        color: '#fff',
        fontSize: 21,
        letterSpacing: 3,
        fontWeight: '500',
        textShadowColor: 'rgba(0,0,0,0.4)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    bottomRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    label: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 9,
        letterSpacing: 1.5,
        fontWeight: '700',
        marginBottom: 3,
    },
    val: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 1,
    },
    // BACK
    backContent: {
        flex: 1,
        justifyContent: 'flex-start',
    },
    magStripe: {
        width: '100%',
        height: 44,
        backgroundColor: '#1a1a1a',
        marginTop: 28,
    },
    sigRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 18,
        marginHorizontal: 22,
        gap: 10,
    },
    sigStripe: {
        flex: 1,
        height: 36,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 4,
    },
    cvvBadge: {
        backgroundColor: 'rgba(255,255,255,0.62)',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 4,
        minWidth: 56,
        alignItems: 'center',
    },
    cvvText: {
        color: '#111',
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 2,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    disclaimer: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 9,
        textAlign: 'center',
        marginTop: 'auto' as any,
        marginBottom: 14,
        paddingHorizontal: 20,
    },
});
