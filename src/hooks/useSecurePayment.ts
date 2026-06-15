import { useStripe } from '@stripe/stripe-react-native';

export const useSecurePayment = () => {
    const { initPaymentSheet, presentPaymentSheet } = useStripe();

    const processPayment = async (clientSecret: string) => {
        // Initialize the PaymentSheet
        const { error: initError } = await initPaymentSheet({
            paymentIntentClientSecret: clientSecret,
            merchantDisplayName: 'Ramgos',
            allowsDelayedPaymentMethods: false,
            // If the backend generated an ephemeral key and customer id, we would pass them here
            // customerId: customer,
            // customerEphemeralKeySecret: ephemeralKey
        });

        if (initError) {
            return { error: initError.message };
        }

        // Present the native PaymentSheet bottom modal
        const { error: presentError } = await presentPaymentSheet();

        if (presentError) {
            return { error: presentError.message };
        }

        return { success: true };
    };

    return { processPayment };
};
