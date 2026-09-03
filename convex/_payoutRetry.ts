/**
 * Decisiones de reintento de pagos fallidos — módulo puro, testeable.
 *
 * POR QUÉ EXISTE
 *
 * Dos caminos que mueven plata fallaban de forma terminal y silenciosa
 * (E-146 #A2 y #A3):
 *
 *   - El payout al influencer sin cuenta Connect iba derecho a `failed`, y el
 *     cron sólo levanta `scheduled`: la comisión se perdía sin que nadie se
 *     enterara.
 *   - Una orden cuya liberación falló una vez quedaba excluida del cron para
 *     siempre, así que la plata del vendedor se quedaba quieta.
 *
 * En los dos la causa típica es transitoria — alguien que todavía no vinculó
 * su cuenta y puede hacerlo mañana. Por eso se reintenta; pero con espera
 * creciente, porque un fallo determinístico si no genera un intento y un aviso
 * por día, para siempre.
 *
 * La decisión vive acá y no adentro de las mutations porque `convex-test`
 * necesita Vitest y este repo usa Jest: sacarla a un módulo puro es lo que
 * permite cubrirla con tests, siguiendo la convención de `_split.ts`,
 * `_escrowStates.ts` y `_reconciliationRules.ts`.
 */

import { RELEASE_MAX_ATTEMPTS, retryPayoutAtMs } from "./orders/_escrowStates";

export type ReleaseRetryInput = {
    releaseDueAt?: number;
    escrowReleaseError?: string;
    escrowReleaseAttempts?: number;
    escrowReleaseFailedAtMs?: number;
    nowMs: number;
};

/**
 * ¿El cron debe intentar liberar esta orden?
 *
 * - Sin fecha de vencimiento: no es candidata.
 * - Sin error previo: sí, es el caso normal.
 * - Con error: sólo si quedan intentos y ya pasó la espera.
 */
export function shouldRetryRelease(o: ReleaseRetryInput): boolean {
    if (o.releaseDueAt === undefined) return false;
    if (!o.escrowReleaseError) return true;
    const intentos = o.escrowReleaseAttempts ?? 1;
    if (intentos >= RELEASE_MAX_ATTEMPTS) return false;
    return o.nowMs >= retryPayoutAtMs(o.escrowReleaseFailedAtMs ?? 0, intentos);
}

export type PayoutClaimVerdict =
    /** La orden ya no está liberada: la comisión no corresponde. */
    | { kind: "cancel"; reason: string }
    /** Falta la cuenta del influencer, pero quedan intentos. */
    | { kind: "reschedule"; attempts: number; nextAtMs: number; reason: string }
    /** Se agotaron los intentos: se da por perdida y se avisa. */
    | { kind: "give_up"; attempts: number; reason: string }
    /** Todo en orden, se puede transferir. */
    | { kind: "proceed"; attempts: number };

export function classifyPayoutClaim(input: {
    payoutStatus: string;
    amountInCents: number;
    orderEscrowState?: string;
    hasDestination: boolean;
    attempts?: number;
    nowMs: number;
    maxAttempts: number;
    mode: string;
}): PayoutClaimVerdict {
    const attempts = (input.attempts ?? 0) + 1;

    if (input.orderEscrowState !== "released" || input.amountInCents <= 0) {
        return { kind: "cancel", reason: "orden no liberada al vencer" };
    }
    if (!input.hasDestination) {
        const reason = `El influencer no tiene cuenta Stripe Connect (modo ${input.mode}).`;
        if (attempts >= input.maxAttempts) return { kind: "give_up", attempts, reason };
        return { kind: "reschedule", attempts, nextAtMs: retryPayoutAtMs(input.nowMs, attempts), reason };
    }
    return { kind: "proceed", attempts };
}
