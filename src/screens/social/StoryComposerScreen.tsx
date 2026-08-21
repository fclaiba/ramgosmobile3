import React, { useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Image,
    ActivityIndicator,
    FlatList,
    Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery } from 'convex/react';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
    X,
    RotateCcw,
    Image as ImageIcon,
    Type,
    BarChart3,
    HelpCircle,
    Timer,
    SlidersHorizontal,
    AtSign,
    MapPin,
    Hash,
    Music2,
    Users,
} from 'lucide-react-native';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { colors, Radius } from '../../theme/tokens';
import { uploadLocalImageToConvex } from '../../utils/uploadToConvexStorage';
import { StorySticker, StickerData } from '../../components/social/StorySticker';
import { useDebouncedSearchTerm } from '../../hooks/useDebounce';

const BG_PALETTE = ['#4F46E5', '#DB2777', '#059669', '#D97706', '#1E293B', '#7C3AED'];
type StickerType = StickerData['type'];

/** Sticker arrastrable — un `Gesture.Pan()` genérico reusado por los 9
 *  tipos en vez de una implementación de drag por tipo. */
const DraggableSticker = ({
    sticker,
    onMove,
    onRemove,
}: {
    sticker: StickerData;
    onMove: (x: number, y: number) => void;
    onRemove: () => void;
}) => {
    const translateX = useSharedValue(sticker.x * 300);
    const translateY = useSharedValue(sticker.y * 500);
    const style = useAnimatedStyle(() => ({
        position: 'absolute',
        transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    }));
    const pan = Gesture.Pan()
        .onUpdate((e) => {
            translateX.value = sticker.x * 300 + e.translationX;
            translateY.value = sticker.y * 500 + e.translationY;
        })
        .onEnd((e) => {
            // Normaliza contra un lienzo de referencia 300x500 — no hace
            // falta exactitud de píxel, sólo posición relativa razonable.
            onMove(
                Math.min(0.9, Math.max(0, sticker.x + e.translationX / 300)),
                Math.min(0.9, Math.max(0, sticker.y + e.translationY / 500)),
            );
        });

    return (
        <GestureDetector gesture={pan}>
            <Animated.View style={style}>
                <TouchableOpacity onLongPress={onRemove} activeOpacity={0.8}>
                    <StorySticker sticker={{ ...sticker, x: 0, y: 0 }} storyId="" isAuthor={false} />
                </TouchableOpacity>
            </Animated.View>
        </GestureDetector>
    );
};

const TOOLBAR: Array<{ type: StickerType; icon: any; label: string }> = [
    { type: 'text', icon: Type, label: 'Texto' },
    { type: 'poll', icon: BarChart3, label: 'Encuesta' },
    { type: 'question', icon: HelpCircle, label: 'Pregunta' },
    { type: 'countdown', icon: Timer, label: 'Cuenta regresiva' },
    { type: 'slider', icon: SlidersHorizontal, label: 'Slider' },
    { type: 'mention', icon: AtSign, label: 'Mención' },
    { type: 'location', icon: MapPin, label: 'Ubicación' },
    { type: 'hashtag', icon: Hash, label: 'Hashtag' },
    { type: 'music', icon: Music2, label: 'Música' },
];

/**
 * A0.4 + A2: cámara real (foto/video, tope 15s) + galería + fondo de color
 * para historias de texto puro, más el set completo de stickers. Reemplaza
 * `CreateStory.tsx` (galería únicamente, sin cámara, `type` hardcodeado a
 * `'image'`).
 */
