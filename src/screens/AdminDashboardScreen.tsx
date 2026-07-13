import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { DollarSign, ShoppingBag, TrendingUp, AlertTriangle, ShieldCheck, Users, XCircle } from 'lucide-react-native';

export default function AdminDashboardScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { sessionToken } = useAuth();

    const platformStats = useQuery(api.adminQueries.getPlatformStats);
    const escrowOrders = useQuery(api.adminQueries.getDisputedOrEscrowOrders) || [];

    const adminForceReleaseEscrow = useAction(api.stripe.adminForceReleaseEscrow);
    const adminRefundEscrow = useAction(api.stripe.adminRefundEscrow);
    const resolveDispute = useAction(api.disputes.resolveDispute);

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
                            await adminForceReleaseEscrow({ sessionToken, orderId: orderId as any });
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
                            await adminRefundEscrow({ sessionToken, orderId: orderId as any });
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

    const handleResolveDispute = (orderId: string, inFavorOf: 'buyer' | 'seller') => {
        Alert.alert(
            "Resolver Disputa",
            `¿Resolver a favor del ${inFavorOf === 'buyer' ? 'comprador (reembolso)' : 'vendedor (liberación)'}?`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Confirmar",
                    onPress: async () => {
                        setProcessingIds(prev => ({ ...prev, [orderId]: true }));
                        try {
                            await resolveDispute({ sessionToken, orderId, resolveInFavorOf: inFavorOf });
                            Alert.alert("Éxito", "Disputa resuelta.");
                        } catch (e: any) {
                            Alert.alert("Error", e.message || "Error al resolver disputa");
                        } finally {
                            setProcessingIds(prev => ({ ...prev, [orderId]: false }));
                        }
                    }
                }
            ]
        );
    };

    if (platformStats === undefined) {
        return (
            <View style={[styles.center, { backgroundColor: isDark ? '#111827' : '#F3F4F6' }]}>
                <ActivityIndicator size="large" color="#3B82F6" />
            </View>
        );
    }

    const stats = platformStats || {
        totalSalesVolume: 0, totalOrders: 0, completedOrders: 0,
        disputedOrders: 0, escrowHeldOrders: 0, cancelledOrders: 0,
        uniqueBuyers: 0, uniqueSellers: 0, escrowHeldVolume: 0,
        recentOrdersCount: 0, recentVolume: 0,
    };

    const statCards = [
        { label: 'Volumen Total', value: `$${stats.totalSalesVolume.toFixed(2)}`, icon: DollarSign, color: '#10B981' },
        { label: 'Órdenes Totales', value: `${stats.totalOrders}`, icon: ShoppingBag, color: '#3B82F6' },
        { label: 'Completadas', value: `${stats.completedOrders}`, icon: ShieldCheck, color: '#059669' },
        { label: 'En Escrow', value: `${stats.escrowHeldOrders}`, icon: TrendingUp, color: '#D97706' },
        { label: 'En Disputa', value: `${stats.disputedOrders}`, icon: AlertTriangle, color: '#EF4444' },
        { label: 'Canceladas', value: `${stats.cancelledOrders}`, icon: XCircle, color: '#6B7280' },
        { label: 'Compradores', value: `${stats.uniqueBuyers}`, icon: Users, color: '#8B5CF6' },
        { label: 'Vendedores', value: `${stats.uniqueSellers}`, icon: Users, color: '#EC4899' },
        { label: 'Vol. Escrow', value: `$${stats.escrowHeldVolume.toFixed(2)}`, icon: ShieldCheck, color: '#F59E0B' },
        { label: 'Últimos 30d', value: `${stats.recentOrdersCount}`, icon: TrendingUp, color: '#06B6D4' },
        { label: 'Vol. 30d', value: `$${stats.recentVolume.toFixed(2)}`, icon: DollarSign, color: '#0EA5E9' },
    ];

    const renderOrderItem = ({ item }: { item: any }) => {
        const isProcessing = processingIds[item._id];
        const isDisputed = item.status === 'disputed';
        return (
            <View style={[styles.card, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}>
                <Text style={[styles.title, { color: isDark ? '#F9FAFB' : '#111827' }]}>Orden: {String(item._id).slice(-8)}</Text>
                <Text style={[styles.text, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>Estado: {item.status}</Text>
                <Text style={[styles.text, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>Total: ${(item.total || 0).toFixed(2)}</Text>
                <Text style={[styles.text, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>Vendedor: {String(item.sellerId).slice(-6)}</Text>
                <Text style={[styles.text, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>Comprador: {String(item.userId).slice(-6)}</Text>

                <View style={styles.actionRow}>
                    <TouchableOpacity
                        style={[styles.button, styles.btnSuccess, isProcessing && styles.btnDisabled]}
                        onPress={() => handleForceRelease(item._id)}
                        disabled={isProcessing}
                    >
                        <Text style={styles.btnText}>{isProcessing ? "..." : "Forzar Pago"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, styles.btnDanger, isProcessing && styles.btnDisabled]}
                        onPress={() => handleRefund(item._id)}
                        disabled={isProcessing}
                    >
                        <Text style={styles.btnText}>{isProcessing ? "..." : "Reembolsar"}</Text>
                    </TouchableOpacity>

                    {isDisputed && (
                        <>
                            <TouchableOpacity
                                style={[styles.button, styles.btnInfo, isProcessing && styles.btnDisabled]}
                                onPress={() => handleResolveDispute(item._id, 'buyer')}
                                disabled={isProcessing}
                            >
                                <Text style={styles.btnText}>A favor comprador</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.button, styles.btnInfo, isProcessing && styles.btnDisabled]}
                                onPress={() => handleResolveDispute(item._id, 'seller')}
                                disabled={isProcessing}
                            >
                                <Text style={styles.btnText}>A favor vendedor</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>
        );
    };

    return (
        <ScrollView style={[styles.container, { backgroundColor: isDark ? '#111827' : '#F3F4F6' }]}>
            <Text style={[styles.header, { color: isDark ? '#F9FAFB' : '#111827' }]}>Panel Admin</Text>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
                {statCards.map((stat, idx) => {
                    const Icon = stat.icon;
                    return (
                        <View key={idx} style={[styles.statCard, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}>
                            <View style={[styles.statIcon, { backgroundColor: stat.color + '20' }]}>
                                <Icon size={18} color={stat.color} />
                            </View>
                            <Text style={[styles.statLabel, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>{stat.label}</Text>
                            <Text style={[styles.statValue, { color: isDark ? '#F9FAFB' : '#111827' }]}>{stat.value}</Text>
                        </View>
                    );
                })}
            </View>

            {/* Disputes / Escrow Orders */}
            <Text style={[styles.sectionTitle, { color: isDark ? '#F9FAFB' : '#111827' }]}>
                Escrow & Disputas ({escrowOrders.length})
            </Text>
            {escrowOrders.length === 0 ? (
                <View style={styles.center}>
                    <Text style={[styles.text, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>No hay órdenes pendientes.</Text>
                </View>
            ) : (
                <FlatList
                    data={escrowOrders}
                    keyExtractor={(item) => item._id}
                    renderItem={renderOrderItem}
                    scrollEnabled={false}
                    contentContainerStyle={styles.listContainer}
                />
            )}
        </ScrollView>
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
        paddingVertical: 40,
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 24,
    },
    statCard: {
        flexBasis: '47%',
        flexGrow: 1,
        padding: 14,
        borderRadius: 12,
        alignItems: 'flex-start',
    },
    statIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    statLabel: {
        fontSize: 11,
        marginBottom: 2,
    },
    statValue: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    listContainer: {
        paddingBottom: 40,
    },
    card: {
        padding: 16,
        borderRadius: 12,
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
        fontSize: 13,
        marginBottom: 2,
    },
    actionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12,
    },
    button: {
        flex: 1,
        minWidth: 80,
        padding: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    btnSuccess: {
        backgroundColor: '#10B981',
    },
    btnDanger: {
        backgroundColor: '#EF4444',
    },
    btnInfo: {
        backgroundColor: '#3B82F6',
    },
    btnDisabled: {
        opacity: 0.5,
    },
    btnText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 11,
        textAlign: 'center',
    }
});