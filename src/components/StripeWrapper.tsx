import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

export const StripeWrapper = ({ children, publishableKey }: { children: React.ReactElement | React.ReactElement[], publishableKey: string }) => {
    return (
        <StripeProvider publishableKey={publishableKey}>
            {children}
        </StripeProvider>
    );
};
