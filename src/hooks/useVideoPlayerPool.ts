import { useVideoPlayer, VideoPlayer } from 'expo-video';
import { useEffect, useRef } from 'react';

const POOL_SIZE = 3;

/**
 * Pool fijo de `POOL_SIZE` reproductores `expo-video`, compartidos por todo
 * un feed vertical de video (Loops/Reels) — en vez de uno por card
 * (`useVideoPlayer` por instancia, se crea y se destruye en cada
 * montaje/desmontaje del `FlatList`). Antes de esto, `LoopItem` ni siquiera
 * usaba `expo-video`: seguía en `expo-av` (deprecado), sin ningún tipo de
 * pre-carga del siguiente video.
 *
 * `useVideoPlayer` empieza a bufferear su fuente apenas se crea, sin
 * esperar a `.play()`. La ganancia real del pool es DOBLE:
 *   1. No se pierde ese buffer al hacer scroll — `replaceAsync` cambia la
 *      fuente del MISMO reproductor en vez de crear uno nuevo.
 *   2. El video siguiente (`activeIndex + 1`) ya tiene reproductor asignado
 *      ANTES de que su card se vuelva la activa, así llega con la carga
 *      adelantada.
 *
 * Los 3 `useVideoPlayer(...)` se llaman siempre, sin condicionales ni loop
 * (Rules of Hooks) — el pool nunca crece con el largo del feed.
 *
 * La asignación slot = `postIndex % POOL_SIZE` es determinística y, para
 * cualquier ventana de 3 índices consecutivos (`activeIndex - 1..+1`), cae
 * siempre en 3 slots DISTINTOS (3 enteros consecutivos mod 3 son una
 * biyección sobre {0,1,2}) — no hay colisión posible dentro de la ventana
 * que este hook mantiene viva.
 */
export function useVideoPlayerPool(
    urls: Array<string | undefined>,
    activeIndex: number,
): (postIndex: number) => VideoPlayer | null {
    const p0 = useVideoPlayer('', (p) => { p.loop = true; });
    const p1 = useVideoPlayer('', (p) => { p.loop = true; });
    const p2 = useVideoPlayer('', (p) => { p.loop = true; });

    const playersRef = useRef<VideoPlayer[]>([p0, p1, p2]);
    playersRef.current = [p0, p1, p2];

    // Qué índice de post tiene cargado cada slot ahora mismo — evita
    // `replaceAsync` redundante cuando el efecto vuelve a correr sin que la
    // ventana haya cambiado de verdad.
    const loadedIndex = useRef<Array<number | null>>([null, null, null]);

    useEffect(() => {
        const window = [activeIndex - 1, activeIndex, activeIndex + 1];
        for (const postIndex of window) {
            if (postIndex < 0 || postIndex >= urls.length) continue;
            const url = urls[postIndex];
            if (!url) continue;
            const slot = ((postIndex % POOL_SIZE) + POOL_SIZE) % POOL_SIZE;
            if (loadedIndex.current[slot] === postIndex) continue;
            loadedIndex.current[slot] = postIndex;
            playersRef.current[slot].replaceAsync(url).catch(() => {
                // Si falla la carga (fuente inválida, red), no reintenta acá
                // — el slot queda libre para el próximo índice que lo pida.
                if (loadedIndex.current[slot] === postIndex) loadedIndex.current[slot] = null;
            });
        }
    }, [activeIndex, urls]);

    return (postIndex: number): VideoPlayer | null => {
        const slot = ((postIndex % POOL_SIZE) + POOL_SIZE) % POOL_SIZE;
        return loadedIndex.current[slot] === postIndex ? playersRef.current[slot] : null;
    };
}
