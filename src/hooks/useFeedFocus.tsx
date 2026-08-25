/**
 * Foco de los items del feed, fuera del árbol de React.
 *
 * Antes `UnifiedFeed` guardaba los ids visibles en estado y `renderItem`
 * dependía de ese `Set`, así que cada cambio de viewport le daba una identidad
 * nueva y FlashList re-renderizaba todas las filas montadas. Con un store
 * externo cada tarjeta se suscribe sólo a su propio id: al scrollear
 * re-renderizan las dos o tres que de verdad cambiaron de estado.
 *
 * El store es por instancia de lista y no un singleton de módulo (a diferencia
 * de `sessionTokenStore`) porque el stack mantiene varias pantallas montadas a
 * la vez — Social, detalle de comunidad, perfiles — y cada una tiene su propio
 * feed. Un singleton haría que la lista de atrás marque como enfocados los
 * videos que nadie está viendo.
 */
import React, {
    createContext,
    useCallback,
    useContext,
    useRef,
    useSyncExternalStore,
} from 'react';

type Listener = () => void;

export interface FeedFocusStore {
    isFocused(id: string): boolean;
    /** Reemplaza el conjunto visible completo. Notifica sólo lo que cambió. */
    setVisible(ids: Iterable<string>): void;
    subscribe(id: string, listener: Listener): () => void;
}

export function createFeedFocusStore(): FeedFocusStore {
    let visible = new Set<string>();
    const listeners = new Map<string, Set<Listener>>();

    const notify = (id: string) => {
        const forId = listeners.get(id);
        if (!forId) return;
        forId.forEach((listener) => listener());
    };

    return {
        isFocused: (id: string) => visible.has(id),

        setVisible: (ids: Iterable<string>) => {
            const next = new Set(ids);
            const prev = visible;

            // Diferencia simétrica: los que entraron y los que salieron. Lo que
            // sigue visible no se toca, que es el caso común al scrollear.
            const changed: string[] = [];
            next.forEach((id) => {
                if (!prev.has(id)) changed.push(id);
            });
            prev.forEach((id) => {
                if (!next.has(id)) changed.push(id);
            });
            if (changed.length === 0) return;

            // El swap va antes de notificar: `getSnapshot` tiene que devolver el
            // valor nuevo cuando React reacciona a la notificación.
            visible = next;
            changed.forEach(notify);
        },

        subscribe: (id: string, listener: Listener) => {
            let forId = listeners.get(id);
            if (!forId) {
                forId = new Set();
                listeners.set(id, forId);
            }
            forId.add(listener);
            return () => {
                const current = listeners.get(id);
                if (!current) return;
                current.delete(listener);
                if (current.size === 0) listeners.delete(id);
            };
        },
    };
}

const FeedFocusContext = createContext<FeedFocusStore | null>(null);

export function FeedFocusProvider({
    store,
    children,
}: {
    store: FeedFocusStore;
    children: React.ReactNode;
}) {
    return <FeedFocusContext.Provider value={store}>{children}</FeedFocusContext.Provider>;
}

/** Store estable para una lista, creado una sola vez por instancia. */
export function useFeedFocusStore(): FeedFocusStore {
    const ref = useRef<FeedFocusStore | null>(null);
    if (ref.current === null) ref.current = createFeedFocusStore();
    return ref.current;
}

const NOOP_UNSUBSCRIBE = () => {};

/**
 * Devuelve si el item está en foco, o `null` cuando no hay feed alrededor — así
 * el consumidor cae a su prop `isFocused` y sigue funcionando suelto (detalle
 * de post, perfiles, previews).
 */
export function useFeedFocus(id: string): boolean | null {
    const store = useContext(FeedFocusContext);

    const subscribe = useCallback(
        (listener: Listener) => (store ? store.subscribe(id, listener) : NOOP_UNSUBSCRIBE),
        [store, id],
    );
    const getSnapshot = useCallback(() => (store ? store.isFocused(id) : null), [store, id]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
