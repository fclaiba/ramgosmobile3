/**
 * WithdrawalScreen — administración financiera de la cuenta conectada.
 *
 * Es la pantalla detrás de "Ver saldo y retiros" y se banca los tres mundos:
 *
 *   1. Sin cuenta / onboarding a medias → el usuario puede conectar, continuar
 *      o releer el estado desde acá mismo. Esto es a propósito: antes la
 *      pantalla sólo decía "completá el onboarding desde el panel principal",
 *      y como el panel ramificaba por "¿existe accountId?" (que
 *      `ensureConnectAccount` persiste ANTES de que el usuario complete el
 *      formulario de Stripe), quien cancelaba en Stripe se quedaba sin ningún
 *      botón para reintentar. Loop cerrado — E-148.
 *   2. Cuenta lista → saldo en vivo leído de Stripe (sin caché en la DB),
 *      calendario de payouts, payout on-demand e historial de retiros.
 *   3. Administración de la cuenta → dashboard Express, cambiar de cuenta,
 *      desvincular.
 *
 * La plata nunca se pinta a la ligera: si no pudimos leer el saldo se muestra
 * un guión y un botón de reintento, nunca "$0.00", que es indistinguible de un
 * cero legítimo.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    RefreshControl,
    Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MobileHeader } from '../components/MobileHeader';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
    Wallet,
    DollarSign,
    Calendar,
    Send,
    AlertCircle,
    CheckCircle2,
    ExternalLink,
    Unlink,
    Repeat,
    RefreshCw,
    History,
    Landmark,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAction } from 'convex/react';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { api } from '../../convex/_generated/api';
import { useConnectOnboarding } from '../hooks/useConnectOnboarding';
import { usePaymentMode } from '../contexts/PaymentModeContext';
import { useTheme } from '../contexts/ThemeContext';
import { glassShadow, Radius, colors } from '../theme/tokens';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { ConnectStatusBanner } from '../components/connect/ConnectStatusBanner';
import { formatCurrency, formatDateShort, formatRelativeTime } from '../utils/formatters';

type Interval = 'manual' | 'daily' | 'weekly' | 'monthly';

type DataState = 'loading' | 'ready' | 'error';

type Balance = {
    accountId: string | null;
    availableCents: number;
    pendingCents: number;
    instantAvailableCents: number;
    currency: string;
};

type PayoutRow = {
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    method: string;
    createdAt: number;
    arrivalDate: number | null;
    failureMessage: string | null;
};

const INTERVALS: { id: Interval; label: string; description: string }[] = [
    { id: 'manual', label: 'Manual', description: 'Disparo on-demand desde esta pantalla.' },
    { id: 'daily', label: 'Diario', description: 'Stripe envía tu balance todos los días hábiles.' },
    { id: 'weekly', label: 'Semanal', description: 'Stripe envía tu balance una vez por semana.' },
    { id: 'monthly', label: 'Mensual', description: 'Stripe envía tu balance una vez al mes.' },
];

/** Variante de `Badge` y etiqueta en castellano para cada estado de payout. */
const PAYOUT_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'default' }> = {
    paid: { label: 'Pagado', variant: 'success' },
    pending: { label: 'Pendiente', variant: 'warning' },
    in_transit: { label: 'En camino', variant: 'warning' },
    canceled: { label: 'Cancelado', variant: 'danger' },
    failed: { label: 'Falló', variant: 'danger' },
};

const maskAccountId = (accountId: string) =>
    accountId.length > 16 ? `${accountId.slice(0, 16)}…` : accountId;

