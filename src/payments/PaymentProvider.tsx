import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

/**
 * `urlScheme` es obligatorio para que 3D Secure / redirecciones vuelvan a la
 * app; `merchantIdentifier` habilita Apple Pay (mismo valor que app.json).
 */
export function PaymentProvider({ children, stripePublishableKey }: { children: React.ReactNode; stripePublishableKey: string }) {
    return (
        <StripeProvider
            publishableKey={stripePublishableKey}
            urlScheme="ramgos"
            merchantIdentifier="com.fclaiba.ramgosmobile.merchant"
        >
            <>{children}</>
        </StripeProvider>
    );
}
