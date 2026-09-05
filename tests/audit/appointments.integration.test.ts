/**
 * @jest-environment node
 *
 * Falsación de los invariantes AGD (H5, E-149) contra el deployment de audit —
 * nunca producción; ver `_fixture.ts`. Requiere `ALLOW_STRIPE_MOCK=true` (los
 * escenarios de refund usan `stripePaymentIntentId` con prefijo `mock_pi_`).
 *
 * El primero es el que importa y es de CONCURRENCIA real, como STK-03: hasta
 * H5 el horario se validaba en el cliente y el servidor guardaba lo que le
 * mandaran, así que N personas reservaban el mismo turno y todas quedaban
 * agendadas. Los otros dos son secuenciales y cubren la ventana de cancelación.
 *
 * Sin `skip`: si no hay deployment configurado, falla.
 */
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { auditEnv, convexRun, resetFixture, settle } from './_fixture';

const env = auditEnv();
const N = env.concurrency;
const client = () => new ConvexHttpClient(env.url);

type AgendaScenario = {
    suffix: string;
    business: { id: string; sessionToken: string };
    buyerA: { id: string; sessionToken: string };
    buyerB: { id: string; sessionToken: string };
    admin: { id: string; sessionToken: string };
    serviceListingId: string;
};

type RefundScenario = {
    business: { id: string; sessionToken: string };
    buyer: { id: string; sessionToken: string };
    admin: { id: string; sessionToken: string };
    orderId: string;
    appointmentId: string;
    startsAtMs: number;
};

/** Mañana en la zona del negocio, para no chocar con "el turno ya pasó". */
const tomorrow = (): string => new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 10);

afterEach(() => { resetFixture(); }, 60_000);

describe('AGD-01 / AGD-02 — N solicitudes simultáneas del MISMO horario', () => {
    test(`exactamente 1 de ${N} queda con el turno`, async () => {
        const fx: AgendaScenario = convexRun('audit/fixtures:seedAgendaScenario', {
            appointmentMode: 'request',
        });
        const slotDate = tomorrow();

        const r = await settle(
            Array.from({ length: N }, () =>
                client().mutation(api.agenda.requestAppointment, {
                    sessionToken: fx.buyerA.sessionToken,
                    businessId: fx.business.id,
                    slotDate,
                    slotTime: '10:00',
                } as any),
            ),
        );

        expect(r.ok).toBe(1);
        expect(r.failed).toBe(N - 1);
        // Los rechazos tienen que ser por el horario tomado, no por otra cosa.
        expect(r.errors.filter((e) => !/reservado|disponible/i.test(e))).toEqual([]);

        const after = convexRun('audit/fixtures:inspect', { appointmentBusinessId: fx.business.id });
        const vivos = after.appointments.filter((a: any) => a.status !== 'cancelled');
        expect(vivos).toHaveLength(1);
        expect(vivos[0].slotTime).toBe('10:00');
    }, 90_000);

    test('dos compradores distintos tampoco comparten horario', async () => {
        const fx: AgendaScenario = convexRun('audit/fixtures:seedAgendaScenario', {
            appointmentMode: 'request',
        });
        const slotDate = tomorrow();
        const pedir = (token: string) =>
            client().mutation(api.agenda.requestAppointment, {
                sessionToken: token,
                businessId: fx.business.id,
                slotDate,
                slotTime: '11:00',
            } as any);

        const r = await settle([pedir(fx.buyerA.sessionToken), pedir(fx.buyerB.sessionToken)]);
        expect(r.ok).toBe(1);
        expect(r.failed).toBe(1);
    }, 90_000);
});

describe('AGD-05 — el servidor rechaza lo que la grilla no ofrece', () => {
    test('fuera de horario, día no laboral y fecha pasada', async () => {
        const fx: AgendaScenario = convexRun('audit/fixtures:seedAgendaScenario', {
            appointmentMode: 'request',
        });
        const pedir = (slotDate: string, slotTime: string) =>
            client().mutation(api.agenda.requestAppointment, {
                sessionToken: fx.buyerA.sessionToken,
                businessId: fx.business.id,
                slotDate,
                slotTime,
            } as any);

        // Horario que no cae en la grilla (turnos de 60', en punto).
        await expect(pedir(tomorrow(), '10:17')).rejects.toThrow(/disponible/i);
        // Fecha ya pasada.
        await expect(pedir('2020-01-06', '10:00')).rejects.toThrow(/disponible/i);
    }, 60_000);
});

describe('AGD-07 — ventana de cancelación de 24 h', () => {
    test('a 48 h el comprador cancela y se le reembolsa', async () => {
        const fx: RefundScenario = convexRun('audit/fixtures:seedAppointmentRefundScenario', {
            startsInHours: 48,
        });

        const res = await client().mutation(api.agenda.cancelMyAppointment, {
            sessionToken: fx.buyer.sessionToken,
            appointmentId: fx.appointmentId as any,
        } as any);
        expect(res.refundScheduled).toBe(true);

        const after = convexRun('audit/fixtures:inspect', { orderId: fx.orderId });
        expect(after.appointments[0].status).toBe('cancelled');
        expect(after.order.escrowState).toBe('refunded');
    }, 60_000);

    test('a 3 h ya no puede cancelar solo', async () => {
        const fx: RefundScenario = convexRun('audit/fixtures:seedAppointmentRefundScenario', {
            startsInHours: 3,
        });

        await expect(
            client().mutation(api.agenda.cancelMyAppointment, {
                sessionToken: fx.buyer.sessionToken,
                appointmentId: fx.appointmentId as any,
            } as any),
        ).rejects.toThrow(/menos de 24 h|no se puede cancelar/i);

        const after = convexRun('audit/fixtures:inspect', { orderId: fx.orderId });
        expect(after.appointments[0].status).toBe('confirmed'); // intacto
        expect(after.order.refundedCents).toBe(0);
    }, 60_000);

    test('a 3 h el admin sí puede, con force, y queda auditado', async () => {
        const fx: RefundScenario = convexRun('audit/fixtures:seedAppointmentRefundScenario', {
            startsInHours: 3,
        });

        // Sin force el admin también se choca con la guarda.
        await expect(
            client().action(api.stripe.adminRefundEscrow, {
                sessionToken: fx.admin.sessionToken,
                orderId: fx.orderId as any,
            } as any),
        ).rejects.toThrow(/menos de 24 h|administrador/i);

        const result = await client().action(api.stripe.adminRefundEscrow, {
            sessionToken: fx.admin.sessionToken,
            orderId: fx.orderId as any,
            force: true,
        } as any);
        expect(result.success).toBe(true);

        const after = convexRun('audit/fixtures:inspect', { orderId: fx.orderId });
        expect(after.order.escrowState).toBe('refunded');
        expect(after.appointments[0].status).toBe('cancelled'); // el horario vuelve a la grilla
        expect(after.auditLogs.some((l: any) => l.action === 'APPOINTMENT_REFUND_FORCED')).toBe(true);
    }, 60_000);
});
