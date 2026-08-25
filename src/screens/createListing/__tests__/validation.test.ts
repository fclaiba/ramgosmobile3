/**
 * Validación del formulario de publicación.
 *
 * Los casos de precio y stock no son hipotéticos: son los bugs que tenía la
 * versión que vivía dentro del componente. Un precio vacío pasaba y se
 * publicaba en $0 —rompiendo después el checkout de cualquiera que lo pusiera
 * en el carrito— y un stock de "0" se publicaba como 1.
 */
import {
    clampValidityDays,
    isPriceDraftValid,
    isPriceFormatValid,
    isTitleValid,
    normalizeStock,
    parseDimensions,
    parsePrice,
    resolveCommissionRate,
    validateEventDate,
    validateListingDraft,
    VALIDITY_DAYS_MAX,
    VALIDITY_DAYS_MIN,
    type ListingDraft,
} from '../_validation';

describe('precio', () => {
    it('NO acepta la cadena vacía — el bug que publicaba productos en $0', () => {
        expect(isPriceFormatValid('')).toBe(false);
        expect(isPriceFormatValid('   ')).toBe(false);
    });

    it('acepta enteros y hasta dos decimales', () => {
        for (const value of ['10', '10.5', '10.50', '0.99', '1234']) {
            expect(isPriceFormatValid(value)).toBe(true);
        }
    });

    it('rechaza formatos que no son un precio', () => {
        for (const value of ['10.555', '.5', 'abc', '10,50', '-5', '1.2.3']) {
            expect(isPriceFormatValid(value)).toBe(false);
        }
    });

    it('el borrador SÍ deja tipear estados intermedios', () => {
        // Mientras se escribe hay que poder pasar por "12." o el campo se
        // vuelve intipeable; al publicar ya no se acepta.
        expect(isPriceDraftValid('12.')).toBe(true);
        expect(isPriceDraftValid('')).toBe(true);
        expect(isPriceFormatValid('12.')).toBe(false);
    });

    it('parsePrice tolera coma decimal y basura', () => {
        expect(parsePrice('10,50')).toBe(10.5);
        expect(parsePrice('10.50')).toBe(10.5);
        expect(parsePrice('')).toBe(0);
        expect(parsePrice('abc')).toBe(0);
    });
});

describe('stock', () => {
    it('"0" significa cero, no uno', () => {
        // Antes: parseInt("0") = 0, que es falsy, y el `|| 1` lo volvía 1.
        // El vendedor ponía 0 y publicaba con stock 1.
        expect(normalizeStock('0')).toBe(0);
    });

    it('vacío significa 1', () => {
        expect(normalizeStock('')).toBe(1);
        expect(normalizeStock('   ')).toBe(1);
    });

    it('rechaza negativos', () => {
        // Antes: parseInt("-5") = -5, truthy, y se persistía tal cual.
        expect(normalizeStock('-5')).toBeNull();
        expect(normalizeStock('-1')).toBeNull();
    });

    it('rechaza decimales y texto', () => {
        expect(normalizeStock('2.5')).toBeNull();
        expect(normalizeStock('abc')).toBeNull();
        expect(normalizeStock('5 unidades')).toBeNull();
    });

    it('acepta enteros positivos', () => {
        expect(normalizeStock('1')).toBe(1);
        expect(normalizeStock('250')).toBe(250);
    });
});

describe('título', () => {
    it('exige 3 caracteres reales', () => {
        expect(isTitleValid('ab')).toBe(false);
        expect(isTitleValid('   a   ')).toBe(false);
        expect(isTitleValid('BMW')).toBe(true);
    });

    it('acepta números — "iPhone 15" y "BMW 320" son nombres válidos', () => {
        expect(isTitleValid('iPhone 15')).toBe(true);
        expect(isTitleValid('320')).toBe(true);
    });
});

describe('parseDimensions', () => {
    it('parsea las tres medidas', () => {
        expect(parseDimensions('30x20x15')).toEqual({ length: 30, width: 20, height: 15 });
    });

    it('completa con defaults los tramos que faltan', () => {
        // "30x20" da alto 10 sin avisar. Queda documentado, no es un accidente.
        expect(parseDimensions('30x20')).toEqual({ length: 30, width: 20, height: 10 });
        expect(parseDimensions('')).toEqual({ length: 25, width: 20, height: 10 });
    });

    it('tolera separadores y espacios', () => {
        expect(parseDimensions('30 X 20 × 15')).toEqual({ length: 30, width: 20, height: 15 });
    });
});

describe('clampValidityDays — paridad con convex/listings.ts', () => {
    it('acota a los extremos', () => {
        expect(clampValidityDays('0')).toBe(4);
        expect(clampValidityDays('-10')).toBe(VALIDITY_DAYS_MIN);
        expect(clampValidityDays('9999')).toBe(VALIDITY_DAYS_MAX);
    });

    it('usa el default cuando no hay valor', () => {
        expect(clampValidityDays('')).toBe(4);
        expect(clampValidityDays('abc')).toBe(4);
    });

    it('respeta los valores dentro del rango', () => {
        expect(clampValidityDays('30')).toBe(30);
        expect(clampValidityDays('1')).toBe(1);
        expect(clampValidityDays('365')).toBe(365);
    });

    it('el resultado SIEMPRE cae dentro del rango que acepta el servidor', () => {
        for (const input of ['', '0', '-5', '1', '365', '366', '99999', 'abc']) {
            const result = clampValidityDays(input);
            expect(result).toBeGreaterThanOrEqual(VALIDITY_DAYS_MIN);
            expect(result).toBeLessThanOrEqual(VALIDITY_DAYS_MAX);
        }
    });
});

