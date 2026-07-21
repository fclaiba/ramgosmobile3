import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, TextInput, Platform, Image } from 'react-native';
import { useQuery, useMutation, useAction } from 'convex/react';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../../convex/_generated/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { confirmAction } from '../utils/confirm';
import { glassTokens, glassGradient } from '../utils/glass';
import { ListPager, paginate } from '../components/ui/ListPager';
import {
    DollarSign, ShoppingBag, TrendingUp, AlertTriangle, ShieldCheck,
    Users, XCircle, Ban, RotateCcw, Gavel, Shield,
    KeyRound, ScrollText, Activity, LayoutDashboard, LogOut as SessionIcon,
    FileCheck, ChevronDown, ChevronUp, Filter, Wallet, ArrowUpRight, Clock,
} from 'lucide-react-native';
import { Radius, colors } from '../theme/tokens';

type Tab = 'resumen' | 'ingresos' | 'escrow' | 'usuarios' | 'kyc' | 'seguridad' | 'logs';

type AdvField = { key: string; label: string; placeholder: string };

const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
    { id: 'ingresos', label: 'Ingresos', icon: Wallet },
    { id: 'escrow', label: 'Escrow', icon: Gavel },
    { id: 'usuarios', label: 'Usuarios', icon: Users },
    { id: 'kyc', label: 'KYC', icon: FileCheck },
    { id: 'seguridad', label: 'Seguridad', icon: KeyRound },
    { id: 'logs', label: 'Logs', icon: ScrollText },
];

const ROLE_COLORS: Record<string, string> = {
    admin: '#EF4444',
    business: '#3B82F6',
    influencer: '#EC4899',
    consumer: '#10B981',
    developer: '#4FC3F7',
};

const HASH_STYLES: Record<string, { label: string; color: string }> = {
    legacy: { label: 'Legacy (dev)', color: '#D97706' },
    bcrypt: { label: 'Bcrypt (roto)', color: '#EF4444' },
    none: { label: 'Sin password', color: '#6B7280' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    paid_escrow: { label: 'En escrow', color: '#D97706' },
    disputed: { label: 'En disputa', color: '#EF4444' },
};

const KYC_STATUS: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pendiente', color: '#D97706' },
    approved: { label: 'Aprobado', color: '#10B981' },
    rejected: { label: 'Rechazado', color: '#EF4444' },
    unverified: { label: 'Sin verificar', color: '#6B7280' },
};

const DOC_LABELS: Record<string, string> = {
    id_front: 'ID frente',
    id_back: 'ID dorso',
    id: 'Identificación',
    address_proof: 'Comprobante domicilio',
    business_license: 'Licencia comercial',
};

const ACTION_LABELS: Record<string, string> = {
    USER_BANNED: 'Usuario baneado',
    USER_UNBANNED: 'Usuario desbaneado',
    SESSION_REVOKED: 'Sesión revocada',
    IMPERSONATE_START: 'Impersonación iniciada',
    IMPERSONATE_END: 'Impersonación finalizada',
    KYC_APPROVED: 'KYC aprobado',
    KYC_REJECTED: 'KYC rechazado',
};

const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
    succeeded: { label: 'Cobrado', color: '#10B981' },
    succeeded_in_escrow: { label: 'En escrow', color: '#D97706' },
    released_to_seller: { label: 'Liberado', color: '#3B82F6' },
    pending: { label: 'Pendiente', color: '#6B7280' },
    failed: { label: 'Fallido', color: '#EF4444' },
    refunded: { label: 'Reembolsado', color: '#4FC3F7' },
    disputed: { label: 'Disputa', color: '#EF4444' },
};

const includes = (hay: string | undefined | number, needle: string) =>
    !needle.trim() || String(hay ?? '').toLowerCase().includes(needle.trim().toLowerCase());

const fmtMoney = (n: number) => `$${(n ?? 0).toFixed(2)}`;

const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
};

