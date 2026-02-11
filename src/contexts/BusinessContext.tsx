import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useMemo,
    useState,
} from 'react';

type DiscountType = 'percentage' | 'fixed';

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

interface RedeemSuccess {
    status: 'success';
    message: string;
    coupon: Coupon;
    redemption: Redemption;
    remainingStock: number;
}

type RedeemError = {
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

const startOfDay = (date: Date): Date => {
    const clone = new Date(date);
    clone.setHours(0, 0, 0, 0);
    return clone;
};

const addDays = (date: Date, days: number): Date => {
    const clone = new Date(date);
    clone.setDate(clone.getDate() + days);
    return clone;
};

const startOfWeek = (date: Date): Date => {
    const dayStart = startOfDay(date);
    const day = dayStart.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    return addDays(dayStart, diff);
};

const startOfMonth = (date: Date): Date => {
    const result = startOfDay(date);
    result.setDate(1);
    return result;
};

const generateId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const generateCouponCode = () => {
    const seed = Math.random().toString(36).replace(/[^a-z0-9]/gi, '').toUpperCase();
    return `BONO-${seed.slice(0, 4)}-${seed.slice(4, 8)}`;
};

const calculateCouponAmount = (coupon: Coupon, averageTicket: number): number => {
    if (coupon.discountType === 'fixed') {
        return Number(coupon.value.toFixed(2));
    }
    const amount = averageTicket * (coupon.value / 100);
    return Number(amount.toFixed(2));
};

const resolveCouponStatus = (coupon: Coupon, reference: Date): Coupon['status'] => {
    if (coupon.status === 'paused' || coupon.status === 'draft') {
        return coupon.status;
    }
    if (coupon.redeemed >= coupon.stock) {
        return 'expired';
    }
    const start = new Date(coupon.startDate);
    const end = new Date(coupon.endDate);
    if (reference < start) {
        return 'scheduled';
    }
    if (reference > end) {
        return 'expired';
    }
    return 'active';
};

const now = new Date();

const initialBusinessInfo: BusinessInfo = {
    id: 'business_default',
    name: 'Ramgos Restaurante & Market',
    tagline: 'Sabor auténtico, experiencias memorables',
    description: 'Somos un hub gastronómico con delivery propio, alianzas corporativas y beneficios exclusivos para nuestra comunidad Ramgos.',
    category: 'Restaurante',
    contactEmail: 'ventas@ramgos.co',
    phone: '+54 11 5555-1400',
    whatsapp: '+54 911 6000-7890',
    website: 'https://ramgos.co',
    instagram: '@ramgos.restaurante',
    facebook: '/ramgosrestaurante',
    address: 'Av. Libertador 123, Ciudad Central',
    averageTicket: 22.5,
    payout: {
        available: 2350.75,
        pending: 640.5,
        withheld: 150.0,
        nextPayoutDate: addDays(now, 4).toISOString(),
    },
    overallRating: 4.8,
    followers: 1280,
};

const initialBranches: Branch[] = [
    {
        id: 'branch_central',
        name: 'Casa Central',
        address: 'Av. Libertador 123',
        city: 'Ciudad Central',
        phone: '+54 11 5555-1234',
        schedule: 'Lun-Dom 11:00 - 23:00',
        manager: 'Laura Martínez',
        isMain: true,
        isActive: true,
        tags: ['Retiro en tienda', 'Delivery'],
    },
    {
        id: 'branch_norte',
        name: 'Sucursal Norte',
        address: 'Calle 25 de Mayo 456',
        city: 'Barrio Norte',
        phone: '+54 11 5555-9876',
        schedule: 'Lun-Sab 12:00 - 22:00',
        manager: 'Jorge Peña',
        isMain: false,
        isActive: true,
        tags: ['Retiro en tienda'],
    },
    {
        id: 'branch_sur',
        name: 'Sucursal Sur',
        address: 'Av. Belgrano 880',
        city: 'Zona Sur',
        phone: '+54 11 5555-3311',
        schedule: 'Jue-Dom 18:00 - 00:00',
        manager: 'Micaela Gómez',
        isMain: false,
        isActive: false,
        tags: ['Eventos'],
    },
];

const initialCatalog: CatalogItem[] = [
    {
        id: 'catalog_pizza',
        name: 'Pizza Familiar Napolitana',
        category: 'Pizzas',
        price: 18.9,
        stock: 45,
        status: 'published',
        featured: true,
        sold: 320,
        updatedAt: addDays(now, -1).toISOString(),
        description: 'Masa madre, salsa de tomate fresca, mozzarella premium y albahaca.',
    },
    {
        id: 'catalog_combo',
        name: 'Combo Almuerzo Ejecutivo',
        category: 'Combos',
        price: 12.5,
        stock: 30,
        status: 'published',
        featured: false,
        sold: 180,
        updatedAt: addDays(now, -3).toISOString(),
        description: 'Incluye plato principal, bebida y postre casero.',
    },
    {
        id: 'catalog_postre',
        name: 'Cheesecake de Maracuyá',
        category: 'Postres',
        price: 6.9,
        stock: 28,
        status: 'paused',
        featured: false,
        sold: 90,
        updatedAt: addDays(now, -8).toISOString(),
        description: 'Porción individual con coulis de maracuyá fresco.',
    },
    {
        id: 'catalog_cafe',
        name: 'Caja Café de Especialidad',
        category: 'Retail',
        price: 14.0,
        stock: 60,
        status: 'published',
        featured: true,
        sold: 140,
        updatedAt: addDays(now, -6).toISOString(),
        description: 'Selección de granos tostados, presentación premium para regalos.',
    },
];

const initialCoupons: Coupon[] = [
    {
        id: 'coupon_50off',
        name: '50% OFF Pizza Familiar',
        description: 'Aplica en pizzas seleccionadas para consumo en salón o retiro.',
        code: 'BONO-50OFF-ABC123',
        discountType: 'percentage',
        value: 50,
        stock: 150,
        maxPerUser: 2,
        sold: 110,
        redeemed: 72,
        startDate: addDays(now, -10).toISOString(),
        endDate: addDays(now, 25).toISOString(),
        status: 'active',
        minPurchase: 18,
        branchIds: ['branch_central', 'branch_norte'],
        createdAt: addDays(now, -15).toISOString(),
        updatedAt: addDays(now, -1).toISOString(),
    },
    {
        id: 'coupon_brunch',
        name: 'Brunch 2x1 Fin de Semana',
        description: 'Incluye dos menús brunch completos los sábados y domingos.',
        code: 'BRUNCH-2X1-FF09',
        discountType: 'fixed',
        value: 22,
        stock: 80,
        maxPerUser: 1,
        sold: 45,
        redeemed: 38,
        startDate: addDays(now, -3).toISOString(),
        endDate: addDays(now, 14).toISOString(),
        status: 'active',
        minPurchase: 30,
        branchIds: ['branch_central'],
        createdAt: addDays(now, -7).toISOString(),
        updatedAt: addDays(now, -2).toISOString(),
    },
    {
        id: 'coupon_midweek',
        name: 'Happy Hour Midweek',
        description: '30% OFF en bebidas seleccionadas de lunes a jueves.',
        code: 'HHMID-30-XY21',
        discountType: 'percentage',
        value: 30,
        stock: 120,
        maxPerUser: 3,
        sold: 60,
        redeemed: 24,
        startDate: addDays(now, 2).toISOString(),
        endDate: addDays(now, 40).toISOString(),
        status: 'scheduled',
        minPurchase: 0,
        branchIds: ['branch_central', 'branch_sur'],
        createdAt: addDays(now, -1).toISOString(),
        updatedAt: addDays(now, -1).toISOString(),
    },
];

const coupon50 = initialCoupons[0];
const couponBrunch = initialCoupons[1];

const redemptionAmount50 = calculateCouponAmount(coupon50, initialBusinessInfo.averageTicket);
const redemptionAmountBrunch = calculateCouponAmount(couponBrunch, initialBusinessInfo.averageTicket);

const initialRedemptions: Redemption[] = [
    {
        id: 'redemption_01',
        couponId: 'coupon_50off',
        userId: 'usuario_mgarcia',
        branchId: 'branch_central',
        date: addDays(now, -1).toISOString(),
        amount: redemptionAmount50,
        code: coupon50.code,
    },
    {
        id: 'redemption_02',
        couponId: 'coupon_50off',
        userId: 'usuario_crodriguez',
        branchId: 'branch_central',
        date: addDays(now, -4).toISOString(),
        amount: redemptionAmount50,
        code: coupon50.code,
    },
    {
        id: 'redemption_03',
        couponId: 'coupon_50off',
        userId: 'usuario_jperez',
        branchId: 'branch_norte',
        date: addDays(now, -6).toISOString(),
        amount: redemptionAmount50,
        code: coupon50.code,
    },
    {
        id: 'redemption_04',
        couponId: 'coupon_brunch',
        userId: 'usuario_lrojas',
        branchId: 'branch_central',
        date: addDays(now, -2).toISOString(),
        amount: redemptionAmountBrunch,
        code: couponBrunch.code,
    },
    {
        id: 'redemption_05',
        couponId: 'coupon_brunch',
        userId: 'usuario_agomez',
        branchId: 'branch_central',
        date: addDays(now, -5).toISOString(),
        amount: redemptionAmountBrunch,
        code: couponBrunch.code,
    },
];

const initialSales: Sale[] = [
    {
        id: 'sale_prod_01',
        date: addDays(now, -1).toISOString(),
        branchId: 'branch_central',
        total: 245.5,
        type: 'product',
        status: 'paid',
    },
    {
        id: 'sale_prod_02',
        date: addDays(now, -3).toISOString(),
        branchId: 'branch_norte',
        total: 180.2,
        type: 'product',
        status: 'paid',
    },
    {
        id: 'sale_coupon_01',
        date: addDays(now, -1).toISOString(),
        branchId: 'branch_central',
        total: redemptionAmount50,
        type: 'coupon',
        couponId: 'coupon_50off',
        status: 'paid',
    },
    {
        id: 'sale_coupon_02',
        date: addDays(now, -2).toISOString(),
        branchId: 'branch_central',
        total: redemptionAmountBrunch,
        type: 'coupon',
        couponId: 'coupon_brunch',
        status: 'paid',
    },
    {
        id: 'sale_prod_03',
        date: addDays(now, -7).toISOString(),
        branchId: 'branch_sur',
        total: 90.0,
        type: 'product',
        status: 'pending',
    },
];

const initialReviews: BusinessReview[] = [
    {
        id: 'review_1',
        user: 'María García',
        rating: 5,
        comment: 'Excelente atención, los bonos hacen que la visita valga el doble.',
        createdAt: addDays(now, -2).toISOString(),
    },
    {
        id: 'review_2',
        user: 'Carlos Ruiz',
        rating: 4,
        comment: 'Muy buena calidad, aunque el canje del bono tomó un poco de tiempo.',
        createdAt: addDays(now, -5).toISOString(),
    },
    {
        id: 'review_3',
        user: 'Lucía Rojas',
        rating: 5,
        comment: 'El brunch 2x1 fue un éxito, volveré el próximo fin de semana.',
        createdAt: addDays(now, -7).toISOString(),
    },
];

const initialEvents: BusinessEvent[] = [
    {
        id: 'event_01',
        name: 'Noche de Jazz',
        description: 'Música en vivo con banda invitada y menú especial de tapas.',
        date: addDays(now, 5).toISOString(),
        time: '20:30',
        location: 'Av. Libertador 123, Sala Principal',
        price: 15.0,
        capacity: 50,
        ticketsSold: 12,
        status: 'active',
        createdAt: addDays(now, -2).toISOString(),
        updatedAt: addDays(now, -2).toISOString(),
    }
];

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: ReactNode }) {
    const [businessInfo, setBusinessInfo] = useState<BusinessInfo>(initialBusinessInfo);
    const [branches, setBranches] = useState<Branch[]>(initialBranches);
    const [catalog, setCatalog] = useState<CatalogItem[]>(initialCatalog);
    const [couponsState, setCouponsState] = useState<Coupon[]>(initialCoupons);
    const [events, setEvents] = useState<BusinessEvent[]>(initialEvents);
    const [redemptions, setRedemptions] = useState<Redemption[]>(initialRedemptions);
    const [sales, setSales] = useState<Sale[]>(initialSales);
    const [reviews] = useState<BusinessReview[]>(initialReviews);

    const coupons = useMemo(() => {
        const reference = new Date();
        return couponsState.map((coupon) => {
            const status = resolveCouponStatus(coupon, reference);
            if (status === coupon.status) {
                return coupon;
            }
            return { ...coupon, status };
        });
    }, [couponsState]);

    const metrics = useMemo<BusinessMetrics>(() => {
        const reference = new Date();
        const dayStart = startOfDay(reference);
        const weekStart = startOfWeek(reference);
        const monthStart = startOfMonth(reference);

        const paidSales = sales.filter((sale) => sale.status === 'paid');
        const revenueToday = paidSales
            .filter((sale) => new Date(sale.date) >= dayStart)
            .reduce((sum, sale) => sum + sale.total, 0);

        const totalRevenue = paidSales.reduce((sum, sale) => sum + sale.total, 0);

        const couponRevenue = redemptions.reduce((sum, redemption) => sum + redemption.amount, 0);

        const redeemedToday = redemptions.filter((redemption) => new Date(redemption.date) >= dayStart).length;
        const totalRedemptions = redemptions.length;

        const uniqueCustomers = new Set(redemptions.map((item) => item.userId)).size;

        const branchPerformance = branches
            .map((branch) => {
                const branchSales = paidSales.filter((sale) => sale.branchId === branch.id);
                const branchRevenue = branchSales.reduce((sum, sale) => sum + sale.total, 0);
                const branchRedemptions = redemptions.filter((redemption) => redemption.branchId === branch.id).length;
                return {
                    branchId: branch.id,
                    branchName: branch.name,
                    revenue: Number(branchRevenue.toFixed(2)),
                    redemptions: branchRedemptions,
                };
            })
            .sort((a, b) => b.revenue - a.revenue);

        const revenueSeries: Array<{ label: string; revenue: number; redemptions: number }> = [];
        for (let i = 6; i >= 0; i--) {
            const day = startOfDay(addDays(reference, -i));
            const nextDay = addDays(day, 1);
            const label = `${day.getDate()}/${day.getMonth() + 1}`;
            const dayRevenue = paidSales
                .filter((sale) => {
                    const saleDate = new Date(sale.date);
                    return saleDate >= day && saleDate < nextDay;
                })
                .reduce((sum, sale) => sum + sale.total, 0);
            const dayRedemptions = redemptions.filter((redemption) => {
                const date = new Date(redemption.date);
                return date >= day && date < nextDay;
            }).length;
            revenueSeries.push({
                label,
                revenue: Number(dayRevenue.toFixed(2)),
                redemptions: dayRedemptions,
            });
        }

        const couponLeaders = coupons
            .map((coupon) => {
                const couponRevenueTotal = redemptions
                    .filter((entry) => entry.couponId === coupon.id)
                    .reduce((sum, entry) => sum + entry.amount, 0);
                return {
                    id: coupon.id,
                    name: coupon.name,
                    redeemed: coupon.redeemed,
                    stockLeft: Math.max(coupon.stock - coupon.redeemed, 0),
                    revenue: Number(couponRevenueTotal.toFixed(2)),
                    status: coupon.status,
                };
            })
            .sort((a, b) => b.redeemed - a.redeemed)
            .slice(0, 4);

        const payoutProjection = {
            nextPayoutDate: businessInfo.payout.nextPayoutDate,
            estimatedPayout: Number(
                (businessInfo.payout.available + businessInfo.payout.pending - businessInfo.payout.withheld).toFixed(2)
            ),
        };

        return {
            summary: {
                totalCoupons: coupons.length,
                activeCoupons: coupons.filter((coupon) => coupon.status === 'active').length,
                redeemedToday,
                totalRedemptions,
                revenueToday: Number(revenueToday.toFixed(2)),
                totalRevenue: Number(totalRevenue.toFixed(2)),
                couponRevenue: Number(couponRevenue.toFixed(2)),
                eventRevenue: 0,
                availableBalance: Number(businessInfo.payout.available.toFixed(2)),
                pendingBalance: Number(businessInfo.payout.pending.toFixed(2)),
                withheldBalance: Number(businessInfo.payout.withheld.toFixed(2)),
                uniqueCustomers,
            },
            revenueSeries,
            branchPerformance,
            couponLeaders,
            payoutProjection,
        };
    }, [sales, redemptions, coupons, businessInfo.payout, branches]);

    const updateBusinessInfo = useCallback((updates: Partial<BusinessInfo>) => {
        setBusinessInfo((prev) => ({
            ...prev,
            ...updates,
            payout: updates.payout
                ? {
                    ...prev.payout,
                    ...updates.payout,
                }
                : prev.payout,
        }));
    }, []);

    const addBranch = useCallback((input: BranchInput): Branch => {
        const branch: Branch = {
            ...input,
            id: generateId('branch'),
        };
        setBranches((prev) => [branch, ...prev]);
        return branch;
    }, []);

    const updateBranch = useCallback((id: string, updates: Partial<Branch>) => {
        setBranches((prev) =>
            prev.map((branch) => (branch.id === id ? { ...branch, ...updates } : branch))
        );
    }, []);

    const addCatalogItem = useCallback((input: CatalogItemInput): CatalogItem => {
        const item: CatalogItem = {
            id: generateId('catalog'),
            name: input.name,
            category: input.category,
            price: Number(input.price) || 0,
            stock: Number(input.stock) || 0,
            status: input.status ?? 'draft',
            featured: Boolean(input.featured),
            sold: 0,
            updatedAt: new Date().toISOString(),
            description: input.description,
            image: input.image,
        };
        setCatalog((prev) => [item, ...prev]);
        return item;
    }, []);

    const updateCatalogItem = useCallback((id: string, updates: Partial<CatalogItem>) => {
        setCatalog((prev) =>
            prev.map((item) =>
                item.id === id
                    ? { ...item, ...updates, updatedAt: new Date().toISOString() }
                    : item
            )
        );
    }, []);

    const createCoupon = useCallback((input: CouponInput): Coupon => {
        const creationDate = new Date();
        const start = new Date(input.startDate);
        const end = new Date(input.endDate);

        let status: Coupon['status'] = 'active';
        if (end < creationDate) {
            status = 'expired';
        } else if (start > creationDate) {
            status = 'scheduled';
        }

        const coupon: Coupon = {
            id: generateId('coupon'),
            name: input.name,
            description: input.description,
            code: generateCouponCode(),
            discountType: input.discountType,
            value: Number(input.value) || 0,
            stock: Number(input.stock) || 0,
            maxPerUser: Number(input.maxPerUser) || 1,
            sold: 0,
            redeemed: 0,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            status,
            minPurchase: input.minPurchase ? Number(input.minPurchase) : undefined,
            branchIds: input.branchIds.length ? input.branchIds : branches.map((branch) => branch.id),
            createdAt: creationDate.toISOString(),
            updatedAt: creationDate.toISOString(),
            image: input.image,
        };

        setCouponsState((prev) => [coupon, ...prev]);
        return coupon;
    }, [branches]);

    const updateCoupon = useCallback((id: string, updates: Partial<Coupon>) => {
        setCouponsState((prev) =>
            prev.map((coupon) =>
                coupon.id === id
                    ? {
                        ...coupon,
                        ...updates,
                        updatedAt: new Date().toISOString(),
                    }
                    : coupon
            )
        );
    }, []);

    const deleteCoupon = useCallback((id: string) => {
        setCouponsState((prev) => prev.filter((item) => item.id !== id));
    }, []);

    const deleteCatalogItem = useCallback((id: string) => {
        setCatalog((prev) => prev.filter((item) => item.id !== id));
    }, []);

    const addEvent = useCallback((input: BusinessEventInput): BusinessEvent => {
        const event: BusinessEvent = {
            id: generateId('event'),
            ...input,
            ticketsSold: 0,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        setEvents((prev) => [event, ...prev]);
        return event;
    }, []);

    const updateEvent = useCallback((id: string, updates: Partial<BusinessEvent>) => {
        setEvents((prev) =>
            prev.map((e) =>
                e.id === id
                    ? {
                        ...e,
                        ...updates,
                        updatedAt: new Date().toISOString(),
                    }
                    : e
            )
        );
    }, []);

    const deleteEvent = useCallback((id: string) => {
        setEvents((prev) => prev.filter((e) => e.id !== id));
    }, []);

    const redeemCouponByCode = useCallback(
        (rawCode: string, userId: string, branchId: string): RedeemResult => {
            const formattedCode = rawCode.trim().toUpperCase();
            const coupon = coupons.find(
                (item) => item.code.toUpperCase() === formattedCode
            );

            if (!coupon) {
                return {
                    status: 'not_found',
                    message: 'No encontramos un bono asociado a este código.',
                };
            }

            if (coupon.status === 'scheduled' || coupon.status === 'paused' || coupon.status === 'draft') {
                return {
                    status: 'coupon_inactive',
                    message: 'Aún no puedes canjear este bono.',
                    coupon,
                };
            }

            if (coupon.status === 'expired') {
                return {
                    status: 'expired',
                    message: 'Este bono ya no se encuentra vigente.',
                    coupon,
                };
            }

            if (coupon.redeemed >= coupon.stock) {
                return {
                    status: 'out_of_stock',
                    message: 'Este bono agotó su stock disponible.',
                    coupon,
                };
            }

            const userRedeems = redemptions.filter(
                (entry) => entry.couponId === coupon.id && entry.userId === userId
            ).length;

            if (userRedeems >= coupon.maxPerUser) {
                return {
                    status: 'max_per_user',
                    message: 'Este cliente alcanzó el máximo de canjes permitidos.',
                    coupon,
                };
            }

            const validBranch = branches.some((branch) => branch.id === branchId)
                ? branchId
                : branches[0]?.id ?? branchId;

            const redemptionAmount = calculateCouponAmount(coupon, businessInfo.averageTicket);
            const redemptionDate = new Date().toISOString();

            const redemption: Redemption = {
                id: generateId('redemption'),
                couponId: coupon.id,
                userId,
                branchId: validBranch,
                date: redemptionDate,
                amount: redemptionAmount,
                code: coupon.code,
            };

            setRedemptions((prev) => [redemption, ...prev]);

            setCouponsState((prev) =>
                prev.map((item) =>
                    item.id === coupon.id
                        ? { ...item, redeemed: item.redeemed + 1 }
                        : item
                )
            );

            setSales((prev) => [
                {
                    id: generateId('sale'),
                    date: redemptionDate,
                    branchId: validBranch,
                    total: redemptionAmount,
                    type: 'coupon',
                    couponId: coupon.id,
                    status: 'paid',
                },
                ...prev,
            ]);

            setBusinessInfo((prev) => ({
                ...prev,
                payout: {
                    ...prev.payout,
                    available: Number((prev.payout.available + redemptionAmount).toFixed(2)),
                },
            }));

            const remainingStock = Math.max(coupon.stock - (coupon.redeemed + 1), 0);

            return {
                status: 'success',
                message: 'Bono validado correctamente.',
                coupon: {
                    ...coupon,
                    redeemed: coupon.redeemed + 1,
                },
                redemption,
                remainingStock,
            };
        },
        [branches, businessInfo.averageTicket, coupons, redemptions]
    );

    const value = useMemo<BusinessContextType>(() => ({
        businessInfo,
        updateBusinessInfo,
        branches,
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
        redeemCouponByCode,
        redemptions,
        sales,
        reviews,
        metrics,
        events,
        addEvent,
        updateEvent,
        deleteEvent,
    }), [
        addBranch,
        addCatalogItem,
        addEvent,
        branches,
        businessInfo,
        catalog,
        coupons,
        createCoupon,
        deleteCatalogItem,
        deleteCoupon,
        deleteEvent,
        events,
        metrics,
        redeemCouponByCode,
        redemptions,
        reviews,
        sales,
        updateBranch,
        updateBusinessInfo,
        updateCatalogItem,
        updateCoupon,
        updateEvent,
    ]);

    return (
        <BusinessContext.Provider value={value}>
            {children}
        </BusinessContext.Provider>
    );
}

export function useBusiness(): BusinessContextType {
    const context = useContext(BusinessContext);
    if (!context) {
        throw new Error('useBusiness must be used within BusinessProvider');
    }
    return context;
}







