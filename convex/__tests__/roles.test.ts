/**
 * Matriz de permisos.
 *
 * El caso que motivó este módulo: `developer` era equivalente a `admin` en 45
 * de 47 chequeos, incluidas las dos acciones que mueven dinero real. Estos
 * tests fijan la separación que pidió el cliente — "control maestro del dueño,
 * sin accesos administrativos innecesarios para el programador".
 */
import {
    can,
    denialMessage,
    isOwnerOnly,
    PRIVILEGED_ROLES,
    SELF_ASSIGNABLE_ROLES,
    type Capability,
    type Role,
} from '../_roles';

const MONEY: Capability[] = [
    'release_escrow',
    'refund',
    'withdraw_funds',
    'resolve_reconciliation',
    'adjust_ledger',
];

const PRIVILEGE: Capability[] = ['change_role', 'delete_user', 'change_global_settings'];

const SUPPORT: Capability[] = [
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

describe('el dueño puede todo', () => {
    it('admin tiene las capacidades de dinero', () => {
        for (const capability of MONEY) {
            expect(can('admin', capability)).toBe(true);
        }
    });

    it('admin tiene las de privilegios y las de soporte', () => {
        for (const capability of [...PRIVILEGE, ...SUPPORT]) {
            expect(can('admin', capability)).toBe(true);
        }
    });
});

describe('el programador NO puede mover dinero', () => {
    it('developer no libera escrow ni reembolsa', () => {
        // Éste es EL punto: ambas eran accesibles a `developer`.
        expect(can('developer', 'release_escrow')).toBe(false);
        expect(can('developer', 'refund')).toBe(false);
    });

    it('developer no toca ninguna capacidad de dinero', () => {
        for (const capability of MONEY) {
            expect(can('developer', capability)).toBe(false);
        }
    });

    it('developer no reparte privilegios', () => {
        for (const capability of PRIVILEGE) {
            expect(can('developer', capability)).toBe(false);
        }
    });

    it('pero conserva todo lo técnico, para poder diagnosticar', () => {
        for (const capability of SUPPORT) {
            expect(can('developer', capability)).toBe(true);
        }
    });
});

describe('los roles de usuario no tienen nada', () => {
    it('consumer, business e influencer no acceden a ninguna capacidad', () => {
        for (const role of ['consumer', 'business', 'influencer'] as Role[]) {
            for (const capability of [...MONEY, ...PRIVILEGE, ...SUPPORT]) {
                expect(can(role, capability)).toBe(false);
            }
        }
    });
});

describe('falla cerrado', () => {
    it('un rol desconocido no habilita nada', () => {
        for (const capability of [...MONEY, ...PRIVILEGE, ...SUPPORT]) {
            expect(can('superadmin', capability)).toBe(false);
            expect(can('', capability)).toBe(false);
            expect(can(undefined, capability)).toBe(false);
        }
    });
});

describe('asignación de roles', () => {
    it('admin y developer NO son auto-asignables', () => {
        // Con `admin` en la lista, más una excepción por dominio de email,
        // cualquiera con casilla @ramgos.com se promovía solo.
        expect(SELF_ASSIGNABLE_ROLES.has('admin')).toBe(false);
        expect(SELF_ASSIGNABLE_ROLES.has('developer')).toBe(false);
    });

    it('los roles de uso normal sí lo son', () => {
        for (const role of ['consumer', 'business', 'influencer']) {
            expect(SELF_ASSIGNABLE_ROLES.has(role)).toBe(true);
        }
    });

    it('ningún rol es a la vez auto-asignable y privilegiado', () => {
        for (const role of SELF_ASSIGNABLE_ROLES) {
            expect(PRIVILEGED_ROLES.has(role)).toBe(false);
        }
    });
});

describe('mensajes de rechazo', () => {
    it('las operaciones de dinero se explican como reservadas al titular', () => {
        for (const capability of MONEY) {
            expect(isOwnerOnly(capability)).toBe(true);
            expect(denialMessage(capability)).toContain('titular');
        }
    });

    it('el resto usa el mensaje genérico', () => {
        expect(denialMessage('moderate_content')).toBe('No autorizado.');
    });
});
