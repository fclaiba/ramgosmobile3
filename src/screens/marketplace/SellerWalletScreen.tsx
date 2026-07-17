import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { MARKETPLACE_ESCROW_RELEASE_DAYS, useMarketplace, Order } from '../../contexts/MarketplaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { useFintech } from '../../contexts/FintechContext';
import { useEscrow } from '../../contexts/EscrowContext';
import { DollarSign, Lock, AlertCircle, ArrowUpRight, ArrowDownLeft, ArrowUpRightFromSquare, Eye } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActionGate } from '../../utils/useActionGate';
import { useTheme } from '../../contexts/ThemeContext';

export default function SellerWalletScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { orders } = useMarketplace();
    const { user } = useAuth();
    const { getWalletByOwner } = useFintech();
    const { openEscrow } = useEscrow();
    const { gateWithdraw } = useActionGate();
    const [activeTab, setActiveTab] = useState<'sales' | 'transactions'>('sales');
    const insets = useSafeAreaInsets();

    const wallet = getWalletByOwner(user?.id ?? '');

    const handleViewEscrow = (order: Order) => {
        openEscrow(order.id, 'seller', { phase: 'status' });
    };

    // Filter seller orders
    const sales = orders.filter(o => o.sellerId === user?.id && o.paymentStatus === 'paid');

    // Calculate Balances
    const availableBalance = wallet?.balances.available ?? 0;
    const heldBalance = wallet?.balances.reserved ?? 0;
    const pendingBalance = wallet?.balances.pending ?? 0;

    const handleWithdraw = () => {
        if (!wallet) return;
        gateWithdraw({
            onAllowed: () => navigation.navigate('Withdrawal', { ownerId: wallet.ownerId }),
        });
    };

    const renderTransaction = ({ item }: any) => {
        const isDisputed = item.status === 'disputed';
        const releaseDate = item.escrow?.releaseScheduledAt
            ? new Date(item.escrow.releaseScheduledAt)
            : item.deliveryConfirmedAt
                ? new Date(new Date(item.deliveryConfirmedAt).getTime() + MARKETPLACE_ESCROW_RELEASE_DAYS * 24 * 60 * 60 * 1000)
                : null;

        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <Text style={styles.orderId}>Orden #{item.id.slice(-6)}</Text>
                    <Text style={[
                        styles.amount,
                        isDisputed ? { color: '#EF4444' } : { color: '#059669' }
                    ]}>
                        ${item.totals.grandTotal.toFixed(2)}
                    </Text>
                </View>

                <Text style={styles.itemTitle}>{item.items[0]?.title}</Text>

                {isDisputed ? (
                    <View style={styles.warnBadge}>
                        <AlertCircle size={12} color="#EF4444" />
                        <Text style={styles.warnText}>RETENIDO POR DISPUTA</Text>
                    </View>
                ) : (
                    <View style={styles.dateRow}>
                        <Lock size={12} color="#6B7280" />
                        <Text style={styles.dateText}>
                            {releaseDate
                                ? `Se libera el ${releaseDate.toLocaleDateString()}`
                                : 'Esperando entrega'}
                        </Text>
                    </View>
                )}

                <TouchableOpacity
                    style={styles.viewEscrowBtn}
                    onPress={() => handleViewEscrow(item)}
                >
                    <Eye size={14} color="#7C3AED" />
                    <Text style={styles.viewEscrowText}>Ver escrow</Text>
                </TouchableOpacity>
            </View>
        );
    };

    const renderWalletTransaction = ({ item }: { item: any }) => {
        const isCredit = item.type === 'credit';
        return (
            <View style={styles.transactionCard}>
                <View style={[styles.transactionIcon, isCredit ? styles.iconCredit : styles.iconDebit]}>
                    {isCredit ? <ArrowDownLeft size={18} color="#059669" /> : <ArrowUpRightFromSquare size={18} color="#DC2626" />}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.transactionDesc}>{item.description}</Text>
                    <Text style={styles.transactionDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                </View>
                <Text style={[styles.transactionAmount, isCredit ? { color: '#059669' } : { color: '#DC2626' }]}>
                    {isCredit ? '+' : '-'}${item.amount.toFixed(2)}
                </Text>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <MobileHeader title="Billetera Vendedor" showBack onBack={() => navigation.goBack()} />

            <View style={{ padding: 16 }}>
                {/* Balance Cards */}
                <View style={styles.balanceContainer}>
                    <View style={[styles.balanceCard, styles.availableCard]}>
                        <View style={styles.iconBgAvailable}>
                            <DollarSign size={24} color="#059669" />
                        </View>
                        <Text style={styles.balanceLabel}>Disponible</Text>
                        <Text style={styles.balanceValue}>${availableBalance.toFixed(2)}</Text>
                        <TouchableOpacity
                            style={styles.withdrawBtn}
                            onPress={handleWithdraw}
                        >
                            <Text style={styles.withdrawText}>Retirar</Text>
                            <ArrowUpRight size={14} color="#059669" />
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.balanceCard, styles.heldCard]}>
                        <View style={styles.iconBgHeld}>
                            <Lock size={24} color="#D97706" />
                        </View>
                        <Text style={styles.balanceLabel}>En Retención</Text>
                        <Text style={styles.balanceValue}>${heldBalance.toFixed(2)}</Text>
                        <Text style={styles.heldHint}>Escrow {MARKETPLACE_ESCROW_RELEASE_DAYS} días</Text>
                    </View>
                </View>

                {/* Tabs */}
                <View style={styles.tabs}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'sales' && styles.tabActive]}
                        onPress={() => setActiveTab('sales')}
                    >
                        <Text style={[styles.tabText, activeTab === 'sales' && styles.tabTextActive]}>Ventas</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'transactions' && styles.tabActive]}
                        onPress={() => setActiveTab('transactions')}
                    >
                        <Text style={[styles.tabText, activeTab === 'transactions' && styles.tabTextActive]}>Movimientos</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {activeTab === 'sales' ? (
                <FlatList
                    data={sales.filter(o => o.escrow?.state !== 'released')}
                    renderItem={renderTransaction}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 20) + 24 }}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <Text style={styles.emptyText}>No tienes fondos pendientes.</Text>
                    }
                />
            ) : (
                <FlatList
                    data={wallet?.transactions || []}
                    renderItem={renderWalletTransaction}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 20) + 24 }}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <Text style={styles.emptyText}>No hay movimientos registrados.</Text>
                    }
                />
            )}
        </View>
    );
}

