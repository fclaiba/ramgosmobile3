import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ArrowLeft, Shield, FlaskConical, Zap, Lock, Clock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { PaymentForm } from '../payments/components/PaymentForm';
import { PaymentSuccessBurst } from '../payments/components/PaymentSuccessBurst';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { usePaymentMode } from '../contexts/PaymentModeContext';
import { glassGradient, glassTokens } from '../utils/glass';
import { Radius, Type, atmosphere, colors, glassShadow } from '../theme/tokens';

/** Cuánto esperamos a que el webhook cree la orden antes de dar la cara. */
const CONFIRM_TIMEOUT_MS = 30_000;

export default function PaymentScreen({ navigation, route }: any) {
    const { user, sessionToken } = useAuth();
    const { isLive, isTest } = usePaymentMode();
    const insets = useSafeAreaInsets();
    const userId = (user as any)?.id || (user as any)?._id;

    const subtotal = Number(route.params?.subtotal) || Number(route.params?.amount) || 0;
    const shippingCost = Number(route.params?.shippingCost) || 0;
    const currency = route.params?.currency || 'usd';
    const finalAmount = Math.max(0, subtotal + shippingCost);

    /**
     * Datos de envío.
     *
     * `CartScreen` arma un formulario completo de entrega y lo manda en
     * `route.params`, pero esta pantalla **nunca lo leía**: el vendedor no
     * tenía forma de saber adónde despachar. Para un marketplace de bienes
     * físicos eso es un bloqueante, no un detalle.
     */
    const shippingDestination = route.params?.shippingDestination;
    const shippingMethod = route.params?.shippingMethod;

    const cartItems = route.params?.cartItems || [];
    const lineItems = cartItems.map((item: any) => ({
        listingId: item.id,
        // `sellerId` no se inventa. El fallback `'ramgos'` producía órdenes con
        // un vendedor que no existe como usuario: `normalizeId` devuelve null y
        // el escrow queda trabado para siempre, sin nadie a quien pagarle.
        sellerId: item.sellerId,
        title: item.name,
        // El `type` real del item, no 'product' para todo. Se hardcodeaba y
        // viajaba así hasta la atribución de campañas.
        type: item.type,
        price: item.price,
        quantity: item.quantity,
        referralCode: item.referralCode,
    }));

    const [error, setError] = useState<string | null>(null);
    const cartId = useMemo(() => `cart_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, []);

    /**
     * Confirmación real del checkout.
     *
     * Que Stripe acepte la tarjeta NO significa que la compra exista: la orden
     * la crea el webhook, segundos después. Antes se mostraba el confeti
     * apenas el SDK no devolvía error y se descartaba el `paymentIntentId`, así
     * que un webhook perdido dejaba al comprador convencido de haber comprado,
     * sin nada y sin un identificador con el que reclamar (E-141 #4).
     *
     * La query es reactiva: cuando el webhook escribe la orden, esto se entera
     * solo. No hace falta polling.
     */
    const [paidIntentId, setPaidIntentId] = useState<string | null>(null);
    const [confirmTimedOut, setConfirmTimedOut] = useState(false);

    const checkout = useQuery(
        api.orders.getCheckoutStatus,
        paidIntentId ? { sessionToken, stripePaymentIntentId: paidIntentId } : 'skip',
    );
    const orderConfirmed = !!checkout?.orderIds?.length;

    useEffect(() => {
        if (!paidIntentId || orderConfirmed) return;
        const t = setTimeout(() => setConfirmTimedOut(true), CONFIRM_TIMEOUT_MS);
        return () => clearTimeout(t);
    }, [paidIntentId, orderConfirmed]);

    /**
     * Salir del checkout sin pagar devuelve el stock reservado (H3).
     *
     * `createPaymentIntent` reserva el stock de verdad — lo descuenta — antes
     * de cobrar, y `cartId` se genera de nuevo en cada montaje de esta
     * pantalla. Sin esto, entrar al checkout de un producto de unidad única,
     * arrepentirse y volver a entrar te choca con TU PROPIA reserva: "se quedó
     * sin stock" durante los 30 minutos del TTL. El cron es la red para el
     * caso en que la app se cierre de golpe y este cleanup no llegue a correr.
     */
    const releaseReservation = useMutation(api.stock.releaseMyCheckoutReservation);
    const abandonRef = useRef({ paid: false, sessionToken, cartId, release: releaseReservation });
    abandonRef.current = { paid: !!paidIntentId, sessionToken, cartId, release: releaseReservation };
    useEffect(() => {
        // Sin dependencias a propósito: corre SÓLO al desmontar, y lee el
        // estado más reciente por ref.
        return () => {
            const { paid, sessionToken: token, cartId: cart, release } = abandonRef.current;
            if (paid) return; // pagó: la reserva la consume el webhook
            release({ sessionToken: token, cartId: cart }).catch(() => {
                // Best-effort: si falla, el cron la devuelve al vencer el TTL.
            });
        };
    }, []);

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

    // Confeti SÓLO con la orden ya creada del lado del servidor.
    if (paidIntentId && orderConfirmed) {
        return (
            <PaymentSuccessBurst
                amount={finalAmount}
                dark={dark}
                onDone={() => navigation.navigate('Marketplace')}
            />
        );
    }

    // Cobrado, pero la orden todavía no aparece.
    if (paidIntentId) {
        return (
            <View style={[st.confirmWrap, { backgroundColor: c.bg }]}>
                {confirmTimedOut ? <Clock size={40} color={C.muted} /> : <ActivityIndicator size="large" color={C.accent} />}
                <Text style={[st.confirmTitle, { color: C.text }]}>
                    {confirmTimedOut ? 'Tu pago se registró' : 'Confirmando tu pago…'}
                </Text>
                <Text style={[st.confirmBody, { color: C.muted }]}>
                    {confirmTimedOut
                        ? 'El cobro salió bien, pero la confirmación está demorando. No vuelvas a pagar: te avisamos apenas se acredite.'
                        : 'Ya cobramos. Estamos creando tu pedido, no cierres la app.'}
                </Text>
                {confirmTimedOut && (
                    <>
                        {/* El identificador es lo que hace reclamable el pago. */}
                        <Text style={[st.confirmRef, { color: C.muted, borderColor: C.border }]} selectable>
                            {paidIntentId}
                        </Text>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Marketplace')}
                            style={[st.confirmBtn, { backgroundColor: C.accent }]}
                        >
                            <Text style={st.confirmBtnText}>Entendido</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
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
                    shippingDestination={shippingDestination}
                    shippingMethod={shippingMethod}
                    shippingCost={shippingCost}
                    userId={userId}
                    onSuccess={(paymentIntentId: string) => setPaidIntentId(paymentIntentId)}
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

    // Pantalla de "confirmando" / "demorado" entre el cobro y la orden.
    confirmWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
    confirmTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
    confirmBody: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
    confirmRef: {
        fontSize: 12,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        borderWidth: 1,
        borderRadius: Radius.sm,
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginTop: 4,
    },
    confirmBtn: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: Radius.md },
    confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
