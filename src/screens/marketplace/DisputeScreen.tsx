import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Platform,
    KeyboardAvoidingView,
    ActivityIndicator,
    StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import {
    AlertTriangle,
    Package,
    HeartCrack,
    HelpCircle,
    Puzzle,
    AlertOctagon,
    CheckCircle2,
    MessageSquare,
    ChevronLeft,
    ShieldCheck,
    ChevronRight,
    XCircle,
} from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { EscrowSheet } from '../../components/marketplace/EscrowSheet';
import Animated, { useSharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const REASONS = [
    { label: 'Producto no recibido', code: 'not_received', Icon: Package, description: 'No llegó el pedido en el plazo acordado' },
    { label: 'Producto dañado', code: 'damaged', Icon: HeartCrack, description: 'Llegó roto, defectuoso o en mal estado' },
    { label: 'No es lo que pedí', code: 'not_as_described', Icon: HelpCircle, description: 'Diferente a las fotos o descripción' },
    { label: 'Faltan piezas', code: 'missing_parts', Icon: Puzzle, description: 'Incompleto o sin accesorios prometidos' },
    { label: 'Producto falso', code: 'counterfeit', Icon: AlertOctagon, description: 'Réplica o imitación no autorizada' },
] as const;

interface DisputeScreenProps {
    navigation: any;
    route: {
        params?: {
            orderId?: string;
            prefillReason?: string;
            prefillDescription?: string;
        };
    };
}

function formatDate(d?: string | number | Date): string {
    if (!d) return '—';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(n?: number): string {
    if (n === undefined || n === null || Number.isNaN(n)) return '$0.00';
    return `$${Number(n).toFixed(2)}`;
}

export default function DisputeScreen({ navigation, route }: DisputeScreenProps) {
    const params = route?.params || {};
    const orderId = params.orderId;

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();
    const styles = getStyles(isDark, insets);
    const { show } = useToast();
    const { user } = useAuth();

    const openDisputeMutation = useMutation(api.orders.openDispute);

    const orderQuery = useQuery(
        api.orders.getOrderById,
        orderId ? { orderId: orderId as any } : 'skip'
    );
    const order = orderQuery as any;

    const [reason, setReason] = useState<string>('');
    const [description, setDescription] = useState<string>('');
    const [escrowOpen, setEscrowOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const scrollY = useSharedValue(0);
    const headerOpacity = useAnimatedStyle(() => ({
        opacity: interpolate(scrollY.value, [60, 120], [0, 1], Extrapolation.CLAMP),
    }));

    useEffect(() => {
        if (params.prefillReason && !reason) {
            const exists = REASONS.find((r) => r.label === params.prefillReason || r.code === params.prefillReason);
            if (exists) setReason(exists.label);
        }
        if (params.prefillDescription && !description) {
            setDescription(params.prefillDescription);
        }
    }, [params.prefillReason, params.prefillDescription]);

    const isAlreadyDisputed = useMemo(() => {
        return order?.dispute || order?.escrowState === 'disputed' || order?.status === 'disputed';
    }, [order]);

    const handleSubmit = async () => {
        if (!orderId) return;
        if (isAlreadyDisputed) {
            navigation.navigate('DisputeChat', { orderId });
            return;
        }
        if (!reason || !description.trim()) {
            show('Por favor, completá todos los campos', 'error');
            return;
        }
        const selectedReason = REASONS.find((r) => r.label === reason);
        if (!selectedReason) {
            show('Motivo inválido', 'error');
            return;
        }
        if (!user) {
            show('Debes iniciar sesión', 'error');
            return;
        }
        setSubmitting(true);
        try {
            await openDisputeMutation({ orderId: orderId as any, reason: selectedReason.code });
            show('Disputa iniciada correctamente', 'success');
            navigation.replace('DisputeChat', { orderId });
        } catch (e: any) {
            console.error(e);
            show(e.message || 'Error al iniciar disputa', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const canSubmit = reason !== '' && description.trim().length >= 10;

    if (!orderId) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
                <EmptyState isDark={isDark} insets={insets} navigation={navigation} message="No se proporcionó un ID de orden." />
            </View>
        );
    }

    if (order === undefined) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
                <View style={styles.loadingWrap}>
                    <ActivityIndicator size="large" color="#7C3AED" />
                    <Text style={styles.loadingText}>Cargando orden...</Text>
                </View>
            </View>
        );
    }

    if (!order) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
                <EmptyState
                    isDark={isDark}
                    insets={insets}
                    navigation={navigation}
                    message={`No pudimos encontrar la información de la orden #${orderId.slice(-6).toUpperCase()}.`}
                />
            </View>
        );
    }

    const releaseDateStr = order.escrow?.releaseScheduledAt
        ? formatDate(order.escrow.releaseScheduledAt)
        : order.escrowState === 'held'
        ? formatDate(new Date(new Date(order.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString())
        : 'A confirmar';

    return (
        <View style={styles.container}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
                    <ChevronLeft size={24} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
                <View style={styles.headerTitles}>
                    <Text style={styles.headerTitle}>Iniciar Reclamo</Text>
                    <Text style={styles.headerSubtitle}>Orden #{String(order._id).slice(-6).toUpperCase()}</Text>
                </View>
                <View style={styles.iconBtn} />
            </View>

            <Animated.View style={[styles.stickyHeader, headerOpacity]}>
                <AnimatedBlurView tint={isDark ? 'dark' : 'light'} intensity={90} style={StyleSheet.absoluteFill} />
                <View style={[styles.stickyHeaderContent, { paddingTop: insets.top }]}>
                    <Text style={styles.stickyTitle}>Iniciar Reclamo</Text>
                </View>
            </Animated.View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    onScroll={(e) => { scrollY.value = e.nativeEvent.contentOffset.y; }}
                    scrollEventThrottle={16}
                >
                    {/* Alert */}
                    <View style={styles.alertCard}>
                        <AlertTriangle size={22} color="#F97316" />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.alertTitle}>Centro de Disputas</Text>
                            <Text style={styles.alertText}>Tu pago está protegido por el Escrow hasta que se resuelva el problema.</Text>
                        </View>
                    </View>

                    {/* Order Summary */}
                    <TouchableOpacity style={styles.orderCard} onPress={() => setEscrowOpen(true)} activeOpacity={0.8}>
                        <View style={styles.orderCardTop}>
                            <View>
                                <Text style={styles.orderLabel}>ORDEN #{String(order._id).slice(-6).toUpperCase()}</Text>
                                <Text style={styles.orderTotal}>{formatCurrency(order.total)}</Text>
                            </View>
                            <View style={[styles.escrowBadge, { backgroundColor: isDark ? 'rgba(124, 58, 237, 0.15)' : '#EDE9FE' }]}>
                                <Text style={[styles.escrowBadgeText, { color: '#7C3AED' }]}>
                                    {(order.escrow?.state || order.escrowState || 'HELD').toUpperCase()}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.orderCardBottom}>
                            <Text style={styles.orderMeta}>Liberación estimada: {releaseDateStr}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={styles.orderLink}>Ver escrow</Text>
                                <ChevronRight size={14} color="#7C3AED" />
                            </View>
                        </View>
                    </TouchableOpacity>

                    {/* Reasons */}
                    {!isAlreadyDisputed && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>¿Cuál es el problema?</Text>
                            {REASONS.map((r) => {
                                const isActive = reason === r.label;
                                const Icon = r.Icon;
                                return (
                                    <TouchableOpacity
                                        key={r.code}
                                        style={[styles.reasonRow, isActive && styles.reasonRowActive]}
                                        onPress={() => setReason(r.label)}
                                        activeOpacity={0.8}
                                    >
                                        <View style={[styles.reasonIconWrap, isActive && { backgroundColor: isDark ? 'rgba(124, 58, 237, 0.2)' : '#EDE9FE' }]}>
                                            <Icon size={20} color={isActive ? '#7C3AED' : isDark ? '#9CA3AF' : '#6B7280'} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.reasonLabel, isActive && { color: '#7C3AED' }]}>{r.label}</Text>
                                            <Text style={styles.reasonDesc}>{r.description}</Text>
                                        </View>
                                        {isActive && <CheckCircle2 size={22} color="#7C3AED" />}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

                    {/* Description */}
                    {!isAlreadyDisputed && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Descripción detallada</Text>
                            <View style={styles.inputWrap}>
                                <TextInput
                                    multiline
                                    placeholder="Explica el problema con detalle..."
                                    placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                    style={styles.input}
                                    textAlignVertical="top"
                                    value={description}
                                    onChangeText={setDescription}
                                />
                            </View>
                            <Text style={[styles.charCount, description.length < 10 && { color: '#EF4444' }]}>
                                {description.length} caracteres (mínimo 10)
                            </Text>
                        </View>
                    )}

                    {isAlreadyDisputed && (
                        <View style={styles.alreadyDisputedCard}>
                            <ShieldCheck size={28} color="#F59E0B" />
                            <Text style={styles.alreadyDisputedTitle}>Ya existe una disputa activa</Text>
                            <Text style={styles.alreadyDisputedText}>Podés seguir la conversación y agregar más información en el chat de disputa.</Text>
                        </View>
                    )}

                    <View style={{ height: 100 }} />
                </ScrollView>

                {/* Footer */}
                <View style={styles.footer}>
                    {isAlreadyDisputed ? (
                        <TouchableOpacity style={[styles.footerBtn, styles.footerBtnPrimary]} onPress={() => navigation.navigate('DisputeChat', { orderId })}>
                            <MessageSquare size={18} color="#fff" />
                            <Text style={styles.footerBtnPrimaryText}>Ir al Chat de Disputa</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[styles.footerBtn, canSubmit ? styles.footerBtnDanger : styles.footerBtnDisabled]}
                            onPress={handleSubmit}
                            disabled={!canSubmit || submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <AlertTriangle size={18} color="#fff" />
                                    <Text style={styles.footerBtnDangerText}>Iniciar Reclamo</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}
                </View>
            </KeyboardAvoidingView>

            <EscrowSheet open={escrowOpen} onOpenChange={setEscrowOpen} order={order as any} role={user?.id === order?.userId ? 'buyer' : 'seller'} />
        </View>
    );
}

function EmptyState({ isDark, insets, navigation, message }: any) {
    const styles = getStyles(isDark, insets);
    return (
        <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
                <XCircle size={40} color={isDark ? '#9CA3AF' : '#6B7280'} />
            </View>
            <Text style={styles.emptyTitle}>Orden no encontrada</Text>
            <Text style={styles.emptyText}>{message}</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.emptyBtnText}>Volver atrás</Text>
            </TouchableOpacity>
        </View>
    );
}

import { StyleSheet } from 'react-native';

function getStyles(isDark: boolean, insets: any) {
    const bg = isDark ? '#09090B' : '#FAFAFA';
    const surface = isDark ? '#18181B' : '#FFFFFF';
    const text = isDark ? '#FAFAFA' : '#111827';
    const muted = isDark ? '#A1A1AA' : '#6B7280';
    const border = isDark ? '#27272A' : '#E5E7EB';
    const primary = '#7C3AED';

    return StyleSheet.create({
        container: { flex: 1, backgroundColor: bg },
        loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
        loadingText: { color: muted, fontSize: 15, fontWeight: '500' },

        header: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
        },
        iconBtn: {
            width: 42,
            height: 42,
            borderRadius: 21,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.9)',
        },
        headerTitles: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
        headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
        headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

        stickyHeader: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            height: insets.top + 56,
            overflow: 'hidden',
        },
        stickyHeaderContent: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 60,
        },
        stickyTitle: { fontSize: 17, fontWeight: '800', color: text },

        scroll: { flex: 1 },
        scrollContent: { paddingTop: insets.top + 70, paddingHorizontal: 16, paddingBottom: 24 },

        alertCard: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 14,
            backgroundColor: isDark ? 'rgba(249, 115, 22, 0.12)' : '#FFF7ED',
            borderRadius: 20,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(249, 115, 22, 0.25)' : '#FED7AA',
        },
        alertTitle: { fontSize: 15, fontWeight: '800', color: isDark ? '#FDBA74' : '#9A3412', marginBottom: 2 },
        alertText: { fontSize: 13, color: isDark ? '#FDBA74' : '#C2410C', lineHeight: 18 },

        orderCard: {
            backgroundColor: surface,
            borderRadius: 20,
            padding: 18,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: border,
        },
        orderCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
        orderLabel: { fontSize: 11, fontWeight: '800', color: muted, letterSpacing: 0.5 },
        orderTotal: { fontSize: 22, fontWeight: '800', color: text, marginTop: 4 },
        escrowBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
        escrowBadgeText: { fontSize: 10, fontWeight: '800' },
        orderCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderTopColor: border },
        orderMeta: { fontSize: 12, color: muted, fontWeight: '500' },
        orderLink: { fontSize: 12, color: primary, fontWeight: '800', marginRight: 2 },

        section: { marginBottom: 20 },
        sectionTitle: { fontSize: 17, fontWeight: '800', color: text, marginBottom: 12 },
        reasonRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            backgroundColor: surface,
            borderRadius: 16,
            padding: 14,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: border,
        },
        reasonRowActive: {
            borderColor: primary,
            backgroundColor: isDark ? 'rgba(124, 58, 237, 0.08)' : '#F5F3FF',
        },
        reasonIconWrap: {
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: isDark ? '#27272A' : '#F3F4F6',
            justifyContent: 'center',
            alignItems: 'center',
        },
        reasonLabel: { fontSize: 15, fontWeight: '700', color: text },
        reasonDesc: { fontSize: 12, color: muted, marginTop: 2 },

        inputWrap: {
            backgroundColor: surface,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: border,
            padding: 16,
        },
        input: {
            minHeight: 140,
            fontSize: 15,
            color: text,
            lineHeight: 22,
        },
        charCount: { fontSize: 12, color: muted, marginTop: 8, textAlign: 'right', fontWeight: '500' },

        alreadyDisputedCard: {
            backgroundColor: isDark ? 'rgba(245, 158, 11, 0.08)' : '#FFFBEB',
            borderRadius: 20,
            padding: 20,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FDE68A',
        },
        alreadyDisputedTitle: { fontSize: 16, fontWeight: '800', color: isDark ? '#FCD34D' : '#B45309', marginTop: 12 },
        alreadyDisputedText: { fontSize: 13, color: muted, textAlign: 'center', marginTop: 6, lineHeight: 20 },

        footer: {
            backgroundColor: surface,
            borderTopWidth: 1,
            borderTopColor: border,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
        },
        footerBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            borderRadius: 16,
            paddingVertical: 16,
        },
        footerBtnPrimary: { backgroundColor: primary },
        footerBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
        footerBtnDanger: { backgroundColor: '#DC2626' },
        footerBtnDangerText: { color: '#fff', fontWeight: '800', fontSize: 16 },
        footerBtnDisabled: { backgroundColor: isDark ? '#27272A' : '#F3F4F6' },

        emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
        emptyIconWrap: {
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: isDark ? '#27272A' : '#F3F4F6',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 8,
        },
        emptyTitle: { fontSize: 20, fontWeight: '800', color: text },
        emptyText: { fontSize: 14, color: muted, textAlign: 'center', lineHeight: 20 },
        emptyBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, backgroundColor: primary },
        emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    });
}
