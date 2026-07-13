import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    FlatList,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import {
    Send,
    Clock,
    Gavel,
    ShieldCheck,
    Paperclip,
    MessageSquareText,
    ChevronLeft,
    MoreVertical,
    AlertTriangle,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent } from '../../components/ui/sheet';
import { EscrowSheet } from '../../components/marketplace/EscrowSheet';
import Animated, { useSharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const STATUS_TONE: Record<string, { label: string; color: string; bg: string }> = {
    disputed: { label: 'En disputa', color: '#DC2626', bg: '#FEE2E2' },
    held: { label: 'Retenido', color: '#F59E0B', bg: '#FEF3C7' },
    release_scheduled: { label: 'Programado', color: '#3B82F6', bg: '#DBEAFE' },
    released: { label: 'Liberado', color: '#10B981', bg: '#D1FAE5' },
    refunded: { label: 'Reembolsado', color: '#6B7280', bg: '#F3F4F6' },
    open: { label: 'Abierta', color: '#F59E0B', bg: '#FEF3C7' },
    escalated: { label: 'Escalada', color: '#7C3AED', bg: '#EDE9FE' },
    resolved: { label: 'Resuelta', color: '#10B981', bg: '#D1FAE5' },
};

function formatCurrency(n?: number): string {
    if (n === undefined || n === null || Number.isNaN(n)) return '$0.00';
    return `$${Number(n).toFixed(2)}`;
}

function formatTime(d?: string | number | Date): string {
    if (!d) return '';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export default function DisputeChatScreen({ route, navigation }: any) {
    const { orderId } = route.params || {};
    const { user, sessionToken } = useAuth();
    const { show } = useToast();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();
    const styles = getStyles(isDark, insets);

    const [msgText, setMsgText] = useState('');
    const [escalateOpen, setEscalateOpen] = useState(false);
    const [escrowOpen, setEscrowOpen] = useState(false);
    const [sending, setSending] = useState(false);
    const [escalating, setEscalating] = useState(false);

    const orderQuery = useQuery(
        api.orders.getOrderById,
        orderId ? { orderId: orderId as any } : 'skip'
    );
    const order = orderQuery as any;

    const liveMessages = useQuery(
        api.disputes.getDisputeMessages,
        orderId && user?.id ? { orderId } : 'skip'
    ) ?? [];

    const addDisputeMessage = useMutation(api.disputes.addDisputeMessage);
    const escalateDisputeMutation = useMutation(api.orders.escalateDispute);

    const listRef = useRef<FlatList>(null);

    const scrollY = useSharedValue(0);
    const headerOpacity = useAnimatedStyle(() => ({
        opacity: interpolate(scrollY.value, [60, 120], [0, 1], Extrapolation.CLAMP),
    }));

    const myRole = user?.id === order?.sellerId ? 'seller' : 'buyer';

    const hasActiveDispute = useMemo(() => {
        return order?.status === 'disputed' || order?.escrowState === 'disputed' || order?.escrow?.state === 'disputed';
    }, [order]);

    const dispute = order?.dispute || {};
    const disputeStatus = dispute.status || 'open';
    const disputeReason = dispute.reason || 'no_especificado';
    const disputeDescription = dispute.description || 'Caso abierto desde la orden.';

    const escrowState = order?.escrow?.state || order?.escrowState || 'held';
    const tone = STATUS_TONE[escrowState] || STATUS_TONE.held;
    const canEscalate = disputeStatus !== 'escalated' && disputeStatus !== 'resolved' && hasActiveDispute;

    const handleSend = async () => {
        const text = msgText.trim();
        if (!text || !user?.id || !orderId) return;
        setSending(true);
        try {
            await addDisputeMessage({
                orderId,
                body: text,
                senderRole: myRole,
            } as any);
            setMsgText('');
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        } catch (e: any) {
            show(e.message || 'Error al enviar mensaje', 'error');
        } finally {
            setSending(false);
        }
    };

    const handleEscalate = async () => {
        if (!user?.id || !orderId) return;
        setEscalating(true);
        try {
            await escalateDisputeMutation({ orderId: orderId as any, role: myRole, sessionToken, userId: user.id });
            show('Caso escalado a soporte', 'success');
            setEscalateOpen(false);
        } catch (e: any) {
            show(e.message || 'No se pudo escalar', 'error');
        } finally {
            setEscalating(false);
        }
    };

    const renderMessage = ({ item }: any) => {
        const isMe = item.senderRole === myRole || item.sender === myRole;
        return (
            <View style={[styles.messageWrap, isMe && styles.messageWrapMe]}>
                <View style={[styles.messageBubble, isMe ? styles.messageBubbleMe : styles.messageBubbleOther]}>
                    <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextOther]}>{item.body}</Text>
                </View>
                <Text style={styles.messageTime}>{formatTime(item.sentAt || item.createdAt)}</Text>
            </View>
        );
    };

    if (order === undefined) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
                <View style={styles.loadingWrap}>
                    <ActivityIndicator size="large" color="#7C3AED" />
                    <Text style={styles.loadingText}>Cargando mediación...</Text>
                </View>
            </View>
        );
    }

    if (!order || !hasActiveDispute) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
                <View style={styles.emptyWrap}>
                    <View style={styles.emptyIconWrap}>
                        <MessageSquareText size={32} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    </View>
                    <Text style={styles.emptyTitle}>No hay una disputa activa</Text>
                    <Text style={styles.emptyText}>Este chat se habilita cuando el reclamo fue iniciado correctamente.</Text>
                    <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.goBack()}>
                        <Text style={styles.emptyBtnText}>Volver</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
                    <ChevronLeft size={24} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
                <View style={styles.headerTitles}>
                    <Text style={styles.headerTitle}>Mediación</Text>
                    <Text style={styles.headerSubtitle}>Orden #{String(orderId).slice(-6).toUpperCase()}</Text>
                </View>
                <TouchableOpacity style={styles.iconBtn} onPress={() => {}}>
                    <MoreVertical size={20} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
            </View>

            <Animated.View style={[styles.stickyHeader, headerOpacity]}>
                <AnimatedBlurView tint={isDark ? 'dark' : 'light'} intensity={90} style={StyleSheet.absoluteFill} />
                <View style={[styles.stickyHeaderContent, { paddingTop: insets.top }]}>
                    <Text style={styles.stickyTitle}>Mediación</Text>
                </View>
            </Animated.View>

            {/* Summary card */}
            <View style={styles.summaryCard}>
                <View style={styles.summaryTop}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.summaryTitle}>Caso #{String(orderId).slice(-6).toUpperCase()}</Text>
                        <Text style={styles.summarySubtitle}>
                            {myRole === 'buyer' ? 'Comprador' : 'Vendedor'} • Escrow: {escrowState} • {formatCurrency(order.total)}
                        </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: isDark ? `${tone.color}25` : tone.bg, borderColor: tone.color }]}>
                        <Text style={[styles.statusBadgeText, { color: tone.color }]}>{(STATUS_TONE[disputeStatus]?.label || tone.label).toUpperCase()}</Text>
                    </View>
                </View>

                <View style={styles.summaryActions}>
                    <View style={styles.timerRow}>
                        <Clock size={14} color="#F59E0B" />
                        <Text style={styles.timerText}>Respuesta esperada en 72h</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity style={styles.summaryBtn} onPress={() => setEscrowOpen(true)}>
                            <ShieldCheck size={14} color="#7C3AED" />
                            <Text style={styles.summaryBtnText}>Ver escrow</Text>
                        </TouchableOpacity>
                        {canEscalate && (
                            <TouchableOpacity style={[styles.summaryBtn, styles.summaryBtnDanger]} onPress={() => setEscalateOpen(true)}>
                                <Gavel size={14} color="#fff" />
                                <Text style={[styles.summaryBtnText, { color: '#fff' }]}>Arbitraje</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                <View style={styles.reasonRow}>
                    <MessageSquareText size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    <Text style={styles.reasonText}>
                        <Text style={styles.reasonLabel}>Motivo:</Text> {disputeReason}{'\n'}
                        <Text style={styles.reasonLabel}>Detalle:</Text> {disputeDescription}
                    </Text>
                </View>
            </View>

            <FlatList
                ref={listRef}
                data={liveMessages as any[]}
                renderItem={renderMessage}
                keyExtractor={(item: any) => item._id}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={(
                    <View style={styles.emptyChatWrap}>
                        <MessageSquareText size={32} color={isDark ? '#3F3F46' : '#E5E7EB'} />
                        <Text style={styles.emptyChatTitle}>No hay mensajes todavía</Text>
                        <Text style={styles.emptyChatText}>Escribí un mensaje para iniciar la mediación.</Text>
                    </View>
                )}
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            />

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
                <View style={styles.composer}>
                    <TouchableOpacity style={styles.attachBtn} onPress={() => show('Adjuntar evidencia (próximamente)', 'info')} activeOpacity={0.8}>
                        <Paperclip size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    </TouchableOpacity>
                    <TextInput
                        style={styles.composerInput}
                        placeholder="Escribe un mensaje..."
                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                        value={msgText}
                        onChangeText={setMsgText}
                        multiline
                        maxLength={1000}
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, !msgText.trim() && styles.sendBtnDisabled]}
                        onPress={handleSend}
                        activeOpacity={0.8}
                        disabled={!msgText.trim() || sending}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Send size={20} color="#fff" />
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

            <EscrowSheet
                open={escrowOpen}
                onOpenChange={setEscrowOpen}
                order={order as any}
                role={myRole as any}
            />

            <Sheet open={escalateOpen} onOpenChange={setEscalateOpen}>
                <SheetContent side="bottom" style={styles.escalateSheet}>
                    <View style={styles.escalateHandle} />
                    <View style={{ padding: 24 }}>
                        <View style={styles.escalateIconWrap}>
                            <Gavel size={28} color="#fff" />
                        </View>
                        <Text style={styles.escalateTitle}>Escalar a arbitraje</Text>
                        <Text style={styles.escalateText}>
                            Si no logran un acuerdo, soporte revisará el caso. Los fondos quedan retenidos hasta la resolución.
                        </Text>
                        <View style={styles.escalateFooter}>
                            <TouchableOpacity style={styles.escalateCancel} onPress={() => setEscalateOpen(false)} activeOpacity={0.8}>
                                <Text style={styles.escalateCancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.escalateConfirm} onPress={handleEscalate} disabled={escalating} activeOpacity={0.8}>
                                {escalating ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={styles.escalateConfirmText}>Confirmar arbitraje</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </SheetContent>
            </Sheet>
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

        summaryCard: {
            backgroundColor: surface,
            borderRadius: 20,
            padding: 16,
            marginHorizontal: 16,
            marginTop: insets.top + 70,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: border,
        },
        summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
        summaryTitle: { fontSize: 16, fontWeight: '800', color: text },
        summarySubtitle: { fontSize: 12, color: muted, marginTop: 3 },
        statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
        statusBadgeText: { fontSize: 10, fontWeight: '800' },

        summaryActions: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 14,
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: border,
        },
        timerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        timerText: { fontSize: 12, color: '#F59E0B', fontWeight: '700' },
        summaryBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: isDark ? 'rgba(124, 58, 237, 0.1)' : '#F5F3FF',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(124, 58, 237, 0.2)' : '#DDD6FE',
        },
        summaryBtnDanger: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
        summaryBtnText: { fontSize: 12, color: primary, fontWeight: '700' },

        reasonRow: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'flex-start' },
        reasonText: { flex: 1, fontSize: 13, color: muted, lineHeight: 20 },
        reasonLabel: { fontWeight: '800', color: text },

        listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) + 80 },
        messageWrap: { marginBottom: 12, alignSelf: 'flex-start', maxWidth: '82%' },
        messageWrapMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
        messageBubble: {
            borderRadius: 18,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderBottomLeftRadius: 4,
        },
        messageBubbleMe: {
            backgroundColor: primary,
            borderBottomLeftRadius: 18,
            borderBottomRightRadius: 4,
        },
        messageBubbleOther: {
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: border,
        },
        messageText: { fontSize: 15, lineHeight: 22 },
        messageTextMe: { color: '#fff' },
        messageTextOther: { color: text },
        messageTime: { fontSize: 10, color: muted, marginTop: 4 },

        emptyChatWrap: { alignItems: 'center', marginTop: 40 },
        emptyChatTitle: { fontSize: 16, fontWeight: '800', color: text, marginTop: 12 },
        emptyChatText: { fontSize: 13, color: muted, marginTop: 4, textAlign: 'center' },

        composer: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 10,
            backgroundColor: surface,
            borderTopWidth: 1,
            borderTopColor: border,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 12),
        },
        attachBtn: {
            width: 44,
            height: 44,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: border,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 2,
        },
        composerInput: {
            flex: 1,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: border,
            backgroundColor: isDark ? '#27272A' : '#F3F4F6',
            color: text,
            paddingHorizontal: 16,
            paddingVertical: 12,
            fontSize: 15,
            maxHeight: 120,
            minHeight: 46,
        },
        sendBtn: {
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: primary,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 2,
        },
        sendBtnDisabled: { backgroundColor: isDark ? '#3F3F46' : '#D1D5DB' },

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

        escalateSheet: {
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            backgroundColor: isDark ? '#18181B' : '#fff',
        },
        escalateHandle: {
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: isDark ? '#3F3F46' : '#D1D5DB',
            alignSelf: 'center',
            marginTop: 12,
        },
        escalateIconWrap: {
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: '#DC2626',
            justifyContent: 'center',
            alignItems: 'center',
            alignSelf: 'center',
            marginBottom: 16,
        },
        escalateTitle: { fontSize: 20, fontWeight: '800', color: text, textAlign: 'center' },
        escalateText: { fontSize: 14, color: muted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
        escalateFooter: { flexDirection: 'row', gap: 12, marginTop: 24 },
        escalateCancel: {
            flex: 1,
            paddingVertical: 14,
            borderRadius: 14,
            backgroundColor: isDark ? '#27272A' : '#F3F4F6',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: border,
        },
        escalateCancelText: { color: text, fontWeight: '800', fontSize: 15 },
        escalateConfirm: {
            flex: 1,
            paddingVertical: 14,
            borderRadius: 14,
            backgroundColor: '#DC2626',
            alignItems: 'center',
        },
        escalateConfirmText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    });
}
