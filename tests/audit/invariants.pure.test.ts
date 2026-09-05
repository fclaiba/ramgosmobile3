/**
 * Falsación ejecutable de invariantes — capa pura.
 *
 * Convex ejecuta cada mutation como transacción serializable (OCC), así que
 * la concurrencia real sólo se puede reproducir contra un deployment (ver
 * concurrency.integration.test.ts). Acá se modela con los módulos puros que el
 * backend usa de verdad la SECUENCIA del checkout, que es donde vive el riesgo.
 *
 * ANTES DE H3 (E-149 STK-01/STK-03):
 *   createPaymentIntent (action) ── chequea stock ── cobra ──▶ webhook
 *   ──▶ internalProcessPaidCheckout (mutation) ── descuenta acotado en 0
 * El chequeo y el descuento en transacciones distintas separadas por el pago:
 * 5 compradores sobre stock 1 pagaban los 5 (verificado 5/5 contra el
 * deployment de audit, no sólo modelado).
 *
 * DESDE H3:
 *   createPaymentIntent ── internalReserveStock (UNA mutation: chequea Y
 *   descuenta) ── cobra ──▶ webhook ── consume la reserva, no descuenta
 * El que no alcanza se entera antes de pagar.
 */
import {
    decrementStock,
    hasEnoughStock,
    planReservation,
    remainingToDecrement,
    shortfallFor,
} from '../../convex/_inventory';
import { isRefundable, isReleasable, canTransition } from '../../convex/orders/_escrowStates';

/**
 * Modelo de la secuencia ANTERIOR a H3 — se conserva para dejar por escrito
 * qué se rompía, y para que el contraste con `checkoutRaceReserved` sea la
 * evidencia de que el arreglo cambia el resultado y no sólo el código.
 */
function checkoutRaceLegacy(initialStock: number, buyers: number, qtyEach = 1) {
    // Fase 1 — todos los compradores pasan por createPaymentIntent ANTES de
    // que nadie pague: cada action lee el mismo stock.
    const preCheckPassed = Array.from({ length: buyers }, () => hasEnoughStock(initialStock, qtyEach));
    // Fase 2 — todos pagan en Stripe (fuera de Convex).
    // Fase 3 — los webhooks llegan y cada mutation descuenta acotado en 0.
    let stock = initialStock;
    const orders: Array<{ shortfall: number }> = [];
    for (const passed of preCheckPassed) {
        if (!passed) continue;
        const shortfall = shortfallFor(stock, qtyEach);
        stock = decrementStock(stock, qtyEach);
        orders.push({ shortfall });
    }
    return { stock, orders, preCheckPassed };
}

/**
 * Modelo de la secuencia VIGENTE (H3): `internalReserveStock` corre serializada
 * por OCC — el bucle es exactamente eso — y el webhook sólo descuenta lo que
 * la reserva no cubrió.
 */
function checkoutRaceReserved(initialStock: number, buyers: number, qtyEach = 1) {
    let stock = initialStock;
    const reserved: number[] = [];
    const rejected: number[] = [];

    for (let i = 0; i < buyers; i++) {
        const plan = planReservation([
            { listingId: 'l1', title: 'Producto', quantity: qtyEach, available: stock },
        ]);
        if (!plan.ok) {
            rejected.push(plan.shortfalls[0].available);
            continue;
        }
        stock = plan.decrements[0].newStock;
        reserved.push(qtyEach);
    }

    // Los webhooks de los que sí pagaron: la reserva ya descontó.
    const orders = reserved.map(() => {
        const pending = remainingToDecrement(qtyEach, qtyEach);
        const shortfall = shortfallFor(stock, pending);
        stock = decrementStock(stock, pending);
        return { shortfall, decremented: pending };
    });

    return { stock, orders, rejected };
}

describe('STK-01 / STK-03 — producto de unidad única bajo concurrencia', () => {
    test('5 compradores con stock 1: exactamente 1 reserva y 1 orden', () => {
        const r = checkoutRaceReserved(1, 5);
        expect(r.orders).toHaveLength(1);
        expect(r.rejected).toHaveLength(4);
        expect(r.stock).toBe(0);
    });

    test('el webhook NO vuelve a descontar lo ya reservado (sin doble descuento)', () => {
        const r = checkoutRaceReserved(3, 1);
        expect(r.orders[0].decremented).toBe(0);
        expect(r.orders[0].shortfall).toBe(0);
        expect(r.stock).toBe(2); // 3 − 1 reservado, y nada más
    });

    test('ninguna orden nace con stockShortfall: el rechazo ocurre antes de cobrar', () => {
        const r = checkoutRaceReserved(1, 5);
        expect(r.orders.filter((o) => o.shortfall > 0)).toEqual([]);
    });

    test('regresión: la secuencia anterior a H3 dejaba pasar las 5', () => {
        const legacy = checkoutRaceLegacy(1, 5);
        expect(legacy.preCheckPassed.every(Boolean)).toBe(true);
        expect(legacy.orders).toHaveLength(5); // lo que H3 elimina
        expect(legacy.orders.filter((o) => o.shortfall > 0)).toHaveLength(4);
    });

    test('STK-02 — el stock nunca queda negativo', () => {
        expect(checkoutRaceReserved(1, 5).stock).toBe(0);
        expect(decrementStock(0, 3)).toBe(0);
    });
});

describe('STK-06 / PAY-05 — reposición sólo en refund total de producto (stripe.ts:1604)', () => {
    test('un refund parcial no repone stock según la condición `full && product`', () => {
        const restocks = (full: boolean, listingType: string) => full && (listingType ?? 'product') === 'product';
        expect(restocks(true, 'product')).toBe(true);
        expect(restocks(false, 'product')).toBe(false); // reembolsé 2 de 3 unidades → no vuelven
        expect(restocks(true, 'bono')).toBe(false); // el bono no tiene stock, pero tampoco se cancela
        expect(restocks(true, 'event')).toBe(false); // eventSoldCount tampoco se libera
    });
});

describe('BON-07 — máquina de escrow y bonos', () => {
    test('una orden `released` (bono ya canjeado) sigue siendo reembolsable', () => {
        // redeemBono → auto-release → released. Un admin puede reembolsar
        // después: el comprador recupera $50 y ya gastó $100 de crédito.
        expect(isRefundable('released')).toBe(true);
        expect(canTransition('released', 'refund_pending')).toBe(true);
    });
    test('una orden `held` (bono todavía sin canjear) es reembolsable — y nada cancela el bono', () => {
        expect(isRefundable('held')).toBe(true);
        // No hay función pura que modele el bono: la evidencia de que el refund
        // no toca bonoRedemptions es el scanner (BON-07: 0 hits) y
        // stripe.ts:1555-1689 (internalCompleteOrderRefund no lo lee ni escribe).
    });
    test('refund_pending sin error no se puede reabrir ni liberar (guard de doble refund)', () => {
        expect(isRefundable('refund_pending')).toBe(false);
        expect(isReleasable('refund_pending')).toBe(false);
        expect(isRefundable('refunded')).toBe(false);
    });
});
