import type { PublicUser, SubscriptionTier } from '../contexts/AuthContext';

export type PaidSubscriptionTier = Exclude<SubscriptionTier, 'free'>; // 'pro' | 'business'

/**
 * Single source of truth for subscription pricing & perks (Sprint 2).
 * IMPORTANT: UI must consume this (no hardcoded 2.99 / 5.99 elsewhere).
 */
export const SUBSCRIPTION_PLANS: Record<
    PaidSubscriptionTier,
    {
        tier: PaidSubscriptionTier;
        priceMonthlyUsd: number;
        displayName: string;
        perks: string[];
    }
> = {
    pro: {
        tier: 'pro',
        priceMonthlyUsd: 2.99,
        displayName: 'Membresía Usuario PRO',
        perks: [
            "Insignia 'PRO' única en tu perfil",
            'Doble chance automática en rifas',
            'Skins exclusivas para tu mascota',
            'Soporte prioritario 24/7',
            'Acceso anticipado a eventos',
        ],
    },
    business: {
        tier: 'business',
        priceMonthlyUsd: 5.99,
        displayName: 'Membresía Negocio Verificado',
        perks: [
            'Badge de Verificación Oficial',
            'Publicación de productos ilimitada',
            'Visibilidad prioritaria en mapa',
            'Panel de analíticas avanzado',
            'Herramientas de marketing exclusivas',
        ],
    },
};

export function isSubscriptionActive(user: PublicUser | null | undefined, tier: SubscriptionTier): boolean {
    if (!user) return false;
    if (tier === 'free') return true;
    return user.subscriptionTier === tier && user.subscriptionStatus === 'active';
}

