import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
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

export type OpenEscrowOptions = {
    phase?: EscrowPhase;
};

interface EscrowContextValue {
    orders: any[];
    sellerOrders: any[];
    releaseEscrow: (orderId: string) => Promise<void>;
    confirmReceipt: (orderId: string) => Promise<void>;
    openDispute: (orderId: string, reason: string) => Promise<void>;
    isEscrowEnabled: boolean;
    isOpen: boolean;
    openEscrow: (order?: any, role?: 'buyer' | 'seller', options?: OpenEscrowOptions) => void;
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

function normalizeEscrowState(raw?: string): EscrowState {
    const s = String(raw || 'held').toLowerCase();
    if (s === 'release_scheduled' || s === 'released' || s === 'disputed' || s === 'refunded' || s === 'held') {
        return s;
    }
    if (s === 'dispute') return 'disputed';
    return 'held';
}

/** Map Convex / legacy order shapes into EscrowSheet's EscrowOrder. */
export function toEscrowOrder(raw: any): EscrowOrder | null {
    if (!raw) return null;
    if (typeof raw === 'string') return null;

    const id = String(raw.id ?? raw._id ?? '');
    if (!id) return null;

    const escrowState = normalizeEscrowState(
        raw.escrow?.state ?? raw.escrowState ?? (raw.status === 'disputed' ? 'disputed' : undefined),
    );

    const createdAt = raw.createdAt ? new Date(raw.createdAt).getTime() : Date.now();
    const releaseScheduledAt =
        raw.escrow?.releaseScheduledAt ??
        new Date(createdAt + 7 * 24 * 60 * 60 * 1000).toISOString();

    const items: EscrowOrderItem[] = Array.isArray(raw.items)
        ? raw.items.map((it: any) => ({
              listingId: String(it.listingId ?? ''),
              title: String(it.title ?? 'Producto'),
              quantity: Number(it.quantity ?? 1),
              price: Number(it.price ?? 0),
              listingType: it.listingType ?? it.type,
          }))
        : [];

    const grandTotal = Number(
        raw.totals?.grandTotal ?? raw.total ?? items.reduce((s, i) => s + i.price * i.quantity, 0),
    );

    const dispute =
        raw.dispute ??
        (escrowState === 'disputed' || raw.status === 'disputed'
            ? { reason: raw.disputeReason || 'En disputa', description: raw.disputeDescription }
            : undefined);

    return {
        id,
        status: String(raw.status ?? 'pending'),
        paymentStatus: String(
            raw.paymentStatus ??
                (['paid', 'paid_escrow', 'payment_received', 'delivered', 'completed', 'disputed'].includes(String(raw.status))
                    ? 'paid'
                    : 'pending'),
        ),
        escrow: { state: escrowState, releaseScheduledAt },
        items,
        totals: {
            grandTotal,
            currency: String(raw.totals?.currency ?? raw.currency ?? 'USD'),
        },
        dispute,
        deliveryConfirmedAt: raw.deliveryConfirmedAt,
    };
}

export function EscrowProvider({ children }: { children: React.ReactNode }) {
    const { user, sessionToken } = useAuth();
    const { isTest } = usePaymentMode();

    const [isOpen, setIsOpen] = useState(false);
    const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
    const [activeOrderFallback, setActiveOrderFallback] = useState<EscrowOrder | null>(null);
    const [role, setRole] = useState<'buyer' | 'seller'>('buyer');
    const [phase, setPhase] = useState<EscrowPhase>('status');

    const orders = useQuery(api.orders.getMyOrders, user?.id ? { sessionToken, userId: user.id } : 'skip') ?? [];
    const sellerOrders =
        useQuery(
            api.orders.getOrdersBySeller,
            user?.id ? { sessionToken, sellerId: user.id } : 'skip',
        ) ?? [];

    const orderById = useQuery(
        api.orders.getOrderById,
        isOpen && activeOrderId && sessionToken
            ? { sessionToken, orderId: activeOrderId as any }
            : 'skip',
    );

    const confirmReceiptMutation = useMutation(api.orders.confirmReceipt);
    const openDisputeMutation = useMutation(api.orders.openDispute);
    const releaseEscrowMutation = useAction(api.stripe.releaseEscrowFunds);

    const resolveRawOrder = useCallback(
        (orderOrId?: any) => {
            if (!orderOrId) return null;
            if (typeof orderOrId !== 'string') return orderOrId;
            const id = orderOrId;
            if (orderById && String((orderById as any)._id ?? (orderById as any).id) === id) {
                return orderById;
            }
            const fromBuyer = (orders as any[]).find((o) => String(o._id ?? o.id) === id);
            if (fromBuyer) return fromBuyer;
            const fromSeller = (sellerOrders as any[]).find((o) => String(o._id ?? o.id) === id);
            return fromSeller ?? null;
        },
        [orders, sellerOrders, orderById],
    );

    const activeOrder = useMemo(() => {
        if (!activeOrderId) return activeOrderFallback;
        const live = resolveRawOrder(activeOrderId);
        return toEscrowOrder(live) ?? activeOrderFallback;
    }, [activeOrderId, activeOrderFallback, resolveRawOrder]);

    // Keep sheet order fresh when Convex lists / getOrderById update
    useEffect(() => {
        if (!isOpen || !activeOrderId) return;
        const live = resolveRawOrder(activeOrderId);
        const mapped = toEscrowOrder(live);
        if (mapped) setActiveOrderFallback(mapped);
    }, [isOpen, activeOrderId, orders, sellerOrders, orderById, resolveRawOrder]);

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

    const openEscrow = (orderOrId?: any, r?: 'buyer' | 'seller', options?: OpenEscrowOptions) => {
        const raw = resolveRawOrder(orderOrId) ?? (typeof orderOrId === 'object' ? orderOrId : null);
        const mapped = toEscrowOrder(raw);
        const id =
            mapped?.id ??
            (typeof orderOrId === 'string' ? orderOrId : String(orderOrId?._id ?? orderOrId?.id ?? ''));

        if (!id && !mapped) return;

        setActiveOrderId(id || null);
        setActiveOrderFallback(mapped);
        if (r) setRole(r);
        else if (raw && user?.id) {
            setRole(String(raw.sellerId) === user.id ? 'seller' : 'buyer');
        }

        // Default: detalles de compra (status). Chat se abre desde el sheet.
        setPhase(options?.phase ?? 'status');
        setIsOpen(true);
    };

    const closeEscrow = () => {
        setIsOpen(false);
        setActiveOrderId(null);
        setActiveOrderFallback(null);
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
