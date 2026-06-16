import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Wallet, BarChart3, Trophy } from "lucide-react-native";
import { Badge } from "../ui/badge";
import { formatCurrency, formatDateShort } from "../../utils/formatters";

export function OverviewTab({
    styles,
    layout,
    summaryCards,
    availableBalance,
    pendingBalance,
    withheldBalance,
    isVerified,
    wallet,
    handleWithdrawal,
    metrics,
    chartData,
    isDark
}: any) {
    return (
        <View style={styles.sectionGap}>
            {/* Summary Grid */}
            <View style={[styles.grid, { gap: layout.gap }]}>
                {summaryCards.map((card: any) => (
                    <View
                        key={card.id}
                        style={[
                            styles.summaryCard,
                            { width: layout.summaryCardWidth },
                        ]}
                    >
                        <LinearGradient
                            colors={card.colors}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.summaryContent}>
                            <View style={styles.summaryIconCircle}>
                                <card.icon size={18} color={card.colors[0]} />
                            </View>
                            <Text style={styles.summaryValue}>{card.value}</Text>
                            <Text style={styles.summaryLabel}>{card.label}</Text>
                        </View>
                    </View>
                ))}
            </View>

            {/* Balance Card */}
            <View style={styles.balanceCard}>
                <LinearGradient
                    colors={
                        isDark ? ["#111827", "#000000"] : ["#111827", "#1F2937"]
                    }
                    style={styles.balanceHeader}
                >
                    <View
                        style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                        }}
                    >
                        <View>
                            <Text style={styles.balanceLabelLight}>
                                Saldo Disponible
                            </Text>
                            <Text style={styles.balanceValueMain}>
                                {formatCurrency(availableBalance)}
                            </Text>
                        </View>
                        <View style={styles.walletIcon}>
                            <Wallet size={20} color="#fff" />
                        </View>
                    </View>
                    <View style={styles.balanceStatsRow}>
                        <View>
                            <Text style={styles.balanceStatLabel}>Pendiente</Text>
                            <Text style={styles.balanceStatValue}>
                                {formatCurrency(pendingBalance)}
                            </Text>
                        </View>
                        <View style={styles.dividerVertical} />
                        <View>
                            <Text style={styles.balanceStatLabel}>Retenido</Text>
                            <Text style={styles.balanceStatValue}>
                                {formatCurrency(withheldBalance)}
                            </Text>
                        </View>
                    </View>
                </LinearGradient>

                <View style={styles.balanceActions}>
                    <TouchableOpacity
                        style={[
                            styles.withdrawBtn,
                            (!isVerified ||
                                (wallet?.balances?.available ?? 0) < 10) &&
                            styles.withdrawBtnDisabled,
                        ]}
                        onPress={handleWithdrawal}
                        disabled={
                            !isVerified ||
                            !wallet ||
                            (wallet?.balances?.available ?? 0) < 10
                        }
                    >
                        <Text
                            style={[
                                styles.withdrawBtnText,
                                (!isVerified ||
                                    (wallet?.balances?.available ?? 0) < 10) &&
                                styles.withdrawBtnTextDisabled,
                            ]}
                        >
                            Solicitar retiro
                        </Text>
                    </TouchableOpacity>
                    {!!metrics?.payoutProjection?.nextPayoutDate && (
                        <Text style={styles.payoutDate}>
                            Próximo pago:{" "}
                            {formatDateShort(metrics.payoutProjection.nextPayoutDate)}
                        </Text>
                    )}
                </View>
            </View>

            {/* Revenue Chart */}
            <View style={styles.chartCard}>
                <View style={styles.cardHeader}>
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <BarChart3
                            size={20}
                            color={isDark ? "#D1D5DB" : "#374151"}
                        />
                        <Text style={styles.cardTitle}>Resultados Semanales</Text>
                    </View>
                    <Badge variant="secondary">
                        <Text
                            style={{
                                fontSize: 10,
                                color: isDark ? "#D1D5DB" : "#000",
                            }}
                        >
                            7 Días
                        </Text>
                    </Badge>
                </View>

                <View style={styles.chartArea}>
                    {chartData.map((d: any, i: number) => (
                        <View key={i} style={styles.barGroup}>
                            <View style={styles.barTrack}>
                                <LinearGradient
                                    colors={["#8B5CF6", "#Ec4899"]}
                                    style={[
                                        styles.barFill,
                                        { height: `${d.heightPercent}%` },
                                    ]}
                                />
                            </View>
                            <Text style={styles.barLabel}>{d.label}</Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* Top Coupons */}
            <View style={styles.listCard}>
                <View
                    style={[
                        styles.cardHeader,
                        {
                            padding: 16,
                            marginBottom: 0,
                            borderBottomWidth: 1,
                            borderBottomColor: isDark ? "#374151" : "#F3F4F6",
                        },
                    ]}
                >
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <Trophy size={20} color="#F59E0B" />
                        <Text style={styles.cardTitle}>Bonos Destacados</Text>
                    </View>
                </View>
                {metrics?.couponLeaders?.map((item: any, index: number) => (
                    <View
                        key={item.id}
                        style={[
                            styles.listItem,
                            index === metrics.couponLeaders.length - 1 && {
                                borderBottomWidth: 0,
                            },
                        ]}
                    >
                        <View style={styles.rankBadge}>
                            <Text style={styles.rankText}>#{index + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>{item.name}</Text>
                            <Text style={styles.itemSub}>
                                {item.redeemed} canjes • {item.stockLeft} disponibles
                            </Text>
                        </View>
                        <Text style={styles.itemValue}>
                            {formatCurrency(item.revenue)}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}
