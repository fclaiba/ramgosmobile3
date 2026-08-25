/**
 * Links de comunidad e invitación.
 *
 * Canónico:  https://ramgos.app/c/{idOrSlug}
 * Invitación: https://ramgos.app/c/{idOrSlug}?invite={token}
 * Scheme:     ramgos://c/{idOrSlug}[?invite={token}]
 *
 * El token va como QUERY sobre el path de la comunidad, no como path propio
 * (`/invite/{token}`): así, si quien recibe el link no tiene la app, la web
 * abre igual la página de la comunidad en vez de un 404. Y como
 * `parseBonoDeepLink` devuelve `null` para esta forma, la rama nueva se puede
 * insertar en `getStateFromPath` sin tocar la de bonos.
 *
 * `referralCode` se propaga a propósito: un link de comunidad compartido por
 * un influencer no debe perder la atribución. Perder el `?ref=` ya costó
 * comisiones reales una vez (E-089).
 */

import { APP_WEB_HOSTS, webPath } from '../config/appOrigin';

export type ParsedCommunityDeepLink = {
    /** Id de Convex o slug: quien lo resuelve decide cuál es. */
    communityIdOrSlug: string;
    inviteToken?: string;
    referralCode?: string;
};

/** Segmento de path que identifica una comunidad. */
export const COMMUNITY_PATH_SEGMENT = 'c';
/** Segmento de la forma CORTA de invitación: `/i/{código}`. */
export const INVITE_PATH_SEGMENT = 'i';
/** Path del directorio de comunidades. */
export const COMMUNITY_DIRECTORY_PATH = 'comunidades';

export type ParsedInviteLink = {
    inviteToken: string;
    referralCode?: string;
};

/**
 * Link corto de invitación: `https://ramgos.app/i/{código}`.
 *
 * Es la forma que se comparte. La larga (`/c/{id}?invite=…`) se mantiene
 * porque los links ya repartidos tienen que seguir funcionando, pero ocupa el
 * doble y no se puede dictar por teléfono.
 *
 * No lleva el id de la comunidad a propósito: el token ya la identifica del
 * lado del servidor (`previewInvite`), y omitirlo evita filtrar qué comunidad
 * es antes de que alguien acepte — que para una secreta es justamente el punto.
 */
export function buildShortInviteLink(token: string, referralCode?: string): string {
    const code = String(token || '').trim();
    if (!code) return '';
    const base = webPath(`/${INVITE_PATH_SEGMENT}/${encodeURIComponent(code)}`);
    const ref = String(referralCode || '').trim().replace(/^@+/, '');
    return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}

/** Parsea la forma corta. `null` si la URL no lo es. */
export function parseShortInviteLink(url: string | null | undefined): ParsedInviteLink | null {
    const rest = extractPath(url);
    if (rest === null) return null;

    const { path, query } = splitPathAndQuery(rest);
    const segments = path.split('/').filter(Boolean);
    if (segments.length !== 2) return null;
    if (decodeSegment(segments[0]).toLowerCase() !== INVITE_PATH_SEGMENT) return null;

    const inviteToken = decodeSegment(segments[1]);
    if (!inviteToken) return null;

    return { inviteToken, referralCode: readParam(query, 'ref') };
}

export function buildCommunityLink(communityIdOrSlug: string): string {
    const id = String(communityIdOrSlug || '').trim();
    if (!id) return '';
    return webPath(`/${COMMUNITY_PATH_SEGMENT}/${encodeURIComponent(id)}`);
}

export function buildCommunityInviteLink(opts: {
    communityIdOrSlug: string;
    token: string;
    referralCode?: string;
}): string {
    const base = buildCommunityLink(opts.communityIdOrSlug);
    const token = String(opts.token || '').trim();
    if (!base || !token) return base;

    const params = [`invite=${encodeURIComponent(token)}`];
    const ref = String(opts.referralCode || '').trim().replace(/^@+/, '');
    if (ref) params.push(`ref=${encodeURIComponent(ref)}`);
    return `${base}?${params.join('&')}`;
}

/** Lee un parámetro de la query, sin depender de `URL` (ausente en Hermes viejo). */
function readParam(query: string, key: string): string | undefined {
    if (!query) return undefined;
    for (const pair of query.split('&')) {
        if (!pair) continue;
        const eq = pair.indexOf('=');
        const k = eq === -1 ? pair : pair.slice(0, eq);
        if (k !== key) continue;
        const raw = eq === -1 ? '' : pair.slice(eq + 1);
        try {
            const decoded = decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
            return decoded || undefined;
        } catch {
            return raw.trim() || undefined;
        }
    }
    return undefined;
}

function splitPathAndQuery(input: string): { path: string; query: string } {
    const hash = input.indexOf('#');
    const withoutHash = hash === -1 ? input : input.slice(0, hash);
    const q = withoutHash.indexOf('?');
    return q === -1
        ? { path: withoutHash, query: '' }
        : { path: withoutHash.slice(0, q), query: withoutHash.slice(q + 1) };
}

function decodeSegment(segment: string): string {
    try {
        return decodeURIComponent(segment).trim();
    } catch {
        return segment.trim();
    }
}

/**
 * Devuelve la parte de path+query de una URL nuestra, o `null` si no lo es.
 *
 * Acepta las tres formas que llegan: scheme nativo (`ramgos://…`), URL web de
 * un host propio, y path suelto (que es lo que recibe `getStateFromPath`).
 * Rechazar hosts ajenos acá es lo que evita que un link de otro dominio abra
 * pantallas de la app.
 */
function extractPath(url: string | null | undefined): string | null {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    const scheme = trimmed.match(/^ramgos:\/\/(.*)$/i);
    if (scheme) return scheme[1];

    const web = trimmed.match(/^https?:\/\/([^/?#]+)(.*)$/i);
    if (web) {
        const host = web[1].toLowerCase();
        return (APP_WEB_HOSTS as readonly string[]).includes(host) ? web[2] : null;
    }

    return trimmed.startsWith('/') ? trimmed : null;
}

/**
 * Parsea un link de comunidad. Devuelve `null` si la URL no lo es — así el
 * resolver de `App.tsx` puede encadenar ramas sin ambigüedad.
 */
export function parseCommunityDeepLink(
    url: string | null | undefined,
): ParsedCommunityDeepLink | null {
    const rest = extractPath(url);
    if (rest === null) return null;

    const { path, query } = splitPathAndQuery(rest);
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    if (decodeSegment(segments[0]).toLowerCase() !== COMMUNITY_PATH_SEGMENT) return null;

    const communityIdOrSlug = decodeSegment(segments[1]);
    if (!communityIdOrSlug) return null;

    return {
        communityIdOrSlug,
        inviteToken: readParam(query, 'invite'),
        referralCode: readParam(query, 'ref'),
    };
}

/** `true` si la URL apunta al directorio de comunidades. */
export function isCommunityDirectoryLink(url: string | null | undefined): boolean {
    const rest = extractPath(url);
    if (rest === null) return false;

    const { path } = splitPathAndQuery(rest);
    const segments = path.split('/').filter(Boolean);
    return segments.length === 1 && decodeSegment(segments[0]).toLowerCase() === COMMUNITY_DIRECTORY_PATH;
}
