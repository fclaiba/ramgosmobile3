import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    ReactNode,
} from 'react';
import type { CartItem } from './CartContext';
import { useAuth } from './AuthContext';
import { isSubscriptionActive, SUBSCRIPTION_PLANS } from '../config/subscriptionPlans';
import { calculateCommission } from '../utils/CommissionUtils';
import { useToast } from './ToastContext';

const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

const addDaysToDate = (base: Date, days: number) =>
    new Date(base.getTime() + days * MILLISECONDS_IN_DAY);

export const MARKETPLACE_ESCROW_RELEASE_DAYS = 10;

// #region agent log
// Removed debug logging
// #endregion

const diffInCalendarDays = (laterDate: Date, earlierDate: Date) => {
    const utcLater = Date.UTC(
        laterDate.getFullYear(),
        laterDate.getMonth(),
        laterDate.getDate()
    );
    const utcEarlier = Date.UTC(
        earlierDate.getFullYear(),
        earlierDate.getMonth(),
        earlierDate.getDate()
    );
    return Math.floor((utcLater - utcEarlier) / MILLISECONDS_IN_DAY);
};

type Condition = 'new' | 'used';
type ProductStatus = 'draft' | 'published' | 'paused' | 'sold' | 'suspended';
type SellerType = 'individual' | 'business';
export type ShippingMethod = 'standard' | 'express' | 'pickup';

interface Seller {
    id: string;
    name: string;
    type: SellerType;
    rating: number;
    responseTimeHours?: number;
    avatar?: string;
    totalSales?: number;
}

interface ProductImage {
    id: string;
    url: string;
    isPrimary: boolean;
    alt?: string;
    uploadedAt?: string;
    verification?: {
        isOriginal: boolean;
        proofType: 'metadata' | 'manual_review';
        verifiedAt: string;
    };
}

interface ShippingProfile {
    weightKg: number;
    dimensionsCm: { length: number; width: number; height: number };
    shipsFrom: {
        city: string;
        country: string;
        postalCode: string;
    };
    allowPickup: boolean;
    handlingTimeHours: number;
}

export interface Product {
    id: string;
    // For mock MVP: we reuse Product as a unified listing container.
    // This allows consumers/business/influencers to publish product/event/service without a separate backend model.
    listingType?: 'product' | 'event' | 'service' | 'bono';
    slug: string;
    title: string;
    description: string;
    condition: Condition;
    damageDescription?: string;
    price: number;
    currency: 'USD';
    stock: number;
    status: ProductStatus;
    category: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    location: {
        lat: number;
        lng: number;
        name: string;
        address: string;
        distanceKm: number;
    };
    seller: Seller;
    images: ProductImage[];
    shippingProfile: ShippingProfile;
    metrics: {
        views: number;
        favorites: number;
        orders: number;
    };
    rating?: {
        average: number;
        count: number;
    };
    // Extra fields for Events/Coupons
    eventDate?: string;
    eventTime?: string;
    validUntil?: string;
}

interface ProductInput {
    title: string;
    description: string;
    listingType?: 'product' | 'event' | 'service' | 'bono';
    condition: Condition;
    damageDescription?: string;
    price: number;
    stock: number;
    category: string;
    tags?: string[];
    images: Array<{ url: string; isPrimary?: boolean }>;
    shippingProfile: {
        weightKg: number;
        dimensionsCm: { length: number; width: number; height: number };
        shipsFromPostalCode: string;
        allowPickup?: boolean;
    };
    location: {
        lat: number;
        lng: number;
        name: string;
        address: string;
        distanceKm: number;
    };
    // Extra fields for Events/Coupons
    eventDate?: string;
    eventTime?: string;
    validUntil?: string;
    discountValue?: number;
    discountType?: 'percentage' | 'fixed';
}

interface ProductUpdateInput extends Partial<ProductInput> {
    status?: ProductStatus;
}

interface OrderItem {
    productId: string;
    listingType?: 'product' | 'event' | 'service' | 'bono';
    title: string;
    category?: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    condition: Condition;
    sellerId: string;
    sellerName: string;
    shippingWeightKg: number;
}

