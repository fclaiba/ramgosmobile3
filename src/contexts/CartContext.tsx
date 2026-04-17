import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { storage } from '../services/auth/storageAdapter';
import { useAuth } from './AuthContext';

export interface CartItem {
    id: number | string;
    name: string;
    price: number;
    quantity: number;
    image: string;
    type: 'product' | 'bono' | 'event' | 'subscription';
    subscriptionTier?: 'pro' | 'business';
    location?: string;
    sellerId?: string;
    sellerName?: string;
    condition?: 'new' | 'used';
    shippingWeightKg?: number;
    shippingDimensionsCm?: { length: number; width: number; height: number };
    distanceKm?: number;
    referralCode?: string;
}

type CartItemInput = Omit<CartItem, 'quantity'> & { quantity?: number };

interface CartContextType {
    items: CartItem[];
    addItem: (item: CartItemInput) => void;
    removeItem: (id: number | string) => void;
    updateQuantity: (id: number | string, quantity: number) => void;
    clearCart: () => void;
    totalItems: number;
    totalPrice: number;
    isOpen: boolean;
    openCart: () => void;
    closeCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const CART_STORAGE_KEY = '@ramgos/cart/v1';

export function CartProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [localItems, setLocalItems] = useState<CartItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [hasHydrated, setHasHydrated] = useState(false);
    const backendCart = useQuery(
        api.cart.getMyCart,
        user ? { actorId: user.id as any, userId: user.id } : 'skip',
    ) ?? [];
    const addToCartMutation = useMutation(api.cart.addToCart);
    const removeFromCartMutation = useMutation(api.cart.removeFromCart);
    const updateCartQuantityMutation = useMutation(api.cart.updateCartQuantity);
    const clearCartMutation = useMutation(api.cart.clearCart);

