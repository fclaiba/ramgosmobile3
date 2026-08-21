import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation } from 'convex/react';
import { Music2, MapPin, Hash } from 'lucide-react-native';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { Radius } from '../../theme/tokens';

/** Ver `storySticker` en `convex/schema.ts` — mismo shape. */
export type StickerData =
    | { type: 'text'; id: string; x: number; y: number; rotation?: number; scale?: number; content: string; color?: string }
    | { type: 'poll'; id: string; x: number; y: number; rotation?: number; scale?: number; question: string; options: string[] }
    | { type: 'question'; id: string; x: number; y: number; rotation?: number; scale?: number; prompt: string }
    | { type: 'countdown'; id: string; x: number; y: number; rotation?: number; scale?: number; title: string; endsAt: string }
    | { type: 'slider'; id: string; x: number; y: number; rotation?: number; scale?: number; emoji: string; question?: string }
    | { type: 'mention'; id: string; x: number; y: number; rotation?: number; scale?: number; userId: string; username: string }
    | { type: 'location'; id: string; x: number; y: number; rotation?: number; scale?: number; placeId?: string; name: string; address?: string }
    | { type: 'hashtag'; id: string; x: number; y: number; rotation?: number; scale?: number; tag: string }
    | { type: 'music'; id: string; x: number; y: number; rotation?: number; scale?: number; audioTrackId: string; trackName?: string };

/** Posición absoluta común a todos los stickers — `x`/`y` normalizados 0-1. */
const wrapperStyle = (s: StickerData) => ({
    position: 'absolute' as const,
    left: `${s.x * 100}%` as any,
    top: `${s.y * 100}%` as any,
    transform: [{ rotate: `${s.rotation ?? 0}deg` }, { scale: s.scale ?? 1 }],
});

