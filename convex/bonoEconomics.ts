/**
 * Bono = prepaid credit economy (NOT % discount / 2x1).
 * Buyer pays `price`, receives `discountValue` credit at the issuing business.
 * Example: pay $50 → spend $100.
 */

export const DEFAULT_BONO_PAID = 50;
export const DEFAULT_BONO_CREDIT = 100;
export const DEFAULT_BONO_VALIDITY_DAYS = 4;

export type BonoEconomicsInput = {
    price: number;
    discountValue?: number | null;
    discountPercent?: number | null;
};

export type BonoEconomics = {
    paidAmount: number;
    creditTotal: number;
    creditRemaining: number;
    usesTotal: number;
    usesRemaining: number;
};

/**
 * Throws if the listing is not a valid prepaid-credit bono.
 * Rejects % coupons and price/credit that do not satisfy credit > paid > 0.
 */
export function assertBonoEconomics(input: BonoEconomicsInput): void {
    if (input.discountPercent != null && Number(input.discountPercent) > 0) {
        throw new Error(
            "Los bonos no usan descuento porcentual. Usá precio de compra y crédito canjeable (ej. pagás 50, crédito 100).",
        );
    }
    const paid = Number(input.price);
    const credit = Number(input.discountValue);
    if (!Number.isFinite(paid) || paid <= 0) {
        throw new Error("El bono debe tener un precio de compra mayor a 0.");
    }
    if (!Number.isFinite(credit) || credit <= 0) {
        throw new Error("El bono debe tener un crédito canjeable (discountValue) mayor a 0.");
    }
    if (credit <= paid) {
        throw new Error(
            "El crédito del bono debe ser mayor al precio pagado (ej. pagás 50 y tenés 100 de crédito).",
        );
    }
}

/** Resolve economics from a listing doc (after assert, or for legacy rows). */
export function resolveBonoEconomics(listing: any): BonoEconomics {
    const paidRaw = Number(listing?.price);
    const creditRaw = Number(listing?.discountValue);
    const paidAmount =
        Number.isFinite(paidRaw) && paidRaw > 0 ? paidRaw : DEFAULT_BONO_PAID;
    let creditTotal =
        Number.isFinite(creditRaw) && creditRaw > 0 ? creditRaw : paidAmount * 2;
    if (creditTotal <= paidAmount) creditTotal = DEFAULT_BONO_CREDIT;
    return {
        paidAmount,
        creditTotal,
        creditRemaining: creditTotal,
        usesTotal: 1,
        usesRemaining: 1,
    };
}
