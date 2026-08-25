/**
 * Inventario — reserva y descuento de stock.
 *
 * POR QUÉ EXISTE
 *
 * El stock **nunca se descontaba en una compra real**. Había dos
 * implementaciones correctas y ninguna estaba conectada al checkout:
 *
 *   - `listings.purchaseItem` — sin un solo call site.
 *   - `orders.createOrder` — sin un solo call site (su único llamador era
 *     `src/hooks/useCheckout.ts`, que se eliminó por estar muerto).
 *
 * El camino vivo es el webhook de Stripe → `internalProcessMultiVendorCart` →
 * `internalCreateSubOrder`, y ninguna de sus líneas tocaba `listings.stock`.
 * Un producto con stock 1 se podía vender cincuenta veces. Los guards de
 * `convex/cart.ts` nunca disparaban porque el stock jamás bajaba.
 *
 * QUÉ HACER CUANDO NO ALCANZA
 *
 * Hay dos momentos y la respuesta correcta es distinta en cada uno:
 *
 *   - **Antes de cobrar** (`createPaymentIntent`): se rechaza. El comprador
 *     todavía no pagó, así que negarse es lo honesto.
 *   - **Después de cobrar** (`internalCreateSubOrder`): NO se rechaza. El
 *     dinero ya está tomado y tirar acá dejaría un cobro sin orden, que es
 *     bastante peor que una sobreventa. Se descuenta lo que haya, se acota en
 *     0 y se devuelve el faltante para que quede registrado en la orden y
 *     alguien lo resuelva.
 *
 * Módulo puro: recibe cantidades, no `ctx`. El prefijo `_` lo mantiene fuera
 * del registro de funciones de Convex.
 */

export type StockLine = {
    listingId: string;
    title: string;
    quantity: number;
};

export type StockShortfall = {
    listingId: string;
    title: string;
    requested: number;
    available: number;
};

/**
 * ¿Alcanza el stock disponible para la cantidad pedida?
 *
 * `available` en `undefined` o `null` significa "sin control de stock" (los
 * servicios, los eventos y los bonos no llevan inventario) y siempre alcanza.
 */
export function hasEnoughStock(available: number | undefined | null, requested: number): boolean {
    if (available === undefined || available === null) return true;
    return available >= requested;
}

/** Stock resultante tras descontar, nunca por debajo de cero. */
export function decrementStock(available: number, requested: number): number {
    return Math.max(0, available - requested);
}

/**
 * Cuánto falta para cubrir lo pedido. `0` si alcanza.
 *
 * Se usa después de cobrar, para dejar constancia de la sobreventa en la orden
 * en vez de fallar.
 */
export function shortfallFor(available: number | undefined | null, requested: number): number {
    if (available === undefined || available === null) return 0;
    return Math.max(0, requested - available);
}

/** Mensaje único, para que el comprador lea lo mismo venga de donde venga. */
export function outOfStockMessage(shortfalls: StockShortfall[]): string {
    if (shortfalls.length === 0) return '';
    if (shortfalls.length === 1) {
        const only = shortfalls[0];
        return only.available === 0
            ? `"${only.title}" se quedó sin stock.`
            : `"${only.title}": quedan ${only.available} y pediste ${only.requested}.`;
    }
    return `Estos artículos ya no tienen stock suficiente: ${shortfalls
        .map((s) => `"${s.title}"`)
        .join(', ')}.`;
}
