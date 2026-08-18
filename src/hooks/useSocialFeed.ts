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
export const useSocialFeed = ({ authorUserId, mode, pageSize = 20 }: UseSocialFeedOptions = {}) => {
    const { sessionToken } = useAuth();

    const [cursor, setCursor] = useState<string | undefined>(undefined);
    const [olderPages, setOlderPages] = useState<Array<{ cursor: string; items: any[] }>>([]);
    const [exhausted, setExhausted] = useState(false);

    const page = useQuery(
        api.social.getFeed,
        sessionToken
            ? {
                  sessionToken,
                  limit: pageSize,
                  cursor,
                  ...(authorUserId ? { authorUserId } : {}),
                  ...(mode ? { mode } : {}),
              }
            : 'skip',
    );

    // Reset al cambiar de identidad del feed (autor, modo, o sesión).
    useEffect(() => {
        setCursor(undefined);
        setOlderPages([]);
        setExhausted(false);
    }, [authorUserId, mode, sessionToken]);

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
    }, [authorUserId, mode, sessionToken]);

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
