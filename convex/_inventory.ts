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
 *   - **Después de cobrar** (el webhook): NO se rechaza. El dinero ya está
 *     tomado y tirar acá dejaría un cobro sin orden, que es bastante peor que
 *     una sobreventa. Se descuenta lo que haya, se acota en 0 y se devuelve el
 *     faltante para que quede registrado en la orden y alguien lo resuelva.
 *
 * H3 (E-149 STK-01/STK-03) — POR QUÉ NO ALCANZABA CON CHEQUEAR
 *
 * Ese "antes de cobrar" era un chequeo sin escritura, en una transacción
 * distinta de la que descontaba. Cinco compradores simultáneos sobre stock 1
 * leían 1 los cinco, pagaban los cinco, y el webhook descontaba acotado en 0:
 * cinco órdenes pagadas por un artículo (verificado, 5 de 5, en el deployment
 * de audit). El chequeo y el descuento tienen que ocurrir en la MISMA
 * transacción, y esa transacción tiene que correr ANTES del cobro: eso es
 * `planReservation` + `internal.stock.internalReserveStock`.
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

// ===========================================================================
// RESERVA (H3)
// ===========================================================================

/**
 * Plan de una reserva: qué descontar de cada listing, o por qué no se puede.
 *
 * POR QUÉ ES "TODO O NADA"
 *
 * Un checkout es un solo cobro. Reservar 2 de 3 líneas dejaría stock retenido
 * de una compra que igual se va a rechazar, así que si una sola línea no
 * alcanza no se descuenta ninguna. Quien llama ejecuta `decrements` completo
 * dentro de UNA mutation o no ejecuta nada.
 */
export type ReservationLine = {
    listingId: string;
    title: string;
    quantity: number;
    /** `undefined`/`null` = sin control de inventario (bonos, servicios). */
    available: number | undefined | null;
};

export type ReservationPlan =
    | { ok: true; decrements: Array<{ listingId: string; quantity: number; newStock: number }> }
    | { ok: false; shortfalls: StockShortfall[] };

/**
 * Decide la reserva sobre las cantidades LEÍDAS EN ESTA TRANSACCIÓN.
 *
 * Las líneas sin control de inventario no generan descuento (no se reservan):
 * quedan fuera de `decrements` y nunca producen faltante, igual que en
 * `hasEnoughStock`.
 *
 * Varias líneas del mismo listing se acumulan antes de comparar: pedir 1 y 1
 * de un producto con stock 1 no alcanza, aunque cada línea por separado sí.
 */
export function planReservation(lines: ReservationLine[]): ReservationPlan {
    const wanted = new Map<string, { title: string; quantity: number; available: number }>();
    for (const line of lines) {
        if (line.available === undefined || line.available === null) continue;
        const quantity = Math.max(0, Math.floor(line.quantity));
        if (quantity === 0) continue;
        const acc = wanted.get(line.listingId);
        if (acc) acc.quantity += quantity;
        else wanted.set(line.listingId, { title: line.title, quantity, available: line.available });
    }

    const shortfalls: StockShortfall[] = [];
    const decrements: Array<{ listingId: string; quantity: number; newStock: number }> = [];
    for (const [listingId, w] of wanted) {
        if (!hasEnoughStock(w.available, w.quantity)) {
            shortfalls.push({ listingId, title: w.title, requested: w.quantity, available: w.available });
            continue;
        }
        decrements.push({ listingId, quantity: w.quantity, newStock: w.available - w.quantity });
    }

    if (shortfalls.length > 0) return { ok: false, shortfalls };
    return { ok: true, decrements };
}

/**
 * Cuánto queda por descontar en el webhook, dado lo que ya reservó el checkout.
 *
 * Con reserva vigente devuelve 0: el stock ya bajó al crear el PaymentIntent y
 * volver a descontarlo cobraría dos veces el mismo inventario. Sin reserva
 * (pago legacy, mock, o reserva vencida y devuelta por el cron) devuelve todo
 * lo pedido, que es el comportamiento previo a H3.
 */
export function remainingToDecrement(requested: number, reserved: number): number {
    return Math.max(0, Math.floor(requested) - Math.max(0, Math.floor(reserved)));
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
