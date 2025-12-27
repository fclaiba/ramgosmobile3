import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { ShoppingBag, Ticket, Calendar, MapPin, Download, Filter, Search, X, Check, Clock, Package, ChevronDown, History } from 'lucide-react-native';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { MobileHeader } from '../components/MobileHeader';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { useMarketplace } from '../contexts/MarketplaceContext';
import { useFintech, PaymentRecord } from '../contexts/FintechContext';

interface HistoryItem {
    id: string;
    type: 'purchase' | 'bonus' | 'event';
    title: string;
    business: string;
    image: string;
    price?: number;
    discount?: number;
    location: string;
    date: string;
    status: 'completed' | 'pending' | 'cancelled';
    orderId: string;
    category: string;
    paymentMethod: string;
    quantity?: number;
}

const initialHistoryItems: HistoryItem[] = [
    {
        id: '1',
        type: 'purchase',
        title: 'Tacos de Birria Premium x3',
        business: 'Taquería El Sabor',
        image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=300&fit=crop',
        price: 38.97,
        location: 'Miami, FL',
        date: '2025-10-18T14:30:00',
        status: 'completed',
        orderId: 'ORD-001234',
        category: 'Gastronomía',
        paymentMethod: 'Visa •••• 4242',
        quantity: 3,
    },
    {
        id: '2',
        type: 'bonus',
        title: '30% OFF en tu primera compra',
        business: 'Fashion Latina',
        image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop',
        discount: 30,
        location: 'Orlando, FL',
        date: '2025-10-17T10:15:00',
        status: 'completed',
        orderId: 'BON-005678',
        category: 'Moda',
        paymentMethod: 'Bono de descuento',
    },
    {
        id: '3',
        type: 'event',
        title: 'Festival Gastronómico Latino',
        business: 'Latin Food Fest',
        image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=300&fit=crop',
        price: 25.00,
        location: 'Miami Beach, FL',
        date: '2025-10-16T18:00:00',
        status: 'completed',
        orderId: 'EVT-009012',
        category: 'Eventos',
        paymentMethod: 'Mastercard •••• 8888',
    },
    {
        id: '4',
        type: 'purchase',
        title: 'Masaje Relajante 60min',
        business: 'Spa Tranquilidad',
        image: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop',
        price: 89.99,
        location: 'Fort Lauderdale, FL',
        date: '2025-10-15T16:00:00',
        status: 'pending',
        orderId: 'ORD-003456',
        category: 'Bienestar',
        paymentMethod: 'Visa •••• 4242',
    },
];

