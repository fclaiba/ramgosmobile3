/**
 * Validación y normalización del formulario de publicación.
 *
 * POR QUÉ EXISTE
 *
 * Toda esta lógica vivía dentro del closure de `CreateListingScreen`, un
 * componente de ~1.100 líneas, así que no tenía un solo test. Y tenía agujeros
 * que dejaban publicar cosas rotas:
 *
 *   - `validatePrice` usaba `/^\d*\.?\d{0,2}$/`, que **matchea la cadena
 *     vacía**. Con el precio en blanco pasaba la validación y `parseFloat('')
 *     || 0` lo convertía en 0. Ese producto después rompía el checkout entero,
 *     porque `createPaymentIntent` rechaza montos ≤ 0.
 *   - El stock se normalizaba con `parseInt(form.stock || '1', 10) || 1`:
 *     escribir `"0"` daba `0`, que es falsy, y **se publicaba con stock 1**;
 *     escribir `"-5"` daba `-5`, que es truthy, y se persistía tal cual.
 *   - `validateName` decía en el mensaje de error "solo letras" mientras el
 *     regex aceptaba cualquier cosa de 3 caracteres.
 *
 * Son funciones puras: no tocan estado, no llaman a la red. El prefijo `_`
 * marca que es lógica interna del formulario, no una pantalla.
 */

export const TITLE_MIN_LENGTH = 3;

/** Días de vigencia de un bono. Debe coincidir con `convex/listings.ts`. */
export const VALIDITY_DAYS_MIN = 1;
export const VALIDITY_DAYS_MAX = 365;
export const VALIDITY_DAYS_DEFAULT = 4;

/** Comisión de promoción abierta. El servidor rechaza fuera de (0, 0.5]. */
export const COMMISSION_RATE_MIN = 0.01;
export const COMMISSION_RATE_MAX = 0.5;

export type ListingFieldError =
    | 'title-too-short'
    | 'price-empty'
    | 'price-invalid'
    | 'price-zero'
    | 'stock-invalid'
    | 'location-required'
    | 'category-required'
    | 'photos-required'
    | 'description-required'
    | 'damage-required'
    | 'event-date-required'
    | 'event-date-invalid'
    | 'event-date-past'
    | 'bono-amount-too-low';

export const LISTING_ERRORS: Record<ListingFieldError, string> = {
    'title-too-short': `El nombre debe tener al menos ${TITLE_MIN_LENGTH} caracteres.`,
    'price-empty': 'Ingresá un precio.',
    'price-invalid': 'El precio debe ser un número válido.',
    'price-zero': 'El precio debe ser mayor a cero.',
    'stock-invalid': 'El stock debe ser un número entero de 0 o más.',
    'location-required': 'Por favor seleccioná una ubicación en el mapa.',
    'category-required': 'Por favor seleccioná una categoría.',
    'photos-required': 'Agregá al menos una foto.',
    'description-required': 'Agregá una descripción.',
    'damage-required': 'Describí el estado del artículo usado.',
    'event-date-required': 'Ingresá la fecha del evento.',
    'event-date-invalid': 'La fecha debe tener el formato AAAA-MM-DD.',
    'event-date-past': 'La fecha del evento no puede estar en el pasado.',
    'bono-amount-too-low': 'El monto a consumir debe ser mayor al precio de venta.',
};

/** Sólo dígitos y como mucho un punto con dos decimales. NO acepta vacío. */
export function isPriceFormatValid(text: string): boolean {
    return /^\d+(\.\d{1,2})?$/.test((text ?? '').trim());
}

/**
 * Lo que se permite mientras se TIPEA, que es más laxo que lo que se acepta al
 * publicar: hay que dejar pasar el estado intermedio `"12."`.
 */
export function isPriceDraftValid(text: string): boolean {
    return /^\d*\.?\d{0,2}$/.test(text ?? '');
}

