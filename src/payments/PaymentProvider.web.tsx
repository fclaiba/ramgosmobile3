import React, { useMemo } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

export function PaymentProvider({ children, stripePublishableKey }: { children: React.ReactNode, stripePublishableKey: string }) {
    const stripePromise = useMemo(() => loadStripe(stripePublishableKey), [stripePublishableKey]);
    
    return (
        <Elements stripe={stripePromise}>
            {children}
        </Elements>
    );
}
