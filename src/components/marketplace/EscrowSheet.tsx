import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    useWindowDimensions,
    Platform,
    TextInput,
    KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    ShieldCheck,
    Lock,
    AlertTriangle,
    CheckCircle2,
    CalendarClock,
    RefreshCcw,
    Gavel,
    X,
    Package,
    HeartCrack,
    HelpCircle,
    BadgeAlert,
    ChevronLeft,
    Banknote,
    MessageSquare,
    Send,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sheet, SheetContent } from '../ui/sheet';
import { useTheme } from '../../contexts/ThemeContext';
import { useMarketplace } from '../../contexts/MarketplaceContext';
import { useToast } from '../../contexts/ToastContext';
import { useEscrow } from '../../contexts/EscrowContext';
import type { EscrowPhase, EscrowState, EscrowOrder as Order } from '../../contexts/EscrowContext';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';

// === STATE META ===
type _EscrowState = EscrowState;

interface StateMeta {
    label: string;
    shortLabel: string;
    tone: 'info' | 'warning' | 'success' | 'danger' | 'neutral';
    Icon: any;
    gradientLight: [string, string];
    gradientDark: [string, string];
    step: number; // 0-4 for progress
}

const ESCROW_STATE_META: Record<EscrowState, StateMeta> = {
    held: {
        label: 'Pago en retención',
        shortLabel: 'Retenido',
        tone: 'warning',
        Icon: Lock,
        gradientLight: ['#FEF3C7', '#FFFBEB'],
        gradientDark: ['rgba(217, 119, 6, 0.25)', 'rgba(17, 24, 39, 0.0)'],
        step: 1,
    },
    release_scheduled: {
        label: 'Liberación programada',
        shortLabel: 'Programado',
        tone: 'info',
        Icon: CalendarClock,
        gradientLight: ['#DBEAFE', '#EFF6FF'],
        gradientDark: ['rgba(37, 99, 235, 0.25)', 'rgba(17, 24, 39, 0.0)'],
        step: 2,
    },
    released: {
        label: 'Fondos liberados',
        shortLabel: 'Liberado',
        tone: 'success',
        Icon: CheckCircle2,
        gradientLight: ['#D1FAE5', '#ECFDF5'],
        gradientDark: ['rgba(5, 150, 105, 0.25)', 'rgba(17, 24, 39, 0.0)'],
        step: 4,
    },
    disputed: {
        label: 'En disputa',
        shortLabel: 'Disputa',
        tone: 'danger',
        Icon: Gavel,
        gradientLight: ['#FEE2E2', '#FEF2F2'],
        gradientDark: ['rgba(220, 38, 38, 0.25)', 'rgba(17, 24, 39, 0.0)'],
        step: 3,
    },
    refunded: {
        label: 'Reembolsado',
        shortLabel: 'Reembolso',
        tone: 'neutral',
        Icon: RefreshCcw,
        gradientLight: ['#F3F4F6', '#F9FAFB'],
        gradientDark: ['rgba(107, 114, 128, 0.25)', 'rgba(17, 24, 39, 0.0)'],
        step: 4,
    },
};

const TONE_COLORS_DARK = {
    success: { bg: 'rgba(5, 150, 105, 0.2)', text: '#6EE7B7', border: 'rgba(110, 231, 183, 0.3)', icon: '#10B981' },
    warning: { bg: 'rgba(217, 119, 6, 0.2)', text: '#FCD34D', border: 'rgba(252, 211, 77, 0.3)', icon: '#F59E0B' },
    danger: { bg: 'rgba(220, 38, 38, 0.2)', text: '#FCA5A5', border: 'rgba(252, 165, 165, 0.3)', icon: '#EF4444' },
    info: { bg: 'rgba(37, 99, 235, 0.2)', text: '#93C5FD', border: 'rgba(147, 197, 253, 0.3)', icon: '#3B82F6' },
    neutral: { bg: 'rgba(107, 114, 128, 0.2)', text: '#D1D5DB', border: 'rgba(209, 213, 219, 0.3)', icon: '#9CA3AF' },
};

