import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Check, CheckCheck, Image as ImageIcon, Send, X } from 'lucide-react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { MessageBubble } from '../../components/social/MessageBubble';
import { useClockTick, useTypingIndicator, useTypingSignal } from '../../hooks/useMessaging';
import { uploadLocalImageToConvex } from '../../utils/uploadToConvexStorage';
import { formatLastSeen } from '../../utils/formatters';
import { toUserMessage } from '../../utils/errors';
import { colors, Radius } from '../../theme/tokens';

const PAGE_SIZE = 30;

export default function ChatScreen({ route, navigation }: any) {
    const paramChatId: string | undefined = route?.params?.chatId;
    const paramUserId: string | undefined = route?.params?.userId;

    const { user, sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const insets = useSafeAreaInsets();
    const isDark = colorScheme === 'dark';
    const styles = useMemo(() => getStyles(isDark, insets.bottom), [isDark, insets.bottom]);

    const [chatId, setChatId] = useState<string | undefined>(paramChatId);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [replyTo, setReplyTo] = useState<any | null>(null);
    const [buyingId, setBuyingId] = useState<string | null>(null);
    const [cursor, setCursor] = useState<string | null>(null);
    const [olderPages, setOlderPages] = useState<any[]>([]);
    const listRef = useRef<FlatList>(null);

    const getOrCreateChat = useMutation(api.social.dm.getOrCreateDirectChat);
    const sendMessageMut = useMutation(api.social.dm.sendMessage);
    const markReadMut = useMutation(api.social.dm.markChatRead);
    const reactMut = useMutation(api.social.dm.reactToMessage);
    const deleteMut = useMutation(api.social.dm.deleteMessage);
    const acceptMut = useMutation(api.social.dm.acceptRequest);
    const declineMut = useMutation(api.social.dm.declineRequest);
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);
    const addDmProductToCart = useMutation(api.commerce.addDmProductToCart);

    // Chat abierto desde un perfil / una orden: resolvemos el hilo 1:1.
    useEffect(() => {
        if (chatId || !paramUserId || !sessionToken) return;
        let cancelled = false;
        getOrCreateChat({ participantId: paramUserId, sessionToken })
            .then((id) => {
                if (!cancelled && id) setChatId(id as string);
            })
            .catch((e) => show(toUserMessage(e), 'error'));
        return () => {
            cancelled = true;
        };
    }, [paramUserId, chatId, sessionToken]);

    const header = useQuery(
        api.social.dm.getChat,
        chatId && sessionToken ? { chatId: chatId as any, sessionToken } : 'skip',
    );
    const page = useQuery(
        api.social.dm.getChatMessages,
        chatId && sessionToken
            ? { chatId: chatId as any, sessionToken, limit: PAGE_SIZE }
            : 'skip',
    );

    const typingLabel = useTypingIndicator(chatId);
    const { signalTyping, stopTyping } = useTypingSignal(chatId);
    // Reevalúa "Activo hace X" sin esperar a que cambien los datos.
    useClockTick(30_000, !!header);

    const messages = useMemo(
        () => [...olderPages.flat(), ...(page?.items ?? [])],
        [olderPages, page?.items],
    );

    // Marcar leído al abrir y cada vez que entra un mensaje nuevo.
    useEffect(() => {
        if (!chatId || !sessionToken || !page?.items?.length) return;
        markReadMut({ chatId: chatId as any, sessionToken }).catch(() => {});
    }, [chatId, sessionToken, page?.items?.length]);

    const loadOlder = useCallback(() => {
        const next = cursor ?? page?.nextCursor;
        if (!next || !chatId) return;
        setCursor(next);
    }, [cursor, page?.nextCursor, chatId]);

    const handleSend = async () => {
        const body = text.trim();
        if ((!body && !uploading) || !chatId || !sessionToken || sending) return;

        setText('');
        setSending(true);
        stopTyping();
        try {
            await sendMessageMut({
                chatId: chatId as any,
                sessionToken,
                body,
                replyToId: replyTo?._id,
                // Idempotencia: un reintento por red no duplica el mensaje.
                clientId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            });
            setReplyTo(null);
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
        } catch (e) {
            setText(body);
            show(toUserMessage(e), 'error');
        } finally {
            setSending(false);
        }
    };

    const handleAttachImage = async () => {
        if (!chatId || !sessionToken) return;
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            show('Necesitamos permiso para acceder a tus fotos.', 'error');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
        });
        if (result.canceled || !result.assets?.[0]) return;

        setUploading(true);
        try {
            const stored = await uploadLocalImageToConvex({
                uri: result.assets[0].uri,
                generateUploadUrl,
                sessionToken,
            });
            await sendMessageMut({
                chatId: chatId as any,
                sessionToken,
                body: '',
                attachments: [{ type: 'image', url: stored }],
                clientId: `${Date.now()}-img`,
            });
        } catch (e) {
            show(toUserMessage(e), 'error');
        } finally {
            setUploading(false);
        }
    };

    /** Compra desde el card de producto: va al carrito con la atribución del que lo recomendó. */
    const handleBuyListing = async (messageId: string) => {
        if (!sessionToken || buyingId) return;
        setBuyingId(messageId);
        try {
            await addDmProductToCart({ sessionToken, messageId: messageId as any, quantity: 1 });
            show('Agregado al carrito', 'success');
            navigation.navigate('Cart');
        } catch (e) {
            show(toUserMessage(e), 'error');
        } finally {
            setBuyingId(null);
        }
    };

    const handleReact = (messageId: string, emoji: string) => {
        if (!sessionToken) return;
        reactMut({ messageId: messageId as any, emoji, sessionToken }).catch((e) =>
            show(toUserMessage(e), 'error'),
        );
    };

    const handleDelete = (messageId: string) => {
        if (!sessionToken) return;
        deleteMut({ messageId: messageId as any, sessionToken }).catch((e) =>
            show(toUserMessage(e), 'error'),
        );
    };

    const isRequest = header?.state === 'request';
    const other = header?.participants?.[0];
    const presenceLabel =
        header?.kind === 'group'
            ? `${header.memberCount} integrantes`
            : formatLastSeen(other?.lastSeenAt) ?? '';

    const renderItem = useCallback(
        ({ item }: any) => (
            <MessageBubble
                message={item}
                isDark={isDark}
                showReadReceipt={
                    item.mine &&
                    !!page?.readerLastReadAt &&
                    page.readerLastReadAt >= item.createdAt
                }
                onReact={handleReact}
                onReply={setReplyTo}
                onDelete={handleDelete}
                onOpenListing={(listingId: string) =>
                    navigation.navigate('ItemDetail', { itemId: listingId })
                }
                onBuyListing={handleBuyListing}
                buying={buyingId === item._id}
            />
        ),
        [isDark, page?.readerLastReadAt, navigation, buyingId],
    );

    return (
        <View style={styles.screen}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <ArrowLeft size={24} color={colors(isDark).text} />
                </TouchableOpacity>
                <Avatar size="md">
                    <AvatarImage src={header?.avatar ?? undefined} />
                    <AvatarFallback>{(header?.title ?? '?').charAt(0)}</AvatarFallback>
                </Avatar>
                <View style={styles.headerInfo}>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {header?.title ?? 'Conversación'}
                    </Text>
                    {!!(typingLabel || presenceLabel) && (
                        <Text style={styles.headerSubtitle} numberOfLines={1}>
                            {typingLabel ?? presenceLabel}
                        </Text>
                    )}
                </View>
            </View>

            <FlatList
                ref={listRef}
                // `inverted` deja el mensaje más nuevo abajo sin scroll manual
                // y hace que `onEndReached` pida el historial viejo.
                inverted
                data={[...messages].reverse()}
                renderItem={renderItem}
                keyExtractor={(item: any) => item._id}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                onEndReached={loadOlder}
                onEndReachedThreshold={0.3}
                ListEmptyComponent={
                    page === undefined ? (
                        <ActivityIndicator style={{ marginTop: 32 }} color={colors(isDark).primary} />
                    ) : (
                        <View style={styles.empty}>
                            <Text style={styles.emptyTitle}>Todavía no hay mensajes</Text>
                            <Text style={styles.emptyText}>Escribí el primero.</Text>
                        </View>
                    )
                }
            />

            {isRequest ? (
                <View style={styles.requestBar}>
                    <Text style={styles.requestText}>
                        Esta persona quiere enviarte un mensaje. Si aceptás, va a poder verte en línea.
                    </Text>
                    <View style={styles.requestActions}>
                        <TouchableOpacity
                            style={[styles.requestBtn, styles.requestDecline]}
                            onPress={() =>
                                declineMut({ chatId: chatId as any, sessionToken: sessionToken! })
                                    .then(() => navigation.goBack())
                                    .catch((e) => show(toUserMessage(e), 'error'))
                            }
                        >
                            <Text style={styles.requestDeclineText}>Eliminar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.requestBtn, styles.requestAccept]}
                            onPress={() =>
                                acceptMut({ chatId: chatId as any, sessionToken: sessionToken! }).catch(
                                    (e) => show(toUserMessage(e), 'error'),
                                )
                            }
                        >
                            <Text style={styles.requestAcceptText}>Aceptar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                >
                    {replyTo && (
                        <View style={styles.replyPreview}>
                            <View style={styles.replyBar} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.replyLabel}>Respondiendo</Text>
                                <Text style={styles.replyBody} numberOfLines={1}>
                                    {replyTo.body || 'Adjunto'}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => setReplyTo(null)}>
                                <X size={18} color={colors(isDark).textMuted} />
                            </TouchableOpacity>
                        </View>
                    )}
                    <View style={styles.composer}>
                        <TouchableOpacity
                            style={styles.iconBtn}
                            onPress={handleAttachImage}
                            disabled={uploading}
                        >
                            {uploading ? (
                                <ActivityIndicator size="small" color={colors(isDark).primary} />
                            ) : (
                                <ImageIcon size={22} color={colors(isDark).textSecondary} />
                            )}
                        </TouchableOpacity>
                        <TextInput
                            style={styles.input}
                            placeholder="Mensaje…"
                            placeholderTextColor={colors(isDark).textMuted}
                            value={text}
                            onChangeText={(t) => {
                                setText(t);
                                signalTyping();
                            }}
                            onBlur={stopTyping}
                            multiline
                            maxLength={4000}
                        />
                        <TouchableOpacity
                            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
                            onPress={handleSend}
                            disabled={!text.trim() || sending}
                        >
                            {sending ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Send size={18} color="#fff" />
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            )}
        </View>
    );
}

