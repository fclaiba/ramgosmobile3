import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Animated } from 'react-native';
import { Trophy, Gift, ShoppingBag, Zap, Clock, CheckCircle2, Flame } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePoints, DailyChallenge } from '../contexts/PointsContext';

export function DailyChallenges() {
    const { challenges, challengeProgress, claimDailyReward, claimChallenge } = usePoints();

    // Animation for success claim could be added here
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handleClaimDaily = () => {
        const success = claimDailyReward();
        if (success) {
            Alert.alert('¡Recompensa reclamada!', '+10 puntos por iniciar sesión hoy');
            animateSuccess();
        } else {
            Alert.alert('Info', 'Ya reclamaste tu recompensa diaria');
        }
    };

    const handleClaimChallenge = (challengeId: string, title: string, reward: number) => {
        const success = claimChallenge(challengeId);
        if (success) {
            Alert.alert('¡Desafío completado!', `+${reward} puntos por ${title}`);
            animateSuccess();
        } else {
            Alert.alert('Error', 'No se pudo reclamar el desafío');
        }
    };

    const animateSuccess = () => {
        Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 1.05, duration: 100, useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
        ]).start();
    };

    const getIcon = (iconType: string) => {
        switch (iconType) {
            case 'login': return <Zap size={20} color="#fff" />;
            case 'purchase': return <ShoppingBag size={20} color="#fff" />;
            default: return <Gift size={20} color="#fff" />;
        }
    };

    const dailyChallenges = challenges.filter(c => c.type === 'daily');
    const weeklyChallenges = challenges.filter(c => c.type === 'weekly');

    // Check if daily reward claimed today (mock logic based on implementation plan)
    // Real implementation would check challengeProgress.dailyClaimDate against today
    const today = new Date().toISOString().split('T')[0];
    const alreadyClaimed = challengeProgress.dailyClaimDate === today;

    return (
        <View style={styles.container}>
            {/* Daily Streak Card */}
            <LinearGradient
                colors={['#FFF7ED', '#FEF2F2']} // orange-50 to red-50
                style={styles.streakCard}
            >
                <View style={styles.cardContent}>
                    <View style={styles.streakHeader}>
                        <View style={styles.streakInfo}>
                            <View style={styles.streakIconBg}>
                                <Flame size={24} color="#fff" fill="#fff" />
                            </View>
                            <View>
                                <Text style={styles.cardTitle}>Racha Diaria</Text>
                                <Text style={styles.cardSubtitle}>{challengeProgress.loginStreak} días consecutivos</Text>
                            </View>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 24 }}>🔥</Text>
                            <Text style={styles.cardMiniText}>¡Sigue así!</Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.claimBtn, alreadyClaimed && styles.claimBtnDisabled]}
                        onPress={handleClaimDaily}
                        disabled={alreadyClaimed}
                    >
                        {alreadyClaimed ? (
                            <>
                                <CheckCircle2 size={16} color="#666" style={{ marginRight: 8 }} />
                                <Text style={styles.claimBtnTextDisabled}>Reclamado Hoy</Text>
                            </>
                        ) : (
                            <>
                                <Gift size={16} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.claimBtnText}>Reclamar Recompensa (+10 pts)</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </LinearGradient>

            {/* Daily Challenges List */}
            {dailyChallenges.length > 0 && (
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Clock size={20} color="#2563EB" />
                            <Text style={styles.sectionTitle}>Desafíos Diarios</Text>
                        </View>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>Hoy</Text>
                        </View>
                    </View>

                    {dailyChallenges.map((challenge) => (
                        <ChallengeCard
                            key={challenge.id}
                            challenge={challenge}
                            onClaim={handleClaimChallenge}
                            getIcon={getIcon}
                        />
                    ))}
                </View>
            )}

            {/* Weekly Challenges List */}
            {weeklyChallenges.length > 0 && (
                <View style={[styles.section, { marginTop: 20 }]}>
                    <View style={styles.sectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Trophy size={20} color="#9333EA" />
                            <Text style={styles.sectionTitle}>Desafíos Semanales</Text>
                        </View>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>Semana</Text>
                        </View>
                    </View>

                    {weeklyChallenges.map((challenge) => (
                        <ChallengeCard
                            key={challenge.id}
                            challenge={challenge}
                            onClaim={handleClaimChallenge}
                            getIcon={getIcon}
                            isWeekly
                        />
                    ))}
                </View>
            )}

            {/* Info Card */}
            <View style={styles.infoCard}>
                <View style={styles.infoIconBg}>
                    <Trophy size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.infoTitle}>¡Completa desafíos para ganar más!</Text>
                    <Text style={styles.infoText}>Los desafíos diarios se reinician cada 24 horas. ¡No pierdas tu racha!</Text>
                </View>
            </View>
        </View>
    );
}

