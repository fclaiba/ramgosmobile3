import React, { useCallback } from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ActivityIndicator,
    Platform,
    View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { Brand } from '../../theme/brand';
import { Radius, Touch, colors, Motion } from '../../theme/tokens';
import { pressConfig } from '../../utils/glass';
import * as Haptics from 'expo-haptics';

type ButtonVariant = 'default' | 'ghost' | 'outline' | 'glass';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

interface ButtonProps {
    onPress?: () => void;
    children: React.ReactNode;
    style?: any;
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    isLoading?: boolean;
}

export const Button = ({
    onPress,
    children,
    style,
    variant = 'default',
    size = 'default',
    disabled = false,
    isLoading = false,
}: ButtonProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const s = getStyles(isDark);
    const c = colors(isDark);

    // Spring press animation
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePressIn = useCallback(() => {
        if (!disabled && !isLoading) {
            scale.value = withSpring(pressConfig.scale, pressConfig.spring);
        }
    }, [disabled, isLoading, scale]);

    const handlePressOut = useCallback(() => {
        scale.value = withSpring(1, pressConfig.spring);
    }, [scale]);

    const handlePress = () => {
        if (!disabled && !isLoading) {
            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            if (onPress) onPress();
        }
    };

    const renderChildren = () => {
        if (isLoading) {
            return (
                <ActivityIndicator
                    color={variant === 'default' ? '#fff' : Brand.primary}
                    size="small"
                />
            );
        }
        return React.Children.map(children, (child) => {
            if (typeof child === 'string' || typeof child === 'number') {
                return (
                    <Text
                        style={[
                            s.text,
                            variant === 'ghost' && s.ghostText,
                            variant === 'outline' && s.outlineText,
                            variant === 'glass' && s.glassText,
                            size === 'sm' && s.textSm,
                            size === 'lg' && s.textLg,
                            disabled && s.disabledText,
                        ]}
                    >
                        {child}
                    </Text>
                );
            }
            return child;
        });
    };

    const buttonContent = (
        <TouchableOpacity
            onPress={handlePress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[
                s.button,
                variant === 'ghost' && s.ghost,
                variant === 'outline' && s.outline,
                variant === 'glass' && s.glass,
                size === 'sm' && s.sizeSm,
                size === 'lg' && s.sizeLg,
                size === 'icon' && s.sizeIcon,
                (disabled || isLoading) && s.disabled,
                // Don't apply shadow/gradient styles to the touchable for 'default' — handled by gradient
                variant === 'default' && { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
                style,
            ]}
            activeOpacity={disabled || isLoading ? 1 : 0.85}
            disabled={disabled || isLoading}
        >
            {variant === 'default' ? (
                <LinearGradient
                    colors={Brand.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                        s.gradientFill,
                        size === 'sm' && { borderRadius: Radius.md },
                        size === 'lg' && { borderRadius: Radius.xl },
                        size === 'icon' && { borderRadius: Radius.full },
                    ]}
                >
                    {/* Specular rim on top */}
                    <LinearGradient
                        colors={['rgba(255,255,255,0.25)', 'transparent']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={s.specularRim}
                    />
                    {renderChildren()}
                </LinearGradient>
            ) : (
                renderChildren()
            )}
        </TouchableOpacity>
    );

    return (
        <Animated.View style={animatedStyle}>
            {buttonContent}
        </Animated.View>
    );
};

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        button: {
            paddingVertical: 12,
            paddingHorizontal: 18,
            minHeight: Touch.min,
            backgroundColor: Brand.primary,
            borderRadius: Radius.lg,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            // Brand glow shadow for default
            shadowColor: Brand.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.28,
            shadowRadius: 12,
            elevation: 4,
        },
        gradientFill: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: Radius.lg,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            paddingVertical: 12,
            paddingHorizontal: 18,
        },
        specularRim: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            borderTopLeftRadius: Radius.lg,
            borderTopRightRadius: Radius.lg,
        },
        sizeSm: {
            paddingVertical: 8,
            paddingHorizontal: 12,
            minHeight: 36,
            borderRadius: Radius.md,
        },
        sizeLg: {
            paddingVertical: 16,
            paddingHorizontal: 24,
            borderRadius: Radius.xl,
        },
        sizeIcon: {
            padding: 8,
            width: Touch.min,
            height: Touch.min,
            borderRadius: Radius.full,
        },
        ghost: {
            backgroundColor: 'transparent',
            shadowOpacity: 0,
            elevation: 0,
        },
        outline: {
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderColor: isDark ? 'rgba(33,150,243,0.35)' : 'rgba(33,150,243,0.30)',
            shadowOpacity: 0,
            elevation: 0,
        },
        glass: {
            backgroundColor: c.surface2,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
            shadowColor: Brand.primary,
            shadowOpacity: 0.08,
            shadowRadius: 8,
            elevation: 2,
            ...(Platform.OS === 'web'
                ? ({
                      backdropFilter: 'blur(16px) saturate(1.3)',
                      WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
                  } as any)
                : {}),
        },
        text: {
            color: '#fff',
            fontWeight: '700',
            fontSize: 14,
            letterSpacing: -0.1,
        },
        textSm: { fontSize: 12 },
        textLg: { fontSize: 16 },
        ghostText: { color: Brand.primary },
        outlineText: { color: isDark ? Brand.primarySoft : Brand.primary },
        glassText: { color: isDark ? c.text : Brand.primary, fontWeight: '600' },
        disabled: { opacity: 0.50 },
        disabledText: { color: 'rgba(255,255,255,0.65)' },
    });
};
