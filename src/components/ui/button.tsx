import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import * as Haptics from 'expo-haptics';

type ButtonVariant = 'default' | 'ghost' | 'outline';
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
            <ActivityIndicator color={variant === 'default' ? '#fff' : '#007AFF'} size="small" />
        ) : (
            React.Children.map(children, (child) => {
                if (typeof child === 'string' || typeof child === 'number') {
                    return (
                        <Text
                            style={[
                                styles.text,
                                variant === 'ghost' && styles.ghostText,
                                variant === 'outline' && styles.outlineText,
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

const getStyles = (isDark: any) => StyleSheet.create({
    button: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        backgroundColor: '#007AFF',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    sizeSm: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
    },
    sizeLg: {
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 10,
    },
    sizeIcon: {
        padding: 8,
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    ghost: {
        backgroundColor: 'transparent',
    },
    outline: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#111827',
    },
    text: {
        color: isDark ? '#1F2937' : 'white',
        fontWeight: '600',
        fontSize: 14,
    },
    textSm: {
        fontSize: 12,
    },
    textLg: {
        fontSize: 16,
    },
    ghostText: {
        color: '#007AFF',
    },
    outlineText: {
        color: '#111827',
    },
    disabled: {
        opacity: 0.6,
    },
    disabledText: {
        color: 'rgba(255,255,255,0.7)',
    },
});
