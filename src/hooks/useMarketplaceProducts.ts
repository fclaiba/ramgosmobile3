import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
export function useMarketplaceProducts(): any[] {
    const liveProducts = useQuery(api.listings.getFeed) ?? [];

    const products: Product[] = useMemo(() => {
        if (!Array.isArray(liveProducts)) return [];
        return liveProducts.filter((p: any) => p && p._id).map((p: any) => ({
            ...p,
            id: p._id,
            metrics: p.metrics ?? { views: 0, favorites: 0, orders: 0 },
            seller: p.sellerId ? { 
                id: p.sellerId, 
                name: p.seller?.name || 'Unknown', 
                username: p.seller?.username || (p.seller?.name ? `@${p.seller.name.toLowerCase().replace(/\s+/g, '')}` : '@vendedor'),
                avatar: p.seller?.avatar,
                type: p.seller?.type || 'individual', 
                rating: p.seller?.sellerRating || 0 
            } : { 
                id: 'unknown', 
                name: 'Unknown', 
                username: '@vendedor',
                type: 'individual', 
                rating: 0 
            },
            shippingProfile: p.shippingProfile ?? { weightKg: 1, allowPickup: false, shipsFrom: { city: 'Unknown', country: 'AR', postalCode: '0000' }, handlingTimeHours: 24 },
            images: p.images ?? [
                ...(p.image ? [{ id: 'main', url: p.image, isPrimary: true }] : []),
                ...(p.gallery ? p.gallery.map((url: string, idx: number) => ({ id: `gal_${idx}`, url, isPrimary: false })) : [])
            ],
        }));
    }, [liveProducts]);

    return products;
}
