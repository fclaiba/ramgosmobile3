import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { Home, ShoppingBag, Users, LayoutDashboard, Settings, LogOut, MapPin } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, colors } from '../theme/tokens';


export type NavSection = 'home' | 'marketplace' | 'social' | 'dashboard';

interface DesktopSidebarProps {
    activeSection: NavSection;
    onSectionChange: (section: NavSection) => void;
}

const navItems: { id: NavSection; icon: any; label: string }[] = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'marketplace', icon: ShoppingBag, label: 'Tienda' },
    { id: 'social', icon: Users, label: 'Social' },
];

export function DesktopSidebar({ activeSection, onSectionChange }: DesktopSidebarProps) {
    const { user, isAuthenticated, logout } = useAuth();
    const { colorScheme } = useTheme();
    const insets = useSafeAreaInsets();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const showDashboard = isAuthenticated && user && ['influencer', 'business', 'admin'].includes(user.role);

    const allItems = useMemo(() => {
        const items = [...navItems];
        if (showDashboard) {
            items.push({ id: 'dashboard', icon: LayoutDashboard, label: 'Panel' });
        }
        return items;
    }, [showDashboard]);

    return (
        <View style={[styles.container, { paddingTop: Math.max(insets.top, 24) }]}>
            {/* Logo / Brand */}
            <View style={styles.brandContainer}>
                <Image source={require('../../logo.png')} style={styles.logo} resizeMode="contain" />
            </View>

            {/* Navigation Links */}
            <View style={styles.navContent}>
                {allItems.map((item) => {
                    const isActive = activeSection === item.id;
                    const Icon = item.icon;
                    const activeColor = '#3B82F6';
                    const inactiveColor = isDark ? '#9CA3AF' : '#6B7280';

                    return (
                        <TouchableOpacity
                            key={item.id}
                            onPress={() => onSectionChange(item.id as NavSection)}
                            style={[styles.navItem, isActive && styles.activeNavItem]}
                            activeOpacity={0.7}
                        >
                            <Icon
                                size={24}
                                color={isActive ? activeColor : inactiveColor}
                                strokeWidth={isActive ? 2.5 : 2}
                            />
                            <Text style={[styles.label, isActive && styles.activeLabel, { color: isActive ? activeColor : inactiveColor }]}>
                                {item.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Bottom Actions (User Profile / Logout) */}
            <View style={styles.bottomContent}>
                {isAuthenticated ? (
                    <TouchableOpacity style={styles.actionItem} onPress={() => logout()}>
                        <LogOut size={20} color={isDark ? '#EF4444' : '#DC2626'} />
                        <Text style={[styles.actionLabel, { color: isDark ? '#EF4444' : '#DC2626' }]}>Cerrar Sesión</Text>
                    </TouchableOpacity>
                ) : null}
            </View>
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        width: '100%', maxWidth: 250,
        height: '100%',
        backgroundColor: colors(isDark).bg,
        borderRightWidth: 1,
        borderRightColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    brandContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 40,
        paddingHorizontal: 8,
    },
    logo: {
        width: 160,
        height: 44,
        marginRight: 12,
    },
    brandText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors(isDark).text,
    },
    navContent: {
        flex: 1,
    },
    navItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: Radius.md,
        marginBottom: 8,
    },
    activeNavItem: {
        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
    },
    label: {
        fontSize: 16,
        fontWeight: '500',
        marginLeft: 16,
    },
    activeLabel: {
        fontWeight: '700',
    },
    bottomContent: {
        borderTopWidth: 1,
        borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
        paddingTop: 16,
    },
    actionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: Radius.md,
    },
    actionLabel: {
        fontSize: 16,
        fontWeight: '500',
        marginLeft: 16,
    },
});
