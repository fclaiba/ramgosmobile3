/**
 * PaymentMethodsScreen — Web fallback.
 * The native Stripe SDK is not available on web, so we show a friendly
 * message directing users to the mobile app.
 */

import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { CreditCard } from 'lucide-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { useTheme } from '../contexts/ThemeContext';

export default function PaymentMethodsScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    return (
        <View style={[styles.container, isDark && styles.containerDark]}>
            <MobileHeader
                title="Métodos de pago"
                subtitle="Gestiona tus tarjetas guardadas"
                backButton
                onBack={() => navigation.goBack()}
            />

            <View style={styles.body}>
                <View style={[styles.iconBox, isDark && styles.iconBoxDark]}>
                    <CreditCard size={48} color={isDark ? '#6B7280' : '#9CA3AF'} />
                </View>
                <Text style={[styles.title, isDark && styles.titleDark]}>
                    No disponible en web
                </Text>
                <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
                    La gestión de tarjetas utiliza el SDK nativo de Stripe y solo está disponible en la app móvil.
                </Text>
                <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.backBtnText}>Volver</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const getStyles = (isDark: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    containerDark: { backgroundColor: '#111827' },
    body: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        gap: 12,
    },
    iconBox: {
        width: 80,
        height: 80,
        borderRadius: 20,
        backgroundColor: isDark ? '#1F2937' : '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    iconBoxDark: { backgroundColor: '#1F2937' },
    title: { fontSize: 18, fontWeight: '700', color: '#111827' },
    titleDark: { color: isDark ? '#1F2937' : '#F3F4F6' },
    subtitle: {
        fontSize: 14,
        color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280',
        textAlign: 'center',
        lineHeight: 20,
    },
    subtitleDark: { color: isDark ? '#6B7280' : '#9CA3AF' },
    backBtn: {
        marginTop: 16,
        backgroundColor: '#7C3AED',
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 12,
    },
    backBtnText: { color: isDark ? '#1F2937' : '#fff', fontWeight: '700', fontSize: 15 },
});
