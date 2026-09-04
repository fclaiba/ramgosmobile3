/**
 * Falsación ejecutable de invariantes — capa pura.
 *
 * Convex ejecuta cada mutation como transacción serializable (OCC), así que
 * la concurrencia real sólo se puede reproducir contra un deployment (ver
 * concurrency.integration.test.ts). Acá se modela con los módulos puros que el
 * backend usa de verdad la SECUENCIA del checkout, que es donde vive el riesgo:
 *
 *   createPaymentIntent (action) ── chequea stock ── cobra ──▶ webhook
 *   ──▶ internalProcessPaidCheckout (mutation) ── descuenta acotado en 0
 *
 * El chequeo y el descuento viven en transacciones distintas separadas por el
 * pago. Este test demuestra que el modelo permite N órdenes pagadas sobre
 * stock 1 (STK-01), que el stock nunca queda negativo (STK-02) y que la
 * máquina de escrow admite reembolsar una orden ya liberada (BON-07 inverso).
 */
import { decrementStock, hasEnoughStock, shortfallFor } from '../../convex/_inventory';
import { isRefundable, isReleasable, canTransition } from '../../convex/orders/_escrowStates';

/** Modelo fiel de `stripe.ts:233` (pre-cobro) y `stripe.ts:713-723` (post-cobro). */
function checkoutRace(initialStock: number, buyers: number, qtyEach = 1) {
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

describe('STK-01 / STK-03 — sobreventa de producto de unidad única', () => {
    test('5 compradores concurrentes con stock 1: el modelo del código crea 5 órdenes pagadas', () => {
        const r = checkoutRace(1, 5);
        expect(r.preCheckPassed.every(Boolean)).toBe(true); // todos pasan el pre-check
        expect(r.orders).toHaveLength(5); // ← invariante STK-01 ROTO: esperado 1
        expect(r.orders.filter((o) => o.shortfall > 0)).toHaveLength(4); // 4 quedan con stockShortfall
    });

    test('STK-02 — el stock nunca queda negativo aunque se sobrevenda', () => {
        const r = checkoutRace(1, 5);
        expect(r.stock).toBe(0);
        expect(decrementStock(0, 3)).toBe(0);
    });

    test('con reserva atómica (lo que NO existe hoy) exactamente 1 tendría éxito', () => {
        // Referencia: cómo se vería el invariante cumplido si el pre-check y el
        // descuento vivieran en la misma mutation (check-and-decrement).
        let stock = 1;
        let ok = 0;
        for (let i = 0; i < 5; i++) {
            if (hasEnoughStock(stock, 1)) { stock = decrementStock(stock, 1); ok++; }
        }
        expect(ok).toBe(1);
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