export default function WithdrawalScreen({ navigation, route }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const palette = colors(isDark);
    const { user, sessionToken } = useAuth();
    const { show } = useToast();
    const { mode } = usePaymentMode();

    // Mirar la cuenta de otro usuario es un camino de admin. La guarda por rol
    // NO es decorativa: `ownerId` llega desde el FintechContext (mock) y puede
    // valer "business_demo", así que sin ella `resolveTargetUser` respondería
    // "No autorizado." a cualquier vendedor común y la pantalla quedaría muerta.
    const actorRole = (user as any)?.role;
    const isAdminActor = actorRole === 'admin' || actorRole === 'developer';
    const ownerParam = route?.params?.ownerId ? String(route.params.ownerId) : undefined;
    const targetUserId =
        isAdminActor && ownerParam && ownerParam !== String(user?.id ?? '') ? ownerParam : undefined;

    const connect = useConnectOnboarding(targetUserId ? { userId: targetUserId } : undefined);
    const returnTo = useMemo(
        () => ({ screen: 'Withdrawal', params: ownerParam ? { ownerId: ownerParam } : {} }),
        [ownerParam],
    );

    const getConnectBalance = useAction(api.connect.getConnectBalance);
    const getPayoutSchedule = useAction(api.connect.getPayoutSchedule);
    const updatePayoutSchedule = useAction(api.connect.updatePayoutSchedule);
    const requestInstantPayout = useAction(api.connect.requestInstantPayout);
    const listRecentPayouts = useAction(api.connect.listRecentPayouts);
    const unlinkConnectAccount = useAction(api.connect.unlinkConnectAccount);
    const createExpressLoginLink = useAction(api.connect.createExpressLoginLink);

    const [amount, setAmount] = useState('');
    const [payoutLoading, setPayoutLoading] = useState(false);
    const [scheduleSaving, setScheduleSaving] = useState(false);
    const [payoutInterval, setPayoutInterval] = useState<Interval>('manual');
    const [scheduleUnsupported, setScheduleUnsupported] = useState(false);
    const [balance, setBalance] = useState<Balance | null>(null);
    const [payouts, setPayouts] = useState<PayoutRow[]>([]);
    const [payoutsUnsupported, setPayoutsUnsupported] = useState(false);
    const [dataState, setDataState] = useState<DataState>('loading');
    const [dataError, setDataError] = useState<string | null>(null);
    const [pullRefreshing, setPullRefreshing] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
    const [accountBusy, setAccountBusy] = useState<null | 'dashboard' | 'unlink' | 'switch'>(null);
    const [confirming, setConfirming] = useState<null | 'unlink' | 'switch'>(null);
    const [dashboardUnsupported, setDashboardUnsupported] = useState(false);

    /**
     * Idempotencia del payout. La key se mantiene ESTABLE mientras el usuario
     * reintenta el mismo monto: regenerarla en cada intento (lo que hacía
     * antes) significa que si Stripe crea el payout pero se corta la respuesta,
     * el reintento crea un segundo payout y la plata sale dos veces.
     */
    const payoutAttempt = useRef<{ amount: string; requestId: string } | null>(null);
    const requestIdFor = (normalizedAmount: string) => {
        if (!payoutAttempt.current || payoutAttempt.current.amount !== normalizedAmount) {
            payoutAttempt.current = { amount: normalizedAmount, requestId: Crypto.randomUUID() };
        }
        return payoutAttempt.current.requestId;
    };

    const scopeArgs = useMemo(
        () => ({ sessionToken, mode, ...(targetUserId ? { userId: targetUserId } : {}) }),
        [sessionToken, mode, targetUserId],
    );

    const hasLoadedRef = useRef(false);

    /**
     * Una sola función de carga para los tres disparadores (foco, flip del
     * estado reactivo, pull-to-refresh). `allSettled` a propósito: antes un
     * throw leyendo el calendario dejaba el saldo sin pintar aunque ya hubiera
     * llegado. Sólo el saldo puede mandar la pantalla a estado de error; el
     * calendario y el historial degradan solos.
     */
    const loadData = useCallback(
        async (opts?: { silent?: boolean; pull?: boolean }) => {
            if (!sessionToken || !connect.accountId) return;
            if (opts?.pull) setPullRefreshing(true);
            else if (!opts?.silent) setDataState('loading');

            const [balanceRes, scheduleRes, payoutsRes] = await Promise.allSettled([
                getConnectBalance(scopeArgs),
                getPayoutSchedule(scopeArgs),
                listRecentPayouts({ ...scopeArgs, limit: 10 }),
            ]);

            if (balanceRes.status === 'fulfilled') {
                setBalance(balanceRes.value);
                setDataError(null);
                setDataState('ready');
                setLastUpdatedAt(Date.now());
                hasLoadedRef.current = true;
            } else {
                setDataError(balanceRes.reason?.message || 'No pudimos leer tu saldo en Stripe.');
                setDataState('error');
            }

            if (scheduleRes.status === 'fulfilled') {
                setScheduleUnsupported(scheduleRes.value.unsupported);
                if (!scheduleRes.value.unsupported && scheduleRes.value.interval) {
                    setPayoutInterval(scheduleRes.value.interval);
                }
            }

            if (payoutsRes.status === 'fulfilled') {
                setPayoutsUnsupported(payoutsRes.value.unsupported);
                setPayouts(payoutsRes.value.payouts);
            }

            if (opts?.pull) setPullRefreshing(false);
        },
        [
            sessionToken,
            connect.accountId,
            scopeArgs,
            getConnectBalance,
            getPayoutSchedule,
            listRecentPayouts,
        ],
    );

    // Disparador 1 — foco. Cubre volver del universal link de Stripe, del
    // ConnectReturn o de cualquier goBack. Silencioso después de la primera
    // carga para no flashear el skeleton en cada foco.
    useFocusEffect(
        useCallback(() => {
            loadData(hasLoadedRef.current ? { silent: true } : undefined);
        }, [loadData]),
    );

    // Disparador 2 — la query reactiva `getMyConnectStatus` flipea a lista (el
    // webhook de Stripe, o el refresh() del retorno). Sin esto el usuario
    // completa el KYC y la pantalla sigue mostrando el banner hasta que salga y
    // vuelva a entrar. El ref evita la carga duplicada del primer render.
    const connectSignature = `${connect.accountId ?? ''}:${connect.canPayout}`;
    const lastSignatureRef = useRef<string | null>(null);
    useEffect(() => {
        if (lastSignatureRef.current === connectSignature) return;
        const isFirstRun = lastSignatureRef.current === null;
        lastSignatureRef.current = connectSignature;
        if (!isFirstRun) loadData({ silent: true });
    }, [connectSignature, loadData]);

    const availableCents = balance?.availableCents ?? 0;
    const pendingCents = balance?.pendingCents ?? 0;
    const availableUSD = availableCents / 100;
    const balanceKnown = dataState === 'ready' && balance !== null;
    const heldCents = availableCents + pendingCents;

    /**
     * Estado de pantalla DERIVADO — no `useState`. Que fuera un booleano suelto
     * (`refreshing`) es lo que dejaba "$0.00" en pantalla cuando en realidad no
     * habíamos podido leer nada.
     */
    const screen: 'booting' | 'unconfigured' | 'onboarding' | 'loading' | 'error' | 'ready' =
        connect.phase === 'loading'
            ? 'booting'
            : connect.phase === 'unconfigured'
              ? 'unconfigured'
              : connect.phase !== 'ready'
                ? 'onboarding'
                : dataState === 'loading'
                  ? 'loading'
                  : dataState === 'error'
                    ? 'error'
                    : 'ready';

    // La administración de la cuenta también aplica mientras Stripe revisa: en
    // 'review' la cuenta existe y el usuario tiene derecho a cambiarla.
    const showsAccountSection = connect.phase === 'ready' || connect.phase === 'review';

    const handleSchedule = async (next: Interval) => {
        setScheduleSaving(true);
        try {
            const r = await updatePayoutSchedule({ ...scopeArgs, interval: next });
            if (r.unsupported) {
                setScheduleUnsupported(true);
                show('El calendario de payouts se administra desde tu dashboard de Stripe.', 'info');
                return;
            }
            setPayoutInterval(next);
            show(`Payouts ahora se envían en modo "${next}".`, 'success');
        } catch (e: any) {
            show(e?.message || 'No se pudo actualizar el calendario.', 'error');
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
        if (!balanceKnown) {
            show('Todavía no pudimos confirmar tu saldo. Actualizá antes de retirar.', 'error');
            return;
        }
        if (usd > availableUSD) {
            show('Saldo disponible insuficiente.', 'error');
            return;
        }

        const amountInCents = Math.round(usd * 100);
        setPayoutLoading(true);
        try {
            const result = await requestInstantPayout({
                ...scopeArgs,
                amountInCents,
                currency: balance?.currency ?? 'usd',
                requestId: requestIdFor(String(amountInCents)),
            });
            const arrives = result?.arrivalDate
                ? new Date(result.arrivalDate * 1000).toLocaleDateString('es-419')
                : 'pronto';
            show(
                result.method === 'instant'
                    ? 'Payout instantáneo enviado. Llega en minutos.'
                    : `Payout solicitado. Llega aprox. ${arrives}.`,
                'success',
            );
            setAmount('');
            payoutAttempt.current = null;
            await loadData({ silent: true });
        } catch (e: any) {
            show(e?.message || 'No se pudo procesar el payout.', 'error');
        } finally {
            setPayoutLoading(false);
        }
    };

    const handleOpenStripeDashboard = async () => {
        setAccountBusy('dashboard');
        try {
            const r = await createExpressLoginLink(scopeArgs);
            if (!r.url) {
                setDashboardUnsupported(true);
                show('Stripe no habilita el dashboard para esta cuenta.', 'info');
                return;
            }
            if (Platform.OS === 'web') await Linking.openURL(r.url);
            else await WebBrowser.openBrowserAsync(r.url);
        } catch (e: any) {
            show(e?.message || 'No se pudo abrir el dashboard de Stripe.', 'error');
        } finally {
            setAccountBusy(null);
        }
    };

    /** `then === 'reconnect'` = "cambiar de cuenta": desvincula y abre Stripe. */
    const handleUnlink = async (then?: 'reconnect') => {
        setConfirming(null);
        setAccountBusy(then === 'reconnect' ? 'switch' : 'unlink');
        try {
            const r = await unlinkConnectAccount(scopeArgs);
            if (!r.unlinked) {
                show('No hay ninguna cuenta vinculada.', 'info');
                return;
            }
            setBalance(null);
            setPayouts([]);
            setLastUpdatedAt(null);
            setDataState('loading');
            hasLoadedRef.current = false;
            await connect.refresh();

            if (then === 'reconnect') {
                const result = await connect.start({ returnTo });
                if (result.outcome === 'error' || result.outcome === 'unauthenticated') {
                    show(result.message || 'No se pudo abrir el onboarding de Stripe.', 'error');
                } else if (result.ready) {
                    show('Tu nueva cuenta de pagos quedó habilitada.', 'success');
                } else {
                    show('El onboarding quedó a medias. Podés continuarlo cuando quieras.', 'info');
                }
            } else {
                show('Cuenta desvinculada.', 'success');
            }
        } catch (e: any) {
            show(e?.message || 'No se pudo desvincular la cuenta.', 'error');
        } finally {
            setAccountBusy(null);
        }
    };

    const renderBalanceValue = () => {
        if (screen === 'booting' || (dataState === 'loading' && !!connect.accountId)) {
            return <Skeleton style={styles.balanceSkeleton} />;
        }
        // Un guión, nunca "$0.00": el cero falso es indistinguible de un cero real.
        if (!balanceKnown) return <Text style={styles.balanceValue}>—</Text>;
        return <Text style={styles.balanceValue}>{formatCurrency(availableUSD)}</Text>;
    };

    return (
        <View style={styles.container}>
            <MobileHeader title="Saldo y retiros" backButton onBack={() => navigation.goBack()} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={pullRefreshing}
                            onRefresh={async () => {
                                setPullRefreshing(true);
                                const refreshed = await connect.refresh();
                                if (!refreshed.ok && refreshed.message) show(refreshed.message, 'error');
                                await loadData({ pull: true });
                                setPullRefreshing(false);
                            }}
                            tintColor={palette.textMuted}
                        />
                    }
                >
                    {/* Saldo — se lee de la cuenta conectada, no de nuestra
                        billetera interna, así el número es el mismo desde el
                        que Stripe va a pagar. */}
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
                        {renderBalanceValue()}
                        <Text style={styles.balanceHint}>
                            {balanceKnown
                                ? `Pendiente: ${formatCurrency(pendingCents / 100)} · liquidado por Stripe en 1–3 días.`
                                : 'Pendiente: — · liquidado por Stripe en 1–3 días.'}
                        </Text>
                        {balanceKnown && lastUpdatedAt !== null && (
                            <Text style={styles.balanceUpdated}>
                                Actualizado {formatRelativeTime(lastUpdatedAt)}
                            </Text>
                        )}
                    </LinearGradient>

                    {screen === 'booting' && (
                        <>
                            <Skeleton style={styles.blockSkeleton} />
                            <Skeleton style={styles.blockSkeleton} />
                        </>
                    )}

                    {(screen === 'unconfigured' || screen === 'onboarding') && (
                        <ConnectStatusBanner
                            connect={connect}
                            variant="card"
                            returnTo={returnTo}
                            onStarted={() => loadData({ silent: true })}
                            onRefreshed={() => loadData({ silent: true })}
                            containerStyle={{ marginBottom: 24 }}
                        />
                    )}

                    {screen === 'loading' && (
                        <>
                            <Skeleton style={styles.blockSkeleton} />
                            <Skeleton style={styles.blockSkeleton} />
                        </>
                    )}

                    {screen === 'error' && (
                        <View style={styles.errorCard}>
                            <AlertCircle size={20} color={palette.danger} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.errorTitle}>No pudimos leer tu saldo</Text>
                                <Text style={styles.errorDesc}>{dataError}</Text>
                                <TouchableOpacity style={styles.retryButton} onPress={() => loadData()}>
                                    <RefreshCw size={14} color="#FAFAFA" />
                                    <Text style={styles.retryButtonText}>Reintentar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {screen === 'ready' && (
                        <>
                            {/* Calendario automático */}
                            <View style={styles.formSection}>
                                <Text style={styles.sectionTitle}>Calendario automático</Text>
                                {scheduleUnsupported ? (
                                    <Text style={styles.sectionHelp}>
                                        El calendario de payouts de esta cuenta se administra desde el
                                        dashboard de Stripe. Abrilo desde "Cuenta de pagos", más abajo.
                                    </Text>
                                ) : (
                                    <>
                                        <Text style={styles.sectionHelp}>
                                            Stripe envía automáticamente tu balance disponible según este
                                            calendario. Podés pasar a "Manual" si preferís disparar los payouts
                                            vos mismo.
                                        </Text>
                                        <View style={{ gap: 10, marginTop: 10 }}>
                                            {INTERVALS.map((opt) => {
                                                const active = payoutInterval === opt.id;
                                                return (
                                                    <TouchableOpacity
                                                        key={opt.id}
                                                        onPress={() => handleSchedule(opt.id)}
                                                        style={[
                                                            styles.scheduleRow,
                                                            active && styles.scheduleRowActive,
                                                        ]}
                                                        disabled={scheduleSaving}
                                                    >
                                                        <Calendar
                                                            size={18}
                                                            color={active ? palette.primary : palette.textMuted}
                                                        />
                                                        <View style={{ flex: 1 }}>
                                                            <Text
                                                                style={[
                                                                    styles.scheduleLabel,
                                                                    active && { color: palette.primary },
                                                                ]}
                                                            >
                                                                {opt.label}
                                                            </Text>
                                                            <Text style={styles.scheduleDesc}>
                                                                {opt.description}
                                                            </Text>
                                                        </View>
                                                        {active && (
                                                            <CheckCircle2 size={18} color={palette.primary} />
                                                        )}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </>
                                )}
                            </View>

                            {/* Payout on-demand */}
                            <View style={styles.formSection}>
                                <Text style={styles.sectionTitle}>Retirar ahora</Text>
                                <Text style={styles.sectionHelp}>
                                    {availableCents === 0
                                        ? 'Sin saldo disponible todavía. Las ventas ya liquidadas por Stripe aparecen acá y desde ahí las podés retirar.'
                                        : 'Enviá un payout desde tu balance disponible a la cuenta bancaria registrada en Stripe.'}
                                </Text>
                                <View style={[styles.amountInputContainer, { marginTop: 10 }]}>
                                    <DollarSign size={20} color={palette.textMuted} />
                                    <TextInput
                                        style={styles.amountInput}
                                        value={amount}
                                        onChangeText={setAmount}
                                        placeholder="0.00"
                                        keyboardType="numeric"
                                        placeholderTextColor={palette.textMuted}
                                        editable={availableCents > 0}
                                    />
                                </View>
                                <Text style={styles.helperText}>
                                    Mínimo $1.00 USD · disponible {formatCurrency(availableUSD)}
                                </Text>
                                <TouchableOpacity
                                    style={[
                                        styles.withdrawButton,
                                        (payoutLoading || !amount || parseFloat(amount) <= 0) &&
                                            styles.disabledButton,
                                    ]}
                                    onPress={handleInstantPayout}
                                    disabled={payoutLoading || !amount || parseFloat(amount) <= 0}
                                >
                                    {payoutLoading ? (
                                        <ActivityIndicator color="#FAFAFA" />
                                    ) : (
                                        <>
                                            <Send size={18} color="#FAFAFA" style={{ marginRight: 8 }} />
                                            <Text style={styles.withdrawButtonText}>Enviar payout</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>

                            {/* Historial */}
                            {!payoutsUnsupported && (
                                <View style={styles.formSection}>
                                    <View style={styles.sectionTitleRow}>
                                        <History size={16} color={palette.text} />
                                        <Text style={styles.sectionTitle}>Últimos retiros</Text>
                                    </View>
                                    {payouts.length === 0 ? (
                                        <Text style={styles.sectionHelp}>Todavía no hiciste retiros.</Text>
                                    ) : (
                                        <View style={{ gap: 10, marginTop: 10 }}>
                                            {payouts.map((p) => {
                                                const meta =
                                                    PAYOUT_STATUS[p.status] ??
                                                    ({ label: p.status, variant: 'default' } as const);
                                                return (
                                                    <View key={p.id} style={styles.payoutRow}>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={styles.payoutAmount}>
                                                                {formatCurrency(p.amountCents / 100)}
                                                            </Text>
                                                            <Text style={styles.payoutMeta}>
                                                                {formatDateShort(p.createdAt * 1000)}
                                                                {p.method === 'instant' ? ' · instantáneo' : ''}
                                                            </Text>
                                                            {p.failureMessage && (
                                                                <Text style={styles.payoutError}>
                                                                    {p.failureMessage}
                                                                </Text>
                                                            )}
                                                        </View>
                                                        <Badge variant={meta.variant}>{meta.label}</Badge>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    )}
                                </View>
                            )}
                        </>
                    )}

                    {/* Administración de la cuenta conectada */}
                    {showsAccountSection && connect.accountId && (
                        <View style={styles.formSection}>
                            <View style={styles.sectionTitleRow}>
                                <Landmark size={16} color={palette.text} />
                                <Text style={styles.sectionTitle}>Cuenta de pagos</Text>
                            </View>

                            <View style={styles.accountRow}>
                                <Text style={styles.accountId}>{maskAccountId(connect.accountId)}</Text>
                                <Badge variant={connect.phase === 'ready' ? 'success' : 'warning'}>
                                    {connect.phase === 'ready' ? 'Activa' : 'En revisión'}
                                </Badge>
                            </View>

                            {!dashboardUnsupported && (
                                <TouchableOpacity
                                    style={styles.accountButton}
                                    onPress={handleOpenStripeDashboard}
                                    disabled={accountBusy !== null}
                                >
                                    {accountBusy === 'dashboard' ? (
                                        <ActivityIndicator size="small" color={palette.primary} />
                                    ) : (
                                        <>
                                            <ExternalLink size={16} color={palette.primary} />
                                            <Text style={styles.accountButtonText}>
                                                Abrir mi dashboard de Stripe
                                            </Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            )}
                            <Text style={styles.accountHelp}>
                                Tus datos bancarios viven en Stripe. Se cambian desde ese dashboard.
                            </Text>

                            {/* Cambiar / desvincular. La guarda de plata también vive
                                en el backend; acá se explica antes de que el usuario
                                toque nada. */}
                            {heldCents > 0 ? (
                                <View style={styles.lockedNotice}>
                                    <AlertCircle size={16} color={palette.warning} />
                                    <Text style={styles.lockedNoticeText}>
                                        Tenés {formatCurrency(heldCents / 100)} en esta cuenta. Retiralo antes
                                        de cambiarla o desvincularla.
                                    </Text>
                                </View>
                            ) : confirming ? (
                                <View style={styles.confirmBox}>
                                    <Text style={styles.confirmText}>
                                        {confirming === 'switch'
                                            ? '¿Desvinculamos esta cuenta y abrimos Stripe para conectar otra?'
                                            : '¿Seguro que querés desvincular esta cuenta?'}
                                    </Text>
                                    <Text style={styles.confirmNote}>
                                        Tu cuenta sigue existiendo en Stripe. Sólo dejamos de usarla para tus
                                        cobros.
                                    </Text>
                                    <View style={styles.confirmActions}>
                                        <TouchableOpacity
                                            style={styles.confirmCancel}
                                            onPress={() => setConfirming(null)}
                                            disabled={accountBusy !== null}
                                        >
                                            <Text style={styles.confirmCancelText}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.confirmAccept}
                                            onPress={() =>
                                                handleUnlink(confirming === 'switch' ? 'reconnect' : undefined)
                                            }
                                            disabled={accountBusy !== null}
                                        >
                                            {accountBusy !== null ? (
                                                <ActivityIndicator size="small" color="#FAFAFA" />
                                            ) : (
                                                <Text style={styles.confirmAcceptText}>
                                                    {confirming === 'switch' ? 'Cambiar' : 'Desvincular'}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ) : (
                                <View style={{ gap: 10, marginTop: 12 }}>
                                    <TouchableOpacity
                                        style={styles.accountButton}
                                        onPress={() => setConfirming('switch')}
                                        disabled={accountBusy !== null}
                                    >
                                        <Repeat size={16} color={palette.primary} />
                                        <Text style={styles.accountButtonText}>Cambiar de cuenta</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.dangerButton}
                                        onPress={() => setConfirming('unlink')}
                                        disabled={accountBusy !== null}
                                    >
                                        <Unlink size={16} color={palette.danger} />
                                        <Text style={styles.dangerButtonText}>Desvincular cuenta</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: c.bg },
        scrollContent: { padding: 20, paddingBottom: 40 },

        balanceCard: {
            padding: 24,
            borderRadius: Radius.xl,
            marginBottom: 24,
            ...glassShadow(isDark),
        },
        balanceHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
        },
        balanceLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '500' },
        usdBadge: {
            backgroundColor: 'rgba(255,255,255,0.1)',
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: Radius.sm,
        },
        // El gradiente de la card es oscuro en AMBOS temas, así que el texto va
        // claro fijo. El ternario por isDark que había acá estaba invertido y
        // dejaba el saldo casi negro sobre negro.
        usdText: { color: '#FAFAFA', fontSize: 12, fontWeight: 'bold' },
        balanceValue: { fontSize: 42, fontWeight: '800', color: '#FAFAFA', marginBottom: 8 },
        balanceSkeleton: { height: 46, width: 180, borderRadius: Radius.sm, marginBottom: 8 },
        balanceHint: { color: '#94a3b8', fontSize: 13 },
        balanceUpdated: { color: '#64748b', fontSize: 11, marginTop: 6 },

        blockSkeleton: { height: 120, borderRadius: Radius.lg, marginBottom: 16 },

        errorCard: {
            flexDirection: 'row',
            gap: 12,
            backgroundColor: c.dangerMuted,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: Radius.md,
            padding: 16,
            alignItems: 'flex-start',
            marginBottom: 24,
        },
        errorTitle: { fontWeight: '800', color: c.text },
        errorDesc: { color: c.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 },
        retryButton: {
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: 8,
            marginTop: 12,
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: Radius.md,
            backgroundColor: c.primary,
        },
        retryButtonText: { color: '#FAFAFA', fontWeight: '700', fontSize: 14 },

        formSection: { marginBottom: 24 },
        sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        sectionTitle: { fontSize: 16, fontWeight: 'bold', color: c.text, marginBottom: 4 },
        sectionHelp: { fontSize: 13, color: c.textMuted, lineHeight: 18 },

        scheduleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            borderRadius: Radius.md,
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        scheduleRowActive: { borderColor: c.primary, backgroundColor: c.primaryMuted },
        scheduleLabel: { fontSize: 14, fontWeight: '700', color: c.text },
        scheduleDesc: { fontSize: 12, color: c.textMuted, marginTop: 2 },

        amountInputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
            borderRadius: Radius.md,
            paddingHorizontal: 16,
            paddingVertical: 14,
        },
        amountInput: { flex: 1, fontSize: 20, fontWeight: '600', color: c.text, marginLeft: 8 },
        helperText: { fontSize: 12, color: c.textMuted, marginTop: 6, marginLeft: 4 },

        withdrawButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#111827',
            paddingVertical: 16,
            borderRadius: Radius.lg,
            marginTop: 14,
            ...glassShadow(isDark),
        },
        disabledButton: { opacity: 0.6 },
        // Va sobre #111827, oscuro en ambos temas.
        withdrawButtonText: { color: '#FAFAFA', fontSize: 16, fontWeight: 'bold' },

        payoutRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            borderRadius: Radius.md,
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        payoutAmount: { fontSize: 15, fontWeight: '700', color: c.text },
        payoutMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
        payoutError: { fontSize: 12, color: c.danger, marginTop: 4 },

        accountRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginTop: 10,
            marginBottom: 12,
        },
        accountId: { fontSize: 14, fontWeight: '600', color: c.textSecondary, flexShrink: 1 },
        accountButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 12,
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: c.glassBorder,
            backgroundColor: c.glass,
        },
        accountButtonText: { fontSize: 14, fontWeight: '700', color: c.primary },
        accountHelp: { fontSize: 12, color: c.textMuted, marginTop: 8, lineHeight: 17 },
        dangerButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 12,
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: c.dangerMuted,
            backgroundColor: c.dangerMuted,
        },
        dangerButtonText: { fontSize: 14, fontWeight: '700', color: c.danger },

        lockedNotice: {
            flexDirection: 'row',
            gap: 10,
            alignItems: 'flex-start',
            marginTop: 12,
            padding: 12,
            borderRadius: Radius.md,
            backgroundColor: c.warningMuted,
        },
        lockedNoticeText: { flex: 1, fontSize: 12, color: c.textSecondary, lineHeight: 17 },

        confirmBox: {
            marginTop: 12,
            padding: 14,
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: c.glassBorder,
            backgroundColor: c.glass,
        },
        confirmText: { fontSize: 14, fontWeight: '700', color: c.text },
        confirmNote: { fontSize: 12, color: c.textMuted, marginTop: 6, lineHeight: 17 },
        confirmActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
        confirmCancel: {
            flex: 1,
            alignItems: 'center',
            paddingVertical: 11,
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        confirmCancelText: { fontSize: 14, fontWeight: '700', color: c.textSecondary },
        confirmAccept: {
            flex: 1,
            alignItems: 'center',
            paddingVertical: 11,
            borderRadius: Radius.md,
            backgroundColor: c.danger,
        },
        confirmAcceptText: { fontSize: 14, fontWeight: '700', color: '#FAFAFA' },
    });
};
