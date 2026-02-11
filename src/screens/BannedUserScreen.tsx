import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { XCircle, Mail, ExternalLink } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

export default function BannedUserScreen() {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const handleContactSupport = () => {
        Linking.openURL('mailto:soporte@ramgos.com?subject=Revisión de Cuenta Suspendida');
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <View style={styles.iconWrapper}>
                    <XCircle size={80} color="#EF4444" />
                </View>

                <Text style={styles.title}>Cuenta Suspendida</Text>

                <View style={styles.messageBox}>
                    <Text style={styles.subtitle}>
                        Hemos detectado actividad inusual que infringe nuestros Términos de Servicio.
                    </Text>
                    <Text style={styles.reasonLabel}>Motivo:</Text>
                    <Text style={styles.reasonText}>Violación de políticas de seguridad (Código #B-103)</Text>
                </View>

                <TouchableOpacity style={styles.contactBtn} onPress={handleContactSupport}>
                    <Mail size={20} color="#fff" />
                    <Text style={styles.contactBtnText}>Contactar Soporte</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.termsLink} onPress={() => Linking.openURL('https://ramgos.com/terms')}>
                    <Text style={styles.termsText}>Leer Términos y Condiciones</Text>
                    <ExternalLink size={14} color="#7C3AED" />
                </TouchableOpacity>
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>ID de Caso: {Math.random().toString(36).substring(7).toUpperCase()}</Text>
            </View>
        </SafeAreaView>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#1F2937' : '#FEF2F2' },
    content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

    iconWrapper: {
        marginBottom: 24,
        shadowColor: '#EF4444',
        shadowOpacity: 0.3,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 }
    },
    title: { fontSize: 28, fontWeight: 'bold', color: '#EF4444', marginBottom: 16 },

    messageBox: {
        backgroundColor: isDark ? '#374151' : '#fff',
        padding: 24,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 10,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: isDark ? '#4B5563' : 'transparent',
    },
    subtitle: { fontSize: 16, color: isDark ? '#D1D5DB' : '#4B5563', textAlign: 'center', marginBottom: 24, lineHeight: 24 },
    reasonLabel: { fontSize: 13, fontWeight: '600', color: '#EF4444', marginBottom: 4, textTransform: 'uppercase' },
    reasonText: { fontSize: 15, fontWeight: '500', color: isDark ? '#F9FAFB' : '#1F2937' },

    contactBtn: {
        flexDirection: 'row',
        backgroundColor: isDark ? '#111827' : '#111827',
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 12,
        alignItems: 'center',
        gap: 8,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 10,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : 'transparent',
    },
    contactBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

    termsLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    termsText: { color: '#7C3AED', fontWeight: '500' },

    footer: { padding: 16, alignItems: 'center' },
    footerText: { fontSize: 12, color: isDark ? '#9CA3AF' : '#9CA3AF' }
});
