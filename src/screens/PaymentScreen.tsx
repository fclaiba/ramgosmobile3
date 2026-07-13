import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ArrowLeft, CheckCircle, Shield } from 'lucide-react-native';
import { PaymentForm } from '../payments/components/PaymentForm';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

// Fase 5 — camino único de pagos: PaymentForm → api.stripe.createPaymentIntent
// (Stripe TEST) → webhook → sub-órdenes con escrow "held". Las tarjetas
// guardadas mock y el pago simulado fueron eliminados de esta pantalla.

export default function PaymentScreen({ navigation, route }: any) {
    const { user } = useAuth();
    const userId = (user as any)?.id || (user as any)?._id;

    // ── Route params ──
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

    // ── Payment state ──
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Estable durante la vida de la pantalla: es el transfer_group que el
    // webhook usa para agrupar las sub-órdenes del carrito.
    const cartId = useMemo(() => `cart_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, []);

    const { colorScheme } = useTheme();
    const dark = colorScheme === 'dark';

    const handleSuccess = (intentId: string) => {
        setIsSuccess(true);
    };

    const fmt = (v: number) => `$${v.toFixed(2)}`;

    // ── COLORS ──
    const C = {
        bg: dark ? '#0F172A' : '#F8FAFC',
        card: dark ? '#1E293B' : '#FFFFFF',
        text: dark ? '#F1F5F9' : '#0F172A',
        muted: dark ? '#94A3B8' : '#64748B',
        border: dark ? '#334155' : '#E2E8F0',
        accent: '#6366F1',
        accentDark: '#4F46E5',
        success: '#10B981',
    };

    // ── SUCCESS VIEW ──
    if (isSuccess) {
        return (
            <View style={[st.root, { backgroundColor: C.bg }]}>
                <View style={st.successWrap}>
                    <View style={[st.successCircle, { backgroundColor: C.success + '18' }]}>
                        <CheckCircle color={C.success} size={56} />
                    </View>
                    <Text style={[st.successTitle, { color: C.text }]}>¡Pago confirmado!</Text>
                    <Text style={[st.successSub, { color: C.muted }]}>
                        Tu transacción fue procesada exitosamente.{'\n'}Recibirás un comprobante por email.
                    </Text>
                    <TouchableOpacity
                        style={[st.successBtn, { backgroundColor: C.accent }]}
                        onPress={() => navigation.navigate('Home')}
                        activeOpacity={0.85}
                    >
                        <Text style={st.successBtnText}>Volver al inicio</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={[st.root, { backgroundColor: C.bg }]}>
            {/* ── HEADER ── */}
            <View style={[st.header, { borderBottomColor: C.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={16} style={st.backBtn}>
                    <ArrowLeft color={C.text} size={22} />
                </TouchableOpacity>
                <View style={st.headerCenter}>
                    <Shield color={C.accent} size={16} />
                    <Text style={[st.headerTitle, { color: C.text }]}>Pago Seguro</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* ── STRIPE TEST FORM (camino único Fase 5) ── */}
                <View style={st.section}>
                    <Text style={[st.sectionTitle, { color: C.text }]}>Método de pago</Text>
                    <View style={[st.stripeContainer, { backgroundColor: C.card, borderColor: C.border }]}>
                        <PaymentForm
                            amount={finalAmount}
                            currency={currency}
                            cartId={cartId}
                            lineItems={lineItems}
                            userId={userId}
                            onSuccess={handleSuccess}
                            onError={setError}
                            theme={{
                                colors: {
                                    background: C.card,
                                    primary: C.accent,
                                    text: C.text,
                                    textSecondary: C.muted,
                                    border: C.border,
                                }
                            }}
                        />
                    </View>
                </View>

                {/* ── ERROR DISPLAY ── */}
                {error && (
                    <View style={st.errorBanner}>
                        <Text style={st.errorText}>{error}</Text>
                    </View>
                )}

                {/* ── SUMMARY ── */}
                <View style={[st.summaryCard, { backgroundColor: C.card, borderColor: C.border }]}>
                    <View style={st.summaryRow}>
                        <Text style={[st.summaryLabel, { color: C.muted }]}>Subtotal</Text>
                        <Text style={[st.summaryVal, { color: C.text }]}>{fmt(subtotal)}</Text>
                    </View>
                    {shippingCost > 0 && (
                        <View style={st.summaryRow}>
                            <Text style={[st.summaryLabel, { color: C.muted }]}>Costo de Envío</Text>
                            <Text style={[st.summaryVal, { color: C.text }]}>{fmt(shippingCost)}</Text>
                        </View>
                    )}
                    <View style={[st.divider, { backgroundColor: C.border }]} />
                    <View style={st.summaryRow}>
                        <Text style={[st.totalLabel, { color: C.text }]}>Total a Pagar</Text>
                        <Text style={[st.totalVal, { color: C.accent }]}>{fmt(finalAmount)}</Text>
                    </View>
                </View>

                <View style={st.trust}>
                    <Shield size={14} color={C.muted} />
                    <Text style={[st.trustText, { color: C.muted }]}>Protegido por Stripe · Cifrado SSL 256-bit</Text>
                </View>
                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

// ─────────────────────────────────────────────
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
    scrollContent: { padding: 20 },

    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, marginLeft: 4 },
    
    cardsContainer: { gap: 12, paddingBottom: 8 },
    
    miniCard: {
        width: 130,
        height: 110,
        borderRadius: 14,
        padding: 12,
        marginRight: 8,
        justifyContent: 'space-between',
        position: 'relative',
    },
    miniCardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    cardIconWrap: { 
        width: 38, 
        height: 28, 
        borderRadius: 6, 
        alignItems: 'center', 
        justifyContent: 'center',
    },
    deleteBtn: {
        padding: 4,
    },
    miniCardTextWrap: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    cardName: { 
        fontSize: 14, 
        fontWeight: '700',
        marginBottom: 2,
    },
    cardLast4: {
        fontSize: 12,
        fontWeight: '500',
    },
    miniCardCheck: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        borderRadius: 8,
        backgroundColor: '#fff',
    },

    stripeContainer: {
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 24,
    },

    summaryCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 20,
        marginBottom: 24,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    summaryLabel: { fontSize: 14 },
    summaryVal: { fontSize: 14, fontWeight: '600' },
    divider: { height: 1, marginVertical: 12 },
    totalLabel: { fontSize: 16, fontWeight: '800' },
    totalVal: { fontSize: 22, fontWeight: '900' },

    mainPayBtn: {
        height: 56,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    mainPayBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },

    errorBanner: {
        backgroundColor: '#FEE2E2',
        borderWidth: 1,
        borderColor: '#FECACA',
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
    },
    errorText: { color: '#DC2626', fontSize: 14, fontWeight: '500', textAlign: 'center' },

    trust: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    trustText: { fontSize: 12, fontWeight: '500' },

    successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
    successCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
    successTitle: { fontSize: 26, fontWeight: '900', marginBottom: 12 },
    successSub: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 36 },
    successBtn: { paddingVertical: 16, paddingHorizontal: 48, borderRadius: 14 },
    successBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
