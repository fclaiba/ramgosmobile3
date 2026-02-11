import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

type ButtonVariant = 'default' | 'ghost' | 'outline';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

interface ButtonProps {
    onPress?: () => void;
    children: React.ReactNode;
    style?: any;
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
}

export const Button = ({ onPress, children, style, variant = 'default', size = 'default', disabled = false }: ButtonProps) => (
    <TouchableOpacity
        onPress={disabled ? undefined : onPress}
        style={[
            styles.button,
            variant === 'ghost' && styles.ghost,
            variant === 'outline' && styles.outline,
            size === 'sm' && styles.sizeSm,
            size === 'lg' && styles.sizeLg,
            size === 'icon' && styles.sizeIcon,
            disabled && styles.disabled,
            style,
        ]}
        activeOpacity={disabled ? 1 : 0.7}
        disabled={disabled}
    >
        {React.Children.map(children, (child) => {
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
        })}
    </TouchableOpacity>
);

const styles = StyleSheet.create({
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
        color: 'white',
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
