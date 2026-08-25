/**
 * Capa de video de un post del feed.
 *
 * Antes `PostCard` montaba, por cada post de video, DOS `VideoView` sobre el
 * mismo player — uno en `cover` de fondo y otro en `contain` adelante — con un
 * `BlurView` en el medio para difuminar el de atrás. Con seis videos en el
 * buffer de FlashList eso son doce superficies de video y seis pases de blur
 * POR FRAME: a diferencia del `blurRadius` de `Image` (que se hornea al
 * decodificar), `BlurView` es un desenfoque en vivo y es el costo dominante del
 * scroll en Android.
 *
 * Con el encuadre 4:5 de `PostMediaBox` el relleno difuminado deja de tener
 * sentido: un video vertical llena la caja con `cover`, así que alcanza con una
 * sola superficie y cero blur.
 *
 * Se monta DENTRO de `PostMediaBox`, que ya define el encuadre y el recorte.
 */
import { useVideoPlayer, VideoPlayer, VideoView } from 'expo-video';
import { Volume2, VolumeX } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { usePooledVideoPlayer, useHasVideoPool } from '../../hooks/useVideoPool';
import { safePause, safePlay, tuneLoopingPlayer } from '../../utils/videoPlayback';

function PostVideoSurface({
    player,
    isFocused,
    muted,
    onToggleMute,
}: {
    player: VideoPlayer | null;
    isFocused: boolean;
    muted: boolean;
    onToggleMute: () => void;
}) {
    useEffect(() => {
        if (!player) return;
        if (isFocused) safePlay(player);
        else safePause(player);
    }, [player, isFocused]);

    useEffect(() => {
        if (!player) return;
        // `muted` viaja aparte de `tuneLoopingPlayer` porque lo controla el
        // usuario con el botón de sonido, no el pool.
        try {
            player.muted = muted;
        } catch {
            // objeto nativo liberado
        }
    }, [player, muted]);

    return (
        <>
            {player ? (
                <VideoView
                    style={StyleSheet.absoluteFill}
                    player={player}
                    contentFit="cover"
                    nativeControls={false}
                />
            ) : (
                // Sin reproductor asignado todavía: la caja queda en su color de
                // fondo. No hay poster porque el modelo no guarda thumbnail.
                <View style={StyleSheet.absoluteFill} />
            )}
            <TouchableOpacity
                style={styles.muteBtn}
                onPress={onToggleMute}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={muted ? 'Activar sonido' : 'Silenciar'}
            >
                {muted ? <VolumeX size={16} color="#FFF" /> : <Volume2 size={16} color="#FFF" />}
            </TouchableOpacity>
        </>
    );
}

/** Variante de feed: el reproductor lo presta el pool compartido. */
function PooledPostVideo({
    postId,
    isFocused,
    muted,
    onToggleMute,
}: {
    postId: string;
    isFocused: boolean;
    muted: boolean;
    onToggleMute: () => void;
}) {
    const player = usePooledVideoPlayer(postId);
    return (
        <PostVideoSurface
            player={player}
            isFocused={isFocused}
            muted={muted}
            onToggleMute={onToggleMute}
        />
    );
}

/**
 * Variante suelta: fuera de un feed (detalle de post, perfil, preview) hay un
 * solo video en pantalla, así que tener reproductor propio no cuesta nada.
 */
function StandalonePostVideo({
    videoUrl,
    isFocused,
    muted,
    onToggleMute,
}: {
    videoUrl: string;
    isFocused: boolean;
    muted: boolean;
    onToggleMute: () => void;
}) {
    const player = useVideoPlayer(videoUrl, (p: VideoPlayer) => tuneLoopingPlayer(p, { muted: true }));
    return (
        <PostVideoSurface
            player={player}
            isFocused={isFocused}
            muted={muted}
            onToggleMute={onToggleMute}
        />
    );
}

export function PostVideo({
    postId,
    videoUrl,
    isFocused,
    muted,
    onToggleMute,
}: {
    postId: string;
    videoUrl: string;
    isFocused: boolean;
    muted: boolean;
    onToggleMute: () => void;
}) {
    const pooled = useHasVideoPool();

    // La rama es por presencia de pool, que es estable en todo el subárbol, así
    // que ningún componente cambia de identidad entre renders.
    return pooled ? (
        <PooledPostVideo
            postId={postId}
            isFocused={isFocused}
            muted={muted}
            onToggleMute={onToggleMute}
        />
    ) : (
        <StandalonePostVideo
            videoUrl={videoUrl}
            isFocused={isFocused}
            muted={muted}
            onToggleMute={onToggleMute}
        />
    );
}

const styles = StyleSheet.create({
    muteBtn: {
        position: 'absolute',
        right: 10,
        bottom: 10,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
