import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { ArrowLeft, CheckCircle, Shield, Star, Zap } from 'lucide-react-native';
import { PaymentForm } from '../payments/components/PaymentForm';
import { useCart } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePoints } from '../contexts/PointsContext';

// ─────────────────────────────────────────────
// PAYMENT SCREEN — COMPLETE REDESIGN
// ─────────────────────────────────────────────

export default function PaymentScreen({ navigation, route }: any) {
    // ── Route params ──
    const subtotal = Number(route.params?.subtotal) || Number(route.params?.amount) || 0;
    const shippingCost = Number(route.params?.shippingCost) || 0;
    const currency = route.params?.currency || 'usd';
    const isSubscriptionOnly = route.params?.cartItems?.every?.((i: any) => i.type === 'subscription');

    // ── Points / discounts ──
    const { points, redeemPoints } = usePoints();
    const RATE = 0.01; // 1 pt = $0.01
    const maxPtsForOrder = Math.floor(subtotal / RATE);
    const maxUsable = Math.min(points, maxPtsForOrder);
    const [ptsInput, setPtsInput] = useState('');

    const ptsToUse = Math.min(Math.max(0, parseInt(ptsInput) || 0), maxUsable);
    const discount = ptsToUse * RATE;
    const referralDiscount = Number(route.params?.referralDiscount) || 0;
    const finalAmount = Math.max(0, subtotal - discount - referralDiscount + shippingCost);

    const onPtsChange = (txt: string) => {
        const clean = txt.replace(/\D/g, '');
        const val = parseInt(clean) || 0;
        setPtsInput(val > maxUsable ? String(maxUsable) : clean);
    };

    // ── Payment state ──
    const { clearCart } = useCart();
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { colorScheme } = useTheme();
    const dark = colorScheme === 'dark';

    const handleSuccess = (intentId: string) => {
        if (ptsToUse > 0) redeemPoints(ptsToUse, `Descuento en compra`);
        setIsSuccess(true);
        clearCart();
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
        gold: '#F59E0B',
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
                        Tu transacción fue procesada exitosamente.{'\n'}Recibirás una confirmación por email.
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

    // ── MAIN VIEW ──
    return (
        <View style={[st.root, { backgroundColor: C.bg }]}>
            {/* HEADER */}
            <View style={[st.header, { borderBottomColor: C.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={16}>
                    <ArrowLeft color={C.text} size={22} />
                </TouchableOpacity>
                <View style={st.headerCenter}>
                    <Shield color={C.accent} size={16} />
                    <Text style={[st.headerTitle, { color: C.text }]}>Pago Seguro</Text>
                </View>
                <View style={{ width: 22 }} />
            </View>

            <ScrollView
                style={st.scroll}
                contentContainerStyle={st.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* ── AMOUNT SUMMARY ── */}
                <View style={[st.summaryCard, { backgroundColor: C.card, borderColor: C.border }]}>
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
                    {discount > 0 && (
                        <View style={st.summaryRow}>
                            <Text style={[st.summaryLabel, { color: C.success }]}>Descuento ({ptsToUse} pts)</Text>
                            <Text style={[st.summaryVal, { color: C.success }]}>−{fmt(discount)}</Text>
                        </View>
                    )}
                    {referralDiscount > 0 && (
                        <View style={st.summaryRow}>
                            <Text style={[st.summaryLabel, { color: C.success }]}>Referido</Text>
                            <Text style={[st.summaryVal, { color: C.success }]}>−{fmt(referralDiscount)}</Text>
                        </View>
                    )}
                    <View style={[st.divider, { backgroundColor: C.border }]} />
                    <View style={st.summaryRow}>
                        <Text style={[st.totalLabel, { color: C.text }]}>Total</Text>
                        <Text style={[st.totalVal, { color: C.accent }]}>{fmt(finalAmount)}</Text>
                    </View>
                </View>

                {/* ── POINTS ── */}
                {!isSubscriptionOnly && points > 0 && (
                    <View style={[st.pointsCard, { backgroundColor: C.card, borderColor: C.border }]}>
                        <View style={st.pointsTop}>
                            <View style={st.pointsLeft}>
                                <Star size={16} color={C.gold} fill={C.gold} />
                                <Text style={[st.pointsTitle, { color: C.text }]}>Puntos Ramgos</Text>
                            </View>
                            <View style={[st.ptsBadge, { backgroundColor: C.gold + '15' }]}>
                                <Text style={[st.ptsBadgeText, { color: C.gold }]}>{points} pts</Text>
                            </View>
                        </View>

                        <View style={[st.ptsInputWrap, { backgroundColor: dark ? '#0F172A' : '#F1F5F9', borderColor: C.border }]}>
                            <TextInput
                                style={[st.ptsInput, { color: C.text }]}
                                keyboardType="numeric"
                                value={ptsInput}
                                onChangeText={onPtsChange}
                                placeholder={`Hasta ${maxUsable} pts`}
                                placeholderTextColor={C.muted}
                            />
                            <TouchableOpacity
                                style={[st.maxBtn, { backgroundColor: C.accent + '15' }]}
                                onPress={() => setPtsInput(String(maxUsable))}
                                activeOpacity={0.7}
                            >
                                <Zap size={12} color={C.accent} />
                                <Text style={[st.maxBtnText, { color: C.accent }]}>Máx</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* ── ERROR ── */}
                {error && (
                    <View style={st.errorBanner}>
                        <Text style={st.errorText}>{error}</Text>
                    </View>
                )}

                {/* ── PAYMENT FORM (with 3D card + Stripe) ── */}
                <View style={[st.formCard, { backgroundColor: C.card, borderColor: C.border }]}>
                    <PaymentForm
                        amount={finalAmount}
                        currency={currency}
                        onSuccess={handleSuccess}
                        onError={setError}
                        theme={{
                            colors: {
                                background: C.card,
                                primary: C.accent,
                                text: C.text,
                                textSecondary: C.muted,
                                border: C.border,
                            },
                        }}
                    />
                </View>

                {/* ── TRUST BADGES ── */}
                <View style={st.trust}>
                    <Shield size={14} color={C.muted} />
                    <Text style={[st.trustText, { color: C.muted }]}>
                        Protegido por Stripe · Cifrado SSL 256-bit · PCI DSS Nivel 1
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

// ─────────────────────────────────────────────
const st = StyleSheet.create({
    root: { flex: 1 },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 56,
        paddingBottom: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerTitle: { fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },

    // Scroll
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 40 },

    // Summary
    summaryCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 20,
        marginBottom: 16,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    summaryLabel: { fontSize: 14 },
    summaryVal: { fontSize: 14, fontWeight: '600' },
    divider: { height: 1, marginVertical: 10 },
    totalLabel: { fontSize: 16, fontWeight: '800' },
    totalVal: { fontSize: 22, fontWeight: '900' },

    // Points
    pointsCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 18,
        marginBottom: 16,
    },
    pointsTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    pointsLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pointsTitle: { fontSize: 15, fontWeight: '700' },
    ptsBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    ptsBadgeText: { fontSize: 12, fontWeight: '800' },
    ptsInputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
    },
    ptsInput: {
        flex: 1,
        height: 44,
        paddingHorizontal: 14,
        fontSize: 15,
        fontWeight: '600',
    },
    maxBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 14,
        height: 34,
        borderRadius: 8,
        marginRight: 5,
    },
    maxBtnText: { fontSize: 13, fontWeight: '800' },

    // Error
    errorBanner: {
        backgroundColor: '#FEE2E2',
        borderWidth: 1,
        borderColor: '#FECACA',
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
    },
    errorText: { color: '#DC2626', fontSize: 14, fontWeight: '500', textAlign: 'center' },

    // Form wrapper
    formCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 20,
        marginBottom: 16,
    },

    // Trust
    trust: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
    },
    trustText: { fontSize: 11, fontWeight: '500' },

    // Success
    successWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },
    successCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
    },
    successTitle: { fontSize: 26, fontWeight: '900', marginBottom: 12 },
    successSub: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 36 },
    successBtn: {
        paddingVertical: 16,
        paddingHorizontal: 48,
        borderRadius: 14,
    },
    successBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
