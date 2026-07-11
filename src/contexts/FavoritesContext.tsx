import React, { createContext, useContext } from 'react';
import { useFavorites as useRealFavorites, FavoriteItem } from '../hooks/useFavorites';

interface FavoritesContextValue {
    favorites: FavoriteItem[];
    isFavorite: (id: string | number) => boolean;
    toggleFavorite: (item: any) => Promise<void>;
    addToFavorites: (item: any) => Promise<void>;
    removeFromFavorites: (id: string | number) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue>({
    favorites: [],
    isFavorite: () => false,
    toggleFavorite: async () => {},
    addToFavorites: async () => {},
    removeFromFavorites: async () => {},
});

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
    const favoritesHook = useRealFavorites();

    return (
        <FavoritesContext.Provider value={favoritesHook}>
            {children}
        </FavoritesContext.Provider>
    );
}

export function useFavorites() {
    return useContext(FavoritesContext);
}
