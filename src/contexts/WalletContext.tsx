import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'; // Context
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

import { useAuth } from './AuthContext';
import { usePoints } from './PointsContext'; // Standard Import

// --- Data Models ---

export interface Wallet {
    userId: string;
    balanceAvailable: number;
    balancePending: number; // Escrow
    currency: 'ARS';
}

export type TransactionType = 'PAYMENT_IN' | 'FEE_RAMGOS' | 'COMMISSION_INFLUENCER' | 'PAYOUT_SELLER';
export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';
export type TransactionSource = 'USER_PAYMENT' | 'SYSTEM';
export type TransactionDestination = 'RAMGOS_HOLDING' | 'SELLER_WALLET' | 'INFLUENCER_WALLET';

export interface Transaction {
    id: string;
    orderId: string;
    type: TransactionType;
    amount: number;
    status: TransactionStatus;
    source: TransactionSource;
    destination: TransactionDestination;
    date: Date;
    releaseDate?: Date; // For Escrow
    description: string;
    relatedUserId: string; // The user whose wallet is affected (or 'RAMGOS')
}

// NOTE — Campaigns and influencer contracts USED to live here as a
// client-side mock (a JSON blob serialised under `economyState.walletState`).
// They were migrated to the Convex `influencerCampaigns` table and are now
// served by `api.campaigns.*` queries/mutations. See:
//   - convex/campaigns.ts
//   - src/screens/InfluencerDashboardScreen.tsx
//   - src/screens/BusinessDashboardScreen.tsx
// Coupon validation has been removed entirely; influencer attribution is
// resolved server-side inside `convex/stripe.ts` via referralCode.

// --- Context Interface ---

interface WalletContextType {
    wallets: Record<string, Wallet>;
    transactions: Transaction[];

    // Actions
    getWallet: (userId: string) => Wallet;

    // Core Payment Process
    processCheckoutTransaction: (order: {
        id: string;
        sellerId: string;
        totalAmount: number; // Total paid by user
        items: any[]; // To calculate fees per category
        couponCode?: string;
    }) => void;

    // Escrow process
    confirmDelivery: (orderId: string) => void; // Trigger release
    simulateTimePass: (days: number) => void; // Dev tool
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const serializeWalletState = (state: {
    wallets: Record<string, Wallet>;
    transactions: Transaction[];
}) => ({
    ...state,
    transactions: state.transactions.map((tx) => ({
        ...tx,
        date: tx.date.toISOString(),
        releaseDate: tx.releaseDate ? tx.releaseDate.toISOString() : undefined,
    })),
});

const deserializeWalletState = (raw: any) => ({
    wallets: raw?.wallets ?? { ramgos_holding: { userId: 'ramgos_holding', balanceAvailable: 0, balancePending: 0, currency: 'ARS' } },
    transactions: Array.isArray(raw?.transactions)
        ? raw.transactions.map((tx: any) => ({
            ...tx,
            date: new Date(tx.date),
            releaseDate: tx.releaseDate ? new Date(tx.releaseDate) : undefined,
        }))
        : [],
});

// --- Provider ---

export function WalletProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const { addPoints } = usePoints();
    const economyState = useQuery(
        api.economy.getState,
        user ? { actorId: user.id as any, userId: user.id } : 'skip',
    );
    const saveWalletState = useMutation(api.economy.saveWalletState);
    const applyWalletEvent = useMutation(api.economy.applyWalletEvent);
    const [hasHydratedFromBackend, setHasHydratedFromBackend] = useState(false);

    // Mock Database
    const [wallets, setWallets] = useState<Record<string, Wallet>>({
        'ramgos_holding': { userId: 'ramgos_holding', balanceAvailable: 0, balancePending: 0, currency: 'ARS' }
    });

    const [transactions, setTransactions] = useState<Transaction[]>([]);

    useEffect(() => {
        if (!user || hasHydratedFromBackend) return;
        if (!economyState?.walletState) {
            setHasHydratedFromBackend(true);
            return;
        }

        const hydrated = deserializeWalletState(economyState.walletState);
        setWallets(hydrated.wallets);
        setTransactions(hydrated.transactions);
        setHasHydratedFromBackend(true);
    }, [user, economyState, hasHydratedFromBackend]);

    useEffect(() => {
        if (!user || !hasHydratedFromBackend) return;
        saveWalletState({
            actorId: user.id as any,
            userId: user.id,
            walletState: serializeWalletState({
                wallets,
                transactions,
            }),
        }).catch((error: any) => {
            console.warn('[WalletContext] Failed to persist wallet state', error);
        });
    }, [user, hasHydratedFromBackend, wallets, transactions, saveWalletState]);

