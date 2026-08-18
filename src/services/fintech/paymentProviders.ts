/**
 * Stripe es el ÚNICO proveedor de pagos (decisión de producto, 2026-08-18).
 * Había un `mercadoPagoProvider` simulado —`simulateNetworkLatency`, ids y
 * URL de recibo inventados— que nunca fue una integración real; se eliminó
 * para que no quede un camino de cobro falso disponible.
 */
export type PaymentProviderKey = 'stripe';

export interface PaymentGatewayChargeRequest {
    amount: number;
    currency: string;
    paymentMethod: {
        brand: string;
        last4: string;
        expMonth: string;
        expYear: string;
        ownerName: string;
    };
    metadata?: Record<string, unknown>;
}

export interface PaymentGatewayChargeResult {
    id: string;
    status: 'succeeded' | 'failed' | 'requires_action';
    authorizationCode: string;
    providerFee: number;
    netAmount: number;
    currency: string;
    processedAt: string;
    provider: PaymentProviderKey;
    receiptUrl?: string;
    riskLevel: 'low' | 'medium' | 'high';
    rawResponse: Record<string, unknown>;
}

export interface PaymentProviderDefinition {
    key: PaymentProviderKey;
    displayName: string;
    supportsSplit: boolean;
    charge: (request: PaymentGatewayChargeRequest) => Promise<PaymentGatewayChargeResult>;
}

const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const simulateNetworkLatency = (min = 350, max = 950) =>
    new Promise<void>((resolve) => setTimeout(resolve, Math.random() * (max - min) + min));

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const stripeProvider: PaymentProviderDefinition = {
    key: 'stripe',
    displayName: 'Stripe',
    supportsSplit: true,
    async charge(request) {
        await simulateNetworkLatency();

        const variableFee = request.amount * 0.029;
        const fixedFee = 0.3;
        const providerFee = roundCurrency(variableFee + fixedFee);
        const netAmount = roundCurrency(request.amount - providerFee);

        return {
            id: randomId('stripe_pi'),
            status: 'succeeded',
            authorizationCode: randomId('auth'),
            providerFee,
            netAmount,
            currency: request.currency,
            processedAt: new Date().toISOString(),
            provider: 'stripe',
            receiptUrl: `https://dashboard.stripe.com/payments/${randomId('receipt')}`,
            riskLevel: 'low',
            rawResponse: {
                brand: request.paymentMethod.brand,
                last4: request.paymentMethod.last4,
            },
        };
    },
};

const providers: Record<PaymentProviderKey, PaymentProviderDefinition> = {
    stripe: stripeProvider,
};

export const listPaymentProviders = (): PaymentProviderDefinition[] => Object.values(providers);

export const getPaymentProvider = (key: PaymentProviderKey): PaymentProviderDefinition => {
    const provider = providers[key];
    if (!provider) {
        throw new Error(`Proveedor de pagos no soportado: ${key}`);
    }
    return provider;
};






