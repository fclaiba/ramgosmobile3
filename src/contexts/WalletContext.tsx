import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react'; // Context
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
    
    // Get wallet summary from backend
    const walletSummary = useQuery(
        api.economy.getWalletSummary,
        user ? { userId: user.id } : 'skip',
    );

    const economyState = useQuery(
        api.economy.getState,
        user ? { userId: user.id } : 'skip',
    );
    const saveWalletState = useMutation(api.economy.saveWalletState);
    const applyWalletEvent = useMutation(api.economy.applyWalletEvent);

    const [hasHydratedFromBackend, setHasHydratedFromBackend] = useState(false);

    // Mapped data from backend
    const wallets = useMemo((): Record<string, Wallet> => {
        const userWallet: Wallet = {
            userId: user?.id ?? 'guest',
            balanceAvailable: walletSummary?.balanceAvailable ?? 0,
            balancePending: walletSummary?.balancePending ?? 0,
            currency: 'ARS',
        };
        const holdingWallet: Wallet = {
            userId: 'ramgos_holding',
            balanceAvailable: 0,
            balancePending: 0,
            currency: 'ARS',
        };
        return {
            [user?.id ?? 'guest']: userWallet,
            'ramgos_holding': holdingWallet
        };
    }, [user, walletSummary]);

    const transactions = useMemo((): Transaction[] => 
        (walletSummary?.events ?? []).map((ev: any) => ({
            id: ev.eventKey,
            orderId: ev.orderId ?? '',
            type: ev.metadata?.txType ?? 'PAYMENT_IN',
            amount: ev.amount,
            status: ev.type === 'hold' ? 'PENDING' : 'COMPLETED',
            source: ev.metadata?.source ?? 'USER_PAYMENT',
            destination: ev.metadata?.destination ?? 'SELLER_WALLET',
            date: new Date(ev.createdAt),
            description: ev.description,
            relatedUserId: ev.userId,
        })), [walletSummary]);

    // Helpers
    const getWallet = (userId: string): Wallet => {
        return wallets[userId] || { userId, balanceAvailable: 0, balancePending: 0, currency: 'ARS' as const };
    };

    // --- MAIN FINANCIAL ENGINE ---
    const processCheckoutTransaction = (_order: { id: string; sellerId: string; totalAmount: number; items: any[]; couponCode?: string }) => {
        // no-op: financial splits are handled by Convex webhook
    };

    const confirmDelivery = async (orderId: string) => {
        // In a real system, this would trigger the 'release' event in the backend.
        // We find the 'hold' transaction and send a 'release' event.
        const holdTx = transactions.find((tx: Transaction) => tx.orderId === orderId && tx.status === 'PENDING');
        if (holdTx && user?.id) {
            await applyWalletEvent({
                userId: user.id,
                eventKey: `release_${orderId}_${Date.now()}`,
                type: 'release',
                amount: holdTx.amount,
                description: `Liberación de fondos: ${holdTx.description}`,
                orderId: orderId,
                metadata: {
                    ...holdTx,
                    txStatus: 'COMPLETED',
                },
            });
        }
    };

    const simulateTimePass = (days: number) => {
        // Simulation moved to backend logic in real production scenario
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
