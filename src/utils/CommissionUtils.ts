
export interface CommissionRule {
    categoryId: string;
    feePercentage: number;
}

export const DEFAULT_COMMISSION_RATE = 0.10; // 10% default

export const CATEGORY_COMMISSIONS: Record<string, number> = {
    'electronics': 0.08, // 8% for electronics
    'clothing': 0.12,    // 12% for clothing
    'home': 0.10,        // 10% for home
    'beauty': 0.10,
    'sports': 0.10,
    'toys': 0.10,
    'vehicles': 0.05,    // 5% for vehicles (high ticket)
    'real_estate': 0.03, // 3% for real estate
    'services': 0.15     // 15% for services
};

const stripAccents = (value: string) =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

const COMMISSION_CATEGORY_ALIASES: Record<string, string> = {
    // Spanish -> canonical ids
    'electronica': 'electronics',
    'electrónica': 'electronics',
    'moda': 'clothing',
    'ropa': 'clothing',
    'hogar': 'home',
    'casa': 'home',
    'belleza': 'beauty',
    'deportes': 'sports',
    'juguetes': 'toys',
    'vehiculos': 'vehicles',
    'vehículos': 'vehicles',
    'inmuebles': 'real_estate',
    'bienes_raices': 'real_estate',
    'bienes raíces': 'real_estate',
    'servicios': 'services',

    // Common fallbacks
    'general': 'general',
};

const normalizeCommissionCategory = (category: string): string => {
    const raw = (category ?? '').toString().trim().toLowerCase();
    if (!raw) return 'general';

    const normalized = stripAccents(raw);
    return COMMISSION_CATEGORY_ALIASES[raw] ?? COMMISSION_CATEGORY_ALIASES[normalized] ?? normalized;
};

export const calculateCommission = (amount: number, category: string): number => {
    const categoryKey = normalizeCommissionCategory(category);
    const rate = CATEGORY_COMMISSIONS[categoryKey] || DEFAULT_COMMISSION_RATE;
    return Number((amount * rate).toFixed(2));
};

export const calculateInfluencerCommission = (amount: number, splitPercentage: number): number => {
    return Number((amount * (splitPercentage / 100)).toFixed(2));
};
