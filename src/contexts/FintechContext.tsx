// Opción A — wallet, pagos y KYC reales desde convex/finance.ts + convex/users.ts.
import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useAuth } from './AuthContext';

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
        type: string;
        amount: number;
        description?: string;
        status: string;
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

type FintechContextValue = {
    cards: unknown[];
    transactions: WalletAccount['transactions'];
    balance: number;
    payments: PaymentRecord[];
    ensureWalletAccount: (userId: string, type: string, displayName: string) => void;
    getWalletByOwner: (ownerId: string) => WalletAccount | null;
    getKycStatus: (ownerId: string) => string | null;
    requestWithdrawal: (ownerId: string, amount: number) => void;
    submitKyc: (payload: KycPayload) => Promise<void>;
    refreshKyc: () => Promise<void>;
    deposit: () => void;
    withdraw: () => void;
};

const FintechContext = createContext<FintechContextValue | null>(null);

function useFintechState(): FintechContextValue {
    const { user, sessionToken } = useAuth();
    const userId = user?.id;

    const walletAccount = useQuery(
        api.finance.getWalletAccount,
        userId && sessionToken ? { sessionToken, userId } : 'skip',
    );

    const rawPayments = useQuery(
        api.finance.getPaymentsByUser,
        userId && sessionToken ? { sessionToken, userId } : 'skip',
    );

    const ensureWalletMutation = useMutation(api.finance.ensureWalletAccount);
    const submitKycMutation = useMutation(api.users.submitKyc);

    const payments = useMemo<PaymentRecord[]>(() => {
        if (!Array.isArray(rawPayments)) return [];
        return rawPayments.map((p: any) => ({
            _id: String(p._id),
            orderId: p.orderId ?? '',
            amount: p.amount ?? 0,
            status: p.status ?? 'pending',
            split: {
                influencerId: p.influencerId,
                sellerId: p.sellerId,
                influencerAmount: p.influencerAmount,
                sellerAmount: p.sellerNet,
            },
            createdAt: p.createdAt ?? new Date().toISOString(),
        }));
    }, [rawPayments]);

    const walletTransactions = useMemo(
        () =>
            payments.map((p) => ({
                id: p._id,
                type: p.status.includes('succeeded') || p.status.includes('released') ? 'credit' : 'debit',
                amount: p.split.sellerAmount ?? p.amount,
                description: `Pago orden ${p.orderId}`,
                status: p.status,
                createdAt: p.createdAt,
            })),
        [payments],
    );

    const walletSnapshot = useMemo<WalletAccount | null>(() => {
        if (!userId) return null;
        return {
            ownerId: userId,
            balances: {
                available: walletAccount?.balanceAvailable ?? 0,
                pending: walletAccount?.balancePending ?? 0,
                reserved: walletAccount?.balanceReserved ?? 0,
            },
            transactions: walletTransactions,
        };
    }, [userId, walletAccount, walletTransactions]);

    const ensureWalletAccount = useCallback(
        (targetUserId: string, ownerType: string, ownerName: string) => {
            if (!sessionToken || targetUserId !== userId) return;
            const mappedType =
                ownerType === 'business'
                    ? 'business'
                    : ownerType === 'influencer'
                      ? 'influencer'
                      : 'consumer';
            ensureWalletMutation({
                sessionToken,
                userId: targetUserId,
                ownerType: mappedType as 'business' | 'influencer' | 'consumer' | 'ramgos',
                ownerName,
            }).catch(console.error);
        },
        [ensureWalletMutation, sessionToken, userId],
    );

    const getWalletByOwner = useCallback(
        (ownerId: string): WalletAccount | null => {
            if (!walletSnapshot || ownerId !== userId) {
                return ownerId
                    ? {
                          ownerId,
                          balances: { available: 0, pending: 0, reserved: 0 },
                          transactions: [],
                      }
                    : null;
            }
            return walletSnapshot;
        },
        [walletSnapshot, userId],
    );

    const getKycStatus = useCallback(
        (ownerId: string) => (ownerId === userId ? (user?.kycStatus ?? null) : null),
        [user?.kycStatus, userId],
    );

    const submitKyc = useCallback(
        async (payload: KycPayload) => {
            if (!sessionToken || !userId || payload.ownerId !== userId) return;
            await submitKycMutation({
                sessionToken,
                id: userId as Id<'users'>,
                payload: payload.data,
            });
        },
        [sessionToken, submitKycMutation, userId],
    );

    return useMemo(
        () => ({
            cards: [],
            transactions: walletTransactions,
            balance: walletSnapshot?.balances.available ?? 0,
            payments,
            ensureWalletAccount,
            getWalletByOwner,
            getKycStatus,
            // ponytail: no-op — use connect.requestInstantPayout from dashboard screens
            requestWithdrawal: () => {},
            submitKyc,
            // ponytail: no-op — user.kycStatus refreshes via AuthContext Convex subscription
            refreshKyc: async () => {},
            // ponytail: no-op, callers: 0
            deposit: () => {},
            withdraw: () => {},
        }),
        [
            walletTransactions,
            walletSnapshot,
            payments,
            ensureWalletAccount,
            getWalletByOwner,
            getKycStatus,
            submitKyc,
        ],
    );
}

export function FintechProvider({ children }: { children: React.ReactNode }) {
    const value = useFintechState();
    return <FintechContext.Provider value={value}>{children}</FintechContext.Provider>;
}

export function useFintech() {
    return useFintechState();
}
