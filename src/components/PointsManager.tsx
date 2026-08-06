import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, Platform } from 'react-native';
import { Star, TrendingUp, Gift, Coins, Sparkles, Flame, CircleDollarSign, Gamepad2, UserPlus, Crown, Check, Lock, ChevronRight, Trophy, Zap } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // NEW
import { usePoints, MEMBERSHIP_TIERS, DISCOUNT_TIERS } from '../contexts/PointsContext';
import { DailyChallenges } from './DailyChallenges';
import { useRewards } from '../contexts/RewardsContext';

import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { glassShadow, Radius, colors } from '../theme/tokens';


const { width } = Dimensions.get('window');
const POINT_VALUE_USD = 0.01;

// --- HAPTICS HELPER ---
const triggerImpact = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== 'web') {
        Haptics.impactAsync(style);
    }
};

export function PointsManager() {
    // --- STATE & CONTEXT ---
    const insets = useSafeAreaInsets(); // NEW
    const {
        points,
        lifetimePoints,
        transactions,
        currentTier,
        nextTier,
        challengeProgress,
        claimDailyReward,
        conversionRate,
        spinLuckyWheel,
        wheelClaimDate,
        quarterlyMission, // Now injected from PointsContext
    } = usePoints();
    const { show } = useToast();
    const {
        getArcadeStatus,
    } = useRewards();
    const referralCode = "RAMGOS-2025";
    const referralLink = "https://ramgos.app/inv/RAMGOS-2025";
    const referralSummary = { registrations: 0 };

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    
    const styles = getStyles(isDark, insets); // Pass insets to styles

    // --- ANIMATIONS ---
    const progressToNext = useRef(new Animated.Value(0)).current;

    // --- CALCULATIONS ---
    const walletValueUSD = (points * POINT_VALUE_USD).toFixed(2);

    const getNextMembership = () => nextTier;
    const membershipTarget = getNextMembership();
    const pointsFloor = currentTier?.minPoints ?? 0;
    const pointsCap = membershipTarget?.minPoints ?? lifetimePoints;

    const rawProgress = membershipTarget && pointsCap !== pointsFloor
        ? ((lifetimePoints - pointsFloor) / (pointsCap - pointsFloor)) * 100
        : 100;
    const progress = Math.min(Math.max(rawProgress, 0), 100);
    const pointsToNext = membershipTarget ? Math.max(pointsCap - lifetimePoints, 0) : 0;

    // Rewards status — Convex is source of truth for wheel availability
    const todayKey = new Date().toISOString().slice(0, 10);
    const wheelAvailable = wheelClaimDate !== todayKey;
    const alreadyClaimedDaily = challengeProgress.dailyClaimDate === todayKey;

    useEffect(() => {
        Animated.timing(progressToNext, {
            toValue: Math.min(progress, 100),
            duration: 1200,
            useNativeDriver: false
        }).start();
    }, [progress]);


    // --- ACTIONS ---
    const handleClaimStreak = async () => {
        triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
        if (alreadyClaimedDaily) {
            show('Ya reclamaste tu racha de hoy.', 'info');
            return;
        }
        const ok = await claimDailyReward();
        show(ok ? '¡Racha reclamada! +10 puntos' : 'No se pudo reclamar la racha.', ok ? 'success' : 'error');
    };

    const handleSpinWheel = async () => {
        triggerImpact(Haptics.ImpactFeedbackStyle.Heavy);
        if (!wheelAvailable) {
            show('Ya giraste la rueda hoy. Vuelve mañana.', 'info');
            return;
        }
        const result = await spinLuckyWheel();
        if (result.success) {
            show(result.message || `¡Ganaste ${result.pointsAwarded} puntos!`, 'success');
        } else {
            show(result.message || 'No se pudo girar la rueda.', result.alreadyClaimed ? 'info' : 'error');
        }
    };

    const handleShowReferralLink = () => {
        triggerImpact();
        show(`Tu enlace: ${referralLink}`, 'info');
    };

    // --- COMPONENT: EXPERT HERO HUD ---
    const HeroHud = () => (
        <View style={styles.heroContainer}>
            {/* Background Mesh Gradient Simulation */}
            <LinearGradient
                colors={isDark ? ['#4F46E5', '#2196F3', '#2E1065'] : ['#6366F1', '#4FC3F7', '#4C1D95']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                locations={[0, 0.6, 1]}
                style={StyleSheet.absoluteFill}
            />
            {/* Top Row: Tier & Value */}
            <View style={styles.heroTopRow}>
                <View style={styles.tierChip}>
                    <Crown size={12} color="#FCD34D" fill="#FCD34D" />
                    <Text style={styles.tierChipText}>{currentTier?.label.toUpperCase()}</Text>
                </View>
                <View style={styles.valueContainer}>
                    <Text style={styles.valueLabel}>VALOR REAL</Text>
                    <Text style={styles.valueText}>${walletValueUSD}</Text>
                </View>
            </View>

            {/* Center Stage: Massive Points */}
            <View style={styles.heroScoreWrapper}>
                <Text style={styles.heroScore}>{points.toLocaleString()}</Text>
                <Text style={styles.heroScoreLabel}>PUNTOS DISPONIBLES</Text>
            </View>

            {/* Bottom: Progress Bar 3D */}
            {membershipTarget && (
                <View style={styles.progressSection}>
                    <View style={styles.progressRow}>
                        <Text style={styles.progressMeta}>{Math.floor(progress)}% completado</Text>
                        <Text style={styles.progressMeta}>{pointsToNext} pts para {membershipTarget.label}</Text>
                    </View>
                    <View style={styles.track3D}>
                        <Animated.View style={[styles.fill3D, { width: progressToNext.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]}>
                            <LinearGradient
                                colors={['#FBBF24', '#D97706']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={StyleSheet.absoluteFill}
                            />
                        </Animated.View>
                    </View>
                </View>
            )}
        </View>
    );

    // --- COMPONENT: CONTINUOUS TIER ROADMAP ---
    const ContinuousTierRoadmap = () => (
        <View style={styles.roadmapBox}>
            <Text style={styles.sectionHeaderLabel}>TU PROGRESO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roadmapScroll}>
                {/* The Continuous Line */}
                <View style={styles.roadmapLineBackground} />
                <Animated.View style={[styles.roadmapLineFill, {
                    width: Math.min((lifetimePoints / 100000) * (width * 1.5), width * 1.2) // Rough approximation for demo visual
                }]} />

                {MEMBERSHIP_TIERS.map((tier, index) => {
                    const isReached = lifetimePoints >= tier.minPoints;
                    const isCurrent = currentTier?.label === tier.label;
                    const isLocked = !isReached;

                    return (
                        <View key={tier.label} style={styles.nodeWrapper}>
                            {/* The Node */}
                            <View style={[
                                styles.nodeCircle,
                                isReached && styles.nodeReached,
                                isCurrent && styles.nodeCurrent,
                                isLocked && styles.nodeLocked
                            ]}>
                                {isCurrent ? <Star size={16} color="#fff" fill="#fff" /> :
                                    isReached ? <Check size={14} color="rgba(255,255,255,0.8)" /> :
                                        <Lock size={14} color="rgba(255,255,255,0.4)" />}
                            </View>

                            {/* The Label */}
                            <Text style={[styles.nodeLabel, isCurrent && styles.nodeLabelCurrent]}>{tier.label}</Text>
                            <Text style={styles.nodePoints}>{tier.minPoints > 0 ? `${tier.minPoints / 1000}k` : 'START'}</Text>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );

    // --- COMPONENT: GLASS ACTION CARDS ---
    const GlassActionCard = ({ title, subtitle, icon: Icon, color, onPress, disabled, buttonText }: any) => (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={onPress}
            disabled={disabled}
            style={[styles.glassCard, disabled && { opacity: 0.6 }]}
        >
            <View style={[styles.glassIconBox, { backgroundColor: `${color}20` }]}>
                <Icon size={24} color={color} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.glassTitle}>{title}</Text>
                <Text style={styles.glassSubtitle}>{subtitle}</Text>
            </View>
            <View style={[styles.glassButton, disabled && { backgroundColor: 'transparent', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                <Text style={[styles.glassButtonText, disabled && { color: '#94A3B8' }]}>{buttonText}</Text>
                {!disabled && <ChevronRight size={14} color="#fff" />}
            </View>
        </TouchableOpacity>
    );

    const HowItWorks = () => {
        const [expanded, setExpanded] = React.useState(false);
        
        return (
            <View style={styles.howItWorksCard}>
                <TouchableOpacity 
                    style={styles.howItWorksHeader} 
                    onPress={() => { triggerImpact(); setExpanded(!expanded); }}
                    activeOpacity={0.7}
                    accessible={true}
                    accessibilityLabel="Cómo funciona el sistema de puntos"
                    accessibilityHint="Toca para expandir o colapsar la explicación"
                >
                    <View style={styles.howItWorksIcon}>
                        <Zap size={18} color={isDark ? '#FCD34D' : '#B45309'} />
                    </View>
                    <Text style={styles.howItWorksTitle}>CÓMO FUNCIONA</Text>
                    <ChevronRight 
                        size={18} 
                        color={isDark ? '#94A3B8' : '#64748B'} 
                        style={{ marginLeft: 'auto', transform: [{ rotate: expanded ? '90deg' : '0deg' }] }} 
                    />
                </TouchableOpacity>

                {/* Quick Summary - Always visible */}
                <View style={styles.howItWorksSummary}>
                    <View style={styles.summaryItem}>
                        <Text style={styles.summaryValue}>${POINT_VALUE_USD.toFixed(2)}</Text>
                        <Text style={styles.summaryLabel}>por punto</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                        <Text style={styles.summaryValue}>1:1</Text>
                        <Text style={styles.summaryLabel}>$1 = 1 pt</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                        <Text style={styles.summaryValue}>{currentTier?.bonusMultiplier ? `+${Math.round(currentTier.bonusMultiplier * 100)}%` : '0%'}</Text>
                        <Text style={styles.summaryLabel}>bonus {currentTier?.label}</Text>
                    </View>
                </View>

                {expanded && (
                    <>
                        <View style={styles.howItWorksDivider} />
                        
                        {/* Golden Rule Section */}
                        <Text style={styles.howItWorksSectionTitle}>⚠️ REGLA DE ORO</Text>
                        <View style={styles.howItWorksRow}>
                            <View style={[styles.howItWorksIconBadge, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2' }]}>
                                <Lock size={14} color="#EF4444" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.howItWorksRowTitle}>Intransferibles</Text>
                                <Text style={styles.howItWorksText}>
                                    Los puntos se ganan individualmente frente al sistema (jugando, comprando, interactuando). No se pueden transferir a otros usuarios ni usarse para pagar comisiones.
                                </Text>
                            </View>
                        </View>

                        <View style={styles.howItWorksDivider} />

                        {/* Earning Section */}
                        <Text style={styles.howItWorksSectionTitle}>💰 GANAR PUNTOS</Text>
                        
                        <View style={styles.howItWorksRow}>
                            <View style={[styles.howItWorksIconBadge, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5' }]}>
                                <TrendingUp size={14} color="#10B981" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.howItWorksRowTitle}>Compras</Text>
                                <Text style={styles.howItWorksText}>
                                    1 punto por cada $1 pagado en efectivo. Si usás puntos para pagar, solo ganás puntos sobre el saldo restante.
                                </Text>
                            </View>
                        </View>

                        <View style={styles.howItWorksRow}>
                            <View style={[styles.howItWorksIconBadge, { backgroundColor: isDark ? 'rgba(79, 195, 247, 0.2)' : '#EDE9FE' }]}>
                                <Crown size={14} color="#4FC3F7" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.howItWorksRowTitle}>Bonus por Nivel</Text>
                                <Text style={styles.howItWorksText}>
                                    Tu nivel {currentTier?.label} te da {currentTier?.bonusMultiplier ? `+${Math.round(currentTier.bonusMultiplier * 100)}%` : 'puntos base'} extra en cada compra.
                                    {nextTier ? ` Próximo: ${nextTier.label} (+${Math.round((nextTier.bonusMultiplier || 0) * 100)}%).` : ''}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.howItWorksRow}>
                            <View style={[styles.howItWorksIconBadge, { backgroundColor: isDark ? 'rgba(249, 115, 22, 0.2)' : '#FFEDD5' }]}>
                                <Gamepad2 size={14} color="#F97316" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.howItWorksRowTitle}>Juegos</Text>
                                <Text style={styles.howItWorksText}>
                                    Jugá y ganá monedas. Convertí {conversionRate} monedas en 1 punto real.
                                </Text>
                            </View>
                        </View>

                        <View style={styles.howItWorksRow}>
                            <View style={[styles.howItWorksIconBadge, { backgroundColor: isDark ? 'rgba(6, 182, 212, 0.2)' : '#CFFAFE' }]}>
                                <UserPlus size={14} color="#06B6D4" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.howItWorksRowTitle}>Referidos</Text>
                                <Text style={styles.howItWorksText}>
                                    Compartí tu código "{referralCode}" y ganá cuando tus amigos se registran y compran.
                                    {referralSummary?.registrations ? ` Ya referiste a ${referralSummary.registrations} personas.` : ''}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.howItWorksRow}>
                            <View style={[styles.howItWorksIconBadge, { backgroundColor: isDark ? 'rgba(236, 72, 153, 0.2)' : '#FCE7F3' }]}>
                                <Flame size={14} color="#EC4899" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.howItWorksRowTitle}>Racha Diaria</Text>
                                <Text style={styles.howItWorksText}>
                                    Iniciá sesión todos los días para mantener tu racha y ganar puntos extra.
                                </Text>
                            </View>
                        </View>

                        <View style={styles.howItWorksDivider} />

                        {/* Spending Section */}
                        <Text style={styles.howItWorksSectionTitle}>🎯 USAR PUNTOS</Text>

                        <View style={styles.howItWorksRow}>
                            <View style={[styles.howItWorksIconBadge, { backgroundColor: isDark ? 'rgba(251, 191, 36, 0.2)' : '#FEF3C7' }]}>
                                <Coins size={14} color="#F59E0B" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.howItWorksRowTitle}>Descuentos en Checkout</Text>
                                <Text style={styles.howItWorksText}>
                                    Canjeá puntos por descuentos al momento de pagar. Cada punto vale ${POINT_VALUE_USD.toFixed(2)}.
                                </Text>
                            </View>
                        </View>

                        <View style={styles.howItWorksDivider} />

                        {/* Quick reference table */}
                        <Text style={styles.howItWorksSubTitle}>Tiers de Canje</Text>
                        <View style={styles.discountTiersContainer}>
                            {DISCOUNT_TIERS.slice(0, 4).map((tier, idx) => (
                                <View key={idx} style={[styles.discountTierItem, idx === 0 && points >= tier.minPoints && styles.discountTierItemActive]}>
                                    <Text style={[styles.discountTierPoints, idx === 0 && points >= tier.minPoints && styles.discountTierActive]}>{tier.minPoints} pts</Text>
                                    <Text style={[styles.discountTierValue, idx === 0 && points >= tier.minPoints && styles.discountTierActive]}>+{tier.bonusMultiplier * 100}%</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                {!expanded && (
                    <TouchableOpacity onPress={() => { triggerImpact(); setExpanded(true); }} activeOpacity={0.7}>
                        <Text style={styles.howItWorksTapToExpand}>Toca para ver más detalles</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <HeroHud />

            <ContinuousTierRoadmap />

            <View style={styles.contentPadding}>
                {/* QUICK ACTIONS */}
                <Text style={styles.sectionHeaderLabel}>ACCIONES RÁPIDAS</Text>
                <View style={{ gap: 12 }}>
                    <GlassActionCard
                        title="Racha Diaria"
                        subtitle={`${challengeProgress.loginStreak} días consecutivos`}
                        icon={Flame}
                        color="#F97316"
                        buttonText={alreadyClaimedDaily ? 'Hecho' : 'Reclamar'}
                        disabled={alreadyClaimedDaily}
                        onPress={handleClaimStreak}
                    />
                    <GlassActionCard
                        title="Ruleta de la Suerte"
                        subtitle={wheelAvailable ? "Giro disponible" : "Vuelve mañana"}
                        icon={CircleDollarSign}
                        color="#D97706"
                        buttonText={wheelAvailable ? "Girar" : "Esperar"}
                        disabled={!wheelAvailable}
                        onPress={handleSpinWheel}
                    />
                </View>

                {/* HOW IT WORKS */}
                <View style={{ marginTop: 24 }}>
                    <HowItWorks />
                </View>

                {/* QUARTERLY MISSION WIDGET */}
                {quarterlyMission && (
                    <View style={[styles.missionCard, quarterlyMission.claimed && styles.missionCardCompleted]}>
                        <View style={styles.missionHeader}>
                            <View style={[styles.missionIconBox, quarterlyMission.claimed && { backgroundColor: '#059669' }]}>
                                <Trophy size={20} color="#FCD34D" fill="#FCD34D" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.missionTitle}>MISIÓN TRIMESTRAL</Text>
                                <Text style={styles.missionSubtitle}>
                                    {quarterlyMission.claimed ? '¡Completada! 🎉' : 'Gana +150 pts al completar'}
                                </Text>
                            </View>
                            <View style={[styles.missionBadge, quarterlyMission.claimed && { backgroundColor: '#059669' }]}>
                                <Text style={styles.missionBadgeText}>
                                    {quarterlyMission.claimed ? '✔' : `${quarterlyMission.reward} pts`}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.missionProgressBox}>
                            <View style={styles.missionMetaRow}>
                                <Text style={styles.missionProgressText}>{Math.min(quarterlyMission.purchasesCurrent, quarterlyMission.purchasesTarget)} / {quarterlyMission.purchasesTarget} Compras</Text>
                                <Text style={styles.missionProgressPercent}>{Math.round((quarterlyMission.purchasesCurrent / quarterlyMission.purchasesTarget) * 100)}%</Text>
                            </View>
                            <View style={styles.missionTrack}>
                                <View style={[styles.missionFill, quarterlyMission.claimed && { backgroundColor: '#059669' }, { width: `${Math.min((quarterlyMission.purchasesCurrent / quarterlyMission.purchasesTarget) * 100, 100)}%` }]} />
                            </View>
                            <Text style={styles.missionHint}>
                                {quarterlyMission.claimed 
                                    ? `+${quarterlyMission.reward} pts agregados a tu cuenta` 
                                    : 'Realiza 3 compras este trimestre para desbloquear.'}
                            </Text>
                        </View>
                    </View>
                )}

                {/* DAILY CHALLENGES WIDGET */}
                <View style={{ marginTop: 24 }}>
                    <DailyChallenges />
                </View>

                {/* BENEFITS SCROLL */}
                <Text style={[styles.sectionHeaderLabel, { marginTop: 24 }]}>BENEFICIOS ACTIVOS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }}>
                    {currentTier?.perks?.map((perk: string, i: number) => (
                        <View key={i} style={styles.benefitPill}>
                            <Sparkles size={14} color="#4FC3F7" />
                            <Text style={styles.benefitText}>{perk}</Text>
                        </View>
                    ))}
                    <View style={[styles.benefitPill, styles.benefitPillLocked]}>
                        <Lock size={14} color="#94A3B8" />
                        <Text style={styles.benefitTextLocked}>Más en {nextTier?.label || 'Max'}</Text>
                    </View>
                </ScrollView>
            </View>
        </View>
    );
}

const getStyles = (isDark: boolean, insets: { top: number; bottom: number }) => {
    // --- CONSTANTS ---
    const roadmapPadding = 24;
    const roadmapTopPadding = 12; // Add breathing room for scale/shadow
    const nodeWidth = width / 4.5; // Responsive node width
    const nodeRadius = 24; // 48px / 2

    // Line alignment math: 
    // Start = padding + half node width
    const lineOffset = roadmapPadding + (nodeWidth / 2);
    // Top = Padding Top + Node Center (Radius) - Half Stroke
    const lineTop = roadmapTopPadding + nodeRadius - 2;

    const HEADER_HEIGHT = 280;

    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors(isDark).bg, // Slate 900 vs Slate 50
        },
        contentPadding: {
            paddingHorizontal: 24,
            paddingBottom: 40 + insets.bottom, // Add bottom safe area
        },

        // --- HERO HUD ---
        heroContainer: {
            width: '100%',
            height: HEADER_HEIGHT + insets.top, // Dynamic height
            padding: 24,
            justifyContent: 'flex-end',
            paddingBottom: 40,
            position: 'relative',
            borderBottomLeftRadius: 32,
            borderBottomRightRadius: 32,
            overflow: 'hidden',
        },
        heroTopRow: {
            position: 'absolute',
            top: 20 + insets.top, // SAFE AREA FIX
            left: 24,
            right: 24,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
        },
        tierChip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(0,0,0,0.4)',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: Radius.full,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)',
        },
        tierChipText: {
            color: '#FCD34D',
            fontWeight: '800',
            fontSize: 12,
            letterSpacing: 1,
        },
        valueContainer: { alignItems: 'flex-end' },
        valueLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 2 },
        valueText: { color: '#fff', fontSize: 18, fontWeight: '700' },

        heroScoreWrapper: { alignItems: 'center', marginBottom: 24, marginTop: 40 },
        heroScore: {
            fontSize: 64, // SCALE TYPOGRAPHY
            fontWeight: '900',
            color: '#fff',
            letterSpacing: -2,
            textShadowColor: 'rgba(0,0,0,0.3)',
            textShadowOffset: { width: 0, height: 4 },
            textShadowRadius: 8,
        },
        heroScoreLabel: {
            color: 'rgba(255,255,255,0.8)',
            fontSize: 12,
            fontWeight: '600',
            letterSpacing: 4,
            marginTop: -4,
        },

        progressSection: {},
        progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
        progressMeta: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
        track3D: {
            height: 10,
            backgroundColor: 'rgba(0,0,0,0.4)',
            borderRadius: Radius.sm,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)',
        },
        fill3D: { height: '100%' },

        // --- CONTINUOUS ROADMAP ---
        roadmapBox: {
            marginTop: 24,
            marginBottom: 24,
        },
        sectionHeaderLabel: {
            paddingHorizontal: 24,
            fontSize: 11,
            fontWeight: '700',
            color: isDark ? '#94A3B8' : '#64748B',
            letterSpacing: 1.5,
            marginBottom: 16,
        },
        roadmapScroll: {
            paddingHorizontal: roadmapPadding,
            paddingTop: roadmapTopPadding, // Prevent clipping
            paddingBottom: 20,
        },
        roadmapLineBackground: {
            position: 'absolute',
            top: lineTop,
            left: lineOffset,
            right: lineOffset,
            height: 4,
            borderRadius: Radius.sm,
            backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
            zIndex: -1,
        },
        roadmapLineFill: {
            position: 'absolute',
            top: lineTop,
            left: lineOffset,
            height: 4,
            borderRadius: Radius.sm,
            backgroundColor: '#2196F3',
            zIndex: -1,
        },
        nodeWrapper: {
            alignItems: 'center',
            width: nodeWidth,
            marginRight: 0, // No margin right, spacing handled by width
        },
        nodeCircle: {
            width: nodeRadius * 2,
            height: nodeRadius * 2,
            borderRadius: nodeRadius,
            backgroundColor: isDark ? '#1E293B' : '#FFF',
            borderWidth: 4,
            borderColor: isDark ? '#09090B' : '#FAFAFA',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 8,
            ...glassShadow(isDark),shadowOffset: { width: 0, height: 2 },
            elevation: 2,
        },
        nodeReached: { backgroundColor: '#2196F3' },
        nodeCurrent: {
            backgroundColor: '#F59E0B',
            transform: [{ scale: 1.1 }],
            borderColor: '#F59E0B',
            borderWidth: 0,
            ...glassShadow(isDark),},
        nodeLocked: { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
        nodeLabel: { fontSize: 10, fontWeight: '700', color: isDark ? '#FFF' : '#1E293B', letterSpacing: 0.5 },
        nodeLabelCurrent: { color: '#F59E0B' },
        nodePoints: { fontSize: 9, color: isDark ? '#64748B' : '#94A3B8', marginTop: 2 },

        // --- GLASS CARDS ---
        glassCard: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.7)', // More translucent
            padding: 16,
            borderRadius: Radius.xl,
            gap: 16,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.4)',

            // Subtle shadow
            ...glassShadow(isDark),
        },
        glassIconBox: {
            width: 52,
            height: 52,
            borderRadius: Radius.lg,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)'
        },
        glassTitle: { fontSize: 16, fontWeight: '700', color: isDark ? '#F8FAFC' : '#1E293B' },
        glassSubtitle: { fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', marginTop: 2 },
        glassButton: {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.8)' : '#F1F5F9',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: Radius.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'transparent'
        },
        glassButtonText: { color: isDark ? '#E2E8F0' : '#334155', fontSize: 12, fontWeight: '700' },

        // --- BENEFITS ---
        benefitPill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: isDark ? 'rgba(33, 150, 243, 0.1)' : '#FAFAFA',
            borderRadius: Radius.full,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(33, 150, 243, 0.2)' : '#EDE9FE',
        },
        benefitText: { fontSize: 13, fontWeight: '600', color: isDark ? '#E9D5FF' : '#2196F3' },
        benefitPillLocked: { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: 'transparent' },
        benefitTextLocked: { color: '#94A3B8' },

        // --- MISSION CARD ---
        missionCard: {
            marginTop: 24,
            backgroundColor: isDark ? '#1E293B' : '#FFF',
            borderRadius: Radius.xl,
            padding: 2, // Gradient border effect simulation or just padding
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: isDark ? '#334155' : '#E2E8F0',
            ...glassShadow(isDark),shadowOffset: { width: 0, height: 4 },
            elevation: 3,
        },
        missionCardCompleted: {
            borderColor: '#059669',
            borderWidth: 2,
        },
        missionHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 16,
            gap: 12,
            backgroundColor: isDark ? '#1E293B' : '#FFF',
        },
        missionIconBox: {
            width: 40, height: 40, borderRadius: Radius.md, backgroundColor: 'rgba(252, 211, 77, 0.15)',
            justifyContent: 'center', alignItems: 'center'
        },
        missionTitle: { fontSize: 13, fontWeight: '800', color: isDark ? '#FFF' : '#1E293B', letterSpacing: 0.5 },
        missionSubtitle: { fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' },
        missionBadge: { backgroundColor: '#FCD34D', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
        missionBadgeText: { fontSize: 11, fontWeight: '800', color: '#78350F' },

        missionProgressBox: {
            padding: 16,
            paddingTop: 0,
            backgroundColor: isDark ? '#1E293B' : '#FFF',
        },
        missionMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
        missionProgressText: { fontSize: 11, fontWeight: '600', color: isDark ? '#CBD5E1' : '#475569' },
        missionProgressPercent: { fontSize: 11, fontWeight: '700', color: '#FCD34D' },
        missionTrack: { height: 6, backgroundColor: isDark ? '#334155' : '#E2E8F0', borderRadius: Radius.sm, overflow: 'hidden', marginBottom: 8 },
        missionFill: { height: '100%', backgroundColor: '#FCD34D' },
        missionHint: { fontSize: 10, color: isDark ? '#64748B' : '#94A3B8', fontStyle: 'italic' },

        // --- HOW IT WORKS ---
        howItWorksCard: {
            marginTop: 0,
            backgroundColor: colors(isDark).glass,
            borderRadius: Radius.xl,
            padding: 16,
            borderWidth: 1,
            borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        howItWorksHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
        },
        howItWorksIcon: {
            width: 32,
            height: 32,
            borderRadius: Radius.md,
            backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
            alignItems: 'center',
            justifyContent: 'center',
        },
        howItWorksTitle: {
            fontSize: 12,
            fontWeight: '800',
            letterSpacing: 1.2,
            color: colors(isDark).text,
        },
        howItWorksSummary: {
            flexDirection: 'row',
            justifyContent: 'space-around',
            alignItems: 'center',
            paddingVertical: 12,
            backgroundColor: isDark ? 'rgba(99, 102, 241, 0.1)' : '#FAFAFA',
            borderRadius: Radius.md,
            marginBottom: 8,
        },
        summaryItem: {
            alignItems: 'center',
        },
        summaryValue: {
            fontSize: 18,
            fontWeight: '800',
            color: isDark ? '#A5B4FC' : '#6366F1',
        },
        summaryLabel: {
            fontSize: 10,
            fontWeight: '600',
            color: isDark ? '#94A3B8' : '#64748B',
            marginTop: 2,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        summaryDivider: {
            width: 1,
            height: 28,
            backgroundColor: isDark ? '#334155' : '#E2E8F0',
        },
        howItWorksSectionTitle: {
            fontSize: 11,
            fontWeight: '800',
            letterSpacing: 1,
            color: isDark ? '#94A3B8' : '#64748B',
            marginBottom: 12,
            marginTop: 4,
        },
        howItWorksRow: {
            flexDirection: 'row',
            gap: 12,
            alignItems: 'flex-start',
            marginBottom: 14,
        },
        howItWorksIconBadge: {
            width: 32,
            height: 32,
            borderRadius: Radius.md,
            alignItems: 'center',
            justifyContent: 'center',
        },
        howItWorksRowTitle: {
            fontSize: 14,
            fontWeight: '700',
            color: colors(isDark).text,
            marginBottom: 2,
        },
        howItWorksText: {
            flex: 1,
            fontSize: 13,
            lineHeight: 18,
            color: isDark ? '#D1D5DB' : '#475569',
        },
        howItWorksDivider: {
            height: 1,
            backgroundColor: isDark ? '#334155' : '#E2E8F0',
            marginVertical: 12,
        },
        howItWorksSubTitle: {
            fontSize: 13,
            fontWeight: '700',
            color: colors(isDark).text,
            marginBottom: 10,
        },
        howItWorksSmallText: {
            fontSize: 12,
            lineHeight: 16,
            color: isDark ? '#9CA3AF' : '#64748B',
        },
        howItWorksTapToExpand: {
            fontSize: 12,
            color: isDark ? '#6366F1' : '#6366F1',
            textAlign: 'center',
            marginTop: 4,
            fontWeight: '500',
        },
        discountTiersContainer: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
        },
        discountTierItem: {
            backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: Radius.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        discountTierItemActive: {
            backgroundColor: isDark ? 'rgba(33, 150, 243, 0.2)' : '#EDE9FE',
            borderWidth: 1,
            borderColor: '#4FC3F7',
        },
        discountTierPoints: {
            fontSize: 12,
            fontWeight: '600',
            color: isDark ? '#94A3B8' : '#64748B',
        },
        discountTierValue: {
            fontSize: 12,
            fontWeight: '700',
            color: isDark ? '#D1D5DB' : '#334155',
        },
        discountTierActive: {
            color: '#4FC3F7',
        },
    });
};
