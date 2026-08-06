import React, { useMemo } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';

const cache = new Map<string, Promise<Stripe | null>>();

function getStripe(publishableKey: string) {
    let promise = cache.get(publishableKey);
    if (!promise) {
        promise = loadStripe(publishableKey);
        cache.set(publishableKey, promise);
    }
    return promise;
}

export function PaymentProvider({
    children,
    stripePublishableKey,
}: {
    children: React.ReactNode;
    stripePublishableKey: string;
}) {
    // Remount Elements when the publishable key changes (test ↔ live).
    // Avoid mutating the `stripe` prop on an already-mounted Elements tree.
    const stripePromise = useMemo(
        () => getStripe(stripePublishableKey),
        [stripePublishableKey],
    );

    return (
        <Elements
            key={stripePublishableKey}
            stripe={stripePromise}
            options={{
                appearance: {
                    theme: 'stripe',
                    variables: {
                        colorPrimary: '#2196F3',
                        borderRadius: '14px',
                    },
                },
            }}
        >
            {children}
        </Elements>
    );
}
