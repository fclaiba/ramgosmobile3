/**
 * Reglas puras de acceso a comunidades: política de ingreso, validez de
 * invitación y slugs.
 *
 * Este archivo NO importa nada de Convex a propósito — mismo criterio que
 * `social/scoring.ts` — así se puede testear con Jest liso, sin runtime ni
 * `convex-test` (que no está instalado en el repo). El prefijo `_` además
 * evita que Convex lo registre como módulo de funciones.
 *
 * Acá vive la lógica que decide quién entra a dónde, que es exactamente la
 * que no conviene tener sin cobertura.
 */

export type CommunityVisibility = 'public' | 'private' | 'secret';
export type CommunityJoinPolicy = 'open' | 'approval' | 'questionnaire' | 'invite';
export type InviteState = 'valid' | 'expired' | 'revoked' | 'exhausted' | 'notfound';

/**
 * Política de ingreso efectiva.
 *
 * `joinPolicy` es opcional en el schema para no backfillear las comunidades
 * anteriores a la feature: cuando falta se deriva de `visibility`, que es
 * como se comportaban hasta ahora. Ésta es la ÚNICA definición de esa
 * derivación; duplicarla haría que cada call site tuviera su propia idea de
 * qué significa una fila vieja.
 */
export function resolveJoinPolicy(community: {
    visibility?: string | null;
    joinPolicy?: string | null;
}): CommunityJoinPolicy {
    if (community.joinPolicy) return community.joinPolicy as CommunityJoinPolicy;
    if (community.visibility === 'public') return 'open';
    // Una secreta sin política explícita sólo puede ser por invitación: si
    // cayera en 'approval', bastaría adivinar el id para pedir entrar, y eso
    // ya confirmaría que existe.
    if (community.visibility === 'secret') return 'invite';
    return 'approval';
}

/** `true` si la comunidad puede aparecer en el directorio y la búsqueda. */
export function isDiscoverable(community: { visibility?: string | null; deletedAt?: string | null }): boolean {
    return !community.deletedAt && community.visibility !== 'secret';
}

export interface InviteLike {
    revokedAt?: string | null;
    expiresAt?: string | null;
    maxUses?: number | null;
    useCount?: number | null;
}

/**
 * Estado de una invitación. Sin efectos secundarios y sin reloj implícito:
 * `nowIso` entra por parámetro para que el test no dependa de la hora real.
 *
 * El orden importa: una invitación revocada informa "revocada" aunque además
 * esté vencida, porque es la razón que el admin necesita ver.
 */
export function inviteState(invite: InviteLike | null | undefined, nowIso: string): InviteState {
    if (!invite) return 'notfound';
    if (invite.revokedAt) return 'revoked';
    if (invite.expiresAt && invite.expiresAt <= nowIso) return 'expired';
    if (
        invite.maxUses !== undefined &&
        invite.maxUses !== null &&
        (invite.useCount ?? 0) >= invite.maxUses
    ) {
        return 'exhausted';
    }
    return 'valid';
}

export function inviteErrorMessage(state: InviteState): string {
    switch (state) {
        case 'expired':
            return 'Esta invitación venció.';
        case 'revoked':
            return 'Esta invitación fue dada de baja.';
        case 'exhausted':
            return 'Esta invitación ya alcanzó su límite de usos.';
        default:
            return 'Invitación inválida.';
    }
}

/* ─── Slugs ────────────────────────────────────────────────────────── */

/**
 * Rutas que ya significan otra cosa en el `getStateFromPath` de `App.tsx`
 * (`reservedPaths`). Una comunidad con `slug: 'login'` colgada en `/c/login`
 * no rompe nada hoy, pero reservar ahora es más barato que migrar slugs si
 * mañana se sirven comunidades desde la raíz.
 */
export const RESERVED_SLUGS = new Set([
    'welcome',
    'home',
    'signup',
    'login',
    'item',
    'ref',
    'bono',
    'p',
    'c',
    'comunidades',
]);

/* ─── Códigos de invitación ────────────────────────────────────────── */

