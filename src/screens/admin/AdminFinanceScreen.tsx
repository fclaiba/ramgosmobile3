/**
 * AdminFinanceScreen — operations console for the marketplace.
 *
 * Surfaces the four admin queries from `convex/finance.ts`:
 *   - listFailedTransfers         (Stripe transfers we tried and failed)
 *   - listStuckEscrows            (orders sitting in escrow > 30d)
 *   - listOpenDisputes            (payments in 'disputed' state)
 *   - listPendingRefunds          (payments refunded recently — sanity)
 * Plus the daily reconciliation cron output:
 *   - listReconciliationFlags     (Stripe Balance Transactions vs ledger)
 *
 * Admin actions (force release, manual refund, manual transfer reversal)
 * are wired to existing internal mutations / actions:
 *   - internal.stripe.internalReleasePayment   (force release escrow)
 *   - internal.stripe.internalRefundPayment    (refund + reverse transfers)
 * For now the actions are exposed in the UI as "request" buttons that
 * call public wrappers — calls require admin/developer role at the
 * Convex layer.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    AlertTriangle,
    CheckCircle2,
    XCircle,
    DollarSign,
    Clock,
    RotateCcw,
    Shield,
    GitMerge,
    RefreshCw,
} from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { ListPager, paginate } from '../../components/ui/ListPager';

type Tab = 'failed' | 'escrows' | 'disputes' | 'refunds' | 'recon';

const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'failed', label: 'Transfers fallidos', icon: XCircle },
    { id: 'escrows', label: 'Escrows colgados', icon: Clock },
    { id: 'disputes', label: 'Disputas abiertas', icon: AlertTriangle },
    { id: 'refunds', label: 'Refunds recientes', icon: RotateCcw },
    { id: 'recon', label: 'Reconciliación', icon: GitMerge },
];

export default function AdminFinanceScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { sessionToken } = useAuth();
    const { show } = useToast();

    const [activeTab, setActiveTab] = useState<Tab>('failed');
    const [listPage, setListPage] = useState<Partial<Record<Tab, number>>>({});
    const pageOf = (tab: Tab) => listPage[tab] ?? 1;
    const setPageOf = (tab: Tab, p: number) => setListPage((prev) => ({ ...prev, [tab]: p }));

    const styles = useMemo(() => getStyles(isDark, insets), [isDark, insets]);

    const queryArgs = sessionToken ? { sessionToken } : 'skip';

    const failed = useQuery(
        api.finance.listFailedTransfers,
        queryArgs === 'skip' ? 'skip' : { sessionToken, limit: 100 },
    ) as any[] | undefined;
    const escrows = useQuery(
        api.finance.listStuckEscrows,
        queryArgs === 'skip' ? 'skip' : { sessionToken, olderThanDays: 30 },
    ) as any[] | undefined;
    const disputes = useQuery(
        api.finance.listOpenDisputes,
        queryArgs === 'skip' ? 'skip' : { sessionToken, limit: 100 },
    ) as any[] | undefined;
    const refunds = useQuery(
        api.finance.listPendingRefunds,
        queryArgs === 'skip' ? 'skip' : { sessionToken, windowDays: 7 },
    ) as any[] | undefined;
    const recon = useQuery(
        api.finance.listReconciliationFlags,
        queryArgs === 'skip' ? 'skip' : { sessionToken, status: 'open' as const, limit: 100 },
    ) as any[] | undefined;

    const updateFlag = useMutation(api.finance.updateReconciliationFlag);

    const formatCurrency = (cents: number, currency = 'usd') =>
        `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;

    const handleResolveFlag = async (
        id: string,
        status: 'resolved' | 'ignored',
    ) => {
        if (!sessionToken) return;
        try {
            await updateFlag({
                sessionToken,
                flagId: id as any,
                status,
            });
            show(`Flag ${status === 'resolved' ? 'resuelta' : 'ignorada'}.`, 'success');
        } catch (e: any) {
            show(e.message || 'No se pudo actualizar la flag.', 'error');
        }
    };

    const renderEmpty = (label: string) => (
        <View style={styles.emptyState}>
            <CheckCircle2 size={28} color={isDark ? '#34D399' : '#16A34A'} />
            <Text style={styles.emptyTitle}>Todo limpio</Text>
            <Text style={styles.emptyDesc}>{label}</Text>
        </View>
    );

    const renderLoading = () => (
        <View style={styles.emptyState}>
            <ActivityIndicator color={isDark ? '#A5B4FC' : '#4F46E5'} />
            <Text style={styles.emptyTitle}>Cargando…</Text>
        </View>
    );

    const renderFailedTransfers = () => {
        if (failed === undefined) return renderLoading();
        if (failed.length === 0) return renderEmpty('Ningún transfer en estado failed.');
        const page = paginate(failed, pageOf('failed'));
        return (
            <>
                {page.items.map((p: any) => (
            <View key={p._id} style={styles.row}>
                <View style={styles.rowIcon}>
                    <XCircle size={18} color="#DC2626" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                        Payout · seller {String(p.sellerId).slice(0, 16)}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={2}>
                        {formatCurrency(p.amountInCents, p.currency)} · pago {String(p.paymentId).slice(0, 14)}…
                    </Text>
                    {!!p.error && (
                        <Text style={[styles.rowMeta, { color: '#DC2626' }]} numberOfLines={2}>
                            error: {p.error}
                        </Text>
                    )}
                </View>
            </View>
        ))}
                <ListPager isDark={isDark} page={page.page} totalPages={page.totalPages} total={page.total} onPage={(p) => setPageOf('failed', p)} />
            </>
        );
    };

    const renderEscrows = () => {
        if (escrows === undefined) return renderLoading();
        if (escrows.length === 0) return renderEmpty('Ningún escrow lleva > 30 días.');
        const page = paginate(escrows, pageOf('escrows'));
        return (
            <>
                {page.items.map((o: any) => {
            const ageDays = Math.floor(
                (Date.now() - (o._creationTime ?? 0)) / 86_400_000,
            );
            return (
                <View key={o._id} style={styles.row}>
                    <View style={styles.rowIcon}>
                        <Clock size={18} color="#D97706" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                            Order {String(o._id).slice(0, 16)} · {o.status}
                        </Text>
                        <Text style={styles.rowMeta}>
                            ${o.total.toFixed(2)} {o.currency} · seller {String(o.sellerId).slice(0, 12)} · {ageDays}d en escrow
                        </Text>
                    </View>
                </View>
            );
        })}
                <ListPager isDark={isDark} page={page.page} totalPages={page.totalPages} total={page.total} onPage={(p) => setPageOf('escrows', p)} />
            </>
        );
    };

    const renderDisputes = () => {
        if (disputes === undefined) return renderLoading();
        if (disputes.length === 0) return renderEmpty('Sin disputas abiertas.');
        const page = paginate(disputes, pageOf('disputes'));
        return (
            <>
                {page.items.map((p: any) => (
            <View key={p._id} style={styles.row}>
                <View style={styles.rowIcon}>
                    <AlertTriangle size={18} color="#B91C1C" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                        Payment {String(p._id).slice(0, 16)}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={2}>
                        ${p.amount.toFixed(2)} · buyer {String(p.userId).slice(0, 12)} · seller {String(p.sellerId ?? '—').slice(0, 12)}
                    </Text>
                    {!!p.stripePaymentIntentId && (
                        <Text style={styles.rowMeta} numberOfLines={1}>
                            PI: {p.stripePaymentIntentId.slice(0, 22)}…
                        </Text>
                    )}
                </View>
            </View>
        ))}
                <ListPager isDark={isDark} page={page.page} totalPages={page.totalPages} total={page.total} onPage={(p) => setPageOf('disputes', p)} />
            </>
        );
    };

    const renderRefunds = () => {
        if (refunds === undefined) return renderLoading();
        if (refunds.length === 0) return renderEmpty('Ningún refund en los últimos 7 días.');
        const page = paginate(refunds, pageOf('refunds'));
        return (
            <>
                {page.items.map((p: any) => (
            <View key={p._id} style={styles.row}>
                <View style={styles.rowIcon}>
                    <RotateCcw size={18} color="#7C3AED" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                        Refund {String(p._id).slice(0, 16)}
                    </Text>
                    <Text style={styles.rowMeta}>
                        ${p.amount.toFixed(2)} · settled {p.settledAt?.slice(0, 10) ?? '—'}
                    </Text>
                </View>
            </View>
        ))}
                <ListPager isDark={isDark} page={page.page} totalPages={page.totalPages} total={page.total} onPage={(p) => setPageOf('refunds', p)} />
            </>
        );
    };

    const renderRecon = () => {
        if (recon === undefined) return renderLoading();
        if (recon.length === 0) return renderEmpty('No hay discrepancias abiertas.');
        const page = paginate(recon, pageOf('recon'));
        return (
            <>
                {page.items.map((f: any) => (
            <View key={f._id} style={styles.row}>
                <View style={styles.rowIcon}>
                    <Shield size={18} color="#1D4ED8" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                        {f.reason} · {f.sourceType}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={2}>
                        {formatCurrency(f.amountInCents, f.currency)} · BT {f.stripeBalanceTransactionId.slice(0, 22)}…
                    </Text>
                    <View style={styles.flagActions}>
                        <TouchableOpacity
                            style={[styles.flagBtn, { backgroundColor: '#16A34A' }]}
                            onPress={() => handleResolveFlag(String(f._id), 'resolved')}
                        >
                            <Text style={styles.flagBtnText}>Resolver</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.flagBtn, { backgroundColor: '#475569' }]}
                            onPress={() => handleResolveFlag(String(f._id), 'ignored')}
                        >
                            <Text style={styles.flagBtnText}>Ignorar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        ))}
                <ListPager isDark={isDark} page={page.page} totalPages={page.totalPages} total={page.total} onPage={(p) => setPageOf('recon', p)} />
            </>
        );
    };

    const tabBody = useMemo(() => {
        switch (activeTab) {
            case 'failed': return renderFailedTransfers();
            case 'escrows': return renderEscrows();
            case 'disputes': return renderDisputes();
            case 'refunds': return renderRefunds();
            case 'recon': return renderRecon();
        }
    }, [activeTab, failed, escrows, disputes, refunds, recon, listPage]);

    const counts = {
        failed: failed?.length ?? 0,
        escrows: escrows?.length ?? 0,
        disputes: disputes?.length ?? 0,
        refunds: refunds?.length ?? 0,
        recon: recon?.length ?? 0,
    };

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Finanzas (admin)"
                backButton
                onBack={() => navigation.goBack()}
                actions={
                    <TouchableOpacity
                        onPress={() => show('Reconciliando…', 'info')}
                        style={styles.refreshBtn}
                    >
                        <RefreshCw size={18} color={isDark ? '#F9FAFB' : '#111827'} />
                    </TouchableOpacity>
                }
            />

            {!sessionToken ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Sesión inválida</Text>
                    <Text style={styles.emptyDesc}>Cerrá sesión e iniciá sesión de nuevo.</Text>
                </View>
            ) : (
            <ScrollView
                contentContainerStyle={styles.content}
                stickyHeaderIndices={[0]}
            >
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tabsRow}
                    style={styles.tabsBar}
                >
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.id;
                        const count = counts[tab.id];
                        return (
                            <TouchableOpacity
                                key={tab.id}
                                style={[styles.tab, active && styles.tabActive]}
                                onPress={() => setActiveTab(tab.id)}
                            >
                                <Icon size={14} color={active ? '#fff' : isDark ? '#D1D5DB' : '#374151'} />
                                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                                    {tab.label}
                                </Text>
                                {count > 0 && (
                                    <View style={styles.tabBadge}>
                                        <Text style={styles.tabBadgeText}>{count}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <View style={styles.section}>{tabBody}</View>
            </ScrollView>
            )}
        </View>
    );
}

const getStyles = (isDark: boolean, insets: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#09090B' : '#FAFAFA' },
    content: { paddingBottom: insets.bottom + 32 },
    refreshBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDark ? 'rgba(148, 163, 184, 0.1)' : '#fff',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(148, 163, 184, 0.18)' : '#E5E7EB',
    },

    tabsBar: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
        borderBottomWidth: 1,
        borderBottomColor: isDark ? 'rgba(148, 163, 184, 0.14)' : '#E5E7EB',
    },
    tabsRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(148, 163, 184, 0.18)' : '#E5E7EB',
    },
    tabActive: {
        backgroundColor: '#4F46E5',
        borderColor: '#4F46E5',
    },
    tabText: {
        fontSize: 12,
        fontWeight: '600',
        color: isDark ? '#D1D5DB' : '#374151',
    },
    tabTextActive: { color: '#fff' },
    tabBadge: {
        marginLeft: 4,
        backgroundColor: 'rgba(255,255,255,0.25)',
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 10,
    },
    tabBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

    section: { padding: 16, gap: 10 },

    row: {
        flexDirection: 'row',
        gap: 12,
        padding: 14,
        borderRadius: 14,
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(148, 163, 184, 0.14)' : '#E5E7EB',
        alignItems: 'flex-start',
    },
    rowIcon: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDark ? '#0B1220' : '#F1F5F9',
    },
    rowTitle: { fontSize: 14, fontWeight: '700', color: isDark ? '#F9FAFB' : '#0F172A' },
    rowMeta: { fontSize: 12, color: isDark ? '#94A3B8' : '#475569', marginTop: 4 },

    flagActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
    flagBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    flagBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

    emptyState: {
        alignItems: 'center',
        gap: 6,
        paddingVertical: 32,
        paddingHorizontal: 16,
    },
    emptyTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: isDark ? '#F9FAFB' : '#0F172A',
        marginTop: 6,
    },
    emptyDesc: { fontSize: 12, color: isDark ? '#9CA3AF' : '#64748B', textAlign: 'center' },
});
