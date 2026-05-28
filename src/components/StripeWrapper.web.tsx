import React from 'react';

/**
 * Web shim for StripeWrapper.
 * @stripe/stripe-react-native is native-only and cannot be imported on web.
 * On web we simply render children without a Stripe provider.
 */
export const StripeWrapper = ({ children }: { children: React.ReactElement | React.ReactElement[], publishableKey: string }) => {
    return <>{children}</>;
};
