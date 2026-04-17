import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    ReactNode,
} from 'react';
import {
    calculatePaymentSplit,
    applyGatewayFee,
    PaymentSplitInput,
    PaymentSplit,
} from '../services/fintech/paymentSplitter';
import {
    getPaymentProvider,
    listPaymentProviders,
    PaymentGatewayChargeResult,
    PaymentProviderDefinition,
    PaymentProviderKey,
} from '../services/fintech/paymentProviders';
import { useAuth } from './AuthContext';

type WalletOwnerType = 'ramgos' | 'business' | 'influencer' | 'consumer';
type WalletBalanceKey = 'available' | 'pending' | 'reserved';
type WithdrawalStatus = 'pending' | 'processing' | 'approved' | 'rejected';
type KycStatus = 'unverified' | 'pending' | 'approved' | 'rejected';

interface WalletBalances {
    available: number;
    pending: number;
    reserved: number;
    currency: string;
}

interface WalletTransaction {
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

interface WalletAccount {
    id: string;
    ownerId: string;
    ownerType: WalletOwnerType;
    ownerName: string;
    currency: string;
    balances: WalletBalances;
    transactions: WalletTransaction[];
    lastUpdatedAt: string;
}

interface PaymentMethodSnapshot {
    brand: string;
    last4: string;
    expMonth: string;
    expYear: string;
    ownerName: string;
}

interface PaymentRecord {
    id: string;
    status: 'succeeded' | 'failed' | 'processing';
    amount: number;
    currency: string;
    provider: PaymentProviderKey;
    providerFee: number;
    method: PaymentMethodSnapshot;
    split: PaymentSplit;
    gateway: PaymentGatewayChargeResult;
    metadata?: Record<string, unknown>;
    description?: string;
    createdAt: string;
    settledAt?: string;
}

interface WithdrawalRequest {
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

interface KycRecord {
    ownerId: string;
    ownerType: WalletOwnerType;
    status: KycStatus;
    submittedAt?: string;
    updatedAt?: string;
    dataSnapshot?: Record<string, unknown>;
    reviewerNotes?: string;
}

interface ProcessPaymentInput {
    amount: number;
    currency?: string;
    providerKey?: PaymentProviderKey;
    sellerId: string;
    sellerName: string;
    influencerId?: string;
    influencerName?: string;
    commissionRate?: number;
    influencerRate?: number;
    minimumCommission?: number;
    paymentMethod: PaymentMethodSnapshot;
    metadata?: Record<string, unknown>;
    description?: string;
}

interface RequestWithdrawalInput {
    accountId: string;
    amount: number;
    destination: WithdrawalRequest['destination'];
    notes?: string;
    metadata?: Record<string, unknown>;
}

interface SubmitKycPayload {
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
    processPayment: (input: ProcessPaymentInput) => Promise<PaymentRecord>;
    previewSplit: (input: Omit<PaymentSplitInput, 'total'> & { total: number }) => PaymentSplit;
    requestWithdrawal: (input: RequestWithdrawalInput) => WithdrawalRequest;
    ensureWalletAccount: (
        ownerId: string,
        ownerType: WalletOwnerType,
        ownerName: string,
        currency?: string,
    ) => WalletAccount;
    getWalletByOwner: (ownerId: string) => WalletAccount | undefined;
    getKycStatus: (ownerId: string) => KycStatus;
    submitKyc: (payload: SubmitKycPayload) => KycRecord;
    updateKycStatus: (ownerId: string, status: KycStatus, notes?: string) => void;
    releasePayment: (paymentId: string) => boolean;
    refreshKyc: () => Promise<void>;
}

const FintechContext = createContext<FintechContextType | undefined>(undefined);

const roundCurrency = (value: number) => Math.round(value * 100) / 100;
const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const createWallet = ({
    id,
    ownerId,
    ownerName,
    ownerType,
    currency = 'USD',
    available = 0,
    pending = 0,
    reserved = 0,
}: {
    id?: string;
    ownerId: string;
    ownerName: string;
    ownerType: WalletOwnerType;
    currency?: string;
    available?: number;
    pending?: number;
    reserved?: number;
}): WalletAccount => {
    return {
        id: id ?? randomId('wallet'),
        ownerId,
        ownerType,
        ownerName,
        currency,
        balances: {
            available: roundCurrency(available),
            pending: roundCurrency(pending),
            reserved: roundCurrency(reserved),
            currency,
        },
        transactions: [],
        lastUpdatedAt: new Date().toISOString(),
    };
};

const initialWallets = (): Record<string, WalletAccount> => ({
    ramgos_platform: createWallet({
        id: 'wallet_ramgos',
        ownerId: 'ramgos_platform',
        ownerType: 'ramgos',
        ownerName: 'Ramgos Platform',
        available: 1250.75,
        pending: 210.2,
        reserved: 320.15,
    }),
    business_demo: createWallet({
        id: 'wallet_business_demo',
        ownerId: 'business_demo',
        ownerType: 'business',
        ownerName: 'Taquería El Sabor',
        available: 680.2,
        pending: 245.4,
        reserved: 90.0,
    }),
    influencer_demo: createWallet({
        id: 'wallet_influencer_demo',
        ownerId: 'influencer_demo',
        ownerType: 'influencer',
        ownerName: 'Influencer Demo',
        available: 380.35,
        pending: 120.1,
        reserved: 0,
    }),
});

const initialKycRecords = (): Record<string, KycRecord> => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return {
        business_demo: {
            ownerId: 'business_demo',
            ownerType: 'business',
            status: 'pending',
            submittedAt: yesterday.toISOString(),
            updatedAt: yesterday.toISOString(),
            dataSnapshot: {
                taxId: '00-12345678-9',
                businessName: 'Taquería El Sabor',
            },
        },
        influencer_demo: {
            ownerId: 'influencer_demo',
            ownerType: 'influencer',
            status: 'approved',
            submittedAt: yesterday.toISOString(),
            updatedAt: now.toISOString(),
        },
    };
};

const initialWithdrawals = (): WithdrawalRequest[] => [
    {
        id: randomId('wdw'),
        accountId: 'business_demo',
        amount: 280,
        currency: 'USD',
        status: 'processing',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        processedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        destination: {
            type: 'bank',
            label: 'Cuenta Bancaria •••• 1024',
        },
        notes: 'Liquidación semanal automática',
    },
];

export const FintechProvider = ({ children }: { children: ReactNode }) => {
    // Try to get user from Auth context, but don't fail if it's not available yet
    //  This avoids circular dependency issues during provider initialization
    let user: any = null;
    try {
        const authContext = useAuth();
        user = authContext.user;
    } catch (error) {
        // AuthContext not available yet during initialization, that's okay
        // console.log('[Fintech] AuthContext not yet available, will initialize wallet later');
    }

    const [walletMap, setWalletMap] = useState<Record<string, WalletAccount>>(() => initialWallets());
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>(() => initialWithdrawals());
    const [kycRecords, setKycRecords] = useState<Record<string, KycRecord>>(() => initialKycRecords());

    const walletRef = useRef(walletMap);
    const paymentsRef = useRef(payments);
    const withdrawalsRef = useRef(withdrawals);
    const kycRef = useRef(kycRecords);

    useEffect(() => {
        walletRef.current = walletMap;
    }, [walletMap]);

    useEffect(() => {
        paymentsRef.current = payments;
    }, [payments]);

    useEffect(() => {
        withdrawalsRef.current = withdrawals;
    }, [withdrawals]);

    useEffect(() => {
        kycRef.current = kycRecords;
    }, [kycRecords]);



    const ensureWalletAccount = useCallback(
        (ownerId: string, ownerType: WalletOwnerType, ownerName: string, currency = 'USD'): WalletAccount => {
            const existing = walletRef.current[ownerId];
            if (existing) {
                return existing;
            }
            const wallet = createWallet({ ownerId, ownerType, ownerName, currency });
            setWalletMap((prev) => ({
                ...prev,
                [ownerId]: wallet,
            }));
            walletRef.current = {
                ...walletRef.current,
                [ownerId]: wallet,
            };
            return wallet;
        },
        [],
    );

    useEffect(() => {
        if (user) {
            const ownerType: WalletOwnerType =
                user.role === 'business'
                    ? 'business'
                    : user.role === 'influencer'
                        ? 'influencer'
                        : user.role === 'admin'
                            ? 'ramgos'
                            : 'consumer';
            ensureWalletAccount(user.id, ownerType, user.name);
        }
    }, [user, ensureWalletAccount]);

    const updateWallet = useCallback((ownerId: string, updater: (account: WalletAccount) => WalletAccount) => {
        setWalletMap((prev) => {
            const account = prev[ownerId];
            if (!account) {
                return prev;
            }
            const updated = updater(account);
            const next = { ...prev, [ownerId]: updated };
            walletRef.current = next;
            return next;
        });
    }, []);

    const recordWalletMovement = useCallback(
        (
            ownerId: string,
            movement: {
                type: 'credit' | 'debit';
                status: WalletBalanceKey;
                amount: number;
                description: string;
                relatedPaymentId?: string;
                metadata?: Record<string, unknown>;
            },
        ) => {
            if (movement.amount <= 0) {
                return;
            }
            ensureWalletAccount(ownerId, 'consumer', ownerId);
            updateWallet(ownerId, (account) => {
                const balances: WalletBalances = { ...account.balances };
                const factor = movement.type === 'credit' ? 1 : -1;
                const key = movement.status;
                balances[key] = roundCurrency(Math.max(balances[key] + factor * movement.amount, 0));
                const timestamp = new Date().toISOString();
                const transaction: WalletTransaction = {
                    id: randomId('wtxn'),
                    type: movement.type,
                    status: movement.status,
                    amount: roundCurrency(movement.amount),
                    currency: balances.currency,
                    description: movement.description,
                    createdAt: timestamp,
                    balanceAfter: { ...balances },
                    relatedPaymentId: movement.relatedPaymentId,
                    metadata: movement.metadata,
                };
                return {
                    ...account,
                    balances,
                    lastUpdatedAt: timestamp,
                    transactions: [transaction, ...account.transactions].slice(0, 100),
                };
            });
        },
        [ensureWalletAccount, updateWallet],
    );

    const processPayment = useCallback(
        async (input: ProcessPaymentInput): Promise<PaymentRecord> => {
            const amount = roundCurrency(input.amount);

            if (amount <= 0) {
                throw new Error('El monto del pago debe ser mayor a 0');
            }
            const currency = input.currency ?? 'USD';
            const providerKey = input.providerKey ?? 'stripe';
            const provider = getPaymentProvider(providerKey);

            ensureWalletAccount(input.sellerId, 'business', input.sellerName, currency);
            if (input.influencerId && input.influencerName) {
                ensureWalletAccount(input.influencerId, 'influencer', input.influencerName, currency);
            }

            const splitBase = calculatePaymentSplit({
                total: amount,
                currency,
                sellerId: input.sellerId,
                sellerName: input.sellerName,
                influencerId: input.influencerId,
                influencerName: input.influencerName,
                commissionRate: input.commissionRate,
                influencerRate: input.influencerRate,
                minimumCommission: input.minimumCommission,
            });

            const chargeResult = await provider.charge({
                amount,
                currency,
                paymentMethod: input.paymentMethod,
                metadata: input.metadata,
            });

            const split = applyGatewayFee(splitBase, chargeResult.providerFee);
            const status =
                chargeResult.status === 'succeeded'
                    ? 'succeeded'
                    : chargeResult.status === 'requires_action'
                        ? 'processing'
                        : 'failed';

            const paymentRecord: PaymentRecord = {
                id: chargeResult.id,
                status,
                amount,
                currency,
                provider: providerKey,
                providerFee: roundCurrency(chargeResult.providerFee),
                method: input.paymentMethod,
                split,
                gateway: chargeResult,
                metadata: input.metadata,
                description: input.description,
                createdAt: chargeResult.processedAt ?? new Date().toISOString(),
            };

            setPayments((prev) => {
                const next = [paymentRecord, ...prev].slice(0, 100);
                paymentsRef.current = next;
                return next;
            });

            if (status === 'succeeded') {
                recordWalletMovement(split.sellerId, {
                    type: 'credit',
                    status: 'pending',
                    amount: split.sellerNet,
                    description: `Venta Ramgos (${provider.displayName})`,
                    relatedPaymentId: paymentRecord.id,
                    metadata: {
                        provider: providerKey,
                        fee: chargeResult.providerFee,
                    },
                });

                recordWalletMovement('ramgos_platform', {
                    type: 'credit',
                    status: 'available',
                    amount: split.ramgosCommission,
                    description: `Comisión ${Math.round(split.commissionRate * 100)}%`,
                    relatedPaymentId: paymentRecord.id,
                    metadata: {
                        sellerId: split.sellerId,
                    },
                });

                if (split.influencerId && split.influencerAmount > 0) {
                    recordWalletMovement(split.influencerId, {
                        type: 'credit',
                        status: 'pending',
                        amount: split.influencerAmount,
                        description: `Reward influencer ${Math.round(split.influencerRate * 100)}%`,
                        relatedPaymentId: paymentRecord.id,
                        metadata: {
                            sellerId: split.sellerId,
                        },
                    });
                }
            }

            return paymentRecord;
        },
        [ensureWalletAccount, recordWalletMovement],
    );

    const previewSplit = useCallback(
        (input: Omit<PaymentSplitInput, 'total'> & { total: number }): PaymentSplit => {
            return calculatePaymentSplit(input);
        },
        [],
    );

    const requestWithdrawal = useCallback(
        (input: RequestWithdrawalInput): WithdrawalRequest => {
            const account = walletRef.current[input.accountId];
            if (!account) {
                throw new Error('Cuenta de billetera no encontrada');
            }

            const kyc = kycRef.current[input.accountId];
            if (!kyc || kyc.status !== 'approved') {
                throw new Error('La cuenta aún no cuenta con KYC aprobado');
            }

            const amount = roundCurrency(input.amount);
            if (amount <= 0) {
                throw new Error('El monto del retiro debe ser mayor a 0');
            }
            if (account.balances.available < amount) {
                throw new Error('Fondos insuficientes para el retiro');
            }

            recordWalletMovement(input.accountId, {
                type: 'debit',
                status: 'available',
                amount,
                description: 'Solicitud de retiro',
                metadata: {
                    destination: input.destination.label,
                },
            });

            recordWalletMovement(input.accountId, {
                type: 'credit',
                status: 'reserved',
                amount,
                description: 'Retiro en proceso',
            });

            const request: WithdrawalRequest = {
                id: randomId('wdw'),
                accountId: input.accountId,
                amount,
                currency: account.currency,
                status: 'pending',
                createdAt: new Date().toISOString(),
                destination: input.destination,
                notes: input.notes,
                metadata: input.metadata,
            };

            setWithdrawals((prev) => {
                const next = [request, ...prev];
                withdrawalsRef.current = next;
                return next;
            });

            return request;
        },
        [recordWalletMovement],
    );

    const releasePayment = useCallback(
        (paymentId: string): boolean => {
            const payment = paymentsRef.current.find((existing) => existing.id === paymentId);
            if (!payment || payment.status !== 'succeeded' || payment.settledAt) {
                return false;
            }

            const timestamp = new Date().toISOString();

            recordWalletMovement(payment.split.sellerId, {
                type: 'debit',
                status: 'pending',
                amount: payment.split.sellerNet,
                description: `Liberación pago ${paymentId}`,
                relatedPaymentId: paymentId,
            });

            recordWalletMovement(payment.split.sellerId, {
                type: 'credit',
                status: 'available',
                amount: payment.split.sellerNet,
                description: `Fondos disponibles ${paymentId}`,
                relatedPaymentId: paymentId,
            });

            if (payment.split.influencerAmount > 0 && payment.split.influencerId) {
                recordWalletMovement(payment.split.influencerId, {
                    type: 'debit',
                    status: 'pending',
                    amount: payment.split.influencerAmount,
                    description: `Liberación comisiones ${paymentId}`,
                    relatedPaymentId: paymentId,
                });
                recordWalletMovement(payment.split.influencerId, {
                    type: 'credit',
                    status: 'available',
                    amount: payment.split.influencerAmount,
                    description: `Comisiones disponibles ${paymentId}`,
                    relatedPaymentId: paymentId,
                });
            }

            setPayments((prev) => {
                const next = prev.map((existing) =>
                    existing.id === paymentId ? { ...existing, settledAt: timestamp } : existing
                );
                paymentsRef.current = next;
                return next;
            });

            return true;
        },
        [recordWalletMovement],
    );

    const getWalletByOwner = useCallback((ownerId: string) => walletRef.current[ownerId], []);

    const getKycStatus = useCallback(
        (ownerId: string): KycStatus => {
            const record = kycRef.current[ownerId];
            return record?.status ?? 'unverified';
        },
        [],
    );

    const submitKyc = useCallback((payload: SubmitKycPayload): KycRecord => {
        const timestamp = new Date().toISOString();
        const record: KycRecord = {
            ownerId: payload.ownerId,
            ownerType: payload.ownerType,
            status: 'pending',
            submittedAt: timestamp,
            updatedAt: timestamp,
            dataSnapshot: {
                ownerName: payload.ownerName,
                ...payload.data,
            },
        };
        setKycRecords((prev) => {
            const next = { ...prev, [payload.ownerId]: record };
            kycRef.current = next;
            return next;
        });
        return record;
    }, []);

    const updateKycStatus = useCallback((ownerId: string, status: KycStatus, notes?: string) => {
        setKycRecords((prev) => {
            const existing = prev[ownerId] ?? {
                ownerId,
                ownerType: 'consumer' as WalletOwnerType,
                status: 'unverified' as KycStatus,
            };
            const updated: KycRecord = {
                ...existing,
                status,
                reviewerNotes: notes ?? existing.reviewerNotes,
                updatedAt: new Date().toISOString(),
            };
            const next = { ...prev, [ownerId]: updated };
            kycRef.current = next;
            return next;
        });
    }, []);

    const refreshKyc = useCallback(async () => {
        if (!user?.id) {
            return;
        }
        setKycRecords((prev) => {
            const existing = prev[user.id];
            const next: KycRecord = {
                ownerId: user.id,
                ownerType: (user.role as WalletOwnerType) || 'consumer',
                status: (user.kycStatus as KycStatus) || 'unverified',
                submittedAt: existing?.submittedAt,
                updatedAt: new Date().toISOString(),
                reviewerNotes: existing?.reviewerNotes,
                dataSnapshot: {
                    ownerName: user.name,
                    email: user.email,
                },
            };
            return { ...prev, [user.id]: next };
        });
    }, [user?.email, user?.id, user?.kycStatus, user?.name, user?.role]);

    // Hydrate initially
    useEffect(() => {
        refreshKyc();
    }, [refreshKyc]);

    const providers = useMemo(() => listPaymentProviders(), []);

    const contextValue = useMemo<FintechContextType>(
        () => ({
            providers,
            wallets: Object.values(walletMap),
            payments,
            withdrawals,
            kycRecords,
            processPayment,
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
            walletMap,
            payments,
            withdrawals,
            kycRecords,
            processPayment,
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
    if (!context) {
        throw new Error('useFintech debe usarse dentro de FintechProvider');
    }
    return context;
};

export type {
    PaymentRecord,
    WalletAccount,
    WalletTransaction,
    WalletBalances,
    WithdrawalRequest,
    KycRecord,
    WalletOwnerType,
    KycStatus,
    SubmitKycPayload,
};

