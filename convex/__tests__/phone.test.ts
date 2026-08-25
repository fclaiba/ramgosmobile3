/**
 * Validación de teléfono.
 *
 * El número no se verifica por SMS, así que es el único medio de contacto que
 * tiene un revisor para resolver un KYC. Antes no se validaba en ningún lado
 * —ni en el formulario ni en el backend— y un teléfono de un dígito llegaba a
 * la base.
 */
import {
    formatPhoneForDisplay,
    isValidPhone,
    normalizePhone,
    PHONE_MAX_DIGITS,
    PHONE_MIN_DIGITS,
    phoneDigitCount,
    validatePhone,
} from '../_phone';

describe('validatePhone', () => {
    it('acepta las formas en que la gente escribe un número', () => {
        for (const value of [
            '1145678900',
            '11 4567 8900',
            '(11) 4567-8900',
            '+54 11 4567 8900',
            '+5491145678900',
            '011-4567-8900',
        ]) {
            expect(validatePhone(value)).toBeNull();
        }
    });

    it('rechaza vacío y espacios', () => {
        expect(validatePhone('')).toBe('empty');
        expect(validatePhone('   ')).toBe('empty');
    });

    it('rechaza por longitud en ambos extremos', () => {
        expect(validatePhone('123456')).toBe('too-short');
        expect(validatePhone('1'.repeat(PHONE_MIN_DIGITS - 1))).toBe('too-short');
        expect(validatePhone('1234567890123456')).toBe('too-long');
    });

    it('acepta justo en los límites', () => {
        // `1234567` tiene dígitos distintos, así que no cae en 'repeated'.
        expect(phoneDigitCount('1234567')).toBe(PHONE_MIN_DIGITS);
        expect(validatePhone('1234567')).toBeNull();
        const atMax = '1234567890' + '12345';
        expect(phoneDigitCount(atMax)).toBe(PHONE_MAX_DIGITS);
        expect(validatePhone(atMax)).toBeNull();
    });

    it('rechaza letras y símbolos que no son de teléfono', () => {
        expect(validatePhone('11-ABCD-8900')).toBe('invalid-chars');
        expect(validatePhone('llamame')).toBe('invalid-chars');
        expect(validatePhone('11/4567/8900')).toBe('invalid-chars');
    });

    it('rechaza el + en el medio', () => {
        // Adelante es prefijo internacional; en el medio no significa nada.
        expect(validatePhone('11+4567890')).toBe('invalid-chars');
    });

    it('rechaza los rellenos de un solo dígito repetido', () => {
        // Es la forma más común de completar un campo obligatorio sin dar el dato.
        expect(validatePhone('0000000')).toBe('repeated');
        expect(validatePhone('1111111111')).toBe('repeated');
        expect(validatePhone('999 999 9999')).toBe('repeated');
    });

    it('un número real con dígitos repetidos NO se rechaza', () => {
        // El chequeo es "todos iguales", no "tiene repeticiones".
        expect(validatePhone('1111145678')).toBeNull();
    });

    it('isValidPhone concuerda siempre con validatePhone', () => {
        for (const value of ['1145678900', '', '123', 'abc', '0000000']) {
            expect(isValidPhone(value)).toBe(validatePhone(value) === null);
        }
    });
});

describe('normalizePhone', () => {
    it('deja sólo dígitos y conserva el + inicial', () => {
        expect(normalizePhone('(11) 4567-8900')).toBe('1145678900');
        expect(normalizePhone('+54 11 4567 8900')).toBe('+541145678900');
        expect(normalizePhone('  11 4567 8900  ')).toBe('1145678900');
    });

    it('es idempotente', () => {
        // Normalizar dos veces tiene que dar lo mismo, o el valor guardado
        // cambia según cuántas veces pasó por acá.
        for (const value of ['(11) 4567-8900', '+54 11 4567 8900', '1145678900']) {
            const once = normalizePhone(value);
            expect(normalizePhone(once)).toBe(once);
        }
    });

    it('dos escrituras del mismo número normalizan igual', () => {
        expect(normalizePhone('(11) 4567-8900')).toBe(normalizePhone('11 4567 8900'));
    });

    it('tolera entradas nulas sin romper', () => {
        expect(normalizePhone(undefined as any)).toBe('');
        expect(normalizePhone(null as any)).toBe('');
    });
});

describe('formatPhoneForDisplay', () => {
    it('agrupa de a poco mientras se tipea', () => {
        expect(formatPhoneForDisplay('11')).toBe('11');
        expect(formatPhoneForDisplay('1145')).toBe('(114) 5');
        expect(formatPhoneForDisplay('1145678900')).toBe('(114) 567-8900');
    });

    it('con prefijo internacional no agrupa', () => {
        expect(formatPhoneForDisplay('+541145678900')).toBe('+541145678900');
    });

    it('no valida — formatear no es aprobar', () => {
        // Es exactamente la confusión que había: el formateador daba sensación
        // de que algo se estaba comprobando.
        const formatted = formatPhoneForDisplay('000');
        expect(formatted).toBe('000');
        expect(validatePhone(formatted)).not.toBeNull();
    });
});
