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
    planReservation,
    remainingToDecrement,
    shortfallFor,
    type ReservationLine,
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

// ===========================================================================
// RESERVA (H3, E-149 STK-01/STK-03)
// ===========================================================================

describe('planReservation', () => {
    const l = (over: Partial<ReservationLine> = {}): ReservationLine => ({
        listingId: 'l1',
        title: 'Zapatillas',
        quantity: 1,
        available: 5,
        ...over,
    });

    it('descuenta lo pedido cuando alcanza', () => {
        const plan = planReservation([l({ quantity: 2 })]);
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.decrements).toEqual([{ listingId: 'l1', quantity: 2, newStock: 3 }]);
    });

    it('deja el stock en cero cuando se lleva justo lo último', () => {
        const plan = planReservation([l({ available: 1, quantity: 1 })]);
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.decrements[0].newStock).toBe(0);
    });

    it('rechaza sin descontar nada cuando falta', () => {
        const plan = planReservation([l({ available: 1, quantity: 2 })]);
        expect(plan.ok).toBe(false);
        if (plan.ok) return;
        expect(plan.shortfalls).toEqual([
            { listingId: 'l1', title: 'Zapatillas', requested: 2, available: 1 },
        ]);
    });

    it('es todo-o-nada: una línea sin stock cancela la reserva entera', () => {
        // Reservar sólo la línea que alcanza retendría inventario de una compra
        // que igual se va a rechazar.
        const plan = planReservation([
            l({ listingId: 'ok', available: 10, quantity: 1 }),
            l({ listingId: 'falla', title: 'Campera', available: 0, quantity: 1 }),
        ]);
        expect(plan.ok).toBe(false);
        if (plan.ok) return;
        expect(plan.shortfalls.map((s) => s.listingId)).toEqual(['falla']);
    });

    it('acumula las líneas repetidas del mismo listing antes de comparar', () => {
        // 1 + 1 sobre stock 1 NO alcanza, aunque cada línea suelta sí.
        const plan = planReservation([
            l({ available: 1, quantity: 1 }),
            l({ available: 1, quantity: 1 }),
        ]);
        expect(plan.ok).toBe(false);
        if (plan.ok) return;
        expect(plan.shortfalls[0].requested).toBe(2);
    });

    it('las repetidas que sí alcanzan se descuentan una sola vez, sumadas', () => {
        const plan = planReservation([
            l({ available: 5, quantity: 2 }),
            l({ available: 5, quantity: 1 }),
        ]);
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.decrements).toEqual([{ listingId: 'l1', quantity: 3, newStock: 2 }]);
    });

    it('lo que no lleva inventario no se reserva ni falla', () => {
        // Bonos y servicios: `available` en undefined. No entran a decrements,
        // así que el webhook tampoco los verá como ya descontados.
        const plan = planReservation([
            l({ listingId: 'bono', available: undefined, quantity: 3 }),
            l({ listingId: 'servicio', available: null, quantity: 1 }),
        ]);
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.decrements).toEqual([]);
    });

    it('cantidad cero no reserva', () => {
        const plan = planReservation([l({ quantity: 0 })]);
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.decrements).toEqual([]);
    });
});

describe('remainingToDecrement', () => {
    it('con la reserva cubriendo todo, el webhook no descuenta', () => {
        expect(remainingToDecrement(2, 2)).toBe(0);
    });

    it('sin reserva (legacy, mock, o vencida) descuenta todo', () => {
        expect(remainingToDecrement(3, 0)).toBe(3);
    });

    it('con reserva parcial descuenta sólo la diferencia', () => {
        expect(remainingToDecrement(3, 1)).toBe(2);
    });

    it('una reserva mayor que lo pedido no genera crédito negativo', () => {
        expect(remainingToDecrement(1, 5)).toBe(0);
    });
});
