import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Coins, RotateCcw, DollarSign } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, withRepeat, cancelAnimation } from 'react-native-reanimated';
import type { GameAdapterProps, GameEndSummary, GameEvent } from './gameContracts';

const SYMBOLS = ['🍒', '🍋', '🍇', '💎', '7️⃣', '🔔'];
const SYMBOL_HEIGHT = 80;
const REEL_HEIGHT = 200;

const Reel = ({ spinning, stopSymbol, delay }: { spinning: boolean, stopSymbol: string, delay: number }) => {
    const offset = useSharedValue(0);

    useEffect(() => {
        if (spinning) {
            offset.value = withRepeat(
                withTiming(-SYMBOL_HEIGHT * SYMBOLS.length, { duration: 500, easing: Easing.linear }),
                -1,
                false
            );
        } else {
            // Stop at specific symbol
            cancelAnimation(offset);
            const index = SYMBOLS.indexOf(stopSymbol);
            offset.value = withTiming(-index * SYMBOL_HEIGHT, { duration: 800 + delay, easing: Easing.out(Easing.bounce) });
        }
    }, [spinning, stopSymbol]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateY: offset.value % (SYMBOL_HEIGHT * SYMBOLS.length) }]
        };
    });

    return (
        <View style={styles.reelContainer}>
            <Animated.View style={[styles.reelContent, animatedStyle]}>
                {[...SYMBOLS, ...SYMBOLS, ...SYMBOLS].map((s, i) => (
                    <View key={i} style={styles.symbolContainer}>
                        <Text style={styles.symbol}>{s}</Text>
                    </View>
                ))}
            </Animated.View>
            <View style={styles.overlay} />
        </View>
    );
};

interface SlotMachineProps {
    coins: number;
    onCoinsChange?: (coins: number) => void;
    onClose: () => void;
    onGameEnd?: (score: number) => void;
    // Wrapper integration (optional)
    uiMode?: 'standalone' | 'wrapped';
    onEvent?: (event: GameEvent) => void;
    onEnd?: (summary: GameEndSummary) => void;
    gameId?: GameAdapterProps['gameId'];
    family?: GameAdapterProps['family'];
}

export const SlotMachine = (props: SlotMachineProps) => {
    const {
        coins,
        onCoinsChange,
        onClose,
        onGameEnd,
        uiMode = 'standalone',
        onEvent,
        onEnd,
        gameId = 'slots',
        family = 'casino',
    } = props;
    const [spinning, setSpinning] = useState(false);
    const [results, setResults] = useState(['7️⃣', '7️⃣', '7️⃣']);
    const [winMessage, setWinMessage] = useState('');

    useEffect(() => {
        if (uiMode !== 'wrapped') return;
        onEvent?.({ type: 'status', status: 'playing' });
        onEvent?.({ type: 'metrics', patch: { score: 0, level: 1, progressToNext: 0, lives: 0 } });
    }, [onEvent, uiMode]);

    const spin = () => {
        if (spinning) return;
        setSpinning(true);
        setWinMessage('');

        const newResults = [
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
        ];

        setTimeout(() => {
            setResults(newResults);
            setSpinning(false);
            checkWin(newResults);
        }, 2000);
    };

    const checkWin = (res: string[]) => {
        let winAmount = 0;
        if (res[0] === res[1] && res[1] === res[2]) {
            setWinMessage('¡JACKPOT! 🎉 (+500)');
            winAmount = 500;
        } else if (res[0] === res[1] || res[1] === res[2] || res[0] === res[2]) {
            setWinMessage('¡Par! (+50)');
            winAmount = 50;
        } else {
            setWinMessage('Sigue intentando');
            winAmount = -10; // cost to play?
        }

        onCoinsChange?.(Math.max(0, coins + winAmount));
        if (onGameEnd) onGameEnd(winAmount);
        onEvent?.({ type: 'currencyDelta', delta: winAmount, currency: 'coins', reason: 'slots_spin' });
        onEnd?.({
            gameId,
            family,
            score: 0,
            currencyDelta: { currency: 'coins', delta: winAmount },
            finalMetrics: { score: 0, level: 1, progressToNext: 0, lives: 0 },
            reason: 'slots_spin',
        });
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>SLOTS</Text>
            </View>

            <View style={styles.machine}>
                <View style={styles.reelsRow}>
                    <Reel spinning={spinning} stopSymbol={results[0]} delay={0} />
                    <Reel spinning={spinning} stopSymbol={results[1]} delay={200} />
                    <Reel spinning={spinning} stopSymbol={results[2]} delay={400} />
                </View>
                <View style={styles.payline} />
            </View>

            <TouchableOpacity
                style={[styles.spinBtn, spinning && styles.disabledBtn]}
                onPress={spin}
                disabled={spinning}
            >
                <Text style={styles.spinText}>{spinning ? 'GIRANDO...' : 'GIRAR'}</Text>
            </TouchableOpacity>

            {winMessage ? (
                <View style={styles.winBox}>
                    <Text style={styles.winText}>{winMessage}</Text>
                </View>
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    header: {
        backgroundColor: '#1F2937',
        padding: 10,
        borderRadius: 12,
        marginBottom: 24,
        position: 'relative',
        width: '80%',
        alignItems: 'center',
    },
    machine: {
        backgroundColor: '#1F2937',
        padding: 10,
        borderRadius: 12,
        marginBottom: 24,
        position: 'relative',
    },
    reelsRow: {
        flexDirection: 'row',
        gap: 4,
        backgroundColor: '#fff',
        borderRadius: 8,
        overflow: 'hidden',
        height: REEL_HEIGHT,
    },
    reelContainer: {
        width: 80,
        height: REEL_HEIGHT,
        overflow: 'hidden',
        backgroundColor: '#fff',
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
        fontSize: 40,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.1)',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    payline: {
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: 'red',
        opacity: 0.5,
        zIndex: 10,
    },
    spinBtn: {
        backgroundColor: '#3B82F6',
        paddingHorizontal: 48,
        paddingVertical: 16,
        borderRadius: 32,
        elevation: 3,
    },
    disabledBtn: {
        opacity: 0.7,
    },
    spinText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 18,
    },
    winBox: {
        marginTop: 16,
        padding: 8,
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
        minHeight: 40,
    },
    winText: {
        color: '#1F2937',
        fontSize: 18,
        fontWeight: 'bold',
    },
    title: {
        fontSize: 24,
        fontWeight: '900',
        color: '#F59E0B',
        textAlign: 'center',
        letterSpacing: 4,
    },
});
