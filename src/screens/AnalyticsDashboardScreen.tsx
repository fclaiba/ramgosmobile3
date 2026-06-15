import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, TrendingUp, DollarSign, Package, Users, Activity, BarChart3, Clock, Wallet } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigation } from '@react-navigation/native';

export default function AnalyticsDashboardScreen() {
    const { width } = useWindowDimensions();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { user } = useAuth();
    const navigation = useNavigation<any>();

    // We fetch orders using a standard convex query. Adjust according to your real schema.
    const orders = useQuery(api.orders?.getOrdersBySeller as any, { sellerId: user?.id }) || [];
    
    const stats = useMemo(() => {
        let totalRevenue = 0;
        let pendingRevenue = 0;
        let totalSales = 0;
        let uniqueCustomers = new Set();

        orders.forEach((order: any) => {
            if (order.status === 'completed' || order.status === 'delivered') {
                totalRevenue += order.totalAmount;
                totalSales += 1;
                uniqueCustomers.add(order.buyerId);
            } else if (order.status === 'pending' || order.status === 'escrow') {
                pendingRevenue += order.totalAmount;
            }
        });

        return {
            totalRevenue,
            pendingRevenue,
            totalSales,
            customersCount: uniqueCustomers.size,
        };
    }, [orders]);

    return (
        <SafeAreaView style={styles.container}>
            <LinearGradient colors={isDark ? ['#111827', '#1F2937'] : ['#F9FAFB', '#F3F4F6']} style={StyleSheet.absoluteFill} />
            
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft size={24} color={isDark ? '#F9FAFB' : '#111827'} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Estadísticas y Ganancias</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Balance Cards */}
                <View style={styles.balanceContainer}>
                    <LinearGradient
                        colors={['#4F46E5', '#3730A3']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.mainBalanceCard}
                    >
                        <View style={styles.balanceHeader}>
                            <Wallet size={20} color="rgba(255,255,255,0.8)" />
                            <Text style={styles.balanceLabel}>Ingresos Disponibles</Text>
                        </View>
                        <Text style={styles.balanceAmount}>${stats.totalRevenue.toFixed(2)}</Text>
                        <TouchableOpacity style={styles.withdrawBtn} onPress={() => navigation.navigate('Withdrawal')}>
                            <Text style={styles.withdrawBtnText}>Retirar fondos</Text>
                        </TouchableOpacity>
                    </LinearGradient>

                    <View style={styles.pendingBalanceCard}>
                        <View style={styles.balanceHeader}>
                            <Clock size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                            <Text style={[styles.balanceLabel, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>En Custodia (Escrow)</Text>
                        </View>
                        <Text style={[styles.balanceAmount, { fontSize: 24, color: isDark ? '#F9FAFB' : '#111827' }]}>
                            ${stats.pendingRevenue.toFixed(2)}
                        </Text>
                    </View>
                </View>

                <Text style={styles.sectionTitle}>Rendimiento General</Text>

                <View style={styles.statsGrid}>
                    <View style={styles.statBox}>
                        <View style={[styles.statIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                            <Package size={20} color="#10B981" />
                        </View>
                        <Text style={styles.statValue}>{stats.totalSales}</Text>
                        <Text style={styles.statDesc}>Ventas totales</Text>
                    </View>
                    <View style={styles.statBox}>
                        <View style={[styles.statIconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                            <Users size={20} color="#3B82F6" />
                        </View>
                        <Text style={styles.statValue}>{stats.customersCount}</Text>
                        <Text style={styles.statDesc}>Clientes únicos</Text>
                    </View>
                    <View style={styles.statBox}>
                        <View style={[styles.statIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                            <TrendingUp size={20} color="#F59E0B" />
                        </View>
                        <Text style={styles.statValue}>
                            ${stats.totalSales > 0 ? (stats.totalRevenue / stats.totalSales).toFixed(2) : '0.00'}
                        </Text>
                        <Text style={styles.statDesc}>Ticket promedio</Text>
                    </View>
                    <View style={styles.statBox}>
                        <View style={[styles.statIconWrap, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
                            <Activity size={20} color="#8B5CF6" />
                        </View>
                        <Text style={styles.statValue}>+12%</Text>
                        <Text style={styles.statDesc}>Crecimiento (mes)</Text>
                    </View>
                </View>

                {/* Placeholder for real charts */}
                <Text style={styles.sectionTitle}>Tendencia de Ventas</Text>
                <View style={styles.chartPlaceholder}>
                    <BarChart3 size={48} color={isDark ? '#374151' : '#E5E7EB'} />
                    <Text style={styles.chartText}>Recopilando datos para generar gráficos...</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const getStyles = (isDark: boolean) => {
    const bg = isDark ? '#111827' : '#F9FAFB';
    const cardBg = isDark ? '#1F2937' : '#FFFFFF';
    const text = isDark ? '#F9FAFB' : '#111827';
    const muted = isDark ? '#9CA3AF' : '#6B7280';
    const border = isDark ? '#374151' : '#E5E7EB';

    return StyleSheet.create({
        container: { flex: 1, backgroundColor: bg },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
        backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: cardBg, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: border },
        headerTitle: { fontSize: 18, fontWeight: '800', color: text },

        scrollContent: { padding: 20, paddingBottom: 100 },

        balanceContainer: { gap: 16, marginBottom: 32 },
        mainBalanceCard: { borderRadius: 24, padding: 24, shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
        balanceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
        balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '500' },
        balanceAmount: { color: '#fff', fontSize: 36, fontWeight: '800', marginBottom: 20 },
        withdrawBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
        withdrawBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

        pendingBalanceCard: { backgroundColor: cardBg, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: border },

        sectionTitle: { fontSize: 18, fontWeight: '700', color: text, marginBottom: 16 },

        statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 32 },
        statBox: { width: '47%', backgroundColor: cardBg, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: border },
        statIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
        statValue: { fontSize: 20, fontWeight: '800', color: text, marginBottom: 4 },
        statDesc: { fontSize: 12, color: muted, fontWeight: '500' },

        chartPlaceholder: { height: 200, backgroundColor: cardBg, borderRadius: 24, borderWidth: 1, borderColor: border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
        chartText: { marginTop: 12, fontSize: 14, color: muted, fontWeight: '500' },
    });
};
