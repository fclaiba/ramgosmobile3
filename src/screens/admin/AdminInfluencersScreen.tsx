import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Users, DollarSign, TrendingDown } from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { colors } from '../../theme/tokens';

export default function AdminInfluencersScreen() {
    const insets = useSafeAreaInsets();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { sessionToken } = useAuth();
    
    const queryArgs = sessionToken ? { sessionToken } : 'skip';
    
    const influencerBalances = useQuery(
        api.finance.listInfluencerBalances,
        queryArgs
    );
    
    const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)} USD`;
    
    const styles = useMemo(() => getStyles(isDark, insets), [isDark, insets]);
    
    const totalPending = influencerBalances?.reduce((sum, inf) => sum + Math.max(0, inf.amountCents), 0) || 0;
    
    return (
        <View style={styles.container}>
            <MobileHeader title="Pagos a Influencers" showBackButton />
            
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>A Pagar este Viernes</Text>
                    <Text style={styles.summaryTotal}>{formatCurrency(totalPending)}</Text>
                    <Text style={styles.summarySubtitle}>Comisiones netas listas para transferir</Text>
                </View>
                
                <Text style={styles.sectionTitle}>Saldos por Influencer</Text>
                
                {influencerBalances === undefined ? (
                    <ActivityIndicator size="large" color={colors.primary.base} style={{ marginTop: 40 }} />
                ) : influencerBalances.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Users size={32} color={isDark ? colors.gray[500] : colors.gray[400]} />
                        <Text style={styles.emptyText}>No hay comisiones pendientes</Text>
                    </View>
                ) : (
                    influencerBalances.map((inf) => {
                        const isNegative = inf.amountCents < 0;
                        return (
                            <View key={inf.influencerId} style={styles.influencerCard}>
                                <View style={styles.influencerHeader}>
                                    <View style={styles.iconContainer}>
                                        <Users size={20} color={colors.primary.base} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.influencerId}>User: {inf.influencerId.slice(0, 10)}...</Text>
                                        <Text style={styles.detailText}>
                                            {inf.paymentIds.length} ventas pendientes, {inf.clawbackIds.length} ajustes
                                        </Text>
                                    </View>
                                </View>
                                
                                <View style={[styles.balanceBadge, isNegative && styles.negativeBadge]}>
                                    <Text style={[styles.balanceText, isNegative && styles.negativeText]}>
                                        {isNegative ? '-' : ''}{formatCurrency(Math.abs(inf.amountCents))}
                                    </Text>
                                </View>
                                
                                {isNegative && (
                                    <Text style={styles.clawbackWarning}>
                                        <TrendingDown size={14} color={colors.semantic.error} />
                                        {' '}Saldo negativo por devoluciones. Se descontará de futuras ventas.
                                    </Text>
                                )}
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </View>
    );
}

function getStyles(isDark: boolean, insets: any) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: isDark ? colors.gray[900] : colors.gray[50],
        },
        scroll: {
            padding: 16,
            paddingBottom: insets.bottom + 24,
        },
        summaryCard: {
            backgroundColor: colors.primary.base,
            borderRadius: 16,
            padding: 24,
            alignItems: 'center',
            marginBottom: 24,
        },
        summaryTitle: {
            color: 'rgba(255,255,255,0.8)',
            fontSize: 14,
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 8,
        },
        summaryTotal: {
            color: 'white',
            fontSize: 36,
            fontWeight: 'bold',
            marginBottom: 4,
        },
        summarySubtitle: {
            color: 'rgba(255,255,255,0.9)',
            fontSize: 14,
        },
        sectionTitle: {
            fontSize: 18,
            fontWeight: 'bold',
            color: isDark ? 'white' : colors.gray[900],
            marginBottom: 16,
        },
        influencerCard: {
            backgroundColor: isDark ? colors.gray[800] : 'white',
            borderRadius: 12,
            padding: 16,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: isDark ? colors.gray[700] : colors.gray[200],
        },
        influencerHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 12,
        },
        iconContainer: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: isDark ? colors.gray[700] : colors.primary.light,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
        },
        influencerId: {
            fontSize: 16,
            fontWeight: '600',
            color: isDark ? 'white' : colors.gray[900],
        },
        detailText: {
            fontSize: 14,
            color: isDark ? colors.gray[400] : colors.gray[500],
            marginTop: 2,
        },
        balanceBadge: {
            backgroundColor: isDark ? 'rgba(52, 211, 153, 0.1)' : '#DCFCE7',
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
            alignSelf: 'flex-start',
        },
        negativeBadge: {
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEE2E2',
        },
        balanceText: {
            color: isDark ? '#34D399' : '#16A34A',
            fontWeight: 'bold',
            fontSize: 16,
        },
        negativeText: {
            color: colors.semantic.error,
        },
        emptyState: {
            alignItems: 'center',
            justifyContent: 'center',
            padding: 40,
        },
        emptyText: {
            marginTop: 12,
            color: isDark ? colors.gray[500] : colors.gray[400],
            fontSize: 16,
        },
        clawbackWarning: {
            marginTop: 12,
            color: colors.semantic.error,
            fontSize: 13,
            flexDirection: 'row',
            alignItems: 'center',
        }
    });
}
