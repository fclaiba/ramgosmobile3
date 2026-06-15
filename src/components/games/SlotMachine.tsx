import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { Coins, RotateCcw, DollarSign } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, withRepeat, cancelAnimation } from 'react-native-reanimated';
import type { GameAdapterProps, GameEndSummary, GameEvent, GameThemeTokens } from './gameContracts';
import { useTheme } from '../../contexts/ThemeContext';
import { useRewards } from '../../contexts/RewardsContext';
import { usePoints } from '../../contexts/PointsContext';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

const SYMBOLS = ['🍒', '🍋', '🍇', '💎', '7️⃣', '🔔'];
const SYMBOL_HEIGHT = 80;
const REEL_HEIGHT = 200;
const SPIN_COST = 20; // Matches seeded config in economy.ts

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

const Reel = ({ spinning, stopSymbol, delay }: { spinning: boolean, stopSymbol: string, delay: number }) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const offset = useSharedValue(0);
    const blurIntensity = useSharedValue(0);

    useEffect(() => {
        const cycleHeight = SYMBOL_HEIGHT * SYMBOLS.length;
        if (spinning) {
            blurIntensity.value = withTiming(10, { duration: 500 });
            offset.value = withRepeat(
                withTiming(offset.value - cycleHeight, { duration: 250, easing: Easing.linear }),
                -1,
                false
            );
        } else {
            blurIntensity.value = withTiming(0, { duration: 800 });
            cancelAnimation(offset);
            const index = SYMBOLS.indexOf(stopSymbol);
            
            let targetRem = (60 - index * SYMBOL_HEIGHT) % cycleHeight;
            if (targetRem > 0) targetRem -= cycleHeight;

            if (offset.value === 0) {
                offset.value = targetRem;
                return;
            }
            
            let currentRem = offset.value % cycleHeight;
            if (currentRem > 0) currentRem -= cycleHeight;
            
            let diff = targetRem - currentRem;
            while (diff >= 0) diff -= cycleHeight;
            
            // Phase 2: Elastic Stop (Overshoot)
            const target = offset.value + diff - (cycleHeight * 3);
            offset.value = withTiming(target, { 
                duration: 2000 + delay, 
                easing: Easing.bezier(0.2, 0, 0, 1.2) // Custom overshoot bezier
            });
        }
    }, [spinning, stopSymbol, delay]);

    const animatedStyle = useAnimatedStyle(() => {
        const cycleHeight = SYMBOL_HEIGHT * SYMBOLS.length;
        let rem = offset.value % cycleHeight;
        if (rem > 0) rem -= cycleHeight;
        return {
            transform: [{ translateY: rem - cycleHeight }],
        };
    });

    const blurStyle = useAnimatedStyle(() => ({
        opacity: blurIntensity.value / 10,
    }));

    return (
        <View style={styles.reelContainer}>
            <Animated.View style={[styles.reelContent, animatedStyle]}>
                {[...SYMBOLS, ...SYMBOLS, ...SYMBOLS].map((s, i) => (
                    <View key={i} style={styles.symbolContainer}>
                        <Text style={styles.symbol}>{s}</Text>
                    </View>
                ))}
            </Animated.View>
            {/* Phase 2: Motion Blur Overlay */}
            <Animated.View style={[StyleSheet.absoluteFill, blurStyle, { pointerEvents: 'none' }]}>
                <BlurView intensity={20} style={StyleSheet.absoluteFill} tint={isDark ? 'dark' : 'light'} />
            </Animated.View>
            <View style={styles.overlay} />
        </View>
    );
};

interface SlotMachineProps {
    onClose: () => void;
    onGameEnd?: (score: number) => void;
    // Wrapper integration (optional)
    uiMode?: 'standalone' | 'wrapped';
    onEvent?: (event: GameEvent) => void;
    onEnd?: (summary: GameEndSummary) => void;
    gameId?: GameAdapterProps['gameId'];
    family?: GameAdapterProps['family'];
    theme?: GameThemeTokens;
}

