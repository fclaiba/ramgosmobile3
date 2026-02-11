import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { GameAdapterProps, GameEndSummary, GameEvent } from './gameContracts';
import { useRewards } from '../../contexts/RewardsContext';

const WHEEL_SIZE = 300;

interface RouletteGameProps {
    onClose: () => void;
    // Wrapper integration (optional)
    uiMode?: 'standalone' | 'wrapped';
    onEvent?: (event: GameEvent) => void;
    onEnd?: (summary: GameEndSummary) => void;
    gameId?: GameAdapterProps['gameId'];
    family?: GameAdapterProps['family'];
}

export const RouletteGame = (props: RouletteGameProps) => {
    const {
        onClose,
        uiMode = 'standalone',
        onEvent,
        onEnd,
        gameId = 'roulette',
        family = 'casino',
    } = props;
    const { spinLuckyWheel, getLuckyWheelStatus } = useRewards();
    const [spinning, setSpinning] = useState(false);
    const [result, setResult] = useState<number | null>(null);
    const rotation = useSharedValue(0);

    useEffect(() => {
        if (uiMode !== 'wrapped') return;
        onEvent?.({ type: 'status', status: 'playing' });
        onEvent?.({ type: 'metrics', patch: { score: 0, level: 1, progressToNext: 0, lives: 0 } });
    }, [onEvent, uiMode]);

    const spin = () => {
        if (spinning) return;
        const status = getLuckyWheelStatus();
        if (!status.available) return;

        setSpinning(true);
        setResult(null);

        const randomSpin = Math.random() * 360 + 1800;

        rotation.value = withTiming(randomSpin, {
            duration: 4000,
            easing: Easing.out(Easing.cubic),
        }, (finished?: boolean) => {
            if (finished) {
                runOnJS(handleResult)();
            }
        });
    };

    const handleResult = () => {
        setSpinning(false);
        const outcome = spinLuckyWheel();
        if (outcome.status !== 'awarded') {
            onEvent?.({ type: 'status', status: 'start' });
            return;
        }

        const pts = outcome.pointsAwarded ?? 0;
        setResult(pts);

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
        <View style={styles.container}>
            <View style={styles.wheelContainer}>
                {/* Pointer */}
                <View style={styles.pointer} />

                {/* Wheel */}
                <Animated.View style={[styles.wheel, animatedStyle]}>
                    <View style={styles.centerKnob} />
                </Animated.View>
            </View>

            <TouchableOpacity
                style={[styles.spinBtn, (spinning || !getLuckyWheelStatus().available) && styles.disabledBtn]}
                onPress={spin}
                disabled={spinning || !getLuckyWheelStatus().available}
            >
                <Text style={styles.spinText}>{spinning ? 'GIRANDO...' : 'GIRAR'}</Text>
            </TouchableOpacity>

            {result !== null && (
                <View style={styles.resultBox}>
                    <Text style={styles.resultLabel}>Resultado:</Text>
                    <Text style={styles.resultValue}>+{result} pts</Text>
                </View>
            )}
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
    wheelContainer: {
        width: WHEEL_SIZE,
        height: WHEEL_SIZE,
        marginBottom: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    wheel: {
        width: '100%',
        height: '100%',
        borderRadius: WHEEL_SIZE / 2,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#f3f4f6',
    },
    centerKnob: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 40,
        height: 40,
        marginLeft: -20,
        marginTop: -20,
        borderRadius: 20,
        backgroundColor: '#fff',
        elevation: 5,
    },
    pointer: {
        position: 'absolute',
        top: -10,
        zIndex: 10,
        width: 0,
        height: 0,
        borderLeftWidth: 10,
        borderRightWidth: 10,
        borderTopWidth: 20,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: '#000',
    },
    spinBtn: {
        backgroundColor: '#EF4444',
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
    resultBox: {
        marginTop: 24,
        alignItems: 'center',
        height: 60,
    },
    resultLabel: {
        color: '#6B7280',
        fontSize: 14,
    },
    resultValue: {
        color: '#1F2937',
        fontSize: 24,
        fontWeight: 'bold',
    },
});
