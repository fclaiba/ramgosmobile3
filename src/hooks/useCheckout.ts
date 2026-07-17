import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';
import { usePoints } from '../contexts/PointsContext';
import { CartItem } from '../contexts/CartContext';
import { ShippingMethod, ShippingQuote, Order } from '../contexts/MarketplaceContext'; // We'll move these types eventually, but for now they can stay in a types file or we just use them.
// Actually, let's copy the types here to decouple from MarketplaceContext completely.

export type CheckoutShippingMethod = 'standard' | 'express' | 'pickup';

export interface CheckoutShippingDestination {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
    phone?: string;
    notes?: string;
}

export interface CheckoutShippingQuote {
    method: CheckoutShippingMethod;
    currency: 'USD';
    cost: number;
    estimatedDeliveryDays: [number, number];
    breakdown: {
        base: number;
        weight: number;
        distance: number;
        handling: number;
    };
    description: string;
}

export interface PlaceOrderPayload {
    cartItems: CartItem[];
    requestId?: string;
    shippingMethod: CheckoutShippingMethod;
    shippingDestination: CheckoutShippingDestination;
    appliedDiscount?: number;
    discountAmount?: number;
    shippingQuote?: CheckoutShippingQuote;
    paymentDetails?: {
        discountApplied: number;
        finalAmount: number;
    };
    /** Points to burn at checkout (1 pt = $0.01). Persisted via Convex redeemPoints. */
    pointsToRedeem?: number;
    stripePaymentIntentId?: string;
}

export const computeShippingQuote = (items: CartItem[], method: CheckoutShippingMethod, destinationPostalCode?: string): CheckoutShippingQuote => {
    const baseCost = method === 'express' ? 15 : method === 'standard' ? 7 : 0;
    const weight = items.reduce((sum, item) => sum + (item.shippingWeightKg || 1) * item.quantity, 0);
    const cost = method === 'pickup' ? 0 : baseCost + (weight * 2);

    return {
        method,
        currency: 'USD',
        cost,
        estimatedDeliveryDays: method === 'express' ? [1, 2] : method === 'standard' ? [3, 5] : [0, 0],
        breakdown: { base: baseCost, weight: weight * 2, distance: 0, handling: 0 },
        description: method === 'pickup' ? 'Retiro en tienda' : `Envío ${method}`
    };
};

export const getShippingOptions = (items: CartItem[], destinationPostalCode?: string) => {
    const methods: CheckoutShippingMethod[] = ['standard', 'express', 'pickup'];
    return methods.map((method) => computeShippingQuote(items, method, destinationPostalCode));
};

export const useCheckout = () => {
    const { user, sessionToken } = useAuth();
    const { progressChallenge, redeemPoints } = usePoints();
    const createOrderMutation = useMutation(api.orders.createOrder);

    const placeOrder = async (payload: PlaceOrderPayload): Promise<{ success: boolean; orders?: any[]; error?: string }> => {
        if (!user) {
            return { success: false, error: 'Debes iniciar sesión para completar la compra.' };
        }

        if (payload.cartItems.length === 0) {
            return { success: false, error: 'El carrito está vacío.' };
        }

        try {
            const itemsBySeller = new Map<string, CartItem[]>();
            payload.cartItems.forEach(item => {
                const sid = item.sellerId || 'unknown';
                if (!itemsBySeller.has(sid)) itemsBySeller.set(sid, []);
                itemsBySeller.get(sid)!.push(item);
            });

            const shippingQuote =
                payload.shippingQuote ??
                computeShippingQuote(payload.cartItems, payload.shippingMethod, payload.shippingDestination.postalCode);

            const totalSubtotal = payload.cartItems.reduce(
                (acc, i) => acc + i.price * i.quantity,
                0,
            );
            const sellerEntries = Array.from(itemsBySeller.entries());
            const shippingPerSeller = new Map<string, number>();
            let assignedShipping = 0;
            
            sellerEntries.forEach(([sid, items], idx) => {
                const sellerSubtotal = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
                const isLast = idx === sellerEntries.length - 1;
                const proportional = totalSubtotal > 0
                    ? Math.round(((sellerSubtotal / totalSubtotal) * shippingQuote.cost) * 100) / 100
                    : 0;
                const cost = isLast
                    ? Math.max(0, Math.round((shippingQuote.cost - assignedShipping) * 100) / 100)
                    : proportional;
                shippingPerSeller.set(sid, cost);
                assignedShipping = Math.round((assignedShipping + cost) * 100) / 100;
            });

            const createdOrders: any[] = [];

            for (const [sellerId, items] of sellerEntries) {
                const subtotal = items.reduce((acc, i) => acc + (i.price * i.quantity), 0);
                const orderRequestKey = payload.requestId
                    ? `${payload.requestId}_${sellerId}`
                    : `ord_${user.id}_${sellerId}_${Date.now()}`;
                const sellerShipping = shippingPerSeller.get(sellerId) ?? 0;

                const createdOrderId = await createOrderMutation({
                    sessionToken, userId: user.id,
                    sellerId: sellerId,
                    idempotencyKey: orderRequestKey,
                    items: items.map(i => ({
                        listingId: i.id as any,
                        title: i.name,
                        quantity: i.quantity,
                        price: i.price
                    })),
                    total: subtotal,
                    currency: 'USD',
                    shipping: {
                        method: payload.shippingMethod,
                        cost: sellerShipping,
                        address: payload.shippingDestination as any
                    },
                    // @ts-ignore
                    stripePaymentIntentId: payload.stripePaymentIntentId
                });

                createdOrders.push({
                    id: createdOrderId,
                    buyerId: user.id,
                    sellerId,
                    sellerName: items[0]?.sellerName || 'Vendedor',
                    items: items.map(i => ({
                        productId: String(i.id),
                        listingType: 'product',
                        title: i.name,
                        quantity: i.quantity,
                        unitPrice: i.price,
                        subtotal: i.price * i.quantity,
                        condition: i.condition || 'new',
                        sellerId,
                        sellerName: i.sellerName || 'Vendedor',
                        shippingWeightKg: i.shippingWeightKg || 1,
                    })),
                    totals: {
                        items: subtotal,
                        shipping: sellerShipping,
                        fees: 0,
                        discount: payload.paymentDetails?.discountApplied || 0,
                        grandTotal: Math.max(0, subtotal + sellerShipping - (payload.paymentDetails?.discountApplied || 0)),
                        currency: 'USD',
                    },
                    shipping: {
                        ...shippingQuote,
                        selectedAt: new Date().toISOString(),
                        destination: payload.shippingDestination,
                    },
                    escrow: {
                        state: 'held',
                        holdStartedAt: new Date().toISOString(),
                    },
                    status: 'payment_received',
                    paymentStatus: 'paid',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
            }

            // Burn points after orders succeed (Convex ledger)
            const pointsToRedeem = Math.floor(payload.pointsToRedeem || 0);
            if (pointsToRedeem > 0) {
                const redeem = await redeemPoints(
                    pointsToRedeem,
                    String(createdOrders[0]?.id || payload.requestId || ''),
                );
                if (!redeem.success) {
                    console.warn('[Checkout] points redeem failed:', redeem.message);
                }
            }

            // ponytail: weekly purchase challenge
            void progressChallenge('weekly_purchase', 1);

            return { success: true, orders: createdOrders };

        } catch (err: any) {
            console.error("Order Failed:", err);
            return { success: false, error: err.message || 'Error al procesar la orden.' };
        }
    };

    return { placeOrder, getShippingOptions, computeShippingQuote };
};
