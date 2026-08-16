import React, { useCallback } from 'react';
import { TouchableOpacity, StyleSheet, View, Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    interpolateColor,
    withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius, Motion } from '../../theme/tokens';
import { Brand } from '../../theme/brand';

interface GlassToggleProps {
    value: boolean;
    onValueChange: (value: boolean) => void;
    disabled?: boolean;
    style?: any;
}

const TRACK_W = 52;
const TRACK_H = 30;
const KNOB_SIZE = 24;
const KNOB_MARGIN = 3;
const TRAVEL = TRACK_W - KNOB_SIZE - KNOB_MARGIN * 2;

/**
 * Toggle switch with glass knob and brand glow when active.
 * Spring-animated slide with smooth color transition.
 */
export function GlassToggle({ value, onValueChange, disabled = false, style }: GlassToggleProps) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    const progress = useSharedValue(value ? 1 : 0);

    React.useEffect(() => {
        progress.value = withSpring(value ? 1 : 0, Motion.layoutSpring);
    }, [value, progress]);

    const trackStyle = useAnimatedStyle(() => {
        const bgOff = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
        const bgOn = isDark ? Brand.primaryGlow : 'rgba(33,150,243,0.20)';
        // Manual interpolation since interpolateColor needs worklet arrays
        const bg = progress.value > 0.5 ? bgOn : bgOff;
        const borderC = progress.value > 0.5
            ? (isDark ? 'rgba(33,150,243,0.40)' : 'rgba(33,150,243,0.30)')
            : c.glassBorder;
        return {
            backgroundColor: bg,
            borderColor: borderC,
        };
    });

    const knobStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: progress.value * TRAVEL },
        ],
    }));

    const knobGlow = useAnimatedStyle(() => ({
        shadowOpacity: progress.value * 0.35,
    }));

    const toggle = useCallback(() => {
        if (!disabled) {
            onValueChange(!value);
        }
    }, [disabled, value, onValueChange]);

    return (
        <TouchableOpacity
            onPress={toggle}
            activeOpacity={0.8}
            disabled={disabled}
            style={[disabled && styles.disabled, style]}
            accessibilityRole="switch"
            accessibilityState={{ checked: value }}
        >
            <Animated.View style={[styles.track, trackStyle]}>
                <Animated.View style={[
                    styles.knob,
                    {
                        backgroundColor: isDark ? '#FAFAFA' : '#FFFFFF',
                        shadowColor: value ? Brand.primary : '#000',
                    },
                    knobStyle,
                    knobGlow,
                ]}>
                    {/* Specular highlight on knob */}
                    <View style={[
                        styles.knobSpecular,
                        { backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.65)' },
                    ]} />
                </Animated.View>
            </Animated.View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    track: {
        width: TRACK_W,
        height: TRACK_H,
        borderRadius: TRACK_H / 2,
        borderWidth: StyleSheet.hairlineWidth,
        justifyContent: 'center',
        paddingHorizontal: KNOB_MARGIN,
    },
    knob: {
        width: KNOB_SIZE,
        height: KNOB_SIZE,
        borderRadius: KNOB_SIZE / 2,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 6,
        elevation: 3,
        overflow: 'hidden',
    },
    knobSpecular: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: KNOB_SIZE * 0.4,
        borderTopLeftRadius: KNOB_SIZE / 2,
        borderTopRightRadius: KNOB_SIZE / 2,
    },
    disabled: {
        opacity: 0.5,
    },
});
