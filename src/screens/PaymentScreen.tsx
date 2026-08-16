import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ArrowLeft, Shield, FlaskConical, Zap, Lock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaymentForm } from '../payments/components/PaymentForm';
import { PaymentSuccessBurst } from '../payments/components/PaymentSuccessBurst';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { usePaymentMode } from '../contexts/PaymentModeContext';
import { glassGradient, glassTokens } from '../utils/glass';
import { Radius, Type, atmosphere, colors, glassShadow } from '../theme/tokens';

export default function PaymentScreen({ navigation, route }: any) {
    const { user } = useAuth();
    const { isLive, isTest } = usePaymentMode();
    const insets = useSafeAreaInsets();
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
    const atmo = atmosphere(dark);
    const c = colors(dark);

    const C = {
        text: c.text,
        muted: c.textMuted,
        border: c.border,
        accent: c.primary,
        card: c.bgElevated,
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
            <LinearGradient colors={atmo} style={StyleSheet.absoluteFill} />
            <LinearGradient
                colors={[grad[0], 'transparent']}
                style={st.topWash}
                pointerEvents="none"
            />

            <View
                style={[
                    st.header,
                    glass as any,
                    {
                        borderBottomColor: C.border,
                        paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 40 : 16) + 8,
                    },
                ]}
            >
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    hitSlop={16}
                    style={[st.backBtn, { backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(24,24,27,0.04)' }]}
                    accessibilityLabel="Volver"
                >
                    <ArrowLeft color={C.text} size={20} style={{ marginLeft: -1 }} />
                </TouchableOpacity>
                <View style={st.headerCenter}>
                    <Text style={[st.headerEyebrow, { color: C.muted }]}>Checkout</Text>
                    <Text style={[st.headerTitle, { color: C.text }]}>Pagar</Text>
                </View>
                <View
                    style={[
                        st.modeChip,
                        {
                            backgroundColor: isLive
                                ? dark
                                    ? 'rgba(16,185,129,0.18)'
                                    : '#ECFDF5'
                                : dark
                                  ? 'rgba(245,158,11,0.18)'
                                  : '#FFFBEB',
                            borderColor: isLive
                                ? dark
                                    ? 'rgba(16,185,129,0.35)'
                                    : '#A7F3D0'
                                : dark
                                  ? 'rgba(245,158,11,0.35)'
                                  : '#FDE68A',
                        },
                    ]}
                >
                    {isLive ? (
                        <Zap size={12} color={dark ? '#34D399' : '#059669'} />
                    ) : (
                        <FlaskConical size={12} color={dark ? '#FBBF24' : '#D97706'} />
                    )}
                    <Text
                        style={[
                            st.modeChipText,
                            { color: isLive ? (dark ? '#A7F3D0' : '#059669') : dark ? '#FDE68A' : '#D97706' },
                        ]}
                    >
                        {isTest ? 'Prueba' : 'Live'}
                    </Text>
                </View>
            </View>

            <ScrollView
                style={st.scroll}
                contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 56 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={[st.hero, glassShadow(dark), glass as any]}>
                    <Text style={[st.heroLabel, { color: C.muted }]}>Total a pagar</Text>
                    <Text style={[st.heroAmount, { color: C.text }]}>{fmt(finalAmount)}</Text>
                    <View style={st.heroMeta}>
                        <Text style={[st.heroMetaText, { color: C.muted }]}>
                            Subtotal {fmt(subtotal)}
                            {shippingCost > 0 ? ` · Envío ${fmt(shippingCost)}` : ''}
                        </Text>
                    </View>
                </View>

                {cartItems.length > 0 ? (
                    <View style={[st.linesCard, glassShadow(dark), glass as any]}>
                        <Text style={[st.linesHeading, { color: C.muted }]}>Pedido</Text>
                        {cartItems.slice(0, 4).map((item: any, idx: number) => (
                            <View key={item.id || idx} style={st.lineRow}>
                                <Text
                                    style={[st.lineTitle, { color: C.text }]}
                                    numberOfLines={1}
                                >
                                    {item.name}
                                </Text>
                                <Text style={[st.linePrice, { color: C.muted }]}>
                                    {fmt(Number(item.price) * Number(item.quantity || 1))}
                                </Text>
                            </View>
                        ))}
                        {cartItems.length > 4 ? (
                            <Text style={[st.moreLines, { color: C.muted }]}>
                                +{cartItems.length - 4} más
                            </Text>
                        ) : null}
                    </View>
                ) : null}

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
                    <View
                        style={[
                            st.errorBanner,
                            {
                                backgroundColor: dark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
                                borderColor: dark ? 'rgba(239,68,68,0.35)' : '#FECACA',
                            },
                        ]}
                    >
                        <Text style={[st.errorText, { color: dark ? '#FCA5A5' : '#DC2626' }]}>
                            {error}
                        </Text>
                    </View>
                )}

                <View style={st.trust}>
                    <Lock size={13} color={C.muted} />
                    <Shield size={13} color={C.muted} />
                    <Text style={[st.trustText, { color: C.muted }]}>
                        {isLive
                            ? 'Pago in-app · Stripe LIVE · KYC requerido'
                            : 'Pago in-app · Stripe TEST · sin cobro real'}
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

const st = StyleSheet.create({
    root: { flex: 1 },
    topWash: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 180,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 10,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: Radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: { flex: 1, gap: 1 },
    headerEyebrow: {
        ...Type.caption,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    headerTitle: { ...Type.heading, fontSize: 20, lineHeight: 24 },
    modeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: Radius.full,
        borderWidth: StyleSheet.hairlineWidth,
    },
    modeChipText: { fontSize: 11, fontWeight: '800' },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, gap: 18 },
    hero: {
        borderRadius: Radius['2xl'],
        paddingVertical: 22,
        paddingHorizontal: 22,
        alignItems: 'flex-start',
        gap: 4,
    },
    heroLabel: { ...Type.caption, textTransform: 'uppercase', letterSpacing: 0.9 },
    heroAmount: {
        fontSize: 40,
        lineHeight: 46,
        fontWeight: '800',
        letterSpacing: -1.2,
        fontVariant: ['tabular-nums'],
    },
    heroMeta: { marginTop: 6 },
    heroMetaText: { ...Type.bodySm },
    linesCard: {
        borderRadius: Radius.xl,
        padding: 16,
        gap: 8,
    },
    linesHeading: {
        ...Type.caption,
        textTransform: 'uppercase',
        letterSpacing: 0.7,
        marginBottom: 2,
    },
    lineRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    lineTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
    linePrice: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
    moreLines: { ...Type.bodySm, marginTop: 2 },
    errorBanner: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radius.lg,
        padding: 14,
    },
    errorText: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
    trust: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 2,
        paddingBottom: 8,
    },
    trustText: { fontSize: 12, fontWeight: '500' },
});