/**
 * Códigos personalizados: lo que un admin puede escribir a mano para que el
 * link se pueda dictar ("ramgos.app/i/verano2026").
 *
 * Mínimo 4 para que no colisione con basura; máximo 32 porque más largo deja
 * de ser "corto". Sólo letras, números y guiones — nada que haya que escapar
 * en una URL ni que cambie al copiar y pegar.
 */
export const MIN_INVITE_CODE = 4;
export const MAX_INVITE_CODE = 32;

/**
 * Códigos que no se pueden reservar porque el parser los usa para otra cosa,
 * o porque prestarían a confusión en un link compartido.
 */
export const RESERVED_INVITE_CODES = new Set(['c', 'i', 'ref', 'bono', 'item', 'p', 'admin', 'api']);

export type InviteCodeError = 'too-short' | 'too-long' | 'invalid-chars' | 'reserved';

/** Normaliza a minúsculas y guiones. No valida: para eso está `validateInviteCode`. */
export function normalizeInviteCode(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Valida un código personalizado ya normalizado. Devuelve el motivo del
 * rechazo o `null` si sirve — así la UI puede decir QUÉ está mal en vez de un
 * "código inválido" genérico.
 */
export function validateInviteCode(code: string): InviteCodeError | null {
    if (!/^[a-z0-9-]+$/.test(code)) return 'invalid-chars';
    // `reserved` se evalúa ANTES que la longitud: varias reservadas (`c`, `i`,
    // `p`) son más cortas que el mínimo, y con el orden inverso quien
    // escribiera "c" recibía "necesita 4 caracteres" — cierto, pero engañoso:
    // sugiere que "cccc" serviría cuando el problema es otro.
    if (RESERVED_INVITE_CODES.has(code)) return 'reserved';
    if (code.length < MIN_INVITE_CODE) return 'too-short';
    if (code.length > MAX_INVITE_CODE) return 'too-long';
    return null;
}

export const INVITE_CODE_ERRORS: Record<InviteCodeError, string> = {
    'too-short': `El código necesita al menos ${MIN_INVITE_CODE} caracteres.`,
    'too-long': `El código no puede pasar de ${MAX_INVITE_CODE} caracteres.`,
    'invalid-chars': 'Sólo se permiten letras, números y guiones.',
    reserved: 'Ese código está reservado, elegí otro.',
};

/** Slug url-safe a partir de texto libre. Acentos fuera, todo a guiones. */
export function slugify(input: string): string {
    return input
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

/**
 * Candidatos de slug en orden de preferencia: el base y después sufijos
 * numéricos. Quien llama decide cuál está libre (eso sí necesita la base de
 * datos); acá sólo se genera la secuencia, que es la parte con reglas.
 */
export function slugCandidates(base: string, attempts = 50): string[] {
    if (!base) return [];
    const out: string[] = [];
    for (let i = 0; i < attempts; i++) {
        const candidate = i === 0 ? base : `${base}-${i + 1}`;
        if (RESERVED_SLUGS.has(candidate)) continue;
        out.push(candidate);
    }
    return out;
}

/* ─── Validación de respuestas del cuestionario ────────────────────── */

export interface QuestionLike {
    id: string;
    prompt: string;
    kind: 'text' | 'single' | 'multi' | 'boolean';
    required: boolean;
}

export interface AnswerLike {
    questionId: string;
    value?: string;
    optionIds?: string[];
}

/**
 * Primera pregunta obligatoria sin responder, o `null` si está completo.
 *
 * Devuelve la pregunta y no un booleano para que el mensaje de error pueda
 * decir CUÁL falta: un "completá el formulario" genérico sobre un wizard de
 * cinco pasos no le sirve a nadie.
 */
export function firstMissingRequired(
    questions: QuestionLike[],
    answers: AnswerLike[],
): QuestionLike | null {
    const provided = new Map(answers.map((a) => [a.questionId, a]));
    for (const q of questions) {
        if (!q.required) continue;
        const a = provided.get(q.id);
        if (!a) return q;
        const hasOptions = (a.optionIds ?? []).length > 0;
        const hasValue = (a.value ?? '').toString().trim().length > 0;
        if (q.kind === 'multi') {
            if (!hasOptions) return q;
        } else if (!hasValue && !hasOptions) {
            return q;
        }
    }
    return null;
}
