import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Home, ShoppingBag, Users, LayoutDashboard } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';

export type NavSection = 'home' | 'marketplace' | 'social' | 'dashboard';

interface MobileNavProps {
    activeSection: NavSection;
    onSectionChange: (section: NavSection) => void;
}

const navItems = [
    { id: 'home' as const, icon: Home, label: 'Home' },
    { id: 'marketplace' as const, icon: ShoppingBag, label: 'Tienda' },
    { id: 'social' as const, icon: Users, label: 'Social' },
];

export function MobileNav({ activeSection, onSectionChange }: MobileNavProps) {
    const { user, isAuthenticated } = useAuth();

    // Mock logic for dashboard visibility
    const showDashboard = isAuthenticated && user && ['influencer', 'business', 'admin'].includes(user.role);

    return (
        <View style={styles.container}>
            {/* Top Border Line simulated */}
            <View style={styles.borderTop} />

            <View style={styles.navContent}>
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;

                    return (
                        <TouchableOpacity
                            key={item.id}
                            onPress={() => onSectionChange(item.id)}
                            style={styles.navItem}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.iconContainer, isActive && styles.activeIconContainer]}>
                                <Icon
                                    size={24}
                                    color={isActive ? '#007AFF' : '#999999'}
                                    strokeWidth={isActive ? 2.5 : 2}
                                />
                            </View>
                            <Text style={[styles.label, isActive && styles.activeLabel]}>
                                {item.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}

                {showDashboard && (
                    <TouchableOpacity
                        onPress={() => onSectionChange('dashboard')}
                        style={styles.navItem}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.iconContainer, activeSection === 'dashboard' && styles.activeIconContainer]}>
                            <LayoutDashboard
                                size={24}
                                color={activeSection === 'dashboard' ? '#007AFF' : '#999999'}
                                strokeWidth={activeSection === 'dashboard' ? 2.5 : 2}
                            />
                        </View>
                        <Text style={[styles.label, activeSection === 'dashboard' && styles.activeLabel]}>
                            Panel
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)', // bg-card/95 backdrop-blur equivalent (simplified)
        paddingBottom: Platform.OS === 'ios' ? 20 : 10,
        width: '100%',
        position: 'absolute',
        bottom: 0,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    borderTop: {
        height: 1,
        backgroundColor: '#E5E5E5',
        width: '100%',
    },
    navContent: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingTop: 10,
        paddingHorizontal: 10,
    },
    navItem: {
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 60,
    },
    iconContainer: {
        padding: 8,
        borderRadius: 16,
        marginBottom: 4,
        backgroundColor: 'transparent',
    },
    activeIconContainer: {
        backgroundColor: 'rgba(0, 122, 255, 0.1)', // primary/10
    },
    label: {
        fontSize: 11,
        fontWeight: '500',
        color: '#999999',
    },
    activeLabel: {
        color: '#007AFF',
        fontWeight: '600',
    },
});