export default function StoryComposerScreen({ navigation }: any) {
    const insets = useSafeAreaInsets();
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const { show } = useToast();

    const [cameraPerm, requestCameraPerm] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const [facing, setFacing] = useState<'back' | 'front'>('back');
    const [isRecording, setIsRecording] = useState(false);

    const [mediaUri, setMediaUri] = useState<string | null>(null);
    const [mediaType, setMediaType] = useState<'image' | 'video' | 'text'>('image');
    const [bgColor, setBgColor] = useState(BG_PALETTE[0]);
    const [durationSec, setDurationSec] = useState(5);
    const [audience, setAudience] = useState<'everyone' | 'close_friends'>('everyone');
    const [stickers, setStickers] = useState<StickerData[]>([]);
    const [pendingType, setPendingType] = useState<StickerType | null>(null);
    const [publishing, setPublishing] = useState(false);

    const createStory = useMutation(api.social.createStory);
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);
    const registerUpload = useMutation(api.files.registerUpload);

    const inEditor = mediaUri !== null || mediaType === 'text';

    const handlePickGallery = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        setMediaUri(asset.uri);
        setMediaType(asset.type === 'video' ? 'video' : 'image');
        if (asset.duration) setDurationSec(Math.min(15, Math.round(asset.duration / 1000)));
    };

    const handleTakePhoto = async () => {
        if (!cameraRef.current) return;
        const photo = await cameraRef.current.takePictureAsync();
        if (photo?.uri) {
            setMediaUri(photo.uri);
            setMediaType('image');
        }
    };

    const handleStartVideo = async () => {
        if (!cameraRef.current || isRecording) return;
        setIsRecording(true);
        try {
            const video = await cameraRef.current.recordAsync({ maxDuration: 15 });
            if (video?.uri) {
                setMediaUri(video.uri);
                setMediaType('video');
                setDurationSec(15);
            }
        } finally {
            setIsRecording(false);
        }
    };

    const handleStopVideo = () => cameraRef.current?.stopRecording();

    const handleUseTextBackground = () => {
        setMediaUri(null);
        setMediaType('text');
        setPendingType('text');
    };

    const addSticker = (s: StickerData) => {
        setStickers((prev) => [...prev, s]);
        setPendingType(null);
    };

    const moveSticker = (id: string, x: number, y: number) => {
        setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, x, y } : s)));
    };

    const removeSticker = (id: string) => setStickers((prev) => prev.filter((s) => s.id !== id));

    const handlePublish = async () => {
        if (!sessionToken) return;
        setPublishing(true);
        try {
            let uploadedUrl: string | undefined;
            if (mediaUri) {
                uploadedUrl = await uploadLocalImageToConvex({
                    uri: mediaUri,
                    generateUploadUrl,
                    registerUpload,
                    purpose: 'social_story',
                    sessionToken,
                });
            }
            await createStory({
                sessionToken,
                type: mediaType,
                url: uploadedUrl,
                backgroundColor: mediaType === 'text' ? bgColor : undefined,
                durationSec: mediaType === 'video' ? durationSec : 5,
                audience,
                stickers: stickers.length ? (stickers as any) : undefined,
            });
            show('¡Historia publicada!', 'success');
            navigation.goBack();
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo publicar la historia.', 'error');
        } finally {
            setPublishing(false);
        }
    };

    // ── Editor (media/fondo listo + stickers) ───────────────────────────
    if (inEditor) {
        return (
            <View style={[styles.container, { paddingTop: insets.top }]}>
                {mediaType === 'text' ? (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: bgColor }]} />
                ) : mediaType === 'image' ? (
                    <Image source={{ uri: mediaUri! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
                )}

                <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                    {stickers.map((s) => (
                        <DraggableSticker
                            key={s.id}
                            sticker={s}
                            onMove={(x, y) => moveSticker(s.id, x, y)}
                            onRemove={() => removeSticker(s.id)}
                        />
                    ))}
                </View>

                <View style={styles.editorTopBar}>
                    <TouchableOpacity onPress={() => { setMediaUri(null); setMediaType('image'); setStickers([]); }} style={styles.iconBtn}>
                        <X size={26} color="#fff" />
                    </TouchableOpacity>
                    {mediaType === 'text' && (
                        <View style={styles.colorRow}>
                            {BG_PALETTE.map((color) => (
                                <TouchableOpacity key={color} onPress={() => setBgColor(color)} style={[styles.colorDot, { backgroundColor: color }, bgColor === color && styles.colorDotActive]} />
                            ))}
                        </View>
                    )}
                    <TouchableOpacity
                        onPress={() => setAudience((a) => (a === 'everyone' ? 'close_friends' : 'everyone'))}
                        style={styles.iconBtn}
                        accessibilityLabel="Audiencia"
                    >
                        <Users size={22} color={audience === 'close_friends' ? '#F59E0B' : '#fff'} />
                    </TouchableOpacity>
                </View>

                {/* Barra de stickers (A2, set completo) */}
                <View style={styles.stickerToolbar}>
                    <FlatList
                        horizontal
                        data={TOOLBAR}
                        keyExtractor={(t) => t.type}
                        showsHorizontalScrollIndicator={false}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.toolbarBtn} onPress={() => setPendingType(item.type)}>
                                <item.icon size={20} color="#fff" />
                            </TouchableOpacity>
                        )}
                        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
                    />
                </View>

                <View style={[styles.editorFooter, { paddingBottom: insets.bottom + 16 }]}>
                    <TouchableOpacity
                        style={[styles.publishBtn, { backgroundColor: c.primary }]}
                        onPress={handlePublish}
                        disabled={publishing}
                    >
                        {publishing ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishBtnText}>Compartir historia</Text>}
                    </TouchableOpacity>
                </View>

                <StickerInputModal
                    type={pendingType}
                    onClose={() => setPendingType(null)}
                    onAdd={addSticker}
                />
            </View>
        );
    }

    // ── Captura (cámara / galería / fondo de color) ─────────────────────
    if (!cameraPerm) {
        return <View style={[styles.center, { backgroundColor: '#000' }]}><ActivityIndicator color="#fff" /></View>;
    }
    if (!cameraPerm.granted) {
        return (
            <View style={[styles.center, { backgroundColor: '#000', padding: 24 }]}>
                <Text style={styles.permText}>Necesitamos acceso a la cámara para grabar una historia.</Text>
                <TouchableOpacity style={[styles.permBtn, { backgroundColor: c.primary }]} onPress={() => requestCameraPerm()}>
                    <Text style={styles.publishBtnText}>Dar permiso</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} mode="video" />

            <View style={[styles.editorTopBar, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <X size={26} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleUseTextBackground} style={styles.iconBtn} accessibilityLabel="Historia de texto">
                    <Type size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} style={styles.iconBtn}>
                    <RotateCcw size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            <View style={[styles.captureBottomBar, { paddingBottom: insets.bottom + 24 }]}>
                <TouchableOpacity onPress={handlePickGallery} style={styles.iconBtn}>
                    <ImageIcon size={26} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.recordBtnOuter}
                    onPress={handleTakePhoto}
                    onLongPress={handleStartVideo}
                    onPressOut={() => isRecording && handleStopVideo()}
                    delayLongPress={250}
                >
                    <View style={[styles.recordBtnInner, isRecording && { backgroundColor: '#EF4444' }]} />
                </TouchableOpacity>
                <View style={{ width: 26 }} />
            </View>
        </View>
    );
}

