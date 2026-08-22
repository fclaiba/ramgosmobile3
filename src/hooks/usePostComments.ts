import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';

/**
 * Paginación por cursor de `api.social.getCommentsForPost`.
 *
 * Mismo patrón que `useSocialFeed` (página 1 reactiva + cola acumulada +
 * dedupe por `_id`), extraído a un hook en vez de copiarlo por cuarta vez
 * dentro de `PostCommentsModal` — el modal pedía `limit: 100` sin cursor, así
 * que en un post con más de 100 comentarios el resto era inalcanzable.
 *
 * `markDeleted` existe porque la cola acumulada es una foto vieja: un
 * comentario borrado desaparece de la página reactiva pero sobrevive en las
 * páginas ya plegadas, y volvería a aparecer al re-renderizar.
 */
export const usePostComments = (postId?: string, pageSize = 20) => {
    const { sessionToken } = useAuth();

    const [cursor, setCursor] = useState<string | undefined>(undefined);
    const [olderPages, setOlderPages] = useState<Array<{ cursor: string; items: any[] }>>([]);
    const [exhausted, setExhausted] = useState(false);
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

    const page = useQuery(
        api.social.getCommentsForPost,
        sessionToken && postId
            ? { sessionToken, postId: postId as any, limit: pageSize, cursor }
            : 'skip',
    );

    // Reset al cambiar de post o de sesión.
    useEffect(() => {
        setCursor(undefined);
        setOlderPages([]);
        setExhausted(false);
        setDeletedIds(new Set());
    }, [postId, sessionToken]);

    useEffect(() => {
        if (!page) return;
        const pageCursor = cursor || 'first';
        setOlderPages((prev) =>
            prev.some((p) => p.cursor === pageCursor)
                ? prev
                : [...prev, { cursor: pageCursor, items: page.items }],
        );
        if (!page.nextCursor) setExhausted(true);
    }, [page, cursor]);

    const comments = useMemo(() => {
        const livePage = cursor ? [] : (page?.items ?? []);
        const tail = olderPages.flatMap((p) => p.items);
        const seen = new Set<string>();
        return [...livePage, ...tail].filter((item) => {
            const id = String(item?._id ?? '');
            if (!id || seen.has(id) || deletedIds.has(id)) return false;
            seen.add(id);
            return true;
        });
    }, [page, cursor, olderPages, deletedIds]);

    const markDeleted = useCallback((id: string) => {
        setDeletedIds((prev) => new Set(prev).add(id));
    }, []);

    const unmarkDeleted = useCallback((id: string) => {
        setDeletedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    const loadMore = useCallback(() => {
        if (exhausted || !page?.nextCursor || page.nextCursor === cursor) return;
        setCursor(page.nextCursor);
    }, [exhausted, page, cursor]);

    return {
        comments,
        /** Sólo la primera carga — al paginar ya hay contenido en pantalla. */
        isLoading: page === undefined && olderPages.length === 0,
        hasMore: Boolean(page?.nextCursor) && !exhausted,
        loadMore,
        markDeleted,
        unmarkDeleted,
    };
};
