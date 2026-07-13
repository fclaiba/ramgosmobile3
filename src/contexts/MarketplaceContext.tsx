// Opción A — listings/órdenes reales desde convex/listings.ts + convex/orders.ts.
// getShippingOptions conserva estimación local (no hay API de envíos en backend).
import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { CartItem } from './CartContext';
import { useAuth } from './AuthContext';

export const MARKETPLACE_ESCROW_RELEASE_DAYS = 10;

export type ShippingMethod = 'standard' | 'express' | 'pickup';

export interface ShippingQuote {
    method: ShippingMethod;
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

export interface Product {
    id: string;
    slug?: string;
    title: string;
    description?: string;
    condition?: 'new' | 'used';
    damageDescription?: string;
    price: number;
    currency?: 'USD';
    stock?: number;
    status?: string;
    category?: string;
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
    location?: {
        lat: number;
        lng: number;
        name: string;
        address: string;
        distanceKm: number;
    };
    seller?: {
        id: string;
        name: string;
        type?: string;
        rating?: number;
        avatar?: string;
        responseTimeHours?: number;
    };
    images?: Array<{ id: string; url: string; isPrimary?: boolean }>;
    shippingProfile?: {
        weightKg?: number;
        dimensionsCm?: { length: number; width: number; height: number };
        [key: string]: unknown;
    };
    metrics?: { views: number; favorites: number; orders: number };
}

export interface Order {
    id: string;
    sellerId: string;
    buyerId?: string;
    paymentStatus?: string;
    status?: string;
    deliveryConfirmedAt?: string;
    escrow?: {
        state?: string;
        releaseScheduledAt?: string;
        releasedAt?: string;
    };
    total?: number;
    totals?: { grandTotal: number };
    items?: Array<Record<string, unknown>>;
}

export interface MarketplaceContextValue {
    listings: Product[];
    categories: string[];
    orders: Order[];
    searchListings: (query?: string) => Product[];
    getShippingOptions: (items: CartItem[], destinationPostalCode?: string) => ShippingQuote[];
    createProduct: (input: Record<string, unknown>) => Promise<{ success: boolean; productId?: string; error?: string }>;
    getProductById: (productId: string) => Product | undefined;
    addToWishlist: (productId: string, referralLink?: string) => void;
}

const PAID_STATUSES = new Set([
    'payment_received',
    'paid_escrow',
    'awaiting_shipment',
    'in_transit',
    'delivered',
    'completed',
]);

function mapListingToProduct(p: any): Product {
    return {
        ...p,
        id: String(p._id ?? p.id),
        metrics: p.metrics ?? {
            views: p.views ?? 0,
            favorites: p.favoriteCount ?? 0,
            orders: p.orderCount ?? 0,
        },
        seller: p.sellerId
            ? {
                  id: p.sellerId,
                  name: p.seller?.name || 'Unknown',
                  type: p.seller?.type || 'individual',
                  rating: p.seller?.sellerRating || 0,
                  avatar: p.seller?.avatar,
              }
            : undefined,
        shippingProfile: p.shippingProfile ?? { weightKg: 1 },
        images:
            p.images ??
            [
                ...(p.image ? [{ id: 'main', url: p.image, isPrimary: true }] : []),
                ...(p.gallery
                    ? p.gallery.map((url: string, idx: number) => ({
                          id: `gal_${idx}`,
                          url,
                          isPrimary: false,
                      }))
                    : []),
            ],
    };
}

function mapOrder(o: any): Order {
    return {
        id: String(o._id),
        sellerId: o.sellerId,
        buyerId: o.userId,
        paymentStatus: PAID_STATUSES.has(o.status) ? 'paid' : o.status,
        status: o.status,
        deliveryConfirmedAt: o.deliveryConfirmedAt,
        escrow: o.escrow,
        total: o.total,
        totals: { grandTotal: o.total ?? 0 },
        items: o.items,
    };
}

const defaultShippingQuote = (method: ShippingMethod): ShippingQuote => ({
    method,
    currency: 'USD',
    cost: method === 'express' ? 12 : method === 'pickup' ? 0 : 6,
    estimatedDeliveryDays: method === 'express' ? [1, 3] : [3, 7],
    breakdown: { base: 4, weight: 1, distance: 1, handling: 0 },
    description: method === 'pickup' ? 'Retiro en local' : 'Envío estándar',
});

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

function useMarketplaceState(): MarketplaceContextValue {
    const { user, sessionToken } = useAuth();

    const liveProducts = useQuery(api.listings.getFeed) ?? [];
    const sellerOrders = useQuery(
        api.orders.getOrdersBySeller,
        sessionToken ? { sessionToken } : 'skip',
    );
    const buyerOrders = useQuery(
        api.orders.getMyOrders,
        sessionToken ? { sessionToken } : 'skip',
    );

    const createListingMutation = useMutation(api.listings.createListing);
    const addFavoriteMutation = useMutation(api.favorites.addFavorite);

    const listings = useMemo(
        () =>
            Array.isArray(liveProducts)
                ? liveProducts.filter((p: any) => p && p._id).map(mapListingToProduct)
                : [],
        [liveProducts],
    );

    const categories = useMemo(
        () => [...new Set(listings.map((p) => p.category).filter(Boolean))] as string[],
        [listings],
    );

    const orders = useMemo(() => {
        const merged = [...(sellerOrders ?? []), ...(buyerOrders ?? [])];
        const byId = new Map<string, Order>();
        for (const o of merged) {
            byId.set(String(o._id), mapOrder(o));
        }
        return [...byId.values()];
    }, [sellerOrders, buyerOrders]);

    const searchListings = useCallback(
        (query?: string) => {
            if (!query?.trim()) return listings;
            const q = query.toLowerCase();
            return listings.filter(
                (p) =>
                    p.title.toLowerCase().includes(q) ||
                    p.description?.toLowerCase().includes(q) ||
                    p.category?.toLowerCase().includes(q),
            );
        },
        [listings],
    );

    // ponytail: local estimate until shipping API exists in backend
    const getShippingOptions = useCallback(
        (_items: CartItem[], _destinationPostalCode?: string) => [
            defaultShippingQuote('standard'),
            defaultShippingQuote('express'),
            defaultShippingQuote('pickup'),
        ],
        [],
    );

    const getProductById = useCallback(
        (productId: string) => listings.find((p) => p.id === productId),
        [listings],
    );

    const createProduct = useCallback(
        async (input: Record<string, unknown>) => {
            if (!sessionToken || !user?.id) {
                return { success: false, error: 'Debes iniciar sesión.' };
            }
            try {
                const productId = await createListingMutation({
                    sessionToken,
                    title: String(input.title ?? ''),
                    description: String(input.description ?? ''),
                    price: Number(input.price ?? 0),
                    type: (input.type as any) ?? 'product',
                    category: String(input.category ?? 'General'),
                    stock: Number(input.stock ?? 1),
                    image: input.image as string | undefined,
                    gallery: input.gallery as string[] | undefined,
                    damageDescription: input.damageDescription as string | undefined,
                    condition: input.condition as string | undefined,
                    location: input.location as any,
                    shippingProfile: input.shippingProfile as any,
                });
                return { success: true, productId: String(productId) };
            } catch (e: any) {
                return { success: false, error: e?.message ?? 'Error al crear producto' };
            }
        },
        [createListingMutation, sessionToken, user?.id],
    );

    const addToWishlist = useCallback(
        (productId: string, _referralLink?: string) => {
            if (!sessionToken || !user?.id) return;
            addFavoriteMutation({
                sessionToken,
                userId: user.id,
                listingId: productId,
            }).catch(console.error);
        },
        [addFavoriteMutation, sessionToken, user?.id],
    );

    return useMemo(
        () => ({
            listings,
            categories,
            orders,
            searchListings,
            getShippingOptions,
            createProduct,
            getProductById,
            addToWishlist,
        }),
        [
            listings,
            categories,
            orders,
            searchListings,
            getShippingOptions,
            createProduct,
            getProductById,
            addToWishlist,
        ],
    );
}

export function MarketplaceProvider({ children }: { children: React.ReactNode }) {
    const value = useMarketplaceState();
    return (
        <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>
    );
}

export function useMarketplace(): MarketplaceContextValue {
    return useMarketplaceState();
}
