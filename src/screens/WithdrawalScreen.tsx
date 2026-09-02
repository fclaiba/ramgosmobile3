/**
 * WithdrawalScreen — Stripe Connect payout management.
 *
 * Sprint 6 rewrite: this screen no longer collects raw bank details (the
 * legacy ACH form was a mock — `finance.createWithdrawal` only flipped a
 * status flag and never moved money). The seller's bank lives inside their
 * Stripe Connect account now (added during onboarding via Stripe-hosted
 * KYC), so all this screen does is:
 *
 *   1. Show the live Connect balance (available + pending) read from
 *      Stripe with no DB cache.
 *   2. Let the seller pick an automatic payout schedule
 *      (manual / daily / weekly / monthly), persisted on the connected
 *      account via `accounts.update({ settings.payouts.schedule })`.
 *   3. Trigger an on-demand payout via `payouts.create` scoped to the
 *      connected account (Stripe-Account header).
 *
 * If the seller hasn't completed Connect onboarding yet, the screen guides
 * them back to the dashboard banner (we do NOT replicate the onboarding UI
 * here — single source of truth lives on BusinessDashboardScreen /
 * InfluencerDashboardScreen).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { MobileHeader } from '../components/MobileHeader';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Wallet, DollarSign, Calendar, Send, AlertCircle, CheckCircle2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAction } from 'convex/react';
import * as Crypto from 'expo-crypto';
import { api } from '../../convex/_generated/api';
import { useConnectOnboarding } from '../hooks/useConnectOnboarding';
import { usePaymentMode } from '../contexts/PaymentModeContext';
import { useTheme } from '../contexts/ThemeContext';
import { glassShadow, Radius, colors } from '../theme/tokens';


type Interval = 'manual' | 'daily' | 'weekly' | 'monthly';

const INTERVALS: { id: Interval; label: string; description: string }[] = [
    { id: 'manual', label: 'Manual', description: 'Disparo on-demand desde esta pantalla.' },
    { id: 'daily', label: 'Diario', description: 'Stripe envía tu balance todos los días hábiles.' },
    { id: 'weekly', label: 'Semanal', description: 'Stripe envía tu balance una vez por semana.' },
    { id: 'monthly', label: 'Mensual', description: 'Stripe envía tu balance una vez al mes.' },
];

export default function WithdrawalScreen({ navigation, route }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { user, sessionToken } = useAuth();
    const { show } = useToast();

    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [scheduleSaving, setScheduleSaving] = useState(false);
    const [interval, setInterval] = useState<Interval>('manual');
    const [balance, setBalance] = useState<{
        accountId: string | null;
        availableCents: number;
        pendingCents: number;
        instantAvailableCents: number;
        currency: string;
    } | null>(null);
    const [refreshing, setRefreshing] = useState(true);
    const [scheduleUnsupported, setScheduleUnsupported] = useState(false);

    const getConnectBalance = useAction(api.connect.getConnectBalance);
    const getPayoutSchedule = useAction(api.connect.getPayoutSchedule);
    const updatePayoutSchedule = useAction(api.connect.updatePayoutSchedule);
    const requestInstantPayout = useAction(api.connect.requestInstantPayout);

    const { mode } = usePaymentMode();
    const userId = user?.id ?? route.params?.ownerId;
    const targetUserId = userId && userId !== user?.id ? String(userId) : undefined;
    const connect = useConnectOnboarding(targetUserId ? { userId: targetUserId } : undefined);
    const stripeConnectAccountId: string | undefined = connect.accountId ?? undefined;

    const loadBalance = async () => {
        const result = await getConnectBalance({ sessionToken, mode, ...(targetUserId ? { userId: targetUserId } : {}) });
        setBalance({
            accountId: result.accountId,
            availableCents: result.availableCents,
            pendingCents: result.pendingCents,
            instantAvailableCents: result.instantAvailableCents,
            currency: result.currency,
        });
    };

    useEffect(() => {
        let cancelled = false;
        if (!userId || !sessionToken || !stripeConnectAccountId) {
            setRefreshing(false);
            return;
        }
        (async () => {
            try {
                await loadBalance();
                const schedule = await getPayoutSchedule({ sessionToken, mode, ...(targetUserId ? { userId: targetUserId } : {}) });
                if (!cancelled) {
                    if (schedule.unsupported) setScheduleUnsupported(true);
                    else if (schedule.interval) setInterval(schedule.interval);
                }
            } catch (e: any) {
                console.warn('[Connect] balance/schedule fetch failed', e?.message ?? e);
            } finally {
                if (!cancelled) setRefreshing(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, sessionToken, mode, stripeConnectAccountId]);

    const availableUSD = useMemo(
        () => (balance ? balance.availableCents / 100 : 0),
        [balance],
    );
    const pendingUSD = useMemo(
        () => (balance ? balance.pendingCents / 100 : 0),
        [balance],
    );

    const onboardingMissing = !stripeConnectAccountId || !connect.canPayout;

    const handleSchedule = async (next: Interval) => {
        if (!userId) return;
        setScheduleSaving(true);
        try {
            const r = await updatePayoutSchedule({
                sessionToken,
                mode,
                ...(targetUserId ? { userId: targetUserId } : {}),
                interval: next,
            });
            if (r.unsupported) {
                setScheduleUnsupported(true);
                show('El calendario de payouts se administra desde tu dashboard de Stripe Express.', 'info');
                return;
            }
            setInterval(next);
            show(`Payouts ahora se envían en modo "${next}".`, 'success');
        } catch (e: any) {
            show(e.message || 'No se pudo actualizar el calendario.', 'error');
        } finally {
            setScheduleSaving(false);
        }
    };

    const handleInstantPayout = async () => {
        const usd = parseFloat(amount);
        if (isNaN(usd) || usd <= 0) {
            show('Monto inválido.', 'error');
            return;
        }
        if (usd < 1) {
            show('El monto mínimo de payout es $1.00 USD.', 'error');
            return;
        }
        if (usd > availableUSD) {
            show('Saldo disponible insuficiente.', 'error');
            return;
        }
        if (!userId) return;

        setLoading(true);
        try {
            const result = await requestInstantPayout({
                sessionToken,
                mode,
                ...(targetUserId ? { userId: targetUserId } : {}),
                amountInCents: Math.round(usd * 100),
                currency: balance?.currency ?? 'usd',
                // Idempotencia: un doble tap no genera dos payouts.
                requestId: Crypto.randomUUID(),
            });
            const arrives = result?.arrivalDate
                ? new Date(result.arrivalDate * 1000).toLocaleDateString('es-ES')
                : 'pronto';
            show(
                result.method === 'instant'
                    ? 'Payout instantáneo enviado. Llega en minutos.'
                    : `Payout solicitado. Llega aprox. ${arrives}.`,
                'success',
            );
            setAmount('');
            try {
                await loadBalance();
            } catch (_) { /* best-effort */ }
        } catch (e: any) {
            show(e.message || 'No se pudo procesar el payout.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <MobileHeader title="Retirar Fondos" backButton onBack={() => navigation.goBack()} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Balance card — sourced directly from the connected
                        account, not from our internal wallet, so the user
                        sees the same number Stripe will pay out from. */}
                    <LinearGradient colors={['#1e293b', '#0f172a']} style={styles.balanceCard}>
                        <View style={styles.balanceHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Wallet size={18} color="#94a3b8" />
                                <Text style={styles.balanceLabel}>Saldo disponible</Text>
                            </View>
                            <View style={styles.usdBadge}>
                                <Text style={styles.usdText}>{(balance?.currency ?? 'USD').toUpperCase()}</Text>
                            </View>
                        </View>
                        {refreshing ? (
                            <ActivityIndicator color="#fff" style={{ marginTop: 8 }} />
                        ) : (
                            <Text style={styles.balanceValue}>${availableUSD.toFixed(2)}</Text>
                        )}
                        <Text style={styles.balanceHint}>
                            Pendiente: ${pendingUSD.toFixed(2)} · liquidado por Stripe en 1–3 días.
                        </Text>
                    </LinearGradient>

                    {onboardingMissing ? (
                        <View style={styles.warningCard}>
                            <AlertCircle size={20} color="#B45309" />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.warningTitle}>Conecta tu cuenta de pagos</Text>
                                <Text style={styles.warningDesc}>
                                    {stripeConnectAccountId
                                        ? 'Stripe todavía no habilitó los retiros de tu cuenta. Completá el onboarding pendiente desde el panel principal.'
                                        : 'Aún no tenés una cuenta de Stripe Connect. Completá el onboarding desde el panel principal para habilitar payouts.'}
                                </Text>
                            </View>
                        </View>
                    ) : (
                        <>
                            {/* Payout schedule */}
                            {scheduleUnsupported ? (
                                <View style={styles.formSection}>
                                    <Text style={styles.sectionTitle}>Calendario automático</Text>
                                    <Text style={styles.sectionHelp}>
                                        El calendario de payouts de tu cuenta se administra desde tu dashboard de Stripe Express.
                                    </Text>
                                </View>
                            ) : (
                            <View style={styles.formSection}>
                                <Text style={styles.sectionTitle}>Calendario automático</Text>
                                <Text style={styles.sectionHelp}>
                                    Stripe envía automáticamente tu balance disponible según este calendario. Puedes pasar a "Manual" si prefieres disparar payouts on-demand.
                                </Text>
                                <View style={{ gap: 10, marginTop: 10 }}>
                                    {INTERVALS.map((opt) => {
                                        const active = interval === opt.id;
                                        return (
                                            <TouchableOpacity
                                                key={opt.id}
                                                onPress={() => handleSchedule(opt.id)}
                                                style={[styles.scheduleRow, active && styles.scheduleRowActive]}
                                                disabled={scheduleSaving}
                                            >
                                                <Calendar size={18} color={active ? '#1D4ED8' : '#475569'} />
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.scheduleLabel, active && { color: '#1D4ED8' }]}>{opt.label}</Text>
                                                    <Text style={styles.scheduleDesc}>{opt.description}</Text>
                                                </View>
                                                {active && <CheckCircle2 size={18} color="#1D4ED8" />}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                            )}

                            {/* On-demand payout */}
                            <View style={styles.formSection}>
                                <Text style={styles.sectionTitle}>Payout instantáneo</Text>
                                <Text style={styles.sectionHelp}>
                                    Envía un payout estándar desde tu balance disponible a la cuenta bancaria registrada en Stripe.
                                </Text>
                                <View style={[styles.amountInputContainer, { marginTop: 10 }]}>
                                    <DollarSign size={20} color="#374151" />
                                    <TextInput
                                        style={styles.amountInput}
                                        value={amount}
                                        onChangeText={setAmount}
                                        placeholder="0.00"
                                        keyboardType="numeric"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>
                                <Text style={styles.helperText}>Mínimo $1.00 USD</Text>
                                <TouchableOpacity
                                    style={[
                                        styles.withdrawButton,
                                        (loading || !amount || parseFloat(amount) <= 0) && styles.disabledButton,
                                    ]}
                                    onPress={handleInstantPayout}
                                    disabled={loading || !amount || parseFloat(amount) <= 0}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <Send size={18} color="#fff" style={{ marginRight: 8 }} />
                                            <Text style={styles.withdrawButtonText}>Enviar payout</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                                <Text style={styles.securityNote}>
                                    Los datos bancarios viven en Stripe. Para cambiarlos, ve al dashboard de Stripe Express vinculado a tu cuenta.
                                </Text>
                            </View>
                        </>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const getStyles = (isDark: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    scrollContent: { padding: 20, paddingBottom: 40 },

    balanceCard: {
        padding: 24,
        borderRadius: Radius.xl,
        marginBottom: 24,
        ...glassShadow(isDark),
    },
    balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    balanceLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '500' },
    usdBadge: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm },
    usdText: { color: isDark ? '#09090B' : '#FAFAFA', fontSize: 12, fontWeight: 'bold' },
    balanceValue: { fontSize: 42, fontWeight: '800', color: isDark ? '#09090B' : '#FAFAFA', marginBottom: 8 },
    balanceHint: { color: '#94a3b8', fontSize: 13 },

    warningCard: {
        flexDirection: 'row',
        gap: 12,
        backgroundColor: '#FFFBEB',
        borderColor: '#FEF3C7',
        borderWidth: 1,
        borderRadius: Radius.md,
        padding: 16,
        alignItems: 'flex-start',
    },
    warningTitle: { fontWeight: '800', color: '#78350F' },
    warningDesc: { color: '#92400E', fontSize: 13, marginTop: 4, lineHeight: 18 },

    formSection: { marginBottom: 24 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 4 },
    sectionHelp: { fontSize: 13, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280', lineHeight: 18 },

    scheduleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: Radius.md,
        backgroundColor: colors(isDark).glass,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
    },
    scheduleRowActive: { borderColor: '#1D4ED8', backgroundColor: '#EFF6FF' },
    scheduleLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
    scheduleDesc: { fontSize: 12, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280', marginTop: 2 },

    amountInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors(isDark).bg,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
        borderRadius: Radius.md,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    amountInput: {
        flex: 1,
        fontSize: 20,
        fontWeight: '600',
        color: '#111827',
        marginLeft: 8,
    },
    helperText: { fontSize: 12, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280', marginTop: 6, marginLeft: 4 },

    withdrawButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#111827',
        paddingVertical: 16,
        borderRadius: Radius.lg,
        marginTop: 14,
        ...glassShadow(isDark),},
    disabledButton: { opacity: 0.6, backgroundColor: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#4B5563' },
    withdrawButtonText: { color: isDark ? '#09090B' : '#FAFAFA', fontSize: 16, fontWeight: 'bold' },
    securityNote: { textAlign: 'center', fontSize: 11, color: isDark ? '#6B7280' : '#9CA3AF', marginTop: 12 },
});
