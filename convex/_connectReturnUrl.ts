/**
 * URL de retorno del onboarding de Stripe Connect — módulo puro, testeable.
 *
 * POR QUÉ EXISTE
 *
 * `v2.core.accountLinks.create` **rechaza los esquemas custom**: el
 * `return_url` tiene que empezar con `https://` (o `http://` con localhost,
 * y sólo en modo test). El default histórico era `ramgos://connect`, así que
 * el link de onboarding fallaba SIEMPRE con:
 *
 *   "return_url must be a valid URL and start with https:// or, during
 *    testing, http://. localhost is only allowed in testmode."
 *
 * La app igual se abre por deep link: `ramgos.app` está configurado como
 * universal link / app link (`app.json` → `associatedDomains` +
 * `intentFilters` con `autoVerify`, y `public/.well-known/`), así que
 * `https://ramgos.app/connect/return` abre la app nativa; en web es
 * simplemente la ruta `connect/:result` que ya declara `App.tsx`.
 *
 * En web además hay que volver al ORIGEN desde el que se arrancó: si el dev
 * está en `http://localhost:8081` y lo mandamos a `https://ramgos.app`,
 * termina en producción, con otra sesión. Por eso el cliente puede proponer
 * su propio origen — validado contra una allowlist, porque esto viaja a un
 * tercero y un origen arbitrario sería un redirect abierto.
 */

export type StripeModeLike = "test" | "live";

/** Hosts propios a los que Stripe puede devolver al usuario. */
export const ALLOWED_RETURN_HOSTS = [
    "ramgos.app",
    "www.ramgos.app",
    "ramgos.com",
    "www.ramgos.com",
    "ramgosapp.vercel.app",
] as const;

/** Fallback cuando no hay origen del cliente ni env var utilizable. */
export const DEFAULT_RETURN_BASE = "https://ramgos.app/connect";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const parse = (value: string): URL | null => {
    try {
        return new URL(value);
    } catch {
        return null;
    }
};

/**
 * ¿Stripe aceptaría este origen como `return_url`, y es nuestro?
 *
 * - https + host en la allowlist → sí.
 * - http/https + localhost → sólo en modo test (es la propia regla de Stripe).
 */
export function isAllowedReturnOrigin(origin: string | null | undefined, mode: StripeModeLike): boolean {
    if (!origin) return false;
    const url = parse(origin);
    if (!url) return false;
    const host = url.hostname;
    if (LOCAL_HOSTS.has(host)) {
        return mode === "test" && (url.protocol === "http:" || url.protocol === "https:");
    }
    return url.protocol === "https:" && (ALLOWED_RETURN_HOSTS as readonly string[]).includes(host);
}

/**
 * Base de la URL de retorno, sin barra final. Orden de preferencia:
 *   1. el origen que propone el cliente, si pasa la allowlist (web);
 *   2. `STRIPE_CONNECT_RETURN_URL_BASE`, si es http(s) — un valor con esquema
 *      custom se IGNORA a propósito: Stripe lo rechazaría igual;
 *   3. `DEFAULT_RETURN_BASE`.
 */
export function resolveConnectReturnBase(input: {
    mode: StripeModeLike;
    requestedOrigin?: string | null;
    envBase?: string | null;
}): string {
    const { mode, requestedOrigin, envBase } = input;

    if (isAllowedReturnOrigin(requestedOrigin, mode)) {
        return `${requestedOrigin!.replace(/\/+$/, "")}/connect`;
    }

    if (envBase) {
        const url = parse(envBase);
        if (url && (url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)))) {
            return envBase.replace(/\/+$/, "");
        }
    }

    return DEFAULT_RETURN_BASE;
}
