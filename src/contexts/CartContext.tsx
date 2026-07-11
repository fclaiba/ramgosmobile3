import React, { createContext, useContext, useState } from 'react';

export interface CartItem {
    id: string;
    name: string;
    price: number;
    image: string;
    type: string;
    location?: string;
    sellerId?: string;
    sellerName?: string;
    condition?: string;
    shippingWeightKg?: number;
    shippingDimensionsCm?: { length: number; width: number; height: number };
    distanceKm?: number;
    quantity: number;
}

export interface CartContextData {
    items: CartItem[];
    isOpen: boolean;
    addItem: (item: CartItem) => void;
    removeItem: (id: string) => void;
    updateQuantity: (id: string, quantity: number) => void;
    clearCart: () => void;
    openCart: () => void;
    closeCart: () => void;
    totalItems: number;
    totalPrice: number;
}

const CartContext = createContext<CartContextData | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    const addItem = (item: CartItem) => {
        setItems(prev => {
            const existing = prev.find(i => i.id === item.id);
            if (existing) {
                return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + (item.quantity || 1) } : i);
            }
            return [...prev, { ...item, quantity: item.quantity || 1 }];
        });
    };

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
    };

    const updateQuantity = (id: string, quantity: number) => {
        if (quantity < 1) {
            removeItem(id);
            return;
        }
        setItems(prev => prev.map(i => i.id === id ? { ...i, quantity } : i));
    };

    const clearCart = () => setItems([]);

    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return (
        <CartContext.Provider value={{
            items,
            isOpen,
            addItem,
            removeItem,
            updateQuantity,
            clearCart,
            openCart: () => setIsOpen(true),
            closeCart: () => setIsOpen(false),
            totalItems,
            totalPrice
        }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
}