describe('resolveCommissionRate', () => {
    it('convierte porcentaje a tasa', () => {
        expect(resolveCommissionRate(20)).toBeCloseTo(0.2);
        expect(resolveCommissionRate('15')).toBeCloseTo(0.15);
    });

    it('nunca devuelve algo que el servidor vaya a rechazar', () => {
        // El guard del servidor es `rate <= 0 || rate > 0.5`.
        for (const input of [0, -50, 1, 100, 999, 'abc', undefined]) {
            const rate = resolveCommissionRate(input as any);
            expect(rate).toBeGreaterThan(0);
            expect(rate).toBeLessThanOrEqual(0.5);
        }
    });
});

describe('fecha de evento', () => {
    const now = new Date(2026, 7, 25); // 25 de agosto de 2026

    it('exige la fecha', () => {
        expect(validateEventDate('', now)).toBe('event-date-required');
    });

    it('exige el formato AAAA-MM-DD', () => {
        for (const value of ['25/12/2026', '2026-8-1', 'mañana', '20261201']) {
            expect(validateEventDate(value, now)).toBe('event-date-invalid');
        }
    });

    it('rechaza fechas que no existen', () => {
        // `new Date(2026, 1, 31)` no falla: rueda a marzo. Hay que detectarlo.
        expect(validateEventDate('2026-02-31', now)).toBe('event-date-invalid');
        expect(validateEventDate('2026-13-01', now)).toBe('event-date-invalid');
    });

    it('rechaza el pasado', () => {
        // Se podía publicar un evento para 1999.
        expect(validateEventDate('1999-01-01', now)).toBe('event-date-past');
        expect(validateEventDate('2026-08-24', now)).toBe('event-date-past');
    });

    it('acepta hoy y el futuro', () => {
        expect(validateEventDate('2026-08-25', now)).toBeNull();
        expect(validateEventDate('2026-12-31', now)).toBeNull();
    });
});

describe('validateListingDraft', () => {
    const base: ListingDraft = {
        type: 'product',
        title: 'Zapatillas running',
        price: '150',
        stock: '3',
        category: 'Deportes',
        description: 'Poco uso',
        photos: ['storage-id-1'],
        condition: 'new',
        hasLocation: true,
    };

    it('un borrador completo pasa', () => {
        expect(validateListingDraft(base)).toBeNull();
    });

    it('atrapa el precio vacío antes de que llegue al servidor', () => {
        expect(validateListingDraft({ ...base, price: '' })).toBe('price-empty');
    });

    it('atrapa el precio cero', () => {
        expect(validateListingDraft({ ...base, price: '0' })).toBe('price-zero');
        expect(validateListingDraft({ ...base, price: '0.00' })).toBe('price-zero');
    });

    it('atrapa el stock negativo', () => {
        expect(validateListingDraft({ ...base, stock: '-5' })).toBe('stock-invalid');
    });

    it('exige al menos una foto', () => {
        expect(validateListingDraft({ ...base, photos: [] })).toBe('photos-required');
    });

    it('exige descripción', () => {
        expect(validateListingDraft({ ...base, description: '  ' })).toBe('description-required');
    });

    it('exige describir el estado si el artículo es usado', () => {
        expect(validateListingDraft({ ...base, condition: 'used' })).toBe('damage-required');
        expect(
            validateListingDraft({ ...base, condition: 'used', damageDescription: 'Raya en el lateral' }),
        ).toBeNull();
    });

    it('el bono no exige ubicación pero sí que el monto supere al precio', () => {
        const bono: ListingDraft = { ...base, type: 'bono', hasLocation: false, discountValue: '200' };
        expect(validateListingDraft(bono)).toBeNull();
        expect(validateListingDraft({ ...bono, discountValue: '150' })).toBe('bono-amount-too-low');
        expect(validateListingDraft({ ...bono, discountValue: '100' })).toBe('bono-amount-too-low');
    });

    it('el evento exige fecha válida y futura', () => {
        const now = new Date(2026, 7, 25);
        const event: ListingDraft = { ...base, type: 'event' };
        expect(validateListingDraft(event, now)).toBe('event-date-required');
        expect(validateListingDraft({ ...event, eventDate: '2020-01-01' }, now)).toBe('event-date-past');
        expect(validateListingDraft({ ...event, eventDate: '2026-12-01' }, now)).toBeNull();
    });

    it('el orden de los errores es estable: título antes que precio', () => {
        // Si cambia el orden, el usuario ve un error distinto al esperado y el
        // formulario parece arbitrario.
        expect(validateListingDraft({ ...base, title: 'x', price: '' })).toBe('title-too-short');
    });
});
