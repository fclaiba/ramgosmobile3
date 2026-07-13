import React, { createContext, useContext, useState } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from './AuthContext';
import { usePaymentMode } from './PaymentModeContext';

export type EscrowState = 'held' | 'release_scheduled' | 'released' | 'disputed' | 'refunded';
export type EscrowPhase = 'status' | 'dispute_init' | 'chat';

export interface EscrowOrderItem {
    listingId: string;
    title: string;
    quantity: number;
    price: number;
    listingType?: string;
}

export interface EscrowOrder {
    id: string;
    status: string;
    paymentStatus: string;
    escrow: {
        state: EscrowState;
        releaseScheduledAt?: string;
    };
    items: EscrowOrderItem[];
    totals: {
        grandTotal: number;
        currency: string;
    };
    dispute?: {
        reason: string;
        description?: string;
    };
    deliveryConfirmedAt?: string;
}

interface EscrowContextValue {
    orders: any[];
    sellerOrders: any[];
    releaseEscrow: (orderId: string) => Promise<void>;
    confirmReceipt: (orderId: string) => Promise<void>;
    openDispute: (orderId: string, reason: string) => Promise<void>;
    isEscrowEnabled: boolean;
    // Legacy interface for EscrowSheet compatibility
    isOpen: boolean;
    openEscrow: (order?: any, role?: 'buyer' | 'seller') => void;
    closeEscrow: () => void;
    activeOrder: EscrowOrder | null;
    role: 'buyer' | 'seller';
    phase: EscrowPhase;
    setPhase: (phase: EscrowPhase) => void;
}

const EscrowContext = createContext<EscrowContextValue>({
    orders: [],
    sellerOrders: [],
    releaseEscrow: async () => {},
    confirmReceipt: async () => {},
    openDispute: async () => {},
    isEscrowEnabled: false,
    isOpen: false,
    openEscrow: () => {},
    closeEscrow: () => {},
    activeOrder: null,
    role: 'buyer',
    phase: 'status',
    setPhase: () => {},
});

export function EscrowProvider({ children }: { children: React.ReactNode }) {
    const { user, sessionToken } = useAuth();
    const { isTest } = usePaymentMode();

    const [isOpen, setIsOpen] = useState(false);
    const [activeOrder, setActiveOrder] = useState<EscrowOrder | null>(null);
    const [role, setRole] = useState<'buyer' | 'seller'>('buyer');
    const [phase, setPhase] = useState<EscrowPhase>('status');

    const orders = useQuery(api.orders.getMyOrders, user?.id ? { sessionToken, userId: user.id } : "skip") ?? [];
    const sellerOrders = useQuery(api.orders.getOrdersBySeller, user?.id ? { sellerId: user.id } : "skip") ?? [];

    const confirmReceiptMutation = useMutation(api.orders.confirmReceipt);
    const openDisputeMutation = useMutation(api.orders.openDispute);
    const releaseEscrowMutation = useAction(api.stripe.releaseEscrowFunds);

    const confirmReceipt = async (orderId: string) => {
        if (!user?.id) throw new Error('Sesión no válida');
        await confirmReceiptMutation({ orderId: orderId as any, sessionToken, userId: user.id });
    };

    const openDispute = async (orderId: string, reason: string) => {
        if (!user?.id) throw new Error('Sesión no válida');
        await openDisputeMutation({ orderId: orderId as any, reason, sessionToken, userId: user.id });
    };

    const releaseEscrow = async (orderId: string) => {
        if (!user?.id) throw new Error('Sesión no válida');
        await releaseEscrowMutation({ orderId: orderId as any, sessionToken, userId: user.id });
    };

    const openEscrow = (order?: any, r?: 'buyer' | 'seller') => {
        if (order) setActiveOrder(order);
        if (r) setRole(r);
        setPhase('status');
        setIsOpen(true);
    };

    const closeEscrow = () => {
        setIsOpen(false);
        setActiveOrder(null);
        setPhase('status');
    };

    const value: EscrowContextValue = {
        orders,
        sellerOrders,
        releaseEscrow,
        confirmReceipt,
        openDispute,
        isEscrowEnabled: isTest,
        isOpen,
        openEscrow,
        closeEscrow,
        activeOrder,
        role,
        phase,
        setPhase,
    };

    return <EscrowContext.Provider value={value}>{children}</EscrowContext.Provider>;
}

export function useEscrow() {
    return useContext(EscrowContext);
}