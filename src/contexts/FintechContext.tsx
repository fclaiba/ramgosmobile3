import React, { createContext, useContext } from 'react';

export type PaymentRecord = {
    _id: string;
    orderId: string;
    amount: number;
    status: string;
    split: {
        influencerId?: string;
        sellerId?: string;
        influencerAmount?: number;
        sellerAmount?: number;
    };
    createdAt: string;
};

export type WalletAccount = {
    ownerId: string;
    balances: {
        available: number;
        pending: number;
        reserved: number;
    };
    transactions?: Array<{
        id: string;
        type: 'deposit' | 'withdrawal' | 'payment' | 'payout' | 'escrow';
        amount: number;
        description?: string;
        status: 'pending' | 'completed' | 'failed';
        createdAt: string;
    }>;
};

export type KycPayload = {
    ownerId: string;
    ownerType: 'business' | 'influencer' | 'personal';
    ownerName: string;
    data: {
        documentFront: string;
        documentBack: string;
        selfieValidated?: boolean;
        ein?: string;
        incorporationDoc?: string;
        businessAddress?: string;
        premisesPhoto?: string;
        socialLink?: string;
    };
};

const FintechContext = createContext<any>(null);

export function FintechProvider({ children }: { children: React.ReactNode }) {
    return <FintechContext.Provider value={{}}>{children}</FintechContext.Provider>;
}

export function useFintech() {
    return {
        cards: [],
        transactions: [],
        balance: 0,
        payments: [] as PaymentRecord[],
        ensureWalletAccount: (_userId: string, _type: string, _displayName: string) => {},
        getWalletByOwner: (_ownerId: string): WalletAccount | null => ({
            ownerId: _ownerId,
            balances: { available: 0, pending: 0, reserved: 0 },
        }),
        getKycStatus: (_ownerId: string): string | null => null,
        requestWithdrawal: (_ownerId: string, _amount: number) => {},
        submitKyc: (_payload: KycPayload) => {},
        refreshKyc: async () => {},
        deposit: () => {},
        withdraw: () => {},
    };
}