/** Mini-modal de carga por tipo de sticker — un solo componente en vez de 9
 *  archivos separados (mismo contenido funcional, menos ceremonia). */
const StickerInputModal = ({ type, onClose, onAdd }: { type: StickerType | null; onClose: () => void; onAdd: (s: StickerData) => void }) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const { sessionToken } = useAuth();

    const [text1, setText1] = useState('');
    const [text2, setText2] = useState('');
    const [emoji, setEmoji] = useState('🔥');
    const [mentionQuery, setMentionQuery] = useState('');
    const [musicQuery, setMusicQuery] = useState('');

    // Los dos hooks de debounce corren SIEMPRE (nunca detrás de un
    // condicional) — sólo el arg de `useQuery` decide si la query pega o no
    // ('skip'), que es el patrón seguro ya establecido en el resto del código.
    const debouncedMention = useDebouncedSearchTerm(mentionQuery);
    const debouncedMusic = useDebouncedSearchTerm(musicQuery);
    const mentionResults = useQuery(
        api.userDirectory.search,
        type === 'mention' && sessionToken ? { sessionToken, term: debouncedMention, limit: 10 } : 'skip',
    );
    const musicResults = useQuery(
        api.social.audio.searchAudioTracks,
        type === 'music' && sessionToken ? { sessionToken, query: debouncedMusic } : 'skip',
    );

    const reset = () => {
        setText1('');
        setText2('');
        setEmoji('🔥');
        setMentionQuery('');
        setMusicQuery('');
    };

    const base = { id: `${Date.now()}`, x: 0.3, y: 0.4 };

    const submit = () => {
        if (!type) return;
        if (type === 'text' && text1.trim()) onAdd({ ...base, type, content: text1.trim() } as StickerData);
        else if (type === 'poll' && text1.trim() && text2.trim()) onAdd({ ...base, type, question: text1.trim(), options: [text2.split('/')[0]?.trim() || 'Sí', text2.split('/')[1]?.trim() || 'No'] } as StickerData);
        else if (type === 'question' && text1.trim()) onAdd({ ...base, type, prompt: text1.trim() } as StickerData);
        else if (type === 'countdown' && text1.trim()) onAdd({ ...base, type, title: text1.trim(), endsAt: new Date(Date.now() + 24 * 3600_000).toISOString() } as StickerData);
        else if (type === 'slider') onAdd({ ...base, type, emoji, question: text1.trim() || undefined } as StickerData);
        else if (type === 'location' && text1.trim()) onAdd({ ...base, type, name: text1.trim() } as StickerData);
        else if (type === 'hashtag' && text1.trim()) onAdd({ ...base, type, tag: text1.trim().replace(/^#/, '') } as StickerData);
        else return;
        reset();
    };

    if (!type) return null;

    return (
        <Modal visible transparent animationType="slide" onRequestClose={onClose}>
            <View style={modalStyles.overlay}>
                <View style={[modalStyles.card, { backgroundColor: isDark ? '#18181B' : '#fff' }]}>
                    <View style={modalStyles.headerRow}>
                        <Text style={[modalStyles.title, { color: c.text }]}>
                            {type === 'text' ? 'Texto' : type === 'poll' ? 'Encuesta' : type === 'question' ? 'Pregunta' : type === 'countdown' ? 'Cuenta regresiva (24h)' : type === 'slider' ? 'Slider' : type === 'mention' ? 'Mencionar' : type === 'location' ? 'Ubicación' : type === 'hashtag' ? 'Hashtag' : 'Música'}
                        </Text>
                        <TouchableOpacity onPress={onClose}><X size={22} color={c.text} /></TouchableOpacity>
                    </View>

                    {(type === 'text' || type === 'question' || type === 'countdown' || type === 'location' || type === 'hashtag') && (
                        <TextInput
                            style={[modalStyles.input, { color: c.text, borderColor: c.border }]}
                            placeholder={type === 'text' ? 'Escribí algo...' : type === 'question' ? 'Pregúntame lo que sea' : type === 'countdown' ? 'Título del evento' : type === 'location' ? 'Nombre del lugar' : 'sinespacios'}
                            placeholderTextColor={c.textMuted}
                            value={text1}
                            onChangeText={setText1}
                            autoFocus
                        />
                    )}

                    {type === 'poll' && (
                        <>
                            <TextInput style={[modalStyles.input, { color: c.text, borderColor: c.border }]} placeholder="Pregunta" placeholderTextColor={c.textMuted} value={text1} onChangeText={setText1} autoFocus />
                            <TextInput style={[modalStyles.input, { color: c.text, borderColor: c.border }]} placeholder="Opción A / Opción B" placeholderTextColor={c.textMuted} value={text2} onChangeText={setText2} />
                        </>
                    )}

                    {type === 'slider' && (
                        <>
                            <TextInput style={[modalStyles.input, { color: c.text, borderColor: c.border }]} placeholder="Pregunta (opcional)" placeholderTextColor={c.textMuted} value={text1} onChangeText={setText1} />
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                                {['🔥', '❤️', '😂', '👍', '🎉'].map((e) => (
                                    <TouchableOpacity key={e} onPress={() => setEmoji(e)} style={[modalStyles.emojiBtn, emoji === e && { backgroundColor: c.primary + '33' }]}>
                                        <Text style={{ fontSize: 22 }}>{e}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </>
                    )}

                    {type === 'mention' && (
                        <>
                            <TextInput style={[modalStyles.input, { color: c.text, borderColor: c.border }]} placeholder="Buscar usuario..." placeholderTextColor={c.textMuted} value={mentionQuery} onChangeText={setMentionQuery} autoFocus />
                            <FlatList
                                data={mentionResults ?? []}
                                keyExtractor={(u: any) => u.userId}
                                style={{ maxHeight: 200 }}
                                renderItem={({ item }: any) => (
                                    <TouchableOpacity style={modalStyles.resultRow} onPress={() => { onAdd({ ...base, type: 'mention', userId: item.userId, username: item.username } as StickerData); reset(); }}>
                                        <Text style={{ color: c.text }}>@{item.username}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </>
                    )}

                    {type === 'music' && (
                        <>
                            <TextInput style={[modalStyles.input, { color: c.text, borderColor: c.border }]} placeholder="Buscar sonido..." placeholderTextColor={c.textMuted} value={musicQuery} onChangeText={setMusicQuery} autoFocus />
                            <FlatList
                                data={musicResults ?? []}
                                keyExtractor={(t: any) => String(t._id)}
                                style={{ maxHeight: 200 }}
                                renderItem={({ item }: any) => (
                                    <TouchableOpacity style={modalStyles.resultRow} onPress={() => { onAdd({ ...base, type: 'music', audioTrackId: String(item._id), trackName: item.name } as StickerData); reset(); }}>
                                        <Text style={{ color: c.text }}>{item.name}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </>
                    )}

                    {type !== 'mention' && type !== 'music' && (
                        <TouchableOpacity style={[modalStyles.addBtn, { backgroundColor: c.primary }]} onPress={submit}>
                            <Text style={{ color: '#fff', fontWeight: '700' }}>Agregar</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    permText: { color: '#fff', fontSize: 15, textAlign: 'center', marginBottom: 16 },
    permBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.full },
    iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
    editorTopBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16 },
    colorRow: { flexDirection: 'row', gap: 8 },
    colorDot: { width: 24, height: 24, borderRadius: 12 },
    colorDotActive: { borderWidth: 2, borderColor: '#fff' },
    stickerToolbar: { position: 'absolute', top: 70, left: 0, right: 0 },
    toolbarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
    editorFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16 },
    publishBtn: { paddingVertical: 14, borderRadius: Radius.full, alignItems: 'center' },
    publishBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    captureBottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32 },
    recordBtnOuter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    recordBtnInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
});

const modalStyles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    card: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: 20, gap: 10 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    title: { fontSize: 16, fontWeight: '700' },
    input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
    emojiBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    resultRow: { paddingVertical: 10 },
    addBtn: { marginTop: 8, paddingVertical: 12, borderRadius: Radius.full, alignItems: 'center' },
});
