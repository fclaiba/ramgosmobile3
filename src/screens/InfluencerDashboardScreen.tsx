import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Share, Modal, TextInput, useWindowDimensions, Linking, ActivityIndicator } from 'react-native';
import { Share2, Copy, TrendingUp, Users, DollarSign, Award, Link, ArrowUpRight, Gift, Send, MousePointer2, ShoppingCart, Target, ArrowDownRight, Wallet, ShieldCheck, X, Wrench, CreditCard, CheckCircle2, ExternalLink } from 'lucide-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { WalletStats } from "../components/dashboard/WalletStats";
import { ActiveCampaigns } from "../components/dashboard/ActiveCampaigns";
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { useReferral } from '../contexts/ReferralContext';
import { useFintech, PaymentRecord } from '../contexts/FintechContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '../hooks/useResponsive';
import { ResponsiveLayout } from '../components/ResponsiveLayout';
import { DesktopSidebar } from '../components/DesktopSidebar';

export default function InfluencerDashboardScreen({ isTabMode, onMenuPress }: any) {
    const navigation = useNavigation<any>();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = useMemo(() => getStyles(isDark), [isDark]);
    const { show } = useToast();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { isDesktop } = useResponsive();

    const [modalVisible, setModalVisible] = useState(false);
    const [transferEmail, setTransferEmail] = useState('');
    const [selectedFollower, setSelectedFollower] = useState<string | null>(null);
    const [bonusAmount, setBonusAmount] = useState('25');
    const [bonusNote, setBonusNote] = useState('Gracias por compartir el cupón esta semana.');
    const { referralCode, referralLink, referralSummary } = useReferral();
    const { user } = useAuth();
    const influencerId = user?.id ?? 'influencer_demo';
    const influencerName = user?.name ?? 'Influencer Demo';
    const { ensureWalletAccount, getWalletByOwner, requestWithdrawal, payments, getKycStatus } = useFintech();

    // ─── Influencer campaigns (server-backed) ──────────────────────────
    // Replaces the legacy WalletContext.campaigns / .contracts mock.
    // We pull the influencer's full list (active + pending + paused) and
    // split it client-side into two buckets: pending invitations from
    // businesses (the influencer has to accept/reject) and everything
    // else. The single backend table replaces both the "código por
    // tienda" and "contratos" sections of the legacy UI.
    const campaignRows = useQuery(
        api.campaigns.getMyCampaigns,
        user?.id ? { influencerId: user.id as Id<"users"> } : 'skip',
    ) ?? [];
    const proposeCampaignMutation = useMutation(api.campaigns.proposeCampaign);
    const respondToCampaignMutation = useMutation(api.campaigns.respondToCampaign);
    const endCampaignMutation = useMutation(api.campaigns.endCampaign);
    const pauseCampaignMutation = useMutation(api.campaigns.pauseCampaign);

    useEffect(() => {
        ensureWalletAccount(influencerId, 'influencer', influencerName);
    }, [ensureWalletAccount, influencerId, influencerName]);

    const wallet = getWalletByOwner(influencerId) ?? getWalletByOwner('influencer_demo');
    const kycStatus = getKycStatus(influencerId);

    // ─── Stripe Connect V2 onboarding (influencer) ─────────────────────
    // Mirrors the BusinessDashboardScreen flow: same 3-step pattern
    // (ensureConnectAccount → createOnboardingLink → poll status). Gated
    // behind kycStatus === 'approved' per the plan. Without a Connect
    // account the influencer's commissions accumulate in walletAccounts
    // .balancePending indefinitely (we cannot transfer with no destination).
    const _api = api as any;
    const ensureConnectAccountAction = useAction(
        _api.connect?.ensureConnectAccount as any,
    );
    const createOnboardingLinkAction = useAction(
        _api.connect?.createOnboardingLink as any,
    );
    const getAccountStatusAction = useAction(
        _api.connect?.getAccountStatus as any,
    );
    const [connectLoading, setConnectLoading] = useState(false);
    const [connectStatus, setConnectStatus] = useState<{
        readyToReceivePayments: boolean;
        onboardingComplete: boolean;
    } | null>(null);
    const stripeConnectAccountId: string | undefined = (user as any)?.stripeConnectAccountId;
    const isKycApproved = kycStatus === 'approved';

    useEffect(() => {
        let cancelled = false;
        if (!stripeConnectAccountId) {
            setConnectStatus(null);
            return;
        }
        (async () => {
            try {
                const status = await getAccountStatusAction({
                    accountId: stripeConnectAccountId,
                });
                if (!cancelled && status) {
                    setConnectStatus({
                        readyToReceivePayments: !!(status as any).readyToReceivePayments,
                        onboardingComplete: !!(status as any).onboardingComplete,
                    });
                }
            } catch (err) {
                console.warn('[Connect V2 / influencer] status fetch failed', err);
            }
        })();
        return () => { cancelled = true; };
    }, [stripeConnectAccountId, getAccountStatusAction, user?.id]);

    const handleStripeConnectOnboarding = async () => {
        if (!user) { show('Inicia sesión primero', 'error'); return; }
        if (!isKycApproved) {
            show('Completa tu verificación KYC primero.', 'warning');
            navigation.navigate('KYC', { accountType: 'influencer' });
            return;
        }
        setConnectLoading(true);
        try {
            const ensured = await ensureConnectAccountAction({
                displayName: influencerName || user.name || 'Ramgos influencer',
                contactEmail: user.email,
            });
            const accountId = (ensured as any)?.accountId;
            if (!accountId) throw new Error('No se obtuvo accountId de Stripe.');

            const link = await createOnboardingLinkAction({
                accountId,
            });
            const url = (link as any)?.url;
            if (url) await Linking.openURL(url);
        } catch (e: any) {
            show(e.message || 'Error al iniciar onboarding de Stripe', 'error');
        } finally {
            setConnectLoading(false);
        }
    };

    // Level System Logic
    const referrals = referralSummary.registrations;
    const getLevelInfo = (count: number) => {
        if (count < 50) return { current: 'Silver', next: 'Gold', min: 0, max: 50, color: isDark ? '#9CA3AF' : '#9CA3AF' };
        if (count < 200) return { current: 'Gold', next: 'Platinum', min: 50, max: 200, color: '#FBBF24' };
        return { current: 'Platinum', next: 'Diamond', min: 200, max: 500, color: '#7C3AED' };
    };

    const level = getLevelInfo(referrals);
    const progress = ((referrals - level.min) / (level.max - level.min)) * 100;

    const convexMetrics = useQuery((api as any).dashboard?.getInfluencerMetrics, user?.id ? { influencerId: user.id } : "skip");

    const metrics = {
        clicks: { total: convexMetrics?.clicks || 0, growth: 0 },
        sales: { total: convexMetrics?.sales || 0, growth: 0, volume: 0 },
        commissions: { total: convexMetrics?.totalEarnings || 0, growth: 0, available: convexMetrics?.totalEarnings || 0, pending: 0 },
        conversion: { rate: convexMetrics?.conversionRate || 0, trend: 0 },
        referrals,
    };

    const metricsLayout = useMemo(() => {
        // Keep cards readable on wide web screens and predictable on mobile.
        const pagePadding = 16; // matches styles.content padding
        const maxWidth = 980;
        const containerWidth = Math.min(Math.max(windowWidth - pagePadding * 2, 280), maxWidth);
        const gap = 12;

        // 1 col on small phones, 2 cols on most widths, 4 cols on large web.
        const cols = containerWidth < 460 ? 1 : containerWidth < 920 ? 2 : 4;
        const cardWidth = Math.floor((containerWidth - gap * (cols - 1)) / cols);
        const headerStack = containerWidth < 640;

        const stackTwoColSections = containerWidth < 720;
        // Bottom padding must account for bottom tabs / navbar overlays (web + native).
        const scrollBottomPadding = Math.max(16, insets.bottom) + (isTabMode ? 96 : 24);

        return { containerWidth, maxWidth, gap, cols, cardWidth, headerStack, stackTwoColSections, scrollBottomPadding };
    }, [windowWidth, insets.bottom, isTabMode]);

    const commissionStats = useMemo(() => {
        if (!wallet) {
            return {
                total: metrics.commissions.total,
                available: metrics.commissions.available,
                pending: metrics.commissions.pending,
            };
        }
        const totalEarned = wallet.transactions
            .filter((tx) => tx.type === 'credit')
            .reduce((sum, tx) => sum + tx.amount, 0);
        return {
            total: totalEarned,
            available: wallet.balances.available,
            pending: wallet.balances.pending,
        };
    }, [wallet, metrics.commissions]);

    const followerSegments = [
        { id: '1', name: 'Top Fans', email: 'andrea.lopez@email.com' },
        { id: '2', name: 'Nuevos Leads', email: 'nicolás.ramirez@email.com' },
        { id: '3', name: 'Clientes VIP', email: 'luis.maestre@email.com' },
    ];

    // Pending invitations: business-initiated proposals waiting for me
    // to accept/reject. (Influencer-initiated proposals also have
    // status=pending but are visible under "Mis campañas" — they're
    // grouped under "Esperando respuesta" since the OTHER party owns the
    // accept/reject decision.)
    const pendingInvitations = useMemo(
        () =>
            campaignRows.filter(
                (c: any) => c.status === 'pending' && c.initiatedBy === 'business',
            ),
        [campaignRows],
    );
    const myProposals = useMemo(
        () =>
            campaignRows.filter(
                (c: any) => c.status === 'pending' && c.initiatedBy === 'influencer',
            ),
        [campaignRows],
    );
    const activeCampaigns = useMemo(
        () =>
            campaignRows.filter(
                (c: any) => c.status === 'active' || c.status === 'paused',
            ),
        [campaignRows],
    );

    const [proposeModalVisible, setProposeModalVisible] = useState(false);
    const [proposeBusinessId, setProposeBusinessId] = useState('');
    const [proposeRatePct, setProposeRatePct] = useState('5');
    const [submittingProposal, setSubmittingProposal] = useState(false);

    const handleProposeCampaign = async () => {
        if (!user?.id) {
            show('Iniciá sesión.', 'error');
            return;
        }
        const businessId = proposeBusinessId.trim();
        const ratePct = Number(proposeRatePct);
        if (!businessId) {
            show('Pegá el ID del negocio.', 'warning');
            return;
        }
        if (!Number.isFinite(ratePct) || ratePct <= 0 || ratePct > 50) {
            show('Comisión inválida (1–50%).', 'warning');
            return;
        }
        setSubmittingProposal(true);
        try {
            await proposeCampaignMutation({
                businessId: businessId as any,
                influencerId: user.id as Id<"users">,
                commissionRate: ratePct / 100,
            });
            setProposeModalVisible(false);
            setProposeBusinessId('');
            setProposeRatePct('5');
            show('Propuesta enviada al negocio.', 'success');
        } catch (e: any) {
            show(e?.message ?? 'No se pudo enviar la propuesta.', 'error');
        } finally {
            setSubmittingProposal(false);
        }
    };

    const handleRespond = async (campaignId: string, decision: 'accept' | 'reject') => {
        if (!user?.id) return;
        try {
            await respondToCampaignMutation({
                campaignId: campaignId as any,
                decision,
            });
            show(decision === 'accept' ? 'Invitación aceptada.' : 'Invitación rechazada.', 'success');
        } catch (e: any) {
            show(e?.message ?? 'No se pudo responder.', 'error');
        }
    };

    const handleEndCampaign = async (campaignId: string) => {
        if (!user?.id) return;
        try {
            await endCampaignMutation({
                campaignId: campaignId as any,
            });
            show('Campaña finalizada.', 'success');
        } catch (e: any) {
            show(e?.message ?? 'No se pudo finalizar.', 'error');
        }
    };

    const monthlyGoals = useMemo(() => [
        { id: 'sales', title: 'Ventas generadas', target: 400, current: metrics.sales.total, unit: 'ventas', color: '#4f46e5' },
        { id: 'followers', title: 'Seguidores activados', target: 600, current: metrics.referrals, unit: 'seguidores', color: '#16a34a' },
        { id: 'commissions', title: 'Comisiones acumuladas', target: 4500, current: commissionStats.total, unit: 'USD', color: '#f97316' },
    ], [metrics.sales.total, metrics.referrals, commissionStats.total]);

    const influencerPayments = useMemo(
        () =>
            payments.filter((payment: PaymentRecord) => payment.split.influencerId === (wallet?.ownerId ?? influencerId)),
        [payments, wallet?.ownerId, influencerId]
    );

    const latestCommission = influencerPayments[0];

    const reservedBalance = wallet?.balances.reserved ?? 0;
    const kycStatusLabel =
        kycStatus === 'approved' ? 'KYC verificado' : kycStatus === 'pending' ? 'KYC en revisión' : 'KYC requerido';

    const handleWithdrawPress = () => {
        if (kycStatus !== 'approved') {
            navigation.navigate('KYC', { accountType: 'influencer' });
            return;
        }

        if (!wallet) {
            show('Error: Billetera no encontrada.', 'error');
            return;
        }

        navigation.navigate('Withdrawal', { ownerId: wallet.ownerId });
    };

    const handleShare = async () => {
        try {
            await Share.share({
                message: `¡Únete a Ramgos usando mi código ${referralCode} y obtén beneficios exclusivos! ${referralLink}`,
            });
        } catch (error) {
            show('No se pudo compartir', 'error');
        }
    };

    const handleTransferBonus = () => {
        if (!transferEmail) {
            show('Ingresa el email del usuario', 'warning');
            return;
        }
        const parsedAmount = Number(bonusAmount);
        if (!bonusAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            show('Ingresa un monto válido para el bono', 'warning');
            return;
        }
        setModalVisible(false);
        setTransferEmail('');
        setSelectedFollower(null);
        setBonusAmount('25');
        setBonusNote('Gracias por compartir el cupón esta semana.');

        show(`¡Bono de ${formatCurrency(parsedAmount)} enviado a ${transferEmail}!`, 'success');
    };

    const formatCurrency = (value: number) => {
        return `$${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const normalizedGoals = useMemo(() => {
        return monthlyGoals.map(goal => {
            const progressValue = Math.min(goal.current / goal.target, 1);
            const isCurrency = goal.unit === 'USD';
            const currentValue = Math.min(goal.current, goal.target);
            return {
                ...goal,
                progressValue,
                currentDisplay: isCurrency ? formatCurrency(currentValue) : currentValue.toLocaleString('es-ES'),
                targetDisplay: isCurrency ? formatCurrency(goal.target) : goal.target.toLocaleString('es-ES'),
                suffix: isCurrency ? '' : ` ${goal.unit}`,
            };
        });
    }, [monthlyGoals]);

    return (
        <ResponsiveLayout 
            style={styles.container}
            sidebar={
                !isTabMode ? (
                    <DesktopSidebar 
                        activeSection="dashboard" 
                        onSectionChange={(section) => {
                            if (section === 'home') navigation.navigate('Home');
                            else if (section === 'marketplace') navigation.navigate('Marketplace');
                            else if (section === 'social') navigation.navigate('Social');
                        }} 
                    />
                ) : undefined
            }
        >
            <MobileHeader
                title="Panel Influencer"
                backButton={!isTabMode}
                onBack={!isTabMode ? () => navigation.goBack() : undefined}
                onMenuPress={isTabMode ? onMenuPress : undefined}
                actions={
                    <View style={styles.levelContainer}>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: level.color }}>{level.current}</Text>
                            <Text style={{ fontSize: 9, color: isDark ? '#9CA3AF' : '#666' }}>{referrals} / {level.max} Refs</Text>
                        </View>
                        <Award size={18} color={level.color} style={{ marginLeft: 4 }} />
                    </View>
                }
            />

            {/* Progress Bar (Global) */}
            <View style={{ height: 4, backgroundColor: isDark ? '#374151' : '#E5E7EB', width: '100%' }}>
                <View style={{ height: '100%', backgroundColor: level.color, width: `${progress}%` }} />
            </View>

            <ScrollView
                contentContainerStyle={[
                    styles.content,
                    { paddingBottom: metricsLayout.scrollBottomPadding },
                ]}
            >
                {/* QUICK ACTIONS */}
                <View style={{ width: '100%', maxWidth: metricsLayout.containerWidth, alignSelf: 'center', marginBottom: 16 }}>
                    <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <Button
                            style={{ flex: 1, backgroundColor: isDark ? '#1F2937' : '#fff', borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB' }}
                            onPress={() => navigation.navigate('CreateListing')}
                        >
                            <ShoppingCart size={18} color={isDark ? '#D1D5DB' : '#111827'} style={{ marginRight: 8 }} />
                            <Text style={{ color: isDark ? '#D1D5DB' : '#111827', fontWeight: '600' }}>Crear Publicación Comercial</Text>
                        </Button>
                    </View>
                </View>

                {/* METRICS DASHBOARD */}
                <Card
                    style={[
                        styles.metricsWrapper,
                        {
                            width: '100%',
                            maxWidth: metricsLayout.containerWidth,
                            alignSelf: 'center',
                        },
                    ]}
                >
                    <View
                        style={[
                            styles.metricsHeader,
                            metricsLayout.headerStack
                                ? { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }
                                : { flexDirection: 'row', alignItems: 'flex-start' },
                        ]}
                    >
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.metricsTitle, metricsLayout.headerStack ? { fontSize: 18 } : { fontSize: 20 }]}>
                                Dashboard de Métricas
                            </Text>
                            <Text style={styles.metricsSubtitle} numberOfLines={2}>
                                Últimos 30 días | rendimiento global de la cuenta
                            </Text>
                        </View>
                        <View style={{ alignSelf: metricsLayout.headerStack ? 'flex-start' : 'flex-end' }}>
                            <Badge variant="secondary" style={styles.metricsBadge} textStyle={styles.metricsBadgeText}>
                                <TrendingUp size={14} color="#4f46e5" />
                                <Text style={styles.metricsBadgeText}>+12% vs. mes anterior</Text>
                            </Badge>
                        </View>
                    </View>

                    <View style={[styles.metricsRow, { flexDirection: 'row', flexWrap: 'wrap' }]}>
                        {[
                            {
                                key: 'clicks',
                                Icon: MousePointer2,
                                label: 'Clics en enlaces',
                                value: metrics.clicks.total.toLocaleString('es-ES'),
                                trend: metrics.clicks.growth,
                            },
                            {
                                key: 'sales',
                                Icon: ShoppingCart,
                                label: 'Ventas generadas',
                                value: metrics.sales.total.toLocaleString('es-ES'),
                                trend: metrics.sales.growth,
                            },
                            {
                                key: 'commissions',
                                Icon: DollarSign,
                                label: 'Comisiones acumuladas',
                                value: formatCurrency(commissionStats.total),
                                trend: metrics.commissions.growth,
                            },
                            {
                                key: 'conversion',
                                Icon: Users,
                                label: 'Tasa de conversión',
                                value: `${metrics.conversion.rate}%`,
                                trend: metrics.conversion.trend,
                            },
                        ].map((m, index) => {
                            const isEndOfRow = metricsLayout.cols === 1 ? true : (index + 1) % metricsLayout.cols === 0;
                            return (
                                <View
                                    key={m.key}
                                    style={[
                                        styles.metricCard,
                                        {
                                            width: metricsLayout.cardWidth,
                                            marginRight: isEndOfRow ? 0 : metricsLayout.gap,
                                            marginBottom: metricsLayout.gap,
                                        },
                                    ]}
                                >
                                    <View style={styles.metricIcon}>
                                        <m.Icon size={18} color={isDark ? "#D1D5DB" : "#111827"} />
                                    </View>
                                    <Text style={styles.metricValue} numberOfLines={1}>
                                        {m.value}
                                    </Text>
                                    <Text style={styles.metricLabel} numberOfLines={2}>
                                        {m.label}
                                    </Text>
                                    <MetricTrend value={m.trend} />
                                </View>
                            );
                        })}
                    </View>
                </Card>

                {/* REFERRAL CODE CARD */}
                <Card style={[styles.codeCard, { width: '100%', maxWidth: metricsLayout.containerWidth, alignSelf: 'center' }]}>
                    <View style={{ marginBottom: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <Share2 size={20} color="#fff" />
                            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Tu Código de Referido</Text>
                        </View>
                        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Comparte y gana comisiones por venta</Text>
                    </View>
                    <View style={styles.codeBox}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.codeText} numberOfLines={1}>
                                {referralCode}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={handleShare} style={styles.copyBtn}>
                            <Copy size={16} color="#4f46e5" />
                        </TouchableOpacity>
                    </View>
                </Card>

                {/* Stripe Connect V2 — influencer payout onboarding banner */}
                <View style={{ width: '100%', maxWidth: metricsLayout.containerWidth, alignSelf: 'center', marginBottom: 16 }}>
                    {(() => {
                        // Same 3 modes as the business banner. Influencers are
                        // gated behind kycStatus === 'approved' so the CTA
                        // routes them to KYC first if they haven't passed.
                        const hasAccount = !!stripeConnectAccountId;
                        const ready = !!connectStatus?.readyToReceivePayments;
                        const onboardingDone = !!connectStatus?.onboardingComplete;
                        const isReadyState = hasAccount && ready;
                        const isPendingState = hasAccount && !ready;

                        const palette = isReadyState
                            ? { border: isDark ? '#064E3B' : '#A7F3D0', bg: isDark ? 'rgba(5,150,105,0.15)' : '#ECFDF5', icoBg: isDark ? '#065F46' : '#D1FAE5', text: isDark ? '#6EE7B7' : '#065F46', desc: isDark ? '#A7F3D0' : '#047857' }
                            : isPendingState
                                ? { border: isDark ? '#78350F' : '#FEF3C7', bg: isDark ? 'rgba(120,53,15,0.15)' : '#FFFBEB', icoBg: isDark ? '#92400E' : '#FDE68A', text: isDark ? '#FCD34D' : '#92400E', desc: isDark ? '#FDE68A' : '#B45309' }
                                : !isKycApproved
                                    ? { border: isDark ? '#7F1D1D' : '#FECACA', bg: isDark ? 'rgba(127,29,29,0.18)' : '#FEF2F2', icoBg: isDark ? '#991B1B' : '#FEE2E2', text: isDark ? '#FCA5A5' : '#991B1B', desc: isDark ? '#FECACA' : '#B91C1C' }
                                    : { border: isDark ? '#1E3A5F' : '#BFDBFE', bg: isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF', icoBg: isDark ? '#1E40AF' : '#DBEAFE', text: isDark ? '#93C5FD' : '#1D4ED8', desc: isDark ? '#BFDBFE' : '#1E40AF' };

                        const title = isReadyState
                            ? 'Cuenta de pagos lista'
                            : isPendingState
                                ? 'Completa tu onboarding de Stripe'
                                : !isKycApproved
                                    ? 'KYC requerido para cobrar'
                                    : 'Conectar cuenta de pagos';

                        const desc = isReadyState
                            ? `Stripe Connect activo · ${stripeConnectAccountId!.slice(0, 16)}...`
                            : isPendingState
                                ? (onboardingDone
                                    ? 'Stripe está revisando tu cuenta. Te avisamos cuando esté lista.'
                                    : 'Faltan datos para activar tus comisiones. Continúa el onboarding.')
                                : !isKycApproved
                                    ? 'Verifica tu identidad para habilitar el cobro de comisiones por Stripe.'
                                    : 'Vincula tu cuenta bancaria para recibir tus comisiones vía Stripe Connect.';

                        const Icon = isReadyState ? CheckCircle2 : CreditCard;

                        return (
                            <TouchableOpacity
                                activeOpacity={isReadyState ? 1 : 0.85}
                                onPress={isReadyState ? undefined : handleStripeConnectOnboarding}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: 14,
                                    borderRadius: 14,
                                    borderWidth: 1,
                                    borderColor: palette.border,
                                    backgroundColor: palette.bg,
                                }}
                            >
                                <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.icoBg }}>
                                    <Icon size={18} color={palette.text} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={{ fontWeight: '800', color: palette.text }} numberOfLines={1}>{title}</Text>
                                    <Text style={{ fontSize: 12, color: palette.desc, marginTop: 4 }} numberOfLines={2}>{desc}</Text>
                                </View>
                                {connectLoading
                                    ? <ActivityIndicator size="small" color={palette.text} />
                                    : !isReadyState && <ExternalLink size={18} color={palette.text} />}
                            </TouchableOpacity>
                        );
                    })()}
                </View>

                <WalletStats
                    styles={styles}
                    metricsLayout={metricsLayout}
                    isDark={isDark}
                    commissionStats={commissionStats}
                    handleWithdrawPress={handleWithdrawPress}
                    kycStatus={kycStatus}
                    kycStatusLabel={kycStatusLabel}
                    latestCommission={latestCommission}
                    wallet={wallet}
                    reservedBalance={reservedBalance}
                />

                {/* GOALS & ACHIEVEMENTS */}
                <Card style={[styles.goalsCard, { width: '100%', maxWidth: metricsLayout.containerWidth, alignSelf: 'center' }]}>
                    <View style={styles.goalsHeader}>
                        <View>
                            <Text style={styles.sectionTitle}>Metas y logros</Text>
                            <Text style={styles.sectionSubtitle}>Objetivos mensuales para ventas y comunidad</Text>
                        </View>
                        <Badge variant="secondary" style={styles.goalBadge}>
                            <Target size={14} color="#16a34a" />
                            <Text style={styles.goalBadgeText}>2 logros desbloqueados</Text>
                        </Badge>
                    </View>
                    {normalizedGoals.map(goal => (
                        <View key={goal.id} style={styles.goalRow}>
                            <View style={styles.goalTextWrapper}>
                                <Text style={styles.goalTitle}>{goal.title}</Text>
                                <Text style={styles.goalDetails}>
                                    {goal.currentDisplay} / {goal.targetDisplay}{goal.suffix}
                                </Text>
                            </View>
                            <View style={styles.goalProgressBar}>
                                <View style={[styles.goalProgressFill, { width: `${goal.progressValue * 100}%`, backgroundColor: goal.color }]} />
                            </View>
                        </View>
                    ))}
                </Card>

                {/* BONUS TRANSFER SECTION */}
                <Card style={[styles.transferCard, { width: '100%', maxWidth: metricsLayout.containerWidth, alignSelf: 'center' }]}>
                    <View style={styles.transferHeader}>
                        <View style={styles.transferIconWrapper}>
                            <Gift size={24} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.transferTitle}>Transferencia de bonos</Text>
                            <Text style={styles.transferSubtitle}>Regala beneficios inmediatos a tus seguidores más activos.</Text>
                        </View>
                        <Button size="sm" style={styles.transferButton} onPress={() => setModalVisible(true)}>
                            <Text style={{ color: '#fff', fontWeight: '600' }}>Enviar bono</Text>
                        </Button>
                    </View>
                    <View style={styles.transferFollowers}>
                        {followerSegments.map(segment => (
                            <TouchableOpacity
                                key={segment.id}
                                style={[
                                    styles.transferFollowerPill,
                                    selectedFollower === segment.id && styles.transferFollowerPillActive
                                ]}
                                onPress={() => {
                                    setSelectedFollower(segment.id);
                                    setTransferEmail(segment.email);
                                }}
                            >
                                <Text
                                    style={[
                                        styles.transferFollowerText,
                                        selectedFollower === segment.id && styles.transferFollowerTextActive
                                    ]}
                                >
                                    {segment.name}
                                </Text>
                                <ArrowUpRight size={14} color={selectedFollower === segment.id ? '#1f2937' : '#4b5563'} />
                            </TouchableOpacity>
                        ))}
                    </View>
                </Card>

                <ActiveCampaigns
                    styles={styles}
                    metricsLayout={metricsLayout}
                    isDark={isDark}
                    setProposeModalVisible={setProposeModalVisible}
                    pendingInvitations={pendingInvitations}
                    myProposals={myProposals}
                    activeCampaigns={activeCampaigns}
                    referralCode={referralCode}
                    handleRespond={handleRespond}
                    handleEndCampaign={handleEndCampaign}
                />

                {/* TIPS */}
                <Card
                    style={[
                        {
                            backgroundColor: isDark ? '#1e3a8a' : '#f0f9ff',
                            borderColor: isDark ? '#1e40af' : '#bae6fd',
                            borderWidth: 1,
                            marginTop: 10,
                            padding: 16,
                        },
                        { width: '100%', maxWidth: metricsLayout.containerWidth, alignSelf: 'center' },
                    ]}
                >
                    <Text style={{ fontWeight: 'bold', color: isDark ? '#60A5FA' : '#0284c7', marginBottom: 4 }}>💡 Tip para crecer</Text>
                    <Text style={{ fontSize: 12, color: isDark ? '#BFDBFE' : '#0c4a6e' }}>Comparte tus enlaces en historias de Instagram y grupos de WhatsApp para aumentar tus clics un 40%.</Text>
                </Card>

            </ScrollView>

            {/* Transfer Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={[styles.centeredView, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
                    <View style={[styles.modalView, { maxHeight: windowHeight * 0.86 }]}>
                        <View style={styles.modalHeaderRow}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.modalTitle}>Enviar bono</Text>
                                <Text style={styles.modalText}>Regala beneficios a seguidores específicos.</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setModalVisible(false)}
                                style={styles.modalCloseBtn}
                                accessibilityRole="button"
                            >
                                <X size={18} color={isDark ? '#CBD5E1' : '#64748b'} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            contentContainerStyle={styles.modalScroll}
                            keyboardShouldPersistTaps="handled"
                        >
                            <View style={styles.formGroup}>
                                <Text style={styles.modalLabel}>Email del seguidor</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="email@usuario.com"
                                    value={transferEmail}
                                    onChangeText={setTransferEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                                />
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={styles.modalLabel}>Monto del bono (USD)</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="25"
                                    value={bonusAmount}
                                    onChangeText={setBonusAmount}
                                    keyboardType="numeric"
                                    placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                                />
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={styles.modalLabel}>Mensaje personalizado</Text>
                                <TextInput
                                    style={[styles.input, styles.inputMultiline]}
                                    placeholder="Agradece o da instrucciones específicas para usar el bono"
                                    value={bonusNote}
                                    onChangeText={setBonusNote}
                                    multiline
                                    placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                                />
                            </View>
                        </ScrollView>

                        <View style={styles.modalFooter}>
                            <View style={[styles.modalActionsRow, windowWidth < 420 && { flexDirection: 'column' }]}>
                                <Button variant="outline" onPress={() => setModalVisible(false)} style={windowWidth < 420 ? { width: '100%' } : { flex: 1 }}>
                                    <Text style={{ color: isDark ? '#D1D5DB' : '#111827', fontWeight: '700' }}>Cancelar</Text>
                                </Button>
                                <Button onPress={handleTransferBonus} style={[windowWidth < 420 ? { width: '100%' } : { flex: 1 }, { backgroundColor: '#4f46e5' }]}>
                                    <Send size={16} color="#fff" style={{ marginRight: 8 }} />
                                    <Text style={{ color: '#fff', fontWeight: '800' }}>Enviar bono</Text>
                                </Button>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Propose Campaign Modal — replaces the legacy "código" and
                "contrato" modals. The influencer pastes the business
                user-id and proposes a commission rate; the business
                accepts/rejects it server-side. */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={proposeModalVisible}
                onRequestClose={() => setProposeModalVisible(false)}
            >
                <View style={[styles.centeredView, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
                    <View style={[styles.modalView, { maxHeight: windowHeight * 0.86 }]}>
                        <View style={styles.modalHeaderRow}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.modalTitle}>Proponer campaña</Text>
                                <Text style={styles.modalText}>Pegá el ID del negocio y la comisión que querés cobrar por venta.</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setProposeModalVisible(false)}
                                style={styles.modalCloseBtn}
                                accessibilityRole="button"
                            >
                                <X size={18} color={isDark ? '#CBD5E1' : '#64748b'} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
                            <View style={styles.formGroup}>
                                <Text style={styles.modalLabel}>ID del negocio</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="users/abc123..."
                                    value={proposeBusinessId}
                                    onChangeText={setProposeBusinessId}
                                    autoCapitalize="none"
                                    placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                                />
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={styles.modalLabel}>Comisión (%)</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="5"
                                    value={proposeRatePct}
                                    onChangeText={setProposeRatePct}
                                    keyboardType="numeric"
                                    placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                                />
                            </View>

                            <Text style={{ fontSize: 12, color: isDark ? '#9CA3AF' : '#6b7280' }}>
                                El negocio tiene que aceptar la propuesta antes de que se acrediten comisiones. Tu código personal es {referralCode || '(generándose)'}.
                            </Text>
                        </ScrollView>

                        <View style={styles.modalFooter}>
                            <View style={[styles.modalActionsRow, windowWidth < 420 && { flexDirection: 'column' }]}>
                                <Button variant="outline" onPress={() => setProposeModalVisible(false)} style={windowWidth < 420 ? { width: '100%' } : { flex: 1 }} disabled={submittingProposal}>
                                    <Text style={{ color: isDark ? '#D1D5DB' : '#111827', fontWeight: '700' }}>Cancelar</Text>
                                </Button>
                                <Button onPress={handleProposeCampaign} style={[windowWidth < 420 ? { width: '100%' } : { flex: 1 }, { backgroundColor: '#4f46e5' }]} disabled={submittingProposal}>
                                    {submittingProposal ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text style={{ color: '#fff', fontWeight: '800' }}>Enviar propuesta</Text>
                                    )}
                                </Button>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
        </ResponsiveLayout>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#111827' : '#f9f9f9' },
    content: { padding: 16 },
    levelContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#374151' : '#f3f4f6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    codeCard: { backgroundColor: '#6366f1', padding: 20, borderRadius: 16, marginBottom: 16 },
    codeBox: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.2)', padding: 4, paddingLeft: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'space-between' },
    codeText: { color: '#fff', fontSize: 16, fontFamily: 'monospace', fontWeight: 'bold' },
    copyBtn: { backgroundColor: '#fff', padding: 8, borderRadius: 6 },
    statsRow: { flexDirection: 'row', gap: 12 },
    statCard: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#374151' : '#e5e7eb' },
    iconBox: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    statValue: { fontSize: 24, fontWeight: 'bold', marginTop: 8, color: isDark ? '#F9FAFB' : '#111827' },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, marginTop: 4, color: isDark ? '#F9FAFB' : '#111827' },
    sectionSubtitle: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6b7280', marginTop: 4 },
    centeredView: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 16 },
    modalView: {
        backgroundColor: isDark ? '#0B1220' : "#fff",
        borderRadius: 20,
        width: '100%',
        maxWidth: 520,
        alignSelf: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.24,
        shadowRadius: 12,
        elevation: 10,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(148, 163, 184, 0.14)' : '#E5E7EB',
        overflow: 'hidden',
    },
    modalHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 18, paddingBottom: 12, gap: 12 },
    modalCloseBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDark ? 'rgba(148, 163, 184, 0.08)' : '#F1F5F9',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(148, 163, 184, 0.12)' : '#E2E8F0',
    },
    modalTitle: { fontSize: 18, fontWeight: "800", color: isDark ? '#F9FAFB' : '#111827' },
    modalText: { marginTop: 6, fontSize: 12, color: isDark ? '#94A3B8' : '#6b7280' },
    modalLabel: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151', marginBottom: 4, marginTop: 12 },
    modalScroll: { paddingHorizontal: 18, paddingBottom: 12 },
    modalFooter: { padding: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(148, 163, 184, 0.14)' : '#E5E7EB', backgroundColor: isDark ? '#0B1220' : '#fff' },
    modalActionsRow: { flexDirection: 'row', gap: 12 },
    formGroup: { gap: 6 },
    input: {
        height: 48,
        width: '100%',
        borderColor: isDark ? 'rgba(148, 163, 184, 0.22)' : '#E5E7EB',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
        backgroundColor: isDark ? 'rgba(148, 163, 184, 0.06)' : '#fff',
        color: isDark ? '#F9FAFB' : '#111827'
    },
    inputMultiline: {
        height: 110,
        paddingTop: 12,
        textAlignVertical: 'top',
    },
    metricsWrapper: { backgroundColor: isDark ? '#1F2937' : '#fff', padding: 18, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB' },
    metricsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    metricsTitle: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827' },
    metricsSubtitle: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6b7280', marginTop: 4 },
    metricsBadge: { backgroundColor: isDark ? '#312E81' : '#eef2ff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
    metricsBadgeText: { color: isDark ? '#818CF8' : '#4338ca', fontSize: 11, fontWeight: '600' },
    metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    metricCard: { backgroundColor: isDark ? '#374151' : '#f9fafb', padding: 14, borderRadius: 12, flexBasis: '48%', alignItems: 'flex-start', gap: 6 },
    metricIcon: { backgroundColor: isDark ? '#4B5563' : '#e5e7eb', padding: 6, borderRadius: 10 },
    metricValue: { fontSize: 20, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827' },
    metricLabel: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6b7280' },
    metricTrend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metricTrendArrow: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
    metricTrendText: { fontSize: 11, fontWeight: '600' },
    goalsCard: { backgroundColor: isDark ? '#1F2937' : '#fff', padding: 18, borderRadius: 16, marginTop: 16, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB' },
    goalsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    goalBadge: { backgroundColor: isDark ? 'rgba(22, 163, 74, 0.2)' : '#dcfce7', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
    goalBadgeText: { color: isDark ? '#4ADE80' : '#047857', fontSize: 11, fontWeight: '600' },
    goalRow: { marginBottom: 14 },
    goalTextWrapper: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    goalTitle: { fontSize: 14, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },
    goalDetails: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6b7280' },
    goalProgressBar: { height: 10, backgroundColor: isDark ? '#374151' : '#e5e7eb', borderRadius: 999, overflow: 'hidden' },
    goalProgressFill: { height: '100%', borderRadius: 999 },
    walletCard: { backgroundColor: isDark ? '#1F2937' : '#fff', padding: 18, borderRadius: 16, borderWidth: 1, borderColor: isDark ? '#374151' : '#e2e8f0', marginTop: 16 },
    walletHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    walletIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? '#374151' : '#e0f2fe', alignItems: 'center', justifyContent: 'center' },
    walletTitle: { fontSize: 14, fontWeight: '700', color: isDark ? '#F9FAFB' : '#0f172a' },
    walletSubtitle: { fontSize: 12, color: isDark ? '#9CA3AF' : '#475569', marginTop: 2 },
    walletBadge: { borderColor: isDark ? '#F9FAFB' : '#0f172a', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'transparent' },
    walletBadgeText: { fontSize: 10, fontWeight: '600', color: isDark ? '#F9FAFB' : '#0f172a' },
    walletRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
    walletLabel: { fontSize: 12, color: isDark ? '#9CA3AF' : '#64748b' },
    walletValue: { fontSize: 12, fontWeight: '600', color: isDark ? '#F9FAFB' : '#0f172a' },
    walletSplit: { marginTop: 16, borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#e2e8f0', paddingTop: 12, gap: 6 },
    walletSplitTitle: { fontSize: 12, fontWeight: '700', color: isDark ? '#F9FAFB' : '#0f172a' },
    walletSplitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    walletSplitLabel: { fontSize: 11, color: isDark ? '#9CA3AF' : '#64748b' },
    walletSplitValue: { fontSize: 11, fontWeight: '600', color: isDark ? '#F9FAFB' : '#0f172a' },
    transferCard: { backgroundColor: isDark ? '#1F2937' : '#fff', padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#fcd34d', marginTop: 16 },
    transferHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    transferIconWrapper: { backgroundColor: '#f59e0b', padding: 10, borderRadius: 12 },
    transferTitle: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#FCD34D' : '#78350f' },
    transferSubtitle: { fontSize: 12, color: isDark ? '#FDE68A' : '#92400e', marginTop: 4 },
    transferButton: { backgroundColor: '#ea580c', paddingHorizontal: 16, height: 36, borderRadius: 12 },
    transferFollowers: { flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' },
    transferFollowerPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: isDark ? '#78350F' : '#fef3c7', borderWidth: 1, borderColor: '#fcd34d' },
    transferFollowerPillActive: { backgroundColor: isDark ? '#92400E' : '#fde68a', borderColor: '#f59e0b' },
    transferFollowerText: { fontSize: 12, fontWeight: '600', color: isDark ? '#FDE68A' : '#92400e' },
    transferFollowerTextActive: { color: isDark ? '#FEF3C7' : '#78350f' },
});

const MetricTrend = ({ value }: { value: number }) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const positive = value >= 0;
    return (
        <View style={styles.metricTrend}>
            <View style={[
                styles.metricTrendArrow,
                { backgroundColor: positive ? '#dcfce7' : '#fee2e2' }
            ]}>
                {positive ? (
                    <ArrowUpRight size={12} color="#16a34a" />
                ) : (
                    <ArrowDownRight size={12} color="#b91c1c" />
                )}
            </View>
            <Text style={[
                styles.metricTrendText,
                { color: positive ? '#166534' : '#b91c1c' }
            ]}>
                {positive ? '+' : ''}{value}% mensual
            </Text>
        </View>
    );
};
