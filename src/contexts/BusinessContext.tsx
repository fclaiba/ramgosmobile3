import React, { createContext, ReactNode, useContext, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from './AuthContext';
import { Id } from '../../convex/_generated/dataModel';

export type DiscountType = 'percentage' | 'fixed';

export interface BusinessInfo {
    id: string;
    name: string;
    tagline?: string;
    description: string;
    category: string;
    contactEmail: string;
    phone: string;
    whatsapp?: string;
    website?: string;
    instagram?: string;
    facebook?: string;
    address: string;
    averageTicket: number;
    payout: {
        available: number;
        pending: number;
        withheld: number;
        nextPayoutDate: string;
    };
    overallRating: number;
    followers: number;
}

export interface Branch {
    id: string;
    name: string;
    address: string;
    city: string;
    phone: string;
    schedule: string;
    manager?: string;
    isMain: boolean;
    isActive: boolean;
    tags?: string[];
}

export type BranchInput = Omit<Branch, 'id'>;

export interface CatalogItem {
    id: string;
    name: string;
    category: string;
    price: number;
    stock: number;
    status: 'published' | 'paused' | 'draft' | 'out_of_stock';
    featured: boolean;
    sold: number;
    updatedAt: string;
    description: string;
    image?: string;
}

export interface CatalogItemInput {
    name: string;
    category: string;
    price: number;
    stock: number;
    status?: CatalogItem['status'];
    featured?: boolean;
    description: string;
    image?: string;
}

export interface Coupon {
    id: string;
    name: string;
    description: string;
    code: string;
    discountType: DiscountType;
    value: number;
    stock: number;
    maxPerUser: number;
    sold: number;
    redeemed: number;
    startDate: string;
    endDate: string;
    status: 'draft' | 'scheduled' | 'active' | 'paused' | 'expired';
    minPurchase?: number;
    branchIds: string[];
    createdAt: string;
    updatedAt: string;
    image?: string;
}

export interface CouponInput {
    name: string;
    description: string;
    discountType: DiscountType;
    value: number;
    stock: number;
    maxPerUser: number;
    startDate: string;
    endDate: string;
    minPurchase?: number;
    branchIds: string[];
    image?: string;
}

export interface BusinessEvent {
    id: string;
    name: string;
    description: string;
    date: string;
    time: string;
    location: string;
    price: number;
    capacity: number;
    ticketsSold: number;
    status: 'active' | 'full' | 'finished' | 'draft';
    image?: string;
    coords?: { lat: number; lng: number; };
    createdAt: string;
    updatedAt: string;
}

export interface BusinessEventInput {
    name: string;
    description: string;
    date: string;
    time: string;
    location: string;
    price: number;
    capacity: number;
    image?: string;
    coords?: { lat: number; lng: number; };
}

export interface Sale {
    id: string;
    date: string;
    branchId: string;
    total: number;
    type: 'product' | 'coupon' | 'event';
    couponId?: string;
    eventId?: string;
    status: 'paid' | 'pending' | 'refunded';
}

export interface Redemption {
    id: string;
    couponId: string;
    userId: string;
    date: string;
    branchId: string;
    amount: number;
    code: string;
}

export interface BusinessReview {
    id: string;
    user: string;
    rating: number;
    comment: string;
    createdAt: string;
}

export interface BusinessMetrics {
    summary: {
        totalCoupons: number;
        activeCoupons: number;
        redeemedToday: number;
        totalRedemptions: number;
        revenueToday: number;
        totalRevenue: number;
        couponRevenue: number;
        eventRevenue: number;
        availableBalance: number;
        pendingBalance: number;
        withheldBalance: number;
        uniqueCustomers: number;
    };
    revenueSeries: Array<{ label: string; revenue: number; redemptions: number }>;
    branchPerformance: Array<{ branchId: string; branchName: string; revenue: number; redemptions: number }>;
    couponLeaders: Array<{ id: string; name: string; redeemed: number; stockLeft: number; revenue: number; status: Coupon['status']; }>;
    payoutProjection: { nextPayoutDate: string; estimatedPayout: number };
}

type RedeemStatus = 'success' | 'not_found' | 'coupon_inactive' | 'max_per_user' | 'out_of_stock' | 'expired';

export interface RedeemSuccess {
    status: 'success';
    message: string;
    coupon: Coupon;
    redemption: Redemption;
    remainingStock: number;
}

export type RedeemError = {
    status: Exclude<RedeemStatus, 'success'>;
    message: string;
    coupon?: Coupon;
};

export type RedeemResult = RedeemSuccess | RedeemError;

interface BusinessContextType {
    businessInfo: BusinessInfo;
    updateBusinessInfo: (updates: Partial<BusinessInfo>) => void;
    branches: Branch[];
    addBranch: (input: BranchInput) => Branch;
    updateBranch: (id: string, updates: Partial<Branch>) => void;
    catalog: CatalogItem[];
    addCatalogItem: (input: CatalogItemInput) => CatalogItem;
    updateCatalogItem: (id: string, updates: Partial<CatalogItem>) => void;
    deleteCatalogItem: (id: string) => void;
    coupons: Coupon[];
    createCoupon: (input: CouponInput) => Coupon;
    updateCoupon: (id: string, updates: Partial<Coupon>) => void;
    deleteCoupon: (id: string) => void;
    events: BusinessEvent[];
    addEvent: (input: BusinessEventInput) => BusinessEvent;
    updateEvent: (id: string, updates: Partial<BusinessEvent>) => void;
    deleteEvent: (id: string) => void;
    redeemCouponByCode: (code: string, userId: string, branchId: string) => RedeemResult;
    redemptions: Redemption[];
    sales: Sale[];
    reviews: BusinessReview[];
    metrics: BusinessMetrics;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const userId = user?.id as Id<"users"> | undefined;

    // Fetch data from Convex
    const convexUser = useQuery(api.users.getUser, userId ? { id: userId } : "skip");
    // Get dashboard metrics
    const convexMetrics = useQuery((api as any).dashboard?.getBusinessMetrics, userId ? { businessId: userId } : "skip");
    // Get all listings for this business
    const convexListings = useQuery(api.listings.getMyListings, userId ? { sellerId: userId } : "skip") || [];
    const convexReviews = useQuery((api as any).reviews?.getBySeller, userId ? { sellerId: userId } : "skip") || [];
    
    const createListing = useMutation(api.listings.createListing);
    const updateListing = useMutation(api.listings.updateListing);
    const deleteListing = useMutation(api.listings.deleteListing);

    // Map Convex user to BusinessInfo
    const businessInfo = useMemo<BusinessInfo>(() => {
        if (!convexUser) return {
            id: '',
            name: 'Cargando...',
            description: '',
            category: 'Restaurante',
            contactEmail: '',
            phone: '',
            address: '',
            averageTicket: 0,
            overallRating: 5,
            followers: 0,
            payout: { available: 0, pending: 0, withheld: 0, nextPayoutDate: '' }
        } as BusinessInfo;
        return {
            id: convexUser._id,
            name: convexUser.name || 'Negocio',
            description: convexUser.bio || '',
            category: 'Restaurante',
            contactEmail: convexUser.email || '',
            phone: (convexUser as any).phoneNumber || '',
            address: '',
            averageTicket: 0,
            payout: {
                available: convexMetrics?.summary?.availableBalance || 0,
                pending: convexMetrics?.summary?.pendingBalance || 0,
                withheld: 0,
                nextPayoutDate: new Date().toISOString(),
            },
            overallRating: convexUser.sellerRating || 5,
            followers: (convexUser as any).followerCount || 0,
        };
    }, [convexUser, convexMetrics]);

    // Map Convex Listings to Coupons/Catalog
    const coupons = useMemo<Coupon[]>(() => {
        return convexListings
            .filter((l: any) => l.type === 'bono')
            .map((l: any) => ({
                id: l._id,
                name: l.title,
                description: l.description,
                code: l.slug || l._id.slice(0, 8),
                discountType: l.discountType || 'percentage',
                value: l.discountValue || 0,
                stock: l.stock,
                maxPerUser: 1,
                sold: l.eventSoldCount || 0,
                redeemed: l.eventSoldCount || 0, // mock
                startDate: l.createdAt,
                endDate: l.validUntil || l.createdAt,
                status: l.status,
                branchIds: [],
                createdAt: l.createdAt,
                updatedAt: l.updatedAt || l.createdAt,
                image: l.image,
            }));
    }, [convexListings]);

    const catalog = useMemo<CatalogItem[]>(() => {
        return convexListings
            .filter((l: any) => l.type === 'product' || l.type === 'service')
            .map((l: any) => ({
                id: l._id,
                name: l.title,
                category: l.category || 'General',
                price: l.price,
                stock: l.stock,
                status: l.status === 'active' ? 'published' : 'paused',
                featured: false,
                sold: l.eventSoldCount || 0,
                updatedAt: l.updatedAt || l.createdAt,
                description: l.description,
                image: l.image,
            }));
    }, [convexListings]);

    // Map Reviews
    const reviews = useMemo<BusinessReview[]>(() => {
        return convexReviews.map((r: any) => ({
            id: r._id,
            user: r.userName,
            rating: r.rating,
            comment: r.comment,
            createdAt: r.createdAt,
        }));
    }, [convexReviews]);

    // Map Metrics
    const metrics = useMemo<BusinessMetrics>(() => {
        if (!convexMetrics) return {
            summary: {
                totalCoupons: 0, activeCoupons: 0, redeemedToday: 0, totalRedemptions: 0,
                revenueToday: 0, totalRevenue: 0, couponRevenue: 0, eventRevenue: 0,
                availableBalance: 0, pendingBalance: 0, withheldBalance: 0, uniqueCustomers: 0
            },
            revenueSeries: [], branchPerformance: [], couponLeaders: [],
            payoutProjection: { nextPayoutDate: '', estimatedPayout: 0 }
        };
        
        return {
            summary: {
                ...convexMetrics.summary,
                couponRevenue: 0,
                eventRevenue: 0,
                withheldBalance: 0,
            },
            revenueSeries: [],
            branchPerformance: [],
            couponLeaders: [],
            payoutProjection: { nextPayoutDate: '', estimatedPayout: 0 }
        };
    }, [convexMetrics]);

    // Stubs for actions (since UI expects them to exist)
    const updateBusinessInfo = useCallback((updates: Partial<BusinessInfo>) => {}, []);
    const addBranch = useCallback((input: BranchInput) => ({ ...input, id: 'temp' } as Branch), []);
    const updateBranch = useCallback((id: string, updates: Partial<Branch>) => {}, []);
    const addCatalogItem = useCallback((input: CatalogItemInput) => {
        createListing({
            title: input.name,
            description: input.description,
            price: input.price,
            type: 'product',
            category: input.category,
            stock: input.stock,
        });
        return { ...input, id: 'temp', status: 'published' as CatalogItem['status'], sold: 0, updatedAt: '', featured: false };
    }, [createListing]);
    const updateCatalogItem = useCallback((id: string, updates: Partial<CatalogItem>) => {}, []);
    const deleteCatalogItem = useCallback((id: string) => { deleteListing({ id: id as Id<"listings"> }); }, [deleteListing]);
    
    const createCoupon = useCallback((input: CouponInput) => {
        createListing({
            title: input.name,
            description: input.description,
            price: input.value,
            type: 'bono',
            category: 'Bonos',
            stock: input.stock,
            discountType: input.discountType,
            discountValue: input.value,
            validUntil: input.endDate,
            image: input.image
        });
        return { ...input, id: 'temp', code: 'TEMP', status: 'active', sold: 0, redeemed: 0, createdAt: '', updatedAt: '' } as Coupon;
    }, [createListing]);
    const updateCoupon = useCallback((id: string, updates: Partial<Coupon>) => {}, []);
    const deleteCoupon = useCallback((id: string) => { deleteListing({ id: id as Id<"listings"> }); }, [deleteListing]);
    
    const addEvent = useCallback((input: BusinessEventInput) => ({ ...input, id: 'temp', status: 'active', ticketsSold: 0, createdAt: '', updatedAt: '' } as BusinessEvent), []);
    const updateEvent = useCallback((id: string, updates: Partial<BusinessEvent>) => {}, []);
    const deleteEvent = useCallback((id: string) => {}, []);
    const redeemCouponByCode = useCallback((code: string) => ({ status: 'success' } as any), []);

    const value = useMemo(() => ({
        businessInfo,
        updateBusinessInfo,
        branches: [],
        addBranch,
        updateBranch,
        catalog,
        addCatalogItem,
        updateCatalogItem,
        deleteCatalogItem,
        coupons,
        createCoupon,
        updateCoupon,
        deleteCoupon,
        events: [],
        addEvent,
        updateEvent,
        deleteEvent,
        redeemCouponByCode,
        redemptions: [],
        sales: [],
        reviews,
        metrics,
    }), [businessInfo, catalog, coupons, metrics, reviews, addCatalogItem, createCoupon, deleteCatalogItem, deleteCoupon]);

    return (
        <BusinessContext.Provider value={value}>
            {children}
        </BusinessContext.Provider>
    );
}

export function useBusiness(): BusinessContextType {
    const context = useContext(BusinessContext);
    if (context === undefined) {
        throw new Error('useBusiness must be used within BusinessProvider');
    }
    return context;
}
