/**
 * Qué modo de Stripe usa la app — módulo puro, testeable sin montar React.
 *
 * POR QUÉ IMPORTA TANTO
 *
 * Antes el default era `'test'` y ganaba sobre `live` cuando los dos estaban
 * configurados. En producción eso significa que un cliente real paga contra
 * la cuenta de PRUEBA, y el daño no es "no cobramos": el webhook de test
 * procesa el checkout igual y crea la orden de verdad — descuenta stock,
 * otorga puntos, dispara referidos y deja al vendedor con un payout pendiente
 * respaldado por dinero que nunca entró.
 *
 * Por eso el default pasa a ser `live` siempre que esté disponible. Bajar a
 * `test` tiene que ser una elección explícita, y además el servidor la
 * autoriza aparte (`createPaymentIntent` rechaza `test` para cuentas que no
 * son admin ni de prueba): el toggle de la UI no es una defensa.
 */

export type PaymentMode = 'test' | 'live';

/** Preferencia leída del dispositivo. `'none'` = leída, pero vacía. */
export type StoredMode = PaymentMode | 'none' | null;

/**
 * Modo efectivo.
 *
 * 1. La preferencia guardada, si sigue disponible.
 * 2. Si no, `live` cuando está configurado.
 * 3. Si no, lo que haya.
 */
export function resolveEffectiveMode(
    storedMode: StoredMode,
    availableModes: readonly PaymentMode[],
): PaymentMode {
    const preferred: PaymentMode = availableModes.includes('live') ? 'live' : 'test';
    if (storedMode && storedMode !== 'none' && availableModes.includes(storedMode)) {
        return storedMode;
    }
    return availableModes.includes(preferred) ? preferred : (availableModes[0] ?? preferred);
}
