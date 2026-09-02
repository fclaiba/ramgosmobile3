/**
 * Capacidades de una cuenta Connect V2 — módulo puro (sin imports de Convex ni
 * del SDK), testeable con jest.
 *
 * POR QUÉ EXISTE
 *
 * En la API V2 de Stripe (`2026-06-24.dahlia`), `configuration.recipient.
 * capabilities.stripe_balance` es ASIMÉTRICA:
 *
 *   - Al CREAR y al ACTUALIZAR sólo se puede solicitar `stripe_transfers`
 *     (recibir transfers de la plataforma). Mandar `payouts: { requested }`
 *     ahí hace que Stripe rechace el request entero con "Unknown field"
 *     (ver E-137: el onboarding quedó bloqueado en runtime por eso).
 *   - En la RESPUESTA sí vienen las dos, `stripe_transfers` y `payouts`.
 *
 * O sea: `payouts` se LEE pero no se PIDE. Con `dashboard: 'express'`, el
 * retiro a la cuenta bancaria lo administra el propio vendedor desde su
 * dashboard Express, así que la plataforma no necesita (ni puede) solicitar
 * esa capability.
 *
 * De ahí `deriveCanPayout`: si Stripe reporta `payouts` activa, se le cree;
 * si no la reporta, una cuenta con transfers activos y onboarding completo
 * igual se considera operativa. Ver el comentario de la función.
 */

export type ConnectCaps = {
    transfersStatus?: string;
    payoutsStatus?: string;
    requirementsStatus?: string;
    onboardingComplete: boolean;
    updatedAt: string;
};

/** Forma (parcial) de la cuenta V2 que devuelve `v2.core.accounts.retrieve`. */
export type V2AccountLike = {
    configuration?: {
        recipient?: {
            capabilities?: {
                stripe_balance?: {
                    stripe_transfers?: { status?: string };
                    payouts?: { status?: string };
                };
            };
        };
    };
    requirements?: {
        summary?: { minimum_deadline?: { status?: string } };
    };
};

/** Extrae capacidades/requisitos de una cuenta V2 ya recuperada. */
export function capsFromAccount(account: V2AccountLike | null | undefined): ConnectCaps {
    const sb = account?.configuration?.recipient?.capabilities?.stripe_balance;
    const requirementsStatus: string | undefined =
        account?.requirements?.summary?.minimum_deadline?.status ?? undefined;
    return {
        transfersStatus: sb?.stripe_transfers?.status ?? undefined,
        payoutsStatus: sb?.payouts?.status ?? undefined,
        requirementsStatus,
        onboardingComplete: requirementsStatus !== "currently_due" && requirementsStatus !== "past_due",
        updatedAt: new Date().toISOString(),
    };
}

/**
 * ¿La cuenta puede sacar la plata a su banco?
 *
 * Es un OR deliberadamente MONÓTONO respecto de la regla vieja
 * (`payoutsStatus === 'active'`): todo lo que antes daba `true` sigue dando
 * `true`, así que no puede romper una cuenta que hoy funciona.
 *
 * La segunda rama no es un criterio nuevo: es la misma definición de "cuenta
 * activa" que ya usa `internalSaveConnectFlags` para marcar `status: 'active'`
 * y notificar "Cuenta de pagos lista". Existe porque `stripe_balance.payouts`
 * no es solicitable (ver cabecera): si Stripe nunca la reporta activa, sin
 * este fallback la pantalla de retiros queda muerta para vendedores que
 * completaron el onboarding y sí pueden cobrar.
 */
export function deriveCanPayout(caps: ConnectCaps | null | undefined): boolean {
    if (!caps) return false;
    if (caps.payoutsStatus === "active") return true;
    return caps.transfersStatus === "active" && caps.onboardingComplete;
}
