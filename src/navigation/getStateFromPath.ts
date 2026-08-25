/**
 * Resolver de deep links de la app.
 *
 * Vivía inline dentro del `linking` de `App.tsx` y SIN UN SOLO TEST, pese a
 * ser la pieza que decide a qué pantalla entra cada link compartido. Ya costó
 * plata una vez: en E-089 esta función descartaba el `?ref=` de las URLs de
 * producto, así que los links de influencer abrían el producto pero nadie
 * cobraba la comisión. Extraerlo acá es lo que permite blindarlo con
 * `__tests__/getStateFromPath.test.ts`.
 *
 * ORDEN DE RESOLUCIÓN — importa, y cambiarlo rompe cosas:
 *
 *   1. Bono           `/ref/{code}?bono=ID`, `ramgos://bono/ID?ref=CODE`
 *   2. Comunidad      `/c/{idOrSlug}[?invite=TOKEN][&ref=CODE]`
 *   3. Invitación     `/i/{código}` — la forma corta, la que se comparte
 *   4. Directorio     `/comunidades`
 *   5. Handles        `/{handle}` y `/{handle}/{slug}?ref=CODE`
 *   6. Fallback       el resolver de React Navigation
 *
 * La rama de comunidad va DESPUÉS de la de bono (que ya devuelve `null` para
 * esta forma) y ANTES de la de handles, que es la que se comería `/c/abc` como
 * si `c` fuera el handle de un perfil comercial.
 */
import { parseBonoDeepLink } from '../utils/bonoDeepLink';
import {
    isCommunityDirectoryLink,
    parseCommunityDeepLink,
    parseShortInviteLink,
} from '../utils/communityDeepLink';

type NavigationState = { routes: Array<{ name: string; params?: Record<string, any> }> };
type Fallback = (path: string, options?: any) => any;

/**
 * Primeros segmentos que YA significan otra cosa y por lo tanto no pueden
 * interpretarse como el handle de un perfil comercial.
 *
 * `c` y `comunidades` son nuevos: sin ellos, `/c/abc` caía en la rama de dos
 * segmentos y abría `ProductDetail{handle:'c', slug:'abc'}`, y `/comunidades`
 * abría el perfil del usuario "comunidades".
 */
export const RESERVED_PATHS = [
    'welcome',
    'home',
    'signup',
    'login',
    'item',
    'ref',
    'bono',
    'p',
    'c',
    'i',
    'comunidades',
] as const;

/**
 * `true` si el segmento parece el NOMBRE de una pantalla y no el handle de un
 * usuario.
 *
 * En web, React Navigation reescribe la URL en cada navegación. Para una
 * pantalla que no está declarada en `linking.config` no tiene patrón de path,
 * así que cae al nombre de la pantalla: la URL queda en `/ProductDetail`,
 * `/CommunitySettings`, `/CartScreen`… Al re-parsear esa URL, la rama de
 * handles la tomaba como un usuario y mostraba "Perfil no disponible".
 *
 * La causa de fondo se arregla declarando las pantallas en `linking.config`;
 * esto es la red de seguridad para las ~70 que no lo están.
 *
 * Heurística: los nombres de pantalla del proyecto son PascalCase sin números
 * ni guiones (`ProductDetail`), y los handles se comparten en minúscula. El
 * caso ambiguo sería un handle PascalCase de una sola palabra tipo `Fran`; se
 * acota exigiendo DOS tramos en mayúscula (`FranLopez` sí, `Fran` no), que es
 * la forma que realmente generan los nombres de pantalla.
 */
function looksLikeScreenName(segment: string): boolean {
    return /^[A-Z][a-z0-9]*[A-Z][A-Za-z0-9]*$/.test(segment);
}

/** Lee `?ref=` de una query cruda. Ver E-089: perderlo cuesta comisiones. */
function readReferralCode(queryString: string): string | undefined {
    const raw = queryString
        .split('&')
        .map((pair) => pair.split('='))
        .find(([key]) => key === 'ref')?.[1];
    if (!raw) return undefined;
    try {
        return decodeURIComponent(raw) || undefined;
    } catch {
        return raw || undefined;
    }
}

export function createAppGetStateFromPath(fallback: Fallback) {
    return function getStateFromPath(path: string, options?: any): any {
        // 1. Bono + referido.
        const bono = parseBonoDeepLink(path);
        if (bono?.listingId) {
            return {
                routes: [
                    {
                        name: 'ItemDetail',
                        params: {
                            itemId: bono.listingId,
                            referralCode: bono.referralCode || undefined,
                        },
                    },
                ],
            } as NavigationState;
        }

        // 2. Comunidad, con o sin invitación. El `ref` viaja igual que en el
        //    resto de las ramas: un link de comunidad compartido por un
        //    influencer no debe perder la atribución.
        const community = parseCommunityDeepLink(path);
        if (community?.communityIdOrSlug) {
            return {
                routes: [
                    {
                        name: 'CommunityDetail',
                        params: {
                            communityId: community.communityIdOrSlug,
                            inviteToken: community.inviteToken || undefined,
                            referralCode: community.referralCode || undefined,
                        },
                    },
                ],
            } as NavigationState;
        }

        // 3. Invitación corta `/i/{código}`. No trae id de comunidad —el token
        //    la identifica del lado del servidor— así que se abre el directorio
        //    de fondo y `useCommunityDeepLinkHandler` levanta el modal encima.
        const shortInvite = parseShortInviteLink(path);
        if (shortInvite?.inviteToken) {
            return {
                routes: [
                    {
                        name: 'Communities',
                        params: {
                            inviteToken: shortInvite.inviteToken,
                            referralCode: shortInvite.referralCode || undefined,
                        },
                    },
                ],
            } as NavigationState;
        }

        // 4. Directorio.
        if (isCommunityDirectoryLink(path)) {
            return { routes: [{ name: 'Communities' }] } as NavigationState;
        }

        // 5. URLs canónicas de perfil y producto.
        try {
            const withoutOrigin = path.replace(/^https?:\/\/[^/]+/, '');
            const [pathOnly, queryString = ''] = withoutOrigin.split('?');
            const cleanPath = pathOnly.replace(/^\//, '');
            const ref = readReferralCode(queryString);

            if (cleanPath) {
                const parts = cleanPath.split('/').filter(Boolean);
                const first = parts[0]?.toLowerCase();
                if (
                    parts.length > 0 &&
                    !(RESERVED_PATHS as readonly string[]).includes(first) &&
                    !looksLikeScreenName(parts[0])
                ) {
                    if (parts.length === 1) {
                        return {
                            routes: [{ name: 'CommercialProfile', params: { handle: parts[0] } }],
                        } as NavigationState;
                    }
                    if (parts.length === 2) {
                        return {
                            routes: [
                                {
                                    name: 'ProductDetail',
                                    params: { handle: parts[0], slug: parts[1], referralCode: ref },
                                },
                            ],
                        } as NavigationState;
                    }
                }
            }
        } catch {
            // Una URL malformada no debe tumbar la navegación: cae al fallback.
        }

        // 6. Rutas declaradas en `linking.config`.
        return fallback(path, options);
    };
}
