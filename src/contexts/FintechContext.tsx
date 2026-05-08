import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    ReactNode,
} from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
    calculatePaymentSplit,
    PaymentSplitInput,
    PaymentSplit,
} from '../services/fintech/paymentSplitter';
import {
    listPaymentProviders,
    PaymentProviderDefinition,
    PaymentProviderKey,
} from '../services/fintech/paymentProviders';
import { useAuth } from './AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WalletOwnerType = 'ramgos' | 'business' | 'influencer' | 'consumer';
type WalletBalanceKey = 'available' | 'pending' | 'reserved';
type WithdrawalStatus = 'pending' | 'processing' | 'approved' | 'rejected';
export type KycStatus = 'unverified' | 'pending' | 'approved' | 'rejected';

export interface WalletBalances {
    available: number;
    pending: number;
    reserved: number;
    currency: string;
}

export interface WalletTransaction {
    id: string;
    type: 'credit' | 'debit';
    status: WalletBalanceKey;
    amount: number;
    currency: string;
    description: string;
    createdAt: string;
    balanceAfter: WalletBalances;
    relatedPaymentId?: string;
    metadata?: Record<string, unknown>;
}

export interface WalletAccount {
    id: string;
    ownerId: string;
    ownerType: WalletOwnerType;
    ownerName: string;
    currency: string;
    balances: WalletBalances;
    transactions: WalletTransaction[];
    lastUpdatedAt: string;
}

export interface PaymentMethodSnapshot {
    brand: string;
    last4: string;
    expMonth: string;
    expYear: string;
    ownerName: string;
}

export interface PaymentRecord {
    id: string;
    status: 'succeeded' | 'failed' | 'processing';
    amount: number;
    currency: string;
    provider: PaymentProviderKey;
    providerFee: number;
    method: PaymentMethodSnapshot;
    split: PaymentSplit;
    gateway: {
        id: string;
        status: 'succeeded' | 'failed' | 'requires_action';
        authorizationCode: string;
        providerFee: number;
        netAmount: number;
        currency: string;
        processedAt: string;
        provider: PaymentProviderKey;
        riskLevel: 'low' | 'medium' | 'high';
        rawResponse: Record<string, unknown>;
        receiptUrl?: string;
    };
    metadata?: Record<string, unknown>;
    description?: string;
    createdAt: string;
    settledAt?: string;
}

export interface WithdrawalRequest {
    id: string;
    accountId: string;
    amount: number;
    currency: string;
    status: WithdrawalStatus;
    createdAt: string;
    processedAt?: string;
    destination: {
        type: 'bank' | 'wallet';
        label: string;
    };
    notes?: string;
    metadata?: Record<string, unknown>;
}

export interface KycRecord {
    ownerId: string;
    ownerType: WalletOwnerType;
    status: KycStatus;
    submittedAt?: string;
    updatedAt?: string;
    dataSnapshot?: Record<string, unknown>;
    reviewerNotes?: string;
}

interface RequestWithdrawalInput {
    accountId: string;
    amount: number;
    destination: WithdrawalRequest['destination'];
    notes?: string;
    metadata?: Record<string, unknown>;
}

export interface SubmitKycPayload {
    ownerId: string;
    ownerType: WalletOwnerType;
    ownerName: string;
    data: Record<string, unknown>;
}

