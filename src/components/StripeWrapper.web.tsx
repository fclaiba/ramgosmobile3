import React from 'react';

export const StripeWrapper = ({ children }: { children: React.ReactNode, publishableKey: string }) => {
    return <>{children}</>;
};
