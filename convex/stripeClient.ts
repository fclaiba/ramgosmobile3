/**
 * Cliente Stripe por modo — único punto de instanciación del SDK.
 *
 * Todos los módulos (`stripe.ts`, `http.ts`, `connect.ts`, `reconciliation.ts`,
 * `subscriptions.ts`, `identity.ts`) obtienen el cliente de acá con
 * `getStripe(mode)`. Nunca lanza al cargar el módulo: un deployment sólo con
 * claves de test no debe romper las funciones que usan el modo live y
 * viceversa. El error aparece recién al intentar usar un modo sin clave.
 */
import Stripe from "stripe";
import {
    resolveStripeEnv,
    type StripeEnvResolution,
    type StripeMode,
} from "./_stripeEnv";

export const STRIPE_API_VERSION = "2026-06-24.dahlia";

let cachedEnv: StripeEnvResolution | null = null;
const clients: Partial<Record<StripeMode, Stripe>> = {};

export function stripeEnv(): StripeEnvResolution {
    if (!cachedEnv) {
        cachedEnv = resolveStripeEnv(process.env as Record<string, string | undefined>);
    }
    return cachedEnv;
}

export function hasStripeKey(mode: StripeMode): boolean {
    return !!stripeEnv().keys[mode];
}

export function envVarNameFor(mode: StripeMode): string {
    return mode === "test" ? "STRIPE_SECRET_KEY_TEST" : "STRIPE_SECRET_KEY";
}

export function assertStripeConfigured(mode: StripeMode): void {
    if (!hasStripeKey(mode)) {
        throw new Error(
            `Stripe en modo "${mode}" no está configurado. Definí ${envVarNameFor(mode)} en Convex (npx convex env set).`,
        );
    }
}

export function getStripe(mode: StripeMode): Stripe {
    const existing = clients[mode];
    if (existing) return existing;
    assertStripeConfigured(mode);
    const key = stripeEnv().keys[mode]!;
    const client = new Stripe(key, { apiVersion: STRIPE_API_VERSION as any });
    clients[mode] = client;
    return client;
}

/**
 * Cliente "primario" para operaciones que no pertenecen a un pago concreto
 * (KYC con Stripe Identity, suscripciones): live si está configurado, si
 * no, test.
 */
export function primaryMode(): StripeMode {
    return hasStripeKey("live") ? "live" : "test";
}

export function webhookSecretsFor(mode: StripeMode): string[] {
    return stripeEnv().webhookSecrets[mode];
}

export function isMockAllowed(): boolean {
    return stripeEnv().mockAllowed;
}

export function assertMockAllowed(): void {
    if (!isMockAllowed()) {
        throw new Error(
            "Simulación de pagos deshabilitada en este entorno (ALLOW_STRIPE_MOCK no es true).",
        );
    }
}
