import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Trophy, Zap, ShoppingBag, Gift, CheckCircle2, Flame } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { usePoints } from '../../contexts/PointsContext';
import { Card } from '../ui/card';
import { useTheme } from '../../contexts/ThemeContext';
import { Radius } from '../../theme/tokens';


export function DailyChallenges() {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { challenges, challengeProgress, claimDailyReward, claimChallenge } = usePoints();

    // Determine if daily reward is already claimed
    const todayKey = new Date().toISOString().slice(0, 10);
    const alreadyClaimed = challengeProgress.dailyClaimDate === todayKey;

    const handleClaimDaily = () => {
        if (alreadyClaimed) return;
        claimDailyReward();
        // Toast/Alert equivalent here
    };

    const handleClaimChallenge = (id: string) => {
        claimChallenge(id);
    };

    const getIcon = (icon: string) => {
        switch (icon) {
            case 'login': return <Zap size={20} color="#F59E0B" />;
            case 'purchase': return <ShoppingBag size={20} color="#4FC3F7" />;
            default: return <Gift size={20} color="#EC4899" />;
        }
    };

    return (
        <View style={styles.container}>
            {/* Daily Streak Card */}
            <LinearGradient
                colors={['rgba(255,237,213,0.5)', 'rgba(254,226,226,0.5)']}
                style={styles.streakCard}
            >
                <View style={styles.streakContent}>
                    <View style={styles.streakLeft}>
                        <View style={styles.flameIcon}>
                            <Flame size={24} color="#fff" fill="#fff" />
                        </View>
                        <View>
                            <Text style={styles.streakTitle}>Racha Diaria</Text>
                            <Text style={styles.streakSubtitle}>{challengeProgress.loginStreak} días seguidos</Text>
                        </View>
                    </View>
                    <View style={styles.streakRight}>
                        <Text style={styles.bigEmoji}>🔥</Text>
                        <Text style={styles.keepItUp}>¡Sigue así!</Text>
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.claimButton, alreadyClaimed && styles.claimedButton]}
                    onPress={handleClaimDaily}
                    disabled={alreadyClaimed}
                >
                    {alreadyClaimed ? (
                        <>
                            <CheckCircle2 size={16} color="#6B7280" />
                            <Text style={styles.claimedText}>Reclamado Hoy</Text>
                        </>
                    ) : (
                        <>
                            <Gift size={16} color="#fff" />
                            <Text style={styles.claimText}>Reclamar Recompensa</Text>
                        </>
                    )}
                </TouchableOpacity>
            </LinearGradient>

            {/* Challenges List */}
            <View style={styles.challengesList}>
                <Text style={styles.sectionTitle}>Desafíos Disponibles</Text>
                {challenges.map((challenge: any, index: number) => (
                    <Animated.View
                        key={challenge.id}
                        entering={FadeInDown.delay(index * 100).springify()}
                    >
                        <Card style={styles.challengeItem}>
                            <View style={styles.challengeHeader}>
                                <View style={styles.iconContainer}>
                                    {getIcon(challenge.icon)}
                                </View>
                                <View style={styles.challengeInfo}>
                                    <Text style={styles.challengeTitle}>{challenge.title}</Text>
                                    <Text style={styles.challengeDesc}>{challenge.description}</Text>
                                    <View style={styles.progressBar}>
                                        <View
                                            style={[
                                                styles.progressFill,
                                                { width: `${(challenge.current / challenge.target) * 100}%` }
                                            ]}
                                        />
                                    </View>
                                    <Text style={styles.progressText}>
                                        {challenge.current} / {challenge.target}
                                    </Text>
                                </View>
                            </View>

                            <TouchableOpacity
                                style={[
                                    styles.actionBtn,
                                    challenge.completed && !challenge.claimed && styles.claimableBtn,
                                    challenge.claimed && styles.completedBtn
                                ]}
                                disabled={!challenge.completed || challenge.claimed}
                                onPress={() => handleClaimChallenge(challenge.id)}
                            >
                                <Text style={[
                                    styles.actionBtnText,
                                    challenge.completed && !challenge.claimed && styles.claimableBtnText
                                ]}>
                                    {challenge.claimed ? 'Completado' : `+${challenge.reward} pts`}
                                </Text>
                            </TouchableOpacity>
                        </Card>
                    </Animated.View>
                ))}
            </View>
        </View>
    );
}

const getStyles = (isDark: any) => StyleSheet.create({
    container: {
        gap: 16,
    },
    streakCard: {
        borderRadius: Radius.lg,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(253,186,116,0.3)',
    },
    streakContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    streakLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    flameIcon: {
        width: 48,
        height: 48,
        borderRadius: Radius.xl,
        backgroundColor: '#F97316',
        justifyContent: 'center',
        alignItems: 'center',
    },
    streakTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1F2937',
    },
    streakSubtitle: {
        fontSize: 14,
        color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280',
    },
    streakRight: {
        alignItems: 'center',
    },
    bigEmoji: {
        fontSize: 24,
    },
    keepItUp: {
        fontSize: 10,
        color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280',
    },
    claimButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F97316',
        padding: 12,
        borderRadius: Radius.md,
        gap: 8,
    },
    claimedButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
    },
    claimText: {
        color: isDark ? '#09090B' : '#FAFAFA',
        fontWeight: 'bold',
        fontSize: 14,
    },
    claimedText: {
        color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280',
        fontWeight: 'bold',
        fontSize: 14,
    },
    challengesList: {
        gap: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: isDark ? '#09090B' : '#FAFAFA',
        marginBottom: 8,
    },
    challengeItem: {
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#262626',
        borderColor: '#404040',
        marginBottom: 8,
    },
    challengeHeader: {
        flexDirection: 'row',
        gap: 12,
        flex: 1,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: Radius.xl,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    challengeInfo: {
        flex: 1,
    },
    challengeTitle: {
        color: isDark ? '#09090B' : '#FAFAFA',
        fontWeight: '600',
        marginBottom: 4,
    },
    challengeDesc: {
        color: '#A3A3A3',
        fontSize: 12,
        marginBottom: 8,
    },
    progressBar: {
        height: 4,
        backgroundColor: '#404040',
        borderRadius: Radius.sm,
        marginBottom: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#4FC3F7',
    },
    progressText: {
        color: '#A3A3A3',
        fontSize: 10,
        textAlign: 'right',
    },
    actionBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: Radius.sm,
        backgroundColor: '#404040',
        marginLeft: 8,
    },
    claimableBtn: {
        backgroundColor: '#4FC3F7',
    },
    completedBtn: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#22C55E',
    },
    actionBtnText: {
        color: '#A3A3A3',
        fontWeight: '600',
        fontSize: 12,
    },
    claimableBtnText: {
        color: isDark ? '#09090B' : '#FAFAFA',
    },
});
