/**
 * Comisión de la plataforma — fuente única.
 *
 * POR QUÉ EXISTE
 *
 * La tasa vivía repetida y desincronizada en tres sitios activos:
 *
 *   - `stripe.ts` (`createPaymentIntent`) — ya estaba en 10%.
 *   - `stripe.ts` (`internalProcessMultiVendorCart`) — seguía en 12%.
 *   - `commerce.ts` (analytics de venta social) — seguía en 12%.
 *
 * Los términos publicados dicen 10%. Un sitio desalineado no mueve plata mal
 * por sí solo, pero sí le muestra al vendedor o al creador un número que no
 * es el que realmente se cobró.
 *
 * Módulo puro (sin imports de Convex), mismo patrón que `_roles.ts`.
 */

/** Tasa estándar sobre ventas de marketplace (productos, servicios, eventos). */
export const PLATFORM_COMMISSION_RATE = 0.10;

/** Los bonos de negocio tienen una tasa propia, distinta a propósito. */
export const BONO_COMMISSION_RATE = 0.30;

/** Tarifa de Stripe asumida por el vendedor: 2.9% + $0.30 por transacción. */
export const STRIPE_FEE_RATE = 0.029;
export const STRIPE_FEE_FIXED_CENTS = 30;

/** Comisión de la plataforma, en centavos, redondeada. */
export function commissionCentsFor(
    subtotalCents: number,
    rate: number = PLATFORM_COMMISSION_RATE,
): number {
    return Math.round(subtotalCents * rate);
}

/** Tarifa estimada de Stripe, en centavos, para un cobro de este monto. */
export function stripeFeeCentsFor(totalCents: number): number {
    return Math.round(totalCents * STRIPE_FEE_RATE + STRIPE_FEE_FIXED_CENTS);
}