const getStyles = (isDark: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },

    balanceContainer: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    balanceCard: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'flex-start', borderWidth: 1 },

    availableCard: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
    heldCard: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },

    iconBgAvailable: { backgroundColor: '#D1FAE5', padding: 8, borderRadius: 12, marginBottom: 12 },
    iconBgHeld: { backgroundColor: '#FEF3C7', padding: 8, borderRadius: 12, marginBottom: 12 },

    balanceLabel: { fontSize: 13, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280', fontWeight: '500' },
    balanceValue: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginVertical: 4 },

    withdrawBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, gap: 4 },
    withdrawText: { fontSize: 12, fontWeight: 'bold', color: '#059669' },

    heldHint: { fontSize: 11, color: '#B45309' },

    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937', marginBottom: 12 },

    card: { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: isDark ? '#F9FAFB' : '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    orderId: { fontSize: 12, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280', fontWeight: '600' },
    amount: { fontSize: 16, fontWeight: 'bold' },
    itemTitle: { fontSize: 14, color: isDark ? '#D1D5DB' : '#374151', marginBottom: 12 },

    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    dateText: { fontSize: 11, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280' },

    warnBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    warnText: { fontSize: 10, color: '#EF4444', fontWeight: 'bold' },

    tabs: { flexDirection: 'row', marginBottom: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)', borderRadius: 8, padding: 4 },
    tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
    tabActive: { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)', shadowColor: isDark ? '#F9FAFB' : '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    tabText: { fontSize: 13, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280', fontWeight: '500' },
    tabTextActive: { color: '#111827', fontWeight: '600' },
    emptyText: { textAlign: 'center', color: isDark ? '#6B7280' : '#9CA3AF', marginTop: 20 },

    transactionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)', padding: 16, borderRadius: 12, marginBottom: 12, gap: 12 },
    transactionIcon: { padding: 10, borderRadius: 10 },
    iconCredit: { backgroundColor: '#ECFDF5' },
    iconDebit: { backgroundColor: '#FEF2F2' },
    transactionDesc: { fontSize: 14, color: isDark ? '#D1D5DB' : '#374151', fontWeight: '500' },
    transactionDate: { fontSize: 12, color: isDark ? '#6B7280' : '#9CA3AF' },
    transactionAmount: { fontSize: 15, fontWeight: 'bold' },

    viewEscrowBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#FAFAFA', borderRadius: 8, alignSelf: 'flex-start' },
    viewEscrowText: { fontSize: 12, fontWeight: '600', color: '#7C3AED' },
});
