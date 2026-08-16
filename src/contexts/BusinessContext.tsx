// Opción A — perfil/métricas/listings reales (dashboard.ts + users.ts + listings.ts).
// Sucursales: sin tabla backend; estado local de sesión hasta fase futura.
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useAuth } from './AuthContext';

export type BranchInput = {
    id?: string;
    name: string;
    address: string;
    city?: string;
    phone?: string;
    schedule?: string;
    manager?: string;
    isMain?: boolean;
    isActive?: boolean;
    tags?: string[];
};

export type CatalogItemInput = {
    id?: string;
    name: string;
    category: string;
    price: number;
    stock: number;
    status?: 'draft' | 'active' | 'paused' | 'published';
    featured?: boolean;
    description?: string;
    image?: string;
};

export type Coupon = {
    id: string;
    title: string;
    description?: string;
    discount: number;
    discountType: 'percentage' | 'fixed';
    status: 'active' | 'paused' | 'expired' | 'scheduled' | 'draft';
    usageCount: number;
    usageLimit?: number;
    startDate?: string;
    endDate?: string;
};

const BusinessContext = createContext<any>(null);

function useBusinessState() {
    const { user, sessionToken } = useAuth();
    const userId = user?.id;

    const [branches, setBranches] = useState<BranchInput[]>([]);

    const businessUser = useQuery(
        api.users.getUser,
        userId ? ({ id: userId as Id<'users'> }) : 'skip',
    );

    const metricsData = useQuery(
        api.dashboard.getBusinessMetrics,
        userId && sessionToken ? ({ businessId: userId as Id<'users'>, sessionToken }) : 'skip',
    );

    const listings = useQuery(
        api.listings.getMyListings,
        userId && sessionToken ? { sessionToken } : 'skip',
    ) ?? [];

    const reviews = useQuery(
        api.reviews.getBySeller,
        userId ? { sellerId: userId } : 'skip',
    ) ?? [];

    const updateProfileMutation = useMutation(api.users.updateProfile);
    const createListingMutation = useMutation(api.listings.createListing);
    const updateListingMutation = useMutation(api.listings.updateListing);

    const mapCatalogStatus = (status?: string): CatalogItemInput['status'] =>
        status === 'active' ? 'published' : status === 'paused' ? 'paused' : 'draft';

    const mapUiStatusToListing = (
        status?: CatalogItemInput['status'],
    ): 'active' | 'paused' | undefined => {
        if (status === 'published' || status === 'active') return 'active';
        if (status === 'paused') return 'paused';
        return undefined;
    };

    const businessInfo = useMemo(
        () => ({
            id: userId || 'unknown',
            name: businessUser?.name || 'Cargando...',
            tagline: businessUser?.bio || '',
            description: businessUser?.bio || '',
            category: '',
            contactEmail: businessUser?.email || '',
            phone: '',
            whatsapp: '',
            website: '',
            instagram: '',
            payout: {
                available: metricsData?.summary.availableBalance ?? businessUser?.balance ?? 0,
                pending: metricsData?.summary.pendingBalance ?? 0,
                total: metricsData?.summary.totalRevenue ?? businessUser?.balance ?? 0,
            },
            overallRating: businessUser?.sellerRating || 0,
        }),
        [businessUser, metricsData, userId],
    );

    const metrics = useMemo(
        () => ({
            summary: {
                availableBalance: metricsData?.summary.availableBalance ?? 0,
                pendingBalance: metricsData?.summary.pendingBalance ?? 0,
                withheldBalance: 0,
                revenueToday: metricsData?.summary.revenueToday ?? 0,
                redeemedToday: metricsData?.summary.redeemedToday ?? 0,
                activeCoupons: metricsData?.summary.activeCoupons ?? 0,
                uniqueCustomers: metricsData?.summary.uniqueCustomers ?? 0,
            },
            revenueSeries: metricsData?.revenueSeries ?? [],
            couponLeaders: metricsData?.couponLeaders ?? [],
            payoutProjection: { nextPayoutDate: new Date().toISOString() },
        }),
        [metricsData],
    );

    const coupons = useMemo(
        () =>
            (listings as any[])
                .filter((l) => l.type === 'bono')
                .map(
                    (l): Coupon => ({
                        id: String(l._id),
                        title: l.title,
                        description: l.description,
                        discount: l.discountValue ?? 0,
                        discountType: (l.discountType as 'percentage' | 'fixed') ?? 'percentage',
                        status: l.status === 'active' ? 'active' : 'paused',
                        usageCount: l.orderCount ?? 0,
                        usageLimit: l.stock,
                    }),
                ),
        [listings],
    );

    const catalog = useMemo(
        () =>
            (listings as any[])
                .filter((l) => l.type === 'product' || l.type === 'service')
                .map(
                    (l): CatalogItemInput => ({
                        id: String(l._id),
                        name: l.title,
                        category: l.category,
                        price: l.price,
                        stock: l.stock,
                        status: mapCatalogStatus(l.status),
                        description: l.description,
                        image: l.image,
                    }),
                ),
        [listings],
    );

    const updateBusinessInfo = useCallback(
        (info: Partial<typeof businessInfo>) => {
            if (!sessionToken || !userId) return;
            updateProfileMutation({
                sessionToken,
                id: userId as Id<'users'>,
                updates: {
                    name: info.name,
                    phoneNumber: info.phone ?? info.whatsapp,
                },
            }).catch(console.error);
        },
        [sessionToken, updateProfileMutation, userId],
    );

    const addBranch = useCallback((branch: BranchInput) => {
        setBranches((prev) => [...prev, { ...branch, id: branch.id ?? `branch_${Date.now()}` }]);
    }, []);

    const updateBranch = useCallback((id: string | undefined, branch: Partial<BranchInput>) => {
        if (!id) return;
        setBranches((prev) => prev.map((b) => (b.id === id ? { ...b, ...branch } : b)));
    }, []);

    const addCatalogItem = useCallback(
        (item: CatalogItemInput) => {
            if (!sessionToken || !userId) return;
            const listingStatus = mapUiStatusToListing(item.status);
            createListingMutation({
                sessionToken,
                title: item.name,
                description: item.description ?? '',
                price: item.price,
                type: 'product',
                category: item.category,
                stock: item.stock,
                image: item.image,
            })
                .then((listingId) => {
                    if (listingStatus === 'paused' && listingId) {
                        return updateListingMutation({
                            sessionToken,
                            id: listingId as Id<'listings'>,
                            updates: { status: 'paused' },
                        });
                    }
                })
                .catch(console.error);
        },
        [createListingMutation, sessionToken, updateListingMutation, userId],
    );

    const updateCatalogItem = useCallback(
        (id: string | undefined, item: Partial<CatalogItemInput>) => {
            if (!sessionToken || !id) return;
            const updates: Record<string, unknown> = {};
            if (item.name !== undefined) updates.title = item.name;
            if (item.description !== undefined) updates.description = item.description;
            if (item.price !== undefined) updates.price = item.price;
            if (item.stock !== undefined) updates.stock = item.stock;
            if (item.category !== undefined) updates.category = item.category;
            if (item.image !== undefined) updates.image = item.image;
            const listingStatus = mapUiStatusToListing(item.status);
            if (listingStatus !== undefined) updates.status = listingStatus;
            updateListingMutation({
                sessionToken,
                id: id as Id<'listings'>,
                updates,
            }).catch(console.error);
        },
        [sessionToken, updateListingMutation],
    );

    return useMemo(
        () => ({
            businessProfile: businessUser,
            businessInfo,
            stats: metrics.summary,
            metrics,
            activeCampaigns: [], // ponytail: campaigns live in api.campaigns — not wired here yet
            transactions: [], // ponytail: wallet tx via FintechContext / finance.ts
            coupons,
            reviews,
            branches,
            catalog,
            updateBusinessInfo,
            addBranch,
            updateBranch,
            addCatalogItem,
            updateCatalogItem,
        }),
        [
            businessUser,
            businessInfo,
            metrics,
            coupons,
            reviews,
            branches,
            catalog,
            updateBusinessInfo,
            addBranch,
            updateBranch,
            addCatalogItem,
            updateCatalogItem,
        ],
    );
}

export function BusinessProvider({ children }: { children: React.ReactNode }) {
    const value = useBusinessState();
    return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness() {
    return useBusinessState();
}
