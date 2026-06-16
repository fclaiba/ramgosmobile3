import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';
import { useTheme } from '../contexts/ThemeContext';

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

    const showSidebar = sidebar && isDesktop;

    return (
        <View style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }, style]}>
            {showSidebar && (
                <View style={styles.sidebarContainer}>
                    {sidebar}
                </View>
            )}
            <View style={styles.contentWrapper}>
                <View style={[
                    styles.mainContent,
                    { maxWidth: isDesktop || isTablet ? maxContainerWidth : '100%' },
                    contentContainerStyle
                ]}>
                    {children}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexDirection: 'row',
        width: '100%',
        height: '100%',
    },
    sidebarContainer: {
        flexShrink: 0,
        zIndex: 10,
    },
    contentWrapper: {
        flex: 1,
        alignItems: 'center', // Centers the main content horizontally
        width: '100%',
    },
    mainContent: {
        flex: 1,
        width: '100%',
    },
});
