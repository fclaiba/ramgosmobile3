import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { useMarketplace } from '../../contexts/MarketplaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { Package, TrendingUp } from 'lucide-react-native';

export default function OrderHistoryScreen({ navigation }: any) {
    const { orders } = useMarketplace();
    const { user } = useAuth();

    // Tabs: 'purchases' | 'sales'
    const [activeTab, setActiveTab] = useState<'purchases' | 'sales'>('purchases');

    // Filter orders
    const myOrders = orders.filter(o =>
        activeTab === 'purchases' ? o.buyerId === user?.id : o.sellerId === user?.id
    );

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return '#059669';
            case 'delivered': return '#2563EB';
            case 'in_transit': return '#D97706';
            case 'disputed': return '#DC2626';
            default: return '#6B7280';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'completed': return 'Completado';
            case 'delivered': return 'Entregado';
            case 'in_transit': return 'En camino';
            case 'disputed': return 'En Disputa';
            case 'payment_received': return 'Pagado';
            default: return status;
        }
    };

    const renderItem = ({ item }: any) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('OrderDetail', { orderId: item.id, role: activeTab === 'purchases' ? 'buyer' : 'seller' })}
        >
            <View style={styles.cardHeader}>
                <Text style={styles.orderId}>Orden #{item.id.slice(-6).toUpperCase()}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                    <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
                </View>
            </View>

            <View style={styles.cardContent}>
                <Image source={{ uri: 'https://via.placeholder.com/60' }} style={styles.image} />
                <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{item.items[0]?.title} {item.items.length > 1 && `+ ${item.items.length - 1} más`}</Text>
                    <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.amount}>${item.totals.grandTotal}</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <MobileHeader title="Mis Pedidos" showBack onBack={() => navigation.goBack()} />

            {/* Tabs */}
            <View style={styles.tabsContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'purchases' && styles.tabActive]}
                    onPress={() => setActiveTab('purchases')}
                >
                    <Package size={20} color={activeTab === 'purchases' ? '#fff' : '#6B7280'} />
                    <Text style={[styles.tabText, activeTab === 'purchases' && styles.textActive]}>Compras</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'sales' && styles.tabActive]}
                    onPress={() => setActiveTab('sales')}
                >
                    <TrendingUp size={20} color={activeTab === 'sales' ? '#fff' : '#6B7280'} />
                    <Text style={[styles.tabText, activeTab === 'sales' && styles.textActive]}>Ventas</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={myOrders}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 16 }}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={{ color: '#9CA3AF' }}>No hay órdenes en esta sección</Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    tabsContainer: { flexDirection: 'row', padding: 16, gap: 12 },
    tab: { flex: 1, flexDirection: 'row', padding: 12, backgroundColor: '#fff', borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#E5E7EB' },
    tabActive: { backgroundColor: '#111827', borderColor: '#111827' },
    tabText: { color: '#6B7280', fontWeight: '600' },
    textActive: { color: '#fff' },

    card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    orderId: { fontWeight: 'bold', color: '#6B7280' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    statusText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

    cardContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    image: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#F3F4F6' },
    itemTitle: { fontWeight: '500', color: '#1F2937' },
    date: { fontSize: 12, color: '#9CA3AF' },
    amount: { fontWeight: 'bold', fontSize: 16, color: '#111827' },
    empty: { marginTop: 40, alignItems: 'center' }
});
