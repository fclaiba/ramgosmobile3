import React, { useCallback } from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius, Type, Space, Motion } from '../../theme/tokens';
import { Brand } from '../../theme/brand';
import { pressConfig } from '../../utils/glass';

interface GlassChipProps {
    label: string;
    icon?: React.ReactNode;
    color?: string;
    onPress?: () => void;
    selected?: boolean;
    disabled?: boolean;
    style?: any;
}

/**
 * Glass chip / pill — used for filters, categories, tags.
 * Has glass background with brand-tinted border when selected.
 */
export function GlassChip({
    label,
    icon,
    color = Brand.primary,
    onPress,
    selected = false,
    disabled = false,
    style,
}: GlassChipProps) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePressIn = useCallback(() => {
        scale.value = withSpring(pressConfig.scale, pressConfig.spring);
    }, [scale]);

    const handlePressOut = useCallback(() => {
        scale.value = withSpring(1, pressConfig.spring);
    }, [scale]);

    const chipBg = selected
        ? isDark ? `${color}22` : `${color}14`
        : c.surface1;
    const chipBorder = selected
        ? isDark ? `${color}55` : `${color}44`
        : c.glassBorder;
    const textColor = selected
        ? isDark ? Brand.primarySoft : color
        : c.textMuted;

    return (
        <Animated.View style={animatedStyle}>
            <TouchableOpacity
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={disabled}
                activeOpacity={0.75}
                style={[
                    styles.chip,
                    {
                        backgroundColor: chipBg,
                        borderColor: chipBorder,
                    },
                    disabled && styles.disabled,
                    Platform.OS === 'web' && selected
                        ? ({
                              backdropFilter: 'blur(8px)',
                              WebkitBackdropFilter: 'blur(8px)',
                          } as any)
                        : {},
                    style,
                ]}
            >
                {icon && <View style={styles.icon}>{icon}</View>}
                <Text style={[styles.label, { color: textColor }]}>
                    {label}
                </Text>
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: Radius.full,
        borderWidth: StyleSheet.hairlineWidth,
    },
    icon: {
        width: 16,
        height: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        ...Type.bodySm,
        fontWeight: '600',
    },
    disabled: {
        opacity: 0.5,
    },
});
