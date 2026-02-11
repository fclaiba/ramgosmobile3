import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'; // Context
import AsyncStorage from '@react-native-async-storage/async-storage';

import { calculateCommission, calculateInfluencerCommission } from '../utils/CommissionUtils';
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

export interface Campaign {
    id: string;
    influencerId: string;
    targetStoreId: string;
    targetStoreName: string;
    code: string;
    splitPercentage: number; // e.g., 5
    stats: {
        totalSales: number;
        totalEarnings: number;
        uses: number;
    };
    isActive: boolean;
}

export interface InfluencerContract {
    id: string;
    influencerId: string;
    storeId: string;
    storeName: string;
    commissionRate: number; // e.g. 0.05 => 5%
    status: 'active' | 'paused' | 'ended';
    startsAt: string;
    endsAt?: string;
}

// --- Context Interface ---

interface WalletContextType {
    wallets: Record<string, Wallet>;
    transactions: Transaction[];
    campaigns: Campaign[];
    contracts: InfluencerContract[];

    // Actions
    getWallet: (userId: string) => Wallet;
    createCampaign: (influencerId: string, storeId: string, storeName: string, code: string, split?: number) => void;
    createContract: (influencerId: string, storeId: string, storeName: string, commissionRate?: number) => void;
    endContract: (contractId: string) => void;
    validateCoupon: (code: string) => { valid: boolean; discountPercent?: number; campaign?: Campaign; message?: string };

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

const WALLET_CAMPAIGNS_STORAGE_KEY = 'ramgos_wallet_campaigns_v1';
const INFLUENCER_CONTRACTS_STORAGE_KEY = 'ramgos_influencer_contracts_v1';

// --- Provider ---

export function WalletProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const { addPoints } = usePoints();

    // Mock Database
    const [wallets, setWallets] = useState<Record<string, Wallet>>({
        'ramgos_holding': { userId: 'ramgos_holding', balanceAvailable: 0, balancePending: 0, currency: 'ARS' }
    });

    const [transactions, setTransactions] = useState<Transaction[]>([]);

    const [campaigns, setCampaigns] = useState<Campaign[]>([
        // Mock Campaigns
        {
            id: 'camp_1',
            influencerId: 'inf_1', // Assume some influencer ID
            targetStoreId: 'store_1', // Assume some store ID
            targetStoreName: 'Nike Official',
            code: 'JORGE10',
            splitPercentage: 5,
            stats: { totalSales: 0, totalEarnings: 0, uses: 0 },
            isActive: true
        }
    ]);

    const [contracts, setContracts] = useState<InfluencerContract[]>([
        {
            id: 'contract_1',
            influencerId: 'inf_1',
            storeId: 'store_1',
            storeName: 'Nike Official',
            commissionRate: 0.05,
            status: 'active',
            startsAt: new Date('2025-01-15T00:00:00Z').toISOString(),
        },
    ]);

    useEffect(() => {
        const hydrate = async () => {
            try {
                const [storedCampaigns, storedContracts] = await Promise.all([
                    AsyncStorage.getItem(WALLET_CAMPAIGNS_STORAGE_KEY),
                    AsyncStorage.getItem(INFLUENCER_CONTRACTS_STORAGE_KEY),
                ]);

                if (storedCampaigns) {
                    const parsed = JSON.parse(storedCampaigns);
                    if (Array.isArray(parsed)) {
                        setCampaigns(parsed);
                    }
                }

                if (storedContracts) {
                    const parsed = JSON.parse(storedContracts);
                    if (Array.isArray(parsed)) {
                        setContracts(parsed);
                    }
                }
            } catch (error) {
                console.warn('[WalletContext] Failed to hydrate campaigns/contracts', error);
            }
        };
        hydrate();
    }, []);

