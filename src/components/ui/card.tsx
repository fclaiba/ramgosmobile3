import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { GlassSurface } from './GlassSurface';
import { colors, Radius, Type, Space } from '../../theme/tokens';
import type { GlassIntensity } from '../../utils/glass';

type CardVariant = 'default' | 'elevated' | 'inset';

const VARIANT_MAP: Record<CardVariant, { intensity: GlassIntensity; elevation: 1 | 2 | 3 }> = {
    default: { intensity: 'regular', elevation: 2 },
    elevated: { intensity: 'prominent', elevation: 3 },
    inset: { intensity: 'subtle', elevation: 1 },
};

export const Card = ({ children, style, variant = 'default' }: { children: React.ReactNode; style?: any; variant?: CardVariant }) => {
    const { intensity, elevation } = VARIANT_MAP[variant];
    return (
        <GlassSurface intensity={intensity} elevation={elevation} style={[styles.card, style]}>
            {children}
        </GlassSurface>
    );
};

export const CardContent = ({ children, style }: any) => {
    return <View style={[styles.content, style]}>{children}</View>;
};

export const CardHeader = ({ children, style }: any) => {
    return <View style={[styles.header, style]}>{children}</View>;
};

export const CardTitle = ({ children, style }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    return (
        <Text style={[styles.title, { color: c.text }, style]}>{children}</Text>
    );
};

export const CardDescription = ({ children, style }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    return (
        <Text style={[styles.description, { color: c.textMuted }, style]}>{children}</Text>
    );
};

export const CardFooter = ({ children, style }: any) => {
    return <View style={[styles.footer, style]}>{children}</View>;
};

const styles = StyleSheet.create({
    card: { width: '100%' },
    content: { padding: Space[4] },
    header: { padding: Space[4], paddingBottom: Space[2] },
    title: { ...Type.title },
    description: { ...Type.bodySm, marginTop: Space[1] },
    footer: { padding: Space[4], paddingTop: Space[2] },
});
