/**
 * Quién puede operar en modo test — módulo puro, testeable.
 *
 * POR QUÉ EXISTE
 *
 * El modo (`test` | `live`) llega como argumento del cliente, así que la UI no
 * es una defensa: un cliente modificado —o simplemente viejo— puede pedir
 * `test`. Y cobrar en test no es inofensivo: el webhook de test procesa el
 * checkout igual, crea la orden, descuenta stock, otorga puntos y deja al
 * vendedor con un payout respaldado por dinero que nunca entró.
 *
 * Por eso la decisión vive acá, en un solo lugar, y la consumen los dos puntos
 * que importan: `getPublicConfig` (qué modos se le OFRECEN al cliente) y
 * `createPaymentIntent` (qué modo se le ACEPTA al cobrar).
 *
 * EL DETALLE QUE HACE QUE ESTO FUNCIONE SIN ACTUALIZAR LA APP
 *
 * El cliente publicado calcula sus modos disponibles como
 * `['test','live'].filter(m => tieneClave(m) && backend.modes[m])`, y si el
 * modo guardado no está disponible cae al primero que sí lo esté. Entonces,
 * al reportarle `{test: false, live: true}`, ese binario **elige `live` por su
 * cuenta** — sin release, y mostrando "live" en la UI, así que tampoco se le
 * miente a quien está poniendo la tarjeta.
 */

export type TestModeActor = { role?: string | null; isTest?: boolean } | null | undefined;

export const TEST_MODE_DENIED_MESSAGE =
    "No se pudo procesar el pago en modo prueba. Cerrá y volvé a abrir la app, y reintentá.";

/** Modo test: sólo para administración y cuentas marcadas como de prueba. */
export function canUseTestMode(actor: TestModeActor): boolean {
    if (!actor) return false;
    return actor.role === "admin" || actor.role === "developer" || actor.isTest === true;
}

/**
 * Modos que se le ofrecen al cliente.
 *
 * `live` depende sólo de que haya clave configurada — es el modo por defecto de
 * cualquiera. `test` además exige que quien pregunta tenga permiso: un actor no
 * puede inventar una clave que no está configurada, pero sí puede perder el
 * acceso a una que sí lo está.
 */
export function publicStripeModes(
    keys: { test?: string; live?: string },
    actor: TestModeActor,
): { test: boolean; live: boolean } {
    return {
        test: !!keys.test && canUseTestMode(actor),
        live: !!keys.live,
    };
}
