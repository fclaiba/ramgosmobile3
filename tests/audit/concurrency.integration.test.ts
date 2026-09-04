/**
 * @jest-environment node
 *
 * jest-expo corre en el entorno de React Native, donde no hay `fetch`: sin
 * esta línea ConvexHttpClient no puede hablar con el deployment y las N
 * llamadas fallan en silencio (r.ok = 0), que se parece a un bug y no lo es.
 *
 * Falsación empírica — N solicitudes REALES y simultáneas contra el deployment
 * de audit (`ramgos-audit`, nunca producción; ver `_fixture.ts`).
 *
 * Sin `skip`: si no hay deployment configurado, el test FALLA. Un invariante
 * sin test en verde cuenta como roto.
 *
 * Estado esperado al momento de escribirlos (H0, 2026-09-04):
 *   BON-01 → verde  (redeemBono es una mutation: serializable por OCC)
 *   PAY-01 → verde  (paymentEvents por event.id, finance.ts:298)
 *   STK-03 → ROJO   (el chequeo vive en la action, el descuento en el webhook)
 *   AGD-02 → ROJO   (holdEventCapacity no lo llama nadie; el checkout sólo
 *                    mira `listings.stock`)
 * H3/H4 los ponen en verde. Si STK-03 o AGD-02 pasan antes de eso, el test
 * está mal, no el código.
 */
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { auditEnv, seedFixture, resetFixture, inspectFixture, checkoutTotalCents, settle, type Fixture } from './_fixture';

const env = auditEnv();
const N = env.concurrency;
const client = () => new ConvexHttpClient(env.url);

let fx: Fixture;
beforeAll(() => { fx = seedFixture({ productStock: 1, eventCapacity: 1 }); }, 120_000);
afterAll(() => { resetFixture(); }, 120_000);

/**
 * N `createPaymentIntent` simultáneos del mismo comprador, cada uno con su
 * `cartId` (como hace PaymentScreen al montarse). `lineItems` y el total salen
 * del mismo builder del servidor para que el único motivo de rechazo posible
 * sea el stock.
 */
const raceCheckout = (buyer: { id: string; sessionToken: string }, listingId: string) => {
    const lineItems = [{ listingId, quantity: 1 }];
    const expectedTotalCents = checkoutTotalCents(buyer.id, lineItems);
    return settle(
        Array.from({ length: N }, (_, i) =>
            client().action(api.stripe.createPaymentIntent, {
                sessionToken: buyer.sessionToken,
                mode: 'test',
                cartId: `cart_audit_${Date.now()}_${i}`,
                lineItems,
                expectedTotalCents,
            } as any),
        ),
    );
};

describe('BON-01 — N canjes simultáneos del mismo bono', () => {
    test(`exactamente 1 de ${N} tiene éxito`, async () => {
        const r = await settle(
            Array.from({ length: N }, () =>
                client().mutation(api.bonos.redeemBono, { sessionToken: fx.business.sessionToken, bonoCode: fx.bonoCode }),
            ),
        );
        expect(r.ok).toBe(1);
        expect(r.failed).toBe(N - 1);
        expect(inspectFixture({ bonoId: fx.bonoId }).bono.status).toBe('redeemed');
    }, 60_000);
});

describe('STK-03 / STK-01 — N checkouts simultáneos sobre un producto con stock 1', () => {
    test(`exactamente 1 de ${N} createPaymentIntent tiene éxito`, async () => {
        const r = await raceCheckout(fx.buyerProduct, fx.productId);
        // Predicción estática (H0): r.ok === N. Este assert está en rojo hasta H3.
        expect(r.ok).toBe(1);
        const rest = r.errors.filter((e) => !/stock/i.test(e));
        expect(rest).toEqual([]); // los rechazos deben ser "sin stock", no errores de concurrencia
    }, 90_000);
});

describe('AGD-02 / EVT — N checkouts simultáneos sobre un evento con capacidad 1', () => {
    test(`exactamente 1 de ${N} createPaymentIntent tiene éxito`, async () => {
        const r = await raceCheckout(fx.buyerEvent, fx.eventId);
        // Predicción estática (H0): r.ok === N. En rojo hasta H3+H4.
        expect(r.ok).toBe(1);
    }, 90_000);
});

describe('PAY-01 / STK-05 — el mismo evento de webhook entregado dos veces', () => {
    test('queda registrado una sola vez en paymentEvents', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Stripe = require('stripe');
        expect(env.webhookSecret).toBeTruthy();
        const eventId = `evt_audit_${Date.now()}`;
        const payload = JSON.stringify({
            id: eventId, object: 'event', type: 'payment_intent.succeeded', livemode: false,
            created: Math.floor(Date.now() / 1000), api_version: '2025-01-27.acacia',
            data: { object: { id: `pi_audit_${Date.now()}`, object: 'payment_intent', status: 'succeeded', amount: 100, currency: 'usd', metadata: {} } },
        });
        const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: env.webhookSecret });
        const post = () =>
            fetch(`${env.siteUrl}/stripe-webhook-test`, {
                method: 'POST',
                headers: { 'stripe-signature': header, 'content-type': 'application/json' },
                body: payload,
            });
        const first = await post();
        const second = await post();
        // El PI es ficticio: el procesamiento puede fallar (500 → Stripe reintenta).
        // Lo que NO puede pasar es una segunda fila ni un 400 de firma.
        expect([200, 500]).toContain(first.status);
        expect([200, 500]).toContain(second.status);
        const rows = inspectFixture({ stripeEventId: eventId }).paymentEvents;
        expect(rows).toHaveLength(1);
    }, 60_000);
});
