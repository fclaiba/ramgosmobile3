import React, { useCallback } from 'react';
import { View, StyleSheet, Platform, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { glassTokens, specularGradient, pressConfig, GlassIntensity } from '../../utils/glass';

type Props = {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    intensity?: GlassIntensity;
    /** Interactive glass — brand inner glow + animated press */
    interactive?: boolean;
    /** Visual elevation tier (1 = subtle, 2 = default, 3 = prominent) */
    elevation?: 1 | 2 | 3;
    /** Show specular rim highlight */
    specular?: boolean;
    /** Enable press animation (auto-enabled when interactive) */
    pressable?: boolean;
    /** Press callback (if pressable) */
    onPress?: () => void;
};

const INTENSITY_FOR_ELEVATION: Record<1 | 2 | 3, GlassIntensity> = {
    1: 'subtle',
    2: 'regular',
    3: 'prominent',
};

/**
 * Liquid Glass container — the fundamental glass surface.
 *
 * Stack (back → front):
 * 1. Blur of content behind
 * 2. Semi-transparent fill (surface tier)
 * 3. Specular rim highlight (top edge)
 * 4. Brand inner glow (interactive only)
 * 5. Content
 */
export function GlassSurface({
    children,
    style,
    intensity,
    interactive,
    elevation,
    specular: showSpecular = true,
    pressable,
    onPress,
}: Props) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    // Resolve intensity: explicit > elevation-derived > default
    const resolvedIntensity =
        intensity ?? (elevation ? INTENSITY_FOR_ELEVATION[elevation] : 'regular');

    const t = glassTokens(isDark, resolvedIntensity);
    const spec = specularGradient(isDark, resolvedIntensity);

    // Press animation
    const scale = useSharedValue(1);
    const shouldAnimate = pressable || interactive;

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePressIn = useCallback(() => {
        if (shouldAnimate) {
            scale.value = withSpring(pressConfig.scale, pressConfig.spring);
        }
    }, [shouldAnimate, scale]);

    const handlePressOut = useCallback(() => {
        if (shouldAnimate) {
            scale.value = withSpring(1, pressConfig.spring);
        }
    }, [shouldAnimate, scale]);

    const content = (
        <View
            style={[
                styles.wrap,
                {
                    borderRadius: t.radius,
                    borderColor: interactive ? t.innerGlowActive : t.border,
                    ...t.shadow,
                },
                style,
            ]}
        >
            {/* Layer 1: Blur */}
            {Platform.OS === 'web' ? (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }, t.backdrop]} />
            ) : (
                <>
                    <BlurView
                        intensity={t.blur}
                        tint={isDark ? 'dark' : 'light'}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]} />
                </>
            )}

            {/* Layer 2: Specular rim highlight */}
            {showSpecular && (
                <LinearGradient
                    colors={spec.colors}
                    start={spec.start}
                    end={spec.end}
                    style={[styles.specular, { height: spec.height }]}
                />
            )}

            {/* Layer 3: Interactive inner glow */}
            {interactive && (
                <View
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: t.innerGlow },
                    ]}
                />
            )}

            {/* Layer 4: Content */}
            <View style={styles.content}>{children}</View>
        </View>
    );

    if (shouldAnimate) {
        return (
            <Animated.View
                style={animatedStyle}
                onTouchStart={handlePressIn}
                onTouchEnd={handlePressOut}
                onTouchCancel={handlePressOut}
            >
                {content}
            </Animated.View>
        );
    }

    return content;
}

const styles = StyleSheet.create({
    wrap: {
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        backgroundColor: 'transparent',
    },
    specular: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 0,
    },
    content: {
        position: 'relative',
        zIndex: 1,
    },
});
