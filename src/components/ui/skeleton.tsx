import * as React from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius } from '../../theme/tokens';

/**
 * Skeleton v2 — shimmer gradient sweep instead of opacity pulse.
 * Uses Reanimated for smooth 60fps animation.
 */
function Skeleton({
    ...props
}: React.ComponentPropsWithoutRef<typeof View>) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    const translateX = useSharedValue(-1);

    React.useEffect(() => {
        translateX.value = withRepeat(
            withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
            -1,  // infinite
            false, // don't reverse — loop
        );
    }, [translateX]);

    const shimmerStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: `${translateX.value * 100}%` as any }],
    }));

    const baseBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
    const shimmerColors = isDark
        ? ['transparent', 'rgba(255,255,255,0.06)', 'transparent']
        : ['transparent', 'rgba(255,255,255,0.60)', 'transparent'];

    return (
        <View
            style={[
                styles.skeleton,
                { backgroundColor: baseBg },
                props.style,
            ]}
            {...props}
        >
            <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
                <LinearGradient
                    colors={shimmerColors as [string, string, string]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>
        </View>
    )
}

const styles = StyleSheet.create({
    skeleton: {
        borderRadius: Radius.sm,
        overflow: 'hidden',
    },
})

export { Skeleton }
