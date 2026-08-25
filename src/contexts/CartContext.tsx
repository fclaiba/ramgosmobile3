import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useToast } from './ToastContext';
import { sessionTokenStore } from '../services/auth/sessionTokenStore';

/** Carrito de invitado persistido entre arranques de la app. */
const GUEST_CART_KEY = '@ramgos/cart/guest';

// FASE 3: convex/cart.ts es la única fuente de verdad para usuarios autenticados.
// Este contexto es solo una capa reactiva: lee con useQuery y escribe con mutations,
// pasando siempre sessionToken. No duplica el estado persistente en local/AsyncStorage.
//
// Carrito GUEST (sin sesión): se persiste en AsyncStorage y se vuelca al servidor
// al iniciar sesión. Antes vivía sólo en memoria y se perdía entero justo en el
// paso de pagar, que es donde `gateCheckout` manda al login.

export interface CartItem {
    id: string;
    /** Id del documento en la tabla `cart` (solo para items del server). */
    cartItemId?: string;
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
    referralCode?: string;
    /** Post que originó la venta, cuando el item entró desde el feed social. */
    sourcePostId?: string;
}

/**
 * Si agregar un producto desde una superficie de CONTENIDO (feed, loops) abre
 * el carrito al instante.
 *
 * Estaba en `true` implícito: cada compra por impulso sacaba al usuario del
 * scroll justo cuando estaba consumiendo. El producto se agrega igual, con la
 * misma atribución al creador (`snapshot.sourcePostId`); lo único que cambia es
 * que el aviso queda en el toast y en el badge del nav. Ponerlo en `true`
 * restaura el comportamiento anterior en las dos superficies a la vez.
 */
export const OPEN_CART_AFTER_ADD = false;

export interface CartContextData {
    items: CartItem[];
    isOpen: boolean;
    isLoading: boolean;
    addItem: (item: CartItem) => Promise<void>;
    removeItem: (id: string) => void;
    updateQuantity: (id: string, quantity: number) => void;
    clearCart: () => void;
    openCart: () => void;
    closeCart: () => void;
    totalItems: number;
    totalPrice: number;
    addPostProduct: (postId: string, quantity?: number) => Promise<void>;
    addDmProduct: (messageId: string, quantity?: number) => Promise<void>;
}

const CartContext = createContext<CartContextData | null>(null);

const VALID_TYPES = ['product', 'service', 'bono', 'event', 'subscription'] as const;
type SnapshotType = (typeof VALID_TYPES)[number];

const toSnapshotType = (type: string | undefined): SnapshotType =>
    VALID_TYPES.includes(type as SnapshotType) ? (type as SnapshotType) : 'product';

