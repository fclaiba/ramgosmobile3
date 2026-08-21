import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Dimensions, SafeAreaView, TextInput, Platform, Animated, Share, Alert, FlatList } from 'react-native';
import { X, Heart, Send, MoreHorizontal, Bookmark, Plus, Eye } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Audio } from 'expo-av';
import { useQuery, useMutation } from 'convex/react';
import ReanimatedAnimated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { api } from '../../../convex/_generated/api';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Radius, colors } from '../../theme/tokens';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { StorySticker } from './StorySticker';

const { width, height } = Dimensions.get('window');
const DISMISS_THRESHOLD = 120;
const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👏', '🔥'];

// --- Single story slide (one image/video/text) ---
const StorySlide = ({
    storyItem,
    author,
    isActive,
    totalItems,
    currentIndex,
    onClose,
    onNext,
    onPrev,
    onNavigateProfile,
    onOpenViewers,
    onOpenHighlightPicker,
}: {
    storyItem: any;
    author: any;
    isActive: boolean;
    totalItems: number;
    currentIndex: number;
    onClose: () => void;
    onNext: () => void;
    onPrev: () => void;
    onNavigateProfile: () => void;
    onOpenViewers: () => void;
    onOpenHighlightPicker: () => void;
}) => {
    const [progress] = useState(new Animated.Value(0));
    const [isPaused, setIsPaused] = useState(false);
    const [message, setMessage] = useState('');
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const { user: authUser, sessionToken } = useAuth();
    const { show } = useToast();
    const toggleLike = useMutation(api.social.toggleLike);
    const deleteStory = useMutation(api.social.deleteStory);
    // Antes esto mandaba un mensaje de texto plano con un prefijo
    // ("Respondiendo a tu historia: ..."), sin el adjunto real de la
    // historia. `shareStoryInChat` (ya existía en `social/dm.ts`, nadie la
    // llamaba) manda el adjunto de verdad en la misma transacción.
    const shareStoryInChat = useMutation(api.social.dm.shareStoryInChat);
    const createChat = useMutation(api.social.dm.getOrCreateDirectChat);

    const isMyStory = authUser && author?.userId === (authUser as any).id;
    const isVideo = storyItem?.type === 'video';

    const videoPlayer = useVideoPlayer(isVideo ? (storyItem?.url || '') : '', (p) => {
        p.loop = false;
    });
    useEffect(() => {
        if (!isVideo || !videoPlayer) return;
        if (isActive && !isPaused) videoPlayer.play();
        else videoPlayer.pause();
    }, [isVideo, isActive, isPaused, videoPlayer]);

    // A2: música de fondo — resuelve el track del sticker `music` (si hay)
    // y lo reproduce en loop mientras la slide esté activa. Un solo sticker
    // de música por historia (igual que Instagram).
    const musicSticker = (storyItem?.stickers ?? []).find((s: any) => s.type === 'music');
    const track = useQuery(
        api.social.audio.getAudioTrack,
        musicSticker ? { sessionToken, trackId: musicSticker.audioTrackId } : 'skip',
    );
    const soundRef = useRef<Audio.Sound | null>(null);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!track?.audioUrl || !isActive) {
                await soundRef.current?.stopAsync().catch(() => {});
                return;
            }
            const { sound } = await Audio.Sound.createAsync({ uri: track.audioUrl }, { shouldPlay: !isPaused, isLooping: true });
            if (cancelled) {
                await sound.unloadAsync();
                return;
            }
            soundRef.current = sound;
        })();
        return () => {
            cancelled = true;
            soundRef.current?.unloadAsync().catch(() => {});
            soundRef.current = null;
        };
    }, [track?.audioUrl, isActive]);
    useEffect(() => {
        if (isPaused) soundRef.current?.pauseAsync().catch(() => {});
        else soundRef.current?.playAsync().catch(() => {});
    }, [isPaused]);

    useEffect(() => {
        if (!isActive || isPaused || !storyItem) return;
        progress.setValue(0);
        const duration = (storyItem.durationSec || 5) * 1000;
        const anim = Animated.timing(progress, {
            toValue: 1,
            duration,
            useNativeDriver: false,
        });
        anim.start(({ finished }) => { if (finished) onNext(); });
        return () => { progress.stopAnimation(); };
    }, [isActive, isPaused, storyItem?._id, currentIndex]);

    if (!storyItem) return null;

    const imageUrl = storyItem.imageUrl || storyItem.url || '';
    const displayName = author?.displayName || author?.username || '?';
    const avatarUrl = author?.avatar || '';
    const timeLabel = storyItem.createdAt
        ? new Date(storyItem.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';

    const sendReply = async (text: string) => {
        if (!text.trim() || !sessionToken) return;
        try {
            const chatId = await createChat({ sessionToken, participantId: author.userId });
            await shareStoryInChat({
                sessionToken,
                chatId: chatId as any,
                storyId: String(storyItem._id),
                note: text,
            });
            show('Mensaje enviado', 'success');
        } catch (e: any) {
            show(e.message, 'error');
        }
    };

    return (
        <View style={styles.slideContainer}>
            {storyItem.type === 'text' ? (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: storyItem.backgroundColor || '#4F46E5' }]} />
            ) : isVideo ? (
                <VideoView style={styles.image} player={videoPlayer} contentFit="contain" nativeControls={false} />
            ) : (
                <ImageWithFallback src={imageUrl} style={styles.image} resizeMode="contain" />
            )}
            <LinearGradient
                colors={['rgba(0,0,0,0.6)', 'transparent', 'transparent', 'rgba(0,0,0,0.8)']}
                style={styles.gradient}
                pointerEvents="none"
            />

            {/* Stickers (A2) — posicionados absolutos sobre la slide. */}
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                {(storyItem.stickers ?? []).map((s: any) => (
                    <StorySticker
                        key={s.id}
                        sticker={{ ...s, trackName: s.type === 'music' ? track?.name : undefined }}
                        storyId={String(storyItem._id)}
                        isAuthor={Boolean(isMyStory)}
                    />
                ))}
            </View>

            {/* Tap gestures: Absolute fill over the image, but under Header/Footer. We put it here so it doesn't block SafeAreaView clicks if we just use absolute fill */}
            <View style={styles.tapContainer}>
                <TouchableOpacity
                    style={styles.tapLeft}
                    onPress={onPrev}
                    onLongPress={() => setIsPaused(true)}
                    onPressOut={() => setIsPaused(false)}
                    delayLongPress={200}
                />
                <TouchableOpacity
                    style={styles.tapRight}
                    onPress={onNext}
                    onLongPress={() => setIsPaused(true)}
                    onPressOut={() => setIsPaused(false)}
                    delayLongPress={200}
                />
            </View>

            <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
                {/* Progress bar */}
                <View style={styles.progressContainer}>
                    {Array.from({ length: totalItems }).map((_, idx) => (
                        <View key={idx} style={styles.progressBarBg}>
                            {idx === currentIndex ? (
                                <Animated.View
                                    style={[styles.progressBarFill, {
                                        width: progress.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: ['0%', '100%'],
                                        }),
                                    }]}
                                />
                            ) : (
                                <View style={[styles.progressBarFill, { width: idx < currentIndex ? '100%' : '0%' }]} />
                            )}
                        </View>
                    ))}
                </View>

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.userInfo} onPress={onNavigateProfile}>
                        <Avatar style={styles.avatar}>
                            <AvatarImage src={avatarUrl} />
                            <AvatarFallback>{displayName[0]}</AvatarFallback>
                        </Avatar>
                        <Text style={styles.userName}>{displayName}</Text>
                        <Text style={styles.time}>{timeLabel}</Text>
                    </TouchableOpacity>

                    <View style={styles.headerActions}>
                        {isMyStory && (
                            <TouchableOpacity onPress={() => { setIsPaused(true); setShowMoreMenu(true); }} style={styles.iconBtn}>
                                <MoreHorizontal size={24} color="#fff" />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                            <X size={28} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* A4: "quién vio" — sólo la propia historia. */}
                {isMyStory && (
                    <TouchableOpacity style={styles.viewersRow} onPress={onOpenViewers}>
                        <Eye size={14} color="#fff" />
                        <Text style={styles.viewersText}>{storyItem.viewCount ?? 0}</Text>
                    </TouchableOpacity>
                )}

                {/* Footer actions */}
                <View style={styles.footer}>
                    {!isMyStory && (
                        <>
                            <View style={styles.inputContainer}>
                                <TextInput
                                    placeholder="Envía un mensaje..."
                                    placeholderTextColor="rgba(255,255,255,0.7)"
                                    style={styles.input}
                                    value={message}
                                    onChangeText={setMessage}
                                    onFocus={() => setIsPaused(true)}
                                    onBlur={() => setIsPaused(false)}
                                    onSubmitEditing={async () => {
                                        await sendReply(message);
                                        setMessage('');
                                        setIsPaused(false);
                                    }}
                                />
                            </View>
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={async () => {
                                    try {
                                        await toggleLike({ targetType: 'story', targetId: storyItem._id, sessionToken });
                                        show('¡Te gusta esto!', 'success');
                                    } catch (e) {
                                        show('Error al dar me gusta', 'error');
                                    }
                                }}
                            >
                                <Heart size={28} color="#fff" />
                            </TouchableOpacity>
                        </>
                    )}
                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={async () => {
                            setIsPaused(true);
                            try {
                                await Share.share({
                                    message: `Mira esta historia de ${author.displayName}: ${imageUrl}`,
                                });
                            } catch (e) {}
                            setIsPaused(false);
                        }}
                    >
                        <Send size={28} color="#fff" />
                    </TouchableOpacity>
                </View>

                {/* A0.3: barra de reacciones rápidas — reusa `shareStoryInChat`
                    (mismo criterio ya documentado en dm.ts: responder una
                    historia ES mandar un DM, no un sistema de reacciones aparte). */}
                {!isMyStory && (
                    <View style={styles.quickReactionsRow}>
                        {QUICK_REACTIONS.map((emoji) => (
                            <TouchableOpacity key={emoji} onPress={() => sendReply(emoji)} style={styles.quickReactionBtn}>
                                <Text style={styles.quickReactionText}>{emoji}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </SafeAreaView>

            {/* Menú "..." — Guardar en destacada / Eliminar. */}
            <Modal visible={showMoreMenu} transparent animationType="fade" onRequestClose={() => { setShowMoreMenu(false); setIsPaused(false); }}>
                <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => { setShowMoreMenu(false); setIsPaused(false); }}>
                    <View style={styles.menuCard}>
                        <TouchableOpacity
                            style={styles.menuRow}
                            onPress={() => {
                                setShowMoreMenu(false);
                                onOpenHighlightPicker();
                            }}
                        >
                            <Bookmark size={20} color={isDark ? '#fff' : '#111827'} />
                            <Text style={styles.menuRowText}>Guardar en destacada</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.menuRow}
                            onPress={() => {
                                setShowMoreMenu(false);
                                Alert.alert('Eliminar historia', '¿Estás seguro que deseas eliminar esta historia?', [
                                    { text: 'Cancelar', onPress: () => setIsPaused(false), style: 'cancel' },
                                    { text: 'Eliminar', style: 'destructive', onPress: async () => {
                                        try {
                                            await deleteStory({ storyId: storyItem._id, sessionToken });
                                            show('Historia eliminada', 'success');
                                            onNext();
                                        } catch (e: any) {
                                            show(e.message, 'error');
                                        }
                                        setIsPaused(false);
                                    }},
                                ]);
                            }}
                        >
                            <X size={20} color="#EF4444" />
                            <Text style={[styles.menuRowText, { color: '#EF4444' }]}>Eliminar historia</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
};

/** A3: picker de destacadas — lista las mías + "Crear nueva" con un input
 *  chico inline (RN no tiene `Alert.prompt` multiplataforma). */
const HighlightPickerModal = ({
    visible,
    onClose,
    storyId,
    coverImage,
}: {
    visible: boolean;
    onClose: () => void;
    storyId: string;
    coverImage: string;
}) => {
    const { user, sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();
    const [newTitle, setNewTitle] = useState('');
    const [creating, setCreating] = useState(false);

    const highlights = useQuery(
        api.social.getHighlights,
        sessionToken && user?.id && visible ? { sessionToken, userId: (user as any).id } : 'skip',
    );
    const addStoryToHighlight = useMutation(api.social.addStoryToHighlight);
    const addHighlight = useMutation(api.social.addHighlight);

    const handleAddTo = async (highlightId: string) => {
        if (!sessionToken) return;
        try {
            await addStoryToHighlight({ sessionToken, highlightId: highlightId as any, storyId: storyId as any });
            show('Guardado en destacada', 'success');
            onClose();
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo guardar', 'error');
        }
    };

    const handleCreate = async () => {
        if (!sessionToken || !newTitle.trim()) return;
        setCreating(true);
        try {
            await addHighlight({ sessionToken, title: newTitle.trim(), coverImage, storyIds: [storyId] });
            show('Destacada creada', 'success');
            setNewTitle('');
            onClose();
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo crear', 'error');
        } finally {
            setCreating(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={onClose}>
                <View style={styles.menuCard}>
                    <Text style={styles.menuTitle}>Guardar en destacada</Text>
                    <FlatList
                        data={highlights ?? []}
                        keyExtractor={(h: any) => String(h._id)}
                        style={{ maxHeight: 220 }}
                        renderItem={({ item }: any) => (
                            <TouchableOpacity style={styles.menuRow} onPress={() => handleAddTo(String(item._id))}>
                                <Bookmark size={18} color={isDark ? '#fff' : '#111827'} />
                                <Text style={styles.menuRowText}>{item.title}</Text>
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={<Text style={styles.menuEmptyText}>Todavía no tenés destacadas.</Text>}
                    />
                    <View style={styles.newHighlightRow}>
                        <TextInput
                            style={styles.newHighlightInput}
                            placeholder="Nueva destacada..."
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                            value={newTitle}
                            onChangeText={setNewTitle}
                        />
                        <TouchableOpacity onPress={handleCreate} disabled={creating || !newTitle.trim()} style={styles.newHighlightBtn}>
                            <Plus size={18} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>
        </Modal>
    );
};

interface StoryGroup { author: any; stories: any[] }

/** Contenido compartido del viewer — usado por `StoryViewer` (tray, envuelto
 *  en `<Modal>`) y por `HighlightViewerScreen` (screen ruteada, sin Modal
 *  encima porque el navigator ya la presenta a pantalla completa). Evita
 *  duplicar ~300 líneas de gestos/progress-bar/stickers entre los dos. */
export const StorySlidesContent = ({
    groups,
    initialGroupIndex,
    onClose,
    onNavigateProfile,
}: {
    groups: StoryGroup[];
    initialGroupIndex: number;
    onClose: () => void;
    onNavigateProfile: (userId: string) => void;
}) => {
    const { sessionToken } = useAuth();
    const [activeGroupIdx, setActiveGroupIdx] = useState(initialGroupIndex >= 0 ? initialGroupIndex : 0);
    const [activeStoryIdx, setActiveStoryIdx] = useState(0);
    const [viewersStoryId, setViewersStoryId] = useState<string | null>(null);
    const [highlightPickerStoryId, setHighlightPickerStoryId] = useState<string | null>(null);

    const currentGroup = groups[activeGroupIdx];
    const stories = currentGroup?.stories ?? [];
    const author = currentGroup?.author;
    const currentStory = stories[activeStoryIdx];
    const viewStoryMut = useMutation(api.social.viewStory);

    useEffect(() => {
        const id = currentStory?._id;
        if (!id || !sessionToken) return;
        viewStoryMut({ sessionToken, storyId: id as any }).catch(() => {});
    }, [currentStory?._id, sessionToken, viewStoryMut]);

    const handleNext = () => {
        if (activeStoryIdx < stories.length - 1) {
            setActiveStoryIdx((prev) => prev + 1);
        } else if (activeGroupIdx < groups.length - 1) {
            setActiveGroupIdx((prev) => prev + 1);
            setActiveStoryIdx(0);
        } else {
            onClose();
        }
    };

    const handlePrev = () => {
        if (activeStoryIdx > 0) {
            setActiveStoryIdx((prev) => prev - 1);
        } else if (activeGroupIdx > 0) {
            setActiveGroupIdx((prev) => prev - 1);
            const prevGroup = groups[activeGroupIdx - 1];
            setActiveStoryIdx((prevGroup?.stories?.length ?? 1) - 1);
        } else {
            onClose();
        }
    };

    // A0.2: swipe-down para cerrar.
    const translateY = useSharedValue(0);
    const dismissStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        opacity: 1 - Math.min(1, translateY.value / (height * 0.5)),
    }));
    const pan = Gesture.Pan()
        .onUpdate((e) => {
            if (e.translationY > 0) translateY.value = e.translationY;
        })
        .onEnd((e) => {
            if (e.translationY > DISMISS_THRESHOLD) {
                runOnJS(onClose)();
            } else {
                translateY.value = withSpring(0);
            }
        });

    if (!currentGroup || stories.length === 0) return null;

    return (
        <GestureDetector gesture={pan}>
            <ReanimatedAnimated.View style={[{ flex: 1, backgroundColor: 'black' }, dismissStyle]}>
                <StorySlide
                    storyItem={currentStory}
                    author={author}
                    isActive={true}
                    totalItems={stories.length}
                    currentIndex={activeStoryIdx}
                    onClose={onClose}
                    onNext={handleNext}
                    onPrev={handlePrev}
                    onNavigateProfile={() => {
                        onClose();
                        onNavigateProfile(author?.userId);
                    }}
                    onOpenViewers={() => setViewersStoryId(String(currentStory._id))}
                    onOpenHighlightPicker={() => setHighlightPickerStoryId(String(currentStory._id))}
                />
                {viewersStoryId && (
                    <StoryViewersInline storyId={viewersStoryId} onClose={() => setViewersStoryId(null)} />
                )}
                <HighlightPickerModal
                    visible={highlightPickerStoryId !== null}
                    onClose={() => setHighlightPickerStoryId(null)}
                    storyId={highlightPickerStoryId ?? ''}
                    coverImage={currentStory.imageUrl || currentStory.url || ''}
                />
            </ReanimatedAnimated.View>
        </GestureDetector>
    );
};

/** Ver `getStoryViewers` — inline en vez de navegar a otra screen desde
 *  ADENTRO de un `<Modal>` (navegar fuera de un Modal nativo es finicky en
 *  RN). `StoryViewersScreen.tsx` (A4) es la versión ruteada, para cuando se
 *  entra desde el perfil en vez de desde el viewer. */
const StoryViewersInline = ({ storyId, onClose }: { storyId: string; onClose: () => void }) => {
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const viewers = useQuery(api.social.getStoryViewers, sessionToken ? { sessionToken, storyId: storyId as any } : 'skip');

    return (
        <Modal visible transparent animationType="slide" onRequestClose={onClose}>
            <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={onClose}>
                <View style={[styles.menuCard, { maxHeight: '60%' }]}>
                    <Text style={styles.menuTitle}>Vistas ({viewers?.length ?? 0})</Text>
                    <FlatList
                        data={viewers ?? []}
                        keyExtractor={(v: any) => v.viewerUserId}
                        renderItem={({ item }: any) => (
                            <View style={styles.menuRow}>
                                <Avatar style={{ width: 28, height: 28 }}>
                                    <AvatarImage src={item.avatar} />
                                    <AvatarFallback>{(item.displayName ?? '?')[0]}</AvatarFallback>
                                </Avatar>
                                <Text style={styles.menuRowText}>{item.displayName ?? item.username ?? 'Usuario'}</Text>
                            </View>
                        )}
                        ListEmptyComponent={<Text style={styles.menuEmptyText}>Nadie vio esta historia todavía.</Text>}
                    />
                </View>
            </TouchableOpacity>
        </Modal>
    );
};

// --- Main StoryViewer: receives a userId, fetches their stories from Convex ---
export const StoryViewer = ({
    storyId: userId,
    onClose,
    onNavigateProfile,
}: {
    storyId: string;
    onClose: () => void;
    onNavigateProfile: (userId: string) => void;
}) => {
    const { sessionToken } = useAuth();

    const storyGroups = useQuery(
        api.social.getStoriesForFollowing,
        sessionToken ? { sessionToken } : 'skip'
    ) ?? [];

    const groupIndex = storyGroups.findIndex((g: any) => g.author?.userId === userId);

    if (storyGroups.length === 0) return null;

    return (
        <Modal animationType="slide" visible={true} transparent={false} onRequestClose={onClose}>
            <StorySlidesContent
                groups={storyGroups}
                initialGroupIndex={groupIndex >= 0 ? groupIndex : 0}
                onClose={onClose}
                onNavigateProfile={onNavigateProfile}
            />
        </Modal>
    );
};

const getStyles = (isDark: any) => StyleSheet.create({
    slideContainer: { flex: 1, backgroundColor: '#000', position: 'relative' },
    image: { width, height, position: 'absolute' },
    gradient: { ...StyleSheet.absoluteFill },
    safeArea: { flex: 1, flexDirection: 'column' },

    progressContainer: { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 10, gap: 4, height: 14 },
    progressBarBg: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: Radius.sm, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#fff' },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 12 },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 32, height: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
    userName: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 13,
        ...Platform.select({
            web: { textShadow: '0px 0px 4px rgba(0,0,0,0.5)' } as any,
            default: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }
        })
    },
    time: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '400' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconBtn: { padding: 4 },

    viewersRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, marginTop: 8 },
    viewersText: { color: '#fff', fontSize: 12, fontWeight: '600' },

    footer: { position: 'absolute', bottom: Platform.OS === 'ios' ? 90 : 70, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 16 },
    inputContainer: { flex: 1, height: 48, borderRadius: Radius.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', justifyContent: 'center', paddingHorizontal: 20 },
    input: { color: '#fff', fontSize: 16 },
    actionBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },

    quickReactionsRow: { position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 20, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: 16 },
    quickReactionBtn: { padding: 6 },
    quickReactionText: { fontSize: 24 },

    tapContainer: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
    tapLeft: { width: width * 0.3, height: '100%' },
    tapRight: { width: width * 0.7, height: '100%' },

    menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    menuCard: { backgroundColor: isDark ? '#18181B' : '#fff', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: 16, gap: 4 },
    menuTitle: { fontSize: 15, fontWeight: '700', color: isDark ? '#fff' : '#111827', marginBottom: 8 },
    menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    menuRowText: { fontSize: 15, color: isDark ? '#fff' : '#111827', fontWeight: '500' },
    menuEmptyText: { fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280', paddingVertical: 12 },
    newHighlightRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
    newHighlightInput: { flex: 1, borderRadius: Radius.md, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB', paddingHorizontal: 12, paddingVertical: 8, color: isDark ? '#fff' : '#111827' },
    newHighlightBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors(isDark).primary, alignItems: 'center', justifyContent: 'center' },
});
