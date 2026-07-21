import React from 'react';
import { View, StyleSheet, Platform, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../contexts/ThemeContext';
import { glassTokens, GlassIntensity } from '../../utils/glass';

type Props = {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    intensity?: GlassIntensity;
    /** Interactive glass — slightly stronger border / press feel via opacity */
    interactive?: boolean;
};

/**
 * Liquid Glass container. Prefer this over opaque cards for elevated UX.
 * Brand tint lives in glassTokens (Ramgos violet).
 */
export function GlassSurface({ children, style, intensity = 'regular', interactive }: Props) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const t = glassTokens(isDark, intensity);

    return (
        <View
            style={[
                styles.wrap,
                {
                    borderRadius: t.radius,
                    borderColor: t.border,
                    ...t.shadow,
                },
                interactive && styles.interactive,
                style,
            ]}
        >
            {Platform.OS === 'web' ? (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }, t.backdrop]} />
            ) : (
                <>
                    <BlurView
                        intensity={t.blur}
                        tint={isDark ? 'dark' : 'light'}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]} />
                </>
            )}
            <View style={styles.content}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        backgroundColor: 'transparent',
    },
    interactive: {
        borderColor: 'rgba(33, 150, 243,0.35)',
    },
    content: {
        position: 'relative',
        zIndex: 1,
    },
});
