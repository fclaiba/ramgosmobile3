import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define a unified Item interface that covers both Marketplace and Saved needs
// We will store the data as it comes from Marketplace but adapter might be needed for SavedScreen
export interface FavoriteItem {
    id: string | number;
    type: 'product' | 'bono' | 'event' | 'service' | 'bonus'; // handling both 'bono' and 'bonus' just in case
    name: string; // Title
    price: number;
    image: string;
    category: string;
    rating?: number;
    discount?: number;
    location?: string; // Flattened to string
    description?: string;
    date?: string; // For events
    business?: string; // Mapped from location.name usually
    savedDate: string;
    originalItem?: any; // Store the full original object just in case
}

interface FavoritesContextType {
    favorites: FavoriteItem[];
    addToFavorites: (item: any) => void;
    removeFromFavorites: (id: string | number) => void;
    isFavorite: (id: string | number) => boolean;
    toggleFavorite: (item: any) => void;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export const FavoritesProvider = ({ children }: { children: ReactNode }) => {
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

    const isFavorite = (id: string | number) => {
        return favorites.some(item => item.id === id);
    };

    const addToFavorites = (item: any) => {
        if (isFavorite(item.id)) return;

        // Map Marketplace item to FavoriteItem
        const newItem: FavoriteItem = {
            id: item.id,
            type: item.type,
            name: item.name || item.title,
            price: item.price || 0,
            image: item.image,
            category: item.category,
            rating: item.rating,
            discount: item.discount,
            location: typeof item.location === 'object' ? item.location?.name : item.location,
            business: typeof item.location === 'object' ? item.location?.name : item.business,
            date: item.date,
            description: item.description,
            savedDate: new Date().toISOString(),
            originalItem: item
        };

        setFavorites(prev => [...prev, newItem]);
    };

    const removeFromFavorites = (id: string | number) => {
        setFavorites(prev => prev.filter(item => item.id !== id));
    };

    const toggleFavorite = (item: any) => {
        if (isFavorite(item.id)) {
            removeFromFavorites(item.id);
        } else {
            addToFavorites(item);
        }
    };

    return (
        <FavoritesContext.Provider value={{ favorites, addToFavorites, removeFromFavorites, isFavorite, toggleFavorite }}>
            {children}
        </FavoritesContext.Provider>
    );
};

export const useFavorites = () => {
    const context = useContext(FavoritesContext);
    if (!context) {
        throw new Error('useFavorites must be used within a FavoritesProvider');
    }
    return context;
};