type EscrowState = 'held' | 'release_scheduled' | 'released' | 'disputed' | 'refunded';

interface EscrowInfo {
    state: EscrowState;
    holdStartedAt: string;
    releaseScheduledAt?: string;
    releasedAt?: string;
    disputeId?: string;
}

interface ShippingDestination {
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

interface ShippingSummary extends ShippingQuote {
    selectedAt: string;
    destination: ShippingDestination;
}

interface TimelineEntry {
    label: string;
    at: string;
    description?: string;
    actor?: 'system' | 'buyer' | 'seller' | 'support' | 'courier';
}

type OrderStatus =
    | 'payment_received'
    | 'awaiting_shipment'
    | 'in_transit'
    | 'delivered'
    | 'completed'
    | 'disputed'
    | 'cancelled'
    | 'pending';

type DisputeReason =
    | 'not_received'
    | 'damaged'
    | 'not_as_described'
    | 'missing_parts'
    | 'counterfeit';

type DisputeStatus =
    | 'open'
    | 'awaiting_seller_response'
    | 'under_review'
    | 'awaiting_buyer_response'
    | 'resolved_refund'
    | 'resolved_release';

interface DisputeEvidence {
    id: string;
    type: 'photo' | 'video' | 'note';
    url?: string;
    description: string;
    uploadedAt: string;
    uploadedBy: 'buyer' | 'seller' | 'support';
}

interface DisputeMessage {
    id: string;
    sender: 'buyer' | 'seller' | 'support';
    body: string;
    sentAt: string;
}

interface DisputeResolution {
    outcome: 'refund' | 'release';
    decidedBy: 'support' | 'system' | 'buyer' | 'seller';
    decidedAt: string;
    notes?: string;
}

interface Dispute {
    id: string;
    orderId: string;
    openedAt: string;
    openedBy: 'buyer' | 'seller';
    reason: DisputeReason;
    description: string;
    status: DisputeStatus;
    sellerDeadlineAt: string;
    resolution?: DisputeResolution;
    evidences: DisputeEvidence[];
    messages: DisputeMessage[];
}

export interface Order {
    id: string;
    buyerId: string;
    sellerId: string;
    sellerName: string;
    items: OrderItem[];
    totals: {
        items: number;
        shipping: number;
        fees: number;
        discount: number;
        grandTotal: number;
        currency: 'USD';
    };
    shipping: ShippingSummary;
    escrow: EscrowInfo;
    status: OrderStatus;
    paymentStatus: 'paid' | 'refunded';
    timeline: TimelineEntry[];
    createdAt: string;
    updatedAt: string;
    deliveryConfirmedAt?: string;
    dispute?: Dispute;
}

export interface WishlistItem {
    productId: string;
    addedAt: string;
    referralCode?: string;
}

interface MarketplaceState {
    products: Product[];
    orders: Order[];
    wishlist: WishlistItem[];
}

// NOTE: Keep this union in a single block with ONE trailing ';'.
// Metro/Babel will throw "Unexpected token '|'" if a mid-union line ends with ';' and more variants follow.
type MarketplaceAction =
    | { type: 'CREATE_PRODUCT'; payload: Product }
    | { type: 'UPDATE_PRODUCT'; payload: Product }
    | { type: 'DELETE_PRODUCT'; payload: string }
    | { type: 'UPSERT_ORDERS'; payload: Order[] }
    | { type: 'UPDATE_ORDER'; payload: Order }
    | { type: 'ESCROW_SWEEP'; payload: { now: number } }
    | { type: 'ADD_TO_WISHLIST'; payload: WishlistItem }
    | { type: 'REMOVE_FROM_WISHLIST'; payload: string };
interface CreateProductResult {
    success: boolean;
    product?: Product;
    error?: string;
}

interface UpdateProductResult {
    success: boolean;
    product?: Product;
    error?: string;
}

interface PlaceOrderPayload {
    cartItems: CartItem[];
    requestId?: string;
    shippingMethod: ShippingMethod;
    shippingDestination: ShippingDestination;
    appliedDiscount?: number;
    discountAmount?: number;
    shippingQuote?: ShippingQuote;
    paymentDetails?: {
        discountApplied: number;
        finalAmount: number;
    };
}

interface PlaceOrderResult {
    success: boolean;
    orders?: Order[];
    error?: string;
}

interface DisputePayload {
    reason: DisputeReason;
    description: string;
    evidences?: Array<Omit<DisputeEvidence, 'id' | 'uploadedAt'>>;
}

interface DisputeResult {
    success: boolean;
    order?: Order;
    dispute?: Dispute;
    error?: string;
}

interface MarketplaceContextType {
    products: Product[];
    orders: Order[];
    createProduct: (input: ProductInput) => Promise<CreateProductResult>;
    updateProduct: (productId: string, updates: ProductUpdateInput) => Promise<UpdateProductResult>;
    deleteProduct: (productId: string) => void;
    getProductById: (productId: string) => Product | undefined;
    getShippingOptions: (items: CartItem[], destinationPostalCode?: string) => ShippingQuote[];
    calculateShippingQuote: (items: CartItem[], method: ShippingMethod, destinationPostalCode?: string) => ShippingQuote;
    placeOrder: (payload: PlaceOrderPayload) => Promise<PlaceOrderResult>;

