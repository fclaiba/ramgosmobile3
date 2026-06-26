import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useTheme } from '../contexts/ThemeContext';

export default function AdminDashboardScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    
    // Fetch orders that are in escrow or disputed
    const escrowOrders = useQuery(api.adminQueries.getDisputedOrEscrowOrders) || [];
    
    const adminForceReleaseEscrow = useAction(api.stripe.adminForceReleaseEscrow);
    const adminRefundEscrow = useAction(api.stripe.adminRefundEscrow);

    const [processingIds, setProcessingIds] = useState<Record<string, boolean>>({});

    const handleForceRelease = (orderId: string) => {
        Alert.alert(
            "Confirmar Liberación",
            "¿Estás seguro de forzar el pago al vendedor? Esta acción no se puede deshacer.",
            [
                { text: "Cancelar", style: "cancel" },
                { 
                    text: "Forzar Pago", 
                    style: "destructive",
                    onPress: async () => {
                        setProcessingIds(prev => ({ ...prev, [orderId]: true }));
                        try {
                            await adminForceReleaseEscrow({ orderId: orderId as any });
                            Alert.alert("Éxito", "Pago liberado al vendedor exitosamente.");
                        } catch (e: any) {
                            Alert.alert("Error", e.message || "Error al liberar pago");
                        } finally {
                            setProcessingIds(prev => ({ ...prev, [orderId]: false }));
                        }
                    } 
                }
            ]
        );
    };

    const handleRefund = (orderId: string) => {
        Alert.alert(
            "Confirmar Reembolso",
            "¿Estás seguro de reembolsar el dinero al comprador? El vendedor no recibirá el pago.",
            [
                { text: "Cancelar", style: "cancel" },
                { 
                    text: "Reembolsar", 
                    style: "destructive",
                    onPress: async () => {
                        setProcessingIds(prev => ({ ...prev, [orderId]: true }));
                        try {
                            await adminRefundEscrow({ orderId: orderId as any });
                            Alert.alert("Éxito", "Reembolso procesado exitosamente.");
                        } catch (e: any) {
                            Alert.alert("Error", e.message || "Error al procesar reembolso");
                        } finally {
                            setProcessingIds(prev => ({ ...prev, [orderId]: false }));
                        }
                    } 
                }
            ]
        );
    };

    if (escrowOrders === undefined) {
        return (
            <View style={[styles.center, { backgroundColor: isDark ? '#111827' : '#F3F4F6' }]}>
                <ActivityIndicator size="large" color="#3B82F6" />
            </View>
        );
    }

    const renderOrderItem = ({ item }: { item: any }) => {
        const isProcessing = processingIds[item._id];
        return (
            <View style={[styles.card, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}>
                <Text style={[styles.title, { color: isDark ? '#F9FAFB' : '#111827' }]}>Orden: {item._id}</Text>
                <Text style={[styles.text, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>Estado: {item.status}</Text>
                <Text style={[styles.text, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>Total: ${(item.total || 0).toFixed(2)}</Text>
                <Text style={[styles.text, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>Vendedor ID: {item.sellerId}</Text>
                <Text style={[styles.text, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>Comprador ID: {item.userId}</Text>

                <View style={styles.actionRow}>
                    <TouchableOpacity 
                        style={[styles.button, styles.btnSuccess, isProcessing && styles.btnDisabled]} 
                        onPress={() => handleForceRelease(item._id)}
                        disabled={isProcessing}
                    >
                        <Text style={styles.btnText}>{isProcessing ? "Procesando..." : "Forzar Pago a Vendedor"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.button, styles.btnDanger, isProcessing && styles.btnDisabled]} 
                        onPress={() => handleRefund(item._id)}
                        disabled={isProcessing}
                    >
                        <Text style={styles.btnText}>{isProcessing ? "Procesando..." : "Reembolsar a Comprador"}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: isDark ? '#111827' : '#F3F4F6' }]}>
            <Text style={[styles.header, { color: isDark ? '#F9FAFB' : '#111827' }]}>Panel de Disputas (Admin)</Text>
            {escrowOrders.length === 0 ? (
                <View style={styles.center}>
                    <Text style={[styles.text, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>No hay órdenes pendientes en Escrow o Disputadas.</Text>
                </View>
            ) : (
                <FlatList 
                    data={escrowOrders}
                    keyExtractor={(item) => item._id}
                    renderItem={renderOrderItem}
                    contentContainerStyle={styles.listContainer}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    listContainer: {
        paddingBottom: 20,
    },
    card: {
        padding: 16,
        borderRadius: 8,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    text: {
        fontSize: 14,
        marginBottom: 4,
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
    },
    button: {
        flex: 1,
        padding: 10,
        borderRadius: 6,
        alignItems: 'center',
        marginHorizontal: 4,
    },
    btnSuccess: {
        backgroundColor: '#10B981', // emerald-500
    },
    btnDanger: {
        backgroundColor: '#EF4444', // red-500
    },
    btnDisabled: {
        opacity: 0.5,
    },
    btnText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 12,
        textAlign: 'center',
    }
});
