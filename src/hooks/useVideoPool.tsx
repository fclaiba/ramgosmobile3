/**
 * Pool de reproductores para un feed MIXTO (texto/imagen/video intercalados).
 *
 * `useVideoPlayerPool` no sirve acá: asigna slot con `postIndex % POOL_SIZE`,
 * que es una biyección sólo si la ventana son tres índices CONSECUTIVOS. En
 * Loops eso se cumple porque todos los items son video; en el feed principal
 * los videos están salteados, así que dos videos de la ventana pueden caer en
 * el mismo slot y pelearse el reproductor. Por eso acá la asignación es por
 * clave con desalojo LRU, y la ventana se calcula sobre la secuencia de videos,
 * no sobre la del feed.
 *
 * La otra diferencia es cómo se entrega el reproductor. Devolver un getter que
 * lee de un `ref` no alcanza: `PostCard` está memoizado y no se enteraría del
 * cambio de asignación, y hacer re-renderizar al feed entero para avisarle
 * volvería a invalidar `renderItem` — justo lo que evita `useFeedFocus`. Así
 * que el pool expone un store suscribible por clave y cada tarjeta escucha
 * solamente la suya.
 */
import { useVideoPlayer, VideoPlayer } from 'expo-video';
import { safePlay, tuneLoopingPlayer } from '../utils/videoPlayback';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useSyncExternalStore,
} from 'react';

const POOL_SIZE = 3;

type Listener = () => void;

export interface VideoPoolStore {
    getPlayer(key: string): VideoPlayer | null;
    subscribe(key: string, listener: Listener): () => void;
}

interface MutableVideoPoolStore extends VideoPoolStore {
    setPlayer(key: string, player: VideoPlayer | null): void;
}

function createVideoPoolStore(): MutableVideoPoolStore {
    const byKey = new Map<string, VideoPlayer>();
    const listeners = new Map<string, Set<Listener>>();

    const notify = (key: string) => {
        const forKey = listeners.get(key);
        if (!forKey) return;
        forKey.forEach((listener) => listener());
    };

    return {
        getPlayer: (key: string) => byKey.get(key) ?? null,

        setPlayer: (key: string, player: VideoPlayer | null) => {
            const prev = byKey.get(key) ?? null;
            if (prev === player) return;
            if (player) byKey.set(key, player);
            else byKey.delete(key);
            notify(key);
        },

        subscribe: (key: string, listener: Listener) => {
            let forKey = listeners.get(key);
            if (!forKey) {
                forKey = new Set();
                listeners.set(key, forKey);
            }
            forKey.add(listener);
            return () => {
                const current = listeners.get(key);
                if (!current) return;
                current.delete(listener);
                if (current.size === 0) listeners.delete(key);
            };
        },
    };
}

/**
 * Mantiene `POOL_SIZE` reproductores repartidos entre los videos cercanos al
 * que está en foco.
 *
 * `videoKeys` y `urlOf` tienen que ser estables (memoizados por quien llama):
 * son dependencias del efecto que mueve las fuentes.
 */
