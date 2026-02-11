import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';
import type { Order } from './MarketplaceContext';
import { useMarketplace } from './MarketplaceContext';

export type EscrowPhase = 'status' | 'dispute_init' | 'chat' | 'resolution';

interface EscrowContextType {
    // State
    isOpen: boolean;
    activeOrderId: string | null;
    phase: EscrowPhase;
    activeOrder: Order | undefined;
    role: 'buyer' | 'seller';

    // Actions
    openEscrow: (orderId: string, role: 'buyer' | 'seller', initialPhase?: EscrowPhase) => void;
    closeEscrow: () => void;
    setPhase: (phase: EscrowPhase) => void;
}

const EscrowContext = createContext<EscrowContextType | undefined>(undefined);

export function EscrowProvider({ children }: { children: ReactNode }) {
    const { orders } = useMarketplace();
    const [isOpen, setIsOpen] = useState(false);
    const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
    const [phase, setPhase] = useState<EscrowPhase>('status');
    const [role, setRole] = useState<'buyer' | 'seller'>('buyer');

    const activeOrder = useMemo(() =>
        orders.find(o => o.id === activeOrderId),
        [orders, activeOrderId]
    );

    const openEscrow = (orderId: string, userRole: 'buyer' | 'seller', initialPhase: EscrowPhase = 'status') => {
        setActiveOrderId(orderId);
        setRole(userRole);
        setPhase(initialPhase);
        setIsOpen(true);
    };

    const closeEscrow = () => {
        setIsOpen(false);
        // Optional: Reset state after animation
        setTimeout(() => {
            setActiveOrderId(null);
            setPhase('status');
        }, 300);
    };

    const value = {
        isOpen,
        activeOrderId,
        phase,
        activeOrder,
        role,
        openEscrow,
        closeEscrow,
        setPhase,
    };

    return (
        <EscrowContext.Provider value={value}>
            {children}
        </EscrowContext.Provider>
    );
}

export const useEscrow = () => {
    const context = useContext(EscrowContext);
    if (context === undefined) {
        throw new Error('useEscrow must be used within an EscrowProvider');
    }
    return context;
};
