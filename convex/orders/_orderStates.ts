/**
 * Máquina de estados de una orden.
 *
 * POR QUÉ EXISTE
 *
 * Las transiciones estaban escritas como comparaciones sueltas dentro de cada
 * mutation, y no coincidían con el estado en que las órdenes nacen de verdad.
 *
 * Todas las órdenes del checkout se crean en `paid_escrow`
 * (`stripe.internalCreateSubOrder`), pero:
 *
 *   - `markAsShipped` exigía `payment_received` → **ningún vendedor podía
 *     marcar una orden como enviada**. Nunca.
 *   - `markAsDelivered` exigía `in_transit`, que era inalcanzable por lo
 *     anterior.
 *   - `confirmReceipt` sí había sido parchado para aceptar `paid_escrow`,
 *     señal de que alguien arregló un eslabón y no el resto de la cadena.
 *
 * Tener la tabla en un solo lugar es lo que evita que se vuelva a partir: si
 * mañana aparece un estado nuevo, hay un único sitio donde declararlo.
 *
 * Módulo puro, testeable. `orders/` es una carpeta, no un módulo de funciones
 * de Convex; el prefijo `_` lo mantiene fuera del registro igual.
 */

export type OrderStatus =
    | 'pending'
    | 'payment_received'
    | 'paid_escrow'
    | 'awaiting_shipment'
    | 'in_transit'
    | 'delivered'
    | 'completed'
    | 'disputed'
    | 'cancelled';

/**
 * Estados en los que el dinero del comprador ya entró y la orden está viva.
 *
 * `payment_received` y `paid_escrow` son el mismo momento del negocio por dos
 * caminos distintos: el primero lo escribía `orders.createOrder` (hoy sin
 * llamadores) y el segundo es el del webhook de Stripe, que es el que corre.
 */
export const PAID_STATES: readonly OrderStatus[] = ['payment_received', 'paid_escrow'];

/** Terminales: no admiten ninguna transición hacia adelante. */
export const TERMINAL_STATES: readonly OrderStatus[] = ['completed', 'cancelled'];

/** Desde qué estados el vendedor puede marcar el envío. */
export const SHIPPABLE_STATES: readonly OrderStatus[] = [
    'payment_received',
    'paid_escrow',
    'awaiting_shipment',
];

/** Desde qué estados se puede marcar la entrega. */
export const DELIVERABLE_STATES: readonly OrderStatus[] = ['in_transit'];

/**
 * Desde qué estados el comprador puede confirmar recepción y liberar el pago.
 *
 * Incluye los estados pagados para no dejar encerrada a una orden cuyo vendedor
 * nunca marcó el envío: el comprador tiene que poder cerrar igual.
 */
export const RELEASABLE_STATES: readonly OrderStatus[] = [
    'delivered',
    'payment_received',
    'paid_escrow',
    'in_transit',
];

/** Desde qué estados se puede abrir una disputa. */
export const DISPUTABLE_STATES: readonly OrderStatus[] = [
    'payment_received',
    'paid_escrow',
    'in_transit',
    'delivered',
];

export function isPaid(status: OrderStatus | string): boolean {
    return PAID_STATES.includes(status as OrderStatus);
}

export function isTerminal(status: OrderStatus | string): boolean {
    return TERMINAL_STATES.includes(status as OrderStatus);
}

export function canMarkShipped(status: OrderStatus | string): boolean {
    return SHIPPABLE_STATES.includes(status as OrderStatus);
}

export function canMarkDelivered(status: OrderStatus | string): boolean {
    return DELIVERABLE_STATES.includes(status as OrderStatus);
}

export function canConfirmReceipt(status: OrderStatus | string): boolean {
    return RELEASABLE_STATES.includes(status as OrderStatus);
}

export function canOpenDispute(status: OrderStatus | string): boolean {
    return DISPUTABLE_STATES.includes(status as OrderStatus);
}

/** Mensajes de error, para que el vendedor lea siempre lo mismo. */
export const ORDER_STATE_ERRORS = {
    notShippable: 'Esta orden todavía no se puede marcar como enviada.',
    notDeliverable: 'La orden tiene que estar en tránsito para marcarla entregada.',
    notReleasable: 'Esta orden no está en condiciones de liberar el pago.',
    notDisputable: 'Esta orden no admite abrir una disputa.',
} as const;
