import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useResponsive } from '../hooks/useResponsive';
import { useTheme } from '../contexts/ThemeContext';
import { atmosphere, colors } from '../theme/tokens';

interface ResponsiveLayoutProps {
    children: React.ReactNode;
    sidebar?: React.ReactNode;
    style?: ViewStyle | ViewStyle[];
    contentContainerStyle?: ViewStyle | ViewStyle[];
}

export function ResponsiveLayout({ children, sidebar, style, contentContainerStyle }: ResponsiveLayoutProps) {
    const { isDesktop, isTablet, maxContainerWidth } = useResponsive();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const showSidebar = sidebar && isDesktop;

    return (
        <View style={[styles.container, { backgroundColor: c.bg }, style]}>
            <LinearGradient
                colors={atmosphere(isDark)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            {showSidebar ? <View style={styles.sidebarContainer}>{sidebar}</View> : null}
            <View style={styles.contentWrapper}>
                <View
                    style={[
                        styles.mainContent,
                        { maxWidth: isDesktop || isTablet ? maxContainerWidth : '100%' },
                        contentContainerStyle,
                    ]}
                >
                    {children}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, flexDirection: 'row', width: '100%', height: '100%' },
    sidebarContainer: { flexShrink: 0, zIndex: 10 },
    contentWrapper: { flex: 1, alignItems: 'center', width: '100%' },
    mainContent: { flex: 1, width: '100%' },
});
