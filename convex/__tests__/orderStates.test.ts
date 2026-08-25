/**
 * Máquina de estados de órdenes.
 *
 * El caso central de este archivo es `paid_escrow`: es el estado en el que
 * nacen TODAS las órdenes del checkout, y `markAsShipped` lo rechazaba. El
 * vendedor no podía despachar nunca. Estos tests fallarían contra el código
 * anterior.
 */
import {
    canConfirmReceipt,
    canMarkDelivered,
    canMarkShipped,
    canOpenDispute,
    isPaid,
    isTerminal,
    PAID_STATES,
    TERMINAL_STATES,
    type OrderStatus,
} from '../orders/_orderStates';

const ALL_STATES: OrderStatus[] = [
    'pending',
    'payment_received',
    'paid_escrow',
    'awaiting_shipment',
    'in_transit',
    'delivered',
    'completed',
    'disputed',
    'cancelled',
];

describe('paid_escrow — el estado en el que nacen las órdenes del checkout', () => {
    it('se puede marcar como enviada', () => {
        // Este es EL bug: `markAsShipped` exigía 'payment_received' y las
        // órdenes nacen 'paid_escrow', así que el vendedor no podía despachar.
        expect(canMarkShipped('paid_escrow')).toBe(true);
    });

    it('cuenta como pagada', () => {
        expect(isPaid('paid_escrow')).toBe(true);
        expect(isPaid('payment_received')).toBe(true);
    });

    it('se puede liberar y se puede disputar', () => {
        expect(canConfirmReceipt('paid_escrow')).toBe(true);
        expect(canOpenDispute('paid_escrow')).toBe(true);
    });
});

describe('la cadena completa es transitable', () => {
    it('paid_escrow → enviada → entregada → liberada, sin cortes', () => {
        expect(canMarkShipped('paid_escrow')).toBe(true);
        expect(canMarkDelivered('in_transit')).toBe(true);
        expect(canConfirmReceipt('delivered')).toBe(true);
    });

    it('el comprador puede cerrar aunque el vendedor nunca marque el envío', () => {
        // Si no, una orden cuyo vendedor desaparece queda encerrada para siempre.
        expect(canConfirmReceipt('paid_escrow')).toBe(true);
        expect(canConfirmReceipt('in_transit')).toBe(true);
    });
});

describe('transiciones inválidas', () => {
    it('no se despacha algo que todavía no se pagó', () => {
        expect(canMarkShipped('pending')).toBe(false);
    });

    it('no se entrega lo que no salió', () => {
        for (const status of ['pending', 'payment_received', 'paid_escrow'] as OrderStatus[]) {
            expect(canMarkDelivered(status)).toBe(false);
        }
    });

    it('los estados terminales no admiten nada', () => {
        for (const status of TERMINAL_STATES) {
            expect(canMarkShipped(status)).toBe(false);
            expect(canMarkDelivered(status)).toBe(false);
            expect(canConfirmReceipt(status)).toBe(false);
            expect(canOpenDispute(status)).toBe(false);
        }
    });

    it('una orden cancelada no revive por ningún camino', () => {
        expect(isTerminal('cancelled')).toBe(true);
        expect(canMarkShipped('cancelled')).toBe(false);
    });

    it('una orden en disputa no se libera hasta resolverla', () => {
        expect(canConfirmReceipt('disputed')).toBe(false);
    });
});

describe('robustez', () => {
    it('un estado desconocido no habilita nada — falla cerrado', () => {
        for (const fn of [canMarkShipped, canMarkDelivered, canConfirmReceipt, canOpenDispute]) {
            expect(fn('lo-que-sea')).toBe(false);
            expect(fn('')).toBe(false);
        }
    });

    it('todo estado del schema está clasificado como pagado o no, sin ambigüedad', () => {
        for (const status of ALL_STATES) {
            expect(typeof isPaid(status)).toBe('boolean');
        }
        expect(PAID_STATES.every((s) => ALL_STATES.includes(s))).toBe(true);
    });

    it('ningún estado es a la vez terminal y despachable', () => {
        for (const status of ALL_STATES) {
            expect(isTerminal(status) && canMarkShipped(status)).toBe(false);
        }
    });
});
