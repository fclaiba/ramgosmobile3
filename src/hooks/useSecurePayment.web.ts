import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';

export const useSecurePayment = () => {
    const stripe = useStripe();
    const elements = useElements();

    const processPayment = async (clientSecret: string) => {
        if (!stripe || !elements) {
            return { error: 'Stripe js no ha cargado aún.' };
        }

        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
            return { error: 'No se encontró el elemento de tarjeta.' };
        }

        const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
            payment_method: {
                card: cardElement,
            },
        });

        if (error) {
            return { error: error.message };
        }

        return { paymentIntent, success: paymentIntent?.status === 'succeeded' };
    };

    return { processPayment };
};
