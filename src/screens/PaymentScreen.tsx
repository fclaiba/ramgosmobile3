import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ArrowLeft, Shield } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PaymentForm } from '../payments/components/PaymentForm';
import { PaymentSuccessBurst } from '../payments/components/PaymentSuccessBurst';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { glassGradient, glassTokens } from '../utils/glass';

// Pedidos Ya–style checkout shell + PaymentForm (carrusel / puntos / CTA).

export default function PaymentScreen({ navigation, route }: any) {
    const { user } = useAuth();
    const userId = (user as any)?.id || (user as any)?._id;

    const subtotal = Number(route.params?.subtotal) || Number(route.params?.amount) || 0;
    const shippingCost = Number(route.params?.shippingCost) || 0;
    const currency = route.params?.currency || 'usd';
    const finalAmount = Math.max(0, subtotal + shippingCost);

    const cartItems = route.params?.cartItems || [];
    const lineItems = cartItems.map((item: any) => ({
        listingId: item.id,
        sellerId: item.sellerId || 'ramgos',
        title: item.name,
        price: item.price,
        quantity: item.quantity,
        referralCode: item.referralCode,
    }));

    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const cartId = useMemo(() => `cart_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, []);

    const { colorScheme } = useTheme();
    const dark = colorScheme === 'dark';
    const glass = glassTokens(dark);
    const grad = glassGradient(dark);

    const C = {
        text: dark ? '#F1F5F9' : '#0F172A',
        muted: dark ? '#94A3B8' : '#64748B',
        border: dark ? '#334155' : '#E2E8F0',
        accent: '#E31C3D',
        success: '#10B981',
        card: dark ? '#1E293B' : '#FFFFFF',
    };

    const fmt = (v: number) => `$${v.toFixed(2)}`;

    if (isSuccess) {
        return (
            <PaymentSuccessBurst
                amount={finalAmount}
                dark={dark}
                onDone={() => navigation.navigate('Marketplace')}
            />
        );
    }

    return (
        <View style={st.root}>
            <LinearGradient colors={grad} style={StyleSheet.absoluteFill} />

            <View style={[st.header, glass as any, { borderBottomColor: C.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={16} style={st.backBtn}>
                    <ArrowLeft color={C.text} size={22} />
                </TouchableOpacity>
                <View style={st.headerCenter}>
                    <Shield color={C.accent} size={16} />
                    <Text style={[st.headerTitle, { color: C.text }]}>Checkout</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                style={st.scroll}
                contentContainerStyle={st.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={[st.summaryCard, glass as any]}>
                    <View style={st.summaryRow}>
                        <Text style={[st.summaryLabel, { color: C.muted }]}>Subtotal</Text>
                        <Text style={[st.summaryVal, { color: C.text }]}>{fmt(subtotal)}</Text>
                    </View>
                    {shippingCost > 0 && (
                        <View style={st.summaryRow}>
                            <Text style={[st.summaryLabel, { color: C.muted }]}>Envío</Text>
                            <Text style={[st.summaryVal, { color: C.text }]}>{fmt(shippingCost)}</Text>
                        </View>
                    )}
                    <View style={[st.divider, { backgroundColor: C.border }]} />
                    <View style={st.summaryRow}>
                        <Text style={[st.totalLabel, { color: C.text }]}>Total</Text>
                        <Text style={[st.totalVal, { color: C.accent }]}>{fmt(finalAmount)}</Text>
                    </View>
                </View>

                <PaymentForm
                    amount={finalAmount}
                    currency={currency}
                    cartId={cartId}
                    lineItems={lineItems}
                    userId={userId}
                    onSuccess={() => setIsSuccess(true)}
                    onError={setError}
                    theme={{
                        dark,
                        colors: {
                            background: C.card,
                            primary: C.accent,
                            text: C.text,
                            textSecondary: C.muted,
                            border: C.border,
                        },
                    }}
                />

                {error && (
                    <View style={st.errorBanner}>
                        <Text style={st.errorText}>{error}</Text>
                    </View>
                )}

                <View style={st.trust}>
                    <Shield size={14} color={C.muted} />
                    <Text style={[st.trustText, { color: C.muted }]}>Stripe TEST · SSL</Text>
                </View>
                <View style={{ height: 48 }} />
            </ScrollView>
        </View>
    );
}

const st = StyleSheet.create({
    root: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 40 : 56,
        paddingBottom: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: { width: 40, height: 40, justifyContent: 'center' },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerTitle: { fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, gap: 16 },
    summaryCard: { borderRadius: 16, borderWidth: 1, padding: 18 },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    summaryLabel: { fontSize: 14 },
    summaryVal: { fontSize: 14, fontWeight: '600' },
    divider: { height: 1, marginVertical: 8 },
    totalLabel: { fontSize: 16, fontWeight: '800' },
    totalVal: { fontSize: 22, fontWeight: '900' },
    errorBanner: {
        backgroundColor: '#FEE2E2',
        borderWidth: 1,
        borderColor: '#FECACA',
        borderRadius: 12,
        padding: 14,
    },
    errorText: { color: '#DC2626', fontSize: 14, fontWeight: '500', textAlign: 'center' },
    trust: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
    trustText: { fontSize: 12, fontWeight: '500' },
});
