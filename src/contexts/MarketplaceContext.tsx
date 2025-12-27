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

const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

const addDaysToDate = (base: Date, days: number) =>
    new Date(base.getTime() + days * MILLISECONDS_IN_DAY);

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
type ProductStatus = 'draft' | 'published' | 'paused' | 'sold';
type SellerType = 'individual' | 'business';
export type ShippingMethod = 'standard' | 'express' | 'pickup';

interface Seller {
    id: string;
    name: string;
    type: SellerType;
    rating: number;
    responseTimeHours: number;
    avatar?: string;
}

interface ProductImage {
    id: string;
    url: string;
    isPrimary: boolean;
    uploadedAt: string;
    verification: {
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
}

interface ProductInput {
    title: string;
    description: string;
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
}

interface ProductUpdateInput extends Partial<ProductInput> {
    status?: ProductStatus;
}

interface OrderItem {
    productId: string;
    title: string;
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
    actor?: 'system' | 'buyer' | 'seller' | 'support';
}

type OrderStatus =
    | 'payment_received'
    | 'awaiting_shipment'
    | 'in_transit'
    | 'delivered'
    | 'completed'
    | 'disputed'
    | 'cancelled';

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
    decidedBy: 'support' | 'system';
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

interface MarketplaceState {
    products: Product[];
    orders: Order[];
}

type MarketplaceAction =
    | { type: 'CREATE_PRODUCT'; payload: Product }
    | { type: 'UPDATE_PRODUCT'; payload: Product }
    | { type: 'DELETE_PRODUCT'; payload: string }
    | { type: 'UPSERT_ORDERS'; payload: Order[] }
    | { type: 'UPDATE_ORDER'; payload: Order }
    | { type: 'ESCROW_SWEEP'; payload: { now: number } };

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
    createProduct: (input: ProductInput) => CreateProductResult;
    updateProduct: (productId: string, updates: ProductUpdateInput) => UpdateProductResult;
    deleteProduct: (productId: string) => void;
    getProductById: (productId: string) => Product | undefined;
    getShippingOptions: (items: CartItem[], destinationPostalCode?: string) => ShippingQuote[];
    calculateShippingQuote: (items: CartItem[], method: ShippingMethod, destinationPostalCode?: string) => ShippingQuote;
    placeOrder: (payload: PlaceOrderPayload) => PlaceOrderResult;
    confirmDelivery: (orderId: string) => DisputeResult;
    initiateDispute: (orderId: string, payload: DisputePayload) => DisputeResult;
    addDisputeEvidence: (orderId: string, evidence: Omit<DisputeEvidence, 'id' | 'uploadedAt'>) => DisputeResult;
    addDisputeMessage: (orderId: string, message: Omit<DisputeMessage, 'id' | 'sentAt'>) => DisputeResult;
    resolveDispute: (orderId: string, resolution: DisputeResolution) => DisputeResult;
}

const MarketplaceContext = createContext<MarketplaceContextType | undefined>(undefined);

const generateId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;

