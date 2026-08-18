import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Heart, X, Users, MessageCircle } from 'lucide-react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { colors, Radius } from '../../theme/tokens';

const SWIPE_THRESHOLD = 120;

/**
 * "Tinder interno" para eventos (Sprint 5 del doc, diferido al final por
 * decisión del usuario). Opt-in explícito y gateado por entrada confirmada
 * — el backend (`eventMatching.ts`) ya rechaza el opt-in sin reserva.
 */
export default function EventMatchingScreen({ route, navigation }: any) {
    const eventId = route?.params?.eventId;
    const insets = useSafeAreaInsets();
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const [intent, setIntent] = useState<'dating' | 'networking'>('networking');
    const [matchModal, setMatchModal] = useState<{ displayName: string; chatId?: string } | null>(null);

    const myOptIn = useQuery(api.social.eventMatching.getMyOptIn, sessionToken && eventId ? { sessionToken, eventId } : 'skip');
    const candidates = useQuery(
        api.social.eventMatching.getMatchCandidates,
        sessionToken && eventId && myOptIn?.enabled ? { sessionToken, eventId, limit: 20 } : 'skip',
    );
    const myMatches = useQuery(
        api.social.eventMatching.getMyMatches,
        sessionToken && eventId && myOptIn?.enabled ? { sessionToken, eventId } : 'skip',
    );

    const setOptIn = useMutation(api.social.eventMatching.setMatchOptIn);
    const swipe = useMutation(api.social.eventMatching.swipe);

    const [index, setIndex] = useState(0);
    const current = candidates?.[index];

    const translateX = useSharedValue(0);

    const handleSwipe = async (direction: 'like' | 'pass') => {
        if (!sessionToken || !current) return;
        const targetUserId = current.userId;
        const displayName = current.displayName;
        setIndex((i) => i + 1);
        translateX.value = 0;
        try {
            const result = await swipe({ sessionToken, eventId, targetUserId, direction });
            if (result.matched) {
                setMatchModal({ displayName, chatId: result.chatId });
            }
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo procesar el swipe', 'error');
        }
    };

    const cardStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { rotate: `${translateX.value / 20}deg` },
        ],
    }));

    const pan = Gesture.Pan()
        .onUpdate((e) => {
            translateX.value = e.translationX;
        })
        .onEnd((e) => {
            if (e.translationX > SWIPE_THRESHOLD) {
                translateX.value = withSpring(500);
                runOnJS(handleSwipe)('like');
            } else if (e.translationX < -SWIPE_THRESHOLD) {
                translateX.value = withSpring(-500);
                runOnJS(handleSwipe)('pass');
            } else {
                translateX.value = withSpring(0);
            }
        });

    const handleActivate = async () => {
        if (!sessionToken) return;
        try {
            await setOptIn({ sessionToken, eventId, enabled: true, intent });
            show('Matching activado 💕', 'success');
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo activar el matching', 'error');
        }
    };

    const handleDeactivate = async () => {
        if (!sessionToken) return;
        await setOptIn({ sessionToken, eventId, enabled: false, intent }).catch(() => {});
    };

    if (myOptIn === undefined) {
        return (
            <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
                <ActivityIndicator color={colors(isDark).primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <ArrowLeft size={22} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Matching del evento</Text>
                <View style={{ width: 22 }} />
            </View>

            {!myOptIn?.enabled ? (
                <View style={styles.optInScreen}>
                    <Heart size={48} color="#EC4899" />
                    <Text style={styles.optInTitle}>Activá el matching</Text>
                    <Text style={styles.optInSubtitle}>
                        Sólo se ve entre asistentes con entrada confirmada. Totalmente opt-in — podés apagarlo cuando quieras.
                    </Text>
                    <View style={styles.intentRow}>
                        <TouchableOpacity
                            style={[styles.intentChip, intent === 'networking' && styles.intentChipActive]}
                            onPress={() => setIntent('networking')}
                        >
                            <Text style={[styles.intentChipText, intent === 'networking' && styles.intentChipTextActive]}>
                                Amistad / Networking
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.intentChip, intent === 'dating' && styles.intentChipActive]}
                            onPress={() => setIntent('dating')}
                        >
                            <Text style={[styles.intentChipText, intent === 'dating' && styles.intentChipTextActive]}>
                                Socio-afectivo
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.activateBtn} onPress={handleActivate}>
                        <Text style={styles.activateBtnText}>Activar matching</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <>
                    <View style={styles.deck}>
                        {candidates === undefined ? (
                            <ActivityIndicator color={colors(isDark).primary} />
                        ) : !current ? (
                            <View style={styles.center}>
                                <Users size={40} color={isDark ? '#4B5563' : '#D1D5DB'} />
                                <Text style={styles.emptyText}>No hay más gente para conocer por ahora.</Text>
                            </View>
                        ) : (
                            <GestureDetector gesture={pan}>
                                <Animated.View style={[styles.card, cardStyle]}>
                                    <Avatar style={styles.cardAvatar}>
                                        <AvatarImage src={current.avatar} />
                                        <AvatarFallback>{current.displayName?.[0] ?? '?'}</AvatarFallback>
                                    </Avatar>
                                    <Text style={styles.cardName}>{current.displayName}</Text>
                                    {current.bio ? <Text style={styles.cardBio}>{current.bio}</Text> : null}
                                </Animated.View>
                            </GestureDetector>
                        )}
                    </View>

                    {current && (
                        <View style={styles.actionsRow}>
                            <TouchableOpacity style={[styles.swipeBtn, styles.passBtn]} onPress={() => handleSwipe('pass')}>
                                <X size={28} color="#EF4444" />
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.swipeBtn, styles.likeBtn]} onPress={() => handleSwipe('like')}>
                                <Heart size={28} color="#fff" fill="#fff" />
                            </TouchableOpacity>
                        </View>
                    )}

                    <TouchableOpacity onPress={handleDeactivate} style={styles.deactivateLink}>
                        <Text style={styles.deactivateLinkText}>Desactivar matching para este evento</Text>
                    </TouchableOpacity>

                    {(myMatches?.length ?? 0) > 0 && (
                        <View style={styles.matchesBar}>
                            <Text style={styles.matchesBarTitle}>Tus matches ({myMatches!.length})</Text>
                            {myMatches!.slice(0, 5).map((m: any) => (
                                <TouchableOpacity
                                    key={m.userId}
                                    style={styles.matchChip}
                                    onPress={() => m.chatId && navigation.navigate('Chat', { chatId: m.chatId })}
                                >
                                    <MessageCircle size={14} color={colors(isDark).primary} />
                                    <Text style={styles.matchChipText}>{m.displayName}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </>
            )}

            {matchModal && (
                <View style={styles.matchOverlay}>
                    <Heart size={64} color="#EC4899" fill="#EC4899" />
                    <Text style={styles.matchOverlayTitle}>¡Match!</Text>
                    <Text style={styles.matchOverlaySubtitle}>Vos y {matchModal.displayName} se gustaron</Text>
                    <TouchableOpacity
                        style={styles.matchOverlayBtn}
                        onPress={() => {
                            const chatId = matchModal.chatId;
                            setMatchModal(null);
                            if (chatId) navigation.navigate('Chat', { chatId });
                        }}
                    >
                        <Text style={styles.matchOverlayBtnText}>Enviar mensaje</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setMatchModal(null)}>
                        <Text style={styles.matchOverlayDismiss}>Seguir mirando</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: isDark ? '#000' : '#fff' },
        center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
        iconBtn: { padding: 4 },
        headerTitle: { fontSize: 16, fontWeight: '700', color: isDark ? '#fff' : '#111827' },
        optInScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
        optInTitle: { fontSize: 20, fontWeight: '800', color: isDark ? '#fff' : '#111827' },
        optInSubtitle: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center' },
        intentRow: { flexDirection: 'row', gap: 8 },
        intentChip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: Radius.md, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB' },
        intentChipActive: { backgroundColor: '#EC4899', borderColor: '#EC4899' },
        intentChipText: { fontSize: 13, color: isDark ? '#D1D5DB' : '#374151', fontWeight: '600' },
        intentChipTextActive: { color: '#fff' },
        activateBtn: { marginTop: 8, backgroundColor: '#EC4899', borderRadius: Radius.md, paddingVertical: 14, paddingHorizontal: 32 },
        activateBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
        deck: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
        card: {
            width: '100%',
            aspectRatio: 0.75,
            borderRadius: Radius.xl,
            backgroundColor: isDark ? '#18181B' : '#F9FAFB',
            borderWidth: 1,
            borderColor: isDark ? '#27272A' : '#E5E7EB',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
        },
        cardAvatar: { width: 120, height: 120 },
        cardName: { fontSize: 20, fontWeight: '800', color: isDark ? '#fff' : '#111827' },
        cardBio: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center' },
        actionsRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingVertical: 16 },
        swipeBtn: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
        passBtn: { backgroundColor: isDark ? '#18181B' : '#F3F4F6', borderWidth: 2, borderColor: '#EF4444' },
        likeBtn: { backgroundColor: '#EC4899' },
        deactivateLink: { alignItems: 'center', paddingBottom: 12 },
        deactivateLinkText: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280' },
        matchesBar: { paddingHorizontal: 16, paddingBottom: 16, gap: 6 },
        matchesBarTitle: { fontSize: 12, fontWeight: '700', color: isDark ? '#9CA3AF' : '#6B7280', marginBottom: 4 },
        matchChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
        matchChipText: { fontSize: 13, color: isDark ? '#fff' : '#111827' },
        emptyText: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center' },
        matchOverlay: {
            ...StyleSheet.absoluteFill,
            backgroundColor: 'rgba(0,0,0,0.85)',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            paddingHorizontal: 32,
        },
        matchOverlayTitle: { fontSize: 28, fontWeight: '900', color: '#fff' },
        matchOverlaySubtitle: { fontSize: 15, color: '#D1D5DB', textAlign: 'center' },
        matchOverlayBtn: { marginTop: 16, backgroundColor: '#EC4899', borderRadius: Radius.md, paddingVertical: 14, paddingHorizontal: 32 },
        matchOverlayBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
        matchOverlayDismiss: { marginTop: 12, color: '#9CA3AF', fontSize: 13 },
    });
