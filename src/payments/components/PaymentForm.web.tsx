import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    TextInput,
} from 'react-native';
import { useAction } from 'convex/react';
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Sparkles } from 'lucide-react-native';
import { api } from '../../../convex/_generated/api';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePoints } from '../../contexts/PointsContext';
import { usePaymentMode } from '../../contexts/PaymentModeContext';
import { glassTokens } from '../../utils/glass';
import { STRIPE_TEST_CARDS } from '../testCards';
import { SimulatedCardsPanel, type WalletCard } from './SimulatedCardsPanel';
import { PaymentModeToggle } from './PaymentModeToggle';
import { StripeCardElement } from './StripeCardElement';
import {
    CardholderFields,
    isValidCardholder,
    type CardholderBilling,
} from './CardholderFields';
import { Radius, Type, colors, glassShadow } from '../../theme/tokens';

const POINT_USD = 0.01;

function mapStripePm(pm: any): WalletCard {
    const brand = pm.card?.brand || 'card';
    const last4 = pm.card?.last4 || '????';
    const mm = pm.card?.exp_month ? String(pm.card.exp_month).padStart(2, '0') : '12';
    const yy = pm.card?.exp_year ? String(pm.card.exp_year).slice(-2) : '34';
    return {
        id: pm.id,
        brand,
        last4,
        label: brand.charAt(0).toUpperCase() + brand.slice(1),
        number: `000000000000${last4}`,
        cvc: '***',
        exp: `${mm}/${yy}`,
        custom: false,
        source: 'stripe',
    };
}

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
    onSuccess: (intentId: string, meta?: { pointsRedeemed: number }) => void;
    onError: (error: string | null) => void;
    userId?: string;
    theme?: any;
}

