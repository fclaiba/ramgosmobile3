import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { AlertTriangle, Upload, Camera } from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { useMarketplace } from '../../contexts/MarketplaceContext';

export default function DisputeReasonScreen({ route, navigation }: any) {
    const { orderId } = route.params;
    const { initiateDispute } = useMarketplace();

    const [reason, setReason] = useState<any | null>(null);
    const [description, setDescription] = useState('');

    const reasons = [
        { id: 'not_received', label: 'No recibí el producto', icon: '📦' },
        { id: 'damaged', label: 'El producto llegó dañado', icon: '💔' },
        { id: 'not_as_described', label: 'No es lo que pedí', icon: '🤔' },
    ];

    const handleSubmit = () => {
        if (!reason || !description) {
            Alert.alert('Error', 'Por favor selecciona un motivo y describe el problema.');
            return;
        }

        const result = initiateDispute(orderId, {
            reason,
            description,
            evidences: [] // Mock: would include uploaded URLs
        });

        if (result.success) {
            Alert.alert(
                'Reclamo Iniciado',
                'El vendedor ha sido notificado. Tienen 3 días para responder.',
                [{
                    text: 'Ir al Chat',
                    onPress: () => {
                        // Replace stack to avoid back-nav loop
                        navigation.replace('DisputeChat', { orderId });
                    }
                }]
            );
        } else {
            Alert.alert('Error', 'No se pudo iniciar el reclamo.');
        }
    };

    return (
        <View style={styles.container}>
            <MobileHeader title="Reportar Problema" showBack onBack={() => navigation.goBack()} />

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <View style={styles.header}>
                    <AlertTriangle size={32} color="#EF4444" />
                    <Text style={styles.title}>¿Qué salió mal?</Text>
                    <Text style={styles.subtitle}>Iniciaremos un proceso de mediación con el vendedor.</Text>
                </View>

                {/* Reasons */}
                <Text style={styles.label}>Motivo del reclamo</Text>
                <View style={styles.reasonsContainer}>
                    {reasons.map((r) => (
                        <TouchableOpacity
                            key={r.id}
                            style={[styles.reasonCard, reason === r.id && styles.reasonActive]}
                            onPress={() => setReason(r.id)}
                        >
                            <Text style={{ fontSize: 24 }}>{r.icon}</Text>
                            <Text style={[styles.reasonText, reason === r.id && styles.textActive]}>{r.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Evidence Mock */}
                <Text style={styles.label}>Evidencia (Fotos/Video)</Text>
                <TouchableOpacity style={styles.uploadBtn}>
                    <Camera size={24} color="#6B7280" />
                    <Text style={styles.uploadText}>Cargar Fotos</Text>
                </TouchableOpacity>

                {/* Description */}
                <Text style={styles.label}>Describe el problema</Text>
                <TextInput
                    style={styles.textArea}
                    placeholder="Explica detalladamente lo sucedido..."
                    multiline
                    numberOfLines={6}
                    value={description}
                    onChangeText={setDescription}
                />

                <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
                    <Text style={styles.submitBtnText}>Enviar Reclamo</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { alignItems: 'center', marginBottom: 24, marginTop: 8 },
    title: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', marginTop: 12 },
    subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 4, paddingHorizontal: 32 },

    label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 16 },

    reasonsContainer: { gap: 8 },
    reasonCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12, gap: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    reasonActive: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
    reasonText: { fontSize: 16, color: '#374151' },
    textActive: { color: '#B91C1C', fontWeight: '500' },

    uploadBtn: { height: 80, backgroundColor: '#E5E7EB', borderRadius: 12, borderStyle: 'dashed', borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    uploadText: { marginTop: 8, color: '#6B7280' },

    textArea: { backgroundColor: '#fff', borderRadius: 12, padding: 12, height: 120, textAlignVertical: 'top', borderWidth: 1, borderColor: '#E5E7EB' },

    submitBtn: { backgroundColor: '#EF4444', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 32 },
    submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