export const SlotMachine = (props: SlotMachineProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const {
        onClose,
        onGameEnd,
        uiMode = 'standalone',
        onEvent,
        onEnd,
        gameId = 'slots',
        family = 'casino',
        theme,
    } = props;
    const { playGame } = useRewards();
    const { points, addPoints } = usePoints();
    const [spinning, setSpinning] = useState(false);
    const [results, setResults] = useState(['7️⃣', '7️⃣', '7️⃣']);
    const [winMessage, setWinMessage] = useState('');
    const winPulse = useSharedValue(1);
    const [showParticles, setShowParticles] = useState(false);

    const winStyle = useAnimatedStyle(() => ({
        transform: [{ scale: winPulse.value }],
    }));

    useEffect(() => {
        if (uiMode !== 'wrapped') return;
        onEvent?.({ type: 'status', status: 'playing' });
        onEvent?.({ type: 'metrics', patch: { score: 0, level: 1, progressToNext: 0, lives: 0 } });
    }, [onEvent, uiMode]);

    const generateSymbolsForOutcome = (label: string) => {
        if (label === '777 Jackpot') return ['7️⃣', '7️⃣', '7️⃣'];
        if (label === 'Triple Diamond') return ['💎', '💎', '💎'];
        if (label === 'Fruit Match') {
            const fruit = ['🍒', '🍋', '🍇'][Math.floor(Math.random() * 3)];
            return [fruit, fruit, fruit];
        }
        if (label === 'Any Pair') {
            const pair = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            const other = SYMBOLS.filter(s => s !== pair)[Math.floor(Math.random() * (SYMBOLS.length - 1))];
            return [pair, pair, other].sort(() => Math.random() - 0.5);
        }
        // No Win
        const shuffled = [...SYMBOLS].sort(() => Math.random() - 0.5);
        return [shuffled[0], shuffled[1], shuffled[2]];
    };

    const spin = async () => {
        if (spinning) return;
        
        try {
            setSpinning(true);
            setWinMessage('');
            setShowParticles(false);
            winPulse.value = 1;

            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

            const serverResult = await playGame('slots');

            // Map server outcome to the visual reels
            const newResults = generateSymbolsForOutcome(serverResult.outcome.label);

            setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 2000);
            setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 2200);
            setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 2400);

            setTimeout(() => {
                setResults(newResults);
                setSpinning(false);
                handleGameEnd(serverResult);
            }, 2500);
        } catch (error: any) {
            setSpinning(false);
            setWinMessage(error.message || 'Error');
        }
    };

    const handleGameEnd = (serverResult: any) => {
        const winAmount = serverResult.prizePoints;
        const label = serverResult.outcome.label;
        
        if (winAmount > 0) {
            setWinMessage(`¡${label}! (+${winAmount})`);
            
            setShowParticles(true);
            winPulse.value = withRepeat(withTiming(1.2, { duration: 300 }), 4, true);
            
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
            setWinMessage('Sigue intentando');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }

        if (onGameEnd) onGameEnd(winAmount);
        onEvent?.({ type: 'currencyDelta', delta: winAmount, currency: 'points', reason: 'slots_spin' });
        onEnd?.({
            gameId,
            family,
            score: 0,
            currencyDelta: { currency: 'points', delta: winAmount },
            finalMetrics: { score: 0, level: 1, progressToNext: 0, lives: 0 },
            reason: 'slots_spin',
        });
    };

    return (
        <ScrollView 
            style={[styles.container, uiMode === 'wrapped' && theme && { backgroundColor: theme.colors.bg }]}
            contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}
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
                    <TouchableOpacity onPress={() => addPoints(100, 'Test Points', { source: 'manual' })} style={{ marginLeft: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: isDark ? '#fff' : '#000' }}>+100</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.hudCost}>
                    <Text style={[styles.hudTextMuted, theme && { color: theme.colors.textMuted }]}>
                        Costo: {SPIN_COST} pts
                    </Text>
                </View>
            </View>

            <View style={styles.machine}>
                {showParticles && Array.from({ length: 15 }).map((_, i) => (
                    <Particle key={i} emoji={['💰', '✨', '🎉', '💎'][i % 4]} />
                ))}
                
                <View style={styles.reelsRow}>
                    <Reel spinning={spinning} stopSymbol={results[0]} delay={0} />
                    <Reel spinning={spinning} stopSymbol={results[1]} delay={200} />
                    <Reel spinning={spinning} stopSymbol={results[2]} delay={400} />
                </View>
                <View style={[styles.payline, theme && { backgroundColor: theme.colors.danger }]} />
            </View>

            <Animated.View style={[styles.winBox, winStyle]}>
                <Text style={[styles.winText, { color: theme ? theme.colors.accent : (isDark ? '#F59E0B' : '#D97706') }]}>
                    {winMessage}
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
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
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
    machine: {
        backgroundColor: isDark ? '#111827' : '#E5E7EB',
        borderRadius: 24,
        padding: 16,
        borderWidth: 4,
        borderColor: isDark ? '#374151' : '#D1D5DB',
        marginBottom: 32,
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    reelsRow: {
        flexDirection: 'row',
        gap: 8,
        backgroundColor: isDark ? '#000' : '#fff',
        padding: 8,
        borderRadius: 12,
        overflow: 'hidden',
    },
    reelContainer: {
        width: 80,
        height: REEL_HEIGHT,
        backgroundColor: isDark ? '#1F2937' : '#F9FAFB',
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
    },
    reelContent: {
        alignItems: 'center',
    },
    symbolContainer: {
        height: SYMBOL_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
    },
    symbol: {
        fontSize: 48,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.05)',
    },
    payline: {
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: 'rgba(239, 68, 68, 0.5)',
        zIndex: 10,
    },
    winBox: {
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 32,
    },
    winText: {
        fontSize: 20,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    spinBtn: {
        backgroundColor: '#3B82F6',
        paddingVertical: 16,
        paddingHorizontal: 48,
        borderRadius: 999,
        overflow: 'hidden',
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    disabledBtn: {
        opacity: 0.5,
    },
    spinText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: 2,
        textAlign: 'center',
        position: 'relative',
        zIndex: 2,
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