export function useVideoPool(
    videoKeys: string[],
    activeKey: string | null,
    urlOf: (key: string) => string | undefined,
): VideoPoolStore {
    const p0 = useVideoPlayer('', (p) => tuneLoopingPlayer(p, { muted: true }));
    const p1 = useVideoPlayer('', (p) => tuneLoopingPlayer(p, { muted: true }));
    const p2 = useVideoPlayer('', (p) => tuneLoopingPlayer(p, { muted: true }));

    const playersRef = useRef<VideoPlayer[]>([p0, p1, p2]);
    playersRef.current = [p0, p1, p2];

    const storeRef = useRef<MutableVideoPoolStore | null>(null);
    if (storeRef.current === null) storeRef.current = createVideoPoolStore();
    const store = storeRef.current;

    /** Qué clave tiene cargada cada slot ahora mismo. */
    const slotKey = useRef<Array<string | null>>([null, null, null]);
    /** Reloj lógico para el desalojo LRU. */
    const slotUsedAt = useRef<number[]>([0, 0, 0]);
    const clock = useRef(0);

    useEffect(() => {
        if (videoKeys.length === 0) return;

        // SEMILLA: hasta que la lista reporta qué está visible, `activeKey` es
        // null. Si el efecto saliera acá, el primer video recién empezaría a
        // cargar cuando el usuario YA lo está mirando — medio segundo de caja
        // negra en la primera impresión, que es la que más cuenta. Se arranca
        // sobre el primero de la lista para que llegue precargado.
        const effectiveActive = activeKey ?? videoKeys[0];
        const activeIdx = videoKeys.indexOf(effectiveActive);
        if (activeIdx < 0) return;

        // Prioridad: el que se está viendo, después el siguiente (pre-carga en
        // el sentido del scroll) y por último el anterior.
        const window: string[] = [];
        for (const i of [activeIdx, activeIdx + 1, activeIdx - 1]) {
            if (i >= 0 && i < videoKeys.length) window.push(videoKeys[i]);
        }

        // 1) Los que ya tienen slot lo conservan y se marcan como recién usados.
        const reserved = new Set<number>();
        for (const key of window) {
            const slot = slotKey.current.indexOf(key);
            if (slot >= 0) {
                reserved.add(slot);
                slotUsedAt.current[slot] = ++clock.current;
            }
        }

        // 2) Los que faltan desalojan al slot menos usado que no esté reservado.
        for (const key of window) {
            if (slotKey.current.includes(key)) continue;
            const url = urlOf(key);
            if (!url) continue;

            let victim = -1;
            for (let slot = 0; slot < POOL_SIZE; slot++) {
                if (reserved.has(slot)) continue;
                if (victim === -1 || slotUsedAt.current[slot] < slotUsedAt.current[victim]) victim = slot;
            }
            if (victim === -1) break;

            const evicted = slotKey.current[victim];
            if (evicted) store.setPlayer(evicted, null);

            reserved.add(victim);
            slotKey.current[victim] = key;
            slotUsedAt.current[victim] = ++clock.current;

            const player = playersRef.current[victim];
            player.replaceAsync(url)
                .then(() => {
                    // Puede haber sido desalojado mientras cargaba.
                    if (slotKey.current[victim] !== key) return;
                    // Cambiar la fuente es el momento de re-afirmar el loop.
                    tuneLoopingPlayer(player, { muted: true });
                    store.setPlayer(key, player);
                    // Si además es el que se está viendo, se arranca acá mismo
                    // en vez de esperar a que la tarjeta re-renderice y su
                    // efecto de foco lo dispare: ese ida y vuelta es
                    // exactamente la demora que se siente al entrar.
                    if (key === activeKey) safePlay(player);
                })
                .catch(() => {
                    if (slotKey.current[victim] === key) {
                        slotKey.current[victim] = null;
                        store.setPlayer(key, null);
                    }
                });
        }
    }, [activeKey, videoKeys, urlOf, store]);

    return store;
}

const VideoPoolContext = createContext<VideoPoolStore | null>(null);

export function VideoPoolProvider({
    store,
    children,
}: {
    store: VideoPoolStore;
    children: React.ReactNode;
}) {
    return <VideoPoolContext.Provider value={store}>{children}</VideoPoolContext.Provider>;
}

/** `true` cuando hay un pool alrededor, para elegir qué variante de video montar. */
export function useHasVideoPool(): boolean {
    return useContext(VideoPoolContext) !== null;
}

const NOOP_UNSUBSCRIBE = () => {};

/** Reproductor asignado a esta clave, o `null` si el pool todavía no le dio uno. */
export function usePooledVideoPlayer(key: string): VideoPlayer | null {
    const store = useContext(VideoPoolContext);

    const subscribe = useCallback(
        (listener: Listener) => (store ? store.subscribe(key, listener) : NOOP_UNSUBSCRIBE),
        [store, key],
    );
    const getSnapshot = useCallback(() => (store ? store.getPlayer(key) : null), [store, key]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
