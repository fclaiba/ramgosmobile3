import {
    DEFAULT_RETURN_BASE,
    isAllowedReturnOrigin,
    resolveConnectReturnBase,
} from "../_connectReturnUrl";

describe("isAllowedReturnOrigin", () => {
    it("acepta los hosts propios por https", () => {
        expect(isAllowedReturnOrigin("https://ramgos.app", "live")).toBe(true);
        expect(isAllowedReturnOrigin("https://www.ramgos.app", "live")).toBe(true);
        expect(isAllowedReturnOrigin("https://ramgosapp.vercel.app", "test")).toBe(true);
    });

    it("acepta localhost SÓLO en modo test (es la regla de Stripe)", () => {
        expect(isAllowedReturnOrigin("http://localhost:8081", "test")).toBe(true);
        expect(isAllowedReturnOrigin("http://127.0.0.1:19006", "test")).toBe(true);
        expect(isAllowedReturnOrigin("http://localhost:8081", "live")).toBe(false);
    });

    it("rechaza esquemas custom — Stripe los rechaza igual", () => {
        expect(isAllowedReturnOrigin("ramgos://connect", "test")).toBe(false);
        expect(isAllowedReturnOrigin("ramgos://connect", "live")).toBe(false);
    });

    it("rechaza hosts ajenos: esto viaja a un tercero, sería un redirect abierto", () => {
        expect(isAllowedReturnOrigin("https://evil.example.com", "live")).toBe(false);
        expect(isAllowedReturnOrigin("https://ramgos.app.evil.com", "live")).toBe(false);
        expect(isAllowedReturnOrigin("http://ramgos.app", "live")).toBe(false);
        expect(isAllowedReturnOrigin("no-es-una-url", "test")).toBe(false);
        expect(isAllowedReturnOrigin(null, "test")).toBe(false);
        expect(isAllowedReturnOrigin(undefined, "test")).toBe(false);
    });
});

describe("resolveConnectReturnBase", () => {
    it("prefiere el origen del cliente cuando es válido", () => {
        expect(resolveConnectReturnBase({ mode: "test", requestedOrigin: "http://localhost:8081" })).toBe(
            "http://localhost:8081/connect",
        );
        expect(resolveConnectReturnBase({ mode: "live", requestedOrigin: "https://ramgos.app" })).toBe(
            "https://ramgos.app/connect",
        );
    });

    it("ignora un origen no permitido y cae al siguiente escalón", () => {
        expect(
            resolveConnectReturnBase({ mode: "live", requestedOrigin: "https://evil.example.com" }),
        ).toBe(DEFAULT_RETURN_BASE);
        // localhost en live no vale, pero la env var sí
        expect(
            resolveConnectReturnBase({
                mode: "live",
                requestedOrigin: "http://localhost:8081",
                envBase: "https://ramgosapp.vercel.app/connect",
            }),
        ).toBe("https://ramgosapp.vercel.app/connect");
    });

    it("usa la env var cuando es http(s)", () => {
        expect(resolveConnectReturnBase({ mode: "live", envBase: "https://ramgos.app/connect" })).toBe(
            "https://ramgos.app/connect",
        );
    });

    it("IGNORA una env var con esquema custom — es el bug que rompía el onboarding", () => {
        // El default histórico era `ramgos://connect` y Stripe lo rechazaba
        // siempre. Si alguien lo dejó cargado en la env var, no lo obedecemos.
        expect(resolveConnectReturnBase({ mode: "test", envBase: "ramgos://connect" })).toBe(
            DEFAULT_RETURN_BASE,
        );
    });

    it("sin nada configurado devuelve el default https", () => {
        expect(resolveConnectReturnBase({ mode: "test" })).toBe(DEFAULT_RETURN_BASE);
        expect(DEFAULT_RETURN_BASE.startsWith("https://")).toBe(true);
    });

    it("normaliza la barra final para no generar `//connect`", () => {
        expect(resolveConnectReturnBase({ mode: "test", requestedOrigin: "http://localhost:8081/" })).toBe(
            "http://localhost:8081/connect",
        );
        expect(resolveConnectReturnBase({ mode: "live", envBase: "https://ramgos.app/connect/" })).toBe(
            "https://ramgos.app/connect",
        );
    });

    it("el resultado siempre es aceptable para Stripe", () => {
        const cases = [
            { mode: "test" as const, requestedOrigin: "ramgos://connect" },
            { mode: "live" as const, envBase: "ramgos://connect" },
            { mode: "live" as const, requestedOrigin: "https://evil.example.com" },
            { mode: "test" as const },
        ];
        for (const c of cases) {
            const base = resolveConnectReturnBase(c);
            expect(base.startsWith("https://") || base.startsWith("http://localhost")).toBe(true);
        }
    });
});
