import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useToast } from '../../contexts/ToastContext';

interface PaymentFormProps {
    amount: number;
    currency: string;
    cartId?: string;
    lineItems?: Array<{
        listingId: string;
        sellerId?: string;
        title: string;
        price: number;
        quantity: number;
    }>;
    onSuccess: (intentId: string) => void;
    onError: (error: string | null) => void;
    theme?: any;
}

export function PaymentForm({ amount, currency, cartId, lineItems, onSuccess, onError, theme }: PaymentFormProps) {
    const createPaymentIntent = useAction(api.payments.actions.createPaymentIntent);
    const [loading, setLoading] = useState(false);
    const { show } = useToast();

    const handlePay = async () => {
        setLoading(true);
        onError(null);
        try {
            const result = await createPaymentIntent({
                amount,
                currency,
                cartId,
                mode: 'test' as const,
                lineItems,
            });

            show('Pago simulado exitoso', 'success');
            onSuccess(result.id);
        } catch (e: any) {
            const msg = e?.message || 'Error inesperado';
            onError(msg);
            show(msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    const accent = theme?.colors?.primary || '#4F46E5';

    return (
        <View>
            <TouchableOpacity
                onPress={handlePay}
                disabled={loading || amount <= 0}
                activeOpacity={0.85}
                style={[
                    st.payBtn,
                    {
                        backgroundColor: loading ? '#9CA3AF' : accent,
                        opacity: amount <= 0 ? 0.5 : 1,
                    },
                ]}
            >
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={st.payBtnText}>
                        {amount > 0 ? `Pagar $${amount.toFixed(2)}` : 'Sin monto'}
                    </Text>
                )}
            </TouchableOpacity>
        </View>
    );
}

const st = StyleSheet.create({
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