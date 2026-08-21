import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    TextInput,
    Platform,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import { File, Paths } from 'expo-file-system';
let execute: any = null;
let FFmpegError: any = null;
if (Platform.OS !== 'web') {
    try {
        const ffmpeg = require('ffmpeg-expo');
        execute = ffmpeg.execute;
        FFmpegError = ffmpeg.FFmpegError;
    } catch (e) {
        console.warn('ffmpeg-expo no está disponible', e);
    }
}
import { useMutation } from 'convex/react';
import { X, Circle, Square, RotateCcw, Music2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { colors, Radius } from '../../theme/tokens';
import { uploadLocalImageToConvex } from '../../utils/uploadToConvexStorage';

/** `convex-storage:<id>` -> `<id>`, para args tipados `v.id('_storage')`. */
const stripStorageRef = (ref: string) => ref.replace('convex-storage:', '');

/** ffmpeg-expo quiere un path de filesystem, no un URI con esquema. */
const toFsPath = (uri: string) => uri.replace(/^file:\/\//, '');

type Phase = 'record' | 'review' | 'publishing';

/**
 * Primera UI de grabación de video real de la app (`expo-camera` sólo se
 * usaba para QR hasta ahora). El mux del sonido elegido pasa acá mismo,
 * client-side (`ffmpeg-expo`) — nunca en el servidor (ver Contexto del plan:
 * un Convex action no puede empaquetar el binario de ffmpeg, excede el
 * límite de 32MiB del bundle).
 */
export default function CreateReelScreen({ route, navigation }: any) {
    const audioTrackId: string | undefined = route.params?.audioTrackId;
    const audioUrl: string | undefined = route.params?.audioUrl;
    const hasReusedSound = Boolean(audioTrackId && audioUrl);
    // B1: grabar un Loop DENTRO de una comunidad.
    const communityId: string | undefined = route.params?.communityId;
    const communityName: string | undefined = route.params?.communityName;

    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const insets = useSafeAreaInsets();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    const [cameraPerm, requestCameraPerm] = useCameraPermissions();
    const [micPerm, requestMicPerm] = useMicrophonePermissions();

    const cameraRef = useRef<CameraView>(null);
    const referenceSound = useRef<Audio.Sound | null>(null);

    const [facing, setFacing] = useState<'back' | 'front'>('back');
    const [isRecording, setIsRecording] = useState(false);
    const [phase, setPhase] = useState<Phase>('record');
    const [recordedUri, setRecordedUri] = useState<string | null>(null);
    const [caption, setCaption] = useState('');

    const createPost = useMutation(api.social.createPost);
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);
    const registerUpload = useMutation(api.files.registerUpload);

    // Sólo pide micrófono si NO reusa un sonido — la cámara graba muteada
    // (`mute={hasReusedSound}`) en ese caso, así que el mic ni se toca.
    useEffect(() => {
        if (!cameraPerm?.granted) requestCameraPerm();
        if (!hasReusedSound && !micPerm?.granted) requestMicPerm();
    }, []);

    useEffect(() => {
        return () => {
            referenceSound.current?.unloadAsync().catch(() => {});
        };
    }, []);

    const handleStartRecording = async () => {
        if (!cameraRef.current || isRecording) return;
        setIsRecording(true);

        if (hasReusedSound && audioUrl) {
            try {
                const { sound } = await Audio.Sound.createAsync(
                    { uri: audioUrl },
                    { shouldPlay: true, isLooping: true },
                );
                referenceSound.current = sound;
            } catch {
                // Sin sonido de referencia el usuario graba "a ciegas" del
                // tempo, pero no bloquea la grabación.
            }
        }

        try {
            const video = await cameraRef.current.recordAsync();
            if (video?.uri) setRecordedUri(video.uri);
        } finally {
            setIsRecording(false);
            await referenceSound.current?.stopAsync().catch(() => {});
            await referenceSound.current?.unloadAsync().catch(() => {});
            referenceSound.current = null;
        }
    };

    const handleStopRecording = () => {
        cameraRef.current?.stopRecording();
    };

    useEffect(() => {
        if (recordedUri) setPhase('review');
    }, [recordedUri]);

    const handleDiscard = () => {
        setRecordedUri(null);
        setCaption('');
        setPhase('record');
    };

    const handlePublish = async () => {
        if (!recordedUri) return;
        setPhase('publishing');
        try {
            let finalVideoUri = recordedUri;
            let originalAudioLocalUri: string | null = null;

            if (hasReusedSound && audioUrl) {
                if (Platform.OS === 'web' || !execute) {
                    throw new Error("El procesamiento de audio/video no está soportado en la versión web. Usá la app nativa (iOS/Android).");
                }
                // Bajar el audio del track (URL remota de Convex Storage) a
                // un archivo local — ffmpeg necesita paths de filesystem.
                const localAudio = await File.downloadFileAsync(audioUrl, Paths.cache);
                const muxed = new File(Paths.cache, `reel-mux-${Date.now()}.mp4`);
                await execute([
                    '-i', toFsPath(recordedUri),
                    '-i', toFsPath(localAudio.uri),
                    '-map', '0:v:0',
                    '-map', '1:a:0',
                    '-c:v', 'copy',
                    '-c:a', 'copy',
                    '-shortest',
                    '-y', toFsPath(muxed.uri),
                ]);
                finalVideoUri = muxed.uri;
            } else {
                if (Platform.OS !== 'web' && execute) {
                    // Video original: extraer el audio-solo para el nuevo
                    // `audioTracks` — remux puro, sin recodificar.
                    const audioOnly = new File(Paths.cache, `reel-audio-${Date.now()}.m4a`);
                    await execute([
                        '-i', toFsPath(recordedUri),
                        '-vn',
                        '-c:a', 'aac',
                        '-y', toFsPath(audioOnly.uri),
                    ]);
                    originalAudioLocalUri = audioOnly.uri;
                }
            }

            const uploadedVideo = await uploadLocalImageToConvex({
                uri: finalVideoUri,
                generateUploadUrl,
                registerUpload,
                purpose: 'social_post',
                sessionToken: sessionToken || '',
            });

            let originalAudioStorageId: string | undefined;
            if (originalAudioLocalUri) {
                const uploadedAudio = await uploadLocalImageToConvex({
                    uri: originalAudioLocalUri,
                    generateUploadUrl,
                    registerUpload,
                    purpose: 'social_post_audio',
                    sessionToken: sessionToken || '',
                });
                originalAudioStorageId = stripStorageRef(uploadedAudio);
            }

            await createPost({
                sessionToken: sessionToken || '',
                type: 'video',
                content: caption,
                videoUrl: uploadedVideo,
                ...(hasReusedSound ? { audioTrackId: audioTrackId as any } : {}),
                ...(originalAudioStorageId ? { originalAudioStorageId: originalAudioStorageId as any } : {}),
                ...(communityId ? { communityId: communityId as any } : {}),
            });

            show('¡Publicado con éxito!', 'success');
            navigation.goBack();
        } catch (error: any) {
            console.error('Error al publicar reel:', error);
            const message =
                (FFmpegError && error instanceof FFmpegError)
                    ? 'No se pudo procesar el video.'
                    : (error?.data?.message ?? error?.message ?? 'Hubo un error al publicar.');
            show(message, 'error');
            setPhase('review');
        }
    };

    if (!cameraPerm || (!hasReusedSound && !micPerm)) {
        return (
            <View style={[styles.center, { backgroundColor: c.bg }]}>
                <ActivityIndicator color={c.primary} />
            </View>
        );
    }

    if (!cameraPerm.granted || (!hasReusedSound && !micPerm?.granted)) {
        return (
            <View style={[styles.center, { backgroundColor: c.bg, padding: 24 }]}>
                <Text style={[styles.permText, { color: c.text }]}>
                    Necesitamos acceso a la cámara{hasReusedSound ? '' : ' y al micrófono'} para grabar.
                </Text>
                <TouchableOpacity
                    style={[styles.permBtn, { backgroundColor: c.primary }]}
                    onPress={() => {
                        requestCameraPerm();
                        if (!hasReusedSound) requestMicPerm();
                    }}
                >
                    <Text style={styles.permBtnText}>Dar permiso</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if ((phase === 'review' || phase === 'publishing') && recordedUri) {
        return (
            <View style={[styles.reviewContainer, { backgroundColor: '#000', paddingTop: insets.top }]}>
                <View style={styles.reviewHeader}>
                    <TouchableOpacity onPress={handleDiscard} style={styles.iconBtn} accessibilityLabel="Descartar">
                        <X size={26} color="#fff" />
                    </TouchableOpacity>
                </View>

                <View style={styles.reviewFooter}>
                    {hasReusedSound && (
                        <View style={styles.soundBadge}>
                            <Music2 size={14} color="#fff" />
                            <Text style={styles.soundBadgeText}>Sonido incorporado</Text>
                        </View>
                    )}
                    {communityId && communityName && (
                        <View style={styles.soundBadge}>
                            <Text style={styles.soundBadgeText}>Publicando en: {communityName}</Text>
                        </View>
                    )}
                    <TextInput
                        style={styles.captionInput}
                        placeholder="Escribí un texto..."
                        placeholderTextColor="rgba(255,255,255,0.6)"
                        value={caption}
                        onChangeText={setCaption}
                        multiline
                    />
                    <TouchableOpacity
                        style={[styles.publishBtn, { backgroundColor: c.primary }]}
                        onPress={handlePublish}
                        disabled={phase === 'publishing'}
                    >
                        <Text style={styles.publishBtnText}>Publicar</Text>
                    </TouchableOpacity>
                </View>

                {phase === 'publishing' && (
                    <View style={styles.publishingOverlay}>
                        <ActivityIndicator size="large" color="#fff" />
                        <Text style={styles.publishingText}>Procesando video...</Text>
                    </View>
                )}
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                mode="video"
                mute={hasReusedSound}
            />

            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Cerrar">
                    <X size={26} color="#fff" />
                </TouchableOpacity>
                {hasReusedSound && (
                    <View style={styles.soundBadge}>
                        <Music2 size={14} color="#fff" />
                        <Text style={styles.soundBadgeText} numberOfLines={1}>Sonido elegido</Text>
                    </View>
                )}
                <TouchableOpacity
                    onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
                    style={styles.iconBtn}
                    accessibilityLabel="Girar cámara"
                    disabled={isRecording}
                >
                    <RotateCcw size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
                <TouchableOpacity
                    style={styles.recordBtnOuter}
                    onPress={isRecording ? handleStopRecording : handleStartRecording}
                    accessibilityRole="button"
                    accessibilityLabel={isRecording ? 'Detener grabación' : 'Grabar'}
                >
                    {isRecording ? (
                        <Square size={28} color="#EF4444" fill="#EF4444" />
                    ) : (
                        <Circle size={64} color="#fff" fill="rgba(239,68,68,0.9)" />
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    permText: { fontSize: 16, textAlign: 'center', marginBottom: 16 },
    permBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.full },
    permBtnText: { color: '#fff', fontWeight: '700' },
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
    },
    iconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    soundBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: Radius.full,
        maxWidth: 160,
    },
    soundBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    recordBtnOuter: {
        width: 84,
        height: 84,
        borderRadius: 42,
        borderWidth: 4,
        borderColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    reviewContainer: { flex: 1 },
    reviewHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8 },
    reviewFooter: {
        position: 'absolute',
        bottom: 40,
        left: 16,
        right: 16,
        gap: 12,
    },
    captionInput: {
        color: '#fff',
        fontSize: 15,
        backgroundColor: 'rgba(0,0,0,0.4)',
        borderRadius: Radius.lg,
        padding: 12,
        maxHeight: 100,
    },
    publishBtn: {
        alignSelf: 'flex-end',
        paddingHorizontal: 28,
        paddingVertical: 14,
        borderRadius: Radius.full,
    },
    publishBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    publishingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    publishingText: { color: '#fff', fontSize: 14 },
});