interface FintechContextType {
    providers: PaymentProviderDefinition[];
    wallets: WalletAccount[];
    payments: PaymentRecord[];
    withdrawals: WithdrawalRequest[];
    kycRecords: Record<string, KycRecord>;
    previewSplit: (input: Omit<PaymentSplitInput, 'total'> & { total: number }) => PaymentSplit;
    requestWithdrawal: (input: RequestWithdrawalInput) => Promise<WithdrawalRequest>;
    ensureWalletAccount: (
        ownerId: string,
        ownerType: WalletOwnerType,
        ownerName: string,
        currency?: string,
    ) => Promise<void>;
    getWalletByOwner: (ownerId: string) => WalletAccount | undefined;
    getKycStatus: (ownerId: string) => KycStatus;
    submitKyc: (payload: SubmitKycPayload) => KycRecord;
    updateKycStatus: (ownerId: string, status: KycStatus, notes?: string) => void;
    releasePayment: (paymentId: string) => boolean;
    refreshKyc: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

function convexWalletToAccount(w: any): WalletAccount {
    return {
        id: w._id,
        ownerId: w.userId,
        ownerType: w.ownerType as WalletOwnerType,
        ownerName: w.ownerName,
        currency: w.currency,
        balances: {
            available: w.balanceAvailable ?? 0,
            pending: w.balancePending ?? 0,
            reserved: w.balanceReserved ?? 0,
            currency: w.currency,
        },
        transactions: [],
        lastUpdatedAt: w.lastUpdatedAt,
    };
}

function convexPaymentToRecord(p: any): PaymentRecord {
    return {
        id: p._id,
        status: p.status === 'pending' ? 'processing' : p.status,
        amount: p.amount,
        currency: p.currency,
        provider: (p.provider as PaymentProviderKey) ?? 'stripe',
        providerFee: p.providerFee ?? 0,
        method: {
            brand: p.paymentMethodBrand ?? 'unknown',
            last4: p.paymentMethodLast4 ?? '0000',
            expMonth: '',
            expYear: '',
            ownerName: '',
        },
        split: {
            total: p.amount,
            currency: p.currency,
            sellerId: p.sellerId ?? '',
            sellerName: '',
            sellerGross: p.sellerNet ?? 0,
            sellerNet: p.sellerNet ?? 0,
            ramgosCommission: p.ramgosCommission ?? 0,
            influencerAmount: p.influencerAmount ?? 0,
            influencerId: p.influencerId,
            influencerName: undefined,
            commissionRate: p.commissionRate ?? 0,
            influencerRate: p.influencerRate ?? 0,
            appliedMinimumCommission: p.ramgosCommission ?? 0,
        },
        gateway: {
            id: p.stripePaymentIntentId ?? p._id,
            status: p.status === 'succeeded' ? 'succeeded' : p.status === 'failed' ? 'failed' : 'requires_action',
            authorizationCode: '',
            providerFee: p.providerFee ?? 0,
            netAmount: p.amount - (p.providerFee ?? 0),
            currency: p.currency,
            processedAt: p.createdAt,
            provider: (p.provider as PaymentProviderKey) ?? 'stripe',
            riskLevel: 'low',
            rawResponse: {},
        },
        metadata: p.metadata,
        description: p.description,
        createdAt: p.createdAt,
        settledAt: p.settledAt,
    };
}

function convexWithdrawalToRequest(w: any): WithdrawalRequest {
    return {
        id: w._id,
        accountId: w.userId,
        amount: w.amount,
        currency: w.currency,
        status: w.status as WithdrawalStatus,
        createdAt: w.createdAt,
        processedAt: w.processedAt,
        destination: {
            type: w.destinationType as 'bank' | 'wallet',
            label: w.destinationLabel,
        },
        notes: w.notes,
        metadata: w.metadata,
    };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const FintechContext = createContext<FintechContextType | undefined>(undefined);

export const FintechProvider = ({ children }: { children: ReactNode }) => {
    const { user } = useAuth();
    const userId = user?.id ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _api = api as any;

    // --- Convex queries ---
    const convexWallet = useQuery(
        _api.finance.getWalletAccount,
        userId ? { actorId: userId as any, userId } : 'skip',
    );
    const convexPayments = useQuery(
        _api.finance.getPaymentsByUser,
        userId ? { actorId: userId as any, userId } : 'skip',
    );
    const convexWithdrawals = useQuery(
        _api.finance.getWithdrawalsByUser,
        userId ? { actorId: userId as any, userId } : 'skip',
    );

    // --- Convex mutations ---
    const ensureWalletMutation = useMutation(_api.finance.ensureWalletAccount);
    const createWithdrawalMutation = useMutation(_api.finance.createWithdrawal);

    // KYC: derived from user object (already in Convex users table)
    const kycRecords = useMemo<Record<string, KycRecord>>(() => {
        if (!user) return {};
        return {
            [user.id]: {
                ownerId: user.id,
                ownerType: (user.role as WalletOwnerType) ?? 'consumer',
                status: (user.kycStatus as KycStatus) ?? 'unverified',
                updatedAt: new Date().toISOString(),
                dataSnapshot: { ownerName: user.name, email: user.email },
            },
        };
    }, [user?.id, user?.kycStatus, user?.role, user?.name, user?.email]);

    // Local optimistic cache for payments (enriched with PaymentRecord shape)
    const [localPaymentCache, setLocalPaymentCache] = useState<PaymentRecord[]>([]);

    const wallets: WalletAccount[] = useMemo(() => {
        if (convexWallet) return [convexWalletToAccount(convexWallet)];
        return [];
    }, [convexWallet]);

    const payments: PaymentRecord[] = useMemo(() => {
        const fromConvex = (convexPayments ?? []).map((p: any) => convexPaymentToRecord(p));
        // Merge: Convex records take precedence, local cache fills in optimistic entries not yet persisted
        const convexIds = new Set(fromConvex.map((p: PaymentRecord) => p.id));
        const onlyLocal = localPaymentCache.filter((p) => !convexIds.has(p.id));
        return [...fromConvex, ...onlyLocal].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    }, [convexPayments, localPaymentCache]);

    const withdrawals: WithdrawalRequest[] = useMemo(
        () => (convexWithdrawals ?? []).map((w: any) => convexWithdrawalToRequest(w)),
        [convexWithdrawals],
    );

    // Ensure wallet account is created when user logs in
    useEffect(() => {
        if (!user?.id) return;
        const ownerType: WalletOwnerType =
            user.role === 'business'
                ? 'business'
                : user.role === 'influencer'
                    ? 'influencer'
                    : user.role === 'admin'
                        ? 'ramgos'
                        : 'consumer';
        ensureWalletMutation({
            actorId: user.id as any,
            userId: user.id,
            ownerType,
            ownerName: user.name ?? user.email ?? user.id,
        }).catch(() => {});
    }, [user?.id, user?.role, user?.name]);

    const ensureWalletAccount = useCallback(
        async (ownerId: string, ownerType: WalletOwnerType, ownerName: string) => {
            if (!userId) return;
            await ensureWalletMutation({
                actorId: userId as any,
                userId: ownerId,
                ownerType,
                ownerName,
            }).catch(() => {});
        },
        [userId, ensureWalletMutation],
    );

    const previewSplit = useCallback(
        (input: Omit<PaymentSplitInput, 'total'> & { total: number }): PaymentSplit =>
            calculatePaymentSplit(input),
        [],
    );

    const requestWithdrawal = useCallback(
        async (input: RequestWithdrawalInput): Promise<WithdrawalRequest> => {
            if (!userId) throw new Error('Debes iniciar sesión para solicitar un retiro.');

            const withdrawalId = await createWithdrawalMutation({
                actorId: userId as any,
                userId: input.accountId,
                amount: input.amount,
                destinationType: input.destination.type,
                destinationLabel: input.destination.label,
                notes: input.notes,
                metadata: input.metadata,
            });

            return {
                id: String(withdrawalId),
                accountId: input.accountId,
                amount: input.amount,
                currency: 'USD',
                status: 'pending',
                createdAt: new Date().toISOString(),
                destination: input.destination,
                notes: input.notes,
                metadata: input.metadata,
            };
        },
        [userId, createWithdrawalMutation],
    );

    const releasePayment = useCallback(
        (paymentId: string): boolean => {
            // Actual release happens via confirmReceipt in orders.ts.
            // Mark local optimistic cache as settled.
            setLocalPaymentCache((prev) =>
                prev.map((p) =>
                    p.id === paymentId ? { ...p, settledAt: new Date().toISOString() } : p,
                ),
            );
            return true;
        },
        [],
    );

    const getWalletByOwner = useCallback(
        (ownerId: string): WalletAccount | undefined => {
            return wallets.find((w) => w.ownerId === ownerId);
        },
        [wallets],
    );

    const getKycStatus = useCallback(
        (ownerId: string): KycStatus => {
            const record = kycRecords[ownerId];
            return record?.status ?? 'unverified';
        },
        [kycRecords],
    );

    // submitKyc goes through Convex users.submitKyc (called directly from KYCScreen)
    // We return an optimistic KycRecord here for immediate UI feedback.
    const submitKyc = useCallback(
        (payload: SubmitKycPayload): KycRecord => {
            const timestamp = new Date().toISOString();
            return {
                ownerId: payload.ownerId,
                ownerType: payload.ownerType,
                status: 'pending',
                submittedAt: timestamp,
                updatedAt: timestamp,
                dataSnapshot: { ownerName: payload.ownerName, ...payload.data },
            };
        },
        [],
    );

    // updateKycStatus is admin-only; actual update goes through Convex users.updateUser
    const updateKycStatus = useCallback((_ownerId: string, _status: KycStatus, _notes?: string) => {
        // No-op in client: admin should use Convex dashboard or admin mutation directly.
        console.warn('[FintechContext] updateKycStatus: use Convex admin mutations for server-side KYC updates.');
    }, []);

    const refreshKyc = useCallback(async () => {
        // KYC is already reactive via the Convex user query in AuthContext; nothing to do here.
    }, []);

    const providers = useMemo(() => listPaymentProviders(), []);

    const contextValue = useMemo<FintechContextType>(
        () => ({
            providers,
            wallets,
            payments,
            withdrawals,
            kycRecords,
            previewSplit,
            requestWithdrawal,
            ensureWalletAccount,
            getWalletByOwner,
            getKycStatus,
            submitKyc,
            updateKycStatus,
            releasePayment,
            refreshKyc,
        }),
        [
            providers,
            wallets,
            payments,
            withdrawals,
            kycRecords,
            previewSplit,
            requestWithdrawal,
            ensureWalletAccount,
            getWalletByOwner,
            getKycStatus,
            submitKyc,
            updateKycStatus,
            releasePayment,
            refreshKyc,
        ],
    );

    return <FintechContext.Provider value={contextValue}>{children}</FintechContext.Provider>;
};

export const useFintech = () => {
    const context = useContext(FintechContext);
    if (!context) throw new Error('useFintech debe usarse dentro de FintechProvider');
    return context;
};
