import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { atmosphere, colors } from '../../theme/tokens';

type Props = {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
};

/** Neutral canvas + whisper brand atmosphere (not purple wallpaper). */
export function GlassScreen({ children, style }: Props) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    return (
        <View style={[styles.root, { backgroundColor: c.bg }, style]}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
            <LinearGradient
                colors={atmosphere(isDark)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.content}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: { flex: 1 },
});
