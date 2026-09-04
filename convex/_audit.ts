/**
 * Forma del registro de auditoría para lo que mueve dinero o cambia
 * privilegios.
 *
 * POR QUÉ EXISTE
 *
 * Antes de esto, `audit_logs` sólo se poblaba desde 9 acciones (impersonar,
 * banear/desbanear) y **ninguna de dinero**: liberar escrow, reembolsar,
 * retirar, resolver una discrepancia de reconciliación, cambiar un rol,
 * borrar un usuario o tocar un flag global quedaban sin rastro. Si alguien
 * disputa un movimiento, hoy no hay forma de reconstruir quién lo autorizó.
 *
 * Módulo puro (sin `ctx`, sin imports de Convex): arma el objeto a insertar,
 * no lo inserta. Cada mutation/action sigue siendo dueña de su propio
 * `ctx.db.insert("audit_logs", buildAuditRecord(...))` — así este archivo se
 * testea con Jest sin `convex-test`, igual que `_roles.ts`.
 */

export type AuditAction =
    | "ESCROW_RELEASED"
    | "ESCROW_REFUNDED"
    | "WITHDRAWAL_CREATED"
    | "RECONCILIATION_RESOLVED"
    | "USER_ROLE_CHANGED"
    | "USER_DELETED"
    | "GLOBAL_SETTING_CHANGED"
    /**
     * H2 (E-149 BON-07): un admin reembolsó una orden cuyo bono ya estaba
     * `redeemed` (el negocio entregó el crédito). Sólo se emite cuando el
     * refund saltea la guarda con `force` — es la traza de "alguien decidió
     * a mano devolverle la plata a un comprador que ya gastó el crédito".
     */
    | "BONO_REFUND_FORCED";

export type AuditParams = {
    actorUserId: string;
    targetUserId?: string;
    action: AuditAction;
    /** Monto involucrado, en centavos. Ausente si la acción no mueve dinero. */
    amountCents?: number;
    /** Estado previo relevante — lo mínimo para reconstruir el cambio. */
    before?: unknown;
    /** Estado posterior relevante. */
    after?: unknown;
    /** Cualquier otro dato de contexto (orderId, reason, etc). */
    metadata?: Record<string, unknown>;
};

/** Arma el registro a insertar en `audit_logs`. No inserta nada. */
export function buildAuditRecord(params: AuditParams) {
    return {
        actorUserId: params.actorUserId,
        targetUserId: params.targetUserId,
        action: params.action,
        timestamp: new Date().toISOString(),
        metadata: {
            ...(params.metadata ?? {}),
            ...(params.amountCents !== undefined ? { amountCents: params.amountCents } : {}),
            ...(params.before !== undefined ? { before: params.before } : {}),
            ...(params.after !== undefined ? { after: params.after } : {}),
        },
    };
}
