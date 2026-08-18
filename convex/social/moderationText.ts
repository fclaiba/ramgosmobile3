/**
 * Pipeline de texto compartido: filtro de palabras + extracción de hashtags
 * y menciones. Todo en un solo archivo porque las tres cosas escanean el
 * mismo string y conviene una sola pasada, no tres funciones que cada
 * mutation llama por separado y se van desincronizando.
 */

import { ConvexError } from 'convex/values';

// Escrito con escapes y no con los caracteres literales (mismo motivo que
// `users/identity.ts`): son invisibles en el editor y cualquier reguardado
// del archivo en otra codificación los rompe en silencio.
const STRIP_ACCENTS = /[\u0300-\u036f]/g;

/** Igual normalización que `users/identity.ts`: minúsculas, sin acentos. */
const normalize = (raw: string): string =>
    raw
        .normalize('NFD')
        .replace(STRIP_ACCENTS, '')
        .toLowerCase();

// Sustituciones básicas de leetspeak — sólo lo que de verdad se usa para
// evadir filtros, no una tabla exhaustiva que generaría falsos positivos.
const LEET_MAP: Record<string, string> = { '4': 'a', '3': 'e', '1': 'i', '0': 'o', '$': 's' };
const deleet = (raw: string): string =>
    raw.replace(/[43105$]/g, (c) => LEET_MAP[c] ?? c);

export type TermScope = 'post' | 'comment' | 'dm' | 'all';

export type TextVerdict = {
    verdict: 'clean' | 'flag' | 'block';
    matches: string[];
};

/**
 * Tabla chica (se espera del orden de decenas/cientos de filas): se carga
 * entera por request y se cachea con un `Map` afuera si hiciera falta, pero
 * en la práctica una escritura social hace UNA sola llamada a esto.
 */
export const loadTermCache = async (
    ctx: any,
    scope: TermScope,
): Promise<Array<{ term: string; severity: 'block' | 'flag' }>> => {
    const [scoped, all] = await Promise.all([
        ctx.db.query('moderationTerms').withIndex('by_scope', (q: any) => q.eq('scope', scope)).collect(),
        scope === 'all'
            ? Promise.resolve([])
            : ctx.db.query('moderationTerms').withIndex('by_scope', (q: any) => q.eq('scope', 'all')).collect(),
    ]);
    return [...scoped, ...all].map((t: any) => ({ term: t.term, severity: t.severity }));
};

/** Match por límite de palabra: que "escasez" no matchee un término "casez". */
const termRegex = (term: string) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

export const scanText = (
    text: string,
    terms: Array<{ term: string; severity: 'block' | 'flag' }>,
): TextVerdict => {
    const candidate = `${normalize(text)} ${deleet(normalize(text))}`;
    const matches: string[] = [];
    let worst: 'clean' | 'flag' | 'block' = 'clean';

    for (const t of terms) {
        if (termRegex(t.term).test(candidate)) {
            matches.push(t.term);
            if (t.severity === 'block') worst = 'block';
            else if (worst !== 'block') worst = 'flag';
        }
    }

    return { verdict: worst, matches };
};

/**
 * Punto de enganche único. `block` corta la mutation; `flag` deja pasar pero
 * el llamador debe marcar el contenido y abrir un reporte automático (ver
 * `moderation.autoReportOnFlag`).
 */
export const assertTextAllowed = async (
    ctx: any,
    text: string,
    scope: TermScope,
): Promise<TextVerdict> => {
    if (!text) return { verdict: 'clean', matches: [] };
    const terms = await loadTermCache(ctx, scope);
    const result = scanText(text, terms);
    if (result.verdict === 'block') {
        throw new ConvexError({
            code: 'CONTENT_BLOCKED',
            message: 'Tu publicación incluye contenido no permitido.',
        });
    }
    return result;
};

// ── Hashtags y menciones ────────────────────────────────────────────────────

// `\p{L}`/`\p{N}` (Unicode property escapes, flag `u`) en vez de `[a-z0-9_]`:
// la charset ASCII cortaba el hashtag en el primer caracter no-ASCII —
// `#cumpleaños` se guardaba como `cumplea`, `#mamá` como `mam` — grave en
// una app en español. Las @menciones SÍ se quedan en ASCII a propósito: un
// @handle es un username, y `HANDLE_RE` en `users/identity.ts` sólo permite
// `[a-z0-9_]` — no existe (ni puede existir) un handle con ñ o acentos.
const HASHTAG_RE = /#([\p{L}\p{N}_]{2,32})/gu;
const MENTION_RE = /@([a-z0-9_]{3,24})/gi;

/**
 * Hasta 10 hashtags únicos, sin el '#'. Se normalizan con la MISMA función
 * que el filtro de moderación (NFD + strip acentos + minúsculas), así que
 * `#Cumpleaños`, `#cumpleaños` y `#CUMPLEANOS` colapsan al mismo tag para
 * trending y búsqueda — igual que hace la mayoría de las redes con hashtags.
 */
export const extractHashtags = (text: string): string[] => {
    const found = new Set<string>();
    for (const m of text.matchAll(HASHTAG_RE)) {
        const tag = normalize(m[1]);
        if (tag) found.add(tag);
        if (found.size >= 10) break;
    }
    return Array.from(found);
};

/** Hasta 10 handles únicos mencionados, sin el '@'. Resolverlos es tarea del llamador. */
export const extractMentions = (text: string): string[] => {
    const found = new Set<string>();
    for (const m of text.matchAll(MENTION_RE)) {
        found.add(m[1].toLowerCase());
        if (found.size >= 10) break;
    }
    return Array.from(found);
};
