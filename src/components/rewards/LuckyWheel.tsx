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
 * sortea (`rollWheelPrize`, `Math.random()` corriendo dentro del isolate de
 * Convex — no manipulable desde el cliente), valida el límite de un giro por
 * día contra `rewardsClaims` y acredita. Esta animación sólo REPRESENTA ese
 * resultado: se calcula el ángulo que deja el puntero sobre el segmento
 * correspondiente al premio que ya volvió del servidor, y se gira hasta ahí.
 * No hay sorteo en el cliente, así que no hay forma de influir en el premio
 * desde acá.
 *
 * EL GAJO DONDE FRENA ES SIEMPRE EL PREMIO REAL
 *
 * Antes el servidor sorteaba cualquier entero entre 5 y 50, pero sólo había
 * 8 gajos — la rueda frenaba en el más CERCANO, no en el exacto (podía
 * mostrar "11" y acreditar 12). Ahora `rollWheelPrize()` sortea directo uno
 * de los mismos 8 valores (`WHEEL_PRIZE_VALUES`), así que el número donde
 * frena la rueda y el número que acredita el toast son siempre el mismo.
 *
 * Por eso la rueda arranca a girar antes de que llegue la respuesta y recién
 * frena cuando llegó: el giro cubre la latencia en lugar de fingir un
 * resultado. Es UNA sola animación continua (giro a velocidad constante que
 * se frena hacia el premio apenas se sabe cuál es), no dos animaciones que se
 * empalman a mitad de vuelo.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
    Easing,
    cancelAnimation,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { WHEEL_PRIZE_VALUES } from '../../../convex/economy/_rewardRules';
import { colors, Radius, Type } from '../../theme/tokens';

const SEGMENTS = WHEEL_PRIZE_VALUES.length;
const SEGMENT_ANGLE = 360 / SEGMENTS;
/** Vueltas completas mínimas antes de frenar, para que se lea como un giro y no un salto. */
const FULL_TURNS = 5;
/** Duración de la frenada hacia el premio (incluye el pequeño rebote final). */
const SETTLE_MS = 1400;
/** Cuánto se pasa del centro del gajo antes de volver — el "clunk" mecánico. */
const OVERSHOOT_DEG = 8;
/** Giro "a ciegas" mientras se espera al servidor: velocidad constante, sin premio todavía. */
const BLIND_SPIN_MS = 6000;
const BLIND_SPIN_TURNS = 8;
/** Piso de tiempo de giro ciego aunque el servidor responda al instante — si no, el
 *  frenado se siente como una decisión instantánea en vez de un sorteo. */
const MIN_BLIND_SPIN_MS = 700;

/** Colores alternados de los gajos. Contrastan sobre ambos temas. */
const SEGMENT_COLORS = ['#2563EB', '#38BDF8', '#1D4ED8', '#0EA5E9'];

/** Los 8 valores que puede acreditar el servidor — misma fuente que usa `spinLuckyWheel`. */
function buildSegments(): number[] {
    return [...WHEEL_PRIZE_VALUES];
}

/** Índice del gajo cuyo valor está más cerca de `points` (hoy siempre exacto: ver arriba). */
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

/** Índice del gajo que está bajo el puntero para una rotación cualquiera —
 *  se usa para frenar "en algún gajo" prolijo si el sorteo falla en el camino. */
