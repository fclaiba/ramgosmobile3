import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Vibration } from 'react-native';
import { Coins, RotateCcw, DollarSign, X } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, withRepeat, cancelAnimation } from 'react-native-reanimated';

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
            transform: [{ translateY: offset.value % (SYMBOL_HEIGHT * SYMBOLS.length) }] // Simple loop visual hack or direct value
            // To do infinite scrolling properly requires duplicating items. 
            // For this simpler version, we just animate to the target when stopping.
            // Let's rely on the `else` block to snap to position. 
            // While spinning, we might see jump if not handled perfectly, but sufficient for simple demo.
        };
    });

    return (
        <View style={styles.reelContainer}>
            <Animated.View style={[styles.reelContent, animatedStyle]}>
                {/* Render multipel sets for illusion of infinity if needed, but for now just one set repeated */}
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
}

export const SlotMachine = ({ coins, onCoinsChange, onClose, onGameEnd }: SlotMachineProps) => {
    const [spinning, setSpinning] = useState(false);
    const [results, setResults] = useState(['7️⃣', '7️⃣', '7️⃣']);
    const [winMessage, setWinMessage] = useState('');

    const spin = () => {
        if (spinning) return;
        setSpinning(true);
        setWinMessage('');

        // Decide result upfront
        const newResults = [
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
        ];

        // Force win for demo occasionally? No, pure random.

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
            Vibration.vibrate([0, 100, 50, 100, 50, 200]);
            winAmount = 500;
        } else if (res[0] === res[1] || res[1] === res[2] || res[0] === res[2]) {
            setWinMessage('¡Par! (+50)');
            Vibration.vibrate([0, 50, 50, 50]);
            winAmount = 50;
        } else {
            setWinMessage('Sigue intentando');
            winAmount = -10; // cost to play?
        }

        onCoinsChange?.(Math.max(0, coins + winAmount));
        if (onGameEnd) onGameEnd(winAmount);
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <X size={24} color="#9CA3AF" />
            </TouchableOpacity>

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
                    <TouchableOpacity onPress={onClose} style={{ marginTop: 8 }}>
                        <Text style={{ color: '#3B82F6' }}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        width: '100%',
        position: 'relative',
    },
    closeBtn: {
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 10,
        padding: 5,
    },
    header: {
        backgroundColor: '#1F2937',
        padding: 10,
        borderRadius: 12,
        marginBottom: 24,
        position: 'relative',
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
