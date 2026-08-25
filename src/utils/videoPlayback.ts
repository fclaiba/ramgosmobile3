/**
 * Ajustes de reproducción compartidos por los dos feeds de video.
 *
 * El objetivo es que un video empiece a verse apenas aparece, y que no se
 * corte: un feed que tarda medio segundo en arrancar se siente roto aunque
 * técnicamente funcione.
 *
 * Los dos pools (`useVideoPlayerPool` para Loops, `useVideoPool` para el feed
 * mixto) aplican esto en el mismo sitio para no divergir.
 */
import { Platform } from 'react-native';
import type { VideoPlayer } from 'expo-video';

/**
 * Prioriza arrancar rápido por sobre acumular colchón.
 *
 * - `minBufferForPlayback` bajo: empieza con lo mínimo en vez de esperar.
 * - `waitsToMinimizeStalling: false`: en iOS, `AVPlayer` por defecto retrasa
 *   el arranque para evitar un posible corte más adelante. En un feed donde
 *   el usuario pasa al siguiente en dos segundos, ese cálculo está al revés.
 * - `preferredForwardBufferDuration` corto: no tiene sentido bufferear 30 s
 *   de un video que probablemente se descarte enseguida — y multiplicado por
 *   los tres reproductores del pool, es ancho de banda tirado.
 *
 * En web es un objeto inerte: `expo-video` lo declara sólo para cumplir la
 * interfaz y el `<video>` de HTML maneja su propio buffer.
 */
export const FEED_BUFFER_OPTIONS = {
    minBufferForPlayback: 0.25,
    preferredForwardBufferDuration: 4,
    waitsToMinimizeStalling: false,
} as const;

/**
 * Los métodos de `expo-video` tiran si el objeto nativo ya fue liberado —
 * pasa al desmontar una pantalla con un efecto en vuelo. No hay nada que
 * hacer salvo no romper el render.
 */
function safely(run: () => void) {
    try {
        run();
    } catch {
        // objeto nativo liberado
    }
}

/**
 * Deja el reproductor en loop y listo para arrancar.
 *
 * Se llama al crear el player Y después de cada `replaceAsync`: cambiar la
 * fuente es justo el momento en que conviene re-afirmar `loop`, porque es el
 * único punto donde el reproductor podría quedar sin él y el video terminaría
 * en negro en vez de volver a empezar.
 */
export function tuneLoopingPlayer(player: VideoPlayer, opts?: { muted?: boolean }) {
    safely(() => {
        player.loop = true;
        if (opts?.muted !== undefined) player.muted = opts.muted;
        if (Platform.OS !== 'web') {
            (player as any).bufferOptions = FEED_BUFFER_OPTIONS;
        }
    });
}

/** `play()` que no rompe si el reproductor ya no existe. */
export function safePlay(player: VideoPlayer | null | undefined) {
    if (!player) return;
    safely(() => player.play());
}

/** `pause()` que no rompe si el reproductor ya no existe. */
export function safePause(player: VideoPlayer | null | undefined) {
    if (!player) return;
    safely(() => player.pause());
}