const initialProducts: Product[] = [
    {
        id: 'prod_laptop_001',
        slug: 'laptop-gaming-pro',
        title: 'Laptop Gaming Pro 15"',
        description: 'Laptop gamer equipada con procesador Ryzen 7, 16GB RAM y RTX 4060. Ideal para streaming y edición.',
        condition: 'used',
        damageDescription: 'Micro rayas en la tapa superior. Batería al 87% de salud. Pantalla sin pixeles muertos.',
        price: 1299,
        currency: 'USD',
        stock: 1,
        status: 'published',
        category: 'Electrónica',
        tags: ['gaming', 'portátil', 'rtx4060'],
        createdAt: new Date('2025-01-08T15:25:00Z').toISOString(),
        updatedAt: new Date('2025-02-10T11:00:00Z').toISOString(),
        location: {
            lat: -34.603722,
            lng: -58.381592,
            name: 'TechStore Centro',
            address: 'Av. Corrientes 1234, Buenos Aires',
            distanceKm: 2.5,
        },
        seller: {
            id: 'seller_business_001',
            name: 'TechStore Oficial',
            type: 'business',
            rating: 4.8,
            responseTimeHours: 4,
            avatar: 'https://images.unsplash.com/photo-1557862921-37829c790f19?w=200',
        },
        images: [
            {
                id: 'img_laptop_1',
                url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1080',
                isPrimary: true,
                uploadedAt: new Date('2025-01-08T15:20:00Z').toISOString(),
                verification: {
                    isOriginal: true,
                    proofType: 'metadata',
                    verifiedAt: new Date('2025-01-08T16:00:00Z').toISOString(),
                },
            },
            {
                id: 'img_laptop_2',
                url: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=1080',
                isPrimary: false,
                uploadedAt: new Date('2025-01-08T15:22:00Z').toISOString(),
                verification: {
                    isOriginal: true,
                    proofType: 'manual_review',
                    verifiedAt: new Date('2025-01-09T09:40:00Z').toISOString(),
                },
            },
        ],
        shippingProfile: {
            weightKg: 2.8,
            dimensionsCm: { length: 38, width: 26, height: 5 },
            shipsFrom: {
                city: 'Buenos Aires',
                country: 'Argentina',
                postalCode: 'C1043AAR',
            },
            allowPickup: true,
            handlingTimeHours: 24,
        },
        metrics: {
            views: 1245,
            favorites: 86,
            orders: 12,
        },
        rating: {
            average: 4.9,
            count: 56,
        },
    },
    {
        id: 'prod_jacket_002',
        slug: 'chaqueta-deportiva-premium',
        title: 'Chaqueta Deportiva Premium Unisex',
        description: 'Chaqueta impermeable con membrana respirable y bolsillos termo-sellados. Perfecta para running.',
        condition: 'new',
        price: 89,
        currency: 'USD',
        stock: 15,
        status: 'published',
        category: 'Moda',
        tags: ['deportivo', 'impermeable'],
        createdAt: new Date('2025-02-01T13:15:00Z').toISOString(),
        updatedAt: new Date('2025-02-12T10:10:00Z').toISOString(),
        location: {
            lat: -34.606722,
            lng: -58.384592,
            name: 'Fashion Store Palermo',
            address: 'Gorriti 4567, CABA',
            distanceKm: 4.2,
        },
        seller: {
            id: 'seller_individual_024',
            name: 'Marina López',
            type: 'individual',
            rating: 4.6,
            responseTimeHours: 12,
            avatar: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=200',
        },
        images: [
            {
                id: 'img_jacket_1',
                url: 'https://images.unsplash.com/photo-1551524164-687a55dd1126?w=1080',
                isPrimary: true,
                uploadedAt: new Date('2025-02-01T13:00:00Z').toISOString(),
                verification: {
                    isOriginal: true,
                    proofType: 'metadata',
                    verifiedAt: new Date('2025-02-01T13:05:00Z').toISOString(),
                },
            },
        ],
        shippingProfile: {
            weightKg: 0.7,
            dimensionsCm: { length: 30, width: 25, height: 6 },
            shipsFrom: {
                city: 'Buenos Aires',
                country: 'Argentina',
                postalCode: 'C1414',
            },
            allowPickup: false,
            handlingTimeHours: 12,
        },
        metrics: {
            views: 512,
            favorites: 42,
            orders: 8,
        },
        rating: {
            average: 4.7,
            count: 18,
        },
    },
    {
        id: 'prod_decor_003',
        slug: 'set-decoracion-moderna',
        title: 'Set Decoración Moderna para Living (5 piezas)',
        description: 'Incluye cuadro abstracto, lámpara LED, alfombra tejida, planta artificial premium y cojín decorativo.',
        condition: 'used',
        damageDescription: 'Caja original no disponible. Lámpara con leve marca en base (ver foto).',
        price: 249,
        currency: 'USD',
        stock: 2,
        status: 'published',
        category: 'Hogar',
        tags: ['decoración', 'living'],
        createdAt: new Date('2025-02-05T18:40:00Z').toISOString(),
        updatedAt: new Date('2025-02-10T17:15:00Z').toISOString(),
        location: {
            lat: -34.601722,
            lng: -58.379592,
            name: 'HomeDecor Recoleta',
            address: 'Av. Callao 987, Recoleta',
            distanceKm: 2.1,
        },
        seller: {
            id: 'seller_business_064',
            name: 'HomeDecor Official',
            type: 'business',
            rating: 4.9,
            responseTimeHours: 6,
            avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200',
        },
        images: [
            {
                id: 'img_decor_1',
                url: 'https://images.unsplash.com/photo-1487014679447-9f8336841d58?w=1080',
                isPrimary: true,
                uploadedAt: new Date('2025-02-05T18:35:00Z').toISOString(),
                verification: {
                    isOriginal: true,
                    proofType: 'manual_review',
                    verifiedAt: new Date('2025-02-06T09:00:00Z').toISOString(),
                },
            },
            {
                id: 'img_decor_2',
                url: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1080',
                isPrimary: false,
                uploadedAt: new Date('2025-02-05T18:36:00Z').toISOString(),
                verification: {
                    isOriginal: true,
                    proofType: 'metadata',
                    verifiedAt: new Date('2025-02-05T18:45:00Z').toISOString(),
                },
            },
        ],
        shippingProfile: {
            weightKg: 6.4,
            dimensionsCm: { length: 60, width: 45, height: 35 },
            shipsFrom: {
                city: 'Buenos Aires',
                country: 'Argentina',
                postalCode: 'C1014',
            },
            allowPickup: true,
            handlingTimeHours: 36,
        },
        metrics: {
            views: 334,
            favorites: 28,
            orders: 5,
        },
        rating: {
            average: 4.8,
            count: 21,
        },
    },
    {
        id: 'prod_phone_004',
        slug: 'smartphone-pro-max',
        title: 'Smartphone Pro Max 256GB - Midnight',
        description: 'Equipo liberado con un año de uso, batería al 93%. Incluye caja, cargador y funda transparente.',
        condition: 'used',
        damageDescription: 'Pequeña marca en la esquina inferior derecha del marco. Pantalla impecable.',
        price: 899,
        currency: 'USD',
        stock: 1,
        status: 'published',
        category: 'Electrónica',
        tags: ['smartphone', 'liberado'],
        createdAt: new Date('2025-02-02T09:20:00Z').toISOString(),
        updatedAt: new Date('2025-02-11T14:10:00Z').toISOString(),
        location: {
            lat: -34.609822,
            lng: -58.387692,
            name: 'MobileTech Belgrano',
            address: 'Av. Cabildo 2345, Belgrano',
            distanceKm: 3.2,
        },
        seller: {
            id: 'seller_individual_102',
            name: 'Pedro Giménez',
            type: 'individual',
            rating: 4.5,
            responseTimeHours: 8,
        },
        images: [
            {
                id: 'img_phone_1',
                url: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=1080',
                isPrimary: true,
                uploadedAt: new Date('2025-02-02T09:10:00Z').toISOString(),
                verification: {
                    isOriginal: true,
                    proofType: 'metadata',
                    verifiedAt: new Date('2025-02-02T09:45:00Z').toISOString(),
                },
            },
            {
                id: 'img_phone_2',
                url: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=1080',
                isPrimary: false,
                uploadedAt: new Date('2025-02-02T09:12:00Z').toISOString(),
                verification: {
                    isOriginal: true,
                    proofType: 'manual_review',
                    verifiedAt: new Date('2025-02-03T08:30:00Z').toISOString(),
                },
            },
        ],
        shippingProfile: {
            weightKg: 0.4,
            dimensionsCm: { length: 18, width: 10, height: 5 },
            shipsFrom: {
                city: 'Buenos Aires',
                country: 'Argentina',
                postalCode: 'C1426',
            },
            allowPickup: false,
            handlingTimeHours: 24,
        },
        metrics: {
            views: 879,
            favorites: 74,
            orders: 19,
        },
        rating: {
            average: 4.7,
            count: 33,
        },
    },
];

