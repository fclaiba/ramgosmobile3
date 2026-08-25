/**
 * Reglas de KYC.
 *
 * Estas funciones deciden quién puede retirar dinero. La versión anterior tenía
 * la lógica copiada en cuatro lugares con criterios distintos, y los dos gates
 * que de verdad bloquean leían el estado crudo mientras la UI mostraba el
 * efectivo: el usuario veía "verificado" y el retiro le fallaba.
 */
import {
    canCreateBusinessForms,
    canIssueBono,
    canWithdrawFunds,
    resolveKycStatus,
} from '../_kyc';

describe('resolveKycStatus', () => {
    it('sin estado y con KYC desactivado, se considera aprobado', () => {
        // Es el default histórico: `require_kyc` viene apagado.
        expect(resolveKycStatus(undefined, false)).toBe('approved');
        expect(resolveKycStatus(null, false)).toBe('approved');
        expect(resolveKycStatus('', false)).toBe('approved');
    });

    it('sin estado y con KYC activado, queda pendiente', () => {
        expect(resolveKycStatus(undefined, true)).toBe('pending');
    });

    it('un estado existente gana sobre el toggle', () => {
        // Apagar el KYC global no puede borrar un rechazo previo.
        expect(resolveKycStatus('rejected', false)).toBe('rejected');
        expect(resolveKycStatus('pending', false)).toBe('pending');
        expect(resolveKycStatus('skipped', false)).toBe('skipped');
    });

    it('traduce los estados legados a aprobado', () => {
        // `verified` lo migra `fixKyc.ts`; `completed` no lo migra nadie, así
        // que hay que reconocerlo en la lectura o esos usuarios quedan afuera.
        expect(resolveKycStatus('verified', true)).toBe('approved');
        expect(resolveKycStatus('completed', true)).toBe('approved');
    });

    it('un valor desconocido cae en pendiente, no en aprobado', () => {
        // Fallar cerrado: un estado que no entendemos no habilita nada.
        expect(resolveKycStatus('lo-que-sea', false)).toBe('pending');
        expect(resolveKycStatus('APPROVED', false)).toBe('pending');
    });
});

describe('permisos', () => {
    it('sólo aprobado puede retirar fondos', () => {
        expect(canWithdrawFunds('approved')).toBe(true);
        for (const status of ['pending', 'rejected', 'skipped'] as const) {
            expect(canWithdrawFunds(status)).toBe(false);
        }
    });

    it('omitir el KYC no habilita retirar', () => {
        // Era el riesgo de unificar hacia el criterio más permisivo de
        // `listings`, que sí acepta `skipped`.
        expect(canWithdrawFunds('skipped')).toBe(false);
    });

    it('los formularios de negocio usan el mismo criterio que retirar', () => {
        for (const status of ['approved', 'pending', 'rejected', 'skipped'] as const) {
            expect(canCreateBusinessForms(status)).toBe(canWithdrawFunds(status));
        }
    });

    it('emitir bonos acepta aprobado y omitido, nunca rechazado ni pendiente', () => {
        expect(canIssueBono('approved')).toBe(true);
        expect(canIssueBono('skipped')).toBe(true);
        expect(canIssueBono('pending')).toBe(false);
        expect(canIssueBono('rejected')).toBe(false);
    });
});

describe('el rechazado nunca pasa, mire quien lo mire', () => {
    it('ningún permiso se le concede a un rechazado', () => {
        const rejected = resolveKycStatus('rejected', false);
        expect(canWithdrawFunds(rejected)).toBe(false);
        expect(canCreateBusinessForms(rejected)).toBe(false);
        expect(canIssueBono(rejected)).toBe(false);
    });
});
