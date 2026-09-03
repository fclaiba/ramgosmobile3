import {
    AUTO_RELEASE_DAYS,
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
