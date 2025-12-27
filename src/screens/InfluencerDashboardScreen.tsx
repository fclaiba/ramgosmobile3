import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Share, Modal, TextInput } from 'react-native';
import { Share2, Copy, TrendingUp, Users, DollarSign, Award, Link, ArrowUpRight, Gift, Send, MousePointer2, ShoppingCart, Target, ArrowDownRight, Wallet, ShieldCheck } from 'lucide-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { useRewards } from '../contexts/RewardsContext';
import { useFintech, PaymentRecord } from '../contexts/FintechContext';
import { useAuth } from '../contexts/AuthContext';

export default function InfluencerDashboardScreen({ navigation, isTabMode, onMenuPress }: any) {
    const [modalVisible, setModalVisible] = useState(false);
    const [transferEmail, setTransferEmail] = useState('');
    const [selectedFollower, setSelectedFollower] = useState<string | null>(null);
    const [bonusAmount, setBonusAmount] = useState('25');
    const [bonusNote, setBonusNote] = useState('Gracias por compartir el cupón esta semana.');
    const { referralCode, referralLink, referralSummary } = useRewards();
    const { user } = useAuth();
    const influencerId = user?.id ?? 'influencer_demo';
    const influencerName = user?.name ?? 'Influencer Demo';
    const { ensureWalletAccount, getWalletByOwner, requestWithdrawal, payments, getKycStatus } = useFintech();

    useEffect(() => {
        ensureWalletAccount(influencerId, 'influencer', influencerName);
    }, [ensureWalletAccount, influencerId, influencerName]);

    const wallet = getWalletByOwner(influencerId) ?? getWalletByOwner('influencer_demo');
    const kycStatus = getKycStatus(influencerId);

    // Level System Logic
    const referrals = referralSummary.registrations;
    const getLevelInfo = (count: number) => {
        if (count < 50) return { current: 'Silver', next: 'Gold', min: 0, max: 50, color: '#9CA3AF' };
        if (count < 200) return { current: 'Gold', next: 'Platinum', min: 50, max: 200, color: '#FBBF24' };
        return { current: 'Platinum', next: 'Diamond', min: 200, max: 500, color: '#7C3AED' };
    };

    const level = getLevelInfo(referrals);
    const progress = ((referrals - level.min) / (level.max - level.min)) * 100;

    const metrics = {
        clicks: { total: 23140, growth: 18 },
        sales: { total: 312, growth: 12, volume: 12450 },
        commissions: { total: 3250.00, growth: 8, available: 1850.75, pending: 420.00 },
        conversion: { rate: 4.2, trend: 1.1 },
        referrals,
    };

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

    const products = [
        { id: '1', name: 'Curso React Native Master', commission: 30, earnings: 600, image: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=200' },
        { id: '2', name: '50% OFF Restaurante', commission: 20, earnings: 280, image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=200' },
        { id: '3', name: 'Suscripción Premium Gimnasio', commission: 25, earnings: 410, image: 'https://images.unsplash.com/photo-1517964106620-9082b0ae7f63?w=200' },
    ];

    const followerSegments = [
        { id: '1', name: 'Top Fans', email: 'andrea.lopez@email.com' },
        { id: '2', name: 'Nuevos Leads', email: 'nicolás.ramirez@email.com' },
        { id: '3', name: 'Clientes VIP', email: 'luis.maestre@email.com' },
    ];

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
            Alert.alert('Error', 'Billetera no encontrada.');
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
            Alert.alert('Error', 'No se pudo compartir');
        }
    };

    const handleTransferBonus = () => {
        if (!transferEmail) {
            Alert.alert('Error', 'Ingresa el email del usuario');
            return;
        }
        const parsedAmount = Number(bonusAmount);
        if (!bonusAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            Alert.alert('Error', 'Ingresa un monto válido para el bono');
            return;
        }
        setModalVisible(false);
        setTransferEmail('');
        setSelectedFollower(null);
        setBonusAmount('25');
        setBonusNote('Gracias por compartir el cupón esta semana.');
        Alert.alert(
            '¡Transferencia Exitosa!',
            `Has enviado un bono de ${formatCurrency(parsedAmount)} a ${transferEmail}${bonusNote ? `.\nMensaje: ${bonusNote}` : ''}`
        );
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
        <View style={styles.container}>
            <MobileHeader
                title="Panel Influencer"
                backButton={!isTabMode}
                onBack={!isTabMode ? () => navigation.goBack() : undefined}
                onMenuPress={isTabMode ? onMenuPress : undefined}
                actions={
                    <View style={styles.levelContainer}>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: level.color }}>{level.current}</Text>
                            <Text style={{ fontSize: 9, color: '#666' }}>{referrals} / {level.max} Refs</Text>
                        </View>
                        <Award size={18} color={level.color} style={{ marginLeft: 4 }} />
                    </View>
                }
            />

            {/* Progress Bar (Global) */}
            <View style={{ height: 4, backgroundColor: '#E5E7EB', width: '100%' }}>
                <View style={{ height: '100%', backgroundColor: level.color, width: `${progress}%` }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                {/* METRICS DASHBOARD */}
                <Card style={styles.metricsWrapper}>
                    <View style={styles.metricsHeader}>
                        <View>
                            <Text style={styles.metricsTitle}>Dashboard de Métricas</Text>
                            <Text style={styles.metricsSubtitle}>Últimos 30 días | rendimiento global de la cuenta</Text>
                        </View>
                        <Badge variant="secondary" style={styles.metricsBadge}>
                            <TrendingUp size={14} color="#4f46e5" />
                            <Text style={styles.metricsBadgeText}>+12% vs. mes anterior</Text>
                        </Badge>
                    </View>

                    <View style={styles.metricsRow}>
                        <View style={styles.metricCard}>
                            <View style={styles.metricIcon}>
                                <MousePointer2 size={18} color="#111827" />
                            </View>
                            <Text style={styles.metricValue}>{metrics.clicks.total.toLocaleString('es-ES')}</Text>
                            <Text style={styles.metricLabel}>Clics en enlaces</Text>
                            <MetricTrend value={metrics.clicks.growth} />
                        </View>
                        <View style={styles.metricCard}>
                            <View style={styles.metricIcon}>
                                <ShoppingCart size={18} color="#111827" />
                            </View>
                            <Text style={styles.metricValue}>{metrics.sales.total.toLocaleString('es-ES')}</Text>
                            <Text style={styles.metricLabel}>Ventas generadas</Text>
                            <MetricTrend value={metrics.sales.growth} />
                        </View>
                        <View style={styles.metricCard}>
                            <View style={styles.metricIcon}>
                                <DollarSign size={18} color="#111827" />
                            </View>
                            <Text style={styles.metricValue}>{formatCurrency(commissionStats.total)}</Text>
                            <Text style={styles.metricLabel}>Comisiones acumuladas</Text>
                            <MetricTrend value={metrics.commissions.growth} />
                        </View>
                        <View style={styles.metricCard}>
                            <View style={styles.metricIcon}>
                                <Users size={18} color="#111827" />
                            </View>
                            <Text style={styles.metricValue}>{metrics.conversion.rate}%</Text>
                            <Text style={styles.metricLabel}>Tasa de conversión</Text>
                            <MetricTrend value={metrics.conversion.trend} />
                        </View>
                    </View>
                </Card>

                {/* REFERRAL CODE CARD */}
                <Card style={styles.codeCard}>
                    <View style={{ marginBottom: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <Share2 size={20} color="#fff" />
                            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Tu Código de Referido</Text>
                        </View>
                        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Comparte y gana comisiones por venta</Text>
                    </View>
                    <View style={styles.codeBox}>
                        <Text style={styles.codeText}>{referralCode}</Text>
                        <TouchableOpacity onPress={handleShare} style={styles.copyBtn}>
                            <Copy size={16} color="#4f46e5" />
                        </TouchableOpacity>
                    </View>
                </Card>

                {/* STATS OVERVIEW */}
                <View style={styles.statsRow}>
                    <Card style={[styles.statCard, { flex: 1, backgroundColor: '#fff' }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <View style={[styles.iconBox, { backgroundColor: '#ecfdf5' }]}>
                                <DollarSign size={20} color="#059669" />
                            </View>
                            <Badge variant="secondary" style={{ backgroundColor: '#ecfdf5' }}>
                                <Text style={{ color: '#059669', fontSize: 10 }}>Disponible</Text>
                            </Badge>
                        </View>
                        <Text style={styles.statValue}>{formatCurrency(commissionStats.available)}</Text>
                        <TouchableOpacity onPress={handleWithdrawPress} style={{ marginTop: 8 }}>
                            <Text style={{ color: '#059669', fontSize: 12, fontWeight: 'bold' }}>
                                {kycStatus === 'approved' ? 'Solicitar Retiro →' : 'Completar KYC →'}
                            </Text>
                        </TouchableOpacity>
                    </Card>
                    <Card style={[styles.statCard, { flex: 1, backgroundColor: '#fff' }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <View style={[styles.iconBox, { backgroundColor: '#fff7ed' }]}>
                                <TrendingUp size={20} color="#ea580c" />
                            </View>
                            <Badge variant="secondary" style={{ backgroundColor: '#fff7ed' }}>
                                <Text style={{ color: '#ea580c', fontSize: 10 }}>Pendiente</Text>
                            </Badge>
                        </View>
                        <Text style={styles.statValue}>{formatCurrency(commissionStats.pending)}</Text>
                        <Text style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
                            Próx. pago: {latestCommission ? new Date(latestCommission.createdAt).toLocaleDateString('es-ES') : '30 Oct'}
                        </Text>
                    </Card>
                </View>

                {wallet && (
                    <Card style={styles.walletCard}>
                        <View style={styles.walletHeader}>
                            <View style={styles.walletIcon}>
                                <Wallet size={18} color="#0f172a" />
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

                {/* GOALS & ACHIEVEMENTS */}
                <Card style={styles.goalsCard}>
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
                <Card style={styles.transferCard}>
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

                {/* TABS simplified */}
                <View style={{ marginTop: 20 }}>
                    <Text style={styles.sectionTitle}>Productos para Referir</Text>
                    {products.map(prod => (
                        <Card key={prod.id} style={{ marginBottom: 12, padding: 12 }}>
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <ImageWithFallback src={prod.image} style={{ width: 60, height: 60, borderRadius: 8 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontWeight: 'bold' }} numberOfLines={1}>{prod.name}</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                        <Badge variant="secondary">{prod.commission}% Com.</Badge>
                                        <Text style={{ fontSize: 12, color: '#16a34a' }}>+{formatCurrency(prod.earnings)} ganados</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
                                        <Button size="sm" variant="outline" style={{ height: 32, flex: 1 }} onPress={() => Alert.alert('Link Generado', `https://ramgos.app/p/${prod.id}?ref=${referralCode}`)}>
                                            <Link size={14} color="#000" style={{ marginRight: 4 }} />
                                            <Text>Generar Link</Text>
                                        </Button>
                                    </View>
                                </View>
                            </View>
                        </Card>
                    ))}
                </View>

                {/* TIPS */}
                <Card style={{ backgroundColor: '#f0f9ff', borderColor: '#bae6fd', borderWidth: 1, marginTop: 10, padding: 16 }}>
                    <Text style={{ fontWeight: 'bold', color: '#0284c7', marginBottom: 4 }}>💡 Tip para crecer</Text>
                    <Text style={{ fontSize: 12, color: '#0c4a6e' }}>Comparte tus enlaces en historias de Instagram y grupos de WhatsApp para aumentar tus clics un 40%.</Text>
                </Card>

            </ScrollView>

            {/* Transfer Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.centeredView}>
                    <View style={styles.modalView}>
                        <Text style={styles.modalTitle}>Enviar Bono a Seguidor</Text>
                        <Text style={styles.modalText}>Ingresa el email del usuario al que deseas regalar un bono de descuento exclusivo.</Text>

                        <Text style={styles.modalLabel}>Email del seguidor</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="email@usuario.com"
                            value={transferEmail}
                            onChangeText={setTransferEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />

                        <Text style={styles.modalLabel}>Monto del bono (USD)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="25"
                            value={bonusAmount}
                            onChangeText={setBonusAmount}
                            keyboardType="numeric"
                        />

                        <Text style={styles.modalLabel}>Mensaje personalizado</Text>
                        <TextInput
                            style={[styles.input, { height: 90, paddingTop: 12 }]}
                            placeholder="Agradece o da instrucciones específicas para usar el bono"
                            value={bonusNote}
                            onChangeText={setBonusNote}
                            multiline
                        />

                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                            <Button variant="outline" onPress={() => setModalVisible(false)} style={{ flex: 1 }}>
                                <Text>Cancelar</Text>
                            </Button>
                            <Button onPress={handleTransferBonus} style={{ flex: 1, backgroundColor: '#4f46e5' }}>
                                <Send size={16} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={{ color: '#fff', fontWeight: '600' }}>Enviar bono</Text>
                            </Button>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9f9f9' },
    levelContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    codeCard: { backgroundColor: '#6366f1', padding: 20, borderRadius: 16, marginBottom: 16 },
    codeBox: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.2)', padding: 4, paddingLeft: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'space-between' },
    codeText: { color: '#fff', fontSize: 16, fontFamily: 'monospace', fontWeight: 'bold' },
    copyBtn: { backgroundColor: '#fff', padding: 8, borderRadius: 6 },
    statsRow: { flexDirection: 'row', gap: 12 },
    statCard: { padding: 16, borderRadius: 12 },
    iconBox: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    statValue: { fontSize: 24, fontWeight: 'bold', marginTop: 8, color: '#111827' },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, marginTop: 4, color: '#111827' },
    sectionSubtitle: { fontSize: 12, color: '#6b7280', marginTop: 4 },
    centeredView: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: 'rgba(0,0,0,0.5)' },
    modalView: { margin: 20, backgroundColor: "white", borderRadius: 20, padding: 35, width: '90%', maxWidth: 400, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
    modalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 15, textAlign: "center", color: '#111827' },
    modalText: { marginBottom: 15, textAlign: "center", color: '#666' },
    modalLabel: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4, marginTop: 12 },
    input: { height: 50, width: '100%', borderColor: '#E5E7EB', borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, backgroundColor: '#fff' },
    metricsWrapper: { backgroundColor: '#fff', padding: 18, borderRadius: 16, marginBottom: 16 },
    metricsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    metricsTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
    metricsSubtitle: { fontSize: 12, color: '#6b7280', marginTop: 4 },
    metricsBadge: { backgroundColor: '#eef2ff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
    metricsBadgeText: { color: '#4338ca', fontSize: 11, fontWeight: '600' },
    metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    metricCard: { backgroundColor: '#f9fafb', padding: 14, borderRadius: 12, flexBasis: '48%', alignItems: 'flex-start', gap: 6 },
    metricIcon: { backgroundColor: '#e5e7eb', padding: 6, borderRadius: 10 },
    metricValue: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
    metricLabel: { fontSize: 12, color: '#6b7280' },
    metricTrend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metricTrendArrow: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
    metricTrendText: { fontSize: 11, fontWeight: '600' },
    goalsCard: { backgroundColor: '#fff', padding: 18, borderRadius: 16, marginTop: 16 },
    goalsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    goalBadge: { backgroundColor: '#dcfce7', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
    goalBadgeText: { color: '#047857', fontSize: 11, fontWeight: '600' },
    goalRow: { marginBottom: 14 },
    goalTextWrapper: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    goalTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
    goalDetails: { fontSize: 12, color: '#6b7280' },
    goalProgressBar: { height: 10, backgroundColor: '#e5e7eb', borderRadius: 999, overflow: 'hidden' },
    goalProgressFill: { height: '100%', borderRadius: 999 },
    walletCard: { backgroundColor: '#fff', padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 16 },
    walletHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    walletIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center' },
    walletTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
    walletSubtitle: { fontSize: 12, color: '#475569', marginTop: 2 },
    walletBadge: { borderColor: '#0f172a', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'transparent' },
    walletBadgeText: { fontSize: 10, fontWeight: '600', color: '#0f172a' },
    walletRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
    walletLabel: { fontSize: 12, color: '#64748b' },
    walletValue: { fontSize: 12, fontWeight: '600', color: '#0f172a' },
    walletSplit: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 12, gap: 6 },
    walletSplitTitle: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
    walletSplitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    walletSplitLabel: { fontSize: 11, color: '#64748b' },
    walletSplitValue: { fontSize: 11, fontWeight: '600', color: '#0f172a' },
    transferCard: { backgroundColor: '#fff', padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#fcd34d', marginTop: 16 },
    transferHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    transferIconWrapper: { backgroundColor: '#f59e0b', padding: 10, borderRadius: 12 },
    transferTitle: { fontSize: 16, fontWeight: 'bold', color: '#78350f' },
    transferSubtitle: { fontSize: 12, color: '#92400e', marginTop: 4 },
    transferButton: { backgroundColor: '#ea580c', paddingHorizontal: 16, height: 36, borderRadius: 12 },
    transferFollowers: { flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' },
    transferFollowerPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fcd34d' },
    transferFollowerPillActive: { backgroundColor: '#fde68a', borderColor: '#f59e0b' },
    transferFollowerText: { fontSize: 12, fontWeight: '600', color: '#92400e' },
    transferFollowerTextActive: { color: '#78350f' },
});

const MetricTrend = ({ value }: { value: number }) => {
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
