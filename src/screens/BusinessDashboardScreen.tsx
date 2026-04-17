import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Plus as PlusIcon,
    QrCode,
    Tag,
    DollarSign,
    Users,
    Wallet,
    TrendingUp,
    Trophy,
    BarChart3,
    ChevronRight,
    MoreHorizontal,
    ShieldAlert,
    AlertTriangle
} from 'lucide-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { Badge } from '../components/ui/badge';
import { useBusiness, Coupon } from '../contexts/BusinessContext';
import { useFintech } from '../contexts/FintechContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useActionGate } from '../utils/useActionGate';

type DashboardTab = 'overview' | 'bonos' | 'reviews';

const TABS: Array<{ id: DashboardTab; label: string }> = [
    { id: 'overview', label: 'Resumen' },
    { id: 'bonos', label: 'Mis Bonos' },
    { id: 'reviews', label: 'Reseñas' },
];

const formatCurrency = (value: number) =>
    `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDateShort = (value: string) => {
    const date = new Date(value);
    return date.toLocaleDateString('es-AR', {
        day: 'numeric',
        month: 'short',
    });
};

const getCouponStatusStyles = (status: Coupon['status'], isDark: boolean) => {
    const styles: Record<Coupon['status'], { background: string; color: string; label: string }> = {
        active: { background: isDark ? 'rgba(22, 101, 52, 0.2)' : '#DCFCE7', color: isDark ? '#4ADE80' : '#166534', label: 'Activo' },
        scheduled: { background: isDark ? 'rgba(29, 78, 216, 0.2)' : '#E0F2FE', color: isDark ? '#60A5FA' : '#1D4ED8', label: 'Programado' },
        expired: { background: isDark ? 'rgba(185, 28, 28, 0.2)' : '#FEE2E2', color: isDark ? '#F87171' : '#B91C1C', label: 'Vencido' },
        paused: { background: isDark ? 'rgba(107, 114, 128, 0.2)' : '#F3F4F6', color: isDark ? '#9CA3AF' : '#6B7280', label: 'Pausado' },
        draft: { background: isDark ? 'rgba(124, 58, 237, 0.2)' : '#F5F3FF', color: isDark ? '#A78BFA' : '#7C3AED', label: 'Borrador' },
    };
    return styles[status];
};

export default function BusinessDashboardScreen({ isTabMode, onMenuPress, route }: any) {
    const navigation = useNavigation<any>();
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
    const { businessInfo, metrics, coupons, reviews } = useBusiness();
    const { ensureWalletAccount, getWalletByOwner, requestWithdrawal, payments, getKycStatus } = useFintech();
    const { gateWithdraw } = useActionGate();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    useEffect(() => {
        ensureWalletAccount(businessInfo.id, 'business', businessInfo.name);
    }, [businessInfo.id, businessInfo.name, ensureWalletAccount]);

    const wallet = getWalletByOwner(businessInfo.id) ?? getWalletByOwner('business_demo');
    const kycStatus = getKycStatus(businessInfo.id);
    const verificationPending = route?.params?.verificationPending || kycStatus === 'pending';
    const isVerified = kycStatus === 'approved';

    const availableBalance = wallet ? wallet.balances.available : metrics.summary.availableBalance;
    const pendingBalance = wallet ? wallet.balances.pending : metrics.summary.pendingBalance;
    const withheldBalance = wallet ? wallet.balances.reserved : metrics.summary.withheldBalance;

    const kycCardTitle = verificationPending
        ? 'Verificación en revisión'
        : kycStatus === 'rejected'
            ? 'Verificación rechazada'
            : 'Completa tu verificación KYC';

    const kycCardDescription = verificationPending
        ? 'Tus documentos están siendo revisados. Te notificaremos pronto.'
        : kycStatus === 'rejected'
            ? 'Requerimos documentación adicional. Revisa tu correo.'
            : 'Habilita retiros confirmando tu identidad.';

    const handleWithdrawal = () => {
        if (!wallet) {
            show('Error: Billetera no encontrada.', 'error');
            return;
        }

        const ok = gateWithdraw({
            onAllowed: () => navigation.navigate('Withdrawal', { ownerId: wallet.ownerId }),
        });

        if (!ok && kycStatus === 'rejected') {
            show('KYC Rechazado: Corrige tus datos para retirar.', 'error');
        }
    };

    const summaryCards = useMemo(
        () => [
            {
                id: 'revenueToday',
                label: 'Ingresos Hoy',
                value: formatCurrency(metrics.summary.revenueToday),
                icon: DollarSign,
                colors: ['#7C3AED', '#C026D3'] as const,
            },
            {
                id: 'redeemedToday',
                label: 'Canjes Hoy',
                value: metrics.summary.redeemedToday.toString(),
                icon: QrCode,
                colors: ['#059669', '#34D399'] as const,
            },
            {
                id: 'activeCoupons',
                label: 'Bonos Activos',
                value: metrics.summary.activeCoupons.toString(),
                icon: Tag,
                colors: ['#2563EB', '#60A5FA'] as const,
            },
            {
                id: 'customers',
                label: 'Clientes',
                value: metrics.summary.uniqueCustomers.toString(),
                icon: Users,
                colors: ['#EA580C', '#FDBA74'] as const,
            },
        ],
        [metrics.summary]
    );

    const chartData = useMemo(() => {
        const maxRevenue = Math.max(...metrics.revenueSeries.map((point) => point.revenue), 1);
        return metrics.revenueSeries.map((point) => ({
            ...point,
            heightPercent: Math.max(15, (point.revenue / maxRevenue) * 100),
        }));
    }, [metrics.revenueSeries]);

    const layout = useMemo(() => {
        const pagePadding = 16;
        const maxWidth = 980;
        const containerWidth = Math.min(Math.max(width - pagePadding * 2, 280), maxWidth);
        const gap = 16;
        const summaryCols = containerWidth < 360 ? 1 : containerWidth < 920 ? 2 : 4;
        const summaryCardWidth = Math.floor((containerWidth - gap * (summaryCols - 1)) / summaryCols);
        const contentPaddingBottom = Math.max(16, insets.bottom) + (isTabMode ? 96 : 24);
        return { containerWidth, gap, summaryCols, summaryCardWidth, contentPaddingBottom };
    }, [width, insets.bottom, isTabMode]);

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Panel de Negocio"
                subtitle="Gestión y métricas"
                backButton={!isTabMode}
                onBack={!isTabMode ? () => navigation.goBack() : undefined}
                onMenuPress={isTabMode ? onMenuPress : undefined}
                actions={
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('BusinessQR')}
                            style={styles.scanBtn}
                        >
                            <QrCode size={20} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('BusinessCreate')}
                            style={styles.createBtn}
                        >
                            <PlusIcon size={20} color="#fff" />
                            <Text style={styles.createBtnText}>Nuevo</Text>
                        </TouchableOpacity>
                    </View>
                }
            />

            <ScrollView contentContainerStyle={[styles.content, { paddingBottom: layout.contentPaddingBottom }]}>
                <View style={[styles.page, { maxWidth: layout.containerWidth }]}>
                    {/* KYC Warning */}
                    {!isVerified && (
                        <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={() => !verificationPending && navigation.navigate('VerifyBusiness')}
                            style={[
                                styles.kycBanner,
                                {
                                    borderColor: kycStatus === 'rejected' ? (isDark ? '#7F1D1D' : '#FECACA') : (isDark ? '#78350F' : '#FEF3C7'),
                                    backgroundColor: kycStatus === 'rejected' ? (isDark ? 'rgba(127, 29, 29, 0.2)' : '#FEF2F2') : (isDark ? 'rgba(120, 53, 15, 0.2)' : '#FFFBEB')
                                }
                            ]}
                        >
                            <View style={[styles.kycIcon, { backgroundColor: kycStatus === 'rejected' ? (isDark ? '#991B1B' : '#FEE2E2') : (isDark ? '#92400E' : '#FDE68A') }]}>
                                {verificationPending ? <ShieldAlert size={18} color={isDark ? '#FEF3C7' : '#B45309'} /> : <AlertTriangle size={18} color={isDark ? '#FECACA' : '#B91C1C'} />}
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text
                                    style={[styles.kycTitle, { color: kycStatus === 'rejected' ? (isDark ? '#F87171' : '#991B1B') : (isDark ? '#FCD34D' : '#92400E') }]}
                                    numberOfLines={1}
                                >
                                    {kycCardTitle}
                                </Text>
                                <Text
                                    style={[styles.kycDesc, { color: kycStatus === 'rejected' ? (isDark ? '#FECACA' : '#B91C1C') : (isDark ? '#FDE68A' : '#B45309') }]}
                                    numberOfLines={2}
                                >
                                    {kycCardDescription}
                                </Text>
                            </View>
                            {!verificationPending && <ChevronRight size={18} color={isDark ? '#9CA3AF' : '#9CA3AF'} />}
                        </TouchableOpacity>
                    )}

                    {/* Tabs */}
                    <View style={styles.tabsContainer}>
                        {TABS.map((tab) => (
                            <TouchableOpacity
                                key={tab.id}
                                style={[styles.tab, activeTab === tab.id && styles.tabActive]}
                                onPress={() => setActiveTab(tab.id)}
                            >
                                <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                                    {tab.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* --- OVERVIEW TAB --- */}
                    {activeTab === 'overview' && (
                        <View style={styles.sectionGap}>
                            {/* Summary Grid */}
                            <View style={[styles.grid, { gap: layout.gap }]}>
                                {summaryCards.map((card) => (
                                    <View key={card.id} style={[styles.summaryCard, { width: layout.summaryCardWidth }]}>
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
                                    colors={isDark ? ['#111827', '#000000'] : ['#111827', '#1F2937']}
                                    style={styles.balanceHeader}
                                >
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <View>
                                            <Text style={styles.balanceLabelLight}>Saldo Disponible</Text>
                                            <Text style={styles.balanceValueMain}>{formatCurrency(availableBalance)}</Text>
                                        </View>
                                        <View style={styles.walletIcon}>
                                            <Wallet size={20} color="#fff" />
                                        </View>
                                    </View>
                                    <View style={styles.balanceStatsRow}>
                                        <View>
                                            <Text style={styles.balanceStatLabel}>Pendiente</Text>
                                            <Text style={styles.balanceStatValue}>{formatCurrency(pendingBalance)}</Text>
                                        </View>
                                        <View style={styles.dividerVertical} />
                                        <View>
                                            <Text style={styles.balanceStatLabel}>Retenido</Text>
                                            <Text style={styles.balanceStatValue}>{formatCurrency(withheldBalance)}</Text>
                                        </View>
                                    </View>
                                </LinearGradient>

                                <View style={styles.balanceActions}>
                                    <TouchableOpacity
                                        style={[styles.withdrawBtn, (!isVerified || (wallet?.balances?.available ?? 0) < 10) && styles.withdrawBtnDisabled]}
                                        onPress={handleWithdrawal}
                                        disabled={!isVerified || !wallet || (wallet?.balances?.available ?? 0) < 10}
                                    >
                                        <Text style={[styles.withdrawBtnText, (!isVerified || (wallet?.balances?.available ?? 0) < 10) && styles.withdrawBtnTextDisabled]}>
                                            Solicitar retiro
                                        </Text>
                                    </TouchableOpacity>
                                    {metrics.payoutProjection.nextPayoutDate && (
                                        <Text style={styles.payoutDate}>Próximo pago: {formatDateShort(metrics.payoutProjection.nextPayoutDate)}</Text>
                                    )}
                                </View>
                            </View>

                            {/* Revenue Chart */}
                            <View style={styles.chartCard}>
                                <View style={styles.cardHeader}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <BarChart3 size={20} color={isDark ? '#D1D5DB' : '#374151'} />
                                        <Text style={styles.cardTitle}>Resultados Semanales</Text>
                                    </View>
                                    <Badge variant="secondary"><Text style={{ fontSize: 10, color: isDark ? '#D1D5DB' : '#000' }}>7 Días</Text></Badge>
                                </View>

                                <View style={styles.chartArea}>
                                    {chartData.map((d, i) => (
                                        <View key={i} style={styles.barGroup}>
                                            <View style={styles.barTrack}>
                                                <LinearGradient
                                                    colors={['#8B5CF6', '#Ec4899']}
                                                    style={[styles.barFill, { height: `${d.heightPercent}%` }]}
                                                />
                                            </View>
                                            <Text style={styles.barLabel}>{d.label}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>

                            {/* Top Coupons */}
                            <View style={styles.listCard}>
                                <View style={[styles.cardHeader, { borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F3F4F6' }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Trophy size={20} color="#F59E0B" />
                                        <Text style={styles.cardTitle}>Bonos Destacados</Text>
                                    </View>
                                </View>
                                {metrics.couponLeaders.map((item, index) => (
                                    <View key={item.id} style={[styles.listItem, index === metrics.couponLeaders.length - 1 && { borderBottomWidth: 0 }]}>
                                        <View style={styles.rankBadge}>
                                            <Text style={styles.rankText}>#{index + 1}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.itemTitle}>{item.name}</Text>
                                            <Text style={styles.itemSub}>{item.redeemed} canjes • {item.stockLeft} disponibles</Text>
                                        </View>
                                        <Text style={styles.itemValue}>{formatCurrency(item.revenue)}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* --- COUPONS TAB --- */}
                    {activeTab === 'bonos' && (
                        <View style={styles.sectionGap}>
                            <TouchableOpacity
                                style={styles.bigCreateBtn}
                                onPress={() => navigation.navigate('BusinessCreate', { type: 'bonus' })}
                            >
                                <LinearGradient colors={['#2563EB', '#1D4ED8']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
                                <PlusIcon size={24} color="#fff" />
                                <Text style={styles.bigCreateText}>Crear Nuevo Bono</Text>
                            </TouchableOpacity>

                            {coupons.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Tag size={48} color={isDark ? '#4B5563' : '#E5E7EB'} />
                                    <Text style={styles.emptyTitle}>Aún no tienes bonos</Text>
                                    <Text style={styles.emptyDesc}>Crea tu primer bono para atraer clientes.</Text>
                                </View>
                            ) : (
                                coupons.map((coupon) => {
                                    const style = getCouponStatusStyles(coupon.status, isDark);
                                    const percent = coupon.stock > 0 ? (coupon.redeemed / coupon.stock) * 100 : 0;

                                    return (
                                        <View key={coupon.id} style={styles.couponCard}>
                                            <View style={styles.couponHeader}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.couponTitle}>{coupon.name}</Text>
                                                    <Text style={styles.couponCode}>{coupon.code}</Text>
                                                </View>
                                                <View style={[styles.statusTag, { backgroundColor: style.background }]}>
                                                    <Text style={[styles.statusText, { color: style.color }]}>{style.label}</Text>
                                                </View>
                                            </View>

                                            <View style={styles.progressSection}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <Text style={styles.progressLabel}>Progreso de canjes</Text>
                                                    <Text style={styles.progressValue}>{coupon.redeemed} / {coupon.stock}</Text>
                                                </View>
                                                <View style={styles.progressBarBg}>
                                                    <View style={[styles.progressBarFill, { width: `${percent}%`, backgroundColor: style.color }]} />
                                                </View>
                                            </View>

                                            <View style={styles.couponFooter}>
                                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                                    <View style={styles.metaItem}>
                                                        <Tag size={14} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                                        <Text style={styles.metaText}>
                                                            {coupon.discountType === 'percentage' ? `${coupon.value}% OFF` : formatCurrency(coupon.value)}
                                                        </Text>
                                                    </View>
                                                    <View style={styles.metaItem}>
                                                        <Users size={14} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                                        <Text style={styles.metaText}>Max {coupon.maxPerUser}/usr</Text>
                                                    </View>
                                                </View>
                                                <TouchableOpacity onPress={() => {/* Edit Action */ }}>
                                                    <MoreHorizontal size={20} color={isDark ? '#9CA3AF' : '#9CA3AF'} />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })
                            )}
                        </View>
                    )}

                    {/* --- REVIEWS TAB --- */}
                    {activeTab === 'reviews' && (
                        <View style={styles.sectionGap}>
                            <View style={styles.ratingCard}>
                                <View style={styles.ratingLeft}>
                                    <Text style={styles.ratingBig}>{businessInfo.overallRating.toFixed(1)}</Text>
                                    <View style={{ flexDirection: 'row' }}>
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <TrendingUp key={i} size={14} color={i <= Math.round(businessInfo.overallRating) ? "#F59E0B" : (isDark ? "#4B5563" : "#E5E7EB")} fill={i <= Math.round(businessInfo.overallRating) ? "#F59E0B" : "none"} />
                                        ))}
                                    </View>
                                    <Text style={styles.ratingCount}>{reviews.length} reseñas</Text>
                                </View>
                                <View style={styles.ratingRight}>
                                    <Text style={styles.ratingMsg}>
                                        Mantén una calificación alta para aparecer en "Recomendados".
                                    </Text>
                                </View>
                            </View>

                            {reviews.map((review) => (
                                <View key={review.id} style={styles.reviewItem}>
                                    <View style={styles.reviewHeader}>
                                        <Text style={styles.reviewerName}>{review.user}</Text>
                                        <Text style={styles.reviewDate}>{formatDateShort(review.createdAt)}</Text>
                                    </View>
                                    <View style={styles.starsRow}>
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <View key={i} style={[styles.starDot, i <= review.rating && styles.starDotActive]} />
                                        ))}
                                    </View>
                                    <Text style={styles.reviewText}>{review.comment}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#111827' : '#F9FAFB' },
    content: { padding: 16, paddingBottom: 100 },
    page: { width: '100%', alignSelf: 'center', maxWidth: 980 },

    headerActions: { flexDirection: 'row', gap: 8 },
    scanBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: isDark ? '#1F2937' : '#111827', alignItems: 'center', justifyContent: 'center'
    },
    createBtn: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#2563EB', paddingHorizontal: 12, height: 36,
        borderRadius: 18, gap: 4
    },
    createBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

    /* KYC Banner */
    kycBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 12, borderRadius: 12, marginBottom: 20,
        borderWidth: 1,
    },
    kycIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    kycTitle: { fontWeight: '700', fontSize: 14 },
    kycDesc: { fontSize: 12 },

    /* Tabs */
    tabsContainer: {
        flexDirection: 'row', backgroundColor: isDark ? '#1F2937' : '#fff',
        borderRadius: 12, padding: 4, marginBottom: 20,
        shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 4, elevation: 1
    },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
    tabActive: { backgroundColor: isDark ? '#374151' : '#F3F4F6' },
    tabText: { fontSize: 13, fontWeight: '600', color: isDark ? '#9CA3AF' : '#6B7280' },
    tabTextActive: { color: isDark ? '#F9FAFB' : '#111827' },

    sectionGap: { gap: 16 },

    /* Grid */
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    summaryCard: {
        borderRadius: 20, overflow: 'hidden', height: 110,
        shadowColor: '#2563EB', shadowOpacity: 0.15, shadowRadius: 10, elevation: 4
    },
    summaryContent: { flex: 1, padding: 16, justifyContent: 'space-between' },
    summaryIconCircle: {
        width: 32, height: 32, borderRadius: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#fff',
        alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start'
    },
    summaryValue: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 8 },
    summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },

    /* Balance Card */
    balanceCard: {
        backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 24, overflow: 'hidden',
        borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB'
    },
    balanceHeader: { padding: 20 },
    balanceLabelLight: { color: '#9CA3AF', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
    balanceValueMain: { color: '#fff', fontSize: 32, fontWeight: '700', marginVertical: 4 },
    walletIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },

    balanceStatsRow: { flexDirection: 'row', marginTop: 16, alignItems: 'center' },
    dividerVertical: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 16 },
    balanceStatLabel: { color: '#9CA3AF', fontSize: 11 },
    balanceStatValue: { color: '#fff', fontSize: 16, fontWeight: '600' },

    balanceActions: {
        padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#F3F4F6'
    },
    withdrawBtn: { backgroundColor: isDark ? '#111827' : '#111827', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
    withdrawBtnDisabled: { backgroundColor: isDark ? '#374151' : '#F3F4F6' },
    withdrawBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    withdrawBtnTextDisabled: { color: '#9CA3AF' },
    payoutDate: { fontSize: 11, color: '#6B7280' },

    /* Chart Card */
    chartCard: { backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827' },
    chartArea: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140 },
    barGroup: { alignItems: 'center', gap: 6, flex: 1 },
    barTrack: { width: 8, height: '100%', backgroundColor: isDark ? '#374151' : '#F3F4F6', borderRadius: 4, justifyContent: 'flex-end' },
    barFill: { width: '100%', borderRadius: 4 },
    barLabel: { fontSize: 10, color: '#6B7280' },

    /* List Card */
    listCard: { backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 20, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB' },
    listItem: { flexDirection: 'row', padding: 16, alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F3F4F6' },
    rankBadge: { width: 28, height: 28, borderRadius: 8, backgroundColor: isDark ? 'rgba(217, 119, 6, 0.2)' : '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
    rankText: { fontSize: 12, fontWeight: '700', color: isDark ? '#FCD34D' : '#D97706' },
    itemTitle: { fontSize: 14, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },
    itemSub: { fontSize: 12, color: '#6B7280' },
    itemValue: { fontSize: 14, fontWeight: '700', color: '#059669' },

    /* Coupons Tab */
    bigCreateBtn: {
        height: 56, borderRadius: 16, overflow: 'hidden', flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        shadowColor: '#2563EB', shadowOpacity: 0.25, shadowRadius: 10, elevation: 5
    },
    bigCreateText: { color: '#fff', fontSize: 16, fontWeight: '700' },

    emptyState: { alignItems: 'center', padding: 40, gap: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: isDark ? '#F9FAFB' : '#374151' },
    emptyDesc: { fontSize: 14, color: '#9CA3AF' },

    couponCard: { backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB' },
    couponHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    couponTitle: { fontSize: 16, fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 2 },
    couponCode: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: '#6B7280' },
    statusTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    progressSection: { marginBottom: 16 },
    progressLabel: { fontSize: 12, color: '#6B7280' },
    progressValue: { fontSize: 12, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },
    progressBarBg: { height: 6, backgroundColor: isDark ? '#374151' : '#F3F4F6', borderRadius: 3, marginTop: 4 },
    progressBarFill: { height: '100%', borderRadius: 3 },
    couponFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#F9FAFB' },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 12, color: isDark ? '#9CA3AF' : '#4B5563', fontWeight: '500' },

    /* Reviews Tab */
    ratingCard: { flexDirection: 'row', backgroundColor: isDark ? '#1F2937' : '#fff', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB' },
    ratingLeft: { alignItems: 'center', paddingRight: 20, borderRightWidth: 1, borderRightColor: isDark ? '#374151' : '#F3F4F6' },
    ratingBig: { fontSize: 36, fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827' },
    ratingCount: { fontSize: 12, color: '#6B7280', marginTop: 4 },
    ratingRight: { flex: 1, paddingLeft: 20, justifyContent: 'center' },
    ratingMsg: { fontSize: 13, color: isDark ? '#9CA3AF' : '#4B5563', fontStyle: 'italic' },

    reviewItem: { backgroundColor: isDark ? '#1F2937' : '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB' },
    reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    reviewerName: { fontSize: 14, fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827' },
    reviewDate: { fontSize: 11, color: '#9CA3AF' },
    starsRow: { flexDirection: 'row', gap: 2, marginBottom: 8 },
    starDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: isDark ? '#374151' : '#E5E7EB' },
    starDotActive: { backgroundColor: '#F59E0B' },
    reviewText: { fontSize: 13, color: isDark ? '#D1D5DB' : '#4B5563', lineHeight: 20 },
});
