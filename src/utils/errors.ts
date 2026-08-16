/**
 * Turns Convex / server error payloads into short, user-safe copy.
 * Strips request IDs, stack frames, file paths and "[CONVEX M(...)]" wrappers.
 */

const FALLBACK = 'Algo salió mal. Intentá de nuevo.';

/** Known server phrases → clearer UX copy (never show "No autorizado…" raw). */
const MESSAGE_MAP: Array<{ match: RegExp; text: string }> = [
    {
        match: /pertenece a otro negocio/i,
        text: 'Este bono es de otro negocio. Pedile al cliente el QR correcto.',
    },
    {
        match: /bono ya fue canjeado/i,
        text: 'Este bono ya fue canjeado.',
    },
    {
        match: /bono.*está vencido/i,
        text: 'Este bono está vencido.',
    },
    {
        match: /bono.*fue cancelado/i,
        text: 'Este bono fue cancelado.',
    },
    {
        match: /código de bono inválido/i,
        text: 'No encontramos ese código de bono. Revisalo e intentá de nuevo.',
    },
];

function extractRaw(error: unknown): string {
    if (!error) return '';
    if (typeof error === 'string') return error;

    const anyErr = error as {
        message?: unknown;
        data?: unknown;
        toString?: () => string;
    };

    // ConvexError puts the payload in `.data`
    if (typeof anyErr.data === 'string' && anyErr.data.trim()) {
        return anyErr.data;
    }
    if (
        anyErr.data &&
        typeof anyErr.data === 'object' &&
        typeof (anyErr.data as { message?: unknown }).message === 'string'
    ) {
        return String((anyErr.data as { message: string }).message);
    }

    if (error instanceof Error && error.message) return error.message;
    if (typeof anyErr.message === 'string' && anyErr.message) return anyErr.message;

    try {
        return String(anyErr);
    } catch {
        return '';
    }
}

function looksTechnical(msg: string): boolean {
    return /\[CONVEX|Request ID|Server Error|Called by client|\.ts:\d+|\/convex\/|at handler/i.test(
        msg,
    );
}

function applyMessageMap(msg: string): string {
    for (const entry of MESSAGE_MAP) {
        if (entry.match.test(msg)) return entry.text;
    }
    return msg;
}

function cleanOnce(raw: string): string {
    let msg = raw.replace(/\r\n/g, '\n').trim();
    if (!msg) return '';

    // Convex wraps: Uncaught Error: / Uncaught ConvexError: (sometimes nested)
    msg = msg.replace(/(?:Uncaught (?:Convex)?Error:\s*)+/gi, '').trim();

    if (/\[CONVEX/i.test(msg) || /Request ID/i.test(msg)) {
        msg = msg
            .replace(/\[CONVEX[^\]]*\]\s*/gi, '')
            .replace(/\[Request ID:[^\]]*\]\s*/gi, '')
            .replace(/\bServer Error\b:?\s*/gi, '')
            .split('\n')
            .map((line) => line.trim())
            .filter(
                (line) =>
                    !!line &&
                    !/^at\s/.test(line) &&
                    !/^Called by/i.test(line) &&
                    !/^\(?\.\.\/convex\//i.test(line),
            )
            .join(' ')
            .trim();
    }

    msg = msg
        .replace(/\s+at\s+\S[\s\S]*$/g, '')
        .replace(/\(\.\.\/convex\/[^)]+\)/g, '')
        .replace(/^Error:\s*/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    // If still technical, try to salvage a Spanish sentence inside
    if (looksTechnical(msg)) {
        const spanish = msg.match(
            /([A-ZÁÉÍÓÚÑ][^[\]]{8,120}[.!?]?)/,
        );
        if (spanish?.[1] && !looksTechnical(spanish[1])) {
            msg = spanish[1].trim();
        } else {
            return '';
        }
    }

    return applyMessageMap(msg);
}

/**
 * Public helper — use everywhere you surface errors to the user
 * (toasts, inline result cards, alerts).
 */
export function toUserMessage(error: unknown, fallback: string = FALLBACK): string {
    const candidates = [
        extractRaw(error),
        error instanceof Error ? String(error) : '',
    ].filter(Boolean);

    for (const raw of candidates) {
        const cleaned = cleanOnce(raw);
        if (cleaned) {
            return cleaned.length > 180 ? `${cleaned.slice(0, 177).trim()}…` : cleaned;
        }
    }

    return fallback;
}

// ---------------------------------------------------------------------------
// Errores de auth (convex/authHelpers.ts → ConvexError { code, message })
// ---------------------------------------------------------------------------

export type AuthErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN';

/**
 * Devuelve el código de auth del error, o null si no es un error de auth.
 * Reconoce el payload nuevo (`error.data.code`) y, como red de compatibilidad,
 * el mensaje viejo en español — durante el rollout conviven bundles y funciones
 * de ambas versiones.
 */
export function getAuthErrorCode(error: unknown): AuthErrorCode | null {
    const data = (error as { data?: unknown })?.data;
    const code =
        data && typeof data === 'object' ? (data as { code?: unknown }).code : undefined;
    if (code === 'UNAUTHENTICATED' || code === 'FORBIDDEN') return code;

    const raw = `${extractRaw(error)} ${error instanceof Error ? error.message : ''}`;
    if (/UNAUTHENTICATED/.test(raw) || /sesi[oó]n no v[aá]lida|sesi[oó]n.{0,12}expirada/i.test(raw)) {
        return 'UNAUTHENTICATED';
    }
    // Ojo: no matcheamos "No autorizado" suelto — es demasiado genérico y
    // desloguear por un 403 ajeno sería peor que el bug original.
    if (/FORBIDDEN/.test(raw)) return 'FORBIDDEN';
    return null;
}

/** Único caso que justifica desloguear: la sesión ya no sirve. */
export const isSessionExpiredError = (error: unknown): boolean =>
    getAuthErrorCode(error) === 'UNAUTHENTICATED';

/** ¿Es un error de auth (sesión muerta o permiso denegado)? */
export const isAuthError = (error: unknown): boolean => getAuthErrorCode(error) !== null;

/** Friendly title for redemption / validation screens. */
export function toUserErrorTitle(error: unknown, fallback = 'No se pudo canjear'): string {
    const msg = toUserMessage(error, '').toLowerCase();
    if (!msg) return fallback;
    if (msg.includes('otro negocio')) return 'Bono de otro negocio';
    if (msg.includes('ya fue canjeado') || msg.includes('ya canjeado')) return 'Bono ya canjeado';
    if (msg.includes('vencid')) return 'Bono vencido';
    if (msg.includes('cancelad')) return 'Bono cancelado';
    if (msg.includes('no encontramos') || msg.includes('código')) return 'Código no válido';
    return fallback;
}