const TONE_COLORS = {
    success: { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7', icon: '#059669' },
    warning: { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D', icon: '#D97706' },
    danger: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5', icon: '#DC2626' },
    info: { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD', icon: '#2563EB' },
    neutral: { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB', icon: '#6B7280' },
};

const REASONS = [
    { label: 'Producto no recibido', code: 'not_received', Icon: Package, types: ['product'] },
    { label: 'Producto dañado', code: 'damaged', Icon: HeartCrack, types: ['product'] },
    { label: 'No es lo que pedí', code: 'not_as_described', Icon: HelpCircle, types: ['product', 'service'] },
    { label: 'Faltan piezas', code: 'missing_parts', Icon: BadgeAlert, types: ['product'] },
    { label: 'Producto falso', code: 'counterfeit', Icon: AlertTriangle, types: ['product'] },
    // Service specific
    { label: 'Servicio no realizado', code: 'not_received', Icon: AlertTriangle, types: ['service'] },
    { label: 'Servicio incompleto', code: 'missing_parts', Icon: BadgeAlert, types: ['service'] },
    { label: 'Calidad deficiente', code: 'damaged', Icon: HeartCrack, types: ['service'] },
] as const;

const TERMINOLOGY = {
    product: {
        confirmBtn: 'Confirmar entrega',
        progress: ['Pago', 'Retenido', 'Enviado', 'Liberado'],
        explanation: {
            held: (role: string) => role === 'buyer' ? 'Tu pago está protegido. Confirmá entrega para liberar.' : 'Pago retenido. Se libera al confirmar entrega.',
        }
    },
    service: {
        confirmBtn: 'Confirmar servicio',
        progress: ['Pago', 'Retenido', 'Realizado', 'Liberado'],
        explanation: {
            held: (role: string) => role === 'buyer' ? 'Tu pago está protegido. Confirmá realización para liberar.' : 'Pago retenido. Se libera al confirmar servicio.',
        }
    }
};

// === HELPERS ===
const formatShortDate = (value?: string) => {
    if (!value) return null;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
};

const formatMoney = (amount: number, currency: string) => {
    const cur = currency || 'USD';
    try {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur }).format(amount);
    } catch {
        return `${cur} ${amount.toFixed(2)}`;
    }
};

// === COMPONENT ===
export type EscrowSheetRole = 'buyer' | 'seller';
export interface EscrowSheetProps {
    /**
     * Controlled mode: when provided, EscrowSheet will follow these values instead of EscrowContext.
     * Optional for backward compatibility with context-driven usage.
     */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    order?: Order;
    role?: EscrowSheetRole;
    phase?: EscrowPhase;
    onPhaseChange?: (phase: EscrowPhase) => void;

    // Optional callbacks used by some screens; safe no-ops.
    onOpenDispute?: () => void;
    onOpenDisputeChat?: () => void;
}

export function EscrowSheet(props: EscrowSheetProps = {}) {
    const { colorScheme } = useTheme();
    const { user, sessionToken } = useAuth();
    const confirmReceiptMutation = useMutation(api.orders.confirmReceipt);
    const openDisputeMutation = useMutation(api.orders.openDispute);
    const addDisputeMessageMutation = useMutation(api.disputes.addDisputeMessage);

    const { isOpen: ctxIsOpen, closeEscrow: ctxCloseEscrow, activeOrder: ctxOrder, role: ctxRole, phase: ctxPhase, setPhase: ctxSetPhase } = useEscrow();
    const { show } = useToast();

    const isDark = colorScheme === 'dark';
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const [controlledPhase, setControlledPhase] = useState<EscrowPhase>('status');
    const isControlled = typeof props.open === 'boolean' && typeof props.onOpenChange === 'function';

    const isOpen = isControlled ? (props.open as boolean) : ctxIsOpen;
    const closeEscrow = () => {
        if (isControlled) {
            props.onOpenChange?.(false);
            if (typeof props.onPhaseChange !== 'function') setControlledPhase('status');
            return;
        }
        ctxCloseEscrow();
    };
    const order = isControlled ? props.order : ctxOrder;
    const role: EscrowSheetRole = isControlled ? (props.role ?? ctxRole) : ctxRole;
    const phase: EscrowPhase = isControlled ? (props.phase ?? controlledPhase) : ctxPhase;
    const setPhase = (next: EscrowPhase) => {
        if (isControlled) {
            if (typeof props.onPhaseChange === 'function') props.onPhaseChange(next);
            else setControlledPhase(next);
            return;
        }
        ctxSetPhase(next);
    };

    // #region agent log
    // Debug logging removed
    // #endregion

    const [reason, setReason] = useState<string>('');
    const [description, setDescription] = useState<string>('');
    const [chatInput, setChatInput] = useState<string>('');
    const scrollViewRef = useRef<ScrollView>(null);

    // Live dispute messages from Convex
    const liveMessages = useQuery(
        api.disputes.getDisputeMessages,
        order?.id && user?.id ? { orderId: order.id as any } : 'skip',
    ) ?? [];

    // Reset state when opening/closing
    useEffect(() => {
        if (!isOpen) {
            const t = setTimeout(() => {
                setReason('');
                setDescription('');
                setChatInput('');
            }, 300);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    // Scroll to bottom on new messages
    useEffect(() => {
        if (liveMessages.length > 0 && isOpen && phase === 'chat') {
            const t = setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 100);
            return () => clearTimeout(t);
        }
    }, [liveMessages.length, isOpen, phase]);

    // Responsive breakpoints
    const isSmall = width < 375;
    const isMedium = width >= 375 && width < 768;
    const isLarge = width >= 768;

    const contentMaxWidth = isLarge ? 560 : Math.min(600, width);
    const horizontalPadding = isSmall ? 12 : isMedium ? 16 : 24;
    const cardPadding = isSmall ? 12 : 16;
    const fontSize = {
        xs: isSmall ? 10 : 11,
        sm: isSmall ? 11 : 12,
        base: isSmall ? 13 : 14,
        lg: isSmall ? 15 : 16,
        xl: isSmall ? 18 : 20,
    };

    const styles = useMemo(() => getStyles(isDark, fontSize, cardPadding), [isDark, isSmall]);
    const toneColors = isDark ? TONE_COLORS_DARK : TONE_COLORS;
    const stateMeta = order ? ESCROW_STATE_META[order.escrow.state] : null;
    const tone = stateMeta?.tone ?? 'neutral';
    const colors = toneColors[tone];
    const StateIcon = stateMeta?.Icon ?? ShieldCheck;

    const listingType = order?.items[0]?.listingType ?? 'product';
    const isService = listingType === 'service' || listingType === 'event'; // Treat events as services for now
    const terms = isService ? TERMINOLOGY.service : TERMINOLOGY.product;

    // Actions
    const canConfirmDelivery = !!order && role === 'buyer' && order.paymentStatus === 'paid' && order.escrow.state === 'held' && !order.deliveryConfirmedAt;
    const canDispute = !!order && role === 'buyer' && order.paymentStatus === 'paid' && order.escrow.state !== 'released' && order.escrow.state !== 'refunded';
    const hasActiveDispute = !!order && !!order.dispute;

    const handleConfirmDelivery = async () => {
        if (!order || !user) return;
        try {
            await confirmReceiptMutation({
                orderId: order.id as any,
                sessionToken, userId: user.id,
            });
            show('Recepción confirmada. Fondos liberados.', 'success');
        } catch (e: any) {
            show(e.message || 'Error al confirmar', 'error');
        }
    };

    const handleSubmitDispute = async () => {
        if (!order || !user) return;
        if (!reason || !description.trim()) {
            show('Completá todos los campos', 'error');
            return;
        }
        const selectedReason = REASONS.find(r => r.label === reason);
        if (!selectedReason) {
            show('Motivo inválido', 'error');
            return;
        }

        try {
            await openDisputeMutation({
                orderId: order.id as any,
                reason: selectedReason.code,
            });

            show('Disputa iniciada', 'success');
            setPhase('chat');
            if (typeof props.onOpenDisputeChat === 'function') props.onOpenDisputeChat();

        } catch (e: any) {
            show(e.message || 'Error al iniciar disputa', 'error');
        }
    };

    const handleSendMessage = async () => {
        if (!order || !user || !chatInput.trim()) return;
        const body = chatInput.trim();
        setChatInput('');
        try {
            await addDisputeMessageMutation({
                orderId: order.id as any,
                sender: role === 'buyer' ? 'buyer' : 'seller',
                body,
            });
        } catch (e: any) {
            show(e.message || 'Error al enviar mensaje', 'error');
            setChatInput(body);
        }
    };

    const progressSteps = [
        { label: terms.progress[0], icon: Banknote },
        { label: terms.progress[1], icon: Lock },
        { label: terms.progress[2], icon: isService ? CheckCircle2 : Package },
        { label: terms.progress[3], icon: CheckCircle2 },
    ];
    const currentStep = stateMeta?.step ?? 0;

    // === VIEWS ===
    const renderStatusView = () => (
        <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {stateMeta && (
                <LinearGradient colors={isDark ? stateMeta.gradientDark : stateMeta.gradientLight} style={styles.heroCard}>
                    <View style={[styles.heroIconContainer, { borderColor: colors.icon }]}>
                        <StateIcon size={isSmall ? 24 : 28} color={colors.icon} />
                    </View>
                    <View style={styles.heroContent}>
                        <Text style={[styles.heroTitle, { color: isDark ? '#F9FAFB' : '#111827' }]}>
                            {stateMeta.label ?? order?.escrow.state}
                        </Text>
                        <Text style={[styles.heroSubtitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                            #{order?.id.slice(-6).toUpperCase()} • {role === 'buyer' ? 'Compraste' : 'Vendiste'}
                        </Text>
                    </View>
                    <View style={[styles.heroBadge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                        <Text style={[styles.heroBadgeText, { color: colors.text }]}>{stateMeta.shortLabel}</Text>
                    </View>
                </LinearGradient>
            )}

            {!hasActiveDispute && (
                <View style={styles.progressContainer}>
                    <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${Math.min(100, (currentStep / (progressSteps.length - 1)) * 100)}%`, backgroundColor: colors.icon }]} />
                    </View>
                    <View style={styles.progressSteps}>
                        {progressSteps.map((step, index) => {
                            const isActive = index <= currentStep;
                            const isCurrent = index === currentStep;
                            const StepIcon = step.icon;
                            return (
                                <View key={step.label} style={styles.progressStep}>
                                    <View style={[styles.progressDot, isActive && { backgroundColor: colors.icon, borderColor: colors.icon }, isCurrent && styles.progressDotCurrent]}>
                                        <StepIcon size={12} color={isActive ? '#fff' : (isDark ? '#6B7280' : '#9CA3AF')} />
                                    </View>
                                    <Text style={[styles.progressLabel, isActive && { color: isDark ? '#F9FAFB' : '#111827', fontWeight: '600' }]}>{step.label}</Text>
                                </View>
                            );
                        })}
                    </View>
                </View>
            )}

            {order && !hasActiveDispute && (
                <View style={[styles.card, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <View>
                        <Text style={styles.amountLabel}>Total Protegido</Text>
                        <Text style={styles.amountValue}>{formatMoney(order.totals.grandTotal, order.totals.currency)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: fontSize.xs, color: isDark ? '#9CA3AF' : '#6B7280' }}>Liberación</Text>
                        <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' }}>
                            {formatShortDate(order.escrow.releaseScheduledAt) ?? '-'}
                        </Text>
                    </View>
                </View>
            )}

            {/* Actions */}
            {(canConfirmDelivery || canDispute || hasActiveDispute) && (
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Acciones</Text>
                    <View style={styles.actionsContainer}>
                        {canConfirmDelivery && (
                            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handleConfirmDelivery} activeOpacity={0.8}>
                                <CheckCircle2 size={18} color="#fff" />
                                <Text style={styles.actionBtnPrimaryText}>{terms.confirmBtn}</Text>
                            </TouchableOpacity>
                        )}
                        {canDispute && !hasActiveDispute && (
                            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => setPhase('dispute_init')} activeOpacity={0.8}>
                                <AlertTriangle size={18} color="#DC2626" />
                                <Text style={styles.actionBtnDangerText}>Iniciar reclamo</Text>
                            </TouchableOpacity>
                        )}
                        {hasActiveDispute && (
                            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnInfo]} onPress={() => setPhase('chat')} activeOpacity={0.8}>
                                <MessageSquare size={18} color="#2563EB" />
                                <Text style={styles.actionBtnInfoText}>Ver Disputa & Chat</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            {/* Explanation */}
            {order && !hasActiveDispute && (
                <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                    <View style={styles.explanationHeader}>
                        <StateIcon size={18} color={colors.icon} />
                        <Text style={[styles.explanationTitle, { color: colors.text }]}>¿Qué significa?</Text>
                    </View>
                    <Text style={[styles.explanationText, { color: isDark ? '#E5E7EB' : '#374151' }]}>
                        {renderExplanation(order, role, terms)}
                    </Text>
                </View>
            )}
        </ScrollView>
    );

    const renderDisputeForm = () => (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                <View style={[styles.card, { marginTop: 8 }]}>
                    <Text style={styles.sectionTitle}>Motivo del reclamo</Text>
                    {REASONS.filter(r => (r.types as readonly string[]).includes(isService ? 'service' : 'product')).map((r) => {
                        const isActive = reason === r.label;
                        const Icon = r.Icon;
                        return (
                            <TouchableOpacity
                                key={r.code}
                                onPress={() => setReason(r.label)}
                                activeOpacity={0.7}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1,
                                    borderColor: isActive ? '#3B82F6' : (isDark ? '#374151' : '#E5E7EB'),
                                    backgroundColor: isActive ? (isDark ? 'rgba(59, 130, 246, 0.1)' : '#EFF6FF') : 'transparent',
                                    marginBottom: 8,
                                }}
                            >
                                <Icon size={18} color={isActive ? '#3B82F6' : (isDark ? '#9CA3AF' : '#6B7280')} />
                                <Text style={{ marginLeft: 10, flex: 1, fontSize: fontSize.sm, fontWeight: isActive ? '600' : '400', color: isActive ? '#3B82F6' : (isDark ? '#F9FAFB' : '#111827') }}>
                                    {r.label}
                                </Text>
                                {isActive && <CheckCircle2 size={16} color="#3B82F6" />}
                            </TouchableOpacity>
                        );
                    })}
                </View>
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Descripción</Text>
                    <TextInput
                        multiline
                        placeholder="Explicá el problema..."
                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                        value={description}
                        onChangeText={setDescription}
                        style={{ height: 120, textAlignVertical: 'top', fontSize: fontSize.base, color: isDark ? '#F9FAFB' : '#111827' }}
                    />
                </View>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnDanger, { height: 50, marginTop: 8 }]}
                    onPress={handleSubmitDispute}
                    disabled={!reason || !description.trim()}
                >
                    <Text style={[styles.actionBtnDangerText, { fontSize: fontSize.base }]}>Confirmar reclamo</Text>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );

    const renderChatView = () => (
        <View style={{ flex: 1 }}>
            <View style={[styles.card, { marginTop: 8, padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }]}>
                {/* Header Info */}
                <View style={{ padding: cardPadding, backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2', borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: isDark ? '#FCA5A5' : '#991B1B' }}>Disputa: {order?.dispute?.reason ?? 'En curso'}</Text>
                        <Text style={{ fontSize: fontSize.xs, color: isDark ? '#FCA5A5' : '#991B1B' }}>{order?.status}</Text>
                    </View>
                    <Text style={{ fontSize: fontSize.xs, color: isDark ? '#FCA5A5' : '#991B1B', marginTop: 4 }}>{order?.dispute?.description}</Text>
                </View>
                {/* Messages from Convex */}
                <ScrollView ref={scrollViewRef} style={{ flex: 1 }} contentContainerStyle={{ padding: cardPadding, gap: 12 }}>
                    {liveMessages.length === 0 && (
                        <Text style={{ textAlign: 'center', color: isDark ? '#6B7280' : '#9CA3AF', fontSize: fontSize.sm, marginTop: 24 }}>
                            No hay mensajes aún. Enviá el primero.
                        </Text>
                    )}
                    {liveMessages.map((msg: any) => {
                        const isMe = msg.senderUserId === user?.id;
                        return (
                            <View key={msg._id ?? msg.sentAt} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                                <View style={{ backgroundColor: isMe ? '#3B82F6' : (isDark ? '#374151' : '#F3F4F6'), borderRadius: 16, borderBottomRightRadius: isMe ? 4 : 16, borderBottomLeftRadius: isMe ? 16 : 4, paddingHorizontal: 16, paddingVertical: 10 }}>
                                    <Text style={{ color: isMe ? '#fff' : (isDark ? '#F9FAFB' : '#111827'), fontSize: fontSize.sm }}>{msg.body}</Text>
                                </View>
                                <Text style={{ fontSize: 10, color: isDark ? '#6B7280' : '#9CA3AF', marginTop: 2, alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                                    {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </View>
                        );
                    })}
                </ScrollView>
                {/* Input */}
                <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#E5E7EB', flexDirection: 'row', gap: 8 }}>
                    <TextInput
                        placeholder="Mensaje..."
                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                        value={chatInput}
                        onChangeText={setChatInput}
                        style={{ flex: 1, height: 40, borderRadius: 20, paddingHorizontal: 16, backgroundColor: isDark ? '#1F2937' : '#F3F4F6', color: isDark ? '#F9FAFB' : '#111827' }}
                    />
                    <TouchableOpacity onPress={handleSendMessage} disabled={!chatInput.trim()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: chatInput.trim() ? '#3B82F6' : (isDark ? '#374151' : '#E5E7EB'), alignItems: 'center', justifyContent: 'center' }}>
                        <Send size={18} color={chatInput.trim() ? '#fff' : '#9CA3AF'} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );

    const handleOpenChange = (v: boolean) => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c27a0cc-4b8e-4eac-9cdc-ea3e06e3bd39', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'EscrowSheet.tsx:handleOpenChange', message: 'Sheet onOpenChange', data: { isControlled, nextOpen: v }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'H-ts2322-props' }) }).catch(() => { });
        // #endregion
        if (!v) closeEscrow();
        else if (isControlled) props.onOpenChange?.(true);
    };

    return (
        <Sheet open={isOpen} onOpenChange={handleOpenChange}>
            <SheetContent side="bottom" style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16), maxHeight: height * 0.92, minHeight: height * 0.6 }]}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <View style={[styles.sheetInner, { maxWidth: contentMaxWidth, paddingHorizontal: horizontalPadding }]}>
                        <View style={styles.header}>
                            <View style={styles.headerHandle} />
                            <View style={styles.headerRow}>
                                {(phase === 'dispute_init' || phase === 'chat') && (
                                    <TouchableOpacity onPress={() => setPhase('status')} style={[styles.closeBtn, { marginRight: 12 }]}>
                                        <ChevronLeft size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                    </TouchableOpacity>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.headerTitle}>
                                        {phase === 'status' ? (hasActiveDispute ? 'Disputa Activa' : 'Escrow') : phase === 'chat' ? 'Chat de Disputa' : 'Iniciar Reclamo'}
                                    </Text>
                                    <Text style={styles.headerSubtitle}>
                                        {phase === 'status' ? 'Centro de Resolución' : phase === 'chat' ? 'Conversación con ' + (role === 'buyer' ? 'Vendedor' : 'Comprador') : 'Protección de compra'}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={closeEscrow} style={styles.closeBtn}>
                                    <X size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {!order ? (
                            <View style={styles.emptyState}>
                                <ShieldCheck size={48} color={isDark ? '#374151' : '#E5E7EB'} />
                                <Text style={styles.emptyText}>Cargando...</Text>
                            </View>
                        ) : (
                            phase === 'status' ? renderStatusView() :
                                phase === 'dispute_init' ? renderDisputeForm() :
                                    renderChatView()
                        )}
                    </View>
                </KeyboardAvoidingView>
            </SheetContent>
        </Sheet>
    );
}

function renderExplanation(order: Order, role: string, terms?: any) {
    const state = order.escrow.state;
    if (state === 'held') return terms ? terms.explanation.held(role) : (role === 'buyer' ? 'Tu pago está protegido. Confirmá entrega para liberar.' : 'Pago retenido. Se libera al confirmar entrega.');
    if (state === 'release_scheduled') return 'Liberación programada.';
    if (state === 'released') return 'Fondos liberados.';
    if (state === 'disputed') return 'En disputa. Fondos retenidos.';
    if (state === 'refunded') return 'Reembolsado.';
    return '';
}

const getStyles = (isDark: boolean, fontSize: any, cardPadding: number) => StyleSheet.create({
    sheet: { backgroundColor: isDark ? '#111827' : '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    sheetInner: { width: '100%', alignSelf: 'center', height: '100%' },
    header: { paddingTop: 8, paddingBottom: 16 },
    headerHandle: { width: 40, height: 4, backgroundColor: isDark ? '#374151' : '#D1D5DB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    headerRow: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827' },
    headerSubtitle: { fontSize: fontSize.xs, color: isDark ? '#9CA3AF' : '#6B7280' },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: isDark ? '#374151' : '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
    emptyText: { fontSize: fontSize.base, color: isDark ? '#6B7280' : '#9CA3AF' },
    heroCard: { padding: cardPadding + 4, borderRadius: 24, flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 },
    heroIconContainer: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginRight: 16 },
    heroContent: { flex: 1 },
    heroTitle: { fontSize: fontSize.lg, fontWeight: '800', marginBottom: 4, letterSpacing: -0.5 },
    heroSubtitle: { fontSize: fontSize.xs, fontWeight: '500' },
    heroBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
    heroBadgeText: { fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase' },
    progressContainer: { marginBottom: 28, paddingHorizontal: 8 },
    progressTrack: { height: 6, backgroundColor: isDark ? '#374151' : '#E5E7EB', borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },
    progressSteps: { flexDirection: 'row', justifyContent: 'space-between' },
    progressStep: { alignItems: 'center', width: 64 },
    progressDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: isDark ? '#374151' : '#E5E7EB', alignItems: 'center', justifyContent: 'center', marginBottom: 6, borderWidth: 2, borderColor: 'transparent' },
    progressDotCurrent: { transform: [{ scale: 1.3 }], shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
    progressLabel: { fontSize: fontSize.xs, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', fontWeight: '500' },
    card: { backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 20, padding: cardPadding + 2, marginBottom: 16, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    amountLabel: { fontSize: fontSize.sm, color: isDark ? '#9CA3AF' : '#6B7280', fontWeight: '500', marginBottom: 4 },
    amountValue: { fontSize: 28, fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827', letterSpacing: -1 },
    sectionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 16, letterSpacing: -0.5 },
    actionsContainer: { gap: 12 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 16, gap: 10 },
    actionBtnPrimary: { backgroundColor: '#10B981', shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
    actionBtnPrimaryText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
    actionBtnDanger: { backgroundColor: '#EF4444', shadowColor: '#EF4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
    actionBtnDangerText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
    actionBtnInfo: { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF', borderWidth: 1, borderColor: isDark ? '#1D4ED8' : '#BFDBFE' },
    actionBtnInfoText: { color: isDark ? '#60A5FA' : '#2563EB', fontSize: fontSize.base, fontWeight: '700' },
    explanationHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
    explanationTitle: { fontSize: fontSize.base, fontWeight: '700' },
    explanationText: { fontSize: fontSize.sm, lineHeight: 22, fontWeight: '400' },
});
