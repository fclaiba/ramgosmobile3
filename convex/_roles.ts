/**
 * Matriz de permisos por rol.
 *
 * POR QUÉ EXISTE
 *
 * Había **tres** formas distintas de preguntar "¿es admin?" conviviendo en el
 * mismo código:
 *
 *   1. `assertAdminOrDeveloper` en `authHelpers.ts` — la canónica.
 *   2. Una copia local `assertAdmin` en `adminQueries.ts`, cuyo nombre **miente**
 *      porque también acepta `developer`.
 *   3. El `if (actor.role !== "admin" && actor.role !== "developer")` copiado a
 *      mano en `stripe.ts`, `finance.ts` y otros.
 *
 * Con tres implementaciones, el resultado fue que `developer` quedó equivalente
 * a `admin` en 45 de 47 chequeos — incluidas **las dos acciones que mueven
 * dinero real**: liberar escrow y reembolsar. Eso contradice el requisito de
 * "control maestro conservado por el dueño, sin accesos administrativos
 * innecesarios para el programador".
 *
 * EL CRITERIO
 *
 * `developer` es un rol de SOPORTE TÉCNICO: puede diagnosticar, moderar y
 * operar sobre cuentas de prueba. No puede mover dinero ni repartir privilegios.
 * Si el programador necesita mover dinero para resolver una incidencia, la
 * ejecuta el dueño — que es exactamente lo que el cliente pidió.
 *
 * Módulo puro, sin imports de Convex. El prefijo `_` lo mantiene fuera del
 * registro de funciones.
 */

export type Role = 'consumer' | 'business' | 'influencer' | 'admin' | 'developer';

/**
 * Capacidades del sistema.
 *
 * Se nombran por ACCIÓN y no por rol: `canReleaseEscrow` sobrevive a un cambio
 * de roles, `isAdmin` no.
 */
export type Capability =
    // --- Dinero. Sólo el dueño. ---
    | 'release_escrow'
    | 'refund'
    | 'withdraw_funds'
    | 'resolve_reconciliation'
    | 'adjust_ledger'
    // --- Privilegios. Sólo el dueño. ---
    | 'change_role'
    | 'delete_user'
    | 'change_global_settings'
    // --- Soporte técnico. Dueño y programador. ---
    | 'view_admin_panel'
    | 'view_audit_logs'
    | 'view_sessions'
    | 'revoke_session'
    | 'moderate_content'
    | 'ban_user'
    | 'review_kyc'
    | 'resolve_dispute'
    | 'impersonate_test_account';

const OWNER_ONLY: readonly Capability[] = [
    'release_escrow',
    'refund',
    'withdraw_funds',
    'resolve_reconciliation',
    'adjust_ledger',
    'change_role',
    'delete_user',
    'change_global_settings',
];

const SUPPORT: readonly Capability[] = [
    'view_admin_panel',
    'view_audit_logs',
    'view_sessions',
    'revoke_session',
    'moderate_content',
    'ban_user',
    'review_kyc',
    'resolve_dispute',
    'impersonate_test_account',
];

const CAPABILITIES: Record<Role, readonly Capability[]> = {
    admin: [...OWNER_ONLY, ...SUPPORT],
    developer: SUPPORT,
    consumer: [],
    business: [],
    influencer: [],
};

export function can(role: Role | string | undefined, capability: Capability): boolean {
    if (!role) return false;
    const granted = CAPABILITIES[role as Role];
    // Un rol desconocido no tiene permisos: falla cerrado.
    return granted ? granted.includes(capability) : false;
}

/** `true` si la capacidad está reservada al dueño. Útil para explicar el rechazo. */
export function isOwnerOnly(capability: Capability): boolean {
    return OWNER_ONLY.includes(capability);
}

/**
 * Mensaje de rechazo.
 *
 * Distingue "no tenés permiso" de "esto lo hace el dueño": el segundo caso no
 * es un error del programador, es el diseño.
 */
export function denialMessage(capability: Capability): string {
    return isOwnerOnly(capability)
        ? 'Esta operación está reservada al titular de la plataforma.'
        : 'No autorizado.';
}

/**
 * Roles que se pueden asignar desde la API de perfil.
 *
 * `admin` y `developer` quedan FUERA a propósito: promover a alguien no puede
 * ser una operación del formulario de perfil. Antes `admin` estaba en la lista
 * y, combinado con una excepción por dominio de email, cualquier usuario con
 * casilla `@ramgos.com` podía auto-promoverse.
 */
export const SELF_ASSIGNABLE_ROLES: ReadonlySet<string> = new Set([
    'consumer',
    'business',
    'influencer',
]);

/** Roles que sólo puede asignar quien tenga `change_role`. */
export const PRIVILEGED_ROLES: ReadonlySet<string> = new Set(['admin', 'developer']);
