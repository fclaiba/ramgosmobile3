/**
 * Ruleta de la Suerte.
 *
 * Antes esto era una tarjeta con un botón "Girar" que resolvía al instante:
 * tocabas, aparecía un toast y listo. Funcionalmente correcto —el servidor
 * acreditaba bien— pero desde el lado del usuario no pasaba nada que se
 * pareciera a una ruleta, que es por qué se reportó como "dice ruleta de la
 * suerte pero no hace nada".
 *
 * QUIÉN DECIDE EL PREMIO
 *
 * El servidor, siempre. `onSpin()` llama a `economy.spinLuckyWheel`, que
 * sortea, valida el límite de un giro por día contra `rewardsClaims` y
 * acredita. Esta animación sólo REPRESENTA ese resultado: se calcula el
 * ángulo que deja el puntero sobre el segmento correspondiente al premio que
 * ya volvió del servidor, y se gira hasta ahí. No hay sorteo en el cliente,
 * así que no hay forma de influir en el premio desde acá.
 *
 * Por eso la rueda arranca a girar antes de que llegue la respuesta y recién
 * frena cuando llegó: el giro cubre la latencia en lugar de fingir un
 * resultado.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { WHEEL_POINTS_RANGE } from '../../../convex/economy/_rewardRules';
import { colors, Radius, Type } from '../../theme/tokens';

const SEGMENTS = 8;
const SEGMENT_ANGLE = 360 / SEGMENTS;
/** Vueltas completas antes de frenar, para que se lea como un giro y no un salto. */
const FULL_TURNS = 5;
const SPIN_MS = 3200;

/** Colores alternados de los gajos. Contrastan sobre ambos temas. */
const SEGMENT_COLORS = ['#2563EB', '#38BDF8', '#1D4ED8', '#0EA5E9'];

/**
 * Valores que muestra cada gajo, repartidos por el rango del servidor.
 *
 * El servidor sortea cualquier entero entre `min` y `max`, así que un premio
 * casi nunca cae justo en la etiqueta de un gajo. `segmentForPoints` resuelve
 * eso mapeando el premio al gajo más cercano: la rueda frena donde dice un
 * número creíble y el toast informa el monto exacto acreditado.
 */
function buildSegments(): number[] {
    const { min, max } = WHEEL_POINTS_RANGE;
    const step = (max - min) / (SEGMENTS - 1);
    return Array.from({ length: SEGMENTS }, (_, i) => Math.round(min + step * i));
}

/** Índice del gajo cuyo valor está más cerca de `points`. */
export function segmentForPoints(points: number, segments: number[]): number {
    let best = 0;
    let bestDistance = Infinity;
    segments.forEach((value, index) => {
        const distance = Math.abs(value - points);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = index;
        }
    });
    return best;
}

/**
 * Rotación que deja el centro del gajo `index` bajo el puntero (arriba, 12 en
 * punto), sumando vueltas completas.
 *
 * `from` es la rotación actual: se avanza SIEMPRE hacia adelante desde ahí
 * para que dos giros seguidos no hagan que la rueda vuelva para atrás.
 */
export function rotationForSegment(index: number, from: number): number {
    const target = 360 - (index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2);
    const base = from - (from % 360);
    let result = base + FULL_TURNS * 360 + target;
    while (result <= from) result += 360;
    return result;
}

