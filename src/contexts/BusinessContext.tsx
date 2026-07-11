import React, { createContext, useContext } from 'react';

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
    status: 'active' | 'paused' | 'expired';
    usageCount: number;
    usageLimit?: number;
    startDate?: string;
    endDate?: string;
};

const defaultBusinessInfo = {
    id: 'default_business',
    name: 'Cargando...',
    tagline: '',
    description: '',
    category: '',
    contactEmail: '',
    phone: '',
    whatsapp: '',
    website: '',
    instagram: '',
    payout: { available: 0, pending: 0, total: 0 },
    overallRating: 0,
};

const defaultMetrics = {
    summary: {
        availableBalance: 0,
        pendingBalance: 0,
        withheldBalance: 0,
        revenueToday: 0,
        redeemedToday: 0,
        activeCoupons: 0,
        uniqueCustomers: 0,
    },
    revenueSeries: [] as Array<{ date: string; revenue: number }>,
    couponLeaders: [] as Array<{ name: string; redemptions: number }>,
    payoutProjection: { nextPayoutDate: new Date().toISOString() },
};

const BusinessContext = createContext<any>(null);

export function BusinessProvider({ children }: { children: React.ReactNode }) {
    return <BusinessContext.Provider value={{}}>{children}</BusinessContext.Provider>;
}

export function useBusiness() {
    return {
        businessProfile: null,
        businessInfo: defaultBusinessInfo,
        stats: {},
        metrics: defaultMetrics,
        activeCampaigns: [],
        transactions: [],
        coupons: [] as Coupon[],
        reviews: [],
        branches: [] as BranchInput[],
        catalog: [] as CatalogItemInput[],
        updateBusinessInfo: (_info: Partial<typeof defaultBusinessInfo>) => {},
        addBranch: (_branch: BranchInput) => {},
        updateBranch: (_id: string | undefined, _branch: Partial<BranchInput>) => {},
        addCatalogItem: (_item: CatalogItemInput) => {},
        updateCatalogItem: (_id: string | undefined, _item: Partial<CatalogItemInput>) => {},
    };
}