const initialOrders: Order[] = [
    {
        id: 'order_demo_001',
        buyerId: 'buyer_demo_001',
        sellerId: 'seller_business_001',
        sellerName: 'TechStore Oficial',
        items: [
            {
                productId: 'prod_laptop_001',
                title: 'Laptop Gaming Pro 15"',
                quantity: 1,
                unitPrice: 1299,
                subtotal: 1299,
                condition: 'used',
                sellerId: 'seller_business_001',
                sellerName: 'TechStore Oficial',
                shippingWeightKg: 2.8,
            },
        ],
        totals: {
            items: 1299,
            shipping: 42,
            fees: 39,
            discount: 0,
            grandTotal: 1380,
            currency: 'USD',
        },
        shipping: {
            method: 'express',
            currency: 'USD',
            cost: 42,
            estimatedDeliveryDays: [2, 4],
            breakdown: {
                base: 15,
                weight: 14.8,
                distance: 8.4,
                handling: 3.8,
            },
            description: 'Entrega exprés asegurada 48-72h',
            selectedAt: new Date('2025-02-02T12:00:00Z').toISOString(),
            destination: {
                fullName: 'Juan Pérez',
                addressLine1: 'Chile 1450',
                city: 'Buenos Aires',
                postalCode: 'C1098',
                country: 'Argentina',
                phone: '+54 9 11 1234 5678',
            },
        },
        escrow: {
            state: 'release_scheduled',
            holdStartedAt: new Date('2025-02-02T12:02:00Z').toISOString(),
            releaseScheduledAt: addDaysToDate(new Date('2025-02-10T09:00:00Z'), 15).toISOString(),
        },
        status: 'delivered',
        paymentStatus: 'paid',
        timeline: [
            {
                label: 'Pago recibido',
                at: new Date('2025-02-02T12:00:00Z').toISOString(),
                actor: 'system',
            },
            {
                label: 'Envío confirmado',
                at: new Date('2025-02-03T16:30:00Z').toISOString(),
                actor: 'seller',
                description: 'El vendedor cargó el número de seguimiento XYZ12345AR.',
            },
            {
                label: 'Entrega confirmada por comprador',
                at: new Date('2025-02-10T09:00:00Z').toISOString(),
                actor: 'buyer',
            },
        ],
        createdAt: new Date('2025-02-02T12:00:00Z').toISOString(),
        updatedAt: new Date('2025-02-10T09:05:00Z').toISOString(),
        deliveryConfirmedAt: new Date('2025-02-10T09:00:00Z').toISOString(),
    },
    {
        id: 'order_demo_002',
        buyerId: 'buyer_demo_002',
        sellerId: 'seller_individual_024',
        sellerName: 'Marina López',
        items: [
            {
                productId: 'prod_jacket_002',
                title: 'Chaqueta Deportiva Premium Unisex',
                quantity: 1,
                unitPrice: 89,
                subtotal: 89,
                condition: 'new',
                sellerId: 'seller_individual_024',
                sellerName: 'Marina López',
                shippingWeightKg: 0.7,
            },
        ],
        totals: {
            items: 89,
            shipping: 12,
            fees: 2.7,
            discount: 0,
            grandTotal: 103.7,
            currency: 'USD',
        },
        shipping: {
            method: 'standard',
            currency: 'USD',
            cost: 12,
            estimatedDeliveryDays: [4, 6],
            breakdown: {
                base: 7,
                weight: 2.5,
                distance: 1.5,
                handling: 1,
            },
            description: 'Envío estándar puerta a puerta',
            selectedAt: new Date('2025-02-12T12:00:00Z').toISOString(),
            destination: {
                fullName: 'Lucía Fernández',
                addressLine1: 'Avenida Santa Fe 3450',
                city: 'Buenos Aires',
                postalCode: 'C1425',
                country: 'Argentina',
            },
        },
        escrow: {
            state: 'disputed',
            holdStartedAt: new Date('2025-02-12T12:02:00Z').toISOString(),
            disputeId: 'dispute_demo_001',
        },
        status: 'in_transit',
        paymentStatus: 'paid',
        timeline: [
            {
                label: 'Pago recibido',
                at: new Date('2025-02-12T12:00:00Z').toISOString(),
                actor: 'system',
            },
            {
                label: 'Disputa abierta',
                at: new Date('2025-02-16T10:00:00Z').toISOString(),
                actor: 'buyer',
                description: 'La compradora reportó que la chaqueta llegó con costuras abiertas.',
            },
        ],
        createdAt: new Date('2025-02-12T12:00:00Z').toISOString(),
        updatedAt: new Date('2025-02-16T10:00:00Z').toISOString(),
        dispute: {
            id: 'dispute_demo_001',
            orderId: 'order_demo_002',
            openedAt: new Date('2025-02-16T10:00:00Z').toISOString(),
            openedBy: 'buyer',
            reason: 'damaged',
            description: 'La chaqueta llegó con costuras abiertas en el brazo derecho.',
            status: 'awaiting_seller_response',
            sellerDeadlineAt: addDaysToDate(new Date('2025-02-16T10:00:00Z'), 3).toISOString(),
            evidences: [
                {
                    id: 'evidence_demo_001',
                    type: 'photo',
                    url: 'https://images.unsplash.com/photo-1596755389378-c31d21fd1270?w=800',
                    description: 'Foto de la costura abierta',
                    uploadedAt: new Date('2025-02-16T10:05:00Z').toISOString(),
                    uploadedBy: 'buyer',
                },
            ],
            messages: [
                {
                    id: 'msg_demo_001',
                    sender: 'buyer',
                    body: 'Hola, la chaqueta llegó con las costuras abiertas. ¿Pueden ofrecer un reemplazo?',
                    sentAt: new Date('2025-02-16T10:05:00Z').toISOString(),
                },
            ],
        },
    },
];

