/**
 * Aritmética del split de pagos — módulo puro, en centavos enteros.
 *
 * POR QUÉ EXISTE
 *
 * El split se calculaba en tres lugares con reglas distintas (comisión al
 * carrito entero, 30% a todo si había un bono, prorrateo con Math.round que
 * no sumaba el total, fee de Stripe estimada y nunca corregida). Este módulo
 * es la única fuente: recibe líneas ya validadas contra la base y devuelve
 * el reparto por vendedor con la invariante
 *
 *     Σ(sellerNet + commission + influencer + fee) === total cobrado
 *
 * que es lo que después permite que `Σ transfers + comisión === charge`.
 */
import { BONO_COMMISSION_RATE, PLATFORM_COMMISSION_RATE } from "./_fees";

export interface SplitLineInput {
    listingId: string;
    sellerId: string;
    /** product | bono | service | event | rental | ... */
    type: string;
    unitCents: number;
    quantity: number;
    title?: string;
    image?: string;
    sourcePostId?: string;
    referralCode?: string;
    influencerId?: string;
    /** 0..1 — ya resuelto contra campañas/whitelists. */
    influencerRate?: number;
}

export interface SplitLine extends SplitLineInput {
    grossCents: number;
    commissionRate: number;
    commissionCents: number;
    influencerRate: number;
    influencerCents: number;
}

export interface SellerSplit {
    sellerId: string;
    grossCents: number; // subtotal del vendedor + shipping asignado
    shippingCents: number;
    commissionCents: number;
    influencerId?: string;
    influencerCents: number;
    feeCents: number;
    sellerNetCents: number;
}

export interface CheckoutSplit {
    lineItems: SplitLine[];
    sellers: SellerSplit[];
    shippingCents: number;
    /** Total COBRADO (ya con descuento de puntos aplicado). */
    totalCents: number;
    feeCents: number;
    /** Descuento por puntos, absorbido por la comisión de la plataforma. */
    discountCents?: number;
    pointsRedeemed?: number;
}

/** El descuento por puntos no puede superar la comisión de la plataforma. */
export class DiscountExceedsCommissionError extends Error {
    constructor(public readonly maxDiscountCents: number) {
        super(`El descuento supera la comisión de la plataforma (máximo ${maxDiscountCents}¢).`);
        this.name = "DiscountExceedsCommissionError";
    }
}

/** Comisión de la plataforma por TIPO de línea (no por carrito). */
export function commissionRateForType(type: string): number {
    return String(type || "").toLowerCase() === "bono"
        ? BONO_COMMISSION_RATE
        : PLATFORM_COMMISSION_RATE;
}

/**
 * Reparte `totalCents` entre pesos, en enteros, con el método del mayor
 * resto: la suma SIEMPRE es exactamente `totalCents`. Pesos todos cero →
 * todo al primero.
 */
