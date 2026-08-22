import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';

export type SocialFeedMode = 'forYou' | 'following' | 'videos' | 'recent';

export interface UseSocialFeedOptions {
    /** Restringe el feed a un autor — pantallas de perfil. */
    authorUserId?: string;
    mode?: SocialFeedMode;
    pageSize?: number;
    /** Cambiar este valor fuerza un `refresh()` (ej: se creó un post nuevo
     *  desde un composer que vive FUERA de este hook). */
    refreshKey?: string | number;
    /** B2: si viene seteado, el feed sale de `getCommunityFeed` en vez de
     *  `getFeed` — mismo shape de página (`{items, nextCursor}`), así que
     *  toda la paginación/dedupe de abajo se reusa sin cambios. Anula
     *  `authorUserId`/`mode`. */
    communityId?: string;
}

/**
 * Paginación por cursor de `api.social.getFeed`, unificada.
 *
 * Antes esta misma lógica (cursor + acumulación de páginas + dedupe por
 * `_id` + reset al cambiar de identidad) vivía duplicada TRES veces:
 * `UnifiedFeed.tsx`, `SocialScreen.tsx` y `LoopFeed.tsx`, cada una con su
 * propia variante de los mismos bugs potenciales (cursor repetido, página
 * vieja no descartada al cambiar de modo). Ahora las tres consumen esto.
 */
export const useSocialFeed = ({ authorUserId, mode, pageSize = 20, refreshKey, communityId }: UseSocialFeedOptions = {}) => {
    const { sessionToken } = useAuth();

    const [cursor, setCursor] = useState<string | undefined>(undefined);
    const [olderPages, setOlderPages] = useState<Array<{ cursor: string; items: any[] }>>([]);
    const [exhausted, setExhausted] = useState(false);

    // Dos `useQuery` incondicionales (una de las dos siempre en 'skip') en
    // vez de elegir el hook a llamar — Convex/React no permite condicionar
    // CUÁL hook se llama, sólo sus args (mismo patrón ya usado en
    // `SoundDetailsScreen`).
    const globalPage = useQuery(
        api.social.getFeed,
        sessionToken && !communityId
            ? {
                  sessionToken,
                  limit: pageSize,
                  cursor,
                  ...(authorUserId ? { authorUserId } : {}),
                  ...(mode ? { mode } : {}),
              }
            : 'skip',
    );
    const communityPage = useQuery(
        api.social.communities.getCommunityFeed,
        sessionToken && communityId
            ? { sessionToken, communityId: communityId as any, limit: pageSize, cursor }
            : 'skip',
    );
    const page = communityId ? communityPage : globalPage;

    // Reset al cambiar de identidad del feed (autor, modo, comunidad,
    // sesión, o un `refreshKey` externo — ej: se creó un post nuevo).
    useEffect(() => {
        setCursor(undefined);
        setOlderPages([]);
        setExhausted(false);
    }, [authorUserId, mode, communityId, sessionToken, refreshKey]);

    // Pliega cada página nueva (más allá de la primera, que es reactiva) a
    // la cola acumulada.
    useEffect(() => {
        if (!page) return;
        // Si no hay cursor (página 1), la guardamos con cursor 'first' o vacío para no perderla
        const pageCursor = cursor || 'first';
        setOlderPages((prev) =>
            prev.some((p) => p.cursor === pageCursor) ? prev : [...prev, { cursor: pageCursor, items: page.items }],
        );
        if (!page.nextCursor) setExhausted(true);
    }, [page, cursor]);

    // El dedupe por `_id` cubre además los reposts entre páginas sin lógica
    // extra: el servidor sustituye el espejo por el post ORIGINAL, así que un
    // repost llega con el `_id` del original y colisiona solo con él si los
    // dos caen en la misma lista (ej. el original en la página 1 y el repost
    // en la 2). El servidor ya deduplica dentro de cada página.
    const posts = useMemo(() => {
        const livePage = cursor ? [] : page?.items ?? [];
        const tail = olderPages.flatMap((p) => p.items);
        const seen = new Set<string>();
        return [...livePage, ...tail].filter((item) => {
            const id = String(item?._id ?? '');
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }, [page, cursor, olderPages]);

    const isLoadingFirstPage = page === undefined && olderPages.length === 0;

    const refresh = useCallback(() => {
        setCursor(undefined);
        setOlderPages([]);
        setExhausted(false);
    }, []);

    const loadMore = useCallback(() => {
        if (exhausted || !page?.nextCursor) return;
        if (page.nextCursor === cursor) return;
        setCursor(page.nextCursor);
    }, [exhausted, page, cursor]);

    // Registro de impresiones, batched y deduplicado del lado del cliente —
    // `addView` ya es idempotente server-side, esto sólo evita mandar la
    // misma llamada de nuevo en cada render.
    const viewedIds = useRef<Set<string>>(new Set());
    useEffect(() => {
        viewedIds.current = new Set();
    }, [authorUserId, mode, communityId, sessionToken, refreshKey]);

    return {
        posts,
        isLoadingFirstPage,
        exhausted,
        loadMore,
        refresh,
        viewedIds,
        nextCursor: page?.nextCursor ?? null,
    };
};