const initialState: MarketplaceState = {
    products: initialProducts,
    orders: initialOrders,
};

function marketplaceReducer(state: MarketplaceState, action: MarketplaceAction): MarketplaceState {
    switch (action.type) {
        case 'CREATE_PRODUCT':
            return {
                ...state,
                products: [action.payload, ...state.products],
            };
        case 'UPDATE_PRODUCT':
            return {
                ...state,
                products: state.products.map((product) =>
                    product.id === action.payload.id ? action.payload : product
                ),
            };
        case 'DELETE_PRODUCT':
            return {
                ...state,
                products: state.products.filter((product) => product.id !== action.payload),
            };
        case 'UPSERT_ORDERS': {
            const updatedOrders = [...state.orders];
            action.payload.forEach((incoming) => {
                const index = updatedOrders.findIndex((order) => order.id === incoming.id);
                if (index === -1) {
                    updatedOrders.unshift(incoming);
                } else {
                    updatedOrders[index] = incoming;
                }
            });
            return {
                ...state,
                orders: updatedOrders,
            };
        }
        case 'UPDATE_ORDER':
            return {
                ...state,
                orders: state.orders.map((order) =>
                    order.id === action.payload.id ? action.payload : order
                ),
            };
        case 'ESCROW_SWEEP': {
            const { now } = action.payload;
            const updatedOrders = state.orders.map((order) => {
                if (
                    order.escrow.state === 'release_scheduled' &&
                    order.escrow.releaseScheduledAt &&
                    new Date(order.escrow.releaseScheduledAt).getTime() <= now
                ) {
                    return {
                        ...order,
                        escrow: {
                            ...order.escrow,
                            state: 'released',
                            releasedAt: new Date(now).toISOString(),
                        },
                        status: order.status === 'delivered' ? 'completed' : order.status,
                        updatedAt: new Date(now).toISOString(),
                        timeline: [
                            ...order.timeline,
                            {
                                label: 'Fondos liberados automáticamente',
                                at: new Date(now).toISOString(),
                                actor: 'system',
                                description: 'Cron job de escrow liberó el pago al vendedor tras 15 días sin disputas.',
                            },
                        ],
                    };
                }
                return order;
            });
            return {
                ...state,
                orders: updatedOrders as Order[],
            };
        }
        default:
            return state;
    }
}

