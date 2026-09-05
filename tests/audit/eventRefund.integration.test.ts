/**
 * @jest-environment node
 *
 * Falsación de AGD-06 (H4, E-149) contra el deployment de audit — nunca
 * producción; ver `_fixture.ts`. Requiere `ALLOW_STRIPE_MOCK=true` (el
 * escenario usa un `stripePaymentIntentId` con prefijo `mock_pi_`).
 *
 * Mismo molde que `bonoRefund.integration.test.ts` (H2): una entrada de
 * evento es al aforo lo que un bono es al crédito — `confirmed` (nadie la usó)
 * se cancela sin objeción, `checked_in` (el asistente ya entró) bloquea el
 * refund salvo `force` de admin.
 *
 * Tres escenarios, todos secuenciales (no de concurrencia):
 *   1. entrada `confirmed` → refund → se cancela sola, el stock vuelve.
 *   2. entrada `checked_in` → refund SIN force → se bloquea, nada se toca.
 *   3. entrada `checked_in` → refund CON force → pasa, y queda un `audit_logs`.
 *
 * Sin `skip`: si no hay deployment configurado, falla.
 */
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { auditEnv, convexRun, resetFixture } from './_fixture';

const env = auditEnv();
const client = () => new ConvexHttpClient(env.url);

type EventRefundScenario = {
    suffix: string;
    business: { id: string; sessionToken: string };
    buyer: { id: string; sessionToken: string };
    admin: { id: string; sessionToken: string };
    orderId: string;
    reservationId: string;
    qrCode: string;
    eventListingId: string;
};

afterEach(() => { resetFixture(); }, 60_000);

describe('AGD-06 — entrada confirmed, nunca escaneada: el refund la cancela sola', () => {
    test('el stock del evento vuelve y la entrada queda cancelled', async () => {
        const fx: EventRefundScenario = convexRun('audit/fixtures:seedEventRefundScenario', {
            reservationStatus: 'confirmed',
        });

        const result = await client().action(api.stripe.adminRefundEscrow, {
            sessionToken: fx.admin.sessionToken,
            orderId: fx.orderId as any,
        } as any);
        expect(result.success).toBe(true);

        const after = convexRun('audit/fixtures:inspect', { eventId: fx.eventListingId, orderId: fx.orderId });
        expect(after.order.escrowState).toBe('refunded');
        expect(after.eventReservations).toHaveLength(1);
        expect(after.eventReservations[0].status).toBe('cancelled');
        // El fixture inserta la orden directo (no pasa por H3/reserveStock),
        // así que el stock nunca bajó: esto sólo verifica que el refund total
        // de un evento suma `item.quantity`, igual que hace con un producto.
        expect(after.event.stock).toBe(6); // 5 sembrado + 1 restock
    }, 60_000);
});

describe('AGD-06 — entrada ya escaneada: el refund se bloquea sin force', () => {
    test('la orden sigue "held" y la entrada sigue "checked_in"', async () => {
        const fx: EventRefundScenario = convexRun('audit/fixtures:seedEventRefundScenario', {
            reservationStatus: 'confirmed',
        });

        // El negocio escanea el QR en la puerta.
        const checkIn = await client().mutation(api.events.checkInReservation, {
            sessionToken: fx.business.sessionToken,
            qrCode: fx.qrCode,
        } as any);
        expect(checkIn.success).toBe(true);

        await expect(
            client().action(api.stripe.adminRefundEscrow, { sessionToken: fx.admin.sessionToken, orderId: fx.orderId as any } as any),
        ).rejects.toThrow(/escaneada|confirmación de un administrador/i);

        const after = convexRun('audit/fixtures:inspect', { eventId: fx.eventListingId, orderId: fx.orderId });
        expect(after.eventReservations[0].status).toBe('checked_in'); // no se tocó
        expect(after.order.refundedCents).toBe(0); // no se reembolsó nada
    }, 60_000);
});

describe('AGD-06 — entrada ya escaneada: con force el admin puede reembolsar igual', () => {
    test('el refund pasa y queda un audit_logs EVENT_REFUND_FORCED', async () => {
        const fx: EventRefundScenario = convexRun('audit/fixtures:seedEventRefundScenario', {
            reservationStatus: 'confirmed',
        });
        await client().mutation(api.events.checkInReservation, { sessionToken: fx.business.sessionToken, qrCode: fx.qrCode } as any);

        const result = await client().action(api.stripe.adminRefundEscrow, {
            sessionToken: fx.admin.sessionToken,
            orderId: fx.orderId as any,
            force: true,
        } as any);
        expect(result.success).toBe(true);

        const after = convexRun('audit/fixtures:inspect', { eventId: fx.eventListingId, orderId: fx.orderId });
        expect(after.eventReservations[0].status).toBe('checked_in'); // la entrada usada no se revierte sola
        expect(after.order.escrowState).toBe('refunded');
        expect(after.auditLogs.some((l: any) => l.action === 'EVENT_REFUND_FORCED')).toBe(true);
    }, 60_000);
});
