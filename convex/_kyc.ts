/**
 * Estado de KYC — reglas compartidas.
 *
 * POR QUÉ EXISTE
 *
 * La resolución del estado efectivo estaba duplicada en `users.sanitizeUser` y
 * en `listings.assertInfluencerKycForBono`, y los gates que de verdad bloquean
 * (`finance.requestWithdrawal`, `businessForms.createForm`) **ni siquiera la
 * usaban**: leían `user.kycStatus` crudo. El resultado era que un usuario sin
 * `kycStatus` veía "verificado" en la app —porque `sanitizeUser` le devolvía
 * `approved`— y al intentar retirar recibía "Se requiere KYC aprobado".
 *
 * Además cada lugar aceptaba un conjunto distinto de valores: `listings`
 * admitía `'completed'`, un estado que **ninguna mutation escribe** y que
 * `fixKyc.ts` tampoco migra, y admitía `'skipped'` (el usuario que tocó
 * "Omitir"), habilitándolo a emitir bonos mientras el mismo usuario no podía
 * retirar. Nadie decidió eso; es deriva.
 *
 * Módulo puro, sin imports de Convex: el prefijo `_` lo mantiene fuera del
 * registro de funciones, igual que `_rewardRules.ts` y `_communityPolicy.ts`.
 */

/**
 * Estados que la base puede contener.
 *
 * `'verified'` es legado y lo migra `fixKyc.ts` a `'approved'`. `'completed'`
 * es legado y NO lo migra nadie, así que se lo trata como equivalente a
 * `'approved'` en la lectura para no dejar afuera a quien lo tenga.
 */
export type RawKycStatus =
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'skipped'
    | 'verified'
    | 'completed'
    | string;

export type EffectiveKycStatus = 'pending' | 'approved' | 'rejected' | 'skipped';

/**
 * Estado efectivo de un usuario.
 *
 * `kycRequired` viene del setting global `require_kyc`, que por defecto está
 * **desactivado**: con el KYC apagado, quien nunca envió documentación se
 * considera aprobado. Un usuario que SÍ tiene estado conserva el suyo — que el
 * toggle esté apagado no borra un rechazo.
 */
export function resolveKycStatus(
    rawStatus: RawKycStatus | undefined | null,
    kycRequired: boolean,
): EffectiveKycStatus {
    if (!rawStatus) return kycRequired ? 'pending' : 'approved';
    if (rawStatus === 'verified' || rawStatus === 'completed') return 'approved';
    if (rawStatus === 'approved' || rawStatus === 'rejected' || rawStatus === 'skipped') {
        return rawStatus;
    }
    return 'pending';
}

/**
 * Retirar dinero exige KYC aprobado de verdad. `'skipped'` no alcanza: omitir
 * la verificación no puede habilitar el movimiento de fondos.
 */
export function canWithdrawFunds(status: EffectiveKycStatus): boolean {
    return status === 'approved';
}

/** Crear formularios de captación de leads: mismo criterio que retirar. */
export function canCreateBusinessForms(status: EffectiveKycStatus): boolean {
    return status === 'approved';
}

/**
 * Emitir bonos como influencer.
 *
 * Acepta `'skipped'` porque es el comportamiento que ya estaba en producción y
 * restringirlo de golpe dejaría afuera a influencers que hoy operan. No mueve
 * dinero hacia afuera: el bono lo paga el comprador y lo cobra el negocio.
 */
export function canIssueBono(status: EffectiveKycStatus): boolean {
    return status === 'approved' || status === 'skipped';
}