export function prorateLargestRemainder(totalCents: number, weights: number[]): number[] {
    const n = weights.length;
    if (n === 0) return [];
    const total = Math.round(totalCents);
    const weightSum = weights.reduce((a, b) => a + Math.max(0, b), 0);
    if (weightSum <= 0) {
        const out = new Array(n).fill(0);
        out[0] = total;
        return out;
    }
    const raw = weights.map((w) => (total * Math.max(0, w)) / weightSum);
    const floors = raw.map((x) => Math.floor(x));
    let remainder = total - floors.reduce((a, b) => a + b, 0);
    const order = raw
        .map((x, i) => ({ i, frac: x - Math.floor(x) }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let k = 0; k < order.length && remainder > 0; k++) {
        floors[order[k].i] += 1;
        remainder -= 1;
    }
    return floors;
}

const round = (x: number) => Math.round(x);

/**
 * Split completo de un checkout.
 *
 * - Comisión e influencer se calculan POR LÍNEA sobre el bruto de la línea.
 * - El envío se asigna al primer vendedor (orden estable de aparición); es
 *   un cargo del carrito que no paga comisión ni influencer.
 * - La fee de Stripe se prorratea por bruto de vendedor (mayor resto).
 * - `sellerNetCents` nunca puede ser negativo: si lo fuera se lanza, porque
 *   significaría cobrar menos que las deducciones.
 */
export function computeCheckoutSplit(input: {
    lines: SplitLineInput[];
    shippingCents: number;
    feeCents: number;
    /** Descuento por puntos (centavos). Se descuenta de la comisión, nunca del vendedor. */
    discountCents?: number;
    pointsRedeemed?: number;
}): CheckoutSplit {
    if (input.lines.length === 0) throw new Error("Checkout sin líneas.");
    const shippingCents = Math.max(0, round(input.shippingCents || 0));

    const lineItems: SplitLine[] = input.lines.map((l) => {
        const quantity = Math.max(1, Math.floor(l.quantity));
        const unitCents = Math.max(0, round(l.unitCents));
        const grossCents = unitCents * quantity;
        const commissionRate = commissionRateForType(l.type);
        const influencerRate = l.influencerId ? Math.max(0, l.influencerRate ?? 0) : 0;
        return {
            ...l,
            quantity,
            unitCents,
            grossCents,
            commissionRate,
            commissionCents: round(grossCents * commissionRate),
            influencerRate,
            influencerCents: round(grossCents * influencerRate),
        };
    });

    const sellerOrder: string[] = [];
    const bySeller = new Map<string, SellerSplit>();
    for (const line of lineItems) {
        let s = bySeller.get(line.sellerId);
        if (!s) {
            s = {
                sellerId: line.sellerId,
                grossCents: 0,
                shippingCents: 0,
                commissionCents: 0,
                influencerCents: 0,
                feeCents: 0,
                sellerNetCents: 0,
            };
            bySeller.set(line.sellerId, s);
            sellerOrder.push(line.sellerId);
        }
        s.grossCents += line.grossCents;
        s.commissionCents += line.commissionCents;
        s.influencerCents += line.influencerCents;
        if (line.influencerCents > 0 && line.influencerId) {
            s.influencerId = s.influencerId ?? line.influencerId;
        }
    }

    const sellers = sellerOrder.map((id) => bySeller.get(id)!);
    if (shippingCents > 0) {
        sellers[0].shippingCents = shippingCents;
        sellers[0].grossCents += shippingCents;
    }

    // Descuento por puntos: lo absorbe la plataforma. Se reparte entre los
    // vendedores en proporción a su comisión y baja tanto `grossCents`
    // (lo cobrado por esa orden) como `commissionCents`. El neto del
    // vendedor no cambia, así Σ transfers ≤ charge sigue valiendo.
    const discountCents = Math.max(0, round(input.discountCents || 0));
    if (discountCents > 0) {
        const commissionTotal = sellers.reduce((a, s) => a + s.commissionCents, 0);
        if (discountCents > commissionTotal) throw new DiscountExceedsCommissionError(commissionTotal);
        const shares = prorateLargestRemainder(discountCents, sellers.map((s) => s.commissionCents));
        sellers.forEach((s, i) => {
            s.commissionCents -= shares[i];
            s.grossCents -= shares[i];
        });
    }

    const totalCents = sellers.reduce((a, s) => a + s.grossCents, 0);
    const feeCents = Math.max(0, round(input.feeCents || 0));
    const feeShares = prorateLargestRemainder(feeCents, sellers.map((s) => s.grossCents));
    sellers.forEach((s, i) => {
        s.feeCents = feeShares[i];
        s.sellerNetCents = s.grossCents - s.commissionCents - s.influencerCents - s.feeCents;
        if (s.sellerNetCents < 0) {
            throw new Error(
                `El neto del vendedor ${s.sellerId} sería negativo (${s.sellerNetCents}¢). Revisá comisiones.`,
            );
        }
    });

    return {
        lineItems,
        sellers,
        shippingCents,
        totalCents,
        feeCents,
        ...(discountCents > 0 ? { discountCents, pointsRedeemed: input.pointsRedeemed ?? 0 } : {}),
    };
}

/** Recalcula el prorrateo de la fee con la fee REAL que informó Stripe. */
export function reapplyActualFee(split: CheckoutSplit, actualFeeCents: number): CheckoutSplit {
    const feeCents = Math.max(0, round(actualFeeCents));
    const shares = prorateLargestRemainder(feeCents, split.sellers.map((s) => s.grossCents));
    const sellers = split.sellers.map((s, i) => {
        const sellerNetCents = s.grossCents - s.commissionCents - s.influencerCents - shares[i];
        if (sellerNetCents < 0) {
            throw new Error(`Fee real deja neto negativo para ${s.sellerId}.`);
        }
        return { ...s, feeCents: shares[i], sellerNetCents };
    });
    return { ...split, sellers, feeCents };
}

/**
 * Cuánto revertir de cada transfer ante un reembolso de `refundCents`.
 *
 * Proporcional al bruto de la orden, con tope en lo que queda sin revertir.
 * Se usa floor para que la plataforma nunca revierta de más.
 */
export function reversalAmountsFor(
    refundCents: number,
    order: {
        grossCents: number;
        sellerNetCents: number;
        influencerCents: number;
        sellerReversedCents?: number;
        influencerReversedCents?: number;
    },
): { seller: number; influencer: number } {
    const gross = Math.max(1, order.grossCents);
    const ratio = Math.min(1, Math.max(0, refundCents / gross));
    const seller = Math.min(
        Math.max(0, order.sellerNetCents - (order.sellerReversedCents ?? 0)),
        Math.floor(order.sellerNetCents * ratio),
    );
    const influencer = Math.min(
        Math.max(0, order.influencerCents - (order.influencerReversedCents ?? 0)),
        Math.floor(order.influencerCents * ratio),
    );
    return { seller, influencer };
}

/**
 * Reparte un reembolso hecho DESDE Stripe (dashboard) entre las órdenes del
 * PaymentIntent, por bruto restante, con mayor resto y tope por orden.
 */
export function allocateExternalRefund(
    deltaCents: number,
    orders: Array<{ id: string; grossCents: number; refundedCents?: number }>,
): Record<string, number> {
    const remaining = orders.map((o) => Math.max(0, o.grossCents - (o.refundedCents ?? 0)));
    const capTotal = remaining.reduce((a, b) => a + b, 0);
    const toAllocate = Math.min(Math.max(0, round(deltaCents)), capTotal);
    const shares = prorateLargestRemainder(toAllocate, remaining);
    const out: Record<string, number> = {};
    // Ajuste por topes: si un share supera lo restante, el exceso pasa al siguiente.
    let carry = 0;
    orders.forEach((o, i) => {
        let amt = shares[i] + carry;
        carry = 0;
        if (amt > remaining[i]) {
            carry = amt - remaining[i];
            amt = remaining[i];
        }
        out[o.id] = amt;
    });
    if (carry > 0) {
        for (let i = 0; i < orders.length && carry > 0; i++) {
            const room = remaining[i] - out[orders[i].id];
            const add = Math.min(room, carry);
            out[orders[i].id] += add;
            carry -= add;
        }
    }
    return out;
}
