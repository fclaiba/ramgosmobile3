import React, { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Home, ShoppingBag, Users, LayoutDashboard, MessageCircle } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Brand } from '../theme/brand';
import { colors, Radius, Touch, Motion, Elevation } from '../theme/tokens';
import { ChromeGlass } from './ui/ChromeGlass';
import { useUnreadMessages } from '../hooks/useMessaging';


// 'messages' no es una pestaña: `HomeScreen` lo intercepta y navega a la
// bandeja. Va acá para que el ítem viva en la misma barra que el resto.
export type NavSection = 'home' | 'marketplace' | 'social' | 'messages' | 'dashboard';

export const NAV_CONTENT_HEIGHT = 65;

interface MobileNavProps {
    activeSection: NavSection;
    onSectionChange: (section: NavSection) => void;
}

const navItems: { id: NavSection; icon: any; label: string }[] = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'marketplace', icon: ShoppingBag, label: 'Tienda' },
    { id: 'social', icon: Users, label: 'Social' },
];

const NavItem = ({
    item,
    isActive,
    onPress,
    c,
    styles,
    isDark,
    badge = 0,
}: {
    item: any;
    isActive: boolean;
    onPress: () => void;
    c: ReturnType<typeof colors>;
    styles: any;
    isDark: boolean;
    badge?: number;
}) => {
    const activeColor = Brand.primary;
    const inactiveColor = c.textMuted;
    const scale = useSharedValue(1);
    useEffect(() => {
        scale.value = withSpring(isActive ? 1.08 : 1, { damping: 16 });
    }, [isActive, scale]);
    const iconWrapperStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    const Icon = item.icon;

    return (
        <TouchableOpacity
            onPress={onPress}
            style={styles.navItem}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={
                badge > 0 ? `${item.label}, ${badge} sin leer` : item.label
            }
        >
            <Animated.View style={[
                styles.iconWrapper,
                isActive && styles.iconWrapperActive,
                iconWrapperStyle,
            ]}>
                <Icon size={21} color={isActive ? activeColor : inactiveColor} strokeWidth={isActive ? 2.5 : 1.8} />
                {badge > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                    </View>
                )}
            </Animated.View>
            <Text
                style={[
                    styles.label,
                    { color: isActive ? activeColor : inactiveColor },
                    isActive && styles.activeLabel,
                ]}
            >
                {item.label}
            </Text>
            {/* Active dot indicator */}
            {isActive && (
                <View style={[styles.activeDot, { backgroundColor: activeColor }]} />
            )}
        </TouchableOpacity>
    );
};

export function MobileNav({ activeSection, onSectionChange }: MobileNavProps) {
    const { user, isAuthenticated } = useAuth();
    const { colorScheme } = useTheme();
    const insets = useSafeAreaInsets();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const styles = getStyles(isDark, c);

    // Contador global de mensajes sin leer. Antes sólo existía en el header
    // de Social: desde Inicio o Tienda no había ninguna señal de que había
    // llegado un mensaje, ni forma de llegar a la bandeja.
    const { unreadCount } = useUnreadMessages();

    const showDashboard =
        isAuthenticated && user && ['influencer', 'business', 'admin'].includes(user.role);
    const allItems = useMemo(() => {
        const items = [...navItems];
        if (showDashboard) items.push({ id: 'dashboard', icon: LayoutDashboard, label: 'Panel' });
        return items;
    }, [showDashboard]);

    return (
        <View
            style={[
                styles.container,
                {
                    paddingBottom:
                        Platform.OS === 'ios'
                            ? Math.max(insets.bottom, 16)
                            : Math.max(insets.bottom, 10),
                },
            ]}
            accessibilityRole="tablist"
        >
            <ChromeGlass edge="top" />
            <View style={[styles.hairline, { backgroundColor: c.chromeBorder }]} />
            <View style={styles.navContent}>
                {allItems.map((item) => (
                    <NavItem
                        key={item.id}
                        item={item}
                        isActive={activeSection === item.id}
                        onPress={() => onSectionChange(item.id as NavSection)}
                        c={c}
                        styles={styles}
                        isDark={isDark}
                        badge={item.id === 'messages' ? unreadCount : 0}
                    />
                ))}
            </View>
        </View>
    );
}

const getStyles = (isDark: boolean, c: ReturnType<typeof colors>) =>
    StyleSheet.create({
        container: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            borderTopLeftRadius: Radius['2xl'],
            borderTopRightRadius: Radius['2xl'],
            overflow: 'hidden',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: c.chromeBorder,
            backgroundColor: 'transparent',
            zIndex: 1000,
            ...Platform.select({
                web: { boxShadow: isDark ? '0 -10px 32px rgba(0,0,0,0.45)' : '0 -10px 32px rgba(5,5,6,0.08)' } as any,
                default: {
                    ...Elevation[3](isDark),
                },
            }),
        },
        hairline: { height: StyleSheet.hairlineWidth, opacity: 1 },
        badge: {
            position: 'absolute',
            top: -4,
            right: -8,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 4,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: Brand.primary,
        },
        badgeText: { fontSize: 9, fontWeight: '900', color: '#fff' },
        navContent: {
            flexDirection: 'row',
            justifyContent: 'space-around',
            alignItems: 'center',
            paddingHorizontal: 8,
            height: NAV_CONTENT_HEIGHT,
            width: '100%',
        },
        navItem: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: Touch.min,
            paddingVertical: 6,
        },
        iconWrapper: {
            width: 42,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: Radius.md,
            marginBottom: 2,
        },
        iconWrapperActive: {
            backgroundColor: c.primaryMuted,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isDark ? 'rgba(33,150,243,0.25)' : 'rgba(33,150,243,0.15)',
        },
        label: { fontSize: 11, fontWeight: '600', letterSpacing: -0.1 },
        activeLabel: { fontWeight: '800' },
        activeDot: {
            width: 4,
            height: 4,
            borderRadius: 2,
            marginTop: 3,
        },
    });
