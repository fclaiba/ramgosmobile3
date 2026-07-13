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
        userId ? ({ businessId: userId as Id<'users'> }) : 'skip',
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

    const businessInfo = useMemo(
        () => ({
            id: userId || 'unknown',
            name: businessUser?.name || 'Cargando...',
            tagline: businessUser?.bio || '',
            description: businessUser?.bio || '',
            category: '',
            contactEmail: businessUser?.email || '',
            phone: businessUser?.phoneNumber || '',
            whatsapp: businessUser?.phoneNumber || '',
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
                        status: l.status === 'active' ? 'active' : 'paused',
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

    const addCatalogItem = useCallback((_item: CatalogItemInput) => {}, []);
    const updateCatalogItem = useCallback((_id: string | undefined, _item: Partial<CatalogItemInput>) => {}, []);

    return useMemo(
        () => ({
            businessProfile: businessUser,
            businessInfo,
            stats: metrics.summary,
            metrics,
            activeCampaigns: [],
            transactions: [],
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
