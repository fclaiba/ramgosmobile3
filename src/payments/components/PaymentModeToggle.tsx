import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FlaskConical, Zap } from 'lucide-react-native';
import { usePaymentMode, type PaymentMode } from '../../contexts/PaymentModeContext';
import { glassTokens } from '../../utils/glass';
import { Radius, Type, colors, glassShadow } from '../../theme/tokens';

type Props = {
    isDark?: boolean;
};

/**
 * Segmented control: Simulado (TEST) | Producción (LIVE).
 * Wired to PaymentModeContext.
 */
export function PaymentModeToggle({ isDark = false }: Props) {
    const { mode, setMode, isLive } = usePaymentMode();
    const glass = glassTokens(isDark);
    const c = colors(isDark);

    const select = (next: PaymentMode) => {
        if (next !== mode) setMode(next);
    };

    return (
        <View style={styles.wrap}>
            <Text style={[styles.heading, { color: c.text }]}>Modo de pago</Text>
            <Text style={[styles.sub, { color: c.textMuted }]}>
                {isLive
                    ? 'Producción: cobro real con Stripe LIVE'
                    : 'Simulado: tarjetas de prueba, sin cobro real'}
            </Text>

            <View
                style={[
                    styles.track,
                    glassShadow(isDark),
                    {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(24,24,27,0.04)',
                        borderColor: glass.border,
                    },
                ]}
            >
                <TouchableOpacity
                    style={[
                        styles.seg,
                        !isLive && {
                            backgroundColor: isDark ? 'rgba(245,158,11,0.22)' : '#FFFBEB',
                            borderColor: isDark ? 'rgba(245,158,11,0.35)' : '#FDE68A',
                        },
                        !isLive && styles.segActiveBorder,
                    ]}
                    onPress={() => select('test')}
                    accessibilityRole="button"
                    accessibilityState={{ selected: !isLive }}
                    accessibilityLabel="Modo simulado"
                >
                    <FlaskConical size={15} color={!isLive ? (isDark ? '#FBBF24' : '#B45309') : c.textMuted} />
                    <Text
                        style={[
                            styles.segText,
                            { color: !isLive ? (isDark ? '#FDE68A' : '#92400E') : c.textMuted },
                            !isLive && styles.segTextActive,
                        ]}
                    >
                        Simulado
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.seg,
                        isLive && {
                            backgroundColor: isDark ? 'rgba(16,185,129,0.2)' : '#ECFDF5',
                            borderColor: isDark ? 'rgba(16,185,129,0.4)' : '#A7F3D0',
                        },
                        isLive && styles.segActiveBorder,
                    ]}
                    onPress={() => select('live')}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isLive }}
                    accessibilityLabel="Modo producción"
                >
                    <Zap size={15} color={isLive ? (isDark ? '#34D399' : '#047857') : c.textMuted} />
                    <Text
                        style={[
                            styles.segText,
                            { color: isLive ? (isDark ? '#A7F3D0' : '#065F46') : c.textMuted },
                            isLive && styles.segTextActive,
                        ]}
                    >
                        Producción
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 8 },
    heading: { ...Type.title },
    sub: { ...Type.bodySm, marginBottom: 2 },
    track: {
        flexDirection: 'row',
        borderRadius: Radius.xl,
        borderWidth: 1,
        padding: 5,
        gap: 5,
    },
    seg: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    segActiveBorder: {
        borderWidth: 1,
    },
    segText: {
        fontSize: 14,
        fontWeight: '700',
    },
    segTextActive: {
        fontWeight: '800',
    },
});
