import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    ScrollView,
    TextInput,
} from 'react-native';
import { useAction } from 'convex/react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react-native';
import { api } from '../../../convex/_generated/api';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePoints } from '../../contexts/PointsContext';
import { useStripe } from '@stripe/stripe-react-native';
import { usePaymentMode } from '../../contexts/PaymentModeContext';
import { Switch } from 'react-native';
import { glassTokens } from '../../utils/glass';
import { STRIPE_TEST_CARDS, formatCardNumber } from '../testCards';
import { SimulatedCardsPanel, type WalletCard } from './SimulatedCardsPanel';
import { Radius, colors } from '../../theme/tokens';


const POINT_USD = 0.01;

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
    onError: (err: string | null) => void;
    userId?: string;
    theme?: {
        dark?: boolean;
        colors?: {
            background?: string;
            primary?: string;
            text?: string;
            textSecondary?: string;
            border?: string;
        };
    };
}

export function PaymentForm({ amount, cartId, lineItems, onSuccess, onError, theme, userId }: PaymentFormProps) {
    const createPaymentIntent = useAction(api.stripe.createPaymentIntent);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState(STRIPE_TEST_CARDS[0].id);
    const [selectedCard, setSelectedCard] = useState<WalletCard>(STRIPE_TEST_CARDS[0]);
    const [showCheat, setShowCheat] = useState(false);
    const [pointsInput, setPointsInput] = useState('');
    const [applyPoints, setApplyPoints] = useState(false);
    const { show } = useToast();
    const { sessionToken } = useAuth();
    const { mode, toggle, isLive } = usePaymentMode();
    const { initPaymentSheet, presentPaymentSheet, confirmPayment } = useStripe();
    const createSetupIntent = useAction(api.stripe.createSetupIntent);
    const listPaymentMethods = useAction(api.stripe.listPaymentMethods);
    const [realCards, setRealCards] = useState<any[]>([]);
    const [selectedRealCardId, setSelectedRealCardId] = useState<string | null>(null);

    React.useEffect(() => {
        if (isLive && sessionToken && userId) {
            listPaymentMethods({ sessionToken, userId, mode: 'live' })
                .then(cards => {
                    setRealCards(cards);
                    if (cards.length > 0 && !selectedRealCardId) {
                        setSelectedRealCardId(cards[0].id);
                    }
                })
                .catch(e => console.error("Error loading real cards", e));
        }
    }, [isLive, sessionToken, userId, mode]);

    const { points, redeemPoints } = usePoints();
    const isDark = !!theme?.dark || theme?.colors?.background === '#1E293B';
    const glass = glassTokens(isDark);

    const onSelectedCard = useCallback((c: WalletCard) => setSelectedCard(c), []);

    const pointsToUse = useMemo(() => {
        if (!applyPoints) return 0;
        const n = Math.floor(Number(pointsInput || points));
        if (!Number.isFinite(n) || n <= 0) return 0;
        return Math.min(n, Math.max(0, points), Math.floor(amount / POINT_USD));
    }, [applyPoints, pointsInput, points, amount]);

    const discountUsd = pointsToUse * POINT_USD;
    const chargeAmount = Math.max(0, Math.round((amount - discountUsd) * 100) / 100);
    const canPay = !loading && (chargeAmount > 0 || pointsToUse > 0);

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

    
    const handleAddCard = async () => {
        try {
            setLoading(true);
            const { clientSecret } = await createSetupIntent({ sessionToken, mode });
            
            const { error: initError } = await initPaymentSheet({
                setupIntentClientSecret: clientSecret || undefined,
                merchantDisplayName: 'Ramgos',
                returnURL: 'ramgos://stripe-redirect',
            });
            if (initError) throw new Error(initError.message);
            
            const { error: presentError } = await presentPaymentSheet();
            if (presentError) throw new Error(presentError.message);
            
            show('Tarjeta agregada exitosamente', 'success');
            // Refresh cards
            if (userId) {
                const cards = await listPaymentMethods({ sessionToken, userId, mode: 'live' });
                setRealCards(cards);
                if (cards.length > 0) setSelectedRealCardId(cards[cards.length - 1].id);
            }
        } catch (e: any) {
            show(e.message || 'Error al agregar tarjeta', 'error');
        } finally {
            setLoading(false);
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
            // En modo live, si usamos PaymentSheet para cobrar, necesitamos client_secret.
            // Pero en la FASE 5, el createPaymentIntent en "simulate" no requiere confirmar en cliente.
            // Para mantener compatibilidad con tarjetas guardadas, usamos el paymentMethodId.
            // Si es live, intentamos usar stripe_payment_intent pero por ahora, solo simularemos si isTest.
            const result = await createPaymentIntent({
                sessionToken,
                amountInCents: Math.round(chargeAmount * 100),
                lineItems: items.length > 0 ? items : undefined,
                cartId,
                simulate: !isLive,
                mode: mode,
            });

            if (isLive && result.clientSecret) {
                // Confirm the payment with the selected saved card
                if (!selectedRealCardId) throw new Error("Selecciona una tarjeta para pagar");
                
                const { error: confirmError, paymentIntent } = await confirmPayment(result.clientSecret, {
                    paymentMethodType: 'Card',
                    paymentMethodData: {
                        paymentMethodId: selectedRealCardId,
                    }
                });
                
                if (confirmError) {
                    throw new Error(confirmError.message);
                }
            }

            if (pointsToUse > 0) await redeemPoints(pointsToUse, result.paymentIntentId);
            const pts = Number((result as any)?.pointsAwarded) || 0;
            show(
                pts > 0
                    ? `Pago OK · +${pts} pts`
                    : `Pago OK`,
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

    const c = colors(isDark);
    const accent = theme?.colors?.primary || c.primary;
    const textColor = theme?.colors?.text || c.text;
    const muted = theme?.colors?.textSecondary || c.textMuted;

    return (
        <View style={styles.root}>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: 12, backgroundColor: glass.bg, borderRadius: Radius.md, borderWidth: 1, borderColor: glass.border }}>
                <View>
                    <Text style={{ color: textColor, fontWeight: '700' }}>{isLive ? 'Modo Real' : 'Modo Prueba'}</Text>
                    <Text style={{ color: muted, fontSize: 12 }}>{isLive ? 'Usarás tarjetas verdaderas' : 'Transacciones simuladas'}</Text>
                </View>
                <Switch 
                    value={isLive} 
                    onValueChange={toggle}
                    trackColor={{ false: '#9CA3AF', true: accent }}
                />
            </View>

            <Text style={[styles.sectionLabel, { color: textColor }]}>Medio de pago {isLive ? '(real)' : '(simulado)'}</Text>


            {isLive ? (
                <View style={{ gap: 10 }}>
                    {realCards.length === 0 ? (
                        <Text style={{ color: muted, textAlign: 'center', padding: 20 }}>No tienes tarjetas guardadas.</Text>
                    ) : (
                        realCards.map(card => (
                            <TouchableOpacity
                                key={card.id}
                                onPress={() => setSelectedRealCardId(card.id)}
                                style={[styles.cheatToggle, { borderColor: selectedRealCardId === card.id ? accent : glass.border, backgroundColor: glass.bg }]}
                            >
                                <Text style={[styles.cheatToggleText, { color: textColor }]}>
                                    {card.card?.brand?.toUpperCase()} •••• {card.card?.last4}
                                </Text>
                            </TouchableOpacity>
                        ))
                    )}
                    <TouchableOpacity onPress={handleAddCard} style={[styles.cheatToggle, { borderColor: glass.border, backgroundColor: glass.bg, justifyContent: 'center' }]}>
                        <Text style={[styles.cheatToggleText, { color: accent, textAlign: 'center' }]}>+ Agregar Nueva Tarjeta</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <SimulatedCardsPanel
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onSelectedCard={onSelectedCard}
                    accent={accent}
                    textColor={textColor}
                    muted={muted}
                    isDark={isDark}
                />
            )}


            <TouchableOpacity
                onPress={() => setShowCheat((v) => !v)}
                style={[styles.cheatToggle, { borderColor: glass.border, backgroundColor: glass.bg }]}
            >
                <Sparkles size={16} color={accent} />
                <Text style={[styles.cheatToggleText, { color: textColor }]}>Tarjetas de prueba Stripe</Text>
                {showCheat ? <ChevronUp size={18} color={muted} /> : <ChevronDown size={18} color={muted} />}
            </TouchableOpacity>

            {showCheat && (
                <View style={[styles.cheatSheet, { backgroundColor: glass.bg, borderColor: glass.border }]}>
                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                        {STRIPE_TEST_CARDS.map((c) => (
                            <TouchableOpacity
                                key={c.id}
                                style={[styles.cheatRow, { borderBottomColor: glass.border }]}
                                onPress={() => setSelectedId(c.id)}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.cheatBrand, { color: textColor }]}>{c.label}</Text>
                                    <Text style={[styles.cheatNum, { color: muted }]}>{formatCardNumber(c.number)}</Text>
                                </View>
                                <Text style={[styles.cheatMeta, { color: muted }]}>
                                    {c.exp} · {c.cvc}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            <View style={[styles.pointsBar, { backgroundColor: glass.bg, borderColor: glass.border }]}>
                <View style={styles.pointsLeft}>
                    <View style={[styles.pointsIcon, { backgroundColor: '#F59E0B22' }]}>
                        <Sparkles size={18} color="#F59E0B" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.pointsTitle, { color: textColor }]}>Usar puntos Ramgos</Text>
                        <Text style={[styles.pointsSub, { color: muted }]}>
                            {points} pts · máx. -${Math.min(points * POINT_USD, amount).toFixed(2)}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => {
                            setApplyPoints((v) => !v);
                            if (!applyPoints) setPointsInput(String(Math.min(points, Math.floor(amount / POINT_USD))));
                        }}
                        style={[styles.toggle, { backgroundColor: applyPoints ? accent : '#CBD5E1' }]}
                    >
                        <Text style={styles.toggleText}>{applyPoints ? 'ON' : 'OFF'}</Text>
                    </TouchableOpacity>
                </View>
                {applyPoints && (
                    <View style={styles.pointsRow}>
                        <TextInput
                            value={pointsInput}
                            onChangeText={setPointsInput}
                            keyboardType="number-pad"
                            placeholder="Puntos a usar"
                            placeholderTextColor="#94A3B8"
                            style={[styles.pointsInput, { color: textColor, borderColor: muted + '44' }]}
                        />
                        <Text style={[styles.discountTag, { color: accent }]}>-${discountUsd.toFixed(2)}</Text>
                    </View>
                )}
            </View>

            <View style={[styles.payDock, { backgroundColor: glass.bg, borderColor: glass.border }]}>
                <View style={styles.payMeta}>
                    <Text style={[styles.payMetaLabel, { color: muted }]}>Total</Text>
                    <Text style={[styles.payMetaVal, { color: textColor }]}>${chargeAmount.toFixed(2)}</Text>
                </View>
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
                            {chargeAmount > 0 ? `Pagar $${chargeAmount.toFixed(2)}` : 'Pagar con puntos'}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { gap: 12 },
    sectionLabel: { fontSize: 15, fontWeight: '800', marginLeft: 2 },
    cheatToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: Radius.md,
        borderWidth: 1,
    },
    cheatToggleText: { flex: 1, fontSize: 13, fontWeight: '700' },
    cheatSheet: { borderRadius: Radius.lg, borderWidth: 1, padding: 14 },
    cheatRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 8,
    },
    cheatBrand: { fontSize: 13, fontWeight: '700' },
    cheatNum: { fontSize: 12, marginTop: 2 },
    cheatMeta: { fontSize: 11, fontWeight: '600' },
    pointsBar: { gap: 10, borderRadius: Radius.lg, borderWidth: 1, padding: 14 },
    pointsLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pointsIcon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
    pointsTitle: { fontSize: 14, fontWeight: '800' },
    pointsSub: { fontSize: 12, marginTop: 2 },
    toggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full },
    toggleText: { color: '#fff', fontSize: 11, fontWeight: '800' },
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
    discountTag: { fontSize: 15, fontWeight: '800' },
    payDock: { marginTop: 4, padding: 14, borderRadius: Radius.lg, gap: 12, borderWidth: 1 },
    payMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    payMetaLabel: { fontSize: 13, fontWeight: '600' },
    payMetaVal: { fontSize: 22, fontWeight: '900' },
    payBtn: { height: 56, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
    payBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
