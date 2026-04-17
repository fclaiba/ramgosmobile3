import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { Send, Clock, Gavel, ShieldCheck, Paperclip, MessageSquareText } from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { useMarketplace } from '../../contexts/MarketplaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Sheet, SheetContent } from '../../components/ui/sheet';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EscrowSheet } from '../../components/marketplace/EscrowSheet';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

function Pill({
    label,
    tone,
    isSmall,
}: {
    label: string;
    tone: 'neutral' | 'warning' | 'danger' | 'info' | 'success';
    isSmall: boolean;
}) {
    const base = 'px-2.5 py-1 rounded-full border';
    const size = isSmall ? 'text-[10px]' : 'text-xs';
    const toneClass =
        tone === 'danger'
            ? 'bg-red-50 border-red-200 text-red-700'
            : tone === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : tone === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : tone === 'info'
                        ? 'bg-blue-50 border-blue-200 text-blue-800'
                        : 'bg-slate-50 border-slate-200 text-slate-700';
    return (
        <View className={[base, toneClass].join(' ')}>
            <Text className={[size, 'font-extrabold'].join(' ')}>{label}</Text>
        </View>
    );
}

export default function DisputeChatScreen({ route, navigation }: any) {
    const { orderId } = route.params;
    const { orders, addDisputeMessage, escalateDispute } = useMarketplace();
    const { user } = useAuth();
    const { show } = useToast();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const isSmall = width < 375;

    const [msgText, setMsgText] = useState('');
    const [escalateOpen, setEscalateOpen] = useState(false);
    const [escrowOpen, setEscrowOpen] = useState(false);

    const order = orders.find(o => o.id === orderId);
    const dispute = order?.dispute;
    const liveMessages = useQuery(
        api.disputes.getDisputeMessages,
        orderId && user?.id ? { orderId, actorId: user.id as any, requesterId: user.id } : "skip"
    ) ?? [];
    const hasActiveDispute =
        !!dispute ||
        order?.status === 'disputed' ||
        String(order?.escrow?.state ?? '') === 'frozen' ||
        order?.escrow?.state === 'disputed';

    if (!hasActiveDispute) {
        return (
            <View className={isDark ? 'flex-1 bg-slate-950' : 'flex-1 bg-slate-50'}>
                <MobileHeader title="Mediación" showBack onBack={() => navigation.goBack()} />
                <View className="flex-1 items-center justify-center px-4">
                    <Text className={['font-extrabold', isSmall ? 'text-sm' : 'text-base', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
                        No hay una disputa activa
                    </Text>
                    <Text className={['mt-2 text-center', isSmall ? 'text-xs' : 'text-sm', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
                        Este chat se habilita cuando el reclamo fue iniciado correctamente.
                    </Text>
                    <TouchableOpacity
                        className="mt-4 rounded-2xl bg-violet-600 px-4 py-3"
                        onPress={() => navigation.goBack()}
                        activeOpacity={0.85}
                    >
                        <Text className={['text-white font-extrabold', isSmall ? 'text-sm' : 'text-base'].join(' ')}>
                            Volver
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const myRole = user?.id === order?.sellerId ? 'seller' : 'buyer';
    const hoursLeft = 72; // Mock

    const headerTone = useMemo(() => {
        if (order?.escrow?.state === 'disputed') return 'danger' as const;
        if (order?.escrow?.state === 'held') return 'warning' as const;
        if (order?.escrow?.state === 'release_scheduled') return 'info' as const;
        if (order?.escrow?.state === 'released') return 'success' as const;
        if (order?.escrow?.state === 'refunded') return 'neutral' as const;
        return 'neutral' as const;
    }, [order?.escrow?.state]);

    const headerSubtitle = useMemo(() => {
        const escrow = order?.escrow?.state ?? '-';
        const total = order?.totals?.grandTotal != null ? `$${Number(order.totals.grandTotal).toFixed(2)}` : '';
        return `${myRole === 'buyer' ? 'Comprador' : 'Vendedor'} • Escrow: ${escrow}${total ? ` • ${total}` : ''}`;
    }, [myRole, order?.escrow?.state, order?.totals?.grandTotal]);

    const handleSend = () => {
        if (!msgText.trim()) return;
        addDisputeMessage(orderId, {
            sender: myRole,
            body: msgText,
        });
        setMsgText('');
    };

    const disputeStatus = dispute?.status ?? 'open';
    const disputeReason = dispute?.reason ?? 'no_provided';
    const disputeDescription = dispute?.description ?? 'Caso abierto desde la orden.';
    const canEscalate = disputeStatus === 'awaiting_seller_response' || disputeStatus === 'awaiting_buyer_response' || disputeStatus === 'open';

    const renderMessage = ({ item }: any) => {
        const isMe = item.sender === myRole;
        return (
            <View className={['mb-3 max-w-[85%]', isMe ? 'self-end items-end' : 'self-start'].join(' ')}>
                <View
                    className={[
                        'rounded-2xl px-4 py-3',
                        isMe ? 'bg-violet-600' : (isDark ? 'bg-slate-800' : 'bg-white'),
                        isMe ? 'rounded-br-md' : 'rounded-bl-md',
                        isMe ? '' : (isDark ? 'border border-slate-700' : 'border border-slate-200'),
                    ].join(' ')}
                >
                    <Text className={[isSmall ? 'text-sm' : 'text-base', isMe ? 'text-white' : (isDark ? 'text-slate-50' : 'text-slate-900')].join(' ')}>
                        {item.body}
                    </Text>
                </View>
                <Text className={['mt-1 text-[10px]', isDark ? 'text-slate-400' : 'text-slate-400'].join(' ')}>
                    {new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
        );
    };

    const listBottomPad = Math.max(insets.bottom, 12) + 88; // composer height buffer

    return (
        <View className={isDark ? 'flex-1 bg-slate-950' : 'flex-1 bg-slate-50'}>
            <MobileHeader title="Mediación" showBack onBack={() => navigation.goBack()} />

            {/* Summary Header (responsive, no overlap) */}
            <View className={(isSmall ? 'px-3' : 'px-4') + ' pt-3'}>
                <View
                    className={[
                        'rounded-2xl border p-4',
                        isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200',
                    ].join(' ')}
                >
                    <View className="flex-row items-start justify-between">
                        <View style={{ flex: 1 }}>
                            <Text className={['font-extrabold', isSmall ? 'text-sm' : 'text-base', isDark ? 'text-slate-50' : 'text-slate-900'].join(' ')}>
                                Caso #{orderId.slice(-6).toUpperCase()}
                            </Text>
                            <Text className={['mt-1', isSmall ? 'text-[11px]' : 'text-xs', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
                                {headerSubtitle}
                            </Text>
                        </View>
                        <View className="ml-3 items-end">
                            <Pill label={disputeStatus} tone={headerTone} isSmall={isSmall} />
                            <Text className={['mt-2', isSmall ? 'text-[10px]' : 'text-[11px]', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                                {myRole === 'buyer' ? 'Tu mediación' : 'Mediación con comprador'}
                            </Text>
                        </View>
                    </View>

                    <View className="mt-3 flex-row items-center justify-between">
                        <View className="flex-row items-center">
                            <Clock size={14} color={isDark ? '#FCD34D' : '#B45309'} />
                            <Text className={['ml-2 font-semibold', isSmall ? 'text-xs' : 'text-sm', isDark ? 'text-amber-100' : 'text-amber-800'].join(' ')}>
                                Respuesta esperada en {hoursLeft}h
                            </Text>
                        </View>
                        <View className="flex-row items-center">
                            <TouchableOpacity
                                className={['mr-2 rounded-xl px-3 py-2 border', isDark ? 'bg-violet-950/30 border-violet-900/60' : 'bg-violet-50 border-violet-200'].join(' ')}
                                onPress={() => setEscrowOpen(true)}
                                activeOpacity={0.85}
                            >
                                <View className="flex-row items-center">
                                    <ShieldCheck size={14} color="#7C3AED" />
                                    <Text className={['ml-2 font-bold text-violet-600', isSmall ? 'text-xs' : 'text-sm'].join(' ')}>
                                        Ver escrow
                                    </Text>
                                </View>
                            </TouchableOpacity>
                            {canEscalate && (
                                <TouchableOpacity
                                    className="rounded-xl bg-red-500 px-3 py-2"
                                    onPress={() => setEscalateOpen(true)}
                                    activeOpacity={0.85}
                                >
                                    <View className="flex-row items-center">
                                        <Gavel size={14} color="#fff" />
                                        <Text className={['ml-2 font-extrabold text-white', isSmall ? 'text-xs' : 'text-sm'].join(' ')}>
                                            Arbitraje
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    <View className="mt-3 flex-row items-start">
                        <MessageSquareText size={16} color={isDark ? '#CBD5E1' : '#475569'} />
                            <Text className={['ml-2', isSmall ? 'text-xs' : 'text-sm', isDark ? 'text-slate-200' : 'text-slate-700'].join(' ')}>
                            <Text className="font-extrabold">Motivo:</Text> {disputeReason} {'\n'}
                            <Text className="font-extrabold">Detalle:</Text> {disputeDescription}
                        </Text>
                    </View>
                </View>
            </View>

            <FlatList
                data={liveMessages}
                renderItem={renderMessage}
                keyExtractor={item => item._id}
                contentContainerStyle={{
                    paddingHorizontal: isSmall ? 12 : 16,
                    paddingTop: 12,
                    paddingBottom: listBottomPad,
                }}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                    <View className="items-center mt-10">
                        <MessageSquareText size={24} color={isDark ? '#334155' : '#CBD5E1'} />
                        <Text className={['mt-3 font-extrabold', isSmall ? 'text-sm' : 'text-base', isDark ? 'text-slate-200' : 'text-slate-700'].join(' ')}>
                            No hay mensajes todavía
                        </Text>
                        <Text className={['mt-1 text-center', isSmall ? 'text-xs' : 'text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                            Escribí un mensaje para iniciar la mediación.
                        </Text>
                    </View>
                }
            />

            {/* Composer (fixed spacing, safe-area aware) */}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={110}>
                <View
                    className={[
                        'border-t',
                        isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white',
                    ].join(' ')}
                    style={{ paddingBottom: Math.max(insets.bottom, 10), paddingHorizontal: isSmall ? 12 : 16, paddingTop: 10 }}
                >
                    <View className="flex-row items-end">
                        <TouchableOpacity
                            className={['mr-2 h-12 w-12 items-center justify-center rounded-full border', isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'].join(' ')}
                            onPress={() => show('Adjuntar evidencia (mock)', 'info')}
                            activeOpacity={0.85}
                        >
                            <Paperclip size={18} color={isDark ? '#CBD5E1' : '#475569'} />
                        </TouchableOpacity>
                        <TextInput
                            className={[
                                'flex-1 rounded-3xl border px-4 py-3',
                                isDark ? 'bg-slate-950 border-slate-800 text-slate-50' : 'bg-white border-slate-200 text-slate-900',
                            ].join(' ')}
                            placeholder="Escribe un mensaje..."
                            placeholderTextColor={isDark ? '#94A3B8' : '#94A3B8'}
                            value={msgText}
                            onChangeText={setMsgText}
                            multiline
                        />
                        <TouchableOpacity
                            className={['ml-2 h-12 w-12 items-center justify-center rounded-full', msgText.trim() ? 'bg-violet-600' : 'bg-violet-300'].join(' ')}
                            onPress={handleSend}
                            activeOpacity={0.85}
                            disabled={!msgText.trim()}
                        >
                            <Send size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>

            <EscrowSheet
                open={escrowOpen}
                onOpenChange={setEscrowOpen}
                order={order}
                role={myRole}
                onOpenDisputeChat={() => {}}
                onOpenDispute={() => {}}
            />

            <Sheet open={escalateOpen} onOpenChange={setEscalateOpen}>
                <SheetContent
                    side="bottom"
                    style={{
                        borderTopLeftRadius: 24,
                        borderTopRightRadius: 24,
                        paddingBottom: Math.max(insets.bottom, 16),
                        backgroundColor: isDark ? '#111827' : '#fff',
                    }}
                >
                    <View className={(isSmall ? 'px-4' : 'px-5') + ' pt-4'}>
                        <Text className={[isSmall ? 'text-base' : 'text-lg', 'font-extrabold', isDark ? 'text-slate-50' : 'text-slate-900'].join(' ')}>
                            Escalar a arbitraje
                        </Text>
                        <Text className={['mt-2', isSmall ? 'text-xs' : 'text-sm', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
                            Si no logran un acuerdo, soporte revisará el caso. Los fondos quedan retenidos hasta la resolución.
                        </Text>

                        <View className="mt-5 flex-row">
                            <TouchableOpacity
                                className={['flex-1 rounded-2xl py-4 items-center border', isDark ? 'border-slate-700' : 'border-slate-200'].join(' ')}
                                onPress={() => setEscalateOpen(false)}
                                activeOpacity={0.85}
                            >
                                <Text className={[isSmall ? 'text-sm' : 'text-base', 'font-extrabold', isDark ? 'text-slate-200' : 'text-slate-700'].join(' ')}>
                                    Cancelar
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className="ml-3 flex-1 rounded-2xl bg-red-500 py-4 items-center"
                                onPress={() => {
                                    const res = escalateDispute(orderId, myRole);
                                    show(res.success ? 'Caso escalado a soporte' : (res.error ?? 'No se pudo escalar'), res.success ? 'info' : 'error');
                                    setEscalateOpen(false);
                                }}
                                activeOpacity={0.85}
                            >
                                <Text className={[isSmall ? 'text-sm' : 'text-base', 'font-extrabold text-white'].join(' ')}>
                                    Confirmar arbitraje
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </SheetContent>
            </Sheet>
        </View>
    );
}
