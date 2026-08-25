/**
 * Intercepta los links de comunidad que abren la app.
 *
 * Clon del patrón de `useBonoDeepLinkHandler`: escucha `Linking` de
 * react-native (no `expo-linking`, que el repo no usa), cubre el arranque en
 * frío con `getInitialURL()` y reintenta a 400 ms si el `navigationRef`
 * todavía no está listo — que es el caso normal cuando el link ABRE la app en
 * vez de traerla del fondo.
 *
 * Con token de invitación abre el modal directamente (`openCommunityJoin`);
 * sin token deja que la navegación normal lleve al detalle, que ya sabe qué
 * mostrar según la visibilidad.
 */
import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import { parseCommunityDeepLink, parseShortInviteLink } from '../utils/communityDeepLink';
import { openCommunityJoin } from '../navigation/openCommunityJoin';

const NAV_RETRY_MS = 400;

export function useCommunityDeepLinkHandler(navigationRef: any) {
    // Un mismo link puede llegar por `getInitialURL` y por el listener; sin
    // esto el modal se abriría dos veces.
    const handled = useRef<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const timers: Array<ReturnType<typeof setTimeout>> = [];

        const handle = (url: string | null | undefined) => {
            if (cancelled || !url || handled.current === url) return;

            // La forma corta `/i/{código}` va primero: no trae id de comunidad,
            // así que `parseCommunityDeepLink` la ignora.
            const short = parseShortInviteLink(url);
            const long = short ? null : parseCommunityDeepLink(url);

            const inviteToken = short?.inviteToken ?? long?.inviteToken;
            // Sin token no hay nada que interceptar: el resolver de
            // `getStateFromPath` ya manda a `CommunityDetail`.
            if (!inviteToken) return;
            handled.current = url;

            const open = () =>
                openCommunityJoin({
                    communityIdOrSlug: long?.communityIdOrSlug,
                    inviteToken,
                    referralCode: short?.referralCode ?? long?.referralCode,
                });

            if (navigationRef?.isReady?.()) {
                open();
            } else {
                // Arranque en frío: el navigator todavía no montó.
                timers.push(setTimeout(open, NAV_RETRY_MS));
            }
        };

        const subscription = Linking.addEventListener('url', ({ url }) => handle(url));

        if (Platform.OS === 'web') {
            handle(typeof window !== 'undefined' ? window.location?.href : null);
        } else {
            Linking.getInitialURL()
                .then(handle)
                .catch(() => {
                    // Sin URL inicial no hay nada que hacer.
                });
        }

        return () => {
            cancelled = true;
            timers.forEach(clearTimeout);
            subscription.remove();
        };
    }, [navigationRef]);
}