export function parsePrice(text: string): number {
    const parsed = parseFloat((text ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Normaliza el stock. `null` si el valor no es utilizable.
 *
 * Vacío significa 1 (el default histórico para quien no completa el campo),
 * pero `"0"` significa cero de verdad — no 1, como pasaba antes.
 */
export function normalizeStock(text: string): number | null {
    const raw = (text ?? '').trim();
    if (!raw) return 1;
    if (!/^\d+$/.test(raw)) return null; // atrapa "-5", "2.5" y "abc"
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

export function isTitleValid(text: string): boolean {
    return (text ?? '').trim().length >= TITLE_MIN_LENGTH;
}

/** `LxWxH` con defaults por tramo faltante. */
export function parseDimensions(value: string): { length: number; width: number; height: number } {
    const parts = (value ?? '').split(/[xX×]/).map((part) => parseFloat(part.trim()));
    return {
        length: Number.isFinite(parts[0]) ? parts[0] : 25,
        width: Number.isFinite(parts[1]) ? parts[1] : 20,
        height: Number.isFinite(parts[2]) ? parts[2] : 10,
    };
}

/** Debe dar lo mismo que el clamp de `convex/listings.ts`. */
export function clampValidityDays(text: string): number {
    const parsed = parseInt((text ?? '').trim() || String(VALIDITY_DAYS_DEFAULT), 10);
    const base = Number.isFinite(parsed) && parsed !== 0 ? parsed : VALIDITY_DAYS_DEFAULT;
    return Math.min(Math.max(base, VALIDITY_DAYS_MIN), VALIDITY_DAYS_MAX);
}

/** Porcentaje de la UI (0–100) a tasa del servidor (0–1), acotada. */
export function resolveCommissionRate(percent: string | number | undefined): number {
    const value = Number(percent) || 0;
    return Math.max(COMMISSION_RATE_MIN, Math.min(COMMISSION_RATE_MAX, value / 100));
}

/**
 * Fecha de evento en `AAAA-MM-DD`.
 *
 * El campo es un `TextInput` libre sin selector de fecha, así que acá hay que
 * atajar tanto el formato como el pasado: sin esto se podía publicar un evento
 * para 1999. Y como `eventDate` alimenta el cron `events-auto-release`, una
 * fecha inválida deja el escrow de esa orden sin liberarse nunca.
 */
export function validateEventDate(value: string, now: Date = new Date()): ListingFieldError | null {
    const raw = (value ?? '').trim();
    if (!raw) return 'event-date-required';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'event-date-invalid';

    const [year, month, day] = raw.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    // Rechaza fechas que el constructor "corrige" sola, como 2026-02-31.
    if (
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day
    ) {
        return 'event-date-invalid';
    }

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (parsed < today) return 'event-date-past';

    return null;
}

export type ListingDraft = {
    type: 'product' | 'service' | 'event' | 'bono';
    title: string;
    price: string;
    stock: string;
    category: string;
    description: string;
    photos: string[];
    condition: 'new' | 'used';
    damageDescription?: string;
    hasLocation: boolean;
    eventDate?: string;
    discountValue?: string;
};

/**
 * Valida el borrador entero y devuelve el PRIMER error.
 *
 * Devolver sólo el primero es deliberado: el formulario muestra un toast por
 * vez, así que una lista completa no tendría dónde renderizarse.
 *
 * Las reglas de foto, descripción y estado del usado vienen de
 * `AddEditProductScreen`, la pantalla paralela que se eliminó en esta fase:
 * estaba registrada en el stack pero ningún `navigate` llegaba a ella, y aun
 * así validaba mejor que la que sí se usa.
 */
export function validateListingDraft(
    draft: ListingDraft,
    now: Date = new Date(),
): ListingFieldError | null {
    if (!isTitleValid(draft.title)) return 'title-too-short';

    const price = (draft.price ?? '').trim();
    if (!price) return 'price-empty';
    if (!isPriceFormatValid(price)) return 'price-invalid';
    if (parsePrice(price) <= 0) return 'price-zero';

    if (draft.type === 'product' && normalizeStock(draft.stock) === null) {
        return 'stock-invalid';
    }

    if (draft.type !== 'bono' && !draft.hasLocation) return 'location-required';
    if (!draft.category) return 'category-required';
    if (!draft.photos || draft.photos.length === 0) return 'photos-required';
    if (!(draft.description ?? '').trim()) return 'description-required';

    if (draft.type === 'product' && draft.condition === 'used' && !(draft.damageDescription ?? '').trim()) {
        return 'damage-required';
    }

    if (draft.type === 'event') {
        const dateError = validateEventDate(draft.eventDate ?? '', now);
        if (dateError) return dateError;
    }

    if (draft.type === 'bono') {
        const discount = parsePrice(draft.discountValue ?? '');
        if (discount <= parsePrice(price)) return 'bono-amount-too-low';
    }

    return null;
}
