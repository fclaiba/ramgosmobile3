/**
 * Dónde volver después del onboarding de Stripe.
 *
 * Vive a nivel de módulo y no en estado de React a propósito: el retorno entra
 * por universal link y puede remontar el árbol entero, así que cualquier
 * estado de componente se pierde en el camino. `ConnectReturnScreen` lo
 * consume una sola vez y lo limpia.
 *
 * Sin esto, quien arranca el onboarding desde "Retirar fondos" termina
 * depositado en el dashboard, que es otro callejón sin salida.
 */
export type ConnectReturnTarget = { screen: string; params?: Record<string, unknown> };

let pending: ConnectReturnTarget | null = null;

export const setConnectReturnTarget = (target: ConnectReturnTarget | null): void => {
    pending = target;
};

/** Devuelve el destino guardado y lo limpia. */
export const consumeConnectReturnTarget = (): ConnectReturnTarget | null => {
    const target = pending;
    pending = null;
    return target;
};
