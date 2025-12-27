import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { CheckCircle2, Truck, Package, Clock, ShieldAlert, ChevronRight } from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { useMarketplace } from '../../contexts/MarketplaceContext';

export default function OrderDetailScreen({ route, navigation }: any) {
    const { orderId, role } = route.params; // role: 'buyer' | 'seller'
    const { orders, confirmDelivery, initiateDispute } = useMarketplace();

    // Find Order
    const order = useMemo(() => orders.find(o => o.id === orderId), [orders, orderId]);

    if (!order) return <View><Text>Orden no encontrada</Text></View>;

    // State Logic
    const isBuyer = role === 'buyer';
    const isSeller = role === 'seller';

    // 15-Day Escrow Timer Calculation
    const getEscrowDaysLeft = () => {
        if (!order.deliveryConfirmedAt) return 15;
        const deliveryDate = new Date(order.deliveryConfirmedAt);
        const releaseDate = new Date(deliveryDate);
        releaseDate.setDate(deliveryDate.getDate() + 15);

        const now = new Date();
        const diffTime = Math.abs(releaseDate.getTime() - now.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays);
    };

    // Actions
    const handleConfirmDelivery = () => {
        Alert.alert(
            'Confirmar Recepción',
            '¿Confirmas que has recibido el producto correctamente? Esto iniciará el período de liberación de fondos.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Confirmar',
                    onPress: () => {
                        const res = confirmDelivery(order.id);
                        if (res.success) Alert.alert('Éxito', 'Entrega confirmada. El dinero se liberará en 15 días si no hay reclamos.');
                    }
                }
            ]
        );
    };

    const handleReportProblem = () => {
        navigation.navigate('DisputeReason', { orderId: order.id });
    };

    const handleShipOrder = () => {
        Alert.alert('Cargar Seguimiento', 'Simulación: Orden marcada como enviada.');
        // In real app: updateOrder({ status: 'in_transit' })
    };

    // Render Status Banner
    const renderStatusBanner = () => {
        if (order.status === 'disputed') {
            return (
                <View style={[styles.banner, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                    <ShieldAlert size={24} color="#EF4444" />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.bannerTitle, { color: '#B91C1C' }]}>Disputa en Curso</Text>
                        <Text style={[styles.bannerText, { color: '#B91C1C' }]}>
                            El dinero está retenido hasta que se resuelva el reclamo.
                        </Text>
                    </View>
                </View>
            );
        }

        if (order.status === 'delivered') {
            const daysLeft = getEscrowDaysLeft();
            return (
                <View style={[styles.banner, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                    <Clock size={24} color="#059669" />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.bannerTitle, { color: '#047857' }]}>
                            {isSeller ? 'Fondos en Retención' : 'Protección Activa'}
                        </Text>
                        <Text style={[styles.bannerText, { color: '#047857' }]}>
                            {isSeller
                                ? `El dinero se liberará en ${daysLeft} días.`
                                : `Tienes ${daysLeft} días de protección restante.`}
                        </Text>
                    </View>
                </View>
            );
        }

        return null; // Default states
    };

    return (
        <View style={styles.container}>
            <MobileHeader title={`Orden #${order.id.slice(-6)}`} showBack onBack={() => navigation.goBack()} />

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                {/* State Banner */}
                {renderStatusBanner()}

                {/* Progress Stepper (Simplified) */}
                <View style={styles.stepper}>
                    <View style={styles.step}>
                        <CheckCircle2 size={20} color="#059669" />
                        <Text style={styles.stepText}>Pagado</Text>
                    </View>
                    <View style={styles.line} />
                    <View style={styles.step}>
                        <Truck size={20} color={['in_transit', 'delivered', 'completed'].includes(order.status) ? "#059669" : "#D1D5DB"} />
                        <Text style={styles.stepText}>Enviado</Text>
                    </View>
                    <View style={styles.line} />
                    <View style={styles.step}>
                        <Package size={20} color={['delivered', 'completed'].includes(order.status) ? "#059669" : "#D1D5DB"} />
                        <Text style={styles.stepText}>Entregado</Text>
                    </View>
                </View>

                {/* Order Items */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Producto</Text>
                    {order.items.map(item => (
                        <View key={item.productId} style={styles.itemRow}>
                            <View>
                                <Text style={styles.itemTitle}>{item.title}</Text>
                                <Text style={styles.itemSubtitle}>USD ${item.unitPrice} x {item.quantity}</Text>
                            </View>
                            <Text style={styles.itemTotal}>${item.subtotal}</Text>
                        </View>
                    ))}
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Total</Text>
                        <Text style={styles.totalValue}>${order.totals.grandTotal}</Text>
                    </View>
                </View>

                {/* Shipping Info */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Dirección de Envío</Text>
                    <Text style={styles.text}>{order.shipping.destination.fullName}</Text>
                    <Text style={styles.text}>{order.shipping.destination.addressLine1}</Text>
                    <Text style={styles.text}>{order.shipping.destination.city}, {order.shipping.destination.country}</Text>
                </View>

                {/* ACTIONS - Role Based */}
                <View style={styles.actionsContainer}>

                    {/* SELLER: Mark as Shipped */}
                    {isSeller && order.status === 'payment_received' && (
                        <TouchableOpacity style={styles.primaryBtn} onPress={handleShipOrder}>
                            <Text style={styles.btnText}>Cargar Envío</Text>
                        </TouchableOpacity>
                    )}

                    {/* BUYER: Confirm Receipt */}
                    {isBuyer && order.status === 'in_transit' && (
                        <TouchableOpacity style={styles.primaryBtn} onPress={handleConfirmDelivery}>
                            <Text style={styles.btnText}>Confirmar Entrega</Text>
                        </TouchableOpacity>
                    )}

                    {/* BUYER: Report Problem (Only if delivered and not disputed) */}
                    {isBuyer && order.status === 'delivered' && getEscrowDaysLeft() > 0 && (
                        <TouchableOpacity style={styles.dangerBtn} onPress={handleReportProblem}>
                            <ShieldAlert size={20} color="#EF4444" />
                            <Text style={styles.dangerBtnText}>Tengo un problema</Text>
                        </TouchableOpacity>
                    )}

                    {/* DISPUTE STATUS */}
                    {order.status === 'disputed' && (
                        <TouchableOpacity
                            style={styles.secondaryBtn}
                            onPress={() => navigation.navigate('DisputeChat', { orderId: order.id })}
                        >
                            <Text style={styles.secondaryBtnText}>Ver Chat de Reclamo</Text>
                            <ChevronRight size={16} color="#4B5563" />
                        </TouchableOpacity>
                    )}

                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    banner: { flexDirection: 'row', padding: 16, borderRadius: 12, borderWidth: 1, gap: 12, marginBottom: 16 },
    bannerTitle: { fontWeight: 'bold', fontSize: 14, marginBottom: 4 },
    bannerText: { fontSize: 13 },

    stepper: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 16 },
    step: { alignItems: 'center', gap: 4 },
    stepText: { fontSize: 12, color: '#4B5563' },
    line: { flex: 1, height: 2, backgroundColor: '#E5E7EB', marginHorizontal: 8 },

    card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
    itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    itemTitle: { fontSize: 14, color: '#374151' },
    itemSubtitle: { fontSize: 12, color: '#6B7280' },
    itemTotal: { fontWeight: '600', color: '#111827' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 12, marginTop: 4 },
    totalLabel: { fontWeight: 'bold', fontSize: 16 },
    totalValue: { fontWeight: 'bold', fontSize: 18, color: '#7C3AED' },
    text: { fontSize: 14, color: '#4B5563', marginBottom: 2 },

    actionsContainer: { gap: 12, marginBottom: 40 },
    primaryBtn: { backgroundColor: '#7C3AED', padding: 16, borderRadius: 12, alignItems: 'center' },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    dangerBtn: { flexDirection: 'row', backgroundColor: '#FEF2F2', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#FECACA' },
    dangerBtnText: { color: '#EF4444', fontWeight: 'bold' },
    secondaryBtn: { flexDirection: 'row', backgroundColor: '#F3F4F6', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
    secondaryBtnText: { color: '#374151', fontWeight: '600' }
});
