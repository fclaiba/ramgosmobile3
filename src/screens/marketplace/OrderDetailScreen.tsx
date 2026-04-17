import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useMarketplace } from '../../contexts/MarketplaceContext';
import { usePoints } from '../../contexts/PointsContext';
import { useAuth } from '../../contexts/AuthContext';
import { Package, MapPin, Truck, CheckCircle, Clock, ShieldCheck, Coins, Sparkles, TrendingUp } from 'lucide-react-native';
import { Button } from '../../components/ui/button';
import { useEscrow } from '../../contexts/EscrowContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { POINT_VALUE_USD } from '../../contexts/RewardsContext';
import { useToast } from '../../contexts/ToastContext';

export default function OrderDetailScreen() {
    const route = useRoute<any>();
    const navigation = useNavigation();
    const { order, role = 'buyer' } = route.params || {}; // Assume order object is passed
    const { confirmDelivery } = useMarketplace();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { openEscrow } = useEscrow();
    const insets = useSafeAreaInsets();
    const { currentTier } = usePoints();
    const { user } = useAuth();
    const { show } = useToast();

    const canConfirm = useMemo(() => {
        if (role !== 'buyer') return false;
        if (!order?.escrow) return false;
        if (order?.deliveryConfirmedAt) return false;
        return order.escrow.state === 'held';
    }, [order?.deliveryConfirmedAt, order?.escrow, role]);

    // Calculate points earned from this order
    const pointsInfo = useMemo(() => {
        if (!order) return null;
        
        // Get the amount paid (excluding discounts paid with points)
        const totalPaid = order.totals?.grandTotal ?? order.totalAmount ?? 0;
        const discountApplied = order.totals?.discount ?? order.paymentDetails?.discountApplied ?? 0;
        
        // Cash portion (what was actually paid, not covered by point discounts)
        const cashPaid = Math.max(0, totalPaid);
        
        // Base points: 1 point per $1
        const basePoints = Math.floor(cashPaid);
        
        // Bonus from tier (if order was placed when user had a tier bonus)
        const bonusMultiplier = order.pointsBonusMultiplier ?? currentTier?.bonusMultiplier ?? 0;
        const bonusPoints = Math.floor(basePoints * bonusMultiplier);
        
        // Total points
        const totalPoints = order.pointsEarned ?? (basePoints + bonusPoints);
        
        // Value in USD
        const valueUSD = (totalPoints * POINT_VALUE_USD).toFixed(2);
        
        return {
            basePoints,
            bonusPoints,
            totalPoints,
            valueUSD,
            tierLabel: order.tierAtPurchase ?? currentTier?.label ?? 'Bronze',
            hasBonusMultiplier: bonusMultiplier > 0,
        };
    }, [order, currentTier]);

    if (!order) return <View style={styles.container}><Text>Orden no encontrada</Text></View>;

    const handleConfirm = () => {
        if (!canConfirm) {
            show('Esta orden ya fue confirmada o no está en estado retenido.', 'warning');
            return;
        }
        Alert.alert(
            'Confirmar Recepción',
            '¿Confirmas que has recibido el pedido correctamente? Esto liberará el pago al vendedor.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Confirmar',
                    onPress: async () => {
                        const result = await confirmDelivery(order.id);
                        if (!result.success) {
                            show(result.error ?? 'Intenta nuevamente.', 'error');
                            return;
                        }
                        show('Has confirmado la recepción. El pago se liberará.', 'success');
                        navigation.goBack();
                    }
                }
            ]
        );
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}>
            {/* Header Status */}
            <View style={styles.statusHeader}>
                <View>
                    <Text style={styles.orderId}>Orden #{order.id.slice(0, 8)}</Text>
                    <Text style={styles.date}>{new Date(order.date).toLocaleDateString()}</Text>
                </View>
                <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{order.status.toUpperCase()}</Text>
                </View>
            </View>

            {/* Steps / Tracking Info Mockup */}
            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Estado del Envío</Text>
                <View style={styles.timeline}>
                    <View style={styles.timelineItem}>
                        <CheckCircle size={20} color="#10B981" />
                        <Text style={styles.timelineText}>Pago Confirmado</Text>
                    </View>
                    <View style={styles.timelineLine} />
                    <View style={styles.timelineItem}>
                        <Truck size={20} color="#3B82F6" />
                        <Text style={styles.timelineText}>En Camino</Text>
                    </View>
                    <View style={styles.timelineLine} />
                    <View style={styles.timelineItem}>
                        <Package size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                        <Text style={[styles.timelineText, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>Entregado</Text>
                    </View>
                </View>
            </View>

            {/* Items */}
            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Productos</Text>
                {(order.items || []).map((item: any) => (
                    <View key={item.id} style={styles.itemRow}>
                        <View style={styles.itemImagePlaceholder} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.itemName}>{item.name}</Text>
                            <Text style={styles.itemPrice}>${item.price} x {item.quantity}</Text>
                        </View>
                        <Text style={styles.itemTotal}>${(item.price * item.quantity).toFixed(2)}</Text>
                    </View>
                ))}
            </View>

            {/* Financial Summary */}
            <View style={styles.card}>
                <View style={styles.row}>
                    <Text style={styles.label}>Subtotal</Text>
                    <Text style={styles.value}>${order.totalAmount.toFixed(2)}</Text>
                </View>
                <View style={styles.row}>
                    <Text style={styles.label}>Envío</Text>
                    <Text style={styles.value}>$0.00</Text>
                </View>
                <View style={[styles.row, { marginTop: 8, borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#E5E7EB', paddingTop: 8 }]}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalValue}>${order.totalAmount.toFixed(2)}</Text>
                </View>
            </View>

            {/* Points Earned Card */}
            {role === 'buyer' && pointsInfo && pointsInfo.totalPoints > 0 && (
                <View style={styles.pointsCard}>
                    <View style={styles.pointsHeader}>
                        <View style={styles.pointsIconContainer}>
                            <Coins size={24} color="#F59E0B" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.pointsTitle}>Puntos Ganados</Text>
                            <Text style={styles.pointsSubtitle}>Por esta compra</Text>
                        </View>
                        <View style={styles.pointsBadge}>
                            <Sparkles size={14} color="#F59E0B" />
                            <Text style={styles.pointsBadgeText}>+{pointsInfo.totalPoints}</Text>
                        </View>
                    </View>

                    <View style={styles.pointsBreakdown}>
                        <View style={styles.pointsRow}>
                            <Text style={styles.pointsLabel}>Puntos base (1 pt por $1)</Text>
                            <Text style={styles.pointsValue}>+{pointsInfo.basePoints} pts</Text>
                        </View>
                        
                        {pointsInfo.hasBonusMultiplier && pointsInfo.bonusPoints > 0 && (
                            <View style={styles.pointsRow}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <TrendingUp size={12} color="#10B981" />
                                    <Text style={[styles.pointsLabel, { color: '#10B981' }]}>
                                        Bonus nivel {pointsInfo.tierLabel}
                                    </Text>
                                </View>
                                <Text style={[styles.pointsValue, { color: '#10B981' }]}>+{pointsInfo.bonusPoints} pts</Text>
                            </View>
                        )}

                        <View style={[styles.pointsRow, styles.pointsTotalRow]}>
                            <Text style={styles.pointsTotalLabel}>Total ganado</Text>
                            <Text style={styles.pointsTotalValue}>{pointsInfo.totalPoints} pts</Text>
                        </View>
                    </View>

                    <View style={styles.pointsFooter}>
                        <Text style={styles.pointsFooterText}>
                            Valor: ${pointsInfo.valueUSD} · Canjeables en tu próxima compra
                        </Text>
                    </View>
                </View>
            )}

            {/* Escrow Card */}
            {order.escrow && (
                <TouchableOpacity
                    style={styles.escrowCard}
                    onPress={() => openEscrow(order.id, role as 'buyer' | 'seller')}
                    activeOpacity={0.8}
                >
                    <View style={styles.escrowIconContainer}>
                        <ShieldCheck size={24} color="#7C3AED" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.escrowTitle}>Protección Escrow</Text>
                        <Text style={styles.escrowStatus}>
                            Estado: {order.escrow.state === 'held' ? 'Retenido' : order.escrow.state === 'released' ? 'Liberado' : order.escrow.state}
                        </Text>
                    </View>
                    <Text style={styles.escrowLink}>Ver detalles →</Text>
                </TouchableOpacity>
            )}

            {/* Action - Only if not delivered yet? For demo, always show */}
            <View style={styles.actionContainer}>
                <Text style={styles.helpText}>
                    Al recibir tu producto, confirma la entrega para liberar el dinero al vendedor.
                </Text>
                <Button onPress={handleConfirm} disabled={!canConfirm} style={{ backgroundColor: '#10B981', width: '100%' }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Confirmar que recibí el pedido</Text>
                </Button>
            </View>

        </ScrollView>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: isDark ? '#111827' : '#F9FAFB',
        padding: 20,
    },
    statusHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    orderId: {
        fontSize: 18,
        fontWeight: 'bold',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    date: {
        fontSize: 14,
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
    statusBadge: {
        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    statusText: {
        color: '#3B82F6',
        fontWeight: 'bold',
        fontSize: 12,
    },
    card: {
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: isDark ? '#F9FAFB' : '#111827',
        marginBottom: 12,
    },
    timeline: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 10,
    },
    timelineItem: {
        alignItems: 'center',
        gap: 8,
    },
    timelineLine: {
        flex: 1,
        height: 2,
        backgroundColor: isDark ? '#374151' : '#E5E7EB',
        marginHorizontal: 8,
        marginBottom: 20, // adjust alignment
    },
    timelineText: {
        fontSize: 10,
        fontWeight: '600',
        color: isDark ? '#D1D5DB' : '#4B5563',
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    itemImagePlaceholder: {
        width: 40,
        height: 40,
        backgroundColor: isDark ? '#374151' : '#E5E7EB',
        borderRadius: 8,
        marginRight: 12,
    },
    itemName: {
        fontSize: 14,
        fontWeight: '500',
        color: isDark ? '#F9FAFB' : '#1F2937',
    },
    itemPrice: {
        fontSize: 12,
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
    itemTotal: {
        fontSize: 14,
        fontWeight: '600',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    label: {
        fontSize: 14,
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
    value: {
        fontSize: 14,
        fontWeight: '500',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    totalLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    totalValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    actionContainer: {
        marginTop: 20,
        gap: 12,
    },
    helpText: {
        fontSize: 13,
        color: isDark ? '#9CA3AF' : '#6B7280',
        textAlign: 'center',
    },
    escrowCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isDark ? 'rgba(124, 58, 237, 0.15)' : '#F5F3FF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(124, 58, 237, 0.3)' : '#DDD6FE',
        gap: 12,
    },
    escrowIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: isDark ? 'rgba(124, 58, 237, 0.2)' : '#EDE9FE',
        justifyContent: 'center',
        alignItems: 'center',
    },
    escrowTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    escrowStatus: {
        fontSize: 12,
        color: isDark ? '#A78BFA' : '#7C3AED',
        marginTop: 2,
    },
    escrowLink: {
        fontSize: 12,
        fontWeight: '600',
        color: '#7C3AED',
    },
    // Points Card Styles
    pointsCard: {
        backgroundColor: isDark ? 'rgba(245, 158, 11, 0.1)' : '#FFFBEB',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
    },
    pointsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    pointsIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pointsTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: isDark ? '#FCD34D' : '#B45309',
    },
    pointsSubtitle: {
        fontSize: 12,
        color: isDark ? '#D1D5DB' : '#92400E',
        marginTop: 2,
    },
    pointsBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FDE68A',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
    },
    pointsBadgeText: {
        fontSize: 16,
        fontWeight: '800',
        color: isDark ? '#FCD34D' : '#B45309',
    },
    pointsBreakdown: {
        backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.6)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
    },
    pointsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
    },
    pointsLabel: {
        fontSize: 13,
        color: isDark ? '#D1D5DB' : '#6B7280',
    },
    pointsValue: {
        fontSize: 13,
        fontWeight: '600',
        color: isDark ? '#F9FAFB' : '#374151',
    },
    pointsTotalRow: {
        borderTopWidth: 1,
        borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        marginTop: 6,
        paddingTop: 10,
    },
    pointsTotalLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: isDark ? '#FCD34D' : '#B45309',
    },
    pointsTotalValue: {
        fontSize: 16,
        fontWeight: '800',
        color: isDark ? '#FCD34D' : '#B45309',
    },
    pointsFooter: {
        alignItems: 'center',
    },
    pointsFooterText: {
        fontSize: 11,
        color: isDark ? '#9CA3AF' : '#78716C',
        textAlign: 'center',
    },
});
