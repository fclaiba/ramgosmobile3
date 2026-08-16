import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useQuery } from 'convex/react';
import { TrendingUp, Eye, ShoppingBag, DollarSign } from 'lucide-react-native';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Radius } from '../../theme/tokens';

/**
 * "Cuánta plata me dio cada post" — the transparency promise from
 * docs/DISEÑO_RED_SOCIAL_COMMERCE.md §4.3.
 *
 * Reads `commerce.getCreatorCommerceDashboard`, which only ever returns the
 * caller's own attributed sales.
 */
export function CreatorEarningsPanel() {
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const data = useQuery(
        api.commerce.getCreatorCommerceDashboard,
        sessionToken ? { sessionToken, limit: 20 } : 'skip',
    );

    if (data === undefined) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color="#4F46E5" />
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.statsRow}>
                <Stat
                    icon={<DollarSign size={18} color="#10B981" />}
                    label="Ganado"
                    value={`$${data.totalEarningsUsd.toFixed(2)}`}
                    isDark={isDark}
                />
                <Stat
                    icon={<ShoppingBag size={18} color="#4F46E5" />}
                    label="Ventas"
                    value={String(data.totalSales)}
                    isDark={isDark}
                />
                <Stat
                    icon={<TrendingUp size={18} color="#F59E0B" />}
                    label="Volumen"
                    value={`$${data.totalRevenueUsd.toFixed(2)}`}
                    isDark={isDark}
                />
            </View>

            {data.pendingSales > 0 && (
                <Text style={styles.pending}>
                    {data.pendingSales} compra(s) esperando confirmación de pago.
                </Text>
            )}

            <Text style={styles.sectionTitle}>Posts que generaron ventas</Text>

            {data.topPosts.length === 0 ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyText}>
                        Todavía no hay ventas atribuidas a tus posts. Sumá un producto
                        con el botón de etiqueta al publicar.
                    </Text>
                </View>
            ) : (
                data.topPosts.map((post) => (
                    <View key={post.postId} style={styles.row}>
                        {post.image ? (
                            <Image source={{ uri: post.image }} style={styles.thumb} />
                        ) : (
                            <View style={[styles.thumb, styles.thumbEmpty]} />
                        )}
                        <View style={styles.rowInfo}>
                            <Text style={styles.rowTitle} numberOfLines={1}>
                                {post.productName || post.content || 'Post'}
                            </Text>
                            <View style={styles.rowMeta}>
                                <Eye size={12} color="#9CA3AF" />
                                <Text style={styles.rowMetaText}>{post.views}</Text>
                                <ShoppingBag size={12} color="#9CA3AF" />
                                <Text style={styles.rowMetaText}>{post.sales}</Text>
                            </View>
                        </View>
                        <Text style={styles.rowEarnings}>
                            ${post.earningsUsd.toFixed(2)}
                        </Text>
                    </View>
                ))
            )}
        </ScrollView>
    );
}

function Stat({
    icon,
    label,
    value,
    isDark,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    isDark: boolean;
}) {
    const styles = getStyles(isDark);
    return (
        <View style={styles.statCard}>
            {icon}
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    );
}

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: {
            padding: 16,
            gap: 12,
        },
        center: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 40,
        },
        statsRow: {
            flexDirection: 'row',
            gap: 10,
        },
        statCard: {
            flex: 1,
            alignItems: 'center',
            gap: 4,
            paddingVertical: 14,
            borderRadius: Radius.xl,
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
        },
        statValue: {
            fontSize: 18,
            fontWeight: '900',
            color: isDark ? '#FFF' : '#111827',
        },
        statLabel: {
            fontSize: 12,
            color: '#9CA3AF',
        },
        pending: {
            fontSize: 12,
            color: '#F59E0B',
            textAlign: 'center',
        },
        sectionTitle: {
            fontSize: 16,
            fontWeight: '800',
            marginTop: 8,
            color: isDark ? '#FFF' : '#111827',
        },
        empty: {
            padding: 24,
            alignItems: 'center',
        },
        emptyText: {
            color: '#9CA3AF',
            textAlign: 'center',
            fontSize: 13,
            lineHeight: 19,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
        },
        thumb: {
            width: 48,
            height: 48,
            borderRadius: Radius.lg,
        },
        thumbEmpty: {
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        },
        rowInfo: {
            flex: 1,
        },
        rowTitle: {
            fontSize: 14,
            fontWeight: '700',
            color: isDark ? '#FFF' : '#111827',
        },
        rowMeta: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginTop: 4,
        },
        rowMetaText: {
            fontSize: 12,
            color: '#9CA3AF',
            marginRight: 8,
        },
        rowEarnings: {
            fontSize: 15,
            fontWeight: '900',
            color: '#10B981',
        },
    });
