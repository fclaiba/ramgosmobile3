import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { DollarSign, TrendingUp, Wallet, ShieldCheck } from "lucide-react-native";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { formatCurrency } from "../../utils/formatters";

export function WalletStats({
    styles,
    metricsLayout,
    isDark,
    commissionStats,
    handleWithdrawPress,
    kycStatus,
    kycStatusLabel,
    latestCommission,
    wallet,
    reservedBalance
}: any) {
    return (
        <>
            {/* STATS OVERVIEW */}
            <View
                style={[
                    styles.statsRow,
                    {
                        width: '100%',
                        maxWidth: metricsLayout.containerWidth,
                        alignSelf: 'center',
                        flexDirection: metricsLayout.stackTwoColSections ? 'column' : 'row',
                        gap: metricsLayout.gap,
                    },
                ]}
            >
                <Card style={[styles.statCard, { flex: 1, backgroundColor: isDark ? '#1F2937' : '#fff' }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(5, 150, 105, 0.2)' : '#ecfdf5' }]}>
                            <DollarSign size={20} color={isDark ? '#34D399' : '#059669'} />
                        </View>
                        <Badge variant="secondary" style={{ backgroundColor: isDark ? 'rgba(5, 150, 105, 0.2)' : '#ecfdf5' }}>
                            <Text style={{ color: isDark ? '#34D399' : '#059669', fontSize: 10 }}>Disponible</Text>
                        </Badge>
                    </View>
                    <Text style={styles.statValue}>{formatCurrency(commissionStats.available)}</Text>
                    <TouchableOpacity onPress={handleWithdrawPress} style={{ marginTop: 8 }}>
                        <Text style={{ color: isDark ? '#34D399' : '#059669', fontSize: 12, fontWeight: 'bold' }}>
                            {kycStatus === 'approved' ? 'Solicitar Retiro →' : 'Completar KYC →'}
                        </Text>
                    </TouchableOpacity>
                </Card>
                <Card style={[styles.statCard, { flex: 1, backgroundColor: isDark ? '#1F2937' : '#fff' }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(234, 88, 12, 0.2)' : '#fff7ed' }]}>
                            <TrendingUp size={20} color={isDark ? '#FB923C' : '#ea580c'} />
                        </View>
                        <Badge variant="secondary" style={{ backgroundColor: isDark ? 'rgba(234, 88, 12, 0.2)' : '#fff7ed' }}>
                            <Text style={{ color: isDark ? '#FB923C' : '#ea580c', fontSize: 10 }}>Pendiente</Text>
                        </Badge>
                    </View>
                    <Text style={styles.statValue}>{formatCurrency(commissionStats.pending)}</Text>
                    <Text style={{ fontSize: 10, color: isDark ? '#9CA3AF' : '#666', marginTop: 4 }}>
                        Próx. pago: {latestCommission ? new Date(latestCommission.createdAt).toLocaleDateString('es-ES') : '30 Oct'}
                    </Text>
                </Card>
            </View>

            {wallet && (
                <Card style={[styles.walletCard, { width: '100%', maxWidth: metricsLayout.containerWidth, alignSelf: 'center' }]}>
                    <View style={styles.walletHeader}>
                        <View style={styles.walletIcon}>
                            <Wallet size={18} color={isDark ? "#F9FAFB" : "#0f172a"} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.walletTitle}>Billetera de comisiones</Text>
                            <Text style={styles.walletSubtitle}>
                                Disponible {formatCurrency(commissionStats.available)}
                            </Text>
                        </View>
                        <Badge variant="outline" style={styles.walletBadge}>
                            <ShieldCheck
                                size={12}
                                color={kycStatus === 'approved' ? '#047857' : '#9CA3AF'}
                                style={{ marginRight: 4 }}
                            />
                            <Text style={styles.walletBadgeText}>{kycStatusLabel}</Text>
                        </Badge>
                    </View>
                    <View style={styles.walletRow}>
                        <Text style={styles.walletLabel}>Pendiente</Text>
                        <Text style={styles.walletValue}>{formatCurrency(commissionStats.pending)}</Text>
                    </View>
                    <View style={styles.walletRow}>
                        <Text style={styles.walletLabel}>Reservado</Text>
                        <Text style={styles.walletValue}>{formatCurrency(reservedBalance)}</Text>
                    </View>
                    {latestCommission && (
                        <View style={styles.walletSplit}>
                            <Text style={styles.walletSplitTitle}>Última comisión generada</Text>
                            <View style={styles.walletSplitRow}>
                                <Text style={styles.walletSplitLabel}>Pago</Text>
                                <Text style={styles.walletSplitValue}>
                                    {formatCurrency(latestCommission.amount)}
                                </Text>
                            </View>
                            <View style={styles.walletSplitRow}>
                                <Text style={styles.walletSplitLabel}>Tu parte</Text>
                                <Text style={styles.walletSplitValue}>
                                    {formatCurrency(latestCommission.split.influencerAmount)}
                                </Text>
                            </View>
                            <View style={styles.walletSplitRow}>
                                <Text style={styles.walletSplitLabel}>Proveedor</Text>
                                <Text style={styles.walletSplitValue}>{latestCommission.provider.toUpperCase()}</Text>
                            </View>
                        </View>
                    )}
                </Card>
            )}
        </>
    );
}
