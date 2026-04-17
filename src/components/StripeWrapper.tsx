import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

export const StripeWrapper = ({ children, publishableKey }: { children: React.ReactNode, publishableKey: string }) => {
    return <StripeProvider publishableKey={publishableKey}>{children}</StripeProvider>;
};
