import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { GlassSurface } from './GlassSurface';

export const Card = ({ children, style }: any) => {
    return (
        <GlassSurface intensity="regular" style={[styles.card, style]}>
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
    return (
        <Text style={[styles.title, { color: isDark ? '#F9FAFB' : '#111827' }, style]}>{children}</Text>
    );
};

export const CardFooter = ({ children, style }: any) => {
    return <View style={[styles.footer, style]}>{children}</View>;
};

const styles = StyleSheet.create({
    card: { width: '100%' },
    content: { padding: 16 },
    header: { padding: 16, paddingBottom: 0 },
    title: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
    footer: { padding: 16, paddingTop: 0 },
});
