import React, { createContext, useContext } from 'react';
const MarketplaceContext = createContext<any>(null);
export function MarketplaceProvider({ children }: { children: React.ReactNode }) {
    return <MarketplaceContext.Provider value={{}}>{children}</MarketplaceContext.Provider>;
}
export function useMarketplace() {
    return {
        listings: [],
        categories: [],
        searchListings: () => [],
    };
}