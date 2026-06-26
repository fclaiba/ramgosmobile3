import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface WishlistItem {
    productId: string;
    addedAt: string;
    referralCode?: string;
}

const WISHLIST_STORAGE_KEY = '@ramgos/marketplace/wishlist';

export const useWishlist = () => {
    const [wishlist, setWishlist] = useState<WishlistItem[]>([]);

    useEffect(() => {
        const load = async () => {
            try {
                const raw = await AsyncStorage.getItem(WISHLIST_STORAGE_KEY);
                if (raw) {
                    setWishlist(JSON.parse(raw));
                }
            } catch (e) {
                console.error("Failed to load wishlist", e);
            }
        };
        load();
    }, []);

    const save = async (newList: WishlistItem[]) => {
        setWishlist(newList);
        try {
            await AsyncStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(newList));
        } catch (e) {
            console.error("Failed to save wishlist", e);
        }
    };

    const addToWishlist = useCallback((productId: string, referralCode?: string) => {
        setWishlist((prev) => {
            if (prev.some(w => w.productId === productId)) return prev;
            const newList = [...prev, { productId, addedAt: new Date().toISOString(), referralCode }];
            AsyncStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(newList)).catch(console.error);
            return newList;
        });
    }, []);

    const removeFromWishlist = useCallback((productId: string) => {
        setWishlist((prev) => {
            const newList = prev.filter(w => w.productId !== productId);
            AsyncStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(newList)).catch(console.error);
            return newList;
        });
    }, []);

    const isWishlisted = useCallback((productId: string) => {
        return wishlist.some(w => w.productId === productId);
    }, [wishlist]);

    return { wishlist, addToWishlist, removeFromWishlist, isWishlisted };
};
