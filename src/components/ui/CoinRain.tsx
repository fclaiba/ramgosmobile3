import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withDelay,
    Easing,
    cancelAnimation
} from 'react-native-reanimated';
import { Coins } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';

const { width, height } = Dimensions.get('window');
const COIN_COUNT = 15;
const DEFAULT_DURATION_MS = 1700;

interface CoinProps {
    delay: number;
    startX: number;
}

const Coin = ({ delay, startX }: CoinProps) => {
    const translateY = useSharedValue(-50);
    const opacity = useSharedValue(0);

    useEffect(() => {
        translateY.value = withDelay(delay, withTiming(height, { duration: 1500, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }));
        opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));

        // Setup cleanup implicitly by logic or parent unmount
    }, []);

    const style = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }, { translateX: startX }],
        opacity: opacity.value,
        position: 'absolute',
        top: 0,
        left: 0,
    }));

    return (
        <Animated.View style={style}>
            <Coins size={24} color="#F59E0B" fill="#FCD34D" />
        </Animated.View>
    );
};

export const CoinRain = () => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    return null;
};

export const TriggeredCoinRain = ({ triggerKey, durationMs = DEFAULT_DURATION_MS }: { triggerKey: string | number | null; durationMs?: number }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (triggerKey === null) return;
        setVisible(true);
        const timer = setTimeout(() => setVisible(false), durationMs);
        return () => clearTimeout(timer);
    }, [durationMs, triggerKey]);

    const coins = useMemo(() => {
        if (triggerKey === null) return [];
        return Array.from({ length: COIN_COUNT }).map((_, i) => ({
            id: `${triggerKey}_${i}`,
            startX: Math.random() * width,
            delay: Math.random() * 500,
        }));
    }, [triggerKey]);

    if (!visible) return null;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {coins.map((coin) => (
                <Coin key={coin.id} delay={coin.delay} startX={coin.startX} />
            ))}
        </View>
    );
};
