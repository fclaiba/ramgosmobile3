import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Alert } from 'react-native';
import { Star, TrendingUp, Gift, Coins, Sparkles, Flame, CircleDollarSign, Gamepad2, UserPlus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePoints, DISCOUNT_TIERS } from '../contexts/PointsContext';
import { DailyChallenges } from './DailyChallenges';
import { useRewards } from '../contexts/RewardsContext';

export function PointsManager() {
    const { points, lifetimePoints, transactions, currentTier, nextTier, challengeProgress } = usePoints();
    const {
        getArcadeStatus,
        spinLuckyWheel,
        getLuckyWheelStatus,
        getStreakMilestones,
        claimStreakMilestone,
        streakLongest,
        referralCode,
        referralLink,
        referralSummary,
    } = useRewards();

    // Animation for progress bar
    const progressToNext = useRef(new Animated.Value(0)).current;

    const getNextMembership = () => {
        if (!nextTier) return undefined;
        return nextTier;
    };

    const membershipTarget = getNextMembership();
    const pointsFloor = currentTier?.minPoints ?? 0;
    const pointsCap = membershipTarget?.minPoints ?? lifetimePoints;
    const rawProgress = membershipTarget && pointsCap !== pointsFloor
        ? ((lifetimePoints - pointsFloor) / (pointsCap - pointsFloor)) * 100
        : 100;
    const progress = Math.min(Math.max(rawProgress, 0), 100);
    const pointsToNext = membershipTarget ? Math.max(pointsCap - lifetimePoints, 0) : 0;

    const walletValueUSD = (points * 0.01).toFixed(2);
    const arcadeStatus = getArcadeStatus();
    const wheelStatus = getLuckyWheelStatus();
    const milestones = getStreakMilestones();
    const nextClaimableMilestone = milestones.find((milestone) => milestone.eligible && !milestone.claimed);
    const upcomingMilestone = milestones.find((milestone) => !milestone.claimed) ?? milestones[milestones.length - 1];
    const wheelAvailable = wheelStatus.available;
    const lastWheelResult = wheelStatus.lastResult;

    useEffect(() => {
        Animated.timing(progressToNext, {
            toValue: Math.min(progress, 100),
            duration: 1000,
            useNativeDriver: false // width doesn't support native driver
        }).start();
    }, [progress]);

    const formatDate = (isoDate: string) => {
        const date = new Date(isoDate);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Hace un momento';
        if (diffMins < 60) return `Hace ${diffMins} min`;
        if (diffHours < 24) return `Hace ${diffHours}h`;
        if (diffDays < 7) return `Hace ${diffDays}d`;
        return date.toLocaleDateString();
    };

    const handleClaimStreak = () => {
        if (!nextClaimableMilestone) {
            Alert.alert('Racha Ramgos', 'No tienes recompensas pendientes por reclamar.');
            return;
        }
        const result = claimStreakMilestone(nextClaimableMilestone.value);
        Alert.alert('Racha Ramgos', result.message);
    };

    const handleSpinWheel = () => {
        const result = spinLuckyWheel();
        Alert.alert('Rueda de la Suerte', result.message);
    };

    const handleShowReferralLink = () => {
        Alert.alert('Tu enlace de referido', referralLink);
    };

    return (
        <View style={styles.container}>
            {/* Balance Card */}
            <LinearGradient
                colors={['#8B5CF6', '#7C3AED']} // Violet gradient
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.balanceCard}
            >
                <View style={styles.balanceHeader}>
                    <View>
                        <Text style={styles.balanceLabel}>Tus Puntos · Nivel {currentTier?.label}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                            <Text style={styles.balanceValue}>{points}</Text>
                            <Star size={24} color="#FDE047" fill="#FDE047" />
                        </View>
                    </View>
                    <View style={styles.sparkleIcon}>
                        <Sparkles size={24} color="#fff" />
                    </View>
                </View>

                {pointsToNext > 0 && membershipTarget && (
                    <View style={{ marginTop: 16 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                            <Text style={styles.nextTierText}>Siguiente nivel: {membershipTarget.label}</Text>
                            <Text style={styles.nextTierText}>
                                {pointsToNext} pts para activar beneficios adicionales
                            </Text>
                        </View>
                        <View style={styles.progressBarBg}>
                            <Animated.View
                                style={[
                                    styles.progressBarFill,
                                    {
                                        width: progressToNext.interpolate({
                                            inputRange: [0, 100],
                                            outputRange: ['0%', '100%']
                                        })
                                    }
                                ]}
                            />
                        </View>
                    </View>
                )}

                <View style={styles.balanceMetaRow}>
                    <View style={styles.balanceMeta}>
                        <Text style={styles.balanceMetaLabel}>Valor billetera</Text>
                        <Text style={styles.balanceMetaValue}>${walletValueUSD}</Text>
                    </View>
                    <View style={styles.balanceMeta}>
                        <Text style={styles.balanceMetaLabel}>Puntos históricos</Text>
                        <Text style={styles.balanceMetaValue}>{lifetimePoints}</Text>
                    </View>
                </View>
            </LinearGradient>

            {/* Discount Tiers */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Gift size={20} color="#7C3AED" />
                    <Text style={styles.sectionTitle}>Descuentos Disponibles</Text>
                </View>

                <View style={{ gap: 10 }}>
                        {DISCOUNT_TIERS.map((tier, index) => {
                            const isUnlocked = points >= tier.points;
                            const isActive = points >= tier.points && (index === DISCOUNT_TIERS.length - 1 || points < DISCOUNT_TIERS[index + 1].points);

                        return (
                            <View
                                key={tier.points}
                                style={[
                                    styles.tierCard,
                                    isActive && { borderColor: '#8B5CF6', backgroundColor: '#F5F3FF' },
                                    isUnlocked && !isActive && { borderColor: '#22C55E', backgroundColor: '#F0FDF4' }
                                ]}
                            >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                            <Text style={styles.tierPoints}>{tier.points} puntos</Text>
                                            {isActive && (
                                                <View style={styles.activeBadge}>
                                                    <Text style={styles.activeBadgeText}>Actual</Text>
                                                </View>
                                            )}
                                            {isUnlocked && !isActive && (
                                                <View style={styles.unlockedBadge}>
                                                    <Text style={styles.unlockedBadgeText}>Desbloqueado</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.tierDesc}>${tier.discount} de descuento ({tier.percentage}%)</Text>
                                    </View>

                                    <View style={[
                                        styles.statusIcon,
                                        isUnlocked ? { backgroundColor: '#22C55E' } : { backgroundColor: '#F3F4F6' }
                                    ]}>
                                        <Text style={{ fontSize: 16 }}>{isUnlocked ? '✓' : '🔒'}</Text>
                                    </View>
                                </View>
                            </View>
                        );
                    })}
                </View>
            </View>

            {/* Rewards Engine */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Sparkles size={20} color="#F97316" />
                    <Text style={styles.sectionTitle}>Ramgos Rewards</Text>
                </View>

                <View style={styles.rewardsGrid}>
                    <View style={styles.rewardCard}>
                        <View style={styles.rewardCardHeader}>
                            <View style={[styles.rewardIcon, { backgroundColor: '#FFF7ED' }]}>
                                <Flame size={18} color="#F97316" />
                            </View>
                            <View>
                                <Text style={styles.rewardTitle}>Racha diaria</Text>
                                <Text style={styles.rewardSubtitle}>
                                    {challengeProgress.loginStreak} días · Mejor racha {streakLongest}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.rewardBody}>
                            <Text style={styles.rewardDetail}>
                                Próxima meta: {upcomingMilestone ? `${upcomingMilestone.value} días (+${upcomingMilestone.reward} pts)` : 'Metas completadas'}
                            </Text>
                            <TouchableOpacity
                                style={[styles.rewardButton, !nextClaimableMilestone && styles.rewardButtonDisabled]}
                                onPress={handleClaimStreak}
                                disabled={!nextClaimableMilestone}
                            >
                                <Gift size={16} color={nextClaimableMilestone ? '#fff' : '#9CA3AF'} />
                                <Text
                                    style={[styles.rewardButtonText, !nextClaimableMilestone && styles.rewardButtonTextDisabled]}
                                >
                                    {nextClaimableMilestone ? `Reclamar +${nextClaimableMilestone.reward} pts` : 'Sin recompensas pendientes'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.rewardCard}>
                        <View style={styles.rewardCardHeader}>
                            <View style={[styles.rewardIcon, { backgroundColor: '#FEF3C7' }]}>
                                <CircleDollarSign size={18} color="#D97706" />
                            </View>
                            <View>
                                <Text style={styles.rewardTitle}>Rueda de la suerte</Text>
                                <Text style={styles.rewardSubtitle}>
                                    {wheelAvailable ? '1 giro disponible hoy' : 'Disponible nuevamente mañana'}
                                </Text>
                            </View>
                        </View>
                        {lastWheelResult && (
                            <Text style={styles.rewardDetail}>
                                Último resultado: {lastWheelResult.segment.label}
                                {lastWheelResult.pointsAwarded ? ` (+${lastWheelResult.pointsAwarded} pts)` : ''}
                            </Text>
                        )}
                        <TouchableOpacity
                            style={[styles.rewardButton, !wheelAvailable && styles.rewardButtonDisabled]}
                            onPress={handleSpinWheel}
                            disabled={!wheelAvailable}
                        >
                            <CircleDollarSign size={16} color={wheelAvailable ? '#fff' : '#9CA3AF'} />
                            <Text
                                style={[styles.rewardButtonText, !wheelAvailable && styles.rewardButtonTextDisabled]}
                            >
                                {wheelAvailable ? 'Girar ahora' : 'Mañana hay más'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.rewardCard}>
                        <View style={styles.rewardCardHeader}>
                            <View style={[styles.rewardIcon, { backgroundColor: '#E0F2FE' }]}>
                                <Gamepad2 size={18} color="#0EA5E9" />
                            </View>
                            <View>
                                <Text style={styles.rewardTitle}>Arcade diario</Text>
                                <Text style={styles.rewardSubtitle}>
                                    {arcadeStatus.remaining > 0
                                        ? `${arcadeStatus.remaining} recompensas disponibles`
                                        : 'Límite diario alcanzado'}
                                </Text>
                            </View>
                        </View>
                        <Text style={styles.rewardDetail}>
                            Recompensas reclamadas hoy: {arcadeStatus.claimed} / {arcadeStatus.claimed + arcadeStatus.remaining}
                        </Text>
                        <Text style={styles.rewardHint}>
                            Juega en Mi Mascota o Game Center para sumar puntos extra.
                        </Text>
                    </View>

                    <View style={styles.rewardCard}>
                        <View style={styles.rewardCardHeader}>
                            <View style={[styles.rewardIcon, { backgroundColor: '#F3E8FF' }]}>
                                <UserPlus size={18} color="#7C3AED" />
                            </View>
                            <View>
                                <Text style={styles.rewardTitle}>Referidos</Text>
                                <Text style={styles.rewardSubtitle}>
                                    {referralSummary.registrations} registros · {referralSummary.purchases} compras
                                </Text>
                            </View>
                        </View>
                        <View style={styles.referralCodeBox}>
                            <Text style={styles.referralCode}>{referralCode}</Text>
                            <TouchableOpacity style={styles.linkButton} onPress={handleShowReferralLink}>
                                <Text style={styles.linkButtonText}>Ver enlace</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.rewardDetail}>
                            Puntos acumulados: {referralSummary.totalPoints}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Daily Challenges Component */}
            <DailyChallenges />

            {/* How to Earn */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <TrendingUp size={20} color="#16A34A" />
                    <Text style={styles.sectionTitle}>Cómo Ganar Puntos</Text>
                </View>

                <View style={{ gap: 10 }}>
                    <View style={styles.earnCard}>
                        <View style={[styles.earnIcon, { backgroundColor: '#8B5CF6' }]}>
                            <Gift size={20} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.earnTitle}>Compra en la Tienda</Text>
                            <Text style={styles.earnDesc}>Gana <Text style={{ fontWeight: 'bold' }}>1 punto</Text> por cada $1 gastado</Text>
                        </View>
                    </View>

                    <View style={styles.earnCard}>
                        <View style={[styles.earnIcon, { backgroundColor: '#F59E0B' }]}>
                            <Coins size={20} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.earnTitle}>Juega con tu Mascota</Text>
                            <Text style={styles.earnDesc}>Convierte <Text style={{ fontWeight: 'bold' }}>5 monedas = 1 punto</Text> desde Mi Mascota</Text>
                        </View>
                    </View>
                </View>
            </View>

            {/* Transaction History */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Historial Reciente</Text>
                </View>

                {transactions.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIcon}>
                            <Star size={32} color="#9CA3AF" />
                        </View>
                        <Text style={styles.emptyText}>Aún no tienes transacciones</Text>
                    </View>
                ) : (
                    <View style={styles.historyList}>
                        {transactions.slice(0, 10).map((transaction, index) => (
                            <View key={transaction.id}>
                                <View style={styles.historyItem}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                                        <View style={[
                                            styles.historyIcon,
                                            (transaction.type === 'earn' || transaction.type === 'convert')
                                                ? { backgroundColor: '#DCFCE7' }
                                                : { backgroundColor: '#FEE2E2' }
                                        ]}>
                                            {(transaction.type === 'earn' || transaction.type === 'convert') ? (
                                                <TrendingUp
                                                    size={16}
                                                    color={transaction.type === 'convert' ? '#D97706' : '#16A34A'}
                                                />
                                            ) : (
                                                <Gift size={16} color="#DC2626" />
                                            )}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.historyDesc} numberOfLines={1}>{transaction.description}</Text>
                                            <Text style={styles.historyDate}>{formatDate(transaction.date)}</Text>
                                        </View>
                                    </View>
                                    <Text style={[
                                        styles.historyAmount,
                                        transaction.amount > 0 ? { color: '#16A34A' } : { color: '#DC2626' }
                                    ]}>
                                        {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                                    </Text>
                                </View>
                                {index < transactions.slice(0, 10).length - 1 && <View style={styles.separator} />}
                            </View>
                        ))}
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { gap: 20, paddingBottom: 20 },

    // Balance Card
    balanceCard: { borderRadius: 24, padding: 24, elevation: 4 },
    balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: 4 },
    balanceValue: { color: '#fff', fontSize: 40, fontWeight: 'bold' },
    sparkleIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    nextTierText: { color: 'rgba(255,255,255,0.9)', fontSize: 12 },
    progressBarBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#fff', borderRadius: 4 },
    balanceMetaRow: { flexDirection: 'row', marginTop: 24, gap: 12 },
    balanceMeta: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 12 },
    balanceMetaLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
    balanceMetaValue: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 4 },

    // Sections
    section: { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
    rewardsGrid: { gap: 12 },
    rewardCard: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, backgroundColor: '#fff', gap: 12 },
    rewardCardHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    rewardIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    rewardTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
    rewardSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
    rewardBody: { gap: 12 },
    rewardDetail: { fontSize: 12, color: '#4B5563' },
    rewardHint: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
    rewardButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F97316', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center' },
    rewardButtonText: { color: '#fff', fontWeight: '600', fontSize: 12 },
    rewardButtonDisabled: { backgroundColor: '#F3F4F6' },
    rewardButtonTextDisabled: { color: '#9CA3AF' },
    referralCodeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5E7EB', marginTop: 8 },
    referralCode: { fontWeight: '700', fontSize: 13, color: '#4C1D95' },
    linkButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#7C3AED' },
    linkButtonText: { color: '#fff', fontWeight: '600', fontSize: 12 },

    // Discount Tiers
    tierCard: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
    tierPoints: { fontSize: 14, fontWeight: '600', color: '#111827' },
    tierDesc: { fontSize: 12, color: '#6B7280' },
    activeBadge: { backgroundColor: '#8B5CF6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    activeBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    unlockedBadge: { backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    unlockedBadgeText: { color: '#16A34A', fontSize: 10, fontWeight: 'bold' },
    statusIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

    // Earn Methods
    earnCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: '#F9FAFB' },
    earnIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    earnTitle: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 2 },
    earnDesc: { fontSize: 11, color: '#6B7280' },

    // History
    emptyState: { alignItems: 'center', padding: 24 },
    emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    emptyText: { color: '#6B7280', fontSize: 14 },
    historyList: {},
    historyItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
    historyIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    historyDesc: { fontSize: 13, fontWeight: '500', color: '#374151' },
    historyDate: { fontSize: 11, color: '#9CA3AF' },
    historyAmount: { fontSize: 13, fontWeight: 'bold' },
    separator: { height: 1, backgroundColor: '#F3F4F6' }
});