export default function HistoryScreen({ navigation }: any) {
    const [activeTab, setActiveTab] = useState<'all' | 'purchase' | 'bonus' | 'event'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const { orders, products, confirmDelivery } = useMarketplace();
    const { payments, releasePayment } = useFintech();

    const baseHistoryItems = useMemo(
        () => initialHistoryItems.filter((item) => item.type !== 'purchase'),
        []
    );

    const orderHistoryItems = useMemo<HistoryItem[]>(() => {
        return orders.map((order) => {
            const firstItem = order.items[0];
            const product = products.find((p) => p.id === firstItem?.productId);
            const status: HistoryItem['status'] =
                order.paymentStatus === 'refunded'
                    ? 'cancelled'
                    : order.status === 'completed'
                        ? 'completed'
                        : 'pending';

            const fallbackImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop';

            return {
                id: order.id,
                type: 'purchase',
                title: firstItem?.title ?? 'Compra Marketplace',
                business: order.sellerName,
                image: product?.images[0]?.url ?? fallbackImage,
                price: order.totals.grandTotal,
                location: order.shipping.destination.city
                    ?? order.shipping.destination.country
                    ?? 'A coordinar',
                date: order.createdAt,
                status,
                orderId: order.id,
                category: product?.category ?? 'Marketplace',
                paymentMethod: 'Tarjeta •••• 4242',
                quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
            } as HistoryItem;
        });
    }, [orders, products]);

    const fintechHistoryItems = useMemo<HistoryItem[]>(() => {
        const fallbackImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop';
        return payments.map((payment: PaymentRecord) => {
            const status: HistoryItem['status'] =
                payment.status === 'succeeded'
                    ? 'completed'
                    : payment.status === 'processing'
                        ? 'pending'
                        : 'cancelled';

            return {
                id: `fintech-${payment.id}`,
                type: 'purchase',
                title: (payment.metadata?.description as string) ?? 'Compra Ramgos',
                business: payment.split.sellerName,
                image: (payment.metadata?.image as string) ?? fallbackImage,
                price: payment.amount,
                location: (payment.metadata?.location as string) ?? 'Online',
                date: payment.createdAt,
                status,
                orderId: payment.id,
                category: (payment.metadata?.category as string) ?? 'Fintech',
                paymentMethod: `${payment.method.brand} •••• ${payment.method.last4}`,
                quantity: payment.metadata?.quantity ? Number(payment.metadata.quantity) : undefined,
            };
        });
    }, [payments]);

    const historyItems = useMemo(() => {
        const combined = [...orderHistoryItems, ...fintechHistoryItems, ...baseHistoryItems];
        return combined.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    }, [orderHistoryItems, fintechHistoryItems, baseHistoryItems]);

    const filteredItems = historyItems.filter(item => {
        const matchesTab = activeTab === 'all' || item.type === activeTab;
        const matchesSearch =
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.business.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.orderId.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesTab && matchesSearch;
    });

    const getItemIcon = (type: HistoryItem['type']) => {
        switch (type) {
            case 'purchase': return ShoppingBag;
            case 'bonus': return Ticket;
            case 'event': return Calendar;
        }
    };

    const getStatusColor = (status: HistoryItem['status']) => {
        switch (status) {
            case 'completed': return 'bg-green-100 dark:bg-green-900'; // fallback Tailwind classes logic handled in Badge? No, Badge takes className.
            case 'pending': return 'bg-yellow-100 dark:bg-yellow-900';
            case 'cancelled': return 'bg-red-100 dark:bg-red-900';
        }
    };

    const getStatusTextColor = (status: HistoryItem['status']) => {
        switch (status) {
            case 'completed': return '#166534'; // green-700
            case 'pending': return '#854d0e'; // yellow-700
            case 'cancelled': return '#991b1b'; // red-700
        }
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    const stats = {
        all: historyItems.length,
        purchase: historyItems.filter(i => i.type === 'purchase').length,
        bonus: historyItems.filter(i => i.type === 'bonus').length,
        event: historyItems.filter(i => i.type === 'event').length,
        totalSpent: historyItems
            .filter(i => i.status === 'completed' && i.price)
            .reduce((sum, i) => sum + (i.price || 0), 0),
    };


    const handleAction = (item: HistoryItem, action: 'dispute' | 'confirm') => {
        if (action === 'dispute') {
            navigation.navigate('Dispute', { orderId: item.orderId });
            return;
        }

        if (!item.orderId) {
            Alert.alert('Operación no disponible', 'No encontramos información de la orden asociada.');
            return;
        }

        const released = releasePayment(item.orderId);
        if (released) {
            Alert.alert('¡Gracias!', 'El pago fue liberado y ya está disponible para el vendedor.');
            return;
        }

        const result = confirmDelivery(item.orderId);
        if (!result.success) {
            Alert.alert('No pudimos confirmar la entrega', result.error ?? 'Intenta nuevamente en unos minutos.');
            return;
        }

        Alert.alert('¡Gracias!', 'El pago será liberado al vendedor luego de la ventana de 15 días.');
    };

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Historial"
                subtitle={`${filteredItems.length} transacciones`}
                onMenuPress={() => navigation.openDrawer && navigation.openDrawer()}
                backButton
                onBack={() => navigation.goBack()}
            />

            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Search size={18} color="#666" style={{ marginRight: 8 }} />
                    <Input
                        placeholder="Buscar..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        style={{ flex: 1, borderWidth: 0 }}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X size={18} color="#666" />
                        </TouchableOpacity>
                    )}
                </View>
                <Button variant="outline" style={styles.filterBtn}>
                    <Filter size={18} color="#000" />
                </Button>
            </View>

            {/* Stats Cards Row */}
            <View style={styles.statsRow}>
                <Card style={[styles.statsCard, { backgroundColor: '#F0FDF4' }]}>
                    <CardContent style={styles.statsContent}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <Package size={14} color="#16A34A" />
                            <Text style={styles.statsLabel}> Total Gastado</Text>
                        </View>
                        <Text style={[styles.statsValue, { color: '#16A34A' }]}>${stats.totalSpent.toFixed(2)}</Text>
                    </CardContent>
                </Card>
                <Card style={[styles.statsCard, { backgroundColor: '#EFF6FF' }]}>
                    <CardContent style={styles.statsContent}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <History size={14} color="#2563EB" />
                            <Text style={styles.statsLabel}> Transacciones</Text>
                        </View>
                        <Text style={[styles.statsValue, { color: '#2563EB' }]}>{stats.all}</Text>
                    </CardContent>
                </Card>
            </View>

            {/* Tabs */}
            <View style={styles.tabsContainer}>
                {(['all', 'purchase', 'bonus', 'event'] as const).map(tab => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tab, activeTab === tab && styles.activeTab]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                            {tab === 'all' ? 'Todos' : tab === 'purchase' ? 'Compras' : tab === 'bonus' ? 'Bonos' : 'Eventos'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView contentContainerStyle={styles.listContainer}>
                {filteredItems.map(item => {
                    const Icon = getItemIcon(item.type);
                    return (
                        <Card key={item.id} style={styles.itemCard}>
                            <CardContent style={styles.itemContent}>
                                <View style={styles.itemRow}>
                                    <View style={styles.imageContainer}>
                                        <ImageWithFallback src={item.image} style={styles.itemImage} />
                                        <View style={styles.iconOverlay}>
                                            <Icon size={12} color="#fff" />
                                        </View>
                                    </View>
                                    <View style={styles.itemDetails}>
                                        <View style={styles.itemHeader}>
                                            <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                                            <Badge style={{ backgroundColor: statusColors[item.status] || '#eee' }}>
                                                <Text style={{ fontSize: 10, color: getStatusTextColor(item.status) }}>
                                                    {item.status === 'completed' ? 'Completado' : item.status === 'pending' ? 'Pendiente' : 'Cancelado'}
                                                </Text>
                                            </Badge>
                                        </View>
                                        <Text style={styles.itemBusiness}>{item.business}</Text>
                                        <Text style={styles.itemMeta}>#{item.orderId} • {formatDate(item.date)}</Text>
                                        {item.price && <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>}
                                        {item.discount && <Text style={styles.itemPrice}>{item.discount}% OFF</Text>}
                                    </View>
                                </View>

                                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0', flexDirection: 'row', gap: 8 }}>
                                    <TouchableOpacity
                                        style={[styles.actionBtn, { flex: 1 }]}
                                        onPress={() => Alert.alert('Detalles', `Orden #${item.orderId}\n${item.title}\n${item.business}`)}
                                    >
                                        <Text style={styles.actionBtnText}>Ver detalles</Text>
                                        <ChevronDown size={14} color="#666" />
                                    </TouchableOpacity>

                                    {item.type === 'purchase' && item.status === 'pending' && (
                                        <>
                                            <TouchableOpacity
                                                style={[styles.actionBtn, { backgroundColor: '#DEF7EC', borderColor: '#DEF7EC' }]}
                                                onPress={() => handleAction(item, 'confirm')}
                                            >
                                                <Text style={[styles.actionBtnText, { color: '#03543F', fontWeight: 'bold' }]}>Recibí</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.actionBtn, { backgroundColor: '#FDE8E8', borderColor: '#FDE8E8' }]}
                                                onPress={() => handleAction(item, 'dispute')}
                                            >
                                                <Text style={[styles.actionBtnText, { color: '#9B1C1C', fontWeight: 'bold' }]}>Reclamo</Text>
                                            </TouchableOpacity>
                                        </>
                                    )}
                                </View>
                            </CardContent>
                        </Card>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const statusColors: any = {
    completed: '#DCFCE7',
    pending: '#FEF9C3',
    cancelled: '#FEE2E2'
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    searchContainer: { flexDirection: 'row', padding: 16, gap: 8 },
    searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F0F0', borderRadius: 12, paddingHorizontal: 12, height: 44 },
    filterBtn: { width: 44, height: 44, paddingHorizontal: 0 },
    statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 16 },
    statsCard: { flex: 1, borderWidth: 0 },
    statsContent: { padding: 12 },
    statsLabel: { fontSize: 12, color: '#666' },
    statsValue: { fontSize: 20, fontWeight: 'bold' },
    tabsContainer: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16, gap: 8 },
    tab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee' },
    activeTab: { backgroundColor: '#000', borderColor: '#000' },
    tabText: { fontSize: 12, color: '#666' },
    activeTabText: { color: '#fff', fontWeight: 'bold' },
    listContainer: { padding: 16, paddingTop: 0 },
    itemCard: { marginBottom: 12, overflow: 'hidden' },
    itemContent: { padding: 12 },
    itemRow: { flexDirection: 'row', gap: 12 },
    imageContainer: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden', position: 'relative' },
    itemImage: { width: '100%', height: '100%' },
    iconOverlay: { position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.6)', padding: 4, borderRadius: 8 },
    itemDetails: { flex: 1 },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
    itemTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
    itemBusiness: { fontSize: 12, color: '#666', marginTop: 2 },
    itemMeta: { fontSize: 11, color: '#999', marginTop: 2 },
    itemPrice: { fontSize: 14, fontWeight: 'bold', color: '#007AFF', marginTop: 4 },
    detailsButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
    detailsButtonText: { fontSize: 12, color: '#666', marginRight: 4 },
    actionBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#eee', alignItems: 'center', justifyContent: 'center' },
    actionBtnText: { fontSize: 12, color: '#374151' }
});
