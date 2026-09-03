import { canUseTestMode, publicStripeModes, TEST_MODE_DENIED_MESSAGE } from "../_paymentModeAccess";

const AMBAS = { test: "sk_test_x", live: "sk_live_x" };

describe("canUseTestMode", () => {
    it("habilita a administración y a cuentas de prueba", () => {
        expect(canUseTestMode({ role: "admin" })).toBe(true);
        expect(canUseTestMode({ role: "developer" })).toBe(true);
        expect(canUseTestMode({ role: "consumer", isTest: true })).toBe(true);
    });

    it("niega a cualquier otro, incluido el deslogueado", () => {
        expect(canUseTestMode({ role: "consumer" })).toBe(false);
        expect(canUseTestMode({ role: "business" })).toBe(false);
        expect(canUseTestMode({ role: "influencer" })).toBe(false);
        expect(canUseTestMode({ role: "consumer", isTest: false })).toBe(false);
        expect(canUseTestMode({})).toBe(false);
        expect(canUseTestMode(null)).toBe(false);
        expect(canUseTestMode(undefined)).toBe(false);
    });
});

describe("publicStripeModes", () => {
    it("al comprador común sólo se le ofrece live — de esto depende que la app publicada cobre", () => {
        // El cliente ya publicado hace
        //   availableModes = ['test','live'].filter(m => tieneClave(m) && backend.modes[m])
        // y cae al primero disponible si el guardado no está. Con `test:false`
        // elige `live` por su cuenta, sin necesidad de actualizar la app.
        expect(publicStripeModes(AMBAS, null)).toEqual({ test: false, live: true });
        expect(publicStripeModes(AMBAS, { role: "consumer" })).toEqual({ test: false, live: true });
        expect(publicStripeModes(AMBAS, { role: "business" })).toEqual({ test: false, live: true });
    });

    it("administración y cuentas de prueba conservan los dos modos", () => {
        for (const actor of [{ role: "admin" }, { role: "developer" }, { role: "x", isTest: true }]) {
            expect(publicStripeModes(AMBAS, actor)).toEqual({ test: true, live: true });
        }
    });

    it("el permiso no inventa claves que no están configuradas", () => {
        expect(publicStripeModes({ live: "sk_live_x" }, { role: "admin" })).toEqual({
            test: false,
            live: true,
        });
        expect(publicStripeModes({}, { role: "admin" })).toEqual({ test: false, live: false });
    });

    it("caso borde: entorno sólo con clave de test deja al comprador sin ningún modo", () => {
        // Correcto: no hay con qué cobrarle de verdad. Pasa en entornos de
        // desarrollo, no en producción, donde siempre hay clave live.
        expect(publicStripeModes({ test: "sk_test_x" }, { role: "consumer" })).toEqual({
            test: false,
            live: false,
        });
        expect(publicStripeModes({ test: "sk_test_x" }, { role: "admin" })).toEqual({
            test: true,
            live: false,
        });
    });

    it("live nunca depende de quién pregunta", () => {
        for (const actor of [null, { role: "consumer" }, { role: "admin" }]) {
            expect(publicStripeModes(AMBAS, actor).live).toBe(true);
            expect(publicStripeModes({ test: "sk_test_x" }, actor).live).toBe(false);
        }
    });

    it("el mensaje de rechazo le dice al usuario qué hacer", () => {
        // Lo recibe alguien con una app vieja que todavía pide modo prueba.
        expect(TEST_MODE_DENIED_MESSAGE).toMatch(/reintent/i);
    });
});
