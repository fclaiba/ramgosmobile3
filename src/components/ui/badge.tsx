import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius, Type } from '../../theme/tokens';
import { Brand } from '../../theme/brand';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger' | 'info' | 'glass';

type Props = {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
    /** @deprecated Use `variant` instead */
    className?: string;
    variant?: BadgeVariant;
    color?: string;
    textColor?: string;
};

const VARIANT_TOKENS = (isDark: boolean) => {
    const c = colors(isDark);
    return {
        default: { bg: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)', fg: c.text, border: 'transparent' },
        secondary: { bg: c.primaryMuted, fg: isDark ? Brand.primarySoft : Brand.primary, border: 'transparent' },
        outline: { bg: 'transparent', fg: c.textMuted, border: c.border },
        success: { bg: c.successMuted, fg: Brand.success, border: isDark ? 'rgba(16,185,129,0.30)' : 'rgba(16,185,129,0.20)' },
        warning: { bg: c.warningMuted, fg: Brand.warning, border: isDark ? 'rgba(245,158,11,0.30)' : 'rgba(245,158,11,0.20)' },
        danger: { bg: c.dangerMuted, fg: Brand.danger, border: isDark ? 'rgba(239,68,68,0.30)' : 'rgba(239,68,68,0.20)' },
        info: { bg: c.primaryMuted, fg: Brand.primary, border: isDark ? 'rgba(33,150,243,0.30)' : 'rgba(33,150,243,0.20)' },
        glass: { bg: c.surface2, fg: c.text, border: c.glassBorder },
    };
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
    const tokens = VARIANT_TOKENS(isDark);

    let { bg, fg, border: borderColor } = tokens[variant];

    // Legacy className compat (deprecated — prefer variant prop)
    if (className) {
        if (className.includes('bg-red')) { bg = Brand.danger; fg = '#FFF'; }
        else if (className.includes('bg-green')) { bg = Brand.success; fg = '#FFF'; }
        else if (className.includes('bg-blue')) { bg = Brand.primary; fg = '#FFF'; }
        else if (className.includes('bg-pink')) { bg = '#EC4899'; fg = '#FFF'; }
        else if (className.includes('bg-orange')) { bg = '#F97316'; fg = '#FFF'; }
        else if (className.includes('bg-violet')) { bg = Brand.primary; fg = '#FFF'; }
    }

    if (color) { bg = color; fg = '#FFF'; }
    if (textColor) { fg = textColor; }

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
        borderRadius: Radius.full,
        alignSelf: 'flex-start',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        borderWidth: StyleSheet.hairlineWidth,
        gap: 4,
    },
    text: {
        ...Type.caption,
        fontWeight: '700',
    },
});
