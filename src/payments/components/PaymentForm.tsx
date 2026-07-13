import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { CardField, useConfirmPayment } from '@stripe/stripe-react-native';
import { useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

// Fase 5 — camino único de pagos: api.stripe.createPaymentIntent (Stripe TEST)
// + confirmación con el SDK nativo. El simulador api.payments.actions quedó
// descartado (ver convex/payments/actions.ts).

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
        referralCode?: string;
    }>;
    onSuccess: (intentId: string) => void;
    onError: (err: string | null) => void;
    userId?: string;
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

export function PaymentForm({ amount, currency, cartId, lineItems, onSuccess, onError, theme }: PaymentFormProps) {
    const createPaymentIntent = useAction(api.stripe.createPaymentIntent);
    const { confirmPayment } = useConfirmPayment();
    const [loading, setLoading] = useState(false);
    const [cardComplete, setCardComplete] = useState(false);
    const { show } = useToast();
    const { sessionToken } = useAuth();

    const buildLineItems = () => {
        const items = (lineItems ?? []).map(i => ({
            listingId: i.listingId,
            sellerId: i.sellerId,
            type: 'product',
            amountInCents: Math.round(i.price * 100),
            referralCode: i.referralCode,
            quantity: i.quantity,
            description: i.title,
        }));
        // El total (amount) puede incluir envío; se agrega como ítem sintético
        // para que el monto cobrado en Stripe coincida con el resumen.
        const itemsTotal = items.reduce((s, i) => s + i.amountInCents * i.quantity, 0);
        const amountCents = Math.round(amount * 100);
        if (items.length > 0 && amountCents > itemsTotal) {
            items.push({
                listingId: 'shipping',
                sellerId: undefined,
                type: 'shipping',
                amountInCents: amountCents - itemsTotal,
                referralCode: undefined,
                quantity: 1,
                description: 'Costo de envío',
            });
        }
        return items;
    };

    const handlePay = async () => {
        setLoading(true);
        onError(null);
        try {
            const items = buildLineItems();
            const result = await createPaymentIntent({
                sessionToken,
                amountInCents: Math.round(amount * 100),
                lineItems: items.length > 0 ? items : undefined,
                cartId,
            });

            if (result.isMock || !result.clientSecret) {
                // Backend sin STRIPE_SECRET_KEY real: el server ya registró el
                // pago mock y procesó el carrito. No hay nada que confirmar.
                show('Pago test (mock) exitoso', 'success');
                onSuccess(result.paymentIntentId);
                return;
            }

            const { error, paymentIntent } = await confirmPayment(result.clientSecret, {
                paymentMethodType: 'Card',
            });
            if (error) {
                throw new Error(error.message);
            }

            show('Pago test exitoso', 'success');
            onSuccess(paymentIntent?.id ?? result.paymentIntentId);
        } catch (e: any) {
            const msg = e?.message || 'Error inesperado';
            onError(msg);
            show(msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    const accent = theme?.colors?.primary || '#4F46E5';
    const textColor = theme?.colors?.text || '#0F172A';
    const bg = theme?.colors?.background || '#FFFFFF';
    const border = theme?.colors?.border || '#E2E8F0';

    return (
        <View>
            <Text style={[st.label, { color: textColor }]}>Datos de la tarjeta</Text>
            <CardField
                postalCodeEnabled={false}
                placeholders={{ number: '4242 4242 4242 4242' }}
                onCardChange={(details) => setCardComplete(details.complete)}
                cardStyle={{
                    backgroundColor: bg,
                    textColor: textColor,
                    borderColor: border,
                    borderWidth: 1,
                    borderRadius: 12,
                }}
                style={st.cardField}
            />
            <TouchableOpacity
                onPress={handlePay}
                disabled={loading || amount <= 0 || !cardComplete}
                activeOpacity={0.85}
                style={[
                    st.payBtn,
                    {
                        backgroundColor: loading ? '#9CA3AF' : accent,
                        opacity: amount <= 0 || !cardComplete ? 0.5 : 1,
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
    label: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 8,
    },
    cardField: {
        width: '100%',
        height: 50,
        marginBottom: 16,
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
