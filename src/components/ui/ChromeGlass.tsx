import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { chromeFrost } from '../../utils/glass';

type Edge = 'top' | 'bottom';

type Props = {
    /** Which edge gets the specular highlight (nav = top edge, header = bottom edge). */
    edge?: Edge;
};

/**
 * Shared Liquid Glass layer for app chrome (MobileHeader / MobileNav).
 *
 * Stack (back → front):
 * 1. Blur of content scrolling underneath
 * 2. Neutral frost veil (readable text, no purple wash)
 * 3. Soft specular highlight on the facing edge
 */
export function ChromeGlass({ edge = 'top' }: Props) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const t = chromeFrost(isDark);

    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
            {Platform.OS === 'web' ? (
                <View
                    style={[
                        StyleSheet.absoluteFillObject,
                        {
                            backgroundColor: t.frost,
                            // @ts-expect-error web CSS
                            backdropFilter: `blur(${t.blurWebPx}px) saturate(1.35)`,
                            WebkitBackdropFilter: `blur(${t.blurWebPx}px) saturate(1.35)`,
                        },
                    ]}
                />
            ) : (
                <>
                    <BlurView
                        intensity={t.blurNative}
                        tint={t.tint}
                        style={StyleSheet.absoluteFillObject}
                    />
                    <View
                        style={[
                            StyleSheet.absoluteFillObject,
                            { backgroundColor: t.frost },
                        ]}
                    />
                </>
            )}

            {/* Specular rim — reads as glass catching light */}
            {edge === 'top' ? (
                <LinearGradient
                    colors={[t.specular, 'transparent']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.specularTop}
                />
            ) : (
                <LinearGradient
                    colors={['transparent', t.specular]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.specularBottom}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    specularTop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 14,
    },
    specularBottom: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 10,
    },
});
