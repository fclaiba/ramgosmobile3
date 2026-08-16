import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { atmosphere, colors } from '../../theme/tokens';

type AmbientMode = 'neutral' | 'brand' | 'warm';

type Props = {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    /** Ambient gradient variation */
    ambient?: AmbientMode;
};

const AMBIENT_OVERRIDES: Record<AmbientMode, { dark: [string, string, string, string]; light: [string, string, string, string] }> = {
    neutral: {
        dark: ['#050506', '#08070E', '#0A0910', '#050506'],
        light: ['#F8F9FA', '#F5F3FA', '#F0F4FE', '#F8F9FA'],
    },
    brand: {
        dark: ['#050506', '#060A14', '#080E18', '#050506'],
        light: ['#F8F9FA', '#EEF2FF', '#E8F0FE', '#F8F9FA'],
    },
    warm: {
        dark: ['#050506', '#0A0908', '#0E0C08', '#050506'],
        light: ['#F8F9FA', '#FDF8F3', '#FEF3E8', '#F8F9FA'],
    },
};

/** Neutral canvas + whisper brand atmosphere. 4-stop gradient for richer depth. */
export function GlassScreen({ children, style, ambient = 'neutral' }: Props) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const grad = AMBIENT_OVERRIDES[ambient][isDark ? 'dark' : 'light'];

    return (
        <View style={[styles.root, { backgroundColor: c.bg }, style]}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
            <LinearGradient
                colors={grad}
                locations={[0, 0.35, 0.65, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <View style={styles.content}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: { flex: 1 },
});
