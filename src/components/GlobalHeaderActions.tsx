import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { ShoppingCart, MessageCircle } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';
import { useUnreadMessages } from '../hooks/useMessaging';
import { Radius, colors } from '../theme/tokens';

interface Props {
    children?: React.ReactNode;
}

export function GlobalHeaderActions({ children }: Props) {
    const { user } = useAuth();
    const navigation = useNavigation<any>();
    const { openCart, items: cartItems } = useCart();
    const { unreadCount } = useUnreadMessages();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    const handlePressMessage = () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate(user ? 'Inbox' : 'Login');
    };

    const handlePressCart = () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        openCart();
    };

    const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

    return (
        <View style={styles.container}>
            {children}
            
            <TouchableOpacity 
                style={[styles.iconBtn, { backgroundColor: c.surface1, borderColor: c.glassBorder }]} 
                onPress={handlePressMessage}
                accessibilityLabel="Mensajes"
            >
                <MessageCircle size={20} color={isDark ? '#D1D5DB' : '#374151'} />
                {unreadCount > 0 && (
                    <View style={[styles.badge, { borderColor: c.bg }]}>
                        <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                )}
            </TouchableOpacity>

            <TouchableOpacity 
                style={[styles.iconBtn, { backgroundColor: c.surface1, borderColor: c.glassBorder }]} 
                onPress={handlePressCart}
                accessibilityLabel="Carrito de compras"
            >
                <ShoppingCart size={20} color={isDark ? '#D1D5DB' : '#374151'} />
                {cartCount > 0 && (
                    <View style={[styles.badge, { borderColor: c.bg }]}>
                        <Text style={styles.badgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
                    </View>
                )}
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { 
        flexDirection: 'row', 
        gap: 8, 
        alignItems: 'center' 
    },
    iconBtn: {
        width: 36,
        height: 36,
        borderRadius: Radius.lg,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
    },
    badge: {
        position: 'absolute',
        top: -6,
        right: -6,
        minWidth: 18,
        height: 18,
        paddingHorizontal: 4,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#EF4444',
        borderWidth: 2, 
    },
    badgeText: { 
        color: '#fff', 
        fontSize: 10, 
        fontWeight: '800' 
    },
});
