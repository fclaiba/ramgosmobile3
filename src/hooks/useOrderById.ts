import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';

export function useOrderById(orderId?: string) {
    const { user } = useAuth();
    
    // We fetch both buyer and seller orders and find the right one.
    // In a real app, you would add an api.orders.getOrderById endpoint to Convex.
    const rawOrders = useQuery(api.orders.getMyOrders, { userId: user?.id }) || [];
    const rawSales = useQuery(api.orders.getOrdersBySeller, { sellerId: user?.id }) || [];
    
    return useMemo(() => {
        if (!orderId) return undefined;
        const all = [...rawOrders, ...rawSales];
        const rawOrder = all.find(o => o._id === orderId);
        if (!rawOrder) return undefined;
        
        // Adapt to legacy Order structure expected by UI components
        return {
            ...rawOrder,
            id: rawOrder._id,
            buyerId: rawOrder.userId,
            totals: { grandTotal: rawOrder.total },
            shipping: rawOrder.shipping || { destination: {} },
            items: rawOrder.items.map((i: any) => ({ ...i, productId: i.listingId })),
            escrow: {
                state: rawOrder.escrowState || 'released',
                holdStartedAt: rawOrder.createdAt,
            }
        };
    }, [orderId, rawOrders, rawSales]);
}
