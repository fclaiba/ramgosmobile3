import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Trophy, Gift, ShoppingBag, Zap, Clock, CheckCircle2, Flame } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePoints, DailyChallenge } from '../contexts/PointsContext';
import { useTheme } from '../contexts/ThemeContext';

import { useToast } from '../contexts/ToastContext';
import { Radius, colors } from '../theme/tokens';


export function DailyChallenges() {
    const { challenges, challengeProgress, claimDailyReward, claimChallenge } = usePoints();
    const { show } = useToast();

    // Animation for success claim could be added here
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handleClaimDaily = async () => {
        const success = await claimDailyReward();
        if (success) {
            show('¡Recompensa reclamada! +10 puntos', 'success');
            animateSuccess();
        } else {
            show('Ya reclamaste tu recompensa diaria', 'info');
        }
    };

    const handleClaimChallenge = async (challengeId: string, title: string, reward: number) => {
        const success = await claimChallenge(challengeId);
        if (success) {
            show(`¡Desafío completado! +${reward} puntos`, 'success');
            animateSuccess();
        } else {
            show('No se pudo reclamar el desafío', 'error');
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

    const completedDailies = challenges.filter((c: DailyChallenge) => c.type === 'daily' && c.claimed).length;
    const totalDailies = challenges.filter((c: DailyChallenge) => c.type === 'daily').length;

    const dailyChallenges = challenges.filter((c: DailyChallenge) => c.type === 'daily');
    const weeklyChallenges = challenges.filter((c: DailyChallenge) => c.type === 'weekly');

    const today = new Date().toISOString().split('T')[0];
    const alreadyClaimed = challengeProgress.dailyClaimDate === today;

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    return (
        <View style={styles.container}>
            {/* Daily Streak Card */}
            <LinearGradient
                colors={isDark ? ['rgba(249, 115, 22, 0.1)', 'rgba(249, 115, 22, 0.05)'] : ['#FFF7ED', '#FEF2F2']}
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
                                <Text style={styles.claimBtnText}>Reclamar Recompensa</Text>
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

                    {dailyChallenges.map((challenge: DailyChallenge) => (
                        <ChallengeCard
                            key={challenge.id}
                            challenge={challenge}
                            onClaim={handleClaimChallenge}
                            getIcon={getIcon}
                            isDark={isDark}
                            styles={styles}
                        />
                    ))}
                </View>
            )}

            {/* Weekly Challenges List */}
            {weeklyChallenges.length > 0 && (
                <View style={[styles.section, { marginTop: 20 }]}>
                    <View style={styles.sectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Trophy size={20} color="#29B6F6" />
                            <Text style={styles.sectionTitle}>Desafíos Semanales</Text>
                        </View>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>Semana</Text>
                        </View>
                    </View>

                    {weeklyChallenges.map((challenge: DailyChallenge) => (
                        <ChallengeCard
                            key={challenge.id}
                            challenge={challenge}
                            onClaim={handleClaimChallenge}
                            getIcon={getIcon}
                            isWeekly
                            isDark={isDark}
                            styles={styles}
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

const ChallengeCard = ({ challenge, onClaim, getIcon, isWeekly = false, isDark, styles }: {
    challenge: DailyChallenge,
    onClaim: (id: string, title: string, reward: number) => void,
    getIcon: (type: string) => React.ReactNode,
    isWeekly?: boolean,
    isDark: boolean,
    styles: any
}) => {
    const progress = Math.min((challenge.current / challenge.target) * 100, 100);
    const isCompleted = challenge.current >= challenge.target;
    const isClaimed = challenge.claimed;

    const activeColor = isWeekly ? '#29B6F6' : '#2563EB'; // Purple for weekly, Blue for daily
    const activeBg = isWeekly ? (isDark ? 'rgba(41, 182, 246, 0.1)' : '#F3E8FF') : (isDark ? 'rgba(37, 99, 235, 0.1)' : '#EFF6FF');

    return (
        <View style={[
            styles.challengeCard,
            isCompleted && !isClaimed && { borderColor: activeColor, backgroundColor: activeBg },
            isClaimed && { borderColor: '#22C55E', backgroundColor: isDark ? 'rgba(34, 197, 94, 0.1)' : '#F0FDF4' }
        ]}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[
                    styles.challengeIcon,
                    { backgroundColor: isClaimed ? '#22C55E' : (isCompleted ? activeColor : (isDark ? '#374151' : '#E5E7EB')) }
                ]}>
                    {isClaimed ? <CheckCircle2 size={24} color="#fff" /> : getIcon(challenge.icon || 'default')}
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

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { gap: 16 },
    streakCard: { borderRadius: Radius.lg, padding: 1, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? 'rgba(249, 115, 22, 0.2)' : '#FED7AA' },
    cardContent: { padding: 16 },
    streakHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    streakInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    streakIconBg: { width: 48, height: 48, borderRadius: Radius.xl, backgroundColor: '#F97316', justifyContent: 'center', alignItems: 'center' },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#fff' : '#111827' },
    cardSubtitle: { fontSize: 13, color: colors(isDark).textMuted },
    cardMiniText: { fontSize: 10, color: colors(isDark).textMuted, marginTop: 2 },

    claimBtn: { backgroundColor: '#F97316', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: Radius.md, overflow: 'hidden' },
    claimBtnDisabled: { backgroundColor: colors(isDark).glass },
    claimBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    claimBtnTextDisabled: { color: colors(isDark).textMuted, fontWeight: '600', fontSize: 13 },

    section: {},
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors(isDark).text },
    badge: { backgroundColor: colors(isDark).glass, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.md },
    badgeText: { fontSize: 11, color: colors(isDark).textMuted, fontWeight: '600' },

    challengeCard: { padding: 16, borderRadius: Radius.lg, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', backgroundColor: colors(isDark).glass, marginBottom: 12 },
    challengeIcon: { width: 40, height: 40, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
    challengeTitle: { fontSize: 13, fontWeight: 'bold', color: colors(isDark).text },
    challengeDesc: { fontSize: 11, color: colors(isDark).textMuted, marginBottom: 8 },
    ptsBadge: { backgroundColor: colors(isDark).glass, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
    ptsText: { fontSize: 10, fontWeight: 'bold', color: colors(isDark).textMuted },

    progressContainer: { marginTop: 4 },
    progressLabel: { fontSize: 10, color: '#9CA3AF' },
    progressValue: { fontSize: 10, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },
    progressBarBg: { height: 6, backgroundColor: colors(isDark).glass, borderRadius: Radius.sm, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: Radius.sm },

    miniClaimBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: Radius.sm, marginTop: 12 },
    claimedRef: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12 },

    infoCard: { flexDirection: 'row', gap: 12, backgroundColor: isDark ? 'rgba(217, 119, 6, 0.1)' : '#FFFBEB', padding: 16, borderRadius: Radius.lg, borderColor: isDark ? '#7C2D12' : '#FDE68A', borderWidth: 1 },
    infoIconBg: { width: 32, height: 32, borderRadius: Radius.lg, backgroundColor: '#D97706', justifyContent: 'center', alignItems: 'center' },
    infoTitle: { color: isDark ? '#FCD34D' : '#92400E', fontWeight: 'bold', fontSize: 13, marginBottom: 2 },
    infoText: { color: isDark ? '#FDBA74' : '#B45309', fontSize: 11 }
});
