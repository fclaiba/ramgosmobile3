import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

interface PlatformProduct {
    _id: string;
    stripeProductId: string;
    stripePriceId: string;
    name: string;
    description?: string;
    priceInCents: number;
    currency: string;
    connectedAccountId: string;
}

interface AccountStatus {
    readyToReceivePayments: boolean;
    onboardingComplete: boolean;
    requirementsStatus?: string;
}

interface StripeConnectContextType {
    accountId: string | null;
    accountStatus: AccountStatus | null;
    isLoading: boolean;
    createAccount: (displayName: string, email: string) => Promise<void>;
    startOnboarding: () => Promise<string | null>;
    refreshStatus: () => Promise<void>;
    createProduct: (name: string, description: string, price: number, currency: string) => Promise<void>;
    buyProduct: (priceId: string, connectedAccountId: string) => Promise<string | null>;
    products: PlatformProduct[] | undefined;
}

const StripeConnectContext = createContext<StripeConnectContextType | undefined>(undefined);

export const StripeConnectProvider = ({ children }: { children: ReactNode }) => {
    const [accountId, setAccountId] = useState<string | null>(null);
    const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Convex Actions
    const createConnectedAccountAction = useAction(api.connectV2.createConnectedAccount);
    const createAccountLinkAction = useAction(api.connectV2.createAccountLink);
    const getAccountStatusAction = useAction(api.connectV2.getAccountStatus);
    const createPlatformProductAction = useAction(api.connectV2.createPlatformProduct);
    const createCheckoutSessionAction = useAction(api.connectV2.createCheckoutSession);
    
    // Convex Queries
    const products = useQuery(api.connectV2.getPlatformProducts) as PlatformProduct[] | undefined;

    const createAccount = async (displayName: string, email: string) => {
        setIsLoading(true);
        try {
            // Hardcoded dummy user ID for demo purposes
            const result = await createConnectedAccountAction({
                userId: "jd789" as any, 
                displayName,
                contactEmail: email,
            });
            setAccountId(result.accountId);
            await refreshStatus(result.accountId);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const startOnboarding = async () => {
        if (!accountId) return null;
        setIsLoading(true);
        try {
            const result = await createAccountLinkAction({
                accountId,
                refreshUrl: 'https://ramgos.com/refresh', // Fallback URLs for demo
                returnUrl: `https://ramgos.com/return?accountId=${accountId}`,
            });
            return result.url;
        } catch (error) {
            console.error(error);
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    const refreshStatus = async (idToUse?: string) => {
        const id = idToUse || accountId;
        if (!id) return;
        setIsLoading(true);
        try {
            const status = await getAccountStatusAction({ accountId: id });
            setAccountStatus(status as AccountStatus);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const createProduct = async (name: string, description: string, price: number, currency: string) => {
        if (!accountId) return;
        setIsLoading(true);
        try {
            await createPlatformProductAction({
                name,
                description,
                priceInCents: price,
                currency,
                connectedAccountId: accountId,
            });
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const buyProduct = async (priceId: string, connectedAccountId: string) => {
        setIsLoading(true);
        try {
            const result = await createCheckoutSessionAction({
                stripePriceId: priceId,
                connectedAccountId: connectedAccountId,
                successUrl: 'https://ramgos.com/success',
            });
            return result.url;
        } catch (error) {
            console.error(error);
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <StripeConnectContext.Provider value={{
            accountId,
            accountStatus,
            isLoading,
            createAccount,
            startOnboarding,
            refreshStatus,
            createProduct,
            buyProduct,
            products
        }}>
            {children}
        </StripeConnectContext.Provider>
    );
};

export const useStripeConnect = () => {
    const context = useContext(StripeConnectContext);
    if (context === undefined) {
        throw new Error('useStripeConnect must be used within a StripeConnectProvider');
    }
    return context;
};