export default function AdminDashboardScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { sessionToken, status } = useAuth();
    const { show } = useToast();
    const styles = useMemo(() => getStyles(isDark), [isDark]);

    const [activeTab, setActiveTab] = useState<Tab>('resumen');
    const [processingIds, setProcessingIds] = useState<Record<string, boolean>>({});
    const [advOpen, setAdvOpen] = useState<Record<Tab, boolean>>({
        resumen: false, ingresos: false, escrow: false, usuarios: false, kyc: false, seguridad: false, logs: false,
    });
    const [escrowFilters, setEscrowFilters] = useState({ q: '', status: '', minAmount: '' });
    const [userFilters, setUserFilters] = useState({ q: '', role: '', kyc: '', banned: '' });
    const [kycFilters, setKycFilters] = useState({ q: '', role: '' });
    const [incomeFilters, setIncomeFilters] = useState({ q: '', status: '', source: '', minCommission: '', from: '' });
    const [securityFilters, setSecurityFilters] = useState({ q: '', hashType: '', sessionState: '' });
    const [logFilters, setLogFilters] = useState({ q: '', action: '' });
    const [listPage, setListPage] = useState<Record<string, number>>({});
    const pageOf = (key: string) => listPage[key] ?? 1;
    const setPageOf = (key: string, p: number) => setListPage((prev) => ({ ...prev, [key]: p }));
    const resetPage = (key: string) => setPageOf(key, 1);

    const queryArgs = sessionToken ? { sessionToken } : 'skip' as const;
    const platformStats = useQuery(api.adminQueries.getPlatformStats, queryArgs);
    const escrowOrders = useQuery(api.adminQueries.getDisputedOrEscrowOrders, queryArgs) ?? [];
    const usersRaw = useQuery(api.users.listUsers, queryArgs);
    const users = usersRaw ?? [];
    const kycQueue = useQuery(api.adminQueries.getKycReviewQueue, activeTab === 'kyc' ? queryArgs : 'skip') ?? [];
    const platformIncome = useQuery(api.adminQueries.getPlatformIncome, activeTab === 'ingresos' ? queryArgs : 'skip');
    const incomeLedger = useQuery(
        api.adminQueries.listIncomeLedger,
        activeTab === 'ingresos' && sessionToken ? { sessionToken, limit: 300 } : 'skip',
    ) ?? [];
    const security = useQuery(api.adminQueries.getSecurityOverview, activeTab === 'seguridad' || activeTab === 'resumen' ? queryArgs : 'skip');
    const sessions = useQuery(api.adminQueries.getActiveSessions, activeTab === 'seguridad' ? queryArgs : 'skip');
    const auditLogs = useQuery(api.adminQueries.getAuditLogs, activeTab === 'logs' ? queryArgs : 'skip');

    const adminForceReleaseEscrow = useAction(api.stripe.adminForceReleaseEscrow);
    const adminRefundEscrow = useAction(api.stripe.adminRefundEscrow);
    const resolveDispute = useAction(api.disputes.resolveDispute);
    const banUserMutation = useMutation(api.users.banUser);
    const unbanUserMutation = useMutation(api.users.unbanUser);
    const approveKycMutation = useMutation(api.users.approveKYC);
    const rejectKycMutation = useMutation(api.users.rejectKYC);
    const revokeSessionMutation = useMutation(api.adminQueries.revokeSession);

    const runOp = async (id: string, op: () => Promise<any>, okMsg: string) => {
        setProcessingIds(prev => ({ ...prev, [id]: true }));
        try {
            await op();
            show(okMsg, 'success');
        } catch (e: any) {
            show(e.message || 'Error en la operación', 'error');
        } finally {
            setProcessingIds(prev => ({ ...prev, [id]: false }));
        }
    };

    const handleForceRelease = async (orderId: string) => {
        if (!(await confirmAction('Forzar Pago', '¿Liberar el pago al vendedor? Esta acción no se puede deshacer.'))) return;
        runOp(orderId, () => adminForceReleaseEscrow({ sessionToken, orderId: orderId as any }), 'Pago liberado al vendedor.');
    };

    const handleRefund = async (orderId: string) => {
        if (!(await confirmAction('Reembolsar', '¿Devolver el dinero al comprador? El vendedor no cobra.'))) return;
        runOp(orderId, () => adminRefundEscrow({ sessionToken, orderId: orderId as any }), 'Reembolso procesado.');
    };

    const handleResolveDispute = async (orderId: string, inFavorOf: 'buyer' | 'seller') => {
        const who = inFavorOf === 'buyer' ? 'comprador (reembolso)' : 'vendedor (liberación)';
        if (!(await confirmAction('Resolver Disputa', `¿Resolver a favor del ${who}?`))) return;
        runOp(orderId, () => resolveDispute({ sessionToken, orderId: orderId as any, resolveInFavorOf: inFavorOf }), 'Disputa resuelta.');
    };

    const handleBanToggle = async (u: any) => {
        if (u.isBanned) {
            if (!(await confirmAction('Desbanear', `¿Restaurar el acceso de ${u.email}?`))) return;
            runOp(u._id, () => unbanUserMutation({ sessionToken, userId: u._id }), 'Usuario desbaneado.');
        } else {
            if (!(await confirmAction('Banear', `¿Banear permanentemente a ${u.email}? Se revocan sus sesiones.`))) return;
            runOp(u._id, () => banUserMutation({ sessionToken, userId: u._id }), 'Usuario baneado.');
        }
    };

    const handleRevokeSession = async (s: any) => {
        if (!(await confirmAction('Revocar sesión', `¿Cerrar la sesión de ${s.email}? El dispositivo deberá volver a loguearse.`))) return;
        runOp(s._id, () => revokeSessionMutation({ sessionToken, sessionId: s._id }), 'Sesión revocada.');
    };

    const handleApproveKyc = async (userId: string, email: string) => {
        if (!(await confirmAction('Aprobar KYC', `¿Aprobar identidad de ${email}?`))) return;
        runOp(userId, () => approveKycMutation({ sessionToken, targetUserId: userId as any }), 'KYC aprobado.');
    };

    const handleRejectKyc = async (userId: string, email: string) => {
        if (!(await confirmAction('Rechazar KYC', `¿Rechazar documentación de ${email}? Deberá reenviar.`))) return;
        runOp(userId, () => rejectKycMutation({ sessionToken, targetUserId: userId as any }), 'KYC rechazado.');
    };

    if (status === 'loading') {
        return <View style={styles.center}><ActivityIndicator size="large" color="#818CF8" /></View>;
    }
    if (!sessionToken) {
        return (
            <View style={[styles.center, { padding: 24 }]}>
                <Shield size={40} color="#818CF8" />
                <Text style={styles.centerText}>Sesión inválida. Cerrá sesión e iniciá sesión de nuevo.</Text>
            </View>
        );
    }

    // ── Secciones ──

    const renderStatCard = (label: string, value: string, Icon: any, color: string, key: string) => (
        <View key={key} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: color + '22' }]}>
                <Icon size={17} color={color} />
            </View>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{value}</Text>
        </View>
    );

    const renderResumen = () => {
        if (!platformStats) return <Loading styles={styles} label="Cargando estadísticas…" />;
        const s = platformStats;
        return (
            <>
                <SectionTitle styles={styles} icon={Activity} label="Marketplace" />
                <View style={styles.statsGrid}>
                    {renderStatCard('Volumen Total', `$${s.totalSalesVolume.toFixed(2)}`, DollarSign, '#10B981', 'v')}
                    {renderStatCard('Órdenes', `${s.totalOrders}`, ShoppingBag, '#3B82F6', 'o')}
                    {renderStatCard('Completadas', `${s.completedOrders}`, ShieldCheck, '#059669', 'c')}
                    {renderStatCard('En Escrow', `${s.escrowHeldOrders}`, TrendingUp, '#D97706', 'e')}
                    {renderStatCard('En Disputa', `${s.disputedOrders}`, AlertTriangle, '#EF4444', 'd')}
                    {renderStatCard('Canceladas', `${s.cancelledOrders}`, XCircle, '#6B7280', 'x')}
                    {renderStatCard('Compradores', `${s.uniqueBuyers}`, Users, '#4FC3F7', 'b')}
                    {renderStatCard('Vendedores', `${s.uniqueSellers}`, Users, '#EC4899', 's')}
                    {renderStatCard('Vol. Escrow', `$${s.escrowHeldVolume.toFixed(2)}`, ShieldCheck, '#F59E0B', 've')}
                    {renderStatCard('Órdenes 30d', `${s.recentOrdersCount}`, TrendingUp, '#06B6D4', 'r')}
                    {renderStatCard('Vol. 30d', `$${s.recentVolume.toFixed(2)}`, DollarSign, '#0EA5E9', 'rv')}
                </View>

                <SectionTitle styles={styles} icon={Shield} label="Salud del sistema" />
                {!security ? <Loading styles={styles} label="Cargando seguridad…" /> : (
                    <View style={styles.statsGrid}>
                        {renderStatCard('Usuarios', `${security.totalUsers}`, Users, '#6366F1', 'tu')}
                        {renderStatCard('Sesiones activas', `${security.activeSessionCount}`, SessionIcon, '#10B981', 'sa')}
                        {renderStatCard('Hashes legacy', `${security.hashCounts.legacy}`, KeyRound, '#D97706', 'hl')}
                        {renderStatCard('Hashes rotos', `${security.hashCounts.bcrypt}`, KeyRound, '#EF4444', 'hb')}
                        {renderStatCard('Sin password', `${security.hashCounts.none}`, KeyRound, '#6B7280', 'hn')}
                        {renderStatCard('IPs bloqueadas', `${security.blockedRateLimits.length}`, Ban, '#EF4444', 'rl')}
                    </View>
                )}
            </>
        );
    };

    const renderIngresos = () => {
        if (!platformIncome) return <Loading styles={styles} label="Cargando ingresos…" />;
        const s = platformIncome.summary;
        const maxCommission = Math.max(...platformIncome.series.map((p) => p.commission), 1);

        const filtered = incomeLedger.filter((row: any) => {
            const q = incomeFilters.q.trim().toLowerCase();
            const qOk = !q
                || String(row._id).toLowerCase().includes(q)
                || String(row.orderId ?? '').toLowerCase().includes(q)
                || String(row.userId ?? '').toLowerCase().includes(q)
                || String(row.sellerId ?? '').toLowerCase().includes(q)
                || String(row.stripePaymentIntentId ?? '').toLowerCase().includes(q);
            const statusOk = !incomeFilters.status.trim() || row.status === incomeFilters.status.trim();
            const sourceOk = !incomeFilters.source.trim() || row.source === incomeFilters.source.trim();
            const minOk = !incomeFilters.minCommission.trim()
                || row.commission >= parseFloat(incomeFilters.minCommission);
            const fromOk = !incomeFilters.from.trim()
                || (row.createdAt ?? '').slice(0, 10) >= incomeFilters.from.trim();
            return qOk && statusOk && sourceOk && minOk && fromOk;
        });
        const incomePage = paginate(filtered, pageOf('ingresos'));

        return (
            <>
                <SectionTitle styles={styles} icon={Wallet} label="Ingresos de la plataforma" />
                <View style={styles.statsGrid}>
                    {renderStatCard('Volumen bruto', fmtMoney(s.grossVolume), DollarSign, '#10B981', 'ig')}
                    {renderStatCard('Comisión Ramgos', fmtMoney(s.platformCommission), TrendingUp, '#6366F1', 'ic')}
                    {renderStatCard('Neto plataforma', fmtMoney(s.netPlatform), ShieldCheck, '#059669', 'in')}
                    {renderStatCard('Fees Stripe', fmtMoney(s.providerFees), XCircle, '#EF4444', 'if')}
                    {renderStatCard('En escrow', fmtMoney(s.inEscrow), Clock, '#D97706', 'ie')}
                    {renderStatCard('Comisión 30d', fmtMoney(s.commission30d), Activity, '#0EA5E9', 'i30')}
                    {renderStatCard('MRR estimado', fmtMoney(s.estimatedMrr), Wallet, '#4FC3F7', 'imrr')}
                    {renderStatCard('Suscripciones', `${s.activeSubscriptions}`, Users, '#EC4899', 'isub')}
                    {renderStatCard('Reembolsos', fmtMoney(s.refundedVolume), RotateCcw, '#6B7280', 'iref')}
                    {renderStatCard('Transacciones', `${s.transactionCount}`, ShoppingBag, '#3B82F6', 'itx')}
                </View>

                <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>Comisión diaria (14 días)</Text>
                    <View style={styles.chartRow}>
                        {platformIncome.series.map((point) => (
                            <View key={point.date} style={styles.chartCol}>
                                <View
                                    style={[
                                        styles.chartBar,
                                        { height: Math.max(8, (point.commission / maxCommission) * 72) },
                                    ]}
                                />
                                <Text style={styles.chartLabel}>{point.date.slice(5)}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <TouchableOpacity
                    style={styles.financeLink}
                    onPress={() => navigation.navigate('AdminFinance')}
                >
                    <Text style={styles.financeLinkText}>Operaciones financieras (escrows, disputas, reconciliación)</Text>
                    <ArrowUpRight size={16} color="#818CF8" />
                </TouchableOpacity>

                <SectionTitle styles={styles} icon={ScrollText} label="Registro de ingresos" count={filtered.length} />
                <AdvancedSearchPanel
                    styles={styles} isDark={isDark}
                    open={advOpen.ingresos}
                    onToggle={() => setAdvOpen((p) => ({ ...p, ingresos: !p.ingresos }))}
                    fields={[
                        { key: 'q', label: 'ID pago / orden / usuario', placeholder: 'Buscar en ledger…' },
                        { key: 'status', label: 'Estado', placeholder: 'succeeded, succeeded_in_escrow…' },
                        { key: 'source', label: 'Fuente', placeholder: 'marketplace' },
                        { key: 'minCommission', label: 'Comisión mínima (USD)', placeholder: 'Ej: 1.50' },
                        { key: 'from', label: 'Desde (YYYY-MM-DD)', placeholder: '2026-01-01' },
                    ]}
                    values={incomeFilters}
                    onChange={(k, v) => { setIncomeFilters((p) => ({ ...p, [k]: v })); resetPage('ingresos'); }}
                />

                {filtered.length === 0 ? (
                    <Empty styles={styles} icon={Wallet} label="Sin movimientos que coincidan." />
                ) : (
                    <>
                        {incomePage.items.map((row: any) => {
                    const st = PAYMENT_STATUS[row.status] ?? { label: row.status, color: '#6B7280' };
                    return (
                        <View key={row._id} style={styles.card}>
                            <View style={styles.cardTopRow}>
                                <Text style={styles.cardTitle}>Pago …{String(row._id).slice(-8)}</Text>
                                <Chip styles={styles} label={st.label} color={st.color} />
                            </View>
                            <Text style={styles.cardAmount}>{fmtMoney(row.gross)}</Text>
                            <Text style={styles.cardMeta}>
                                Comisión {fmtMoney(row.commission)} · Neto {fmtMoney(row.netPlatform)} · {row.provider}
                            </Text>
                            <Text style={styles.cardMeta}>
                                Comprador …{String(row.userId ?? '').slice(-6)}
                                {row.sellerId ? ` · Vendedor …${String(row.sellerId).slice(-6)}` : ''}
                            </Text>
                            {row.orderId ? (
                                <Text style={styles.monoRow}>Orden …{String(row.orderId).slice(-8)}</Text>
                            ) : null}
                            <Text style={styles.cardMeta}>{fmtDate(row.createdAt)}</Text>
                        </View>
                    );
                })}
                        <ListPager
                            isDark={isDark}
                            page={incomePage.page}
                            totalPages={incomePage.totalPages}
                            total={incomePage.total}
                            onPage={(p) => setPageOf('ingresos', p)}
                        />
                    </>
                )}
            </>
        );
    };

    const renderEscrow = () => {
        const filtered = escrowOrders.filter((order: any) => {
            const idTail = String(order._id).slice(-8);
            const statusOk = !escrowFilters.status.trim() || order.status === escrowFilters.status.trim();
            const minOk = !escrowFilters.minAmount.trim() || (order.total || 0) >= parseFloat(escrowFilters.minAmount);
            const q = escrowFilters.q.trim().toLowerCase();
            const qOk = !q
                || idTail.includes(q)
                || String(order.sellerId).toLowerCase().includes(q)
                || String(order.userId).toLowerCase().includes(q)
                || String(order.status).toLowerCase().includes(q);
            return statusOk && minOk && qOk;
        });
        const escrowPage = paginate(filtered, pageOf('escrow'));
        return (
            <>
                <SectionTitle styles={styles} icon={Gavel} label="Escrow y Disputas" count={filtered.length} />
                <AdvancedSearchPanel
                    styles={styles} isDark={isDark}
                    open={advOpen.escrow}
                    onToggle={() => setAdvOpen((p) => ({ ...p, escrow: !p.escrow }))}
                    fields={[
                        { key: 'q', label: 'ID / vendedor / comprador', placeholder: 'Ej: a3f2, sellerId…' },
                        { key: 'status', label: 'Estado', placeholder: 'paid_escrow o disputed' },
                        { key: 'minAmount', label: 'Monto mínimo (USD)', placeholder: 'Ej: 50' },
                    ]}
                    values={escrowFilters}
                    onChange={(k, v) => { setEscrowFilters((p) => ({ ...p, [k]: v })); resetPage('escrow'); }}
                />
                {filtered.length === 0 ? (
                    <Empty styles={styles} icon={ShieldCheck} label="No hay órdenes que coincidan." />
                ) : (
                    <>
                        {escrowPage.items.map((order: any) => {
                const isProcessing = processingIds[order._id];
                const isDisputed = order.status === 'disputed';
                const st = STATUS_LABELS[order.status] ?? { label: order.status, color: '#6B7280' };
                return (
                    <View key={order._id} style={styles.card}>
                        <View style={styles.cardTopRow}>
                            <Text style={styles.cardTitle}>Orden #{String(order._id).slice(-8)}</Text>
                            <Chip styles={styles} label={st.label} color={st.color} />
                        </View>
                        <Text style={styles.cardAmount}>${(order.total || 0).toFixed(2)}</Text>
                        <Text style={styles.cardMeta}>
                            Vendedor …{String(order.sellerId).slice(-6)} · Comprador …{String(order.userId).slice(-6)}
                        </Text>
                        <View style={styles.actionRow}>
                            <ActionBtn styles={styles} kind="success" label="Forzar Pago" busy={isProcessing} onPress={() => handleForceRelease(order._id)} />
                            <ActionBtn styles={styles} kind="danger" label="Reembolsar" busy={isProcessing} onPress={() => handleRefund(order._id)} />
                            {isDisputed && (
                                <>
                                    <ActionBtn styles={styles} kind="info" label="A favor comprador" busy={isProcessing} onPress={() => handleResolveDispute(order._id, 'buyer')} />
                                    <ActionBtn styles={styles} kind="info" label="A favor vendedor" busy={isProcessing} onPress={() => handleResolveDispute(order._id, 'seller')} />
                                </>
                            )}
                        </View>
                    </View>
                );
            })}
                        <ListPager
                            isDark={isDark}
                            page={escrowPage.page}
                            totalPages={escrowPage.totalPages}
                            total={escrowPage.total}
                            onPage={(p) => setPageOf('escrow', p)}
                        />
                    </>
                )}
            </>
        );
    };

    const renderUsuarios = () => {
        const filtered = users
            .filter((u: any) => {
                const qOk = includes(u.email, userFilters.q) || includes(u.name, userFilters.q) || includes(u._id, userFilters.q);
                const roleOk = !userFilters.role.trim() || u.role === userFilters.role.trim();
                const kycOk = !userFilters.kyc.trim() || (u.kycStatus ?? 'unverified') === userFilters.kyc.trim();
                const bannedOk = !userFilters.banned.trim()
                    || (userFilters.banned === 'yes' ? !!u.isBanned : !u.isBanned);
                return qOk && roleOk && kycOk && bannedOk;
            });
        const usersPage = paginate(filtered, pageOf('usuarios'));
        return (
            <>
                <SectionTitle styles={styles} icon={Users} label="Usuarios" count={filtered.length} />
                <AdvancedSearchPanel
                    styles={styles} isDark={isDark}
                    open={advOpen.usuarios}
                    onToggle={() => setAdvOpen((p) => ({ ...p, usuarios: !p.usuarios }))}
                    fields={[
                        { key: 'q', label: 'Email, nombre o ID', placeholder: 'Buscar usuario…' },
                        { key: 'role', label: 'Rol', placeholder: 'consumer, business, influencer…' },
                        { key: 'kyc', label: 'Estado KYC', placeholder: 'pending, approved, rejected…' },
                        { key: 'banned', label: 'Baneado (yes/no)', placeholder: 'yes o no' },
                    ]}
                    values={userFilters}
                    onChange={(k, v) => { setUserFilters((p) => ({ ...p, [k]: v })); resetPage('usuarios'); }}
                />
                {usersRaw === undefined ? (
                    <Loading styles={styles} label="Cargando usuarios…" />
                ) : filtered.length === 0 ? (
                    <Empty styles={styles} icon={Users} label="Sin resultados." />
                ) : (
                    <>
                        {usersPage.items.map((u: any) => {
                    const roleColor = ROLE_COLORS[u.role] ?? '#6B7280';
                    const isProcessing = processingIds[u._id];
                    const kyc = KYC_STATUS[u.kycStatus ?? 'unverified'] ?? KYC_STATUS.unverified;
                    return (
                        <View key={u._id} style={[styles.card, styles.userCard]}>
                            <View style={[styles.avatar, { backgroundColor: roleColor + '22' }]}>
                                <Text style={[styles.avatarText, { color: roleColor }]}>
                                    {(u.name || u.email || '?').charAt(0).toUpperCase()}
                                </Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <View style={styles.rowWrap}>
                                    <Text style={styles.cardTitle} numberOfLines={1}>{u.name || u.email}</Text>
                                    {u.isBanned && <Chip styles={styles} label="Baneado" color="#EF4444" />}
                                </View>
                                <Text style={styles.cardMeta} numberOfLines={1}>{u.email}</Text>
                                <View style={[styles.rowWrap, { marginTop: 6 }]}>
                                    <Chip styles={styles} label={u.role} color={roleColor} />
                                    <Chip styles={styles} label={kyc.label} color={kyc.color} />
                                </View>
                            </View>
                            {u.role !== 'admin' && (
                                <TouchableOpacity
                                    style={[styles.iconBtn, u.isBanned ? styles.btnSuccess : styles.btnDanger, isProcessing && styles.btnDisabled]}
                                    onPress={() => handleBanToggle(u)}
                                    disabled={isProcessing}
                                >
                                    {u.isBanned ? <RotateCcw size={15} color="#FFF" /> : <Ban size={15} color="#FFF" />}
                                    <Text style={styles.btnText}>{u.isBanned ? 'Desbanear' : 'Banear'}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                })}
                        <ListPager
                            isDark={isDark}
                            page={usersPage.page}
                            totalPages={usersPage.totalPages}
                            total={usersPage.total}
                            onPage={(p) => setPageOf('usuarios', p)}
                        />
                    </>
                )}
            </>
        );
    };

    const renderKyc = () => {
        const filtered = kycQueue.filter((u: any) =>
            (includes(u.email, kycFilters.q) || includes(u.name, kycFilters.q) || includes(u._id, kycFilters.q))
            && (!kycFilters.role.trim() || u.role === kycFilters.role.trim())
        );
        const kycPage = paginate(filtered, pageOf('kyc'));
        return (
            <>
                <SectionTitle styles={styles} icon={FileCheck} label="Cola de verificación KYC" count={filtered.length} />
                <AdvancedSearchPanel
                    styles={styles} isDark={isDark}
                    open={advOpen.kyc}
                    onToggle={() => setAdvOpen((p) => ({ ...p, kyc: !p.kyc }))}
                    fields={[
                        { key: 'q', label: 'Email, nombre o ID', placeholder: 'Buscar en cola KYC…' },
                        { key: 'role', label: 'Rol', placeholder: 'consumer, business, influencer' },
                    ]}
                    values={kycFilters}
                    onChange={(k, v) => { setKycFilters((p) => ({ ...p, [k]: v })); resetPage('kyc'); }}
                />
                {filtered.length === 0 ? (
                    <Empty styles={styles} icon={FileCheck} label="No hay solicitudes KYC pendientes." />
                ) : (
                    <>
                        {kycPage.items.map((u: any) => {
                    const isProcessing = processingIds[u._id];
                    const kyc = KYC_STATUS[u.kycStatus] ?? KYC_STATUS.pending;
                    const roleColor = ROLE_COLORS[u.role] ?? '#6B7280';
                    const docs = u.verificationDocuments ?? [];
                    return (
                        <View key={u._id} style={styles.card}>
                            <View style={styles.cardTopRow}>
                                <Text style={styles.cardTitle}>{u.name || u.email}</Text>
                                <Chip styles={styles} label={kyc.label} color={kyc.color} />
                            </View>
                            <Text style={styles.cardMeta}>{u.email} · {u.role}</Text>
                            <Text style={styles.cardMeta}>Registro: {fmtDate(u.joinedAt)}</Text>

                            {docs.length === 0 ? (
                                <Text style={[styles.cardMeta, { marginTop: 8, fontStyle: 'italic' }]}>
                                    Sin documentos adjuntos — pedile al usuario que complete KYC.
                                </Text>
                            ) : (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                                    <View style={styles.docRow}>
                                        {docs.map((doc: any, i: number) => (
                                            <View key={`${doc.type}-${i}`} style={styles.docThumb}>
                                                <Image source={{ uri: doc.url }} style={styles.docImage} resizeMode="cover" />
                                                <Text style={styles.docLabel}>{DOC_LABELS[doc.type] ?? doc.type}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </ScrollView>
                            )}

                            <View style={styles.actionRow}>
                                <ActionBtn
                                    styles={styles} kind="success" label="Aprobar KYC"
                                    busy={isProcessing}
                                    onPress={() => handleApproveKyc(u._id, u.email)}
                                />
                                <ActionBtn
                                    styles={styles} kind="danger" label="Rechazar KYC"
                                    busy={isProcessing}
                                    onPress={() => handleRejectKyc(u._id, u.email)}
                                />
                                <Chip styles={styles} label={u.role} color={roleColor} />
                            </View>
                        </View>
                    );
                })}
                        <ListPager
                            isDark={isDark}
                            page={kycPage.page}
                            totalPages={kycPage.totalPages}
                            total={kycPage.total}
                            onPage={(p) => setPageOf('kyc', p)}
                        />
                    </>
                )}
            </>
        );
    };

    const renderSeguridad = () => {
        const hashRows = (security?.userHashes ?? []).filter((u: any) => {
            const qOk = includes(u.email, securityFilters.q) || includes(u.name, securityFilters.q);
            const typeOk = !securityFilters.hashType.trim() || u.hashType === securityFilters.hashType.trim();
            return qOk && typeOk;
        });
        const sessionRows = (sessions ?? []).filter((s: any) => {
            const qOk = includes(s.email, securityFilters.q) || includes(s.userId, securityFilters.q);
            const state = s.revoked ? 'revoked' : s.expired ? 'expired' : 'active';
            const stateOk = !securityFilters.sessionState.trim() || state === securityFilters.sessionState.trim();
            return qOk && stateOk;
        });
        const rateLimitPage = paginate(security?.blockedRateLimits ?? [], pageOf('seg-ratelimits'));
        const sessionsPage = paginate(sessionRows, pageOf('seg-sessions'));
        return (
        <>
            <AdvancedSearchPanel
                styles={styles} isDark={isDark}
                open={advOpen.seguridad}
                onToggle={() => setAdvOpen((p) => ({ ...p, seguridad: !p.seguridad }))}
                fields={[
                    { key: 'q', label: 'Email o user ID', placeholder: 'Filtrar usuarios/sesiones…' },
                    { key: 'hashType', label: 'Tipo hash', placeholder: 'legacy, bcrypt, none' },
                    { key: 'sessionState', label: 'Estado sesión', placeholder: 'active, revoked, expired' },
                ]}
                values={securityFilters}
                onChange={(k, v) => {
                    setSecurityFilters((p) => ({ ...p, [k]: v }));
                    resetPage('seg-sessions');
                    resetPage('seg-ratelimits');
                }}
            />
            <SectionTitle styles={styles} icon={KeyRound} label="Hashes de contraseñas" />
            {!security ? <Loading styles={styles} label="Cargando…" /> : (
                <>
                    <View style={styles.statsGrid}>
                        {renderStatCard('Legacy (dev)', `${security.hashCounts.legacy}`, KeyRound, '#D97706', 'l')}
                        {renderStatCard('Bcrypt (rotos)', `${security.hashCounts.bcrypt}`, KeyRound, '#EF4444', 'b')}
                        {renderStatCard('Sin password', `${security.hashCounts.none}`, KeyRound, '#6B7280', 'n')}
                    </View>
                    {security.hashCounts.bcrypt > 0 && (
                        <View style={[styles.card, { borderColor: '#EF444455' }]}>
                            <View style={styles.rowWrap}>
                                <AlertTriangle size={16} color="#EF4444" />
                                <Text style={[styles.cardTitle, { color: '#EF4444' }]}>Hashes bcrypt irrecuperables</Text>
                            </View>
                            <Text style={styles.cardMeta}>
                                Estos usuarios se registraron cuando bcrypt estaba activo y no pueden loguearse.
                                Corré `seedUsers:createTests` para cuentas de test, o pedile al usuario que se re-registre.
                            </Text>
                            {hashRows.filter((u: any) => u.hashType === 'bcrypt').slice(0, 20).map((u: any) => (
                                <Text key={u._id} style={styles.monoRow}>• {u.email} ({u.role})</Text>
                            ))}
                        </View>
                    )}
                    {security.blockedRateLimits.length > 0 && (
                        <>
                            <SectionTitle styles={styles} icon={Ban} label="Rate limits bloqueados" count={security.blockedRateLimits.length} />
                            {rateLimitPage.items.map((r: any) => (
                                <View key={r.key} style={styles.card}>
                                    <Text style={styles.cardTitle}>{r.key}</Text>
                                    <Text style={styles.cardMeta}>{r.attempts} intentos · bloqueado hasta {fmtDate(new Date(r.blockedUntil).toISOString())}</Text>
                                </View>
                            ))}
                            <ListPager
                                isDark={isDark}
                                page={rateLimitPage.page}
                                totalPages={rateLimitPage.totalPages}
                                total={rateLimitPage.total}
                                onPage={(p) => setPageOf('seg-ratelimits', p)}
                            />
                        </>
                    )}
                </>
            )}

            <SectionTitle styles={styles} icon={SessionIcon} label="Sesiones" count={sessionRows.length} />
            {!sessions ? <Loading styles={styles} label="Cargando sesiones…" /> :
                sessionRows.length === 0 ? <Empty styles={styles} icon={SessionIcon} label="Sin sesiones que coincidan." /> :
                (
                    <>
                        {sessionsPage.items.map((s: any) => {
                    const isProcessing = processingIds[s._id];
                    const dead = s.revoked || s.expired;
                    return (
                        <View key={s._id} style={[styles.card, styles.userCard, dead && { opacity: 0.55 }]}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <View style={styles.rowWrap}>
                                    <Text style={styles.cardTitle} numberOfLines={1}>{s.email}</Text>
                                    <Chip styles={styles}
                                        label={s.revoked ? 'Revocada' : s.expired ? 'Expirada' : 'Activa'}
                                        color={s.revoked ? '#6B7280' : s.expired ? '#D97706' : '#10B981'} />
                                </View>
                                <Text style={styles.cardMeta}>{s.role} · creada {fmtDate(s.createdAt)}</Text>
                            </View>
                            {!dead && (
                                <TouchableOpacity
                                    style={[styles.iconBtn, styles.btnDanger, isProcessing && styles.btnDisabled]}
                                    onPress={() => handleRevokeSession(s)}
                                    disabled={isProcessing}
                                >
                                    <SessionIcon size={15} color="#FFF" />
                                    <Text style={styles.btnText}>Revocar</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                })}
                        <ListPager
                            isDark={isDark}
                            page={sessionsPage.page}
                            totalPages={sessionsPage.totalPages}
                            total={sessionsPage.total}
                            onPage={(p) => setPageOf('seg-sessions', p)}
                        />
                    </>
                )}
        </>
        );
    };

    const renderLogs = () => {
        const filtered = (auditLogs ?? []).filter((log: any) => {
            const actionOk = !logFilters.action.trim()
                || log.action.toLowerCase().includes(logFilters.action.trim().toLowerCase());
            const qOk = !logFilters.q.trim()
                || includes(log.action, logFilters.q)
                || includes(String(log.actorUserId), logFilters.q)
                || includes(String(log.targetUserId), logFilters.q)
                || includes(JSON.stringify(log.metadata ?? {}), logFilters.q);
            return actionOk && qOk;
        });
        const logsPage = paginate(filtered, pageOf('logs'));
        return (
        <>
            <SectionTitle styles={styles} icon={ScrollText} label="Logs internos (auditoría)" count={filtered.length} />
            <AdvancedSearchPanel
                styles={styles} isDark={isDark}
                open={advOpen.logs}
                onToggle={() => setAdvOpen((p) => ({ ...p, logs: !p.logs }))}
                fields={[
                    { key: 'q', label: 'Actor, target o metadata', placeholder: 'Buscar en logs…' },
                    { key: 'action', label: 'Acción', placeholder: 'KYC_APPROVED, USER_BANNED…' },
                ]}
                values={logFilters}
                onChange={(k, v) => { setLogFilters((p) => ({ ...p, [k]: v })); resetPage('logs'); }}
            />
            {!auditLogs ? <Loading styles={styles} label="Cargando logs…" /> :
                filtered.length === 0 ? (
                    <Empty styles={styles} icon={ScrollText} label="Sin eventos que coincidan con el filtro." />
                ) : (
                    <>
                        {logsPage.items.map((log: any) => (
                    <View key={log._id} style={styles.card}>
                        <View style={styles.cardTopRow}>
                            <Text style={styles.cardTitle}>{ACTION_LABELS[log.action] ?? log.action}</Text>
                            <Text style={styles.cardMeta}>{fmtDate(log.timestamp)}</Text>
                        </View>
                        <Text style={styles.cardMeta}>
                            Actor …{String(log.actorUserId).slice(-6)}
                            {log.targetUserId ? ` → Target …${String(log.targetUserId).slice(-6)}` : ''}
                        </Text>
                        {log.metadata ? <Text style={styles.monoRow}>{JSON.stringify(log.metadata)}</Text> : null}
                    </View>
                ))}
                        <ListPager
                            isDark={isDark}
                            page={logsPage.page}
                            totalPages={logsPage.totalPages}
                            total={logsPage.total}
                            onPage={(p) => setPageOf('logs', p)}
                        />
                    </>
                )}
        </>
        );
    };

    return (
        <View style={styles.root}>
            <LinearGradient
                colors={glassGradient(isDark)}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <View style={styles.headerRow}>
                <View style={styles.headerIconWrap}>
                    <Shield size={22} color="#818CF8" />
                </View>
                <View>
                    <Text style={styles.header}>Panel Admin</Text>
                    <Text style={styles.subHeader}>Monitoreo, seguridad y operaciones</Text>
                </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsBar} contentContainerStyle={styles.tabsRow}>
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                        <TouchableOpacity
                            key={tab.id}
                            style={[styles.tab, active && styles.tabActive]}
                            onPress={() => setActiveTab(tab.id)}
                        >
                            <Icon size={14} color={active ? '#FFF' : isDark ? '#C7D2FE' : '#4F46E5'} />
                            <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {activeTab === 'resumen' && renderResumen()}
                {activeTab === 'ingresos' && renderIngresos()}
                {activeTab === 'escrow' && renderEscrow()}
                {activeTab === 'usuarios' && renderUsuarios()}
                {activeTab === 'kyc' && renderKyc()}
                {activeTab === 'seguridad' && renderSeguridad()}
                {activeTab === 'logs' && renderLogs()}
            </ScrollView>
        </View>
    );
}

// ── Piezas chicas ──

const SectionTitle = ({ styles, icon: Icon, label, count }: any) => (
    <View style={styles.sectionHeaderRow}>
        <Icon size={17} color="#818CF8" />
        <Text style={styles.sectionTitle}>{label}</Text>
        {count !== undefined && (
            <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{count}</Text>
            </View>
        )}
    </View>
);

const Chip = ({ styles, label, color }: any) => (
    <View style={[styles.statusChip, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        <Text style={[styles.statusChipText, { color }]}>{label}</Text>
    </View>
);

const Loading = ({ styles, label }: any) => (
    <View style={styles.emptyCard}>
        <ActivityIndicator size="small" color="#818CF8" />
        <Text style={styles.mutedText}>{label}</Text>
    </View>
);

const Empty = ({ styles, icon: Icon, label }: any) => (
    <View style={styles.emptyCard}>
        <Icon size={26} color="#10B981" />
        <Text style={styles.mutedText}>{label}</Text>
    </View>
);

const ActionBtn = ({ styles, kind, label, busy, onPress }: any) => (
    <TouchableOpacity
        style={[
            styles.actionBtn,
            kind === 'success' ? styles.btnSuccess : kind === 'danger' ? styles.btnDanger : styles.btnInfo,
            busy && styles.btnDisabled,
        ]}
        onPress={onPress}
        disabled={busy}
    >
        <Text style={styles.btnText}>{busy ? '…' : label}</Text>
    </TouchableOpacity>
);

const AdvancedSearchPanel = ({
    styles, isDark, open, onToggle, fields, values, onChange,
}: {
    styles: ReturnType<typeof getStyles>;
    isDark: boolean;
    open: boolean;
    onToggle: () => void;
    fields: AdvField[];
    values: Record<string, string>;
    onChange: (key: string, value: string) => void;
}) => (
    <View style={styles.advSearchWrap}>
        <TouchableOpacity style={styles.advSearchToggle} onPress={onToggle} activeOpacity={0.85}>
            <Filter size={14} color="#818CF8" />
            <Text style={styles.advSearchToggleText}>Búsqueda avanzada</Text>
            {open ? <ChevronUp size={14} color="#818CF8" /> : <ChevronDown size={14} color="#818CF8" />}
        </TouchableOpacity>
        {open && (
            <View style={styles.advSearchPanel}>
                {fields.map((f) => (
                    <View key={f.key} style={styles.advField}>
                        <Text style={styles.advLabel}>{f.label}</Text>
                        <TextInput
                            style={styles.advInput}
                            placeholder={f.placeholder}
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                            value={values[f.key] ?? ''}
                            onChangeText={(t) => onChange(f.key, t)}
                        />
                    </View>
                ))}
            </View>
        )}
    </View>
);

const getStyles = (isDark: boolean) => {
    const glass = glassTokens(isDark);
    const textPrimary = isDark ? '#F9FAFB' : '#111827';
    const textMuted = isDark ? '#9CA3AF' : '#6B7280';
    const glassCard = {
        backgroundColor: glass.bg,
        borderWidth: 1,
        borderColor: glass.border,
        ...glass.shadow,
        ...glass.backdrop,
    } as const;

    return StyleSheet.create({
        root: { flex: 1, backgroundColor: isDark ? '#111827' : '#EEF2FF' },
        content: { padding: 16, paddingBottom: 48 },
        center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: isDark ? '#111827' : '#F3F4F6' },
        centerText: { color: textPrimary, fontSize: 15, textAlign: 'center' },

        headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 8 },
        headerIconWrap: {
            width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center',
            ...glassCard,
        },
        header: { fontSize: 22, fontWeight: '800', color: textPrimary },
        subHeader: { fontSize: 12, color: textMuted, marginTop: 1 },

        tabsBar: { flexGrow: 0, paddingVertical: 8 },
        tabsRow: { gap: 8, paddingHorizontal: 16 },
        tab: {
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 13, paddingVertical: 8, borderRadius: Radius.full,
            ...glassCard,
        },
        tabActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
        tabText: { fontSize: 12.5, fontWeight: '700', color: isDark ? '#C7D2FE' : '#4F46E5' },
        tabTextActive: { color: '#FFF' },

        sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 8 },
        sectionTitle: { fontSize: 16.5, fontWeight: '700', color: textPrimary },
        countBadge: {
            paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.md,
            backgroundColor: isDark ? 'rgba(129,140,248,0.2)' : 'rgba(79,70,229,0.1)',
        },
        countBadgeText: { fontSize: 11, fontWeight: '700', color: isDark ? '#C7D2FE' : '#4F46E5' },

        statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
        statCard: {
            flexBasis: '30%', flexGrow: 1, minWidth: 104, padding: 13, borderRadius: Radius.lg,
            ...glassCard,
        },
        statIcon: { width: 32, height: 32, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
        statLabel: { fontSize: 11, color: textMuted, marginBottom: 2 },
        statValue: { fontSize: 17, fontWeight: '800', color: textPrimary },

        card: { padding: 15, borderRadius: Radius.lg, marginBottom: 12, ...glassCard },
        emptyCard: { padding: 24, borderRadius: Radius.lg, marginBottom: 12, alignItems: 'center', gap: 8, ...glassCard },
        mutedText: { color: textMuted, fontSize: 13, textAlign: 'center' },
        monoRow: {
            fontSize: 11.5, color: textMuted, marginTop: 4,
            fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
        },

        cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
        rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
        cardTitle: { fontSize: 15, fontWeight: '700', color: textPrimary, flexShrink: 1 },
        cardAmount: { fontSize: 22, fontWeight: '800', color: textPrimary, marginTop: 6 },
        cardMeta: { fontSize: 12, color: textMuted, marginTop: 3 },

        statusChip: {
            paddingHorizontal: 9, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1,
            alignSelf: 'flex-start',
        },
        statusChipText: { fontSize: 11, fontWeight: '700' },

        actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
        actionBtn: {
            flexGrow: 1, minWidth: 110, paddingVertical: 10, paddingHorizontal: 12,
            borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center',
        },
        iconBtn: {
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.md,
        },
        btnSuccess: { backgroundColor: '#10B981' },
        btnDanger: { backgroundColor: '#EF4444' },
        btnInfo: { backgroundColor: '#6366F1' },
        btnDisabled: { opacity: 0.5 },
        btnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12, textAlign: 'center' },

        userCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        avatar: { width: 42, height: 42, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center' },
        avatarText: { fontSize: 17, fontWeight: '800' },

        searchWrap: {
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 13, paddingVertical: 4, borderRadius: Radius.md, marginBottom: 12,
            ...glassCard,
        },
        searchInput: {
            flex: 1, paddingVertical: 9, fontSize: 13.5, color: textPrimary,
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
        },

        advSearchWrap: { marginBottom: 12 },
        advSearchToggle: {
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 13, paddingVertical: 10, borderRadius: Radius.md,
            ...glassCard,
        },
        advSearchToggleText: { flex: 1, fontSize: 13, fontWeight: '700', color: isDark ? '#C7D2FE' : '#4F46E5' },
        advSearchPanel: {
            marginTop: 8, padding: 12, borderRadius: Radius.lg, gap: 10,
            ...glassCard,
        },
        advField: { gap: 4 },
        advLabel: { fontSize: 11.5, fontWeight: '600', color: textMuted },
        advInput: {
            borderWidth: 1, borderColor: glass.border, borderRadius: Radius.md,
            paddingHorizontal: 11, paddingVertical: 8, fontSize: 13, color: textPrimary,
            backgroundColor: isDark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.5)',
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
        },

        docRow: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
        docThumb: { width: 110, alignItems: 'center' },
        docImage: { width: 100, height: 72, borderRadius: Radius.md, backgroundColor: colors(isDark).glass },
        docLabel: { fontSize: 10, color: textMuted, marginTop: 4, textAlign: 'center' },

        chartCard: { padding: 14, borderRadius: Radius.lg, marginBottom: 14, ...glassCard },
        chartTitle: { fontSize: 13, fontWeight: '700', color: textPrimary, marginBottom: 10 },
        chartRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4, height: 96 },
        chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
        chartBar: { width: '80%', borderRadius: Radius.sm, backgroundColor: '#6366F1', minHeight: 8 },
        chartLabel: { fontSize: 8, color: textMuted, marginTop: 4 },

        financeLink: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            padding: 13, borderRadius: Radius.md, marginBottom: 14, ...glassCard,
        },
        financeLinkText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: isDark ? '#C7D2FE' : '#4F46E5', marginRight: 8 },
    });
};
