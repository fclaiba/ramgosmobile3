import React, { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Home, ShoppingBag, Users, LayoutDashboard, MapPin } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type NavSection = 'home' | 'marketplace' | 'social' | 'dashboard';

export const NAV_CONTENT_HEIGHT = 65; // Height of the nav content excluding safe area

interface MobileNavProps {
    activeSection: NavSection;
    onSectionChange: (section: NavSection) => void;
}

const navItems: { id: NavSection; icon: any; label: string }[] = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'marketplace', icon: ShoppingBag, label: 'Tienda' },
    { id: 'social', icon: Users, label: 'Social' },
];

const NavItem = ({ item, isActive, onPress, isDark, styles }: { item: any, isActive: boolean, onPress: () => void, isDark: boolean, styles: any }) => {
    // Icon animation only (color/scale)
    const activeColor = '#007AFF';
    const inactiveColor = isDark ? '#9CA3AF' : '#999999';

    // We can still subtly animate the icon scale
    const scale = useSharedValue(1);
    useEffect(() => {
        scale.value = withSpring(isActive ? 1.1 : 1, { damping: 15 });
    }, [isActive]);

    const iconWrapperStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }]
    }));

    const Icon = item.icon;

    return (
        <TouchableOpacity
            onPress={onPress}
            style={styles.navItem}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
            <Animated.View style={[styles.iconWrapper, iconWrapperStyle]}>
                <Icon
                    size={24}
                    color={isActive ? activeColor : inactiveColor}
                    strokeWidth={isActive ? 2.5 : 2}
                />
            </Animated.View>
            <Text style={[styles.label, isActive && styles.activeLabel, { color: isActive ? activeColor : inactiveColor }]}>
                {item.label}
            </Text>
        </TouchableOpacity>
    );
};

export function MobileNav({ activeSection, onSectionChange }: MobileNavProps) {
    const { user, isAuthenticated } = useAuth();
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
        <View style={[
            styles.container,
            {
                backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : Math.max(insets.bottom, 10)
            }
        ]}>
            <View style={[styles.borderTop, { backgroundColor: isDark ? '#374151' : '#E5E5E5' }]} />

            <View style={styles.navContent}>
                {allItems.map((item) => (
                    <NavItem
                        key={item.id}
                        item={item}
                        isActive={activeSection === item.id}
                        onPress={() => onSectionChange(item.id as NavSection)}
                        isDark={isDark}
                        styles={styles}
                    />
                ))}
            </View>
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        shadowColor: isDark ? '#F9FAFB' : '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
        zIndex: 1000,
    },
    borderTop: {
        height: 1,
        opacity: 0.2,
        marginBottom: 8,
    },
    navContent: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingHorizontal: 12,
        height: NAV_CONTENT_HEIGHT,
        width: '100%',
    },
    navItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
    },
    iconWrapper: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 20,
        marginBottom: 4,
    },
    label: {
        fontSize: 10,
        fontWeight: '500',
        marginTop: 2,
    },
    activeLabel: {
        fontWeight: '700',
    },
});
