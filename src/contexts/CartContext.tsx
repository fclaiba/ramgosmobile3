import React, { createContext, useContext, useState, ReactNode } from 'react';

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

export function CartProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    const addItem = (item: CartItemInput) => {
        const quantityToAdd = item.quantity && item.quantity > 0 ? item.quantity : 1;

        setItems((prev) => {
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
        setItems((prev) => prev.filter((item) => item.id !== id));
    };

    const updateQuantity = (id: number | string, quantity: number) => {
        if (quantity <= 0) {
            removeItem(id);
            return;
        }
        setItems((prev) =>
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
        setItems([]);
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
