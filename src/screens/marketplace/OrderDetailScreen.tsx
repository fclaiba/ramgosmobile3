import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    StatusBar,
    useWindowDimensions,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import {
    Package,
    MapPin,
    Truck,
    CheckCircle,
    Clock,
    ShieldCheck,
    Coins,
    Sparkles,
    TrendingUp,
    MessageCircle,
    Star,
    ChevronLeft,
    MoreVertical,
    AlertCircle,
    CreditCard,
    RotateCcw,
    Box,
} from 'lucide-react-native';
import { Button } from '../../components/ui/button';
import { ImageWithFallback } from '../../components/figma/ImageWithFallback';
import { DirectMessages } from '../../components/social/DirectMessages';
import { AddReviewModal } from '../../components/AddReviewModal';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useEscrow } from '../../contexts/EscrowContext';
import { usePoints } from '../../contexts/PointsContext';
import { useSocial } from '../../contexts/SocialContext';
import Animated, { useSharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { glassShadow, Radius, colors } from '../../theme/tokens';


const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const STATUS_META: Record<string, { label: string; color: string; bg: string; text: string; icon: any }> = {
    payment_received: { label: 'Pago recibido', color: '#3B82F6', bg: '#DBEAFE', text: '#1E40AF', icon: CreditCard },
    in_transit: { label: 'En tránsito', color: '#F59E0B', bg: '#FEF3C7', text: '#92400E', icon: Truck },
    delivered: { label: 'Entregado', color: '#10B981', bg: '#D1FAE5', text: '#065F46', icon: Box },
    completed: { label: 'Completada', color: '#10B981', bg: '#D1FAE5', text: '#065F46', icon: CheckCircle },
    cancelled: { label: 'Cancelada', color: '#EF4444', bg: '#FEE2E2', text: '#991B1B', icon: AlertCircle },
    refunded: { label: 'Reembolsada', color: '#6B7280', bg: '#F3F4F6', text: '#374151', icon: RotateCcw },
    disputed: { label: 'En disputa', color: '#DC2626', bg: '#FEE2E2', text: '#991B1B', icon: AlertCircle },
    paid_escrow: { label: 'En escrow', color: '#2196F3', bg: '#EDE9FE', text: '#5B21B6', icon: ShieldCheck },
};

const TIMELINE_STEPS = [
    { status: 'payment_received', label: 'Pago confirmado', icon: CreditCard },
    { status: 'in_transit', label: 'En camino', icon: Truck },
    { status: 'delivered', label: 'Entregado', icon: Box },
    { status: 'completed', label: 'Completada', icon: CheckCircle },
];

function formatDate(d?: string | number | Date): string {
    if (!d) return '—';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(n?: number): string {
    if (n === undefined || n === null || Number.isNaN(n)) return '$0.00';
    return `$${Number(n).toFixed(2)}`;
}

function normalizeOrder(raw: any): any {
    if (!raw) return null;
    return {
        ...raw,
        id: raw.id || raw._id,
        date: raw.date || raw.createdAt,
        totalAmount: raw.totalAmount ?? raw.total ?? 0,
        items: (raw.items || []).map((it: any, idx: number) => ({
            ...it,
            id: it.id || it.listingId || `item-${idx}`,
            name: it.name || it.title || 'Ítem',
            price: it.price ?? 0,
            quantity: it.quantity ?? 1,
            listingId: it.listingId || it.id,
        })),
        shipping: raw.shipping || {},
        escrow: raw.escrow || (raw.escrowState ? { state: raw.escrowState } : null),
        status: raw.status || 'payment_received',
        totals: raw.totals || {
            subtotal: raw.totalAmount ?? raw.total ?? 0,
            shipping: 0,
            tax: 0,
            discount: 0,
            grandTotal: raw.totalAmount ?? raw.total ?? 0,
        },
    };
}

export default function OrderDetailScreen() {
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const { order: passedOrder, role: passedRole, orderId: passedOrderId } = route.params || {};

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const styles = getStyles(isDark, insets, width);

    const { user, sessionToken } = useAuth();
    const { show } = useToast();
    const { openEscrow } = useEscrow();
    const { currentTier } = usePoints();
    const { createChat } = useSocial();

    const [dmOpen, setDmOpen] = useState(false);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const effectiveOrderId = passedOrderId || passedOrder?.id || passedOrder?._id;
    const fetchedOrder = useQuery(
        api.orders.getOrderById,
        effectiveOrderId && !passedOrder ? { orderId: effectiveOrderId as any } : 'skip'
    );

    const order = useMemo(() => {
        const source = passedOrder || fetchedOrder;
        return normalizeOrder(source);
    }, [passedOrder, fetchedOrder]);

    const role = (passedRole || (order && user && order.userId === user.id ? 'buyer' : 'seller')) as 'buyer' | 'seller';

    const listings = useQuery(api.listings.getFeed) || [];
    const listingMap = useMemo(() => {
        const map: Record<string, any> = {};
        (listings as any[]).forEach((l: any) => { map[l._id || l.id] = l; });
        return map;
    }, [listings]);

    const confirmReceiptMutation = useMutation(api.orders.confirmReceipt);

    const targetUserId = role === 'buyer' ? order?.sellerId : order?.userId;

    const statusMeta = STATUS_META[order?.status] || STATUS_META.payment_received;
    const StatusIcon = statusMeta.icon;

    const canConfirm = useMemo(() => {
        if (role !== 'buyer') return false;
        if (!order?.escrow) return false;
        if (order?.deliveryConfirmedAt) return false;
        return order.escrow.state === 'held' || order.status === 'delivered' || order.status === 'paid_escrow';
    }, [order, role]);

    const canReview = useMemo(() => {
        if (role !== 'buyer') return false;
        return order?.status === 'delivered' || order?.status === 'completed' || order?.escrow?.state === 'released';
    }, [order, role]);

    const canDispute = useMemo(() => {
        if (role !== 'buyer') return false;
        return order?.status !== 'cancelled' && order?.status !== 'refunded' && order?.status !== 'disputed' && order?.status !== 'completed';
    }, [order, role]);

    const pointsInfo = useMemo(() => {
        if (!order || role !== 'buyer') return null;
        const totalPaid = order.totals?.grandTotal ?? order.totalAmount ?? 0;
        const basePoints = Math.floor(Math.max(0, totalPaid));
        const bonusMultiplier = order.pointsBonusMultiplier ?? currentTier?.bonusMultiplier ?? 0;
        const bonusPoints = Math.floor(basePoints * bonusMultiplier);
        const totalPoints = order.pointsEarned ?? (basePoints + bonusPoints);
        return {
            basePoints,
            bonusPoints,
            totalPoints,
            valueUSD: (totalPoints * 0.01).toFixed(2),
            tierLabel: order.tierAtPurchase ?? currentTier?.label ?? 'Bronze',
            hasBonusMultiplier: bonusMultiplier > 0,
        };
    }, [order, currentTier, role]);

    if (!order) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Cargando orden...</Text>
            </View>
        );
    }

    const handleConfirm = async () => {
        if (!canConfirm || !user?.id || !order.id) return;
        setConfirming(true);
        try {
            await confirmReceiptMutation({ orderId: order.id as any, sessionToken, userId: user.id });
            show('Entrega confirmada. El pago se liberará al vendedor.', 'success');
        } catch (err: any) {
            show(err.message || 'No pudimos confirmar la entrega', 'error');
        } finally {
            setConfirming(false);
        }
    };

    const handleContact = async () => {
        if (!targetUserId) return;
        try {
            await createChat(targetUserId);
            setDmOpen(true);
        } catch (e) {
            show('No se pudo abrir el chat', 'error');
        }
    };

    const handleDispute = () => {
        const disputed =
            order?.escrowState === 'disputed' ||
            order?.status === 'disputed' ||
            order?.escrow?.state === 'disputed';
        openEscrow(order.id, role, { phase: disputed ? 'status' : 'dispute_init' });
    };

    const handleOpenEscrow = () => {
        openEscrow(order.id, role, { phase: 'status' });
    };

    const getItemImage = (listingId?: string) => {
        const listing = listingId ? listingMap[listingId] : undefined;
        return listing?.image || listing?.images?.[0]?.url || listing?.gallery?.[0];
    };

    const getTimelineIndex = () => {
        const idx = TIMELINE_STEPS.findIndex((s) => s.status === order.status);
        if (idx >= 0) return idx;
        if (order.status === 'completed') return 3;
        if (order.status === 'delivered') return 2;
        if (order.status === 'in_transit') return 1;
        return 0;
    };
    const currentStepIndex = getTimelineIndex();

    const scrollY = useSharedValue(0);
    const headerOpacity = useAnimatedStyle(() => ({
        opacity: interpolate(scrollY.value, [80, 140], [0, 1], Extrapolation.CLAMP),
    }));

    return (
        <View style={styles.container}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
                    <ChevronLeft size={24} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
                <View style={styles.headerTitles}>
                    <Text style={styles.headerTitle}>Detalle de orden</Text>
                    <Text style={styles.headerSubtitle}>#{String(order.id).slice(-6).toUpperCase()}</Text>
                </View>
                <TouchableOpacity style={styles.iconBtn} onPress={() => {}}>
                    <MoreVertical size={20} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
            </View>

            {/* Sticky header */}
            <Animated.View style={[styles.stickyHeader, headerOpacity]} pointerEvents="none">
                <AnimatedBlurView tint={isDark ? 'dark' : 'light'} intensity={90} style={StyleSheet.absoluteFill} pointerEvents="none" />
                <View style={[styles.stickyHeaderContent, { paddingTop: insets.top }]}>
                    <Text style={styles.stickyTitle} numberOfLines={1}>Orden #{String(order.id).slice(-6).toUpperCase()}</Text>
                </View>
            </Animated.View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                onScroll={(e) => { scrollY.value = e.nativeEvent.contentOffset.y; }}
                scrollEventThrottle={16}
            >
                {/* Hero status */}
                <View style={[styles.heroCard, { backgroundColor: isDark ? `${statusMeta.color}15` : statusMeta.bg, borderColor: `${statusMeta.color}40` }]}>
                    <View style={[styles.heroIconWrap, { borderColor: statusMeta.color }]}>
                        <StatusIcon size={32} color={statusMeta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.heroStatus, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                        <Text style={styles.heroDate}>{formatDate(order.date)}</Text>
                    </View>
                    <View style={[styles.heroBadge, { backgroundColor: isDark ? `${statusMeta.color}25` : statusMeta.bg, borderColor: statusMeta.color }]}>
                        <Text style={[styles.heroBadgeText, { color: statusMeta.color }]}>{role === 'buyer' ? 'COMPRA' : 'VENTA'}</Text>
                    </View>
                </View>

                {/* Timeline */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Seguimiento</Text>
                    <View style={styles.timeline}>
                        {TIMELINE_STEPS.map((step, index) => {
                            const StepIcon = step.icon;
                            const isActive = index <= currentStepIndex;
                            const isCurrent = index === currentStepIndex;
                            return (
                                <React.Fragment key={step.status}>
                                    <View style={styles.timelineItem}>
                                        <View style={[styles.timelineDot, isActive && { backgroundColor: statusMeta.color, borderColor: statusMeta.color }, isCurrent && styles.timelineDotCurrent]}>
                                            <StepIcon size={16} color={isActive ? '#fff' : isDark ? '#6B7280' : '#9CA3AF'} />
                                        </View>
                                        <Text style={[styles.timelineLabel, isActive && { color: statusMeta.color }]}>{step.label}</Text>
                                    </View>
                                    {index < TIMELINE_STEPS.length - 1 && (
                                        <View style={[styles.timelineLine, index < currentStepIndex && { backgroundColor: statusMeta.color }]} />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </View>
                </View>

                {/* Items */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Productos</Text>
                    {order.items.map((item: any, idx: number) => {
                        const imageUrl = getItemImage(item.listingId);
                        return (
                            <View key={item.id || idx} style={styles.itemRow}>
                                <View style={styles.itemImageWrap}>
                                    {imageUrl ? (
                                        <ImageWithFallback src={imageUrl} style={styles.itemImage} />
                                    ) : (
                                        <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                                            <Package size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
                                        </View>
                                    )}
                                </View>
                                <View style={styles.itemBody}>
                                    <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                                    <Text style={styles.itemDetail}>{formatCurrency(item.price)} x {item.quantity}</Text>
                                </View>
                                <Text style={styles.itemTotal}>{formatCurrency(item.price * item.quantity)}</Text>
                            </View>
                        );
                    })}
                </View>

                {/* Shipping */}
                {order.shipping?.address && (
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Envío</Text>
                        <View style={styles.shippingRow}>
                            <View style={styles.shippingIconWrap}>
                                <MapPin size={20} color="#3B82F6" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.shippingTitle}>{order.shipping.method || 'Estándar'}</Text>
                                <Text style={styles.shippingText}>
                                    {order.shipping.address.fullName}{'\n'}
                                    {order.shipping.address.addressLine1}{'\n'}
                                    {order.shipping.address.city}, {order.shipping.address.postalCode}{'\n'}
                                    {order.shipping.address.country}
                                </Text>
                                {order.shipping.trackingNumber && (
                                    <Text style={styles.trackingText}>Tracking: {order.shipping.trackingNumber}</Text>
                                )}
                            </View>
                        </View>
                    </View>
                )}

                {/* Financial Summary */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Resumen</Text>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Subtotal</Text>
                        <Text style={styles.summaryValue}>{formatCurrency(order.totals?.subtotal ?? order.totalAmount)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Envío</Text>
                        <Text style={styles.summaryValue}>{formatCurrency(order.totals?.shipping ?? 0)}</Text>
                    </View>
                    {(order.totals?.tax ?? 0) > 0 && (
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Impuestos</Text>
                            <Text style={styles.summaryValue}>{formatCurrency(order.totals.tax)}</Text>
                        </View>
                    )}
                    {(order.totals?.discount ?? 0) > 0 && (
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Descuento</Text>
                            <Text style={[styles.summaryValue, { color: '#EF4444' }]}>-{formatCurrency(order.totals.discount)}</Text>
                        </View>
                    )}
                    <View style={styles.summaryTotalRow}>
                        <Text style={styles.summaryTotalLabel}>Total</Text>
                        <Text style={styles.summaryTotalValue}>{formatCurrency(order.totals?.grandTotal ?? order.totalAmount)}</Text>
                    </View>
                </View>

                {/* Points */}
                {role === 'buyer' && pointsInfo && pointsInfo.totalPoints > 0 && (
                    <View style={[styles.card, styles.pointsCard]}>
                        <View style={styles.pointsHeader}>
                            <View style={styles.pointsIconWrap}>
                                <Coins size={22} color="#F59E0B" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.pointsTitle}>Puntos ganados</Text>
                                <Text style={styles.pointsSubtitle}>Por esta compra</Text>
                            </View>
                            <View style={styles.pointsBadge}>
                                <Sparkles size={14} color="#F59E0B" />
                                <Text style={styles.pointsBadgeText}>+{pointsInfo.totalPoints}</Text>
                            </View>
                        </View>
                        <View style={styles.pointsBreakdown}>
                            <View style={styles.pointsRow}>
                                <Text style={styles.pointsLabel}>Puntos base</Text>
                                <Text style={styles.pointsValue}>+{pointsInfo.basePoints} pts</Text>
                            </View>
                            {pointsInfo.hasBonusMultiplier && pointsInfo.bonusPoints > 0 && (
                                <View style={styles.pointsRow}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <TrendingUp size={12} color="#10B981" />
                                        <Text style={[styles.pointsLabel, { color: '#10B981' }]}>Bonus {pointsInfo.tierLabel}</Text>
                                    </View>
                                    <Text style={[styles.pointsValue, { color: '#10B981' }]}>+{pointsInfo.bonusPoints} pts</Text>
                                </View>
                            )}
                            <View style={[styles.pointsRow, styles.pointsTotalRow]}>
                                <Text style={styles.pointsTotalLabel}>Total</Text>
                                <Text style={styles.pointsTotalValue}>{pointsInfo.totalPoints} pts</Text>
                            </View>
                        </View>
                        <Text style={styles.pointsFooter}>Valor aprox.: ${pointsInfo.valueUSD} · Canjeables en tu próxima compra</Text>
                    </View>
                )}

                {/* Escrow */}
                {order.escrow && (
                    <TouchableOpacity style={styles.escrowCard} onPress={handleOpenEscrow} activeOpacity={0.8}>
                        <View style={styles.escrowIconWrap}>
                            <ShieldCheck size={24} color="#2196F3" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.escrowTitle}>Protección Escrow</Text>
                            <Text style={styles.escrowStatus}>
                                {order.escrow.state === 'held' ? 'Pago retenido hasta confirmar recepción' :
                                 order.escrow.state === 'released' ? 'Pago liberado al vendedor' :
                                 order.escrow.state === 'disputed' ? 'En resolución de disputa' : `Estado: ${order.escrow.state}`}
                            </Text>
                        </View>
                        <Text style={styles.escrowLink}>Ver →</Text>
                    </TouchableOpacity>
                )}

                <View style={{ height: 24 }} />
            </ScrollView>

            {/* Footer actions */}
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                {canConfirm && (
                    <Button
                        onPress={handleConfirm}
                        disabled={confirming}
                        style={[styles.footerBtn, styles.footerBtnPrimary]}
                    >
                        {confirming ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <CheckCircle size={18} color="#fff" />
                                <Text style={styles.footerBtnPrimaryText}>Confirmar que recibí el pedido</Text>
                            </>
                        )}
                    </Button>
                )}
                {canReview && (
                    <Button onPress={() => setReviewOpen(true)} style={[styles.footerBtn, styles.footerBtnSecondary]}>
                        <Star size={18} color="#F59E0B" fill="#F59E0B" />
                        <Text style={styles.footerBtnSecondaryText}>Calificar producto</Text>
                    </Button>
                )}
                {canDispute && (
                    <Button onPress={handleDispute} style={[styles.footerBtn, styles.footerBtnSecondary]}>
                        <AlertCircle size={18} color={isDark ? '#F9FAFB' : '#111827'} />
                        <Text style={styles.footerBtnSecondaryText}>Iniciar disputa</Text>
                    </Button>
                )}
                <Button onPress={handleContact} style={[styles.footerBtn, styles.footerBtnSecondary]}>
                    <MessageCircle size={18} color={isDark ? '#F9FAFB' : '#111827'} />
                    <Text style={styles.footerBtnSecondaryText}>Contactar {role === 'buyer' ? 'vendedor' : 'comprador'}</Text>
                </Button>
            </View>

            {dmOpen && <DirectMessages onClose={() => setDmOpen(false)} initialUserId={targetUserId} />}
            <AddReviewModal
                visible={reviewOpen}
                onClose={() => setReviewOpen(false)}
                listingId={order.items?.[0]?.listingId || order.items?.[0]?.id || ''}
            />
        </View>
    );
}

function getStyles(isDark: boolean, insets: any, width: number) {
    const bg = isDark ? '#09090B' : '#FAFAFA';
    const surface = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)';
    const text = isDark ? '#FAFAFA' : '#111827';
    const muted = isDark ? '#A1A1AA' : '#6B7280';
    const border = isDark ? '#27272A' : '#E5E7EB';
    const primary = '#2196F3';

    return StyleSheet.create({
        container: { flex: 1, backgroundColor: bg },
        loadingContainer: { flex: 1, backgroundColor: bg, justifyContent: 'center', alignItems: 'center', gap: 16 },
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
            borderRadius: Radius.xl,
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

        heroCard: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            padding: 20,
            borderRadius: Radius.xl,
            marginBottom: 16,
            borderWidth: 1,
        },
        heroIconWrap: {
            width: 64,
            height: 64,
            borderRadius: Radius['2xl'],
            borderWidth: 2,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors(isDark).glass,
        },
        heroStatus: { fontSize: 20, fontWeight: '800' },
        heroDate: { fontSize: 13, color: muted, marginTop: 4 },
        heroBadge: {
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: Radius.md,
            borderWidth: 1,
        },
        heroBadgeText: { fontSize: 10, fontWeight: '800' },

        card: {
            backgroundColor: surface,
            borderRadius: Radius.xl,
            padding: 18,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: border,
        },
        sectionTitle: { fontSize: 16, fontWeight: '800', color: text, marginBottom: 16 },

        timeline: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
        timelineItem: { alignItems: 'center', flex: 1 },
        timelineDot: {
            width: 36,
            height: 36,
            borderRadius: Radius.lg,
            borderWidth: 2,
            borderColor: isDark ? '#3F3F46' : '#E5E7EB',
            backgroundColor: colors(isDark).glass,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 8,
        },
        timelineDotCurrent: {
            ...glassShadow(isDark),
        },
        timelineLabel: { fontSize: 10, fontWeight: '700', color: muted, textAlign: 'center' },
        timelineLine: {
            flex: 1,
            height: 3,
            backgroundColor: border,
            marginTop: 16,
            marginHorizontal: 4,
            borderRadius: Radius.sm,
        },

        itemRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
        itemImageWrap: { width: 60, height: 60, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: border },
        itemImage: { width: '100%', height: '100%' },
        itemImagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
        itemBody: { flex: 1 },
        itemName: { fontSize: 15, fontWeight: '700', color: text },
        itemDetail: { fontSize: 13, color: muted, marginTop: 3 },
        itemTotal: { fontSize: 15, fontWeight: '800', color: text },

        shippingRow: { flexDirection: 'row', gap: 14 },
        shippingIconWrap: {
            width: 44,
            height: 44,
            borderRadius: Radius.md,
            backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#DBEAFE',
            justifyContent: 'center',
            alignItems: 'center',
        },
        shippingTitle: { fontSize: 15, fontWeight: '700', color: text },
        shippingText: { fontSize: 13, color: muted, marginTop: 4, lineHeight: 20 },
        trackingText: { fontSize: 12, color: '#3B82F6', fontWeight: '700', marginTop: 6 },

        summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
        summaryLabel: { fontSize: 14, color: muted, fontWeight: '500' },
        summaryValue: { fontSize: 14, color: text, fontWeight: '600' },
        summaryTotalRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 12,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: border,
        },
        summaryTotalLabel: { fontSize: 16, fontWeight: '800', color: text },
        summaryTotalValue: { fontSize: 18, fontWeight: '800', color: '#10B981' },

        pointsCard: { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.08)' : '#FFFBEB', borderColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FDE68A' },
        pointsHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
        pointsIconWrap: {
            width: 44,
            height: 44,
            borderRadius: Radius.md,
            backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
            justifyContent: 'center',
            alignItems: 'center',
        },
        pointsTitle: { fontSize: 15, fontWeight: '800', color: isDark ? '#FCD34D' : '#B45309' },
        pointsSubtitle: { fontSize: 12, color: muted, marginTop: 2 },
        pointsBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: Radius.xl,
        },
        pointsBadgeText: { fontSize: 15, fontWeight: '800', color: isDark ? '#FCD34D' : '#B45309' },
        pointsBreakdown: {
            backgroundColor: isDark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.6)',
            borderRadius: Radius.md,
            padding: 14,
            marginBottom: 12,
        },
        pointsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
        pointsLabel: { fontSize: 13, color: muted },
        pointsValue: { fontSize: 13, fontWeight: '700', color: text },
        pointsTotalRow: { borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', marginTop: 6, paddingTop: 10 },
        pointsTotalLabel: { fontSize: 14, fontWeight: '800', color: isDark ? '#FCD34D' : '#B45309' },
        pointsTotalValue: { fontSize: 16, fontWeight: '800', color: isDark ? '#FCD34D' : '#B45309' },
        pointsFooter: { fontSize: 11, color: muted, textAlign: 'center' },

        escrowCard: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            backgroundColor: isDark ? 'rgba(33, 150, 243, 0.08)' : '#FAFAFA',
            borderRadius: Radius.xl,
            padding: 18,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(33, 150, 243, 0.25)' : '#DDD6FE',
        },
        escrowIconWrap: {
            width: 48,
            height: 48,
            borderRadius: Radius.lg,
            backgroundColor: isDark ? 'rgba(33, 150, 243, 0.15)' : '#EDE9FE',
            justifyContent: 'center',
            alignItems: 'center',
        },
        escrowTitle: { fontSize: 15, fontWeight: '800', color: text },
        escrowStatus: { fontSize: 13, color: muted, marginTop: 3 },
        escrowLink: { fontSize: 14, fontWeight: '800', color: primary },

        footer: {
            backgroundColor: surface,
            borderTopWidth: 1,
            borderTopColor: border,
            paddingHorizontal: 16,
            paddingTop: 12,
            gap: 10,
        },
        footerBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            borderRadius: Radius.md,
            paddingVertical: 14,
        },
        footerBtnPrimary: { backgroundColor: '#10B981' },
        footerBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
        footerBtnSecondary: { backgroundColor: colors(isDark).glass, borderWidth: 1, borderColor: border },
        footerBtnSecondaryText: { color: text, fontWeight: '700', fontSize: 15 },
    });
}
