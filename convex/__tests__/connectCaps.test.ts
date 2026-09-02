import { capsFromAccount, deriveCanPayout, type ConnectCaps } from "../_connectCaps";

const caps = (over: Partial<ConnectCaps> = {}): ConnectCaps => ({
    onboardingComplete: true,
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...over,
});

describe("capsFromAccount", () => {
    it("lee las dos capabilities de la respuesta V2", () => {
        // `payouts` no se puede SOLICITAR en create/update (E-137), pero sí
        // viene en la respuesta: por eso se sigue leyendo.
        const c = capsFromAccount({
            configuration: {
                recipient: {
                    capabilities: {
                        stripe_balance: {
                            stripe_transfers: { status: "active" },
                            payouts: { status: "unsupported" },
                        },
                    },
                },
            },
            requirements: { summary: { minimum_deadline: { status: "up_to_date" } } },
        });
        expect(c.transfersStatus).toBe("active");
        expect(c.payoutsStatus).toBe("unsupported");
        expect(c.onboardingComplete).toBe(true);
    });

    it("una cuenta con requisitos pendientes no está onboardeada", () => {
        const c = capsFromAccount({
            requirements: { summary: { minimum_deadline: { status: "currently_due" } } },
        });
        expect(c.onboardingComplete).toBe(false);
        expect(c.transfersStatus).toBeUndefined();
    });

    it("no explota con una cuenta vacía o nula", () => {
        expect(capsFromAccount(null).onboardingComplete).toBe(true);
        expect(capsFromAccount({}).payoutsStatus).toBeUndefined();
    });
});

describe("deriveCanPayout", () => {
    it("Stripe reporta payouts activa → puede retirar", () => {
        expect(deriveCanPayout(caps({ payoutsStatus: "active" }))).toBe(true);
    });

    it("payouts no activa pero cuenta onboardeada con transfers → puede retirar", () => {
        // El caso que motiva el fallback: `stripe_balance.payouts` no es
        // solicitable, así que Stripe puede no reportarla nunca como activa.
        // Sin esta rama, la pantalla de retiros queda muerta.
        expect(deriveCanPayout(caps({ payoutsStatus: "unsupported", transfersStatus: "active" }))).toBe(true);
        expect(deriveCanPayout(caps({ transfersStatus: "active" }))).toBe(true);
    });

    it("cuenta a medio onboardear → no puede retirar", () => {
        expect(deriveCanPayout(caps({ transfersStatus: "pending" }))).toBe(false);
        expect(deriveCanPayout(caps({ transfersStatus: "active", onboardingComplete: false }))).toBe(false);
    });

    it("sin capacidades → no puede retirar", () => {
        expect(deriveCanPayout(null)).toBe(false);
        expect(deriveCanPayout(undefined)).toBe(false);
    });

    it("es monótona respecto de la regla vieja (payoutsStatus === 'active')", () => {
        // Todo lo que la regla anterior daba true, la nueva también.
        for (const transfersStatus of [undefined, "pending", "active", "restricted"]) {
            for (const onboardingComplete of [true, false]) {
                const c = caps({ payoutsStatus: "active", transfersStatus, onboardingComplete });
                expect(deriveCanPayout(c)).toBe(true);
            }
        }
    });
});
