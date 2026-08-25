import React, { useState, useMemo, useEffect } from 'react';
import { View, ScrollView, Text, StyleSheet, useWindowDimensions, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useFintech } from '../contexts/FintechContext';
import { useReferral } from '../contexts/ReferralContext';
import { useQuery, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { glassGradient, glassSurface } from '../utils/glass';
import { useResponsive } from '../hooks/useResponsive';
import { LinearGradient } from 'expo-linear-gradient';

// Nuevos componentes extraídos (Liquid Glass UI & Composition)
import InfluencerMetrics from '../components/influencer/InfluencerMetrics';
import AffiliateLinkCard from '../components/influencer/AffiliateLinkCard';
import BonusGeneratorModal from '../components/influencer/BonusGeneratorModal';
import CampaignsManager from '../components/influencer/CampaignsManager';
import MyBonusesList from '../components/influencer/MyBonusesList';
import { Button } from '../components/ui/button'; 

export default function InfluencerDashboardScreen({ isTabMode, onMenuPress }: any) {
    const navigation = useNavigation<any>();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { width: windowWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    
    // Auth & Contexts
    const { user, sessionToken } = useAuth();
    const influencerId = user?.id ?? 'influencer_demo';
    const influencerName = user?.name ?? 'Influencer Demo';
    const { referralLink, referralSummary } = useReferral();
    const { ensureWalletAccount, getWalletByOwner } = useFintech();
    const wallet = getWalletByOwner(influencerId) ?? getWalletByOwner('influencer_demo');
    const { show } = useToast();

    // Stripe Connect V2 — mismo flujo que BusinessDashboardScreen (única
    // fuente de onboarding). Antes esta pantalla no tenía ningún botón para
    // vincular cuenta de pagos: el influencer no podía cobrar nunca.
    const _api = api as any;
    const ensureConnectAccountAction = useAction(_api.connect?.ensureConnectAccount as any);
    const createOnboardingLinkAction = useAction(_api.connect?.createOnboardingLink as any);
    const getAccountStatusAction = useAction(_api.connect?.getAccountStatus as any);
    const [connectLoading, setConnectLoading] = useState(false);
    const [connectStatus, setConnectStatus] = useState<{
        readyToReceivePayments: boolean;
        onboardingComplete: boolean;
    } | null>(null);
    const stripeConnectAccountId: string | undefined = (user as any)?.stripeConnectAccountId;

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
                    sessionToken,
                });
                if (!cancelled && status) {
                    setConnectStatus({
                        readyToReceivePayments: !!(status as any).readyToReceivePayments,
                        onboardingComplete: !!(status as any).onboardingComplete,
                    });
                }
            } catch (err) {
                console.warn('[Connect V2] influencer status fetch failed', err);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [stripeConnectAccountId, getAccountStatusAction]);

    const handleInfluencerConnectOnboarding = async () => {
        const connectUserId = (user as any)?._id || (user as any)?.id || (user as any)?.uid;
        if (!user || !connectUserId) {
            show('Inicia sesión primero', 'error');
            return;
        }
        setConnectLoading(true);
        try {
            const ensured = await ensureConnectAccountAction({
                userId: connectUserId,
                sessionToken,
                displayName: influencerName || 'Ramgos influencer',
                contactEmail: user.email,
            });
            const accountId = (ensured as any)?.accountId;
            if (!accountId) throw new Error('No se obtuvo accountId de Stripe.');

            const link = await createOnboardingLinkAction({ accountId, sessionToken });
            const url = (link as any)?.url;
            if (url) await Linking.openURL(url);
        } catch (e: any) {
            show(e.message || 'Error al iniciar onboarding de Stripe', 'error');
        } finally {
            setConnectLoading(false);
        }
    };

    // UI State
    const [modalVisible, setModalVisible] = useState(false);

    // Queries
    const convexMetrics = useQuery(
        api.dashboard.getInfluencerMetrics,
        user?.id && sessionToken
            ? { influencerId: user.id as Id<"users">, sessionToken }
            : "skip",
    );
    const campaignRows = useQuery(
        api.campaigns.getMyCampaigns,
        user?.id ? { influencerId: user.id as Id<"users">, sessionToken } : 'skip',
    ) ?? [];
    const whitelistedBusinesses =
        useQuery(
            api.influencers.getMyWhitelistedBusinesses,
            user?.id && sessionToken ? { sessionToken } : 'skip',
        ) ?? [];

    const myListings = useQuery(
        api.listings.getMyListings,
        user?.id && sessionToken ? { sessionToken } : 'skip'
    ) ?? [];
    const myBonuses = useMemo(() => myListings.filter((l: any) => l.type === 'bono'), [myListings]);

    useEffect(() => {
        ensureWalletAccount(influencerId, 'influencer', influencerName);
    }, [ensureWalletAccount, influencerId, influencerName]);

    // Data Processing (Ponytail approach: Keep it minimal)
    const pendingInvitations = useMemo(() => campaignRows.filter((c: any) => c.status === 'pending' && c.initiatedBy === 'business'), [campaignRows]);
    const myProposals = useMemo(() => campaignRows.filter((c: any) => c.status === 'pending' && c.initiatedBy === 'influencer'), [campaignRows]);
    const activeCampaigns = useMemo(() => campaignRows.filter((c: any) => c.status === 'active' || c.status === 'paused'), [campaignRows]);

    const authorizedBusinesses = useMemo(() => {
        const byId = new Map<string, { id: string; name: string; source: string }>();
        for (const c of campaignRows.filter((row: any) => row.status === 'active')) {
            const id = String(c.businessId || '');
            if (!id || byId.has(id)) continue;
            byId.set(id, {
                id,
                name: c.businessName || 'Negocio',
                source: 'campaña',
            });
        }
        for (const b of whitelistedBusinesses) {
            const id = String(b.businessId || '');
            if (!id) continue;
            if (byId.has(id)) {
                const prev = byId.get(id)!;
                byId.set(id, { ...prev, source: 'campaña + whitelist' });
                continue;
            }
            byId.set(id, {
                id,
                name: b.name || 'Negocio',
                source: 'whitelist',
            });
        }
        return Array.from(byId.values());
    }, [campaignRows, whitelistedBusinesses]);

    const referrals = referralSummary.registrations;
    const getLevelInfo = (count: number) => {
        if (count < 50) return { current: 'Silver', next: 'Gold', min: 0, max: 50, color: isDark ? '#9CA3AF' : '#9CA3AF' };
        if (count < 200) return { current: 'Gold', next: 'Platinum', min: 50, max: 200, color: '#FBBF24' };
        return { current: 'Platinum', next: 'Diamond', min: 200, max: 500, color: '#2196F3' };
    };
    const level = getLevelInfo(referrals);
    const progress = ((referrals - level.min) / (level.max - level.min)) * 100;

    const metrics = {
        clicks: { total: convexMetrics?.clicks || 0, growth: 0 },
        sales: { total: convexMetrics?.sales || 0, growth: 0, volume: 0 },
        commissions: { total: convexMetrics?.totalEarnings || 0, growth: 0, available: convexMetrics?.totalEarnings || 0, pending: 0 },
        conversion: { rate: convexMetrics?.conversionRate || 0, trend: 0 },
        referrals,
    };

    const commissionStats = useMemo(() => {
        if (!wallet) return { total: metrics.commissions.total, available: metrics.commissions.available, pending: metrics.commissions.pending };
        const totalEarned = (wallet?.transactions ?? []).filter((tx: any) => tx.type === 'credit').reduce((sum: number, tx: any) => sum + tx.amount, 0);
        return { total: totalEarned, available: wallet.balances.available, pending: wallet.balances.pending };
    }, [wallet, metrics.commissions]);

    const containerWidth = Math.min(Math.max(windowWidth - 32, 280), 980);

    return (
        <View style={styles.root}>
            <LinearGradient colors={glassGradient(isDark)} style={StyleSheet.absoluteFill} />
            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(16, insets.bottom) + (isTabMode ? 96 : 24) }]}>
                
                {/* Header Section */}
                <View style={[styles.header, { maxWidth: containerWidth }]}>
                    <Text style={[styles.pageTitle, { color: isDark ? '#fff' : '#111827' }]}>Mi Rendimiento</Text>
                    <Text style={[styles.pageSubtitle, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>Gestiona tus enlaces, bonos y comisiones.</Text>
                </View>

                {/* Main Metrics (Liquid Glass) */}
                <InfluencerMetrics metrics={metrics} level={level} progress={progress} containerWidth={containerWidth} />

                {/* Affiliate Link Card */}
                <AffiliateLinkCard referralLink={referralLink} containerWidth={containerWidth} />

                {/* Cuenta de pagos (Stripe Connect) */}
                <View style={[styles.bonusCard, glassSurface(isDark, 'prominent'), { maxWidth: containerWidth }]}>
                    <Text style={[styles.bonusTitle, { color: isDark ? '#fff' : '#111827' }]}>
                        Cuenta de pagos
                    </Text>
                    {stripeConnectAccountId ? (
                        <>
                            <Text style={[styles.bonusSubtitle, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>
                                {connectStatus?.readyToReceivePayments
                                    ? 'Tu cuenta está lista para recibir comisiones.'
                                    : 'Tu cuenta está conectada, pero Stripe todavía necesita datos para habilitar los cobros.'}
                            </Text>
                            <Button
                                onPress={() => navigation.navigate('Withdrawal', { ownerId: user?.id })}
                                style={{ backgroundColor: '#4f46e5', marginTop: 12 }}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Ver saldo y retiros</Text>
                            </Button>
                        </>
                    ) : (
                        <>
                            <Text style={[styles.bonusSubtitle, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>
                                Conectá tu cuenta de Stripe para poder cobrar tus comisiones de influencer.
                            </Text>
                            <Button
                                onPress={handleInfluencerConnectOnboarding}
                                isLoading={connectLoading}
                                disabled={connectLoading}
                                style={{ backgroundColor: '#4f46e5', marginTop: 12 }}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Conectar cuenta de pagos</Text>
                            </Button>
                        </>
                    )}
                </View>

                {/* Negocios autorizados (whitelist + campañas) */}
                <View style={[styles.bonusCard, glassSurface(isDark, 'prominent'), { maxWidth: containerWidth }]}>
                    <Text style={[styles.bonusTitle, { color: isDark ? '#fff' : '#111827' }]}>
                        Negocios que te autorizaron
                    </Text>
                    <Text style={[styles.bonusSubtitle, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>
                        Podés emitir bonos solo para estos negocios (whitelist o campaña activa).
                    </Text>
                    {authorizedBusinesses.length === 0 ? (
                        <Text
                            style={{
                                marginTop: 12,
                                color: isDark ? '#FCA5A5' : '#B91C1C',
                                fontSize: 13,
                                lineHeight: 18,
                            }}
                        >
                            Todavía no tenés negocios autorizados. Pedile a un negocio que te añada a su
                            whitelist o que te invite a una campaña.
                        </Text>
                    ) : (
                        <View style={{ marginTop: 12, gap: 8 }}>
                            {authorizedBusinesses.map((b) => (
                                <View
                                    key={b.id}
                                    style={{
                                        paddingVertical: 10,
                                        paddingHorizontal: 12,
                                        borderRadius: 10,
                                        backgroundColor: isDark
                                            ? 'rgba(255,255,255,0.06)'
                                            : 'rgba(15,23,42,0.04)',
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: isDark ? '#fff' : '#111827',
                                            fontWeight: '700',
                                        }}
                                    >
                                        {b.name}
                                    </Text>
                                    <Text
                                        style={{
                                            color: isDark ? '#94A3B8' : '#6B7280',
                                            fontSize: 12,
                                            marginTop: 2,
                                        }}
                                    >
                                        Autorizado por {b.source}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* Create Bonus Card */}
                <View style={[styles.bonusCard, glassSurface(isDark, 'prominent'), { maxWidth: containerWidth }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.bonusTitle, { color: isDark ? '#fff' : '#111827' }]}>Bonos</Text>
                        <Text style={[styles.bonusSubtitle, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>
                            Creá bonos de crédito prepago para tus seguidores (pagás X · crédito Y) y compartilos desde acá.
                        </Text>
                    </View>
                    <Button
                        onPress={() => setModalVisible(true)}
                        style={{
                            backgroundColor: '#4f46e5',
                            marginTop: 12,
                            opacity: authorizedBusinesses.length === 0 ? 0.55 : 1,
                        }}
                        disabled={authorizedBusinesses.length === 0}
                    >
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Crear bono</Text>
                    </Button>
                </View>

                {/* My Active Bonuses */}
                <MyBonusesList bonuses={myBonuses as any} containerWidth={containerWidth} />

                {/* Campaigns */}
                <CampaignsManager pendingInvitations={pendingInvitations} myProposals={myProposals} activeCampaigns={activeCampaigns} containerWidth={containerWidth} />

            </ScrollView>

            {/* Modal Components */}
            <BonusGeneratorModal visible={modalVisible} onClose={() => setModalVisible(false)} user={user} />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    header: {
        width: '100%',
        alignSelf: 'center',
        marginBottom: 24,
        marginTop: 8,
    },
    pageTitle: {
        fontSize: 28,
        fontWeight: '900',
        marginBottom: 4,
    },
    pageSubtitle: {
        fontSize: 16,
    },
    bonusCard: {
        width: '100%',
        alignSelf: 'center',
        padding: 20,
        marginBottom: 24,
    },
    bonusTitle: {
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 4,
    },
    bonusSubtitle: {
        fontSize: 14,
        lineHeight: 20,
    },
});
