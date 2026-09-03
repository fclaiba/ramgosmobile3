import { classifyPayoutClaim, shouldRetryRelease } from "../_payoutRetry";
import { DAY_MS, INFLUENCER_PAYOUT_MAX_ATTEMPTS, RELEASE_MAX_ATTEMPTS } from "../orders/_escrowStates";

const T0 = 1_800_000_000_000;

describe("shouldRetryRelease", () => {
    it("el caso normal: orden vencida sin fallos previos, se libera", () => {
        expect(shouldRetryRelease({ releaseDueAt: T0 - DAY_MS, nowMs: T0 })).toBe(true);
    });

    it("una orden sin fecha de vencimiento no es candidata", () => {
        // Servicios y eventos no tienen auto-liberación por este cron.
        expect(shouldRetryRelease({ nowMs: T0 })).toBe(false);
        expect(shouldRetryRelease({ escrowReleaseError: "x", nowMs: T0 })).toBe(false);
    });

    it("tras un fallo espera antes de reintentar — no lo hace en la misma corrida", () => {
        const base = {
            releaseDueAt: T0 - DAY_MS,
            escrowReleaseError: "vendedor sin cuenta",
            escrowReleaseAttempts: 1,
            escrowReleaseFailedAtMs: T0,
        };
        expect(shouldRetryRelease({ ...base, nowMs: T0 + 1000 })).toBe(false);
        expect(shouldRetryRelease({ ...base, nowMs: T0 + DAY_MS })).toBe(true);
    });

    it("la espera crece con cada fallo", () => {
        const base = {
            releaseDueAt: T0 - DAY_MS,
            escrowReleaseError: "x",
            escrowReleaseFailedAtMs: T0,
        };
        // 2 intentos -> 2 días; 3 -> 4 días
        expect(shouldRetryRelease({ ...base, escrowReleaseAttempts: 2, nowMs: T0 + DAY_MS })).toBe(false);
        expect(shouldRetryRelease({ ...base, escrowReleaseAttempts: 2, nowMs: T0 + 2 * DAY_MS })).toBe(true);
        expect(shouldRetryRelease({ ...base, escrowReleaseAttempts: 3, nowMs: T0 + 3 * DAY_MS })).toBe(false);
        expect(shouldRetryRelease({ ...base, escrowReleaseAttempts: 3, nowMs: T0 + 4 * DAY_MS })).toBe(true);
    });

    it("deja de reintentar al agotar los intentos — un fallo permanente no genera ruido eterno", () => {
        expect(
            shouldRetryRelease({
                releaseDueAt: T0 - DAY_MS,
                escrowReleaseError: "x",
                escrowReleaseAttempts: RELEASE_MAX_ATTEMPTS,
                escrowReleaseFailedAtMs: 0,
                nowMs: T0 + 999 * DAY_MS,
            }),
        ).toBe(false);
    });

    it("el bug que arregla: antes una orden con error quedaba excluida PARA SIEMPRE", () => {
        // Con el filtro viejo (`!escrowReleaseError`) esto daba false eternamente.
        expect(
            shouldRetryRelease({
                releaseDueAt: T0 - DAY_MS,
                escrowReleaseError: "el vendedor no completó su cuenta de pagos",
                escrowReleaseAttempts: 1,
                escrowReleaseFailedAtMs: T0 - 5 * DAY_MS,
                nowMs: T0,
            }),
        ).toBe(true);
    });
});

describe("classifyPayoutClaim", () => {
    const base = {
        payoutStatus: "scheduled",
        amountInCents: 500,
        orderEscrowState: "released",
        hasDestination: true,
        nowMs: T0,
        maxAttempts: INFLUENCER_PAYOUT_MAX_ATTEMPTS,
        mode: "live",
    };

    it("todo en orden: se transfiere", () => {
        expect(classifyPayoutClaim(base)).toEqual({ kind: "proceed", attempts: 1 });
    });

    it("si la orden dejó de estar liberada, la comisión no corresponde", () => {
        for (const st of ["refunded", "frozen", "held", undefined]) {
            expect(classifyPayoutClaim({ ...base, orderEscrowState: st }).kind).toBe("cancel");
        }
    });

    it("monto cero o negativo se cancela", () => {
        expect(classifyPayoutClaim({ ...base, amountInCents: 0 }).kind).toBe("cancel");
        expect(classifyPayoutClaim({ ...base, amountInCents: -1 }).kind).toBe("cancel");
    });

    it("sin cuenta vinculada REPROGRAMA — el influencer puede vincularla mañana", () => {
        // Éste es el bug: antes iba directo a `failed`, terminal, y la
        // comisión se perdía porque el cron sólo levanta `scheduled`.
        const v = classifyPayoutClaim({ ...base, hasDestination: false });
        expect(v.kind).toBe("reschedule");
        if (v.kind === "reschedule") {
            expect(v.nextAtMs).toBeGreaterThan(T0);
            expect(v.reason).toMatch(/Connect/i);
        }
    });

    it("al agotar los intentos se da por perdida, para poder avisar", () => {
        const v = classifyPayoutClaim({
            ...base,
            hasDestination: false,
            attempts: INFLUENCER_PAYOUT_MAX_ATTEMPTS - 1,
        });
        expect(v.kind).toBe("give_up");
    });

    it("la espera crece entre reintentos", () => {
        const a = classifyPayoutClaim({ ...base, hasDestination: false, attempts: 1 });
        const b = classifyPayoutClaim({ ...base, hasDestination: false, attempts: 2 });
        if (a.kind === "reschedule" && b.kind === "reschedule") {
            expect(b.nextAtMs).toBeGreaterThan(a.nextAtMs);
        } else {
            throw new Error("ambos deberían reprogramarse");
        }
    });

    it("la orden no liberada gana sobre la falta de cuenta: no se reprograma algo que no corresponde", () => {
        const v = classifyPayoutClaim({ ...base, orderEscrowState: "refunded", hasDestination: false });
        expect(v.kind).toBe("cancel");
    });
});