    // Cart source of truth: local persisted state.
    useEffect(() => {
        (async () => {
            try {
                const raw = await storage.getItem(CART_STORAGE_KEY);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    setLocalItems(parsed);
                }
            } catch (error) {
                console.error('Failed to hydrate cart', error);
            } finally {
                setHasHydrated(true);
            }
        })();
    }, []);

    useEffect(() => {
        if (user) return;
        if (!hasHydrated) return;
        storage.setItem(CART_STORAGE_KEY, JSON.stringify(localItems)).catch((error) => {
            console.error('Failed to persist cart', error);
        });
    }, [user, hasHydrated, localItems]);

    const mapBackendItem = (item: any): CartItem => {
        const isVirtual = String(item.listingId).startsWith('virtual:');
        const virtualParts = String(item.listingId).split(':');
        const virtualType = (item.snapshot?.type ?? virtualParts[1] ?? 'product') as CartItem['type'];
        const virtualId = virtualParts.slice(2).join(':');
        const listing = item.listing;

        return {
            id: isVirtual ? virtualId : item.listingId,
            name: item.snapshot?.title || listing?.title || 'Item',
            price: Number(item.snapshot?.price ?? listing?.price ?? 0),
            quantity: item.quantity,
            image: item.snapshot?.image || listing?.image || '',
            type: isVirtual ? virtualType : 'product',
            subscriptionTier: item.snapshot?.subscriptionTier,
            location: item.snapshot?.location,
            sellerId: item.snapshot?.sellerId || listing?.sellerId,
            sellerName: item.snapshot?.sellerName,
            condition: item.snapshot?.condition,
            shippingWeightKg: item.snapshot?.shippingWeightKg,
            shippingDimensionsCm: item.snapshot?.shippingDimensionsCm,
            distanceKm: item.snapshot?.distanceKm,
            referralCode: item.snapshot?.referralCode,
        };
    };

    const items = useMemo(() => {
        if (!user) return localItems;
        return backendCart.map(mapBackendItem);
    }, [user, localItems, backendCart]);

    const findBackendRow = (id: number | string) => {
        const normalized = String(id);
        return backendCart.find((row: any) => {
            if (String(row.listingId).startsWith('virtual:')) {
                const virtualId = String(row.listingId).split(':').slice(2).join(':');
                return virtualId === normalized;
            }
            return String(row.listingId) === normalized;
        });
    };

    const toBackendListingId = (item: CartItemInput) =>
        item.type === 'product'
            ? String(item.id)
            : `virtual:${item.type}:${String(item.id)}`;

    const addItem = (item: CartItemInput) => {
        const quantityToAdd = item.quantity && item.quantity > 0 ? item.quantity : 1;
        if (user) {
            const listingId = toBackendListingId(item);

            (async () => {
                try {
                    if (item.type === 'subscription') {
                        const subscriptionRows = backendCart.filter((row: any) => row.snapshot?.type === 'subscription');
                        await Promise.all(subscriptionRows.map((row: any) => removeFromCartMutation({
                            actorId: user.id as any,
                            userId: user.id,
                            cartItemId: row._id,
                        })));
                    }

                    await addToCartMutation({
                        actorId: user.id as any,
                        userId: user.id,
                        listingId,
                        quantity: item.type === 'subscription' ? 1 : quantityToAdd,
                        mutationKey: `cart_add_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                        snapshot: {
                            title: item.name,
                            price: item.price,
                            image: item.image,
                            sellerId: item.sellerId,
                            type: item.type,
                            subscriptionTier: item.subscriptionTier,
                            location: item.location,
                            sellerName: item.sellerName,
                            condition: item.condition,
                            shippingWeightKg: item.shippingWeightKg,
                            shippingDimensionsCm: item.shippingDimensionsCm,
                            distanceKm: item.distanceKm,
                            referralCode: item.referralCode,
                        },
                    });
                } catch (error) {
                    console.error('Failed to add backend cart item', error);
                }
            })();
            setIsOpen(true);
            return;
        }

        setLocalItems((prev) => {
            // Prevent multiple subscriptions: if adding a subscription, remove any existing one first
            let newItems = [...prev];
            if (item.type === 'subscription') {
                newItems = newItems.filter(i => i.type !== 'subscription');
            }

            const existingItem = newItems.find((i) => i.id === item.id);
            if (existingItem) {
                // If it's a subscription, don't increase quantity beyond 1
                if (item.type === 'subscription') {
                    return newItems;
                }
                return newItems.map((i) =>
                    i.id === item.id
                        ? { ...i, quantity: i.quantity + quantityToAdd }
                        : i
                );
            }
            const newItem: CartItem = {
                ...item,
                quantity: item.type === 'subscription' ? 1 : quantityToAdd,
            };
            return [...newItems, newItem];
        });
        setIsOpen(true);
    };

    const removeItem = (id: number | string) => {
        if (user) {
            const row = findBackendRow(id);
            if (!row) return;
            removeFromCartMutation({
                actorId: user.id as any,
                userId: user.id,
                cartItemId: row._id,
            }).catch((error) => {
                console.error('Failed to remove backend cart item', error);
            });
            return;
        }
        setLocalItems((prev) => prev.filter((item) => item.id !== id));
    };

    const updateQuantity = (id: number | string, quantity: number) => {
        if (user) {
            const row = findBackendRow(id);
            if (!row) return;
            updateCartQuantityMutation({
                actorId: user.id as any,
                userId: user.id,
                cartItemId: row._id,
                quantity,
            }).catch((error) => {
                console.error('Failed to update backend cart quantity', error);
            });
            return;
        }
        if (quantity <= 0) {
            removeItem(id);
            return;
        }
        setLocalItems((prev) =>
            prev.map((item) => {
                if (item.id === id) {
                    if (item.type === 'subscription') return { ...item, quantity: 1 };
                    return { ...item, quantity };
                }
                return item;
            })
        );
    };

    const clearCart = () => {
        if (user) {
            clearCartMutation({
                actorId: user.id as any,
                userId: user.id,
            }).catch((error) => {
                console.error('Failed to clear backend cart', error);
            });
            return;
        }
        setLocalItems([]);
    };

    const openCart = () => setIsOpen(true);
    const closeCart = () => setIsOpen(false);

    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    return (
        <CartContext.Provider
            value={{
                items,
                addItem,
                removeItem,
                updateQuantity,
                clearCart,
                totalItems,
                totalPrice,
                isOpen,
                openCart,
                closeCart,
            }}
        >
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart must be used within CartProvider');
    }
    return context;
}
