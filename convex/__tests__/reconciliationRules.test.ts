import {
    classifyOrphanCharge,
    shouldAttemptRemediation,
    WEBHOOK_GRACE_SECONDS,
} from "../_reconciliationRules";

const NOW = 1_800_000_000;
const OLD = NOW - WEBHOOK_GRACE_SECONDS - 60; // fuera del período de gracia

const judge = (over: Partial<Parameters<typeof classifyOrphanCharge>[0]> = {}) =>
    classifyOrphanCharge({
        btType: "charge",
        btCreatedSec: OLD,
        nowSec: NOW,
        hasOrder: false,
        ...over,
    });

describe("classifyOrphanCharge", () => {
    it("el caso de E-140: cobrado, pago en pending, sin orden → el webhook nunca llegó", () => {
        // Antes de esta regla esto no caía en NINGUNA: la fila de pago existe
        // (no es no_local_payment), el status no es succeeded (no es
        // paid_without_order) y el monto coincide (no es amount_mismatch).
        expect(judge({ localStatus: "pending" })).toEqual({ kind: "charged_but_pending" });
    });

    it("cobrado y marcado como cobrado, pero sin orden → falló creando órdenes", () => {
        expect(judge({ localStatus: "succeeded" })).toEqual({ kind: "paid_without_order" });
        expect(judge({ localStatus: "succeeded_in_escrow" })).toEqual({ kind: "paid_without_order" });
    });

    it("con orden asociada no hay nada que reportar", () => {
        for (const localStatus of ["pending", "succeeded", "succeeded_in_escrow", undefined]) {
            expect(judge({ localStatus, hasOrder: true })).toEqual({ kind: "ok" });
        }
    });

    it("respeta el período de gracia: un cobro recién hecho puede estar en vuelo", () => {
        expect(judge({ localStatus: "pending", btCreatedSec: NOW - 10 })).toEqual({ kind: "too_soon" });
        expect(judge({ localStatus: "pending", btCreatedSec: NOW - WEBHOOK_GRACE_SECONDS })).toEqual({
            kind: "too_soon",
        });
        // Justo pasado el margen ya se juzga.
        expect(judge({ localStatus: "pending", btCreatedSec: NOW - WEBHOOK_GRACE_SECONDS - 1 })).toEqual({
            kind: "charged_but_pending",
        });
    });

    it("el margen se puede ajustar (para tests y corridas manuales)", () => {
        expect(
            judge({ localStatus: "pending", btCreatedSec: NOW - 5, graceSeconds: 0 }),
        ).toEqual({ kind: "charged_but_pending" });
    });

    it("si la plata ya volvió o está en disputa, la falta de orden es esperable", () => {
        for (const localStatus of ["refunded", "partially_refunded", "disputed"]) {
            expect(judge({ localStatus })).toEqual({ kind: "ok" });
        }
    });

    it("sólo mira balance transactions de tipo charge", () => {
        for (const btType of ["transfer", "refund", "payout", "adjustment", "stripe_fee"]) {
            expect(judge({ btType, localStatus: "pending" })).toEqual({ kind: "ok" });
        }
    });

    it("un pago sin status conocido se trata como webhook faltante, no se ignora", () => {
        expect(judge({ localStatus: undefined })).toEqual({ kind: "charged_but_pending" });
    });
});

describe("shouldAttemptRemediation", () => {
    it("sólo se reintenta el caso recuperable: falta el aviso, no el cobro", () => {
        expect(shouldAttemptRemediation({ kind: "charged_but_pending" })).toBe(true);
    });

    it("no se reintenta a ciegas lo que ya se procesó y falló por otra causa", () => {
        expect(shouldAttemptRemediation({ kind: "paid_without_order" })).toBe(false);
        expect(shouldAttemptRemediation({ kind: "ok" })).toBe(false);
        expect(shouldAttemptRemediation({ kind: "too_soon" })).toBe(false);
    });
});
