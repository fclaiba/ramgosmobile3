import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { useAuth } from '../../contexts/AuthContext';
import { Package, TrendingUp, Filter } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export default function OrderHistoryScreen({ navigation }: any) {
    const { user } = useAuth();

    // Tabs: 'purchases' | 'sales'
    const [activeTab, setActiveTab] = useState<'purchases' | 'sales'>('purchases');

    // Filter: 'active' | 'past'
    const [itemsFilter, setItemsFilter] = useState<'active' | 'past'>('active');

    // Data Fetching
    const purchases = useQuery(
        api.orders.getMyOrders,
        user ? { actorId: user.id as any, userId: user.id } : "skip"
    ) || [];
    const sales = useQuery(
        api.orders.getOrdersBySeller,
        user ? { actorId: user.id as any, sellerId: user.id } : "skip"
    ) || [];

    const rawList = activeTab === 'purchases' ? purchases : sales;

    // Filter Logic
    const filteredList = rawList.filter((o: any) => {
        const isActive = ['payment_received', 'in_transit', 'disputed'].includes(o.status);
        if (itemsFilter === 'active') return isActive;
        if (itemsFilter === 'past') return !isActive; // delivered, completed, cancelled
        return true;
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return '#059669'; // Green
            case 'delivered': return '#2563EB'; // Blue (Info)
            case 'in_transit': return '#D97706'; // Info color as per prompt (Yellow/Orange usually implies transit/wait)
            case 'disputed': return '#DC2626'; // Red
            case 'cancelled': return '#6B7280';
            case 'payment_received': return '#7C3AED';
            default: return '#6B7280';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'completed': return 'Completado';
            case 'delivered': return 'Entregado';
            case 'in_transit': return 'En camino';
            case 'disputed': return 'Disputa';
            case 'payment_received': return 'Pagado';
            case 'cancelled': return 'Cancelado';
            default: return status;
        }
    };

    const renderItem = ({ item }: any) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('OrderDetail', { order: item, role: activeTab === 'purchases' ? 'buyer' : 'seller' })}
        >
            <View style={styles.cardHeader}>
                <Text style={styles.orderId}>Orden #{item._id.slice(-6).toUpperCase()}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                    <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
                </View>
            </View>

            <View style={styles.cardContent}>
                {/* Placeholder Image - In real app fetch from listings */}
                <View style={styles.imagePlaceholder}>
                    <Package size={24} color="#9CA3AF" />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>
                        {item.items?.[0]?.title} {item.items?.length > 1 && `+ ${item.items.length - 1} más`}
                    </Text>
                    <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.amount}>${item.total?.toFixed(2) ?? item.totalAmount?.toFixed(2) ?? "0.00"}</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <MobileHeader title="Mis Pedidos" showBack onBack={() => navigation.goBack()} />

            {/* Mode Tabs (Purchases vs Sales) */}
            <View style={styles.tabsContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'purchases' && styles.tabActive]}
                    onPress={() => setActiveTab('purchases')}
                >
                    <Package size={20} color={activeTab === 'purchases' ? '#fff' : '#6B7280'} />
                    <Text style={[styles.tabText, activeTab === 'purchases' && styles.textActive]}>Mis Compras</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'sales' && styles.tabActive]}
                    onPress={() => setActiveTab('sales')}
                >
                    <TrendingUp size={20} color={activeTab === 'sales' ? '#fff' : '#6B7280'} />
                    <Text style={[styles.tabText, activeTab === 'sales' && styles.textActive]}>Mis Ventas</Text>
                </TouchableOpacity>
            </View>

            {/* Status Filter (Active vs Past) */}
            <View style={styles.filterContainer}>
                <TouchableOpacity
                    style={[styles.filterChip, itemsFilter === 'active' && styles.filterChipActive]}
                    onPress={() => setItemsFilter('active')}
                >
                    <Text style={[styles.filterText, itemsFilter === 'active' && styles.filterTextActive]}>En Curso</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.filterChip, itemsFilter === 'past' && styles.filterChipActive]}
                    onPress={() => setItemsFilter('past')}
                >
                    <Text style={[styles.filterText, itemsFilter === 'past' && styles.filterTextActive]}>Finalizadas</Text>
                </TouchableOpacity>
            </View>

            {!rawList ? (
                <View style={styles.empty}><ActivityIndicator size="large" color="#3B82F6" /></View>
            ) : (
                <FlatList
                    data={filteredList}
                    renderItem={renderItem}
                    keyExtractor={item => item._id}
                    contentContainerStyle={{ padding: 16 }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={{ color: '#9CA3AF' }}>No se encontraron órdenes.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    tabsContainer: { flexDirection: 'row', padding: 16, paddingBottom: 8, gap: 12 },
    tab: { flex: 1, flexDirection: 'row', padding: 12, backgroundColor: '#fff', borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#E5E7EB' },
    tabActive: { backgroundColor: '#111827', borderColor: '#111827' },
    tabText: { color: '#6B7280', fontWeight: '600' },
    textActive: { color: '#fff' },

    filterContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
    filterChip: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#E5E7EB' },
    filterChipActive: { backgroundColor: '#3B82F6' },
    filterText: { fontSize: 13, color: '#4B5563', fontWeight: '500' },
    filterTextActive: { color: '#fff', fontWeight: 'bold' },

    card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    orderId: { fontWeight: 'bold', color: '#6B7280' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    statusText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

    cardContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    imagePlaceholder: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    itemTitle: { fontWeight: '500', color: '#1F2937' },
    date: { fontSize: 12, color: '#9CA3AF' },
    amount: { fontWeight: 'bold', fontSize: 16, color: '#111827' },
    empty: { marginTop: 40, alignItems: 'center' }
});
