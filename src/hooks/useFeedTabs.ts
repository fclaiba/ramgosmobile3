/**
 * Tabs de fuente del feed y su estado.
 *
 * Las tres fijas ("Para ti", "Siguiendo", "Comunidades") salen de acá, y las
 * comunidades FIJADAS por el usuario se suman al final como tabs propias — el
 * modelo de X. Sumar una es empujar un descriptor, así que la tab bar no
 * cambia.
 *
 * Este hook NO consulta a Convex a propósito. Las fijadas llegan por
 * parámetro, cargadas por `PinnedCommunityTabs`, que aísla esa query detrás de
 * una error boundary. Si el hook las pidiera acá, un error del servidor se
 * propagaría desde el render de `SocialScreen` hasta `CrashHandler` y tumbaría
 * la app entera por unas tabs opcionales — que es exactamente lo que pasó.
 */
import { useCallback, useMemo, useState } from 'react';
import type { FeedTabDescriptor } from '../components/social/FeedTabBar';
import type { PinnedCommunity } from '../components/social/PinnedCommunityTabs';
import type { SocialFeedMode } from './useSocialFeed';

/** Qué feed pedir para la tab activa. */
export interface FeedSource {
    mode?: SocialFeedMode;
    /** Presente = una comunidad puntual (tab fijada). */
    communityId?: string;
}

const FIXED_TABS: FeedTabDescriptor[] = [
    { key: 'forYou', label: 'Para ti' },
    { key: 'following', label: 'Siguiendo' },
    { key: 'communities', label: 'Comunidades' },
];

/** Prefijo de las tabs de comunidad fijada, para no chocar con las fijas. */
const PINNED_PREFIX = 'community:';

export function useFeedTabs(pinned: PinnedCommunity[] = []) {
    const [activeKey, setActiveKey] = useState<string>('forYou');

    const tabs = useMemo<FeedTabDescriptor[]>(
        () => [
            ...FIXED_TABS,
            ...pinned.map((p) => ({
                key: `${PINNED_PREFIX}${p.communityId}`,
                label: p.name,
                pinnable: true,
            })),
        ],
        [pinned],
    );

    /**
     * Si la tab activa desaparece — se desfijó la comunidad, se salió de ella
     * desde otra pantalla, o la query de fijadas falló — el feed quedaría
     * pidiendo una fuente que ya no existe. Se vuelve a "Para ti" en el mismo
     * render, sin efecto ni parpadeo.
     */
    const safeActiveKey = useMemo(
        () => (tabs.some((t) => t.key === activeKey) ? activeKey : 'forYou'),
        [tabs, activeKey],
    );

    const sourceFor = useCallback((key: string): FeedSource => {
        if (key.startsWith(PINNED_PREFIX)) {
            return { communityId: key.slice(PINNED_PREFIX.length) };
        }
        return { mode: key as SocialFeedMode };
    }, []);

    const communityIdOf = useCallback(
        (key: string): string | null =>
            key.startsWith(PINNED_PREFIX) ? key.slice(PINNED_PREFIX.length) : null,
        [],
    );

    return {
        tabs,
        activeKey: safeActiveKey,
        setActiveKey,
        source: sourceFor(safeActiveKey),
        sourceFor,
        communityIdOf,
    };
}
