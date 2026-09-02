import {
    allocateExternalRefund,
    commissionRateForType,
    computeCheckoutSplit,
    DiscountExceedsCommissionError,
    prorateLargestRemainder,
    reapplyActualFee,
    reversalAmountsFor,
} from "../_split";
import { BONO_COMMISSION_RATE, PLATFORM_COMMISSION_RATE } from "../_fees";

describe("prorateLargestRemainder", () => {
    it("suma exactamente el total", () => {
        const out = prorateLargestRemainder(100, [1, 1, 1]);
        expect(out.reduce((a, b) => a + b, 0)).toBe(100);
        expect(out).toEqual([34, 33, 33]);
    });
    it("pesos en cero → todo al primero", () => {
        expect(prorateLargestRemainder(7, [0, 0])).toEqual([7, 0]);
    });
    it("total de 1 centavo", () => {
        expect(prorateLargestRemainder(1, [50, 50])).toEqual([1, 0]);
    });
    it("lista vacía", () => {
        expect(prorateLargestRemainder(10, [])).toEqual([]);
    });
});

describe("commissionRateForType", () => {
    it("bono 30%, resto 10%", () => {
        expect(commissionRateForType("bono")).toBe(BONO_COMMISSION_RATE);
        expect(commissionRateForType("product")).toBe(PLATFORM_COMMISSION_RATE);
        expect(commissionRateForType("service")).toBe(PLATFORM_COMMISSION_RATE);
    });
});

describe("computeCheckoutSplit", () => {
    const lines = [
        { listingId: "a", sellerId: "s1", type: "product", unitCents: 10000, quantity: 1 },
        { listingId: "b", sellerId: "s1", type: "bono", unitCents: 500, quantity: 2 },
        { listingId: "c", sellerId: "s2", type: "product", unitCents: 2599, quantity: 3, influencerId: "inf", influencerRate: 0.05 },
    ];

    it("comisión por línea (bono sólo sobre el bono) y Σ invariante", () => {
        const split = computeCheckoutSplit({ lines, shippingCents: 799, feeCents: 320 });
        expect(split.totalCents).toBe(10000 + 1000 + 7797 + 799);
        const s1 = split.sellers.find((s) => s.sellerId === "s1")!;
        const s2 = split.sellers.find((s) => s.sellerId === "s2")!;
        expect(s1.commissionCents).toBe(1000 + 300); // 10% de 100 + 30% de 10
        expect(s1.shippingCents).toBe(799); // envío al primer vendedor
        expect(s2.influencerCents).toBe(Math.round(7797 * 0.05));
        expect(s2.influencerId).toBe("inf");
        const sum = split.sellers.reduce(
            (a, s) => a + s.sellerNetCents + s.commissionCents + s.influencerCents + s.feeCents,
            0,
        );
        expect(sum).toBe(split.totalCents);
        expect(split.sellers.reduce((a, s) => a + s.feeCents, 0)).toBe(320);
        for (const s of split.sellers) expect(s.sellerNetCents).toBeGreaterThanOrEqual(0);
    });

    it("descuento por puntos lo absorbe la comisión, no el vendedor", () => {
        const base = computeCheckoutSplit({ lines, shippingCents: 0, feeCents: 0 });
        const withDiscount = computeCheckoutSplit({ lines, shippingCents: 0, feeCents: 0, discountCents: 500, pointsRedeemed: 5000 });
        expect(withDiscount.totalCents).toBe(base.totalCents - 500);
        expect(withDiscount.discountCents).toBe(500);
        expect(withDiscount.pointsRedeemed).toBe(5000);
        const netBase = base.sellers.map((s) => s.sellerNetCents);
        const netDisc = withDiscount.sellers.map((s) => s.sellerNetCents);
        expect(netDisc).toEqual(netBase);
        const commBase = base.sellers.reduce((a, s) => a + s.commissionCents, 0);
        const commDisc = withDiscount.sellers.reduce((a, s) => a + s.commissionCents, 0);
        expect(commBase - commDisc).toBe(500);
    });

    it("descuento mayor a la comisión → error con el máximo", () => {
        expect(() => computeCheckoutSplit({ lines, shippingCents: 0, feeCents: 0, discountCents: 999999 })).toThrow(
            DiscountExceedsCommissionError,
        );
    });

    it("sin líneas → error", () => {
        expect(() => computeCheckoutSplit({ lines: [], shippingCents: 0, feeCents: 0 })).toThrow();
    });
});

describe("reapplyActualFee", () => {
    it("reprorratea la fee real y mantiene la invariante", () => {
        const split = computeCheckoutSplit({
            lines: [
                { listingId: "a", sellerId: "s1", type: "product", unitCents: 5000, quantity: 1 },
                { listingId: "b", sellerId: "s2", type: "product", unitCents: 5000, quantity: 1 },
            ],
            shippingCents: 0,
            feeCents: 320,
        });
        const real = reapplyActualFee(split, 333);
        expect(real.feeCents).toBe(333);
        expect(real.sellers.reduce((a, s) => a + s.feeCents, 0)).toBe(333);
        const sum = real.sellers.reduce((a, s) => a + s.sellerNetCents + s.commissionCents + s.influencerCents + s.feeCents, 0);
        expect(sum).toBe(real.totalCents);
    });
});

describe("reversalAmountsFor", () => {
    const order = { grossCents: 10000, sellerNetCents: 8600, influencerCents: 500 };
    it("reembolso total → reversión total", () => {
        expect(reversalAmountsFor(10000, order)).toEqual({ seller: 8600, influencer: 500 });
    });
    it("reembolso parcial → proporcional (floor)", () => {
        expect(reversalAmountsFor(2500, order)).toEqual({ seller: 2150, influencer: 125 });
    });
    it("tope en lo que queda sin revertir", () => {
        expect(reversalAmountsFor(10000, { ...order, sellerReversedCents: 8000, influencerReversedCents: 500 })).toEqual({
            seller: 600,
            influencer: 0,
        });
    });
});

describe("allocateExternalRefund", () => {
    it("reparte por bruto restante y respeta topes", () => {
        const out = allocateExternalRefund(1500, [
            { id: "o1", grossCents: 1000, refundedCents: 0 },
            { id: "o2", grossCents: 2000, refundedCents: 0 },
        ]);
        expect(out.o1 + out.o2).toBe(1500);
        expect(out.o1).toBeLessThanOrEqual(1000);
    });
    it("no reembolsa más de lo restante", () => {
        const out = allocateExternalRefund(5000, [{ id: "o1", grossCents: 1000, refundedCents: 400 }]);
        expect(out.o1).toBe(600);
    });
});