const ChallengeCard = ({ challenge, onClaim, getIcon, isWeekly = false }: {
    challenge: DailyChallenge,
    onClaim: (id: string, title: string, reward: number) => void,
    getIcon: (type: string) => React.ReactNode,
    isWeekly?: boolean
}) => {
    const progress = Math.min((challenge.current / challenge.target) * 100, 100);
    const isCompleted = challenge.current >= challenge.target;
    const isClaimed = challenge.claimed;

    const activeColor = isWeekly ? '#9333EA' : '#2563EB'; // Purple for weekly, Blue for daily
    const activeBg = isWeekly ? '#F3E8FF' : '#EFF6FF';

    return (
        <View style={[
            styles.challengeCard,
            isCompleted && !isClaimed && { borderColor: activeColor, backgroundColor: activeBg },
            isClaimed && { borderColor: '#22C55E', backgroundColor: '#F0FDF4' }
        ]}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[
                    styles.challengeIcon,
                    { backgroundColor: isClaimed ? '#22C55E' : (isCompleted ? activeColor : '#E5E7EB') }
                ]}>
                    {isClaimed ? <CheckCircle2 size={24} color="#fff" /> : getIcon(challenge.icon)}
                </View>

                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={styles.challengeTitle}>{challenge.title}</Text>
                        <View style={styles.ptsBadge}>
                            <Text style={styles.ptsText}>+{challenge.reward} pts</Text>
                        </View>
                    </View>

                    <Text style={styles.challengeDesc}>{challenge.description}</Text>

                    <View style={styles.progressContainer}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={styles.progressLabel}>Progreso</Text>
                            <Text style={styles.progressValue}>{challenge.current} / {challenge.target}</Text>
                        </View>
                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: isClaimed ? '#22C55E' : activeColor }]} />
                        </View>
                    </View>
                </View>
            </View>

            {isCompleted && !isClaimed && (
                <TouchableOpacity
                    style={[styles.miniClaimBtn, { backgroundColor: activeColor }]}
                    onPress={() => onClaim(challenge.id, challenge.title, challenge.reward)}
                >
                    <Trophy size={14} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Reclamar</Text>
                </TouchableOpacity>
            )}
            {isClaimed && (
                <View style={styles.claimedRef}>
                    <CheckCircle2 size={14} color="#16A34A" style={{ marginRight: 4 }} />
                    <Text style={{ color: '#16A34A', fontSize: 12, fontWeight: '600' }}>¡Completado!</Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { gap: 16 },
    streakCard: { borderRadius: 16, padding: 1, overflow: 'hidden', borderWidth: 1, borderColor: '#FED7AA' },
    cardContent: { padding: 16 },
    streakHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    streakInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    streakIconBg: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F97316', justifyContent: 'center', alignItems: 'center' },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
    cardSubtitle: { fontSize: 13, color: '#6B7280' },
    cardMiniText: { fontSize: 10, color: '#6B7280', marginTop: 2 },

    claimBtn: { backgroundColor: '#F97316', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12 },
    claimBtnDisabled: { backgroundColor: '#E5E7EB' },
    claimBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    claimBtnTextDisabled: { color: '#6B7280', fontWeight: '600', fontSize: 13 },

    section: {},
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
    badge: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    badgeText: { fontSize: 11, color: '#4B5563', fontWeight: '600' },

    challengeCard: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff', marginBottom: 12 },
    challengeIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    challengeTitle: { fontSize: 13, fontWeight: 'bold', color: '#1F2937' },
    challengeDesc: { fontSize: 11, color: '#6B7280', marginBottom: 8 },
    ptsBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    ptsText: { fontSize: 10, fontWeight: 'bold', color: '#4B5563' },

    progressContainer: { marginTop: 4 },
    progressLabel: { fontSize: 10, color: '#9CA3AF' },
    progressValue: { fontSize: 10, fontWeight: '600', color: '#374151' },
    progressBarBg: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 3 },

    miniClaimBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, marginTop: 12 },
    claimedRef: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12 },

    infoCard: { flexDirection: 'row', gap: 12, backgroundColor: '#FFFBEB', padding: 16, borderRadius: 16, borderColor: '#FDE68A', borderWidth: 1 },
    infoIconBg: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#D97706', justifyContent: 'center', alignItems: 'center' },
    infoTitle: { color: '#92400E', fontWeight: 'bold', fontSize: 13, marginBottom: 2 },
    infoText: { color: '#B45309', fontSize: 11 }
});
