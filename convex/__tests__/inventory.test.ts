/**
 * Reglas de inventario.
 *
 * El bug que motivó este módulo: el stock NUNCA se descontaba en una compra
 * real. Había dos implementaciones correctas —`listings.purchaseItem` y
 * `orders.createOrder`— y ninguna tenía call sites; el camino vivo (webhook de
 * Stripe) no tocaba `listings.stock` en ninguna línea.
 */
import {
    decrementStock,
    hasEnoughStock,
    outOfStockMessage,
    shortfallFor,
    type StockShortfall,
} from '../_inventory';

describe('hasEnoughStock', () => {
    it('alcanza cuando hay de sobra o justo', () => {
        expect(hasEnoughStock(5, 3)).toBe(true);
        expect(hasEnoughStock(3, 3)).toBe(true);
    });

    it('no alcanza cuando falta', () => {
        expect(hasEnoughStock(2, 3)).toBe(false);
        expect(hasEnoughStock(0, 1)).toBe(false);
    });

    it('sin control de inventario siempre alcanza', () => {
        // Servicios, eventos y bonos no llevan stock: tratarlos como 0 los
        // volvería incomprables.
        expect(hasEnoughStock(undefined, 99)).toBe(true);
        expect(hasEnoughStock(null, 99)).toBe(true);
    });
});

describe('decrementStock', () => {
    it('descuenta lo pedido', () => {
        expect(decrementStock(5, 3)).toBe(2);
        expect(decrementStock(1, 1)).toBe(0);
    });

    it('nunca deja el stock por debajo de cero', () => {
        // Pasa cuando hubo sobreventa: se descuenta igual porque el cobro ya
        // ocurrió, pero el inventario no puede quedar negativo.
        expect(decrementStock(2, 5)).toBe(0);
        expect(decrementStock(0, 3)).toBe(0);
    });
});

describe('shortfallFor', () => {
    it('es cero cuando alcanza', () => {
        expect(shortfallFor(5, 3)).toBe(0);
        expect(shortfallFor(3, 3)).toBe(0);
    });

    it('mide exactamente lo que falta', () => {
        expect(shortfallFor(2, 5)).toBe(3);
        expect(shortfallFor(0, 1)).toBe(1);
    });

    it('sin control de inventario no falta nada', () => {
        expect(shortfallFor(undefined, 99)).toBe(0);
        expect(shortfallFor(null, 99)).toBe(0);
    });

    it('es coherente con hasEnoughStock', () => {
        // Si alcanza, el faltante tiene que ser 0; si no, mayor que 0.
        for (const available of [0, 1, 5, 100, undefined, null]) {
            for (const requested of [1, 3, 50]) {
                const enough = hasEnoughStock(available, requested);
                const missing = shortfallFor(available, requested);
                expect(enough).toBe(missing === 0);
            }
        }
    });
});

describe('outOfStockMessage', () => {
    const line = (over: Partial<StockShortfall> = {}): StockShortfall => ({
        listingId: 'l1',
        title: 'Zapatillas',
        requested: 3,
        available: 1,
        ...over,
    });

    it('sin faltantes no dice nada', () => {
        expect(outOfStockMessage([])).toBe('');
    });

    it('con uno solo dice cuánto queda', () => {
        expect(outOfStockMessage([line()])).toContain('quedan 1');
        expect(outOfStockMessage([line()])).toContain('Zapatillas');
    });

    it('cuando queda cero lo dice distinto', () => {
        // "quedan 0 y pediste 3" se lee raro; con cero conviene el mensaje
        // directo.
        const message = outOfStockMessage([line({ available: 0 })]);
        expect(message).toContain('sin stock');
        expect(message).not.toContain('quedan 0');
    });

    it('con varios los enumera', () => {
        const message = outOfStockMessage([
            line({ title: 'Zapatillas' }),
            line({ title: 'Campera', listingId: 'l2' }),
        ]);
        expect(message).toContain('Zapatillas');
        expect(message).toContain('Campera');
    });
});
