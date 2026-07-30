import React, { useState, useMemo, useEffect } from 'react';
import { View, ScrollView, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useFintech } from '../contexts/FintechContext';
import { useReferral } from '../contexts/ReferralContext';
import { useQuery } from 'convex/react';
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
    
    // UI State
    const [modalVisible, setModalVisible] = useState(false);

    // Queries
    const convexMetrics = useQuery((api as any).dashboard?.getInfluencerMetrics, user?.id ? { influencerId: user.id } : "skip");
    const campaignRows = useQuery(
        api.campaigns.getMyCampaigns,
        user?.id ? { influencerId: user.id as Id<"users"> } : 'skip',
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

                {/* Create Bonus Card */}
                <View style={[styles.bonusCard, glassSurface(isDark, 'prominent'), { maxWidth: containerWidth }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.bonusTitle, { color: isDark ? '#fff' : '#111827' }]}>Generador de Bonos</Text>
                        <Text style={[styles.bonusSubtitle, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>
                            Crea cupones de descuento exclusivos para tus seguidores y conviértelos en clientes.
                        </Text>
                    </View>
                    <Button onPress={() => setModalVisible(true)} style={{ backgroundColor: '#4f46e5', marginTop: 12 }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Crear bono de afiliado</Text>
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
