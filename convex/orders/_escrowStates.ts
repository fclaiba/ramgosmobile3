/**
 * Máquina de estados del ESCROW de una orden — módulo puro.
 *
 * `orders.status` sigue describiendo la logística (pagado, enviado,
 * entregado, completado, cancelado, disputado). `orders.escrowState`
 * describe dónde está la plata:
 *
 *   held            retenida en la cuenta plataforma
 *   release_pending transfer al vendedor en curso (o falló y se reintenta)
 *   released        transferida al vendedor
 *   refund_pending  reembolso en curso
 *   refunded        devuelta al comprador (total)
 *   disputed        disputa interna abierta (plata congelada)
 *   frozen          disputa/chargeback en Stripe (plata congelada por Stripe)
 */

export type EscrowState =
    | "held"
    | "release_pending"
    | "released"
    | "refund_pending"
    | "refunded"
    | "disputed"
    | "frozen";

export const ESCROW_STATES: readonly EscrowState[] = [
    "held",
    "release_pending",
    "released",
    "refund_pending",
    "refunded",
    "disputed",
    "frozen",
];

export const ESCROW_TRANSITIONS: Record<EscrowState, readonly EscrowState[]> = {
    held: ["release_pending", "refund_pending", "disputed", "frozen"],
    release_pending: ["released", "held"],
    released: ["refund_pending", "frozen"],
    // Un reembolso parcial vuelve al estado previo (held o released).
    refund_pending: ["refunded", "held", "released"],
    refunded: [],
    disputed: ["release_pending", "refund_pending", "frozen", "held"],
    frozen: ["held", "released", "refund_pending", "refunded", "disputed"],
};

export function isEscrowState(value: unknown): value is EscrowState {
    return typeof value === "string" && (ESCROW_STATES as readonly string[]).includes(value);
}

export function canTransition(from: string | undefined, to: EscrowState): boolean {
    if (!isEscrowState(from)) return to === "held";
    return ESCROW_TRANSITIONS[from].includes(to);
}

export type ReleaseTrigger =
    | "buyer_confirm"
    | "admin_force"
    | "dispute_seller"
    | "auto_release"
    | "bono_redeemed"
    | "event_auto"
    | "service_auto";

export const RELEASE_TRIGGERS: readonly ReleaseTrigger[] = [
    "buyer_confirm",
    "admin_force",
    "dispute_seller",
    "auto_release",
    "bono_redeemed",
    "event_auto",
    "service_auto",
];

export type RefundSource =
    | "cancel"
    | "dispute_buyer"
    | "admin"
    | "stripe_refund"
    | "stripe_dispute_lost";

/** Días que esperan los fondos del influencer después de liberar la orden. */
export const INFLUENCER_PAYOUT_DELAY_DAYS = 10;

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ventana de auto-liberación por tipo de ítem, en días desde la compra.
 * Servicios y eventos se liberan desde sus propios módulos (`events.ts`).
 */
export const AUTO_RELEASE_DAYS: Readonly<Record<string, number>> = {
    product: 10,
    bono: 1,
    rental: 10,
};

export function releaseDueAtFor(listingType: string | undefined, createdAtMs: number): number | undefined {
    const days = AUTO_RELEASE_DAYS[String(listingType || "product").toLowerCase()];
    if (days === undefined) return undefined;
    return createdAtMs + days * DAY_MS;
}

export function influencerPayoutDueAt(releasedAtMs: number): number {
    return releasedAtMs + INFLUENCER_PAYOUT_DELAY_DAYS * DAY_MS;
}

/** ¿Se puede iniciar una liberación desde este estado? */
export function isReleasable(escrowState: string | undefined, hasReleaseError = false): boolean {
    if (escrowState === "held" || escrowState === undefined) return true;
    if (escrowState === "release_pending" && hasReleaseError) return true;
    return false;
}

/** ¿Se puede iniciar un reembolso desde este estado? */
export function isRefundable(escrowState: string | undefined, hasRefundError = false): boolean {
    if (
        escrowState === "held" ||
        escrowState === "released" ||
        escrowState === "disputed" ||
        escrowState === "frozen" ||
        escrowState === undefined
    ) {
        return true;
    }
    if (escrowState === "refund_pending" && hasRefundError) return true;
    return false;
}
