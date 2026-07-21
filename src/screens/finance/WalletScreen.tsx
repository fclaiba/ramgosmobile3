import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useWallet } from '../../contexts/WalletContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { ArrowUpRight, ArrowDownLeft, Clock, Wallet as WalletIcon, DollarSign } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { glassShadow, Radius, colors } from '../../theme/tokens';


export default function WalletScreen() {
    const { user } = useAuth();
    const { getWallet, transactions, simulateTimePass } = useWallet();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    // In a real app, userId would come from auth context. 
    // For demo purposes, we might be looking at 'seller_1' or 'inf_1' or the logged in user.
    // Let's assume the logged in user is the one looking.
    // However, our mock wallet setup in WalletContext might need to be aligned.
    // For now, let's use a hardcoded 'seller_1' if user is seller, or just use the auth user id.
    const walletUserId = user?.id || 'seller_1'; // Fallback for dev testing
    const wallet = getWallet(walletUserId);

    const myTransactions = transactions.filter(tx => tx.relatedUserId === walletUserId);

    const handleWithdraw = () => {
        if (wallet.balanceAvailable <= 0) {
            show('No tienes fondos disponibles para retirar.', 'error');
            return;
        }
        show(`Se ha iniciado la transferencia de $${wallet.balanceAvailable.toFixed(2)} a tu CBU vinculado.`, 'success');
    };

    const handleSimulateTime = () => {
        simulateTimePass(10);
        show('Modo Desarrollador. Se ha simulado el paso de 10 días. Fondos en Escrow liberados.', 'info');
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Mi Billetera</Text>
                {/* Dev Tool */}
                <TouchableOpacity onPress={handleSimulateTime} style={{ padding: 8 }}>
                    <Clock size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                </TouchableOpacity>
            </View>

            {/* Balance Cards */}
            <View style={styles.balanceContainer}>
                <LinearGradient
                    colors={['#2196F3', '#1565C0']}
                    style={styles.mainCard}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View>
                            <Text style={styles.balanceLabel}>Saldo Disponible</Text>
                            <Text style={styles.balanceAmount}>${wallet.balanceAvailable.toFixed(2)}</Text>
                        </View>
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: Radius.md }}>
                            <WalletIcon size={24} color="#fff" />
                        </View>
                    </View>
                    <TouchableOpacity style={styles.withdrawBtn} onPress={handleWithdraw}>
                        <Text style={styles.withdrawText}>Retirar Fondos</Text>
                        <ArrowUpRight size={16} color="#2196F3" />
                    </TouchableOpacity>
                </LinearGradient>

                <View style={styles.secondaryCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Clock size={16} color={isDark ? '#FCD34D' : '#D97706'} />
                        <Text style={styles.secondaryLabel}>En Retención (Escrow)</Text>
                    </View>
                    <Text style={styles.secondaryAmount}>${wallet.balancePending.toFixed(2)}</Text>
                <Text style={styles.secondarySubtext}>Se libera en ~10 días</Text>
                </View>
            </View>

            {/* Transactions History */}
            <Text style={styles.sectionTitle}>Movimientos Recientes</Text>

            <View style={styles.txList}>
                {myTransactions.length === 0 ? (
                    <Text style={styles.emptyText}>No hay movimientos registrados.</Text>
                ) : (
                    myTransactions.map(tx => (
                        <View key={tx.id} style={styles.txItem}>
                            <View style={[styles.iconBox, { backgroundColor: tx.type === 'PAYOUT_SELLER' || tx.type === 'COMMISSION_INFLUENCER' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)' }]}>
                                {tx.type === 'PAYMENT_IN' ? (
                                    <ArrowDownLeft size={20} color="#EF4444" />
                                ) : (
                                    <ArrowDownLeft size={20} color="#22C55E" />
                                )}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.txDesc}>{tx.description}</Text>
                                <Text style={styles.txDate}>{new Date(tx.date).toLocaleDateString()} • {tx.status === 'PENDING' ? 'Pendiente' : 'Completado'}</Text>
                            </View>
                            <Text style={[styles.txAmount, { color: tx.status === 'PENDING' ? '#F59E0B' : (isDark ? '#F9FAFB' : '#111827') }]}>
                                +${tx.amount.toFixed(2)}
                            </Text>
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors(isDark).bg,
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
        marginTop: 40 // Safe area
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: colors(isDark).text,
    },
    balanceContainer: {
        gap: 16,
        marginBottom: 32,
    },
    mainCard: {
        borderRadius: Radius.xl,
        padding: 24,
        ...glassShadow(isDark),
    },
    balanceLabel: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        marginBottom: 8,
        fontWeight: '500'
    },
    balanceAmount: {
        color: '#fff',
        fontSize: 36,
        fontWeight: '800',
        marginBottom: 24,
    },
    withdrawBtn: {
        backgroundColor: 'rgba(255,255,255,0.62)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: Radius.md,
        gap: 8,
    },
    withdrawText: {
        color: '#2196F3',
        fontWeight: '700',
        fontSize: 15,
    },
    secondaryCard: {
        backgroundColor: colors(isDark).glass,
        borderRadius: Radius.xl,
        padding: 20,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
    },
    secondaryLabel: {
        color: colors(isDark).textMuted,
        fontWeight: '600',
        fontSize: 14,
    },
    secondaryAmount: {
        fontSize: 24,
        fontWeight: '700',
        color: colors(isDark).text,
        marginTop: 4,
    },
    secondarySubtext: {
        fontSize: 12,
        color: colors(isDark).textMuted,
        marginTop: 4,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors(isDark).text,
        marginBottom: 16,
    },
    txList: {
        backgroundColor: colors(isDark).glass,
        borderRadius: Radius.lg,
        padding: 8,
    },
    emptyText: {
        padding: 20,
        textAlign: 'center',
        color: colors(isDark).textMuted,
    },
    txItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: Radius.md,
        justifyContent: 'center',
        alignItems: 'center',
    },
    txDesc: {
        fontSize: 15,
        fontWeight: '600',
        color: colors(isDark).text,
        marginBottom: 2,
    },
    txDate: {
        fontSize: 12,
        color: colors(isDark).textMuted,
    },
    txAmount: {
        fontSize: 16,
        fontWeight: '700',
    }
});