const weightSafeguard = (value?: number) => (value && value > 0 ? value : 0.5);

const computeShippingQuote = (
    items: CartItem[],
    method: ShippingMethod,
    destinationPostalCode?: string
): ShippingQuote => {
    const totalWeight = items.reduce(
        (acc, item) => acc + weightSafeguard(item.shippingWeightKg) * item.quantity,
        0
    );
    const averageDistance =
        items.length > 0
            ? items.reduce((acc, item) => acc + (item.distanceKm ?? 5), 0) / items.length
            : 5;

    const baseCost = method === 'express' ? 15 : method === 'pickup' ? 0 : 7;
    const weightFactor = method === 'express' ? 2.8 : method === 'pickup' ? 0 : 1.6;
    const distanceFactor = method === 'express' ? 1.4 : method === 'pickup' ? 0 : 0.6;
    const handling = method === 'pickup' ? 0 : 3;

    const weightCost = totalWeight * weightFactor;
    const distanceCost = averageDistance * distanceFactor;

    const cost = Number((baseCost + weightCost + distanceCost + handling).toFixed(2));

    const estimatedDeliveryDays: [number, number] =
        method === 'express' ? [2, 4] : method === 'pickup' ? [0, 0] : [4, 6];

    const description =
        method === 'express'
            ? 'Entrega exprés asegurada en 48-72 horas con seguimiento en tiempo real.'
            : method === 'pickup'
                ? 'Retiro coordinado con el vendedor sin costo adicional.'
                : 'Envío estándar puerta a puerta con cobertura nacional.';

    return {
        method,
        currency: 'USD',
        cost,
        estimatedDeliveryDays,
        breakdown: {
            base: baseCost,
            weight: Number(weightCost.toFixed(2)),
            distance: Number(distanceCost.toFixed(2)),
            handling,
        },
        description: destinationPostalCode
            ? `${description} CP destino ${destinationPostalCode}.`
            : description,
    };
};

