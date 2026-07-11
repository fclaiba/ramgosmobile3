import React, { createContext, useContext } from 'react';
const ReferralContext = createContext<any>(null);
export function ReferralProvider({ children }: { children: React.ReactNode }) {
    return <ReferralContext.Provider value={{}}>{children}</ReferralContext.Provider>;
}
export function useReferrals() {
    return {
        referrals: [],
        stats: {},
        generateReferralLink: async () => 'https://ramgos.com/ref/mock',
    };
}
export const useReferral = useReferrals;