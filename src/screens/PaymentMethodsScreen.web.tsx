import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AlertCircle, ArrowLeft } from 'lucide-react-native';

export default function PaymentMethodsScreen({ navigation }: any) {
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft color="#1F2937" size={24} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Métodos de Pago</Text>
            </View>
            <View style={styles.content}>
                <AlertCircle size={64} color="#F59E0B" />
                <Text style={styles.title}>Pagos en Mantenimiento</Text>
                <Text style={styles.subtitle}>
                    Estamos renovando el sistema de pagos. Pronto podrás gestionar tus tarjetas y billeteras aquí.
                </Text>
                <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
                    <Text style={styles.buttonText}>Volver</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    backButton: { marginRight: 16 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    title: { fontSize: 24, fontWeight: 'bold', color: '#1F2937', marginTop: 24, marginBottom: 12, textAlign: 'center' },
    subtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 32, lineHeight: 24 },
    button: { backgroundColor: '#7C3AED', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