export const MarketplaceProvider = ({ children }: { children: ReactNode }) => {
    const [state, dispatch] = useReducer(marketplaceReducer, initialState);
    const { user } = useAuth();

    useEffect(() => {
        const sweep = () => {
            dispatch({ type: 'ESCROW_SWEEP', payload: { now: Date.now() } });
        };
        sweep();
        const interval = setInterval(sweep, 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const createProduct = (input: ProductInput): CreateProductResult => {
        if (!user) {
            return { success: false, error: 'Debes iniciar sesión para publicar productos.' };
        }

        if (!input.title || !input.description) {
            return { success: false, error: 'El título y la descripción son obligatorios.' };
        }

        if (input.condition === 'used' && !input.damageDescription?.trim()) {
            return {
                success: false,
                error: 'Los productos usados deben detallar el estado y daños visibles.',
            };
        }

        if (!Array.isArray(input.images) || input.images.length === 0) {
            return {
                success: false,
                error: 'Debes subir al menos una foto real del artículo.',
            };
        }

        const now = new Date().toISOString();
        const productId = generateId('prod');

        const images: ProductImage[] = input.images.map((image, index) => ({
            id: generateId('img'),
            url: image.url,
            isPrimary: index === 0 ? true : !!image.isPrimary,
            uploadedAt: now,
            verification: {
                isOriginal: true,
                proofType: 'metadata',
                verifiedAt: now,
            },
        }));

        const seller: Seller = {
            id: user.id,
            name: user.name,
            type: user.role === 'business' ? 'business' : 'individual',
            rating: 4.6,
            responseTimeHours: 12,
            avatar: user.avatar,
        };

        const newProduct: Product = {
            id: productId,
            slug: `${input.title.toLowerCase().replace(/\s+/g, '-')}-${productId.slice(-4)}`,
            title: input.title,
            description: input.description,
            condition: input.condition,
            damageDescription: input.damageDescription?.trim(),
            price: input.price,
            currency: 'USD',
            stock: input.stock,
            status: 'published',
            category: input.category,
            tags: input.tags ?? [],
            createdAt: now,
            updatedAt: now,
            location: input.location,
            seller,
            images,
            shippingProfile: {
                weightKg: input.shippingProfile.weightKg,
                dimensionsCm: input.shippingProfile.dimensionsCm,
                shipsFrom: {
                    city: input.location.name,
                    country: 'Argentina',
                    postalCode: input.shippingProfile.shipsFromPostalCode,
                },
                allowPickup: !!input.shippingProfile.allowPickup,
                handlingTimeHours: 24,
            },
            metrics: {
                views: 0,
                favorites: 0,
                orders: 0,
            },
        };

        dispatch({ type: 'CREATE_PRODUCT', payload: newProduct });

        return { success: true, product: newProduct };
    };

    const updateProduct = (productId: string, updates: ProductUpdateInput): UpdateProductResult => {
        const existing = state.products.find((product) => product.id === productId);
        if (!existing) {
            return { success: false, error: 'Producto no encontrado.' };
        }

        if (updates.condition === 'used' && updates.damageDescription !== undefined && !updates.damageDescription.trim()) {
            return {
                success: false,
                error: 'Debes mantener una descripción de daños válida para productos usados.',
            };
        }

        const { images: newImages, ...otherUpdates } = updates;

        const updatedProduct: Product = {
            ...existing,
            ...otherUpdates,
            damageDescription: otherUpdates.damageDescription ?? existing.damageDescription,
            title: otherUpdates.title ?? existing.title,
            description: otherUpdates.description ?? existing.description,
            condition: otherUpdates.condition ?? existing.condition,
            price: otherUpdates.price ?? existing.price,
            stock: otherUpdates.stock ?? existing.stock,
            category: otherUpdates.category ?? existing.category,
            tags: otherUpdates.tags ?? existing.tags,
            status: otherUpdates.status ?? existing.status,
            updatedAt: new Date().toISOString(),
            location: otherUpdates.location ?? existing.location,
            shippingProfile: otherUpdates.shippingProfile
                ? {
                    ...existing.shippingProfile,
                    weightKg: otherUpdates.shippingProfile.weightKg,
                    dimensionsCm: otherUpdates.shippingProfile.dimensionsCm,
                    shipsFrom: {
                        ...existing.shippingProfile.shipsFrom,
                        postalCode: otherUpdates.shippingProfile.shipsFromPostalCode,
                    },
                    allowPickup: otherUpdates.shippingProfile.allowPickup ?? existing.shippingProfile.allowPickup,
                }
                : existing.shippingProfile,
            // Images will be updated below if present
        };

        if (newImages && newImages.length > 0) {
            updatedProduct.images = newImages.map((image, index) => ({
                id: generateId('img'),
                url: image.url,
                isPrimary: index === 0 ? true : !!image.isPrimary,
                uploadedAt: new Date().toISOString(),
                verification: {
                    isOriginal: true,
                    proofType: 'metadata',
                    verifiedAt: new Date().toISOString(),
                },
            }));
        }

        dispatch({ type: 'UPDATE_PRODUCT', payload: updatedProduct });

        return { success: true, product: updatedProduct };
    };

    const deleteProduct = (productId: string) => {
        dispatch({ type: 'DELETE_PRODUCT', payload: productId });
    };

    const getProductById = (productId: string) =>
        state.products.find((product) => product.id === productId);

    const getShippingOptions = (items: CartItem[], destinationPostalCode?: string) => {
        const methods: ShippingMethod[] = ['standard', 'express', 'pickup'];
        return methods.map((method) => computeShippingQuote(items, method, destinationPostalCode));
    };

    const calculateShippingQuote = (items: CartItem[], method: ShippingMethod, destinationPostalCode?: string) =>
        computeShippingQuote(items, method, destinationPostalCode);

    const placeOrder = (payload: PlaceOrderPayload): PlaceOrderResult => {
        if (!user) {
            return { success: false, error: 'Debes iniciar sesión para completar la compra.' };
        }

        if (payload.cartItems.length === 0) {
            return { success: false, error: 'El carrito está vacío.' };
        }

        const shippingQuote =
            payload.shippingQuote ??
            computeShippingQuote(payload.cartItems, payload.shippingMethod, payload.shippingDestination.postalCode);

        const ordersBySeller = new Map<string, Order>();

        const now = new Date();

        payload.cartItems.forEach((item) => {
            const sellerId = item.sellerId ?? 'seller_unknown';
            const sellerName = item.sellerName ?? 'Vendedor';
            const orderIdKey = `${sellerId}_${payload.shippingMethod}`;

            if (!ordersBySeller.has(orderIdKey)) {
                const orderId = generateId('order');
                ordersBySeller.set(orderIdKey, {
                    id: orderId,
                    buyerId: user.id,
                    sellerId,
                    sellerName,
                    items: [],
                    totals: {
                        items: 0,
                        shipping: 0,
                        fees: 0,
                        shipping: 0,
                        fees: 0,
                        discount: payload.paymentDetails?.discountApplied ?? payload.discountAmount ?? 0,
                        grandTotal: 0,
                        currency: 'USD',
                    },
                    shipping: {
                        ...shippingQuote,
                        selectedAt: now.toISOString(),
                        destination: payload.shippingDestination,
                    },
                    escrow: {
                        state: 'held',
                        holdStartedAt: now.toISOString(),
                    },
                    status: 'payment_received',
                    paymentStatus: 'paid',
                    timeline: [
                        {
                            label: 'Pago recibido',
                            at: now.toISOString(),
                            actor: 'system',
                        },
                    ],
                    createdAt: now.toISOString(),
                    updatedAt: now.toISOString(),
                });
            }

            const order = ordersBySeller.get(orderIdKey)!;

            const subtotal = item.price * item.quantity;

            order.items.push({
                productId: String(item.id),
                title: item.name,
                quantity: item.quantity,
                unitPrice: item.price,
                subtotal,
                condition: item.condition ?? 'new',
                sellerId,
                sellerName,
                shippingWeightKg: weightSafeguard(item.shippingWeightKg),
            });

            order.totals.items += subtotal;
        });

        const orders = Array.from(ordersBySeller.values()).map((order) => {
            const serviceFee = Number((order.totals.items * 0.03).toFixed(2));
            const shippingCost =
                order.shipping.method === 'pickup' ? 0 : Number(order.shipping.cost.toFixed(2));

            const discount = order.totals.discount ?? 0;

            const grandTotal = Number((order.totals.items + shippingCost + serviceFee - discount).toFixed(2));

            return {
                ...order,
                totals: {
                    ...order.totals,
                    shipping: shippingCost,
                    fees: serviceFee,
                    grandTotal,
                },
                updatedAt: new Date().toISOString(),
            };
        });

        dispatch({ type: 'UPSERT_ORDERS', payload: orders });

        return { success: true, orders };
    };

    const confirmDelivery = (orderId: string): DisputeResult => {
        const order = state.orders.find((item) => item.id === orderId);
        if (!order) {
            return { success: false, error: 'Orden no encontrada.' };
        }

        const now = new Date();
        const releaseDate = addDaysToDate(now, 15);

        const updatedOrder: Order = {
            ...order,
            status: 'delivered',
            deliveryConfirmedAt: now.toISOString(),
            escrow: {
                ...order.escrow,
                state: 'release_scheduled',
                releaseScheduledAt: releaseDate.toISOString(),
            },
            timeline: [
                ...order.timeline,
                {
                    label: 'Entrega confirmada',
                    at: now.toISOString(),
                    actor: 'buyer',
                    description: 'El comprador confirmó la recepción del artículo. Fondos retenidos 15 días.',
                },
            ],
            updatedAt: now.toISOString(),
        };

        dispatch({ type: 'UPDATE_ORDER', payload: updatedOrder });

        return { success: true, order: updatedOrder };
    };

    const initiateDispute = (orderId: string, payload: DisputePayload): DisputeResult => {
        const order = state.orders.find((item) => item.id === orderId);
        if (!order) {
            return { success: false, error: 'Orden no encontrada.' };
        }

        const deliveryDate = order.deliveryConfirmedAt
            ? new Date(order.deliveryConfirmedAt)
            : new Date(order.createdAt);

        const daysSinceDelivery = diffInCalendarDays(new Date(), deliveryDate);
        if (daysSinceDelivery > 7) {
            return { success: false, error: 'El plazo para abrir una disputa (7 días) ha expirado.' };
        }

        const disputeId = generateId('dispute');
        const now = new Date();
        const sellerDeadline = addDaysToDate(now, 3);

        const dispute: Dispute = {
            id: disputeId,
            orderId: order.id,
            openedAt: now.toISOString(),
            openedBy: 'buyer',
            reason: payload.reason,
            description: payload.description,
            status: 'awaiting_seller_response',
            sellerDeadlineAt: sellerDeadline.toISOString(),
            evidences: (payload.evidences ?? []).map((evidence) => ({
                ...evidence,
                id: generateId('evidence'),
                uploadedAt: now.toISOString(),
            })),
            messages: [],
        };

        const updatedOrder: Order = {
            ...order,
            escrow: {
                ...order.escrow,
                state: 'disputed',
                disputeId,
            },
            status: 'in_transit',
            dispute,
            timeline: [
                ...order.timeline,
                {
                    label: 'Disputa iniciada',
                    at: now.toISOString(),
                    actor: 'buyer',
                    description: 'El comprador abrió una disputa. Fondos retenidos hasta resolución.',
                },
            ],
            updatedAt: now.toISOString(),
        };

        dispatch({ type: 'UPDATE_ORDER', payload: updatedOrder });

        return { success: true, order: updatedOrder, dispute };
    };

    const addDisputeEvidence = (
        orderId: string,
        evidence: Omit<DisputeEvidence, 'id' | 'uploadedAt'>
    ): DisputeResult => {
        const order = state.orders.find((item) => item.id === orderId);
        if (!order || !order.dispute) {
            return { success: false, error: 'La orden no cuenta con una disputa activa.' };
        }

        const now = new Date();
        const updatedDispute: Dispute = {
            ...order.dispute,
            evidences: [
                ...order.dispute.evidences,
                {
                    ...evidence,
                    id: generateId('evidence'),
                    uploadedAt: now.toISOString(),
                },
            ],
        };

        const updatedOrder: Order = {
            ...order,
            dispute: updatedDispute,
            timeline: [
                ...order.timeline,
                {
                    label: 'Nueva evidencia en disputa',
                    at: now.toISOString(),
                    actor: 'buyer',
                    description: 'Se adjuntó nueva evidencia al caso.',
                },
            ],
            updatedAt: now.toISOString(),
        };

        dispatch({ type: 'UPDATE_ORDER', payload: updatedOrder });

        return { success: true, order: updatedOrder, dispute: updatedDispute };
    };

    const addDisputeMessage = (
        orderId: string,
        message: Omit<DisputeMessage, 'id' | 'sentAt'>
    ): DisputeResult => {
        const order = state.orders.find((item) => item.id === orderId);
        if (!order || !order.dispute) {
            return { success: false, error: 'No hay disputa activa para esta orden.' };
        }

        const now = new Date();
        const updatedDispute: Dispute = {
            ...order.dispute,
            messages: [
                ...order.dispute.messages,
                {
                    ...message,
                    id: generateId('msg'),
                    sentAt: now.toISOString(),
                },
            ],
        };

        const updatedOrder: Order = {
            ...order,
            dispute: updatedDispute,
            updatedAt: now.toISOString(),
        };

        dispatch({ type: 'UPDATE_ORDER', payload: updatedOrder });

        return { success: true, order: updatedOrder, dispute: updatedDispute };
    };

    const resolveDispute = (orderId: string, resolution: DisputeResolution): DisputeResult => {
        const order = state.orders.find((item) => item.id === orderId);
        if (!order || !order.dispute) {
            return { success: false, error: 'Disputa no encontrada.' };
        }

        const now = new Date();

        const updatedDispute: Dispute = {
            ...order.dispute,
            status: resolution.outcome === 'refund' ? 'resolved_refund' : 'resolved_release',
            resolution,
        };

        const updatedOrder: Order = {
            ...order,
            dispute: updatedDispute,
            escrow: {
                ...order.escrow,
                state: resolution.outcome === 'refund' ? 'refunded' : 'released',
                releasedAt: resolution.outcome === 'refund' ? undefined : now.toISOString(),
            },
            status: resolution.outcome === 'refund' ? 'cancelled' : 'completed',
            paymentStatus: resolution.outcome === 'refund' ? 'refunded' : 'paid',
            timeline: [
                ...order.timeline,
                {
                    label: 'Disputa resuelta',
                    at: now.toISOString(),
                    actor: resolution.decidedBy,
                    description:
                        resolution.outcome === 'refund'
                            ? 'Se autorizó el reembolso al comprador.'
                            : 'Se liberaron los fondos al vendedor.',
                },
            ],
            updatedAt: now.toISOString(),
        };

        dispatch({ type: 'UPDATE_ORDER', payload: updatedOrder });

        return { success: true, order: updatedOrder, dispute: updatedDispute };
    };

    const contextValue = useMemo<MarketplaceContextType>(() => ({
        products: state.products,
        orders: state.orders,
        createProduct,
        updateProduct,
        deleteProduct,
        getProductById,
        getShippingOptions,
        calculateShippingQuote,
        placeOrder,
        confirmDelivery,
        initiateDispute,
        addDisputeEvidence,
        addDisputeMessage,
        resolveDispute,
    }), [state.products, state.orders]);

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