    wishlist: WishlistItem[];
    addToWishlist: (productId: string, referralCode?: string) => void;
    removeFromWishlist: (productId: string) => void;
    addDisputeMessage: (orderId: string, message: { sender: 'buyer' | 'seller'; body: string }) => void;
    escalateDispute: (orderId: string, role: 'buyer' | 'seller') => { success: boolean; error?: string };
    confirmDelivery: (orderId: string) => Promise<{ success: boolean; error?: string }>;
}

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';


const marketplaceReducer = (state: MarketplaceState, action: MarketplaceAction): MarketplaceState => {
    switch (action.type) {
        case 'CREATE_PRODUCT':
            return { ...state, products: [action.payload, ...state.products] };
        case 'UPDATE_PRODUCT':
            return {
                ...state,
                products: state.products.map((p) => (p.id === action.payload.id ? action.payload : p)),
            };
        case 'DELETE_PRODUCT':
            return { ...state, products: state.products.filter((p) => p.id !== action.payload) };
        case 'UPSERT_ORDERS':
            // Merge existing orders with new ones or replace? Usually replacement for sync.
            // But let's assume we want to keep local state safe.
            return { ...state, orders: action.payload };
        case 'UPDATE_ORDER':
            return {
                ...state,
                orders: state.orders.map((o) => (o.id === action.payload.id ? action.payload : o)),
            };
        case 'ESCROW_SWEEP':
            // Logic to auto-release or auto-refund based on dates
            // This is a simplified client-side check. Ideally backend does this.
            return state; // No-op for now to avoid complexity, or implement if needed.
        case 'ADD_TO_WISHLIST':
            if (state.wishlist.some(w => w.productId === action.payload.productId)) return state;
            return { ...state, wishlist: [...state.wishlist, action.payload] };
        case 'REMOVE_FROM_WISHLIST':
            return { ...state, wishlist: state.wishlist.filter(w => w.productId !== action.payload) };
        default:
            return state;
    }
};

const MarketplaceContext = createContext<MarketplaceContextType | undefined>(undefined);


export const MarketplaceProvider = ({ children }: { children: ReactNode }) => {
    // --- CONVEX SYNC ---
    // --- CONVEX SYNC ---
    const liveProducts = useQuery(api.listings.getFeed) ?? []; // Real-time feed from DB
    const createListingMutation = useMutation(api.listings.createListing);
    const updateListingMutation = useMutation(api.listings.updateListing);
    const deleteListingMutation = useMutation(api.listings.deleteListing);
    const createOrderMutation = useMutation(api.orders.createOrder);
    const confirmReceiptMutation = useMutation(api.orders.confirmReceipt);
    const addDisputeMessageMutation = useMutation(api.disputes.addDisputeMessage);
    const escalateDisputeMutation = useMutation(api.orders.escalateDispute);

    const { user } = useAuth(); // Moved up to use userId in query
    const myOrders = useQuery(
        api.orders.getMyOrders,
        user ? { actorId: user.id as any, userId: user.id } : "skip"
    ) ?? [];

    const { show } = useToast();

    // Convert DB structure to App structure
    const products: Product[] = useMemo(() => {
        if (!Array.isArray(liveProducts)) return [];
        return liveProducts.filter((p: any) => p && p._id).map((p: any) => ({
            ...p,
            id: p._id,
            metrics: p.metrics ?? { views: 0, favorites: 0, orders: 0 },
            seller: p.sellerId ? { id: p.sellerId, name: 'Unknown', type: 'individual', rating: 0 } : { id: 'unknown', name: 'Unknown', type: 'individual', rating: 0 },
            shippingProfile: p.shippingProfile ?? { weightKg: 1, allowPickup: false, shipsFrom: { city: 'Unknown', country: 'AR', postalCode: '0000' }, handlingTimeHours: 24 },
            // Adapter: Map backend 'image'/'gallery' to frontend 'images' array
            images: p.images ?? [
                ...(p.image ? [{ id: 'main', url: p.image, isPrimary: true }] : []),
                ...(p.gallery ? p.gallery.map((url: string, idx: number) => ({ id: `gal_${idx}`, url, isPrimary: false })) : [])
            ],
        }));
    }, [liveProducts]);

    // Convert Backend Orders to App Structure
    // We sync this directly to state.orders via effect or just memo
    const backendOrders: Order[] = useMemo(() => {
        if (!Array.isArray(myOrders)) return [];
        return myOrders.map((o: any) => ({
            id: o._id,
            buyerId: o.userId,
            sellerId: o.sellerId,
            sellerName: 'Vendedor', // Backend doesn't store seller name yet, maybe fetch or store denormalized? "Vendedor" for now.
            items: o.items.map((i: any) => ({
                productId: i.listingId,
                listingType: 'product', // Assumed
                title: i.title,
                quantity: i.quantity,
                unitPrice: i.price,
                subtotal: i.price * i.quantity,
                condition: 'new', // fallback
                sellerId: o.sellerId,
                sellerName: 'Vendedor',
                shippingWeightKg: 1
            })),
            totals: {
                items: o.total,
                shipping: o.shipping?.cost ?? 0,
                fees: 0,
                discount: 0,
                grandTotal: o.total + (o.shipping?.cost ?? 0),
                currency: 'USD'
            },
            shipping: {
                method: o.shipping?.method ?? 'standard',
                currency: 'USD',
                cost: o.shipping?.cost ?? 0,
                estimatedDeliveryDays: [3, 5],
                breakdown: { base: 0, weight: 0, distance: 0, handling: 0 },
                description: 'Envío',
                selectedAt: o.createdAt,
                destination: o.shipping?.address ?? {}
            },
            escrow: { state: o.escrowState ?? 'held', holdStartedAt: o.createdAt },
            status: o.status,
            paymentStatus: 'paid',
            timeline: [{ label: 'Orden creada', at: o.createdAt, actor: 'system' }],
            createdAt: o.createdAt,
            updatedAt: o.updatedAt,
        }));
    }, [myOrders]);

    const [state, dispatch] = useReducer(marketplaceReducer, {
        products: [],
        orders: [],
        wishlist: [],
    });

    // Effect removed to prevent infinite loop
    // Orders are now served directly from 'backendOrders' derived from useQuery


    // --- ACTIONS ---

    const createProduct = async (input: ProductInput): Promise<CreateProductResult> => {
        if (!user) return { success: false, error: 'Debes iniciar sesión' };

        try {
            const newId = await createListingMutation({
                actorId: user.id as any,
                title: input.title,
                description: input.description,
                price: input.price,
                stock: input.stock,
                category: input.category,
                condition: input.condition,
                sellerId: user.id,
                type: input.listingType ?? 'product',
                image: input.images[0]?.url,
                gallery: input.images.map(i => i.url),
                location: input.location ? { ...input.location } : undefined,
                shippingProfile: input.shippingProfile ? {
                    weightKg: input.shippingProfile.weightKg,
                    shipsFromCity: input.shippingProfile.shipsFromPostalCode,
                    allowPickup: input.shippingProfile.allowPickup ?? false,
                } : undefined,
                eventDate: input.eventDate,
                eventTime: input.eventTime,
                validUntil: input.validUntil,
                discountValue: input.discountValue,
                discountType: input.discountType
            });

            return { success: true, product: { ...input, id: newId } as any };
        } catch (err) {
            console.error(err);
            return { success: false, error: 'Error al crear en servidor' };
        }
    };

    const generateId = (prefix: string) => `${prefix}_${Math.random().toString(36).substr(2, 9)}`;

    const computeShippingQuote = (items: CartItem[], method: ShippingMethod, destinationPostalCode?: string): ShippingQuote => {
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

    const updateProduct = async (productId: string, updates: ProductUpdateInput): Promise<UpdateProductResult> => {
        try {
            // Mapping Update Input to Backend Schema
            // Note: Schema expects specific fields, updates is partial of ProductInput
            // We need to map nested objects if necessary or flatten them depending on how we structured args
            // Our backend `updateListing` takes `updates` object.

            // Simple mapping for now
            await updateListingMutation({
                actorId: user?.id as any,
                id: productId as any,
                sellerId: user?.id,
                updates: {
                    title: updates.title,
                    description: updates.description,
                    price: updates.price,
                    stock: updates.stock,
                    // Map other fields as needed
                }
            });
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    };

    const deleteProduct = async (productId: string) => {
        try {
            await deleteListingMutation({
                actorId: user?.id as any,
                id: productId as any,
                sellerId: user?.id,
            });
        } catch (e) {
            console.error("Failed to delete", e);
        }
    };

    const getProductById = (productId: string) =>
        products.find((product) => product.id === productId);

    const getShippingOptions = (items: CartItem[], destinationPostalCode?: string) => {
        const methods: ShippingMethod[] = ['standard', 'express', 'pickup'];
        return methods.map((method) => computeShippingQuote(items, method, destinationPostalCode));
    };

    const calculateShippingQuote = (items: CartItem[], method: ShippingMethod, destinationPostalCode?: string) =>
        computeShippingQuote(items, method, destinationPostalCode);

    const placeOrder = async (payload: PlaceOrderPayload): Promise<PlaceOrderResult> => {
        if (!user) {
            return { success: false, error: 'Debes iniciar sesión para completar la compra.' };
        }

        if (payload.cartItems.length === 0) {
            return { success: false, error: 'El carrito está vacío.' };
        }

        try {
            // Group by Seller
            const itemsBySeller = new Map<string, CartItem[]>();
            payload.cartItems.forEach(item => {
                const sid = item.sellerId || 'unknown';
                if (!itemsBySeller.has(sid)) itemsBySeller.set(sid, []);
                itemsBySeller.get(sid)!.push(item);
            });

            const shippingQuote =
                payload.shippingQuote ??
                computeShippingQuote(payload.cartItems, payload.shippingMethod, payload.shippingDestination.postalCode);

            // Execute Transactions per Seller
            // Note: If one fails, others might succeed. Ideal is all-or-nothing but for MVP partial is acceptable
            // or we do sequential and stop on error.

            const createdOrders: Order[] = [];

            for (const [sellerId, items] of itemsBySeller.entries()) {
                const subtotal = items.reduce((acc, i) => acc + (i.price * i.quantity), 0);
                const orderRequestKey = payload.requestId
                    ? `${payload.requestId}_${sellerId}`
                    : `ord_${user.id}_${sellerId}_${Date.now()}`;

                // Distribute shipping cost proportionally or per order?
                // Simplification for MVP: full shipping cost on first order or split? 
                // Let's attach full shipping to the "primary" order or first one. 
                // Or simply duplicate shipping cost (bad).
                // Let's assume shipping is PER SELLER in this logic if we grouped by seller.

                // Construct Backend Order Payload
                const createdOrderId = await createOrderMutation({
                    actorId: user.id as any,
                    userId: user.id,
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
                        cost: shippingQuote.cost, // Ideally split this if multi-seller
                        address: payload.shippingDestination
                    }
                });

                createdOrders.push({
                    id: createdOrderId,
                    buyerId: user.id,
                    sellerId,
                    sellerName: items[0]?.sellerName || 'Vendedor',
                    items: items.map(i => ({
                        productId: String(i.id),
                        listingType: i.type === 'product' ? 'product' : 'product',
                        title: i.name,
                        category: undefined,
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
                        shipping: shippingQuote.cost,
                        fees: 0,
                        discount: payload.paymentDetails?.discountApplied || 0,
                        grandTotal: Math.max(0, subtotal + shippingQuote.cost - (payload.paymentDetails?.discountApplied || 0)),
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
                    timeline: [{ label: 'Orden creada', at: new Date().toISOString(), actor: 'system' }],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
            }

            return { success: true, orders: createdOrders };

        } catch (err: any) {
            console.error("Order Failed:", err);
            return { success: false, error: err.message || 'Error al procesar la orden.' };
        }
    };

    const addToWishlist = (productId: string, referralCode?: string) => {
        dispatch({
            type: 'ADD_TO_WISHLIST',
            payload: {
                productId,
                addedAt: new Date().toISOString(),
                referralCode,
            },
        });
    };

    const removeFromWishlist = (productId: string) => {
        dispatch({ type: 'REMOVE_FROM_WISHLIST', payload: productId });
    };

    const confirmDelivery = async (orderId: string): Promise<{ success: boolean; error?: string }> => {
        if (!user) {
            return { success: false, error: 'Debes iniciar sesión para confirmar la entrega.' };
        }

        try {
            await confirmReceiptMutation({
                orderId: orderId as any,
                actorId: user.id as any,
                userId: user.id,
            });
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error?.message || 'No se pudo confirmar la entrega.' };
        }
    };

    const contextValue = useMemo<MarketplaceContextType>(() => ({
        products: products, // Use derived query result directly
        orders: backendOrders, // Use derived query result directly
        createProduct,
        updateProduct,
        deleteProduct,
        getProductById,
        getShippingOptions,
        calculateShippingQuote,
        placeOrder,
        wishlist: state.wishlist,
        addToWishlist,
        removeFromWishlist,
        confirmDelivery,
        addDisputeMessage: (orderId, message) => {
            if (!user) {
                show('Debes iniciar sesión para enviar mensajes de disputa.', 'error');
                return;
            }
            addDisputeMessageMutation({
                orderId,
                actorId: user.id as any,
                senderId: user.id,
                sender: message.sender,
                body: message.body,
            }).catch((error: any) => {
                show(error?.message || 'No se pudo enviar el mensaje.', 'error');
            });
        },
        escalateDispute: (orderId, role) => {
            const targetOrder = backendOrders.find((o) => o.id === orderId);
            if (!user || !targetOrder) {
                return { success: false, error: 'No se encontró la orden o la sesión actual.' };
            }
            escalateDisputeMutation({
                orderId: orderId as any,
                actorId: user.id as any,
                userId: user.id,
                role,
            }).catch((error: any) => {
                show(error?.message || 'No se pudo escalar el caso.', 'error');
            });
            return { success: true };
        },
    }), [products, backendOrders, state.wishlist, user, show, addDisputeMessageMutation, escalateDisputeMutation, confirmDelivery]);

    return (
        <MarketplaceContext.Provider value={contextValue}>
            {children}
        </MarketplaceContext.Provider>
    );
};

export const useMarketplace = (): MarketplaceContextType => {
    const context = useContext(MarketplaceContext);
    if (!context) {
        throw new Error('useMarketplace debe utilizarse dentro de MarketplaceProvider');
    }
    return context;
};

