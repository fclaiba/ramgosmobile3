import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS, interpolate, Extrapolate, useDerivedValue, withRepeat, useAnimatedReaction } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, G, Text as SvgText, Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import type { GameAdapterProps, GameEndSummary, GameEvent, GameThemeTokens } from './gameContracts';
import { useRewards } from '../../contexts/RewardsContext';
import { usePoints } from '../../contexts/PointsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Coins } from 'lucide-react-native';

const WHEEL_SIZE = 300;
const SPIN_COST = 10; // Matches seeded config in economy.ts
const SEGMENTS = [
    { label: '50', color: '#EF4444' },
    { label: '0', color: '#3B82F6' },
    { label: '10', color: '#10B981' },
    { label: '0', color: '#F59E0B' },
    { label: '20', color: '#8B5CF6' },
    { label: '0', color: '#EC4899' },
    { label: '100', color: '#FCD34D' },
    { label: '0', color: '#6B7280' },
];

// Phase 2: Particle/Confetti System
const Particle = ({ emoji }: { emoji: string }) => {
    const tx = useSharedValue(0);
    const ty = useSharedValue(0);
    const opacity = useSharedValue(1);

    useEffect(() => {
        const angle = Math.random() * Math.PI * 2;
        const distance = 80 + Math.random() * 120;
        tx.value = withTiming(Math.cos(angle) * distance, { duration: 1000, easing: Easing.out(Easing.cubic) });
        ty.value = withTiming(Math.sin(angle) * distance - 150, { duration: 1000, easing: Easing.out(Easing.cubic) });
        opacity.value = withTiming(0, { duration: 1200 });
    }, []);

    const style = useAnimatedStyle(() => ({
        position: 'absolute',
        transform: [{ translateX: tx.value }, { translateY: ty.value }],
        opacity: opacity.value,
        fontSize: 24,
        zIndex: 50,
    }));

    return <Animated.Text style={style}>{emoji}</Animated.Text>;
};

const Segment = ({ index, total, label, color }: { index: number, total: number, label: string, color: string }) => {
    const angle = (2 * Math.PI) / total;
    const startAngle = index * angle;
    const endAngle = (index + 1) * angle;
    
    const x1 = 150 + 150 * Math.cos(startAngle);
    const y1 = 150 + 150 * Math.sin(startAngle);
    const x2 = 150 + 150 * Math.cos(endAngle);
    const y2 = 150 + 150 * Math.sin(endAngle);

    const d = `M 150 150 L ${x1} ${y1} A 150 150 0 0 1 ${x2} ${y2} Z`;

    return (
        <G>
            <Path d={d} fill={color} stroke="#fff" strokeWidth="1" />
            <G transform={`rotate(${(startAngle + angle / 2) * (180 / Math.PI)}, 150, 150)`}>
                <SvgText
                    x="230"
                    y="150"
                    fill="white"
                    fontSize="16"
                    fontWeight="bold"
                    textAnchor="middle"
                    alignmentBaseline="middle"
                >
                    {label}
                </SvgText>
            </G>
        </G>
    );
};

interface RouletteGameProps {
    onClose: () => void;
    // Wrapper integration (optional)
    uiMode?: 'standalone' | 'wrapped';
    onEvent?: (event: GameEvent) => void;
    onEnd?: (summary: GameEndSummary) => void;
    gameId?: GameAdapterProps['gameId'];
    family?: GameAdapterProps['family'];
    theme?: GameThemeTokens;
}

