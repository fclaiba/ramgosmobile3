import { useEffect, useState } from 'react';

/**
 * Debounce compartido.
 *
 * Había tres implementaciones sueltas con `setTimeout` (`UserSearch`,
 * `InfluencerInviteModal`, `LocationPickerModal`) y una pantalla —la bandeja
 * de mensajes— que directamente no tenía: abría una suscripción de Convex
 * nueva por cada tecla.
 */
export function useDebounce<T>(value: T, delayMs = 250): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(id);
    }, [value, delayMs]);

    return debounced;
}

/**
 * Término de búsqueda listo para usar: recortado y por debajo de `minLength`
 * devuelve `''`, para que el llamador pueda pasar `'skip'` a `useQuery` sin
 * repetir la condición en cada pantalla.
 */
export function useDebouncedSearchTerm(value: string, delayMs = 250, minLength = 2): string {
    const debounced = useDebounce(value.trim(), delayMs);
    return debounced.length >= minLength ? debounced : '';
}
