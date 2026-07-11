import React, { createContext, useContext } from 'react';
const WalletContext = createContext<any>(null);
export function WalletProvider({ children }: { children: React.ReactNode }) {
    return <WalletContext.Provider value={{}}>{children}</WalletContext.Provider>;
}
export function useWallet() {
    return {
        balance: 0,
        transactions: [],
        deposit: () => {},
        withdraw: () => {},
    };
}