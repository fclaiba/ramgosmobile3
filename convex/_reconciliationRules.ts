/**
 * Reglas de reconciliación para cargos huérfanos — módulo puro, testeable.
 *
 * POR QUÉ EXISTE
 *
 * Stripe cobró (hay un `balance_transaction` de tipo `charge`) pero de este
 * lado no hay orden. Hay dos formas distintas de llegar ahí, y la
 * reconciliación sólo detectaba una:
 *
 *   - `paid_without_order`: el pago quedó marcado como cobrado
 *     (`succeeded`/`succeeded_in_escrow`) pero la creación de órdenes falló
 *     a mitad de camino. Ya se cubría.
 *
 *   - `charged_but_pending`: el webhook **nunca llegó** (destino mal
 *     configurado, no registrado, o el evento sin suscribir). El pago se
 *     queda en `pending` porque es el propio webhook el que lo marca como
 *     cobrado. Como la fila de pago SÍ existe (se crea al crear el
 *     PaymentIntent) y el monto coincide, se colaba entre las tres reglas:
 *     ni `no_local_payment`, ni `paid_without_order`, ni `amount_mismatch`.
 *     Cero alertas. Es E-140, y era el modo de falla más probable.
 *
 * El período de gracia evita alarmas falsas: entre que Stripe cobra y el
 * webhook termina de procesar pasan segundos, y la reconciliación no debería
 * opinar sobre un pago que todavía está legítimamente en vuelo.
 */

/** Margen antes de considerar que un cobro sin orden es un problema. */
export const WEBHOOK_GRACE_SECONDS = 30 * 60;

export type OrphanChargeVerdict =
    /** Nada que reportar. */
    | { kind: "ok" }
    /** Demasiado reciente para juzgar: puede estar procesándose ahora mismo. */
    | { kind: "too_soon" }
    /** Cobrado y marcado como tal, pero sin orden: falló creando las órdenes. */
    | { kind: "paid_without_order" }
    /** Cobrado y el pago sigue `pending`: el webhook nunca llegó. Recuperable. */
    | { kind: "charged_but_pending" };

/**
 * Estados en los que la ausencia de orden es esperable y NO es una anomalía:
 * el dinero ya volvió o está en manos de un proceso que lo maneja aparte.
 */
const TERMINAL_STATUSES = new Set(["refunded", "partially_refunded", "disputed"]);

export function classifyOrphanCharge(input: {
    btType: string;
    /** `balance_transaction.created`, en SEGUNDOS (así lo da Stripe). */
    btCreatedSec: number;
    nowSec: number;
    localStatus?: string;
    hasOrder: boolean;
    graceSeconds?: number;
}): OrphanChargeVerdict {
    const { btType, btCreatedSec, nowSec, localStatus, hasOrder } = input;
    const grace = input.graceSeconds ?? WEBHOOK_GRACE_SECONDS;

    if (btType !== "charge") return { kind: "ok" };
    if (hasOrder) return { kind: "ok" };
    if (localStatus && TERMINAL_STATUSES.has(localStatus)) return { kind: "ok" };
    if (nowSec - btCreatedSec <= grace) return { kind: "too_soon" };

    if (localStatus === "succeeded" || localStatus === "succeeded_in_escrow") {
        return { kind: "paid_without_order" };
    }
    if (localStatus === "pending" || localStatus === "failed" || localStatus === undefined) {
        return { kind: "charged_but_pending" };
    }
    return { kind: "ok" };
}

/**
 * ¿Vale la pena reintentar el procesamiento antes de levantar la alarma?
 *
 * Sólo para `charged_but_pending`: ahí el pago existe, Stripe cobró, y lo
 * único que faltó fue la notificación. Reprocesar es exactamente la
 * recuperación manual que se hace reenviando el evento desde el Dashboard, y
 * el handler es idempotente. En `paid_without_order` el procesamiento ya
 * corrió y falló por otra causa: reintentar a ciegas no ayuda.
 */
export function shouldAttemptRemediation(verdict: OrphanChargeVerdict): boolean {
    return verdict.kind === "charged_but_pending";
}
