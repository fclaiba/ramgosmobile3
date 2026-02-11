import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

type BadgeVariant = 'default' | 'secondary' | 'outline';

type Props = {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
    className?: string;
    variant?: BadgeVariant;
    color?: string; // background override (used a lot in screens)
    textColor?: string; // text override
};

export const Badge = ({
    children,
    style,
    textStyle,
    className,
    variant = 'default',
    color,
    textColor,
}: Props) => {

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    // Minimal "className" support for legacy usages.
    let bg = isDark ? 'rgba(55, 65, 81, 0.9)' : '#E5E7EB';
    let fg = isDark ? '#F9FAFB' : '#111827';
    let borderColor: string | undefined;

    if (variant === 'secondary') {
        bg = isDark ? 'rgba(124, 58, 237, 0.28)' : 'rgba(124, 58, 237, 0.12)';
        fg = isDark ? '#E9D5FF' : '#5B21B6';
    }

    if (variant === 'outline') {
        bg = 'transparent';
        fg = isDark ? '#D1D5DB' : '#6B7280';
        borderColor = isDark ? 'rgba(209, 213, 219, 0.25)' : 'rgba(107, 114, 128, 0.35)';
    }

    if (className?.includes('bg-red')) {
        bg = '#EF4444';
        fg = '#FFF';
    }
    if (className?.includes('bg-green')) {
        bg = '#10B981';
        fg = '#FFF';
    }
    if (className?.includes('bg-blue')) {
        bg = '#3B82F6';
        fg = '#FFF';
    }
    if (className?.includes('bg-pink')) {
        bg = '#EC4899';
        fg = '#FFF';
    }
    if (className?.includes('bg-orange')) {
        bg = '#F97316';
        fg = '#FFF';
    }
    if (className?.includes('bg-violet')) {
        bg = '#7C3AED';
        fg = '#FFF';
    }

    if (color) {
        bg = color;
        // default high-contrast for custom bg
        fg = '#FFF';
    }

    if (textColor) {
        fg = textColor;
    }

    const contentIsPrimitive = typeof children === 'string' || typeof children === 'number';
    return (
        <View style={[styles.badge, { backgroundColor: bg, borderColor }, style]}>
            {React.Children.map(children, (child) => {
                if (typeof child === 'string' || typeof child === 'number') {
                    return <Text style={[styles.text, { color: fg }, textStyle]}>{child}</Text>;
                }
                return child;
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        alignSelf: 'flex-start',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    text: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.2,
    }
});
