import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

export function PaymentProvider({ children, stripePublishableKey }: { children: React.ReactNode, stripePublishableKey: string }) {
    return (
        <StripeProvider publishableKey={stripePublishableKey}>
            <>{children}</>
        </StripeProvider>
    );
}