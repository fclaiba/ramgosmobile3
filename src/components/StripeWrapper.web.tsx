import React, { useMemo } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

export const StripeWrapper = ({ children, publishableKey }: { children: React.ReactElement | React.ReactElement[], publishableKey: string }) => {
    // Only load stripe once per publishableKey
    const stripePromise = useMemo(() => {
        if (!publishableKey) return null;
        return loadStripe(publishableKey);
    }, [publishableKey]);

    if (!stripePromise) {
        return <>{children}</>;
    }

    return (
        <Elements stripe={stripePromise}>
            {children}
        </Elements>
    );
};
