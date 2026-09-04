/**
 * @jest-environment node
 *
 * Falsación de BON-07 (H2, E-149) contra el deployment de audit — nunca
 * producción; ver `_fixture.ts`. Requiere `ALLOW_STRIPE_MOCK=true` en ese
 * deployment (el escenario usa un `stripePaymentIntentId` con prefijo
 * `mock_pi_`, así que `internalRefundOrder` no le pega a Stripe de verdad).
 *
 * Tres escenarios, todos secuenciales (no de concurrencia):
 *   1. bono `issued`  → refund → se cancela solo, `redeemBono` rechaza.
 *   2. bono `redeemed` → refund SIN force → se bloquea, el bono sigue vivo.
 *   3. bono `redeemed` → refund CON force → pasa, y queda un `audit_logs`.
 *
 * Sin `skip`: si no hay deployment configurado, falla (regla: ningún
 * invariante queda sin verificar en verde).
 */
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { auditEnv, convexRun, resetFixture } from './_fixture';

const env = auditEnv();
const client = () => new ConvexHttpClient(env.url);

type RefundScenario = {
    suffix: string;
    business: { id: string; sessionToken: string };
    buyer: { id: string; sessionToken: string };
    admin: { id: string; sessionToken: string };
    orderId: string;
    bonoId: string;
    bonoCode: string;
    bonoListingId: string;
};

afterEach(() => { resetFixture(); }, 60_000);

describe('BON-07 — bono issued, nunca canjeado: el refund lo cancela solo', () => {
    test('redeemBono rechaza el bono cancelado después del refund', async () => {
        const fx: RefundScenario = convexRun('audit/fixtures:seedRefundScenario');

        const result = await client().action(api.stripe.adminRefundEscrow, {
            sessionToken: fx.admin.sessionToken,
            orderId: fx.orderId as any,
        } as any);
        expect(result.success).toBe(true);

        const after = convexRun('audit/fixtures:inspect', { bonoId: fx.bonoId, orderId: fx.orderId });
        expect(after.bono.status).toBe('cancelled');
        expect(after.order.escrowState).toBe('refunded');

        await expect(
            client().mutation(api.bonos.redeemBono, { sessionToken: fx.business.sessionToken, bonoCode: fx.bonoCode }),
        ).rejects.toThrow();
    }, 60_000);
});

describe('BON-07 — bono ya canjeado: el refund se bloquea sin force', () => {
    test('la orden sigue "held" y el bono sigue "redeemed"', async () => {
        const fx: RefundScenario = convexRun('audit/fixtures:seedRefundScenario');

        // Canjear primero (el negocio escanea el QR).
        const redeem = await client().mutation(api.bonos.redeemBono, {
            sessionToken: fx.business.sessionToken,
            bonoCode: fx.bonoCode,
        } as any);
        expect(redeem.success).toBe(true);

        await expect(
            client().action(api.stripe.adminRefundEscrow, { sessionToken: fx.admin.sessionToken, orderId: fx.orderId as any } as any),
        ).rejects.toThrow(/canjeó su bono|confirmación de un administrador/i);

        const after = convexRun('audit/fixtures:inspect', { bonoId: fx.bonoId, orderId: fx.orderId });
        expect(after.bono.status).toBe('redeemed'); // no se tocó
        expect(after.order.refundedCents).toBe(0); // no se reembolsó nada
    }, 60_000);
});

describe('BON-07 — bono ya canjeado: con force el admin puede reembolsar igual', () => {
    test('el refund pasa y queda un audit_logs BONO_REFUND_FORCED', async () => {
        const fx: RefundScenario = convexRun('audit/fixtures:seedRefundScenario');

        await client().mutation(api.bonos.redeemBono, { sessionToken: fx.business.sessionToken, bonoCode: fx.bonoCode } as any);

        const result = await client().action(api.stripe.adminRefundEscrow, {
            sessionToken: fx.admin.sessionToken,
            orderId: fx.orderId as any,
            force: true,
        } as any);
        expect(result.success).toBe(true);

        const after = convexRun('audit/fixtures:inspect', { bonoId: fx.bonoId, orderId: fx.orderId });
        expect(after.bono.status).toBe('redeemed'); // el canje ya ocurrido no se revierte solo
        expect(after.order.escrowState).toBe('refunded');
        expect(after.auditLogs.some((l: any) => l.action === 'BONO_REFUND_FORCED')).toBe(true);
    }, 60_000);
});