function segmentUnderPointer(rotation: number): number {
    const normalized = ((360 - (rotation % 360)) % 360 + 360) % 360;
    return Math.floor(normalized / SEGMENT_ANGLE) % SEGMENTS;
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

/**
 * Partículas de la celebración al ganar — misma técnica que
 * `HatchParticle` en `MiMascotaView.tsx` (eclosión del huevo): un único
 * shared value driver 0→1, cada partícula sólo aporta su ángulo/distancia
 * fijos. Mismo lenguaje visual en toda la app en vez de una tercera técnica
 * de confetti.
 */
const BURST_COUNT = 10;
const BURST_EMOJIS = ['✨', '🎉', '⭐'];
const BURST_COLORS = ['#F59E0B', '#FCD34D', '#34D399', '#F472B6'];
const BURST_PARTICLES = Array.from({ length: BURST_COUNT }, (_, i) => ({
    angle: (i / BURST_COUNT) * Math.PI * 2,
    distance: 60 + (i % 3) * 16,
    emoji: BURST_EMOJIS[i % BURST_EMOJIS.length],
    color: BURST_COLORS[i % BURST_COLORS.length],
    rotate: (i % 2 === 0 ? 1 : -1) * 160,
}));

function WheelBurstParticle({
    particle,
    progress,
}: {
    particle: (typeof BURST_PARTICLES)[number];
    progress: any;
}) {
    const style = useAnimatedStyle(() => {
        const p = progress.value;
        const eased = 1 - Math.pow(1 - p, 3);
        const dist = eased * particle.distance;
        return {
            opacity: interpolate(p, [0, 0.15, 0.7, 1], [0, 1, 1, 0]),
            transform: [
                { translateX: Math.cos(particle.angle) * dist },
                { translateY: Math.sin(particle.angle) * dist },
                { scale: interpolate(p, [0, 0.2, 1], [0.3, 1, 0.7]) },
                { rotate: `${p * particle.rotate}deg` },
            ],
        };
    });
    return (
        <Animated.Text style={[burstParticleStyle, style, { color: particle.color }]}>
            {particle.emoji}
        </Animated.Text>
    );
}

const burstParticleStyle = {
    position: 'absolute' as const,
    fontSize: 18,
};

const minDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
    const pointerScale = useSharedValue(1);
    const burstProgress = useSharedValue(0);
    const [spinning, setSpinning] = useState(false);
    const [showBurst, setShowBurst] = useState(false);

    const radius = size / 2;

    // No dejar una animación corriendo sobre un componente ya desmontado.
    useEffect(() => {
        return () => {
            cancelAnimation(rotation);
            cancelAnimation(pointerScale);
            cancelAnimation(burstProgress);
        };
    }, []);

    const animatedProps = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));

    const pointerStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pointerScale.value }],
    }));

    // Corre en el JS thread — se llama con `runOnJS` desde el callback de la
    // animación (que sí corre en el UI thread). Escribir `shared.value` acá
    // es válido igual que en `handlePress`: Reanimated puentea la escritura.
    const finishSpin = (won: boolean) => {
        if (won) {
            pointerScale.value = withSequence(
                withTiming(1.35, { duration: 120, easing: Easing.out(Easing.cubic) }),
                withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }),
            );
            burstProgress.value = 0;
            burstProgress.value = withTiming(1, { duration: 500 });
            setShowBurst(true);
            hapticSuccess();
        }
        setSpinning(false);
    };

    const handlePress = async () => {
        if (spinning) return;
        hapticImpact();

        if (!available) {
            onResult?.({ success: false, alreadyClaimed: true });
            return;
        }

        setSpinning(true);
        setShowBurst(false);
        burstProgress.value = 0;

        // Se arranca a girar ya, a velocidad constante y sin saber el premio
        // todavía: la vuelta cubre el viaje al servidor en lugar de dejar la
        // rueda quieta esperando. `Easing.linear` (no decelera) para que el
        // empalme con la frenada real, más abajo, no tenga un salto de curva.
        rotation.value = withTiming(rotation.value + BLIND_SPIN_TURNS * 360, {
            duration: BLIND_SPIN_MS,
            easing: Easing.linear,
        });

        let outcome: SpinOutcome;
        try {
            const [result] = await Promise.all([onSpin(), minDelay(MIN_BLIND_SPIN_MS)]);
            outcome = result;
        } catch {
            outcome = { success: false, message: 'No se pudo girar la rueda.' };
        }

        const wonPoints = outcome.success && typeof outcome.pointsAwarded === 'number';
        const index = wonPoints
            ? segmentForPoints(outcome.pointsAwarded as number, segments)
            : segmentUnderPointer(rotation.value);
        const target = rotationForSegment(index, rotation.value);

        if (wonPoints) {
            // Frenada real: decelera, se pasa un toque del centro del gajo y
            // vuelve — el "clunk" que hace sentir la rueda mecánica en vez de
            // una animación que simplemente para.
            rotation.value = withSequence(
                withTiming(target + OVERSHOOT_DEG, {
                    duration: SETTLE_MS * 0.82,
                    easing: Easing.out(Easing.cubic),
                }),
                withTiming(target, {
                    duration: SETTLE_MS * 0.18,
                    easing: Easing.inOut(Easing.quad),
                }, (finished) => {
                    'worklet';
                    if (finished) runOnJS(finishSpin)(true);
                }),
            );
        } else {
            // Falla (red, o ya la habían girado hoy con otra pestaña): frena
            // prolijo en el gajo más cercano, sin haptic de éxito ni burst —
            // la rueda nunca queda a mitad de camino ni girando para siempre.
            rotation.value = withTiming(
                target,
                { duration: SETTLE_MS, easing: Easing.out(Easing.cubic) },
                (finished) => {
                    'worklet';
                    if (finished) runOnJS(finishSpin)(false);
                },
            );
        }

        onResult?.(outcome);
    };

    return (
        <View style={{ alignItems: 'center', gap: 12 }}>
            <View style={{ width: size, height: size + 16, alignItems: 'center' }}>
                {/* Puntero fijo arriba: es la referencia contra la que frena la rueda. */}
                <Animated.View
                    style={[
                        {
                            width: 0,
                            height: 0,
                            borderLeftWidth: 10,
                            borderRightWidth: 10,
                            borderTopWidth: 18,
                            borderLeftColor: 'transparent',
                            borderRightColor: 'transparent',
                            borderTopColor: '#F59E0B',
                            zIndex: 2,
                        },
                        pointerStyle,
                    ]}
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
                {showBurst && (
                    <View pointerEvents="none" style={{ position: 'absolute', top: size / 2 + 8, left: size / 2 }}>
                        {BURST_PARTICLES.map((particle, i) => (
                            <WheelBurstParticle key={i} particle={particle} progress={burstProgress} />
                        ))}
                    </View>
                )}
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

function hapticImpact() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

function hapticSuccess() {
    if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
}

export default LuckyWheel;
