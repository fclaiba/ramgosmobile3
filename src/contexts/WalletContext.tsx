// Opción A — balance y movimientos reales desde convex/finance.ts.
import React, { createContext, useContext, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from './AuthContext';

export interface WalletTransaction {
    id: string;
    type: string;
    amount: number;
    description: string;
    date: string | Date;
    status: string;
    relatedUserId?: string;
}

export interface WalletSnapshot {
    balanceAvailable: number;
    balancePending: number;
    balanceHeld: number;
}

export interface WalletContextValue {
    balance: number;
    transactions: WalletTransaction[];
    deposit: (amount: number) => void;
    withdraw: (amount: number) => void;
    getWallet: (userId: string) => WalletSnapshot;
    simulateTimePass: (days: number) => void;
}

const emptyWallet: WalletSnapshot = {
    balanceAvailable: 0,
    balancePending: 0,
    balanceHeld: 0,
};

const defaultValue: WalletContextValue = {
    balance: 0,
    transactions: [],
    deposit: () => {},
    withdraw: () => {},
    getWallet: () => emptyWallet,
    simulateTimePass: () => {},
};

const WalletContext = createContext<WalletContextValue | null>(null);

function useWalletState(): WalletContextValue {
    const { user, sessionToken } = useAuth();
    const userId = user?.id;

    const walletAccount = useQuery(
        api.finance.getWalletAccount,
        userId && sessionToken ? { sessionToken, userId } : 'skip',
    );

    const payments = useQuery(
        api.finance.getPaymentsByUser,
        userId && sessionToken ? { sessionToken, userId } : 'skip',
    );

    const transactions = useMemo<WalletTransaction[]>(() => {
        if (!Array.isArray(payments)) return [];
        return payments.map((p: any) => ({
            id: String(p._id),
            type: p.status ?? 'payment',
            amount: p.sellerNet ?? p.amount ?? 0,
            description: p.description ?? `Orden ${p.orderId ?? ''}`.trim(),
            date: p.createdAt ?? new Date().toISOString(),
            status: p.status ?? 'pending',
            relatedUserId: p.userId,
        }));
    }, [payments]);

    const snapshot = useMemo<WalletSnapshot>(() => {
        if (!walletAccount) return emptyWallet;
        return {
            balanceAvailable: walletAccount.balanceAvailable ?? 0,
            balancePending: walletAccount.balancePending ?? 0,
            balanceHeld: walletAccount.balanceReserved ?? 0,
        };
    }, [walletAccount]);

    return useMemo(
        () => ({
            balance: snapshot.balanceAvailable,
            transactions,
            deposit: () => {},
            withdraw: () => {},
            getWallet: (targetUserId: string) =>
                targetUserId === userId ? snapshot : emptyWallet,
            simulateTimePass: () => {},
        }),
        [snapshot, transactions, userId],
    );
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
    const value = useWalletState();
    return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
    return useWalletState();
}