export const RouletteGame = (props: RouletteGameProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const {
        onClose,
        uiMode = 'standalone',
        onEvent,
        onEnd,
        gameId = 'roulette',
        family = 'casino',
        theme,
    } = props;
    const { playGame } = useRewards();
    const { points } = usePoints();
    const [spinning, setSpinning] = useState(false);
    const [result, setResult] = useState<number | null>(null);
    const rotation = useSharedValue(0);
    const [winMessage, setWinMessage] = useState('');
    const winPulse = useSharedValue(1);
    const [showParticles, setShowParticles] = useState(false);
    const [sound, setSound] = useState<Audio.Sound | null>(null);

    const winStyle = useAnimatedStyle(() => ({
        transform: [{ scale: winPulse.value }],
    }));

    // Phase 2: Pointer Clack
    const pointerRotation = useDerivedValue(() => {
        const step = 360 / SEGMENTS.length;
        const currentPos = rotation.value % step;
        if (currentPos < 5) {
            return interpolate(currentPos, [0, 5], [-15, 0], Extrapolate.CLAMP);
        }
        return 0;
    });

    // Phase 3: Haptic Feedback on Pointer Clack
    useAnimatedReaction(
        () => {
            const step = 360 / SEGMENTS.length;
            return Math.floor(rotation.value / step);
        },
        (current, previous) => {
            if (current !== previous && previous !== null) {
                runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
            }
        }
    );

    const pointerStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${pointerRotation.value}deg` }],
    }));

    useEffect(() => {
        if (uiMode !== 'wrapped') return;
        onEvent?.({ type: 'status', status: 'playing' });
        onEvent?.({ type: 'metrics', patch: { score: 0, level: 1, progressToNext: 0, lives: 0 } });
    }, [onEvent, uiMode]);

    // Phase 3: Cleanup Audio (Removed per request)

    const spin = async () => {
        if (spinning) return;

        try {
            setSpinning(true);
            setResult(null);
            setWinMessage('');
            setShowParticles(false);
            winPulse.value = 1;

            const serverResult = await playGame('roulette');
            
            // Phase 2: Professional Bezier Deceleration
            const totalSegments = SEGMENTS.length;
            
            // Find the segment index that matches the server result label
            const label = serverResult.outcome.label;
            const pts = serverResult.prizePoints;
            let targetSegmentIndex = SEGMENTS.findIndex(s => s.label === pts.toString());
            
            // If label doesn't match perfectly (e.g. 'Try Again'), pick a '0' segment
            if (targetSegmentIndex === -1) {
                const zeroSegments = SEGMENTS.map((s, i) => s.label === '0' ? i : -1).filter(i => i !== -1);
                targetSegmentIndex = zeroSegments[Math.floor(Math.random() * zeroSegments.length)];
            }
            if (targetSegmentIndex === -1) targetSegmentIndex = 0; // Fallback
            
            const segmentAngle = 360 / totalSegments;
            
            // Current rotation modulo 360
            const currentAngle = rotation.value % 360;
            
            // In our SVG, index 0 is at the right (0 radians). 
            // The pointer is at the top (-90 degrees or 270 degrees).
            // To make targetSegmentIndex stop at the top:
            // Angle needed = 270 - (index * segmentAngle)
            // We add 360 to ensure it's positive, then modulo 360.
            let targetStopAngle = (270 - (targetSegmentIndex * segmentAngle)) % 360;
            if (targetStopAngle < 0) targetStopAngle += 360;
            
            // Add a slight random offset within the segment so it doesn't always stop dead center
            const randomOffset = (Math.random() - 0.5) * (segmentAngle * 0.8);
            targetStopAngle += randomOffset;

            // Spin at least 8 full times (2880 degrees) from current position
            const spins = 360 * 8;
            
            // Calculate final absolute angle
            // We want (currentAngle + spins + X) % 360 === targetStopAngle
            // So X = targetStopAngle - (currentAngle % 360)
            let extraAngle = targetStopAngle - currentAngle;
            if (extraAngle < 0) extraAngle += 360;

            const finalAngle = rotation.value + spins + extraAngle;

            rotation.value = withTiming(finalAngle, {
                duration: 6000,
                easing: Easing.bezier(0.2, 0.0, 0.2, 1.0), // Classic ease-out for spinning wheel
            }, (finished?: boolean) => {
                if (finished) {
                    runOnJS(handleResult)(serverResult);
                }
            });
        } catch (error: any) {
            setSpinning(false);
            setWinMessage(error.message || 'Error');
        }
    };

    const handleResult = (serverResult: any) => {
        setSpinning(false);
        const pts = serverResult.prizePoints;
        const label = serverResult.outcome.label;
        setResult(pts);

        if (pts > 0) {
            setWinMessage(`¡${label}! (+${pts})`);
            setShowParticles(true);
            winPulse.value = withRepeat(withTiming(1.2, { duration: 300 }), 4, true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
            setWinMessage('Sigue intentando');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }

        onEvent?.({ type: 'currencyDelta', delta: pts, currency: 'points', reason: 'wheel_spin' });
        onEnd?.({
            gameId,
            family,
            score: 0,
            currencyDelta: { currency: 'points', delta: pts },
            finalMetrics: { score: 0, level: 1, progressToNext: 0, lives: 0 },
            reason: 'wheel_spin',
        });
    };

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ rotate: `${rotation.value}deg` }],
        };
    });

    return (
        <ScrollView 
            style={[styles.container, uiMode === 'wrapped' && theme && { backgroundColor: theme.colors.bg }]}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
        >
            {theme?.gradients?.bg && (
                <LinearGradient colors={theme.gradients.bg} style={StyleSheet.absoluteFill} />
            )}
            
            {/* Phase 4: Consolidate HUD */}
            <View style={[styles.hud, theme && { backgroundColor: theme.colors.hudBg, borderColor: theme.colors.hudBorder }]}>
                <View style={styles.hudBalance}>
                    <Coins size={20} color={theme ? theme.colors.accent : (isDark ? '#FCD34D' : '#F59E0B')} />
                    <Text style={[styles.hudText, theme && { color: theme.colors.hudText, fontSize: theme.typography.hud.fontSize, fontWeight: theme.typography.hud.fontWeight }]}>
                        {points.toLocaleString()} pts
                    </Text>
                    {/* Debug Button to easily test */}
                    <TouchableOpacity onPress={() => usePoints().addPoints?.(100, 'Test Points', { source: 'manual' })} style={{ marginLeft: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: isDark ? '#fff' : '#000' }}>+100</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.hudCost}>
                    <Text style={[styles.hudTextMuted, theme && { color: theme.colors.textMuted }]}>
                        Costo: {SPIN_COST} pts
                    </Text>
                </View>
            </View>

            {showParticles && Array.from({ length: 15 }).map((_, i) => (
                <Particle key={i} emoji={['💰', '✨', '🎉', '💎'][i % 4]} />
            ))}

            <View style={styles.wheelContainer}>
                {/* Phase 2: Animated Pointer */}
                <Animated.View style={[styles.pointerContainer, pointerStyle]}>
                    <View style={styles.pointer} />
                </Animated.View>

                <Animated.View style={[styles.wheel, animatedStyle]}>
                    <Svg width={WHEEL_SIZE} height={WHEEL_SIZE} viewBox="0 0 300 300">
                        {SEGMENTS.map((seg, i) => (
                            <Segment key={i} index={i} total={SEGMENTS.length} label={seg.label} color={seg.color} />
                        ))}
                        <Circle cx="150" cy="150" r="20" fill={isDark ? '#1F2937' : '#fff'} />
                    </Svg>
                </Animated.View>
            </View>

            <Animated.View style={[styles.resultBox, winStyle]}>
                <Text style={styles.resultLabel}>Resultado</Text>
                <Text style={[styles.resultValue, (result ?? 0) > 0 && { color: theme ? theme.colors.accent : '#F59E0B' }]}>
                    {winMessage || '-'}
                </Text>
            </Animated.View>

            <TouchableOpacity
                style={[
                    styles.spinBtn,
                    spinning && styles.disabledBtn,
                    theme && { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill }
                ]}
                onPress={spin}
                disabled={spinning}
            >
                {theme?.gradients?.cta && (
                    <LinearGradient colors={theme.gradients.cta} style={[{borderRadius: theme.radius.pill}, StyleSheet.absoluteFill]} />
                )}
                <Text style={[styles.spinText, theme && { fontSize: theme.typography.title.fontSize, fontWeight: theme.typography.title.fontWeight, color: '#fff' }]}>
                    {spinning ? 'GIRANDO...' : 'GIRAR'}
                </Text>
            </TouchableOpacity>

            {uiMode === 'standalone' && (
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                    <Text style={styles.closeButtonText}>Cerrar</Text>
                </TouchableOpacity>
            )}
        </ScrollView>
    );
};

const getStyles = (isDark: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: isDark ? '#1F2937' : '#fff',
    },
    scrollContent: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    hud: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        padding: 16,
        backgroundColor: isDark ? 'rgba(31, 41, 55, 0.8)' : 'rgba(255, 255, 255, 0.8)',
        borderRadius: 16,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        zIndex: 20,
    },
    hudBalance: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    hudText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    hudCost: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    hudTextMuted: {
        fontSize: 14,
        color: isDark ? '#9CA3AF' : '#6B7280',
        fontWeight: '600',
    },
    wheelContainer: {
        width: WHEEL_SIZE,
        height: WHEEL_SIZE,
        marginBottom: 32,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    wheel: {
        width: '100%',
        height: '100%',
        borderRadius: WHEEL_SIZE / 2,
        overflow: 'hidden',
    },
    pointerContainer: {
        position: 'absolute',
        top: -15,
        zIndex: 10,
        height: 40,
        width: 20,
        alignItems: 'center',
        transformOrigin: 'top',
    },
    pointer: {
        width: 0,
        height: 0,
        borderLeftWidth: 10,
        borderRightWidth: 10,
        borderTopWidth: 25,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: isDark ? '#F9FAFB' : '#000',
    },
    spinBtn: {
        backgroundColor: '#EF4444',
        paddingHorizontal: 48,
        paddingVertical: 16,
        borderRadius: 32,
        elevation: 3,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    disabledBtn: {
        opacity: 0.7,
    },
    spinText: {
        color: isDark ? '#1F2937' : '#fff',
        fontWeight: 'bold',
        fontSize: 18,
        position: 'relative',
        zIndex: 2,
    },
    resultBox: {
        marginTop: 24,
        alignItems: 'center',
        height: 60,
    },
    resultLabel: {
        color: isDark ? '#9CA3AF' : '#6B7280',
        fontSize: 14,
    },
    resultValue: {
        color: isDark ? '#F9FAFB' : '#1F2937',
        fontSize: 24,
        fontWeight: 'bold',
    },
    closeButton: {
        marginTop: 24,
        padding: 12,
    },
    closeButtonText: {
        color: isDark ? '#9CA3AF' : '#6B7280',
        fontSize: 16,
        fontWeight: '600',
    },
});