const getStyles = (isDark: boolean, bottomInset: number) => {
    const c = colors(isDark);
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.surface1 },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 12,
            paddingTop: 52,
            paddingBottom: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.divider,
            backgroundColor: c.chrome,
        },
        headerInfo: { flex: 1 },
        headerTitle: { fontSize: 16, fontWeight: '700', color: c.text },
        headerSubtitle: { fontSize: 12, color: c.textSecondary, marginTop: 1 },
        iconBtn: { padding: 8, borderRadius: Radius.md },
        listContent: { paddingHorizontal: 12, paddingVertical: 16, gap: 2 },
        empty: { alignItems: 'center', paddingTop: 64, transform: [{ scaleY: -1 }] },
        emptyTitle: { fontSize: 15, fontWeight: '600', color: c.text },
        emptyText: { fontSize: 13, color: c.textMuted, marginTop: 4 },
        replyPreview: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: c.surface2,
        },
        replyBar: { width: 3, height: 32, borderRadius: 2, backgroundColor: c.primary },
        replyLabel: { fontSize: 11, fontWeight: '700', color: c.primary },
        replyBody: { fontSize: 13, color: c.textSecondary },
        composer: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 8,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: Math.max(bottomInset, 12),
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.divider,
            backgroundColor: c.chrome,
        },
        input: {
            flex: 1,
            maxHeight: 120,
            minHeight: 40,
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: 10,
            borderRadius: Radius.xl,
            backgroundColor: c.surface2,
            color: c.text,
            fontSize: 15,
        },
        sendBtn: {
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.primary,
        },
        sendBtnDisabled: { opacity: 0.4 },
        requestBar: {
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(bottomInset, 16),
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.divider,
            backgroundColor: c.chrome,
        },
        requestText: { fontSize: 13, color: c.textSecondary, textAlign: 'center' },
        requestActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
        requestBtn: {
            flex: 1,
            paddingVertical: 12,
            borderRadius: Radius.md,
            alignItems: 'center',
        },
        requestDecline: { backgroundColor: c.surface2 },
        requestDeclineText: { color: c.text, fontWeight: '600' },
        requestAccept: { backgroundColor: c.primary },
        requestAcceptText: { color: '#fff', fontWeight: '700' },
    });
};
