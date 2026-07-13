import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';
import { Id } from '../../convex/_generated/dataModel';

export interface FavoriteItem {
    id: string | number;
    type: 'product' | 'bono' | 'event' | 'service' | 'bonus';
    name: string;
    price: number;
    image: string;
    category: string;
    rating?: number;
    discount?: number;
    location?: string;
    description?: string;
    date?: string;
    business?: string;
    savedDate: string;
    originalItem?: any;
}

export const useFavorites = () => {
    const { user, sessionToken } = useAuth();

    // Query favorites from Convex
    const favoritesData = useQuery(
        api.favorites.getMyFavorites,
        user ? { sessionToken, userId: user.id } : "skip"
    );

    // Mutations
    const addFavoriteMutation = useMutation(api.favorites.addFavorite);
    const removeFavoriteMutation = useMutation(api.favorites.removeFavorite);

    // Transform to match legacy FavoritesContext interface
    const favorites: FavoriteItem[] = favoritesData?.map(f => ({
        id: f.listingId,
        type: (f.listing?.type as any) || 'product',
        name: f.listing?.title || '',
        price: f.listing?.price || 0,
        image: f.listing?.image || '',
        category: f.listing?.category || '',
        rating: f.listing?.averageRating,
        discount: (f.listing as any)?.discount,
        location: f.listing?.location?.name || '',
        business: f.listing?.location?.name || '',
        description: f.listing?.description || '',
        date: (f.listing as any)?.date,
        savedDate: f.addedAt,
        originalItem: f.listing,
    })) || [];

    const isFavorite = (listingId: string | number) => {
        const id = typeof listingId === 'number' ? String(listingId) : listingId;
        return favoritesData?.some(f => f.listingId === id) || false;
    };

    const addToFavorites = async (item: any) => {
        if (!user) return;
        const itemId = typeof item.id === 'number' ? String(item.id) : item.id;
        if (isFavorite(itemId)) return;

        await addFavoriteMutation({
            sessionToken, userId: user.id,
            listingId: itemId as Id<"listings">,
        });
    };

    const removeFromFavorites = async (id: string | number) => {
        if (!user) return;
        const listingId = typeof id === 'number' ? String(id) : id;

        await removeFavoriteMutation({
            sessionToken, userId: user.id,
            listingId: listingId as Id<"listings">,
        });
    };

    const toggleFavorite = async (item: any) => {
        if (!user) return;

        if (isFavorite(item.id)) {
            await removeFromFavorites(item.id);
        } else {
            await addToFavorites(item);
        }
    };

    return {
        favorites,
        addToFavorites,
        removeFromFavorites,
        isFavorite,
        toggleFavorite,
    };
};