    useEffect(() => {
        AsyncStorage.setItem(WALLET_CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns)).catch((error) => {
            console.warn('[WalletContext] Failed to persist campaigns', error);
        });
    }, [campaigns]);

    useEffect(() => {
        AsyncStorage.setItem(INFLUENCER_CONTRACTS_STORAGE_KEY, JSON.stringify(contracts)).catch((error) => {
            console.warn('[WalletContext] Failed to persist contracts', error);
        });
    }, [contracts]);

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

    const createCampaign = (influencerId: string, storeId: string, storeName: string, code: string, split = 5) => {
        const newCampaign: Campaign = {
            id: `camp_${Date.now()}`,
            influencerId,
            targetStoreId: storeId,
            targetStoreName: storeName,
            code: code.toUpperCase(),
            splitPercentage: split,
            stats: { totalSales: 0, totalEarnings: 0, uses: 0 },
            isActive: true
        };
        setCampaigns(prev => [...prev, newCampaign]);
    };

    const createContract = (influencerId: string, storeId: string, storeName: string, commissionRate = 0.05) => {
        const newContract: InfluencerContract = {
            id: `contract_${Date.now()}`,
            influencerId,
            storeId,
            storeName,
            commissionRate,
            status: 'active',
            startsAt: new Date().toISOString(),
        };
        setContracts((prev) => [newContract, ...prev]);
    };

    const endContract = (contractId: string) => {
        setContracts((prev) =>
            prev.map((c) =>
                c.id === contractId
                    ? { ...c, status: 'ended', endsAt: new Date().toISOString() }
                    : c
            )
        );
    };

    const validateCoupon = (code: string) => {
        const campaign = campaigns.find(c => c.code === code.toUpperCase() && c.isActive);
        if (campaign) {
            return { valid: true, discountPercent: 10, campaign }; // Hardcoded 10% discount for buyers
        }
        return { valid: false, message: 'Cupón inválido o expirado' };
    };

    // --- MAIN FINANCIAL ENGINE ---

    const processCheckoutTransaction = (order: { id: string; sellerId: string; totalAmount: number; items: any[]; couponCode?: string }) => {
        // 0. HIGH TICKET BONUS CHECK (Strategic Plan v2.0)
        if (order.totalAmount >= 100) {
            addPoints(25, 'Bono Compra Mayor a $100', { type: 'earn', source: 'bonus', metadata: { orderId: order.id } });
        }

        // 1. Determine Splits
        let influencerCommission = 0;
        let influencerId = '';
        let campaignId = '';

        if (order.couponCode) {
            const { valid, campaign } = validateCoupon(order.couponCode);
            if (valid && campaign) {
                // If coupon was used, the 'totalAmount' is already discounted? 
                // Let's assume passed 'totalAmount' is what the USER PAID.
                // We base commission on the Pre-Discount amount usually, OR the paid amount. 
                // Let's use Paid Amount for simplicity now.
                influencerCommission = calculateInfluencerCommission(order.totalAmount, campaign.splitPercentage);
                influencerId = campaign.influencerId;
                campaignId = campaign.id;

                // Update Campaign Stats
                setCampaigns(prev => prev.map(c =>
                    c.id === campaign.id
                        ? {
                            ...c,
                            stats: {
                                uses: c.stats.uses + 1,
                                totalSales: c.stats.totalSales + order.totalAmount,
                                totalEarnings: c.stats.totalEarnings + influencerCommission
                            }
                        }
                        : c
                ));
            }
        }

        // 2. Calculate Ramgos Fee
        // Simplified: iterate items and sum fees.
        let ramgosFee = 0;
        order.items.forEach(item => {
            const itemTotal = item.price * item.quantity;
            const cat = item.category || 'general'; // Needs category on item
            ramgosFee += calculateCommission(itemTotal, cat);
        });

        // 3. Calculate Seller Net
        // Net = TotalPaid - RamgosFee - InfluencerCommission
        const sellerNet = order.totalAmount - ramgosFee - influencerCommission;

        // 4. Create Ledger Entries

        const now = new Date();
        const releaseDate = new Date();
        // ESCROW UPDATE: 10 Days (Strategy v2.0)
        releaseDate.setDate(now.getDate() + 10);

        // 4.1 Payment In (To Ramgos Holding - Implicit, we just track the allocation)

        // 4.2 Seller Payout (PENDING)
        addTransaction({
            id: `tx_${Date.now()}_seller`,
            orderId: order.id,
            type: 'PAYOUT_SELLER',
            amount: sellerNet,
            status: 'PENDING',
            source: 'USER_PAYMENT',
            destination: 'SELLER_WALLET',
            date: now,
            releaseDate: releaseDate,
            description: `Venta Orden #${order.id}`,
            relatedUserId: order.sellerId
        });

        // 4.3 Influencer Commission (PENDING - usually has same escrow or shorter)
        if (influencerCommission > 0 && influencerId) {
            addTransaction({
                id: `tx_${Date.now()}_inf`,
                orderId: order.id,
                type: 'COMMISSION_INFLUENCER',
                amount: influencerCommission,
                status: 'PENDING',
                source: 'USER_PAYMENT',
                destination: 'INFLUENCER_WALLET',
                date: now,
                releaseDate: releaseDate,
                description: `Comisión Ref Orden #${order.id}`,
                relatedUserId: influencerId
            });
        }

        // 4.4 Ramgos Fee (COMPLETED immediately as it stays in house)
        // We could log this to a 'ramgos_admin' wallet if we wanted.
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
            campaigns,
            contracts,
            getWallet,
            createCampaign,
            createContract,
            endContract,
            validateCoupon,
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
