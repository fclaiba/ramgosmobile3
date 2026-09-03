import {
    AUTO_RELEASE_DAYS,
    INFLUENCER_PAYOUT_MAX_ATTEMPTS,
    RELEASE_MAX_ATTEMPTS,
    retryPayoutAtMs,
    canTransition,
    DAY_MS,
    INFLUENCER_PAYOUT_DELAY_DAYS,
    influencerPayoutDueAt,
    isRefundable,
    isReleasable,
    releaseDueAtFor,
} from "../orders/_escrowStates";

describe("escrow state machine", () => {
    it("transiciones válidas", () => {
        expect(canTransition("held", "release_pending")).toBe(true);
        expect(canTransition("release_pending", "released")).toBe(true);
        expect(canTransition("release_pending", "held")).toBe(true);
        expect(canTransition("released", "refund_pending")).toBe(true);
        expect(canTransition("frozen", "held")).toBe(true);
        expect(canTransition(undefined, "held")).toBe(true);
    });
    it("transiciones inválidas", () => {
        expect(canTransition("refunded", "held")).toBe(false);
        expect(canTransition("held", "released")).toBe(false); // siempre pasa por release_pending
        expect(canTransition("released", "held")).toBe(false);
    });
    it("isReleasable / isRefundable", () => {
        expect(isReleasable("held")).toBe(true);
        expect(isReleasable("release_pending")).toBe(false);
        expect(isReleasable("release_pending", true)).toBe(true);
        expect(isReleasable("released")).toBe(false);
        expect(isRefundable("released")).toBe(true);
        expect(isRefundable("refunded")).toBe(false);
        expect(isRefundable("refund_pending", true)).toBe(true);
    });
});

describe("plazos", () => {
    const t0 = 1_700_000_000_000;
    it("producto 10 días, bono 1 día, servicio sin auto-liberación", () => {
        expect(releaseDueAtFor("product", t0)).toBe(t0 + 10 * DAY_MS);
        expect(releaseDueAtFor("bono", t0)).toBe(t0 + 1 * DAY_MS);
        expect(releaseDueAtFor("service", t0)).toBeUndefined();
        expect(releaseDueAtFor("event", t0)).toBeUndefined();
        expect(releaseDueAtFor(undefined, t0)).toBe(t0 + AUTO_RELEASE_DAYS.product * DAY_MS);
    });
    it("influencer cobra a los 10 días de liberada la orden", () => {
        expect(INFLUENCER_PAYOUT_DELAY_DAYS).toBe(10);
        expect(influencerPayoutDueAt(t0)).toBe(t0 + 10 * DAY_MS);
    });
});

/**
 * El invariante que causó E-141 #1: `confirmReceipt` deja la orden en
 * `release_pending` con `escrowReleaseError: undefined` ANTES de agendar la
 * acción de Stripe. Si la liberación falla, alguien tiene que devolverla a
 * `held` CON el error puesto — si no, cae en el único estado del que no se
 * puede salir, y ni el reintento del comprador ni el forzado de admin la
 * rescatan.
 */
describe("recuperabilidad tras una liberación fallida", () => {
    it("release_pending SIN error es el estado trabado: nadie puede reintentar", () => {
        expect(isReleasable("release_pending", false)).toBe(false);
    });

    it("held CON error sí es reintentable — es a donde debe volver la orden", () => {
        expect(isReleasable("held", true)).toBe(true);
        expect(isReleasable("held", false)).toBe(true);
    });

    it("release_pending CON error también deja reintentar", () => {
        expect(isReleasable("release_pending", true)).toBe(true);
    });

    it("un estado terminal no se reintenta ni marcándolo con error", () => {
        for (const st of ["released", "refunded", "disputed", "frozen"]) {
            expect(isReleasable(st, true)).toBe(false);
            expect(isReleasable(st, false)).toBe(false);
        }
    });
});

/**
 * El espejo del bloque anterior, del lado del REEMBOLSO (E-146 #A1).
 *
 * El mismo defecto de E-141 quedó vivo acá: al resolver una disputa a favor
 * del comprador se pre-seteaba `refund_pending` sin error, y el reembolso
 * arrancaba fuera del `try`. Resultado: el comprador ganaba la disputa, nunca
 * cobraba, y la orden quedaba en el único estado del que no se puede salir.
 */
describe("recuperabilidad tras un reembolso fallido", () => {
    it("refund_pending SIN error es el estado trabado del lado del refund", () => {
        expect(isRefundable("refund_pending", false)).toBe(false);
    });

    it("refund_pending CON error sí deja reintentar", () => {
        expect(isRefundable("refund_pending", true)).toBe(true);
    });

    it("los estados desde los que SÍ se puede reembolsar", () => {
        for (const st of ["held", "released", "disputed", "frozen", undefined]) {
            expect(isRefundable(st, false)).toBe(true);
        }
    });

    it("una orden ya reembolsada no se reembolsa de nuevo, ni marcándola con error", () => {
        expect(isRefundable("refunded", false)).toBe(false);
        expect(isRefundable("refunded", true)).toBe(false);
    });
});

/**
 * Reintento de pagos fallidos (E-146 #A2/#A3).
 *
 * Antes, un payout de influencer sin cuenta Connect iba derecho a `failed`
 * (terminal, el cron sólo levanta `scheduled`) y una orden cuya liberación
 * falló quedaba excluida del cron para siempre. En los dos casos la causa
 * típica es transitoria, así que se reintenta — pero con espera creciente,
 * porque un fallo determinístico si no genera un intento por día eternamente.
 */
describe("espera creciente entre reintentos", () => {
    const t0 = 1_700_000_000_000;

    it("crece al doble: 1, 2, 4 días", () => {
        expect(retryPayoutAtMs(t0, 1)).toBe(t0 + 1 * DAY_MS);
        expect(retryPayoutAtMs(t0, 2)).toBe(t0 + 2 * DAY_MS);
        expect(retryPayoutAtMs(t0, 3)).toBe(t0 + 4 * DAY_MS);
    });

    it("tiene techo de 7 días — no se va a meses", () => {
        for (const intentos of [4, 5, 6, 10, 50]) {
            expect(retryPayoutAtMs(t0, intentos)).toBe(t0 + 7 * DAY_MS);
        }
    });

    it("siempre agenda hacia adelante", () => {
        for (const intentos of [0, 1, 5, 99]) {
            expect(retryPayoutAtMs(t0, intentos)).toBeGreaterThan(t0);
        }
    });

    it("los topes son finitos: lo que falla termina dándose por perdido", () => {
        expect(INFLUENCER_PAYOUT_MAX_ATTEMPTS).toBeGreaterThan(1);
        expect(RELEASE_MAX_ATTEMPTS).toBeGreaterThan(1);
        expect(Number.isFinite(INFLUENCER_PAYOUT_MAX_ATTEMPTS)).toBe(true);
        expect(Number.isFinite(RELEASE_MAX_ATTEMPTS)).toBe(true);
    });
});