    // Helpers
    const getWallet = (userId: string): Wallet => {
        return wallets[userId] || { userId, balanceAvailable: 0, balancePending: 0, currency: 'ARS' };
    };

    const updateWallet = (userId: string, changes: Partial<Wallet>) => {
        setWallets(prev => ({
            ...prev,
            [userId]: { ...getWallet(userId), ...changes }
        }));
    };

    const addTransaction = (tx: Transaction) => {
        setTransactions(prev => [tx, ...prev]);
        if (user?.id && tx.relatedUserId === user.id) {
            applyWalletEvent({
                actorId: user.id as any,
                userId: tx.relatedUserId,
                eventKey: tx.id,
                type: tx.status === 'PENDING' ? 'hold' : tx.type === 'PAYOUT_SELLER' ? 'credit' : 'debit',
                amount: tx.amount,
                description: tx.description,
                orderId: tx.orderId,
                metadata: {
                    source: tx.source,
                    destination: tx.destination,
                    txType: tx.type,
                    txStatus: tx.status,
                },
            }).catch((error: any) => {
                console.warn('[WalletContext] Failed to persist wallet ledger event', error);
            });
        }

        // Update Wallet Balances Logic
        // PENDING transactions go to balancePending
        // COMPLETED transactions go to balanceAvailable

        const targetUser = tx.relatedUserId;
        const wallet = getWallet(targetUser);

        if (targetUser === 'RAMGOS_HOLDING') return; // We track holding loosely or separate

        if (tx.status === 'PENDING') {
            updateWallet(targetUser, { balancePending: wallet.balancePending + tx.amount });
        } else if (tx.status === 'COMPLETED') {
            updateWallet(targetUser, { balanceAvailable: wallet.balanceAvailable + tx.amount });
        }
    };

    // --- Actions ---

    // --- MAIN FINANCIAL ENGINE ---
    // NOTE: Splits and escrow are now handled server-side by Convex (stripe.internalMarkPaymentSucceeded).
    // This function is kept as a no-op for backward compatibility; do not re-add local finance logic here.
    const processCheckoutTransaction = (_order: { id: string; sellerId: string; totalAmount: number; items: any[]; couponCode?: string }) => {
        // no-op: financial splits are handled by Convex webhook
    };

    const confirmDelivery = (orderId: string) => {
        // Find pending transactions for this order and COMPLETE them
        setTransactions(prev => prev.map(tx => {
            if (tx.orderId === orderId && tx.status === 'PENDING') {
                return { ...tx, status: 'COMPLETED', date: new Date() }; // Update date to release date
            }
            return tx;
        }));

        // Need to update wallet balances too. 
        // Since 'transactions' state update is async, we can't rely on it immediately loop.
        // We'll effectively re-calculate balances based on transaction status changes.
        // Or simpler: find the txs, and call a helper to move money.

        // For simplicity in this mock:
        // iterate transactions, if matches, deduct from pending, add to available.
        const txsToRelease = transactions.filter(tx => tx.orderId === orderId && tx.status === 'PENDING');

        txsToRelease.forEach(tx => {
            const wallet = getWallet(tx.relatedUserId);
            updateWallet(tx.relatedUserId, {
                balancePending: wallet.balancePending - tx.amount,
                balanceAvailable: wallet.balanceAvailable + tx.amount // simplified
            });
        });

        // Update transaction status (visual)
        setTransactions(prev => prev.map(tx => {
            if (tx.orderId === orderId && tx.status === 'PENDING') {
                return { ...tx, status: 'COMPLETED' };
            }
            return tx;
        }));
    };

    const simulateTimePass = (days: number) => {
        // Find transactions where releaseDate <= new simulated date
        // For simulation, we just release ALL pending for now to show it works
        const pendingTxs = transactions.filter(tx => tx.status === 'PENDING');
        pendingTxs.forEach(tx => {
            const wallet = getWallet(tx.relatedUserId);
            updateWallet(tx.relatedUserId, {
                balancePending: wallet.balancePending - tx.amount,
                balanceAvailable: wallet.balanceAvailable + tx.amount
            });
        });

        setTransactions(prev => prev.map(tx => (tx.status === 'PENDING' ? { ...tx, status: 'COMPLETED' } : tx)));
    };

    return (
        <WalletContext.Provider value={{
            wallets,
            transactions,
            getWallet,
            processCheckoutTransaction,
            confirmDelivery,
            simulateTimePass
        }}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWallet() {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error('useWallet must be used within WalletProvider');
    }
    return context;
}
