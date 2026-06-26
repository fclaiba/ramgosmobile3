import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useStripe, CardField } from '@stripe/stripe-react-native';
import { useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { AnimatedCreditCard } from './AnimatedCreditCard';

interface PaymentFormProps {
    amount: number;
    currency: string;
    cartId?: string;
    onSuccess: (intentId: string) => void;
    onError: (err: string | null) => void;
    theme?: {
        colors?: {
            background?: string;
            primary?: string;
            text?: string;
            textSecondary?: string;
            border?: string;
        };
    };
}

export function PaymentForm({ amount, currency, cartId, onSuccess, onError, theme }: PaymentFormProps) {
    const { confirmPayment } = useStripe();
    const createPaymentIntent = useAction(api.payments.actions.createPaymentIntent);
    const [loading, setLoading] = useState(false);
    const [isFlipped, setIsFlipped] = useState(false);
    const [card, setCard] = useState({ brand: '', number: '', expiry: '', cvc: '', complete: false });

    const handlePay = async () => {
        setLoading(true);
        onError(null);
        try {
            const { clientSecret, id } = await createPaymentIntent({ amount, currency, cartId });
            const { error, paymentIntent } = await confirmPayment(clientSecret, {
                paymentMethodType: 'Card',
            });
            if (error) {
                onError(error.message);
            } else if (paymentIntent) {
                onSuccess(id);
            }
        } catch (e: any) {
            onError(e.message || 'Error inesperado');
        } finally {
            setLoading(false);
        }
    };

    const bg = theme?.colors?.background || '#FFFFFF';
    const accent = theme?.colors?.primary || '#4F46E5';
    const textCol = theme?.colors?.text || '#1F2937';
    const mutedCol = theme?.colors?.textSecondary || '#9CA3AF';
    const borderCol = theme?.colors?.border || '#E5E7EB';

    return (
        <View>
            <AnimatedCreditCard
                brand={card.brand}
                number={card.number}
                expiry={card.expiry}
                cvc={card.cvc}
                isFlipped={isFlipped}
            />

            <Text style={[st.fieldLabel, { color: mutedCol }]}>Datos de la tarjeta</Text>

            <CardField
                postalCodeEnabled={false}
                dangerouslyGetFullCardDetails={true}
                onCardChange={(details: any) => {
                    const exp = details.expiryMonth && details.expiryYear
                        ? `${String(details.expiryMonth).padStart(2, '0')}/${String(details.expiryYear).slice(-2)}`
                        : '';
                    setCard({
                        brand: details.brand || '',
                        number: details.number || '',
                        expiry: exp,
                        cvc: details.cvc || '',
                        complete: details.complete || false,
                    });
                }}
                onFocus={(field: string) => setIsFlipped(field === 'Cvc')}
                style={st.cardField}
                cardStyle={{
                    backgroundColor: bg,
                    textColor: textCol,
                    placeholderColor: mutedCol,
                    borderColor: borderCol,
                    borderWidth: 1,
                    borderRadius: 12,
                    fontSize: 16,
                }}
            />

            <TouchableOpacity
                onPress={handlePay}
                disabled={loading || !card.complete}
                activeOpacity={0.85}
                style={[
                    st.payBtn,
                    { 
                        backgroundColor: card.complete ? accent : '#D1D5DB', // gray if incomplete
                        opacity: card.complete ? 1 : 0.7 
                    },
                ]}
            >
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={[
                        st.payBtnText, 
                        { color: card.complete ? '#fff' : '#6B7280' }
                    ]}>
                        {card.complete ? `Pagar $${amount.toFixed(2)}` : `Completá los datos para pagar $${amount.toFixed(2)}`}
                    </Text>
                )}
            </TouchableOpacity>
        </View>
    );
}

const st = StyleSheet.create({
    fieldLabel: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 10,
    },
    cardField: {
        height: 52,
        marginBottom: 24,
    },
    payBtn: {
        height: 54,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 6,
    },
    payBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.4,
    },
});