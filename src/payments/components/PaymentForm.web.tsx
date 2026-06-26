import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useStripe, useElements, CardNumberElement, CardExpiryElement, CardCvcElement } from '@stripe/react-stripe-js';
import { useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { AnimatedCreditCard } from './AnimatedCreditCard';

interface PaymentFormProps {
    amount: number;
    currency: string;
    cartId?: string;
    onSuccess: (intentId: string) => void;
    onError: (error: string | null) => void;
    theme?: any;
}

export function PaymentForm({ amount, currency, cartId, onSuccess, onError, theme }: PaymentFormProps) {
    const stripe = useStripe();
    const elements = useElements();
    const createPaymentIntent = useAction(api.payments.actions.createPaymentIntent);
    
    const [loading, setLoading] = useState(false);
    const [isFlipped, setIsFlipped] = useState(false);
    
    const [brand, setBrand] = useState('unknown');
    const [allComplete, setAllComplete] = useState(false);
    
    const [numComplete, setNumComplete] = useState(false);
    const [expComplete, setExpComplete] = useState(false);
    const [cvcComplete, setCvcComplete] = useState(false);

    const handlePay = async () => {
        if (!stripe || !elements) return;
        setLoading(true);
        onError(null);
        try {
            const result = await createPaymentIntent({ amount, currency, cartId });

            const confirmResult = await stripe.confirmCardPayment(result.clientSecret, {
                payment_method: {
                    card: elements.getElement(CardNumberElement) as any
                }
            });

            if (confirmResult.error) {
                throw new Error(confirmResult.error.message);
            } else if (confirmResult.paymentIntent?.status === 'succeeded') {
                onSuccess(result.id);
            }
        } catch (e: any) {
            onError(e.message || 'Error inesperado');
        } finally {
            setLoading(false);
        }
    };

    const textCol = theme?.colors?.text || '#1F2937';
    const mutedCol = theme?.colors?.textSecondary || '#9CA3AF';
    const borderCol = theme?.colors?.border || '#E5E7EB';
    const bgCol = theme?.colors?.background || '#fff';
    const accent = theme?.colors?.primary || '#4F46E5';

    const elStyles = {
        base: {
            fontSize: '16px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: textCol,
            '::placeholder': { color: mutedCol },
        },
        invalid: { color: '#EF4444' }
    };

    React.useEffect(() => {
        setAllComplete(numComplete && expComplete && cvcComplete);
    }, [numComplete, expComplete, cvcComplete]);

    return (
        <View>
            <AnimatedCreditCard
                brand={brand}
                number={""} // Stripe blocks reading the real value on Web
                expiry={""}
                cvc={""}
                isFlipped={isFlipped}
            />

            <Text style={[st.label, { color: mutedCol }]}>Número de tarjeta</Text>
            <View style={[st.fieldBox, { borderColor: borderCol, backgroundColor: bgCol }]}>
                <CardNumberElement 
                    options={{ style: elStyles, showIcon: false }} 
                    onChange={(e) => {
                        setBrand(e.brand || 'unknown');
                        setNumComplete(e.complete);
                    }}
                    onFocus={() => setIsFlipped(false)}
                />
            </View>

            <View style={st.row}>
                <View style={st.halfLeft}>
                    <Text style={[st.label, { color: mutedCol }]}>Vencimiento</Text>
                    <View style={[st.fieldBox, { borderColor: borderCol, backgroundColor: bgCol }]}>
                        <CardExpiryElement 
                            options={{ style: elStyles }} 
                            onChange={(e) => setExpComplete(e.complete)}
                            onFocus={() => setIsFlipped(false)}
                        />
                    </View>
                </View>
                <View style={st.halfRight}>
                    <Text style={[st.label, { color: mutedCol }]}>CVV</Text>
                    <View style={[st.fieldBox, { borderColor: borderCol, backgroundColor: bgCol }]}>
                        <CardCvcElement 
                            options={{ style: elStyles }} 
                            onChange={(e) => setCvcComplete(e.complete)}
                            onFocus={() => setIsFlipped(true)}
                            onBlur={() => setIsFlipped(false)}
                        />
                    </View>
                </View>
            </View>

            <TouchableOpacity
                onPress={handlePay}
                disabled={loading || !stripe || !allComplete}
                activeOpacity={0.85}
                style={[st.payBtn, { backgroundColor: accent, opacity: allComplete ? 1 : 0.4 }]}
            >
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={st.payBtnText}>
                        {allComplete ? `Pagar $${amount.toFixed(2)}` : 'Completá los datos'}
                    </Text>
                )}
            </TouchableOpacity>
        </View>
    );
}

const st = StyleSheet.create({
    label: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 8,
        marginTop: 16,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    halfLeft: { flex: 1 },
    halfRight: { flex: 1 },
    fieldBox: {
        height: 48,
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
    },
    payBtn: {
        height: 54,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 28,
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
