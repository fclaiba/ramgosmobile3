export interface PaymentSplitInput {
    total: number;
    currency: string;
    sellerId: string;
    sellerName: string;
    commissionRate?: number;
    influencerRate?: number;
    influencerId?: string;
    influencerName?: string;
    minimumCommission?: number;
}

export interface PaymentSplit {
    total: number;
    currency: string;
    sellerId: string;
    sellerName: string;
    sellerGross: number;
    sellerNet: number;
    ramgosCommission: number;
    influencerAmount: number;
    influencerId?: string;
    influencerName?: string;
    commissionRate: number;
    influencerRate: number;
    appliedMinimumCommission: number;
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export function calculatePaymentSplit(input: PaymentSplitInput): PaymentSplit {
    const {
        total,
        currency,
        sellerId,
        sellerName,
        influencerId,
        influencerName,
        commissionRate = 0.12,
        influencerRate = influencerId ? 0.05 : 0,
        minimumCommission = 1.5,
    } = input;

    if (total <= 0) {
        throw new Error('El monto total debe ser mayor a 0');
    }

    const grossCommission = total * commissionRate;
    const appliedMinimumCommission = Math.max(minimumCommission, grossCommission);
    const influencerAmount = influencerRate > 0 ? total * influencerRate : 0;

    const sellerGross = total - appliedMinimumCommission - influencerAmount;
    const normalizedSellerGross = roundCurrency(Math.max(sellerGross, 0));

    return {
        total: roundCurrency(total),
        currency,
        sellerId,
        sellerName,
        sellerGross: normalizedSellerGross,
        sellerNet: normalizedSellerGross, // net adjustments happen after pasarela fees
        ramgosCommission: roundCurrency(appliedMinimumCommission),
        influencerAmount: roundCurrency(influencerAmount),
        influencerId,
        influencerName,
        commissionRate,
        influencerRate,
        appliedMinimumCommission: roundCurrency(appliedMinimumCommission),
    };
}

export function applyGatewayFee(split: PaymentSplit, providerFee: number): PaymentSplit {
    const normalizedFee = Math.max(providerFee, 0);
    const sellerNet = roundCurrency(Math.max(split.sellerGross - normalizedFee, 0));
    return {
        ...split,
        sellerNet,
    };
}
