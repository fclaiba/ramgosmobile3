import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Brand } from '../../theme/brand';
import { Radius, Touch, colors } from '../../theme/tokens';
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

export const Button = ({ onPress, children, style, variant = 'default', size = 'default', disabled = false, isLoading = false }: ButtonProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const handlePress = () => {
        if (!disabled && !isLoading) {
            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            if (onPress) onPress();
        }
    };
    
    return (
    <TouchableOpacity
        onPress={handlePress}
        style={[
            styles.button,
            variant === 'ghost' && styles.ghost,
            variant === 'outline' && styles.outline,
            variant === 'glass' && styles.glass,
            size === 'sm' && styles.sizeSm,
            size === 'lg' && styles.sizeLg,
            size === 'icon' && styles.sizeIcon,
            (disabled || isLoading) && styles.disabled,
            style,
        ]}
        activeOpacity={(disabled || isLoading) ? 1 : 0.7}
        disabled={disabled || isLoading}
    >
        {isLoading ? (
            <ActivityIndicator
                color={variant === 'default' ? '#fff' : Brand.primary}
                size="small"
            />
        ) : (
            React.Children.map(children, (child) => {
                if (typeof child === 'string' || typeof child === 'number') {
                    return (
                        <Text
                            style={[
                                styles.text,
                                variant === 'ghost' && styles.ghostText,
                                variant === 'outline' && styles.outlineText,
                                variant === 'glass' && styles.glassText,
                                size === 'sm' && styles.textSm,
                                size === 'lg' && styles.textLg,
                                disabled && styles.disabledText,
                            ]}
                        >
                            {child}
                        </Text>
                    );
                }
                return child;
            })
        )}
    </TouchableOpacity>
    );
};

const getStyles = (isDark: any) => {
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
        shadowColor: Brand.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
        elevation: 4,
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
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.primaryMuted,
        shadowOpacity: 0,
        elevation: 0,
    },
    glass: {
        backgroundColor: c.glass,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.glassBorder,
        shadowColor: Brand.primary,
        shadowOpacity: 0.1,
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
    outlineText: { color: c.primarySoft },
    glassText: { color: isDark ? c.text : Brand.primary },
    disabled: { opacity: 0.55 },
    disabledText: { color: 'rgba(255,255,255,0.7)' },
});
};