export function PaymentForm({
    amount,
    cartId,
    lineItems,
    onSuccess,
    onError,
    theme,
    userId,
}: PaymentFormProps) {
    const createPaymentIntent = useAction(api.stripe.createPaymentIntent);
    const createSetupIntent = useAction(api.stripe.createSetupIntent);
    const listPaymentMethods = useAction(api.stripe.listPaymentMethods);
    const stripe = useStripe();
    const elements = useElements();
    const [loading, setLoading] = useState(false);
    const [addingCard, setAddingCard] = useState(false);
    const [selectedId, setSelectedId] = useState(STRIPE_TEST_CARDS[0].id);
    const [selectedCard, setSelectedCard] = useState<WalletCard | null>(STRIPE_TEST_CARDS[0]);
    const [realCards, setRealCards] = useState<WalletCard[]>([]);
    const [pointsInput, setPointsInput] = useState('');
    const [applyPoints, setApplyPoints] = useState(false);
    const [billing, setBilling] = useState<CardholderBilling>({ fullName: '', postalCode: '' });
    const { show } = useToast();
    const { sessionToken } = useAuth();
    const { mode, isLive } = usePaymentMode();
    const { points, redeemPoints } = usePoints();
    const isDark = !!theme?.dark || theme?.colors?.background === '#1E293B';
    const glass = glassTokens(!!isDark);

    const refreshRealCards = useCallback(async () => {
        if (!sessionToken || !userId || !isLive) return;
        try {
            const cards = await listPaymentMethods({ sessionToken, userId, mode });
            setRealCards((cards || []).map(mapStripePm));
        } catch (e) {
            console.error('Error loading real cards', e);
            setRealCards([]);
        }
    }, [sessionToken, userId, isLive, mode, listPaymentMethods]);

    useEffect(() => {
        if (isLive) {
            setSelectedId('');
            setSelectedCard(null);
            void refreshRealCards();
        } else {
            setRealCards([]);
            setSelectedId(STRIPE_TEST_CARDS[0].id);
            setSelectedCard(STRIPE_TEST_CARDS[0]);
        }
    }, [isLive, refreshRealCards]);

    const onSelectedCard = useCallback((c: WalletCard) => setSelectedCard(c), []);

    const handleSelect = useCallback((id: string) => {
        setSelectedId(id);
    }, []);

    const pointsToUse = useMemo(() => {
        if (!applyPoints) return 0;
        const n = Math.floor(Number(pointsInput || points));
        if (!Number.isFinite(n) || n <= 0) return 0;
        return Math.min(n, Math.max(0, points), Math.floor(amount / POINT_USD));
    }, [applyPoints, pointsInput, points, amount]);

    const discountUsd = pointsToUse * POINT_USD;
    const chargeAmount = Math.max(0, Math.round((amount - discountUsd) * 100) / 100);
    const billingOk = !isLive || isValidCardholder(billing);
    const hasCard = isLive
        ? !!selectedId && selectedId.startsWith('pm_')
        : !!selectedCard && !!selectedId;
    const canPay =
        !loading &&
        billingOk &&
        (chargeAmount > 0 || pointsToUse > 0) &&
        (chargeAmount <= 0 || hasCard);

    const buildLineItems = (payAmount: number) => {
        const items = (lineItems ?? []).map((i) => ({
            listingId: i.listingId,
            sellerId: i.sellerId,
            type: 'product',
            amountInCents: Math.round(i.price * 100),
            referralCode: i.referralCode,
            quantity: i.quantity,
            description: i.title,
        }));
        const itemsTotal = items.reduce((s, i) => s + i.amountInCents * i.quantity, 0);
        const amountCents = Math.round(payAmount * 100);
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

    const handleSecureSave = async () => {
        if (!stripe || !elements) {
            show('Stripe no está listo. Recargá la página.', 'error');
            throw new Error('Stripe no listo');
        }
        if (!isValidCardholder(billing)) {
            show('Enter the name on the card', 'error');
            throw new Error('Billing incompleto');
        }
        const card = elements.getElement(CardElement);
        if (!card) {
            show('Completá los datos de la tarjeta', 'error');
            throw new Error('Card incompleta');
        }

        setAddingCard(true);
        onError(null);
        try {
            const { clientSecret } = await createSetupIntent({ sessionToken, mode });
            if (!clientSecret) throw new Error('No se pudo iniciar el alta de tarjeta');

            const { error, setupIntent } = await stripe.confirmCardSetup(
                clientSecret,
                {
                    payment_method: {
                        card,
                        billing_details: {
                            name: billing.fullName.trim(),
                            address: {
                                country: 'US',
                                ...(billing.postalCode.trim()
                                    ? { postal_code: billing.postalCode.trim() }
                                    : {}),
                            },
                        },
                    },
                },
                { handleActions: true },
            );
            if (error) throw new Error(error.message || 'No se pudo guardar la tarjeta');

            const pmId =
                typeof setupIntent?.payment_method === 'string'
                    ? setupIntent.payment_method
                    : setupIntent?.payment_method?.id;

            show('Tarjeta agregada', 'success');
            await refreshRealCards();
            if (pmId) setSelectedId(pmId);
        } catch (e: any) {
            const msg = e?.message || 'Error al agregar tarjeta';
            onError(msg);
            show(msg, 'error');
            throw e;
        } finally {
            setAddingCard(false);
        }
    };

    const handlePay = async () => {
        if (!canPay) return;
        setLoading(true);
        onError(null);
        try {
            if (chargeAmount <= 0 && pointsToUse > 0) {
                const redeem = await redeemPoints(pointsToUse, cartId);
                if (!redeem.success) throw new Error(redeem.message || 'No se pudieron usar los puntos');
                show('Pagado con puntos', 'success');
                onSuccess(`pts_${Date.now()}`, { pointsRedeemed: pointsToUse });
                return;
            }

            const items = buildLineItems(chargeAmount);
            const result = await createPaymentIntent({
                sessionToken,
                amountInCents: Math.round(chargeAmount * 100),
                lineItems: items.length > 0 ? items : undefined,
                cartId,
                simulate: !isLive,
                mode,
                // Use metadata (already in deployed validator) — avoids ArgumentValidationError
                // until Convex push picks up optional cardholderName fields.
                metadata: isLive
                    ? {
                          cardholderName: billing.fullName.trim(),
                          billingCountry: 'US',
                          billingMarket: 'US-NY',
                          ...(billing.postalCode.trim()
                              ? { postalCode: billing.postalCode.trim() }
                              : {}),
                      }
                    : undefined,
            });

            if (isLive) {
                if (!stripe) throw new Error('Stripe no está listo. Recargá la página.');
                if (!result.clientSecret) throw new Error('No se recibió clientSecret de Stripe');
                if (!selectedId.startsWith('pm_')) {
                    throw new Error('Seleccioná una tarjeta del carrusel para pagar');
                }

                const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
                    result.clientSecret,
                    { payment_method: selectedId },
                    { handleActions: true },
                );
                if (confirmError) {
                    throw new Error(confirmError.message || 'El pago no se pudo confirmar');
                }
                if (paymentIntent && paymentIntent.status !== 'succeeded') {
                    throw new Error(`Estado del pago: ${paymentIntent.status}`);
                }
            }

            if (pointsToUse > 0) await redeemPoints(pointsToUse, result.paymentIntentId);
            const pts = Number((result as any)?.pointsAwarded) || 0;
            show(
                pts > 0
                    ? `Pago OK · +${pts} pts`
                    : isLive
                      ? 'Pago producción OK'
                      : 'Pago simulado OK',
                'success',
            );
            onSuccess(result.paymentIntentId, { pointsRedeemed: pointsToUse });
        } catch (e: any) {
            const msg = e?.message || 'Error inesperado';
            onError(msg);
            show(msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    const c = colors(!!isDark);
    const accent = theme?.colors?.primary || c.primary;
    const textColor = theme?.colors?.text || c.text;
    const muted = theme?.colors?.textSecondary || c.textMuted;

    return (
        <View style={styles.root}>
            <PaymentModeToggle isDark={!!isDark} />

            <Text style={[styles.sectionLabel, { color: textColor }]}>
                {isLive ? 'Tus tarjetas' : 'Tarjetas de prueba'}
            </Text>
            <Text style={[styles.hint, { color: muted }]}>
                {isLive
                    ? 'Mismo carrusel · producción Stripe in-app · KYC requerido'
                    : 'Mismo carrusel · simulación local · sin cobro real'}
            </Text>

            {isLive ? (
                <CardholderFields value={billing} onChange={setBilling} isDark={!!isDark} />
            ) : null}

            <SimulatedCardsPanel
                key={isLive ? 'live' : 'test'}
                selectedId={selectedId}
                onSelect={handleSelect}
                onSelectedCard={onSelectedCard}
                accent={accent}
                textColor={textColor}
                muted={muted}
                isDark={!!isDark}
                includePresets={!isLive}
                externalCards={isLive ? realCards : []}
                secureAdd={isLive}
                secureSaving={addingCard}
                onSecureSave={isLive ? handleSecureSave : undefined}
                secureAddSlot={isLive ? <StripeCardElement isDark={!!isDark} /> : undefined}
                formHint={
                    isLive
                        ? 'Producción · Stripe Elements (sin Link)'
                        : 'Modo simulado · cualquier marca'
                }
            />

            <View
                style={[
                    styles.pointsBar,
                    glassShadow(!!isDark),
                    { backgroundColor: glass.bg, borderColor: glass.border },
                ]}
            >
                <View style={styles.pointsLeft}>
                    <View style={[styles.pointsIcon, { backgroundColor: '#F59E0B22' }]}>
                        <Sparkles size={18} color="#F59E0B" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.pointsTitle, { color: textColor }]}>
                            Usar puntos Ramgos
                        </Text>
                        <Text style={[styles.pointsSub, { color: muted }]}>
                            {points} pts · máx. -${Math.min(points * POINT_USD, amount).toFixed(2)}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => {
                            setApplyPoints((v) => !v);
                            if (!applyPoints) {
                                setPointsInput(
                                    String(Math.min(points, Math.floor(amount / POINT_USD))),
                                );
                            }
                        }}
                        style={[
                            styles.toggle,
                            {
                                backgroundColor: applyPoints
                                    ? accent
                                    : isDark
                                      ? '#3F3F46'
                                      : '#E4E4E7',
                            },
                        ]}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: applyPoints }}
                    >
                        <Text style={[styles.toggleText, { color: applyPoints ? '#fff' : muted }]}>
                            {applyPoints ? 'ON' : 'OFF'}
                        </Text>
                    </TouchableOpacity>
                </View>
                {applyPoints ? (
                    <View style={styles.pointsRow}>
                        <TextInput
                            value={pointsInput}
                            onChangeText={setPointsInput}
                            keyboardType="number-pad"
                            placeholder="R Coins a usar"
                            placeholderTextColor="#94A3B8"
                            style={[styles.pointsInput, { color: textColor, borderColor: c.border }]}
                        />
                        <Text style={[styles.discountTag, { color: accent }]}>
                            -${discountUsd.toFixed(2)}
                        </Text>
                    </View>
                ) : null}
            </View>

            <View
                style={[
                    styles.payDock,
                    glassShadow(!!isDark),
                    { backgroundColor: glass.bg, borderColor: glass.border },
                ]}
            >
                <View style={styles.payMeta}>
                    <Text style={[styles.payMetaLabel, { color: muted }]}>Total a cobrar</Text>
                    <Text style={[styles.payMetaVal, { color: textColor }]}>
                        ${chargeAmount.toFixed(2)}
                    </Text>
                </View>
                {chargeAmount > 0 && !hasCard ? (
                    <Text style={[styles.hint, { color: muted, textAlign: 'center' }]}>
                        Agregá o elegí una tarjeta del carrusel
                    </Text>
                ) : null}
                {isLive && !billingOk ? (
                    <Text style={[styles.hint, { color: muted, textAlign: 'center' }]}>
                        Enter the name on the card to continue
                    </Text>
                ) : null}
                <TouchableOpacity
                    onPress={handlePay}
                    disabled={!canPay}
                    activeOpacity={0.9}
                    style={[styles.payBtn, { backgroundColor: canPay ? accent : '#9CA3AF' }]}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.payBtnText}>
                            {chargeAmount > 0
                                ? `Pagar $${chargeAmount.toFixed(2)}`
                                : 'Pagar con puntos'}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { gap: 16 },
    sectionLabel: { ...Type.title, marginLeft: 2, marginTop: 2 },
    hint: { ...Type.bodySm, marginLeft: 2, marginBottom: 2, opacity: 0.95 },
    pointsBar: { gap: 10, borderRadius: Radius.xl, borderWidth: 1, padding: 16 },
    pointsLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pointsIcon: {
        width: 40,
        height: 40,
        borderRadius: Radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pointsTitle: { fontSize: 14, fontWeight: '800' },
    pointsSub: { fontSize: 12, marginTop: 2 },
    toggle: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full },
    toggleText: { fontSize: 11, fontWeight: '800' },
    pointsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pointsInput: {
        flex: 1,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        fontWeight: '600',
    },
    discountTag: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
    payDock: { marginTop: 2, padding: 16, borderRadius: Radius.xl, gap: 12, borderWidth: 1 },
    payMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    payMetaLabel: { fontSize: 13, fontWeight: '600' },
    payMetaVal: {
        fontSize: 26,
        fontWeight: '900',
        letterSpacing: -0.6,
        fontVariant: ['tabular-nums'],
    },
    payBtn: { height: 56, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
    payBtnText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
});
