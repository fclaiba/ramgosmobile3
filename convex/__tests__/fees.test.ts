/**
 * Comisión de la plataforma — fija en 10% por los términos publicados.
 *
 * El caso que motivó este módulo: la tasa vivía repetida en tres sitios
 * (`stripe.ts` x2, `commerce.ts`) y dos de ellos quedaron en 12% cuando el
 * tercero se corrigió a 10%. Este test fija el número contra el que hay que
 * comparar cualquier sitio nuevo que calcule comisión.
 */
import {
    PLATFORM_COMMISSION_RATE,
    BONO_COMMISSION_RATE,
    commissionCentsFor,
    stripeFeeCentsFor,
} from '../_fees';

describe('tasa de comisión', () => {
    it('marketplace es 10%, como publican los términos', () => {
        expect(PLATFORM_COMMISSION_RATE).toBe(0.10);
    });

    it('bonos tiene su propia tasa, distinta a propósito', () => {
        expect(BONO_COMMISSION_RATE).toBe(0.30);
        expect(BONO_COMMISSION_RATE).not.toBe(PLATFORM_COMMISSION_RATE);
    });
});

describe('commissionCentsFor', () => {
    it('redondea al centavo más cercano', () => {
        expect(commissionCentsFor(10000)).toBe(1000); // $100 -> $10
        expect(commissionCentsFor(999)).toBe(100); // $9.99 -> $1.00 (99.9 -> 100)
    });

    it('acepta una tasa explícita (para bonos u overrides)', () => {
        expect(commissionCentsFor(10000, BONO_COMMISSION_RATE)).toBe(3000);
    });

    it('cero subtotal da cero comisión', () => {
        expect(commissionCentsFor(0)).toBe(0);
    });
});

describe('stripeFeeCentsFor', () => {
    it('2.9% + 30 centavos', () => {
        // $100 -> 2.9% = 290c + 30c fijo = 320c
        expect(stripeFeeCentsFor(10000)).toBe(320);
    });
});