/** Path SVG de un gajo, en coordenadas centradas en (0,0). */
function segmentPath(index: number, radius: number): string {
    const start = (index * SEGMENT_ANGLE - 90) * (Math.PI / 180);
    const end = ((index + 1) * SEGMENT_ANGLE - 90) * (Math.PI / 180);
    const x1 = radius * Math.cos(start);
    const y1 = radius * Math.sin(start);
    const x2 = radius * Math.cos(end);
    const y2 = radius * Math.sin(end);
    return `M 0 0 L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
}

export type SpinOutcome = {
    success: boolean;
    pointsAwarded?: number;
    message?: string;
    alreadyClaimed?: boolean;
};

export const LuckyWheel = ({
    size = 240,
    available,
    isDark,
    onSpin,
    onResult,
}: {
    size?: number;
    available: boolean;
    isDark: boolean;
    onSpin: () => Promise<SpinOutcome>;
    onResult?: (outcome: SpinOutcome) => void;
}) => {
    const c = colors(isDark);
    const segments = useMemo(buildSegments, []);
    const rotation = useSharedValue(0);
    const [spinning, setSpinning] = useState(false);

    const radius = size / 2;

    const animatedProps = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));

    const handlePress = async () => {
        if (spinning) return;
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        if (!available) {
            onResult?.({ success: false, alreadyClaimed: true });
            return;
        }

        setSpinning(true);
        // Se arranca a girar ya, sin saber el premio: la vuelta cubre el viaje
        // al servidor en lugar de dejar la rueda quieta esperando.
        rotation.value = withTiming(rotation.value + FULL_TURNS * 360, {
            duration: SPIN_MS,
            easing: Easing.out(Easing.cubic),
        });

        let outcome: SpinOutcome;
        try {
            outcome = await onSpin();
        } catch {
            outcome = { success: false, message: 'No se pudo girar la rueda.' };
        }

        if (outcome.success && typeof outcome.pointsAwarded === 'number') {
            const index = segmentForPoints(outcome.pointsAwarded, segments);
            rotation.value = withTiming(
                rotationForSegment(index, rotation.value),
                { duration: SPIN_MS, easing: Easing.out(Easing.cubic) },
                () => {
                    if (Platform.OS !== 'web') {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }
                },
            );
        }

        setSpinning(false);
        onResult?.(outcome);
    };

    return (
        <View style={{ alignItems: 'center', gap: 12 }}>
            <View style={{ width: size, height: size + 16, alignItems: 'center' }}>
                {/* Puntero fijo arriba: es la referencia contra la que frena la rueda. */}
                <View
                    style={{
                        width: 0,
                        height: 0,
                        borderLeftWidth: 10,
                        borderRightWidth: 10,
                        borderTopWidth: 18,
                        borderLeftColor: 'transparent',
                        borderRightColor: 'transparent',
                        borderTopColor: '#F59E0B',
                        zIndex: 2,
                    }}
                />
                <Animated.View style={[{ width: size, height: size, marginTop: -2 }, animatedProps]}>
                    <Svg width={size} height={size} viewBox={`${-radius} ${-radius} ${size} ${size}`}>
                        <G>
                            {segments.map((value, index) => {
                                const mid = (index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2 - 90) * (Math.PI / 180);
                                const labelRadius = radius * 0.68;
                                return (
                                    <G key={index}>
                                        <Path
                                            d={segmentPath(index, radius - 4)}
                                            fill={SEGMENT_COLORS[index % SEGMENT_COLORS.length]}
                                            stroke="#FFFFFF"
                                            strokeWidth={2}
                                        />
                                        <SvgText
                                            x={labelRadius * Math.cos(mid)}
                                            y={labelRadius * Math.sin(mid) + 5}
                                            fill="#FFFFFF"
                                            fontSize={15}
                                            fontWeight="bold"
                                            textAnchor="middle"
                                        >
                                            {value}
                                        </SvgText>
                                    </G>
                                );
                            })}
                            <Circle r={radius * 0.16} fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={2} />
                        </G>
                    </Svg>
                </Animated.View>
            </View>

            <Pressable
                onPress={handlePress}
                disabled={spinning}
                accessibilityRole="button"
                accessibilityLabel={available ? 'Girar la ruleta de la suerte' : 'Ruleta ya usada hoy'}
                accessibilityState={{ disabled: spinning || !available }}
                style={{
                    minHeight: 44,
                    paddingHorizontal: 28,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: Radius.full,
                    backgroundColor: available ? '#D97706' : c.surface2,
                    opacity: spinning ? 0.7 : 1,
                }}
            >
                <Text
                    style={{
                        ...Type.bodySm,
                        fontWeight: '800',
                        color: available ? '#FFFFFF' : c.textMuted,
                    }}
                >
                    {spinning ? 'Girando…' : available ? 'Girar' : 'Vuelve mañana'}
                </Text>
            </Pressable>
        </View>
    );
};

export default LuckyWheel;
