import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Image } from 'react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { AlertTriangle, Upload, Camera, ShieldCheck } from 'lucide-react-native';
import { useMarketplace } from '../../contexts/MarketplaceContext';

const REASONS = [
    'Producto no recibido',
    'Producto defectuoso o dañado',
    'No coincide con la descripción',
    'Faltan partes o accesorios',
    'El producto es falso/réplica'
];

export default function DisputeScreen({ navigation, route }: any) {
    const { orderId } = route.params || { orderId: 'UNKNOWN' };
    const [reason, setReason] = useState('');
    const [description, setDescription] = useState('');
    const [evidence, setEvidence] = useState<string[]>([]);
    const { initiateDispute, orders } = useMarketplace();

    const reasonToCode: Record<string, 'not_received' | 'damaged' | 'not_as_described' | 'missing_parts' | 'counterfeit'> = {
        'Producto no recibido': 'not_received',
        'Producto defectuoso o dañado': 'damaged',
        'No coincide con la descripción': 'not_as_described',
        'Faltan partes o accesorios': 'missing_parts',
        'El producto es falso/réplica': 'counterfeit',
    };

    const order = orders.find((entry) => entry.id === orderId);
    const releaseDate = order?.escrow.releaseScheduledAt ? new Date(order.escrow.releaseScheduledAt) : null;
    const releaseLabel = releaseDate
        ? releaseDate.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        : 'Pendiente de confirmación';

    const handleSubmit = () => {
        if (!reason || !description) {
            Alert.alert('Error', 'Por favor selecciona un motivo y describe el problema.');
            return;
        }

        const code = reasonToCode[reason];
        if (!code) {
            Alert.alert('Motivo inválido', 'Selecciona un motivo válido para continuar.');
            return;
        }

        const disputeResult = initiateDispute(orderId, {
            reason: code,
            description,
            evidences: evidence.map((url, index) => ({
                type: 'photo',
                url,
                description: `Evidencia ${index + 1}`,
                uploadedBy: 'buyer',
            })),
        });

        if (!disputeResult.success) {
            Alert.alert('No fue posible abrir la disputa', disputeResult.error ?? 'Inténtalo nuevamente en unos minutos.');
            return;
        }

        Alert.alert(
            'Reclamo Iniciado',
            `Hemos detenido el pago al vendedor mientras revisamos la orden #${orderId}. Te notificaremos por correo con las novedades.`,
            [
                {
                    text: 'Ver historial',
                    onPress: () => navigation.navigate('History', { focusOrderId: orderId }),
                },
                { text: 'Cerrar', style: 'cancel', onPress: () => navigation.goBack() },
            ]
        );
    };

    return (
        <View style={styles.container}>
            <MobileHeader title="Iniciar Reclamo" backButton onBack={() => navigation.goBack()} />

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <View style={styles.warningBox}>
                    <AlertTriangle size={20} color="#B45309" />
                    <Text style={styles.warningText}>
                        Al abrir una disputa, el dinero de la compra quedará retenido temporalmente hasta que se resuelva el caso.
                    </Text>
                </View>

                {order && (
                    <Card style={{ padding: 16, marginTop: 16, gap: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>Orden #{order.id}</Text>
                            <ShieldCheck size={18} color="#2563EB" />
                        </View>
                        <Text style={{ fontSize: 12, color: '#4B5563' }}>Estado escrow: {order.escrow.state}</Text>
                        <Text style={{ fontSize: 12, color: '#4B5563' }}>
                            Liberación programada: {releaseLabel}
                        </Text>
                    </Card>
                )}

                <Card style={{ padding: 16, marginTop: 16 }}>
                    <Text style={styles.label}>Motivo del reclamo</Text>
                    <View style={styles.reasonsContainer}>
                        {REASONS.map((r) => (
                            <TouchableOpacity
                                key={r}
                                style={[styles.reasonChip, reason === r && styles.reasonChipActive]}
                                onPress={() => setReason(r)}
                            >
                                <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>{r}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={[styles.label, { marginTop: 16 }]}>Descripción detallada</Text>
                    <TextInput
                        style={styles.textArea}
                        placeholder="Explica claramente cuál es el problema..."
                        multiline
                        numberOfLines={4}
                        value={description}
                        onChangeText={setDescription}
                    />

                    <Text style={[styles.label, { marginTop: 16 }]}>Evidencias (Fotos/Videos)</Text>
                    <TouchableOpacity style={styles.uploadBtn} onPress={() => Alert.alert('Info', 'Funcionalidad de cámara simulada')}>
                        <Camera size={24} color="#666" />
                        <Text style={styles.uploadText}>Tomar foto o subir archivo</Text>
                    </TouchableOpacity>
                </Card>

            </ScrollView>

            <View style={styles.footer}>
                <Button onPress={handleSubmit} style={{ backgroundColor: '#EF4444' }}>
                    <Text>Confirmar y Abrir Disputa</Text>
                </Button>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    warningBox: { flexDirection: 'row', backgroundColor: '#FFFBEB', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FCD34D', gap: 10 },
    warningText: { flex: 1, color: '#92400E', fontSize: 13, lineHeight: 18 },
    label: { fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 8 },
    reasonsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    reasonChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
    reasonChipActive: { backgroundColor: '#FEF2F2', borderColor: '#EF4444' },
    reasonText: { fontSize: 13, color: '#4B5563' },
    reasonTextActive: { color: '#EF4444', fontWeight: 'bold' },
    textArea: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, minHeight: 100, textAlignVertical: 'top' },
    uploadBtn: { height: 100, borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed', borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
    uploadText: { marginTop: 8, color: '#6B7280', fontSize: 13 },
    footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' }
});
