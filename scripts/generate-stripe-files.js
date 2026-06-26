const fs = require('fs');
const path = require('path');

const files = {
    'src/payments/PaymentProvider.tsx': `import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

export function PaymentProvider({ children, stripePublishableKey }: { children: React.ReactNode, stripePublishableKey: string }) {
    return (
        <StripeProvider publishableKey={stripePublishableKey}>
            {children}
        </StripeProvider>
    );
}`,
    'src/payments/components/PaymentForm.tsx': `import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useStripe, CardField } from '@stripe/stripe-react-native';
import { useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export function PaymentForm({ amount, currency, onSuccess, onError, theme }: any) {
    const { confirmPayment } = useStripe();
    const createPaymentIntent = useAction(api.payments.actions.createPaymentIntent);
    const [loading, setLoading] = useState(false);

    const handlePay = async () => {
        setLoading(true);
        try {
            const { clientSecret, id } = await createPaymentIntent({ amount, currency });
            const { error, paymentIntent } = await confirmPayment(clientSecret, {
                paymentMethodType: 'Card',
            });
            if (error) {
                onError(error.message);
            } else if (paymentIntent) {
                onSuccess(id);
            }
        } catch (e: any) {
            onError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={{ padding: 16 }}>
            <CardField
                postalCodeEnabled={false}
                style={{ height: 50, marginVertical: 20 }}
            />
            <TouchableOpacity 
                onPress={handlePay} 
                disabled={loading}
                style={{ backgroundColor: theme?.colors?.primary || '#000', padding: 16, borderRadius: 8, alignItems: 'center' }}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Pagar Ahora</Text>}
            </TouchableOpacity>
        </View>
    );
}`,
    'src/payments/components/SavedCardsList.tsx': `import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export function SavedCardsList({ onSelectCard, selectedCardId }: any) {
    return (
        <View style={{ padding: 16 }}>
            <Text style={{ color: '#6B7280', textAlign: 'center' }}>No tienes tarjetas guardadas.</Text>
        </View>
    );
}`,
    'src/payments/hooks/useSavedCards.ts': `export function useSavedCards() {
    return {
        savedCards: [],
        chargeWithSavedCard: async () => ({ success: false, error: 'Not implemented' }),
        loadingState: {},
    };
}`,
    'convex/payments/actions.ts': `import { action } from "../_generated/server";
import { v } from "convex/values";
import Stripe from "stripe";

export const createPaymentIntent = action({
    args: { amount: v.number(), currency: v.string() },
    handler: async (ctx, args) => {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-06-24.dahlia" as any });
        const paymentIntent = await stripe.paymentIntents.create({
            amount: args.amount,
            currency: args.currency,
        });
        return { clientSecret: paymentIntent.client_secret!, id: paymentIntent.id };
    },
});`
};

for (const [filepath, content] of Object.entries(files)) {
    const fullPath = path.join(__dirname, '..', filepath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content);
}
console.log('Files generated successfully.');
