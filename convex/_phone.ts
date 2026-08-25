/**
 * Validación de números de teléfono.
 *
 * POR QUÉ EXISTE
 *
 * El teléfono no se verifica —no hay proveedor de SMS integrado y `phoneVerified`
 * es un campo muerto (ver `schema.ts`)— así que el número es, en la práctica, el
 * dato con el que un revisor humano contacta al usuario desde la cola de KYC.
 * Si llega basura, el KYC no se puede resolver.
 *
 * Y llegaba basura: `RegisterScreen` sólo aplicaba un formateador cosmético que
 * no bloquea el envío, `KYCScreen` sólo comprobaba que el campo no estuviera
 * vacío (mientras sí validaba el EIN, la dirección y la URL social), y el
 * backend aceptaba `v.string()` sin mirar. Un teléfono de un dígito pasaba
 * hasta la base.
 *
 * ALCANCE DELIBERADO
 *
 * Esto valida FORMATO, no titularidad. Que un número sea válido no significa
 * que sea de quien dice serlo; para eso hace falta el OTP por SMS, que está
 * fuera de alcance por decisión de producto.
 *
 * Módulo puro, sin imports de Convex. El prefijo `_` lo mantiene fuera del
 * registro de funciones.
 */

/** Mínimo de dígitos de un número nacional (sin prefijo de país). */
export const PHONE_MIN_DIGITS = 7;
/** Máximo del estándar E.164, incluyendo el código de país. */
export const PHONE_MAX_DIGITS = 15;

export type PhoneError = 'empty' | 'too-short' | 'too-long' | 'invalid-chars' | 'repeated';

export const PHONE_ERRORS: Record<PhoneError, string> = {
    empty: 'Ingresá un número de teléfono.',
    'too-short': `El teléfono necesita al menos ${PHONE_MIN_DIGITS} dígitos.`,
    'too-long': `El teléfono no puede tener más de ${PHONE_MAX_DIGITS} dígitos.`,
    'invalid-chars': 'El teléfono sólo puede tener números, espacios y los signos + ( ) -',
    repeated: 'Ese número no parece real.',
};

/**
 * Deja sólo los dígitos, conservando un `+` inicial si estaba.
 *
 * Es lo que conviene guardar: los paréntesis y guiones son decoración de
 * presentación y varían por país, así que persistirlos hace que dos veces el
 * mismo número no se parezcan entre sí.
 */
export function normalizePhone(input: string): string {
    const trimmed = (input ?? '').trim();
    const hasPlus = trimmed.startsWith('+');
    const digits = trimmed.replace(/\D/g, '');
    return hasPlus ? `+${digits}` : digits;
}

/** Cantidad de dígitos, ignorando el `+` y la puntuación. */
export function phoneDigitCount(input: string): number {
    return (input ?? '').replace(/\D/g, '').length;
}

/** `null` si el número es aceptable; si no, el motivo. */
export function validatePhone(input: string): PhoneError | null {
    const raw = (input ?? '').trim();
    if (!raw) return 'empty';

    // Sólo se permite lo que la gente escribe de verdad. El `+` únicamente
    // adelante: en el medio no significa nada.
    if (!/^\+?[0-9\s()\-.]+$/.test(raw)) return 'invalid-chars';

    const digits = raw.replace(/\D/g, '');
    if (digits.length < PHONE_MIN_DIGITS) return 'too-short';
    if (digits.length > PHONE_MAX_DIGITS) return 'too-long';

    // `0000000` y `1111111111` pasan cualquier chequeo de longitud y son la
    // forma más común de rellenar un campo obligatorio sin dar un dato real.
    if (/^(\d)\1+$/.test(digits)) return 'repeated';

    return null;
}

/** Azúcar para los sitios que sólo necesitan el booleano. */
export function isValidPhone(input: string): boolean {
    return validatePhone(input) === null;
}

/**
 * Formato legible mientras se tipea. No valida: sólo agrupa.
 *
 * Se mantiene separado de la validación a propósito — mezclarlos fue el origen
 * del problema, porque el formateador daba sensación de que algo se estaba
 * comprobando cuando no era así.
 */
export function formatPhoneForDisplay(input: string): string {
    const normalized = normalizePhone(input);
    const hasPlus = normalized.startsWith('+');
    const digits = normalized.replace(/\D/g, '');

    if (hasPlus) return `+${digits}`;
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}
