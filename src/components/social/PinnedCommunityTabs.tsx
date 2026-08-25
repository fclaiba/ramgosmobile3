/**
 * Carga las comunidades fijadas SIN poder tumbar la pantalla.
 *
 * `useQuery` de Convex re-lanza los errores del servidor durante el render, y
 * `SocialScreen` no tiene boundary propia: el error sube hasta `CrashHandler`
 * y se lleva puesta la app entera. Ya pasó — con el cliente pidiendo
 * `listPinnedCommunities` contra un deployment que todavía no la tenía
 * publicada, toda la pestaña Social quedó en pantalla de error.
 *
 * Las comunidades fijadas son cromo opcional de la barra de tabs. Que fallen
 * debe costar esas tabs, no el feed. Por eso la query vive en un componente
 * hijo aislado detrás de una boundary: si revienta, se reporta lista vacía y
 * quedan las tres tabs fijas, que no dependen de ninguna query.
 *
 * Cubre la ventana en que el cliente va más nuevo que el backend — que es
 * exactamente lo que pasa entre `git pull` y `npx convex dev`.
 */
import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';

export interface PinnedCommunity {
    communityId: string;
    name: string;
    coverImage?: string;
    pinnedOrder: number;
}

class PinnedTabsBoundary extends React.Component<
    { onFailure: () => void; children: React.ReactNode },
    { failed: boolean }
> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: unknown) {
        // No se re-lanza: la degradación es el comportamiento buscado. Se deja
        // registro para que el fallo no pase inadvertido en desarrollo.
        console.warn('[PinnedCommunityTabs] no se pudieron cargar las comunidades fijadas', error);
        this.props.onFailure();
    }

    render() {
        return this.state.failed ? null : this.props.children;
    }
}

function PinnedTabsLoader({ onLoaded }: { onLoaded: (rows: PinnedCommunity[]) => void }) {
    const { sessionToken } = useAuth();
    const pinned = useQuery(
        api.social.communityAccess.listPinnedCommunities,
        sessionToken ? { sessionToken } : 'skip',
    );

    React.useEffect(() => {
        if (pinned === undefined) return;
        onLoaded(pinned as PinnedCommunity[]);
    }, [pinned, onLoaded]);

    return null;
}

/**
 * No dibuja nada: sólo alimenta `onLoaded`. Se monta al lado de la tab bar y
 * quien la usa arma los descriptores con lo que recibe.
 */
export function PinnedCommunityTabs({ onLoaded }: { onLoaded: (rows: PinnedCommunity[]) => void }) {
    const handleFailure = React.useCallback(() => onLoaded([]), [onLoaded]);
    return (
        <PinnedTabsBoundary onFailure={handleFailure}>
            <PinnedTabsLoader onLoaded={onLoaded} />
        </PinnedTabsBoundary>
    );
}
