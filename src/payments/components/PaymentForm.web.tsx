import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    ScrollView,
    TextInput,
    Platform,
} from 'react-native';
import { useAction } from 'convex/react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react-native';
import { api } from '../../../convex/_generated/api';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePoints } from '../../contexts/PointsContext';
import { glassTokens } from '../../utils/glass';
import { STRIPE_TEST_CARDS, formatCardNumber } from '../testCards';
import { SimulatedCardsPanel, type WalletCard } from './SimulatedCardsPanel';

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
    onError: (error: string | null) => void;
    theme?: any;
}

export function PaymentForm({ amount, cartId, lineItems, onSuccess, onError, theme }: PaymentFormProps) {
    const createPaymentIntent = useAction(api.stripe.createPaymentIntent);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState(STRIPE_TEST_CARDS[0].id);
    const [selectedCard, setSelectedCard] = useState<WalletCard>(STRIPE_TEST_CARDS[0]);
    const [showCheat, setShowCheat] = useState(false);
    const [pointsInput, setPointsInput] = useState('');
    const [applyPoints, setApplyPoints] = useState(false);
    const { show } = useToast();
    const { sessionToken } = useAuth();
    const { points, redeemPoints } = usePoints();
    const isDark = theme?.colors?.background === '#1E293B' || theme?.dark;
    const glass = glassTokens(!!isDark);

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
                simulate: true,
            });

            if (pointsToUse > 0) await redeemPoints(pointsToUse, result.paymentIntentId);
            const pts = Number((result as any)?.pointsAwarded) || 0;
            show(
                pts > 0
                    ? `Pago OK · +${pts} pts · ${selectedCard.label} •••• ${selectedCard.last4}`
                    : `Pago simulado OK · ${selectedCard.label} •••• ${selectedCard.last4}`,
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

    const accent = theme?.colors?.primary || '#E31C3D';
    const textColor = theme?.colors?.text || '#0F172A';
    const muted = theme?.colors?.textSecondary || '#64748B';

    return (
        <View style={styles.root}>
            <Text style={[styles.sectionLabel, { color: textColor }]}>Medio de pago (simulado)</Text>

            <SimulatedCardsPanel
                selectedId={selectedId}
                onSelect={setSelectedId}
                onSelectedCard={onSelectedCard}
                accent={accent}
                textColor={textColor}
                muted={muted}
                isDark={!!isDark}
            />

            <Text style={[styles.presetHint, { color: muted }]}>
                Agregá, editá o borrá tus tarjetas · pago simulado
            </Text>

            <TouchableOpacity
                onPress={() => setShowCheat((v) => !v)}
                style={[styles.cheatToggle, { borderColor: glass.border, backgroundColor: glass.bg }]}
                activeOpacity={0.85}
            >
                <Sparkles size={16} color={accent} />
                <Text style={[styles.cheatToggleText, { color: textColor }]}>Tarjetas de prueba Stripe</Text>
                {showCheat ? <ChevronUp size={18} color={muted} /> : <ChevronDown size={18} color={muted} />}
            </TouchableOpacity>

            {showCheat && (
                <View style={[styles.cheatSheet, { backgroundColor: glass.bg, borderColor: glass.border }]}>
                    <Text style={[styles.cheatIntro, { color: muted }]}>
                        Tocá para seleccionar · CVC cualquier · fecha 12/34 · docs.stripe.com/testing
                    </Text>
                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                        {STRIPE_TEST_CARDS.map((c) => (
                            <TouchableOpacity
                                key={c.id}
                                style={[styles.cheatRow, { borderBottomColor: glass.border }]}
                                onPress={() => {
                                    setSelectedId(c.id);
                                    show(`${c.label}: ${formatCardNumber(c.number)}`, 'info');
                                }}
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
    presetHint: { fontSize: 12, fontWeight: '500', marginLeft: 2 },
    cheatToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
    },
    cheatToggleText: { flex: 1, fontSize: 13, fontWeight: '700' },
    cheatSheet: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
    cheatIntro: { fontSize: 11, fontWeight: '500', marginBottom: 4 },
    cheatRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 8,
    },
    cheatBrand: { fontSize: 13, fontWeight: '700' },
    cheatNum: { fontSize: 12, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, marginTop: 2 },
    cheatMeta: { fontSize: 11, fontWeight: '600' },
    pointsBar: { gap: 10, borderRadius: 16, borderWidth: 1, padding: 14 },
    pointsLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pointsIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    pointsTitle: { fontSize: 14, fontWeight: '800' },
    pointsSub: { fontSize: 12, marginTop: 2 },
    toggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    toggleText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    pointsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pointsInput: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        fontWeight: '600',
    },
    discountTag: { fontSize: 15, fontWeight: '800' },
    payDock: { marginTop: 4, padding: 14, borderRadius: 18, gap: 12, borderWidth: 1 },
    payMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    payMetaLabel: { fontSize: 13, fontWeight: '600' },
    payMetaVal: { fontSize: 22, fontWeight: '900' },
    payBtn: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    payBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