const toSnapshotCondition = (condition: string | undefined): 'new' | 'used' | undefined =>
    condition === 'new' || condition === 'used' ? condition : undefined;

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const { show } = useToast();

    // CartProvider está por fuera de AuthProvider en App.tsx, así que el token
    // llega vía este store (lo escribe AuthContext al cambiar la sesión).
    const sessionToken = useSyncExternalStore(
        sessionTokenStore.subscribe,
        sessionTokenStore.get,
        sessionTokenStore.get,
    );
    const isAuthenticated = !!sessionToken;

    /**
     * Carrito de invitado.
     *
     * Antes vivía sólo en memoria y no se mergeaba: el usuario armaba el
     * carrito sin sesión, tocaba pagar, `gateCheckout` lo mandaba a `Login`, y
     * al volver autenticado `items` pasaba a `serverItems` — **vacío**. El
     * embudo de conversión se perdía entero, justo en el paso de pagar.
     *
     * Ahora persiste en AsyncStorage (sobrevive a que la app se cierre en el
     * medio del login social, que abre el navegador) y se vuelca al servidor
     * apenas hay sesión.
     */
    const [guestItems, setGuestItems] = useState<CartItem[]>([]);
    const [mergingGuestCart, setMergingGuestCart] = useState(false);
    /** Evita que el merge corra dos veces si el efecto se re-dispara. */
    const mergeStartedRef = useRef(false);

    // Rehidratar el carrito de invitado al arrancar.
    useEffect(() => {
        let cancelled = false;
        AsyncStorage.getItem(GUEST_CART_KEY)
            .then((raw) => {
                if (cancelled || !raw) return;
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) setGuestItems(parsed);
            })
            .catch(() => {
                // Un carrito de invitado corrupto no puede impedir usar la app.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Persistir cada cambio mientras no haya sesión.
    useEffect(() => {
        if (isAuthenticated) return;
        AsyncStorage.setItem(GUEST_CART_KEY, JSON.stringify(guestItems)).catch(() => {});
    }, [guestItems, isAuthenticated]);

    const serverCart = useQuery(
        api.cart.getMyCart,
        isAuthenticated ? { sessionToken } : 'skip',
    );

    const addToCartMutation = useMutation(api.cart.addToCart);
    const updateQuantityMutation = useMutation(api.cart.updateCartQuantity);
    const removeFromCartMutation = useMutation(api.cart.removeFromCart);
    const clearCartMutation = useMutation(api.cart.clearCart);

    const addPostProductToCartMutation = useMutation(api.commerce.addPostProductToCart);
    const addDmProductToCartMutation = useMutation(api.commerce.addDmProductToCart);

    const serverItems = useMemo<CartItem[]>(() => {
        if (!serverCart) return [];
        return serverCart.map((row: any): CartItem => {
            const snapshot = row.snapshot ?? {};
            const listing = row.listing;
            return {
                id: row.listingId,
                cartItemId: row._id,
                // El listing vivo manda; la snapshot es respaldo (items virtuales o listings borrados).
                name: listing?.title ?? snapshot.title ?? '',
                price: listing?.price ?? snapshot.price ?? 0,
                image: listing?.images?.[0]?.url ?? listing?.images?.[0] ?? listing?.image ?? snapshot.image ?? '',
                type: listing?.type ?? snapshot.type ?? 'product',
                location: snapshot.location,
                sellerId: listing?.sellerId ?? snapshot.sellerId,
                sellerName: snapshot.sellerName,
                condition: snapshot.condition,
                shippingWeightKg: snapshot.shippingWeightKg,
                shippingDimensionsCm: snapshot.shippingDimensionsCm,
                distanceKm: snapshot.distanceKm,
                quantity: row.quantity,
                referralCode: snapshot.referralCode,
            };
        });
    }, [serverCart]);

    /**
     * Volcado del carrito de invitado al servidor tras iniciar sesión.
     *
     * Se espera a que `serverCart` haya cargado (`!== undefined`) para no
     * competir con la query inicial. Cada item se agrega con la mutation
     * normal, así el servidor reconstruye el snapshot desde la base y revalida
     * stock — el precio del cliente no se confía, igual que en `addItem`.
     *
     * El almacenamiento local se limpia SIEMPRE al terminar, incluso si algún
     * item falló: si no, un listing borrado dejaría el carrito de invitado
     * reintentando para siempre en cada login.
     */
    useEffect(() => {
        if (!isAuthenticated || serverCart === undefined) return;
        if (guestItems.length === 0 || mergeStartedRef.current) return;

        mergeStartedRef.current = true;
        setMergingGuestCart(true);

        (async () => {
            let merged = 0;
            const failed: string[] = [];
            for (const item of guestItems) {
                try {
                    await addToCartMutation({
                        sessionToken,
                        listingId: item.id,
                        quantity: item.quantity || 1,
                        snapshot: {
                            title: item.name,
                            price: item.price,
                            image: item.image || undefined,
                            sellerId: item.sellerId,
                            type: toSnapshotType(item.type),
                            location: item.location,
                            sellerName: item.sellerName,
                            condition: toSnapshotCondition(item.condition),
                            shippingWeightKg: item.shippingWeightKg,
                            shippingDimensionsCm: item.shippingDimensionsCm,
                            distanceKm: item.distanceKm,
                            referralCode: item.referralCode,
                        },
                        attribution: (item.referralCode || item.sourcePostId)
                            ? { referralCode: item.referralCode, sourcePostId: item.sourcePostId }
                            : undefined,
                    });
                    merged += 1;
                } catch {
                    failed.push(item.name);
                }
            }

            setGuestItems([]);
            await AsyncStorage.removeItem(GUEST_CART_KEY).catch(() => {});
            setMergingGuestCart(false);

            if (failed.length > 0) {
                show(
                    `No pudimos sumar ${failed.length === 1 ? `"${failed[0]}"` : `${failed.length} artículos`} a tu carrito.`,
                    'warning',
                );
            } else if (merged > 0) {
                show('Recuperamos tu carrito.', 'success');
            }
        })();
    }, [isAuthenticated, serverCart, guestItems, sessionToken, addToCartMutation, show]);

    const items = isAuthenticated ? serverItems : guestItems;
    const isLoading = (isAuthenticated && serverCart === undefined) || mergingGuestCart;

    const reportError = (error: any, fallback: string) => {
        const message = typeof error?.message === 'string' && error.message.includes('Uncaught Error: ')
            ? error.message.split('Uncaught Error: ')[1].split('\n')[0].trim()
            : fallback;
        show(message, 'error');
    };

    const addItem = async (item: CartItem): Promise<void> => {
        const quantity = item.quantity || 1;
        if (isAuthenticated) {
            try {
                await addToCartMutation({
                    sessionToken,
                    listingId: item.id,
                    quantity,
                    // Solo se usa server-side para items "virtual:"; los listings reales
                    // se snapshotean desde la DB (el precio del cliente no se confía).
                    snapshot: {
                        title: item.name,
                        price: item.price,
                        image: item.image || undefined,
                        sellerId: item.sellerId,
                        type: toSnapshotType(item.type),
                        location: item.location,
                        sellerName: item.sellerName,
                        condition: toSnapshotCondition(item.condition),
                        shippingWeightKg: item.shippingWeightKg,
                        shippingDimensionsCm: item.shippingDimensionsCm,
                        distanceKm: item.distanceKm,
                        referralCode: item.referralCode,
                    },
                    // El `snapshot` se descarta para listings reales (el servidor
                    // lo reconstruye desde la DB), así que la atribución tiene que
                    // viajar acá o se pierde. Es el camino del deep link
                    // `/ref/CODE?bono=ID`: sin esto el influencer no cobraba.
                    attribution: (item.referralCode || item.sourcePostId)
                        ? {
                              referralCode: item.referralCode,
                              sourcePostId: item.sourcePostId,
                          }
                        : undefined,
                });
            } catch (e) {
                reportError(e, 'No se pudo agregar al carrito.');
                throw e;
            }
            return;
        }
        setGuestItems(prev => {
            const existing = prev.find(i => i.id === item.id);
            if (existing) {
                return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + quantity } : i);
            }
            return [...prev, { ...item, quantity }];
        });
    };

    const addPostProduct = async (postId: string, quantity: number = 1): Promise<void> => {
        if (!isAuthenticated) {
            show('Iniciá sesión para comprar', 'warning');
            return;
        }
        try {
            await addPostProductToCartMutation({
                sessionToken,
                postId: postId as any,
                quantity,
            });
        } catch (e) {
            reportError(e, 'No se pudo agregar al carrito.');
            throw e;
        }
    };

    const addDmProduct = async (messageId: string, quantity: number = 1): Promise<void> => {
        if (!isAuthenticated) {
            show('Iniciá sesión para comprar', 'warning');
            return;
        }
        try {
            await addDmProductToCartMutation({
                sessionToken,
                messageId: messageId as any,
                quantity,
            });
        } catch (e) {
            reportError(e, 'No se pudo agregar al carrito.');
            throw e;
        }
    };

    const removeItem = (id: string) => {
        if (isAuthenticated) {
            const target = serverItems.find(i => i.id === id);
            if (!target?.cartItemId) return;
            removeFromCartMutation({ sessionToken, cartItemId: target.cartItemId as any })
                .catch((e) => reportError(e, 'No se pudo eliminar el producto.'));
            return;
        }
        setGuestItems(prev => prev.filter(i => i.id !== id));
    };

    const updateQuantity = (id: string, quantity: number) => {
        if (isAuthenticated) {
            const target = serverItems.find(i => i.id === id);
            if (!target?.cartItemId) return;
            updateQuantityMutation({ sessionToken, cartItemId: target.cartItemId as any, quantity })
                .catch((e) => reportError(e, 'No se pudo actualizar la cantidad.'));
            return;
        }
        if (quantity < 1) {
            setGuestItems(prev => prev.filter(i => i.id !== id));
            return;
        }
        setGuestItems(prev => prev.map(i => i.id === id ? { ...i, quantity } : i));
    };

    const clearCart = () => {
        if (isAuthenticated) {
            clearCartMutation({ sessionToken })
                .catch((e) => reportError(e, 'No se pudo vaciar el carrito.'));
            return;
        }
        setGuestItems([]);
    };

    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return (
        <CartContext.Provider value={{
            items,
            isOpen,
            isLoading,
            addItem,
            addPostProduct,
            addDmProduct,
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