const CountdownSticker = ({ s }: { s: Extract<StickerData, { type: 'countdown' }> }) => {
    const [remaining, setRemaining] = useState(() => Math.max(0, Date.parse(s.endsAt) - Date.now()));
    useEffect(() => {
        const t = setInterval(() => setRemaining(Math.max(0, Date.parse(s.endsAt) - Date.now())), 1000);
        return () => clearInterval(t);
    }, [s.endsAt]);
    const totalSec = Math.floor(remaining / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const sec = totalSec % 60;
    const label = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
    return (
        <View style={[styles.chip, styles.countdownChip]}>
            <Text style={styles.countdownTitle}>{s.title}</Text>
            <Text style={styles.countdownValue}>{remaining > 0 ? label : 'Terminó'}</Text>
        </View>
    );
};

interface StoryStickerProps {
    sticker: StickerData;
    storyId: string;
    /** El autor no responde su propio poll/question/slider — ve el chip
     *  "nada más" (los resultados agregados quedan para una vista aparte,
     *  no sobre-construida en este pase). */
    isAuthor: boolean;
    onPause?: () => void;
    onResume?: () => void;
}

export const StorySticker = ({ sticker: s, storyId, isAuthor, onPause, onResume }: StoryStickerProps) => {
    const navigation = useNavigation<any>();
    const { sessionToken } = useAuth();
    const respond = useMutation(api.social.respondToStorySticker);
    const [myAnswer, setMyAnswer] = useState<number | string | null>(null);

    switch (s.type) {
        case 'text':
            return (
                <View style={wrapperStyle(s) as any}>
                    <Text style={[styles.freeText, { color: s.color || '#fff' }]}>{s.content}</Text>
                </View>
            );

        case 'poll':
            return (
                <View style={wrapperStyle(s) as any}>
                    <View style={styles.pollCard}>
                        <Text style={styles.pollQuestion}>{s.question}</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {s.options.map((opt, i) => (
                                <TouchableOpacity
                                    key={i}
                                    disabled={isAuthor || myAnswer !== null}
                                    style={[styles.pollOption, myAnswer === i && styles.pollOptionSelected]}
                                    onPress={() => {
                                        if (!sessionToken) return;
                                        setMyAnswer(i);
                                        respond({ sessionToken, storyId: storyId as any, stickerId: s.id, type: 'poll', optionIndex: i }).catch(() => {});
                                    }}
                                >
                                    <Text style={styles.pollOptionText}>{opt}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>
            );

        case 'question':
            return (
                <View style={wrapperStyle(s) as any}>
                    <View style={styles.questionCard}>
                        <Text style={styles.questionPrompt}>{s.prompt}</Text>
                        {!isAuthor && (
                            <TouchableOpacity
                                style={styles.questionInputBtn}
                                onPress={() => {
                                    // Composer mínimo: usa el mismo Alert.prompt-like flujo
                                    // sería ideal, pero RN no lo tiene nativo cross-platform
                                    // — se resuelve con un input inline manejado por el
                                    // propio StoryViewer sería más código; para no inflar
                                    // más esto, responde con un texto fijo de "👋" como
                                    // acuse rápido y deja la respuesta larga para el DM
                                    // normal (el input de reply ya existe en el footer).
                                    if (!sessionToken || myAnswer !== null) return;
                                    setMyAnswer('sent');
                                    respond({ sessionToken, storyId: storyId as any, stickerId: s.id, type: 'question', text: '👋' }).catch(() => {});
                                }}
                            >
                                <Text style={styles.questionInputText}>{myAnswer ? 'Respondido ✓' : 'Responder'}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            );

        case 'countdown':
            return <View style={wrapperStyle(s) as any}><CountdownSticker s={s} /></View>;

        case 'slider':
            return (
                <View style={wrapperStyle(s) as any}>
                    <View style={styles.sliderCard}>
                        {s.question && <Text style={styles.pollQuestion}>{s.question}</Text>}
                        <TouchableOpacity
                            disabled={isAuthor || myAnswer !== null}
                            style={styles.sliderEmojiBtn}
                            onPress={() => {
                                if (!sessionToken) return;
                                setMyAnswer(1);
                                respond({ sessionToken, storyId: storyId as any, stickerId: s.id, type: 'slider', sliderValue: 1 }).catch(() => {});
                            }}
                        >
                            <Text style={styles.sliderEmoji}>{myAnswer !== null ? '✅' : s.emoji}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );

        case 'mention':
            return (
                <View style={wrapperStyle(s) as any}>
                    <TouchableOpacity
                        style={styles.chip}
                        onPress={() => navigation.navigate('CommercialProfile', { userId: s.userId })}
                    >
                        <Text style={styles.chipText}>@{s.username}</Text>
                    </TouchableOpacity>
                </View>
            );

        case 'location':
            return (
                <View style={wrapperStyle(s) as any}>
                    <View style={styles.chip}>
                        <MapPin size={12} color="#fff" />
                        <Text style={styles.chipText}>{s.name}</Text>
                    </View>
                </View>
            );

        case 'hashtag':
            return (
                <View style={wrapperStyle(s) as any}>
                    <TouchableOpacity style={styles.chip} onPress={() => navigation.navigate('HashtagFeed', { tag: s.tag })}>
                        <Hash size={12} color="#fff" />
                        <Text style={styles.chipText}>{s.tag}</Text>
                    </TouchableOpacity>
                </View>
            );

        case 'music':
            return (
                <View style={wrapperStyle(s) as any}>
                    <View style={styles.chip}>
                        <Music2 size={12} color="#fff" />
                        <Text style={styles.chipText} numberOfLines={1}>{s.trackName || 'Sonido'}</Text>
                    </View>
                </View>
            );

        default:
            return null;
    }
};

const styles = StyleSheet.create({
    freeText: {
        fontSize: 22,
        fontWeight: '800',
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
        maxWidth: 260,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: Radius.full,
        backgroundColor: 'rgba(0,0,0,0.45)',
        maxWidth: 220,
    },
    chipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    pollCard: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: Radius.lg, padding: 14, gap: 10, minWidth: 220 },
    pollQuestion: { color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' },
    pollOption: { flex: 1, borderRadius: Radius.full, borderWidth: 1, borderColor: '#fff', paddingVertical: 8, alignItems: 'center' },
    pollOptionSelected: { backgroundColor: '#fff' },
    pollOptionText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    questionCard: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: Radius.lg, padding: 14, gap: 10, minWidth: 220, alignItems: 'center' },
    questionPrompt: { color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' },
    questionInputBtn: { backgroundColor: '#fff', borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 8 },
    questionInputText: { color: '#000', fontWeight: '700', fontSize: 13 },
    countdownChip: { flexDirection: 'column', alignItems: 'center', gap: 2, paddingHorizontal: 16, paddingVertical: 10 },
    countdownTitle: { color: '#fff', fontSize: 12, fontWeight: '600' },
    countdownValue: { color: '#fff', fontSize: 20, fontWeight: '800' },
    sliderCard: { alignItems: 'center', gap: 10 },
    sliderEmojiBtn: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    sliderEmoji: { fontSize: 26 },
});
