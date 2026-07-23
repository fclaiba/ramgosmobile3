import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrendingUp, MousePointerClick, BadgeDollarSign, Target } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { glassSurface, glassChip } from '../../utils/glass';
import { formatCurrency } from '../../utils/formatters';

interface MetricsProps {
    metrics: {
        clicks: { total: number };
        conversion: { rate: number };
        commissions: { total: number; available: number; pending: number };
    };
    level: { current: string; next: string; min: number; max: number; color: string };
    progress: number;
    containerWidth?: number;
}

export default function InfluencerMetrics({ metrics, level, progress, containerWidth }: MetricsProps) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    const cardStyle = [styles.card, glassSurface(isDark, 'subtle')];
    const textPrimary = { color: isDark ? '#fff' : '#111827' };
    const textSecondary = { color: isDark ? '#9CA3AF' : '#6B7280' };

    return (
        <View style={[styles.container, containerWidth ? { maxWidth: containerWidth } : undefined]}>
            {/* Level Progress */}
            <View style={[styles.levelContainer, glassSurface(isDark, 'subtle')]}>
                <View style={styles.levelHeader}>
                    <Text style={[styles.levelTitle, textPrimary]}>Nivel Actual: <Text style={{ color: level.color }}>{level.current}</Text></Text>
                    <View style={glassChip(isDark, level.color)}>
                        <Target size={12} color={level.color} />
                        <Text style={{ color: level.color, fontSize: 12, fontWeight: '600' }}>Rumbo a {level.next}</Text>
                    </View>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                    <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: level.color }]} />
                </View>
            </View>

            {/* Metrics Grid */}
            <View style={styles.grid}>
                {/* Ganancias */}
                <View style={cardStyle}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5' }]}>
                            <BadgeDollarSign size={18} color={isDark ? '#34D399' : '#059669'} />
                        </View>
                        <Text style={styles.cardTrend}>+12%</Text>
                    </View>
                    <Text style={styles.cardValue}>{formatCurrency(metrics.commissions.total)}</Text>
                    <Text style={textSecondary}>Ganancias Totales</Text>
                </View>

                {/* Conversion */}
                <View style={cardStyle}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#E0E7FF' }]}>
                            <TrendingUp size={18} color={isDark ? '#818CF8' : '#4F46E5'} />
                        </View>
                    </View>
                    <Text style={styles.cardValue}>{metrics.conversion.rate.toFixed(1)}%</Text>
                    <Text style={textSecondary}>Tasa de Conversión</Text>
                </View>

                {/* Clicks */}
                <View style={cardStyle}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7' }]}>
                            <MousePointerClick size={18} color={isDark ? '#FCD34D' : '#D97706'} />
                        </View>
                    </View>
                    <Text style={styles.cardValue}>{metrics.clicks.total}</Text>
                    <Text style={textSecondary}>Clicks en enlaces</Text>
                </View>

                {/* Pendiente */}
                <View style={cardStyle}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(107, 114, 128, 0.2)' : '#F3F4F6' }]}>
                            <BadgeDollarSign size={18} color={isDark ? '#D1D5DB' : '#4B5563'} />
                        </View>
                    </View>
                    <Text style={styles.cardValue}>{formatCurrency(metrics.commissions.pending)}</Text>
                    <Text style={textSecondary}>Pendiente de pago</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        alignSelf: 'center',
        marginBottom: 16,
    },
    levelContainer: {
        padding: 16,
        marginBottom: 16,
    },
    levelHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    levelTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    progressTrack: {
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    card: {
        flexBasis: '48%',
        flexGrow: 1,
        padding: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    iconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardTrend: {
        fontSize: 12,
        color: '#10B981',
        fontWeight: '600',
    },
    cardValue: {
        fontSize: 24,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 4,
    },
});
