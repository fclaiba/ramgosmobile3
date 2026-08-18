import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Search, X } from 'lucide-react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { useDebouncedSearchTerm } from '../../hooks/useDebounce';
import { toUserMessage } from '../../utils/errors';
import { Radius, colors } from '../../theme/tokens';

interface SharePostModalProps {
    postContent: string;
    /** Id del post: viaja como adjunto tipado y se renderiza como card. */
    postId?: string;
    postPreviewImage?: string;
    visible: boolean;
    onClose: () => void;
}

/**
 * Compartir una publicación por mensaje.
 *
 * El buscador consulta el directorio de personas, no la lista de chats: antes
 * sólo se podía compartir con alguien a quien YA le habías escrito, y encima
 * el placeholder decía "Buscar personas" mientras filtraba conversaciones.
 *
 * La vista previa la arma el servidor a partir del post real (`sharePostInChat`
 * / `shareToUser`), así la tarjeta no puede mostrar un texto o una imagen que
 * la publicación no tiene.
 */
export const SharePostModal = ({
    postContent,
    postId,
    postPreviewImage,
    visible,
    onClose,
}: SharePostModalProps) => {
    const { user: authUser, sessionToken } = useAuth();
    const { show } = useToast();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = useMemo(() => getStyles(isDark), [isDark]);

    const [searchText, setSearchText] = useState('');
    const [sentTo, setSentTo] = useState<string[]>([]);
    const [sending, setSending] = useState<string | null>(null);

    const sharePostInChat = useMutation(api.social.dm.sharePostInChat);
    const shareToUser = useMutation(api.social.dm.shareToUser);
    const sendDm = useMutation(api.social.dm.sendMessage);

    const chatsPage = useQuery(
        api.social.dm.listChats,
        authUser && sessionToken && visible
            ? { sessionToken, folder: 'inbox' as const, limit: 40 }
            : 'skip',
    );

    const term = useDebouncedSearchTerm(searchText, 250, 2);
    const people = useQuery(
        api.userDirectory.search,
        sessionToken && term && visible
            ? { term, limit: 20, excludeSelf: true, sessionToken }
            : 'skip',
    );

    const rows = useMemo(() => {
        if (term) {
            return (people ?? []).map((p: any) => ({
                key: `user:${p.userId}`,
                userId: p.userId,
                chatId: null as string | null,
                name: p.displayName,
                handle: p.username,
                avatar: p.avatar,
            }));
        }
        return (chatsPage?.items ?? []).map((c: any) => ({
            key: `chat:${c.chatId}`,
            userId: null as string | null,
            chatId: c.chatId as string,
            name: c.title ?? 'Conversación',
            handle: c.kind === 'group' ? `${c.memberCount} integrantes` : c.participants?.[0]?.username,
            avatar: c.avatar,
        }));
    }, [term, people, chatsPage?.items]);

    const handleSend = async (row: any) => {
        if (!sessionToken) {
            show('Iniciá sesión para compartir', 'warning');
            return;
        }
        if (sending) return;
        setSending(row.key);
        try {
            const clientId = `share-post-${postId ?? 'text'}-${row.key}`;
            if (row.chatId) {
                if (postId) {
                    await sharePostInChat({
                        sessionToken,
                        chatId: row.chatId as any,
                        postId,
                        clientId,
                    });
                } else {
                    await sendDm({
                        sessionToken,
                        chatId: row.chatId as any,
                        body: postContent,
                        clientId,
                    });
                }
            } else {
                await shareToUser({
                    sessionToken,
                    participantId: row.userId,
                    ...(postId ? { postId } : { body: postContent }),
                    clientId,
                });
            }
            setSentTo((prev) => [...prev, row.key]);
            show('Enviado', 'success');
        } catch (e) {
            show(toUserMessage(e), 'error');
        } finally {
            setSending(null);
        }
    };

    const loading = term ? people === undefined : chatsPage === undefined;

    return (
        <Sheet open={visible} onOpenChange={(val: boolean) => !val && onClose()}>
            <SheetContent side="bottom" style={styles.sheetContent}>
                <SheetHeader style={styles.header}>
                    <SheetTitle style={styles.title}>Compartir</SheetTitle>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color={colors(isDark).text} />
                    </TouchableOpacity>
                </SheetHeader>

                <View style={styles.searchContainer}>
                    <Search size={20} color={colors(isDark).textMuted} style={styles.searchIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Buscar por @usuario o nombre…"
                        value={searchText}
                        onChangeText={setSearchText}
                        placeholderTextColor={colors(isDark).textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>

                {!term && <Text style={styles.sectionLabel}>Conversaciones recientes</Text>}

                <FlatList
                    data={rows}
                    keyExtractor={(item) => item.key}
                    contentContainerStyle={styles.list}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => {
                        const isSent = sentTo.includes(item.key);
                        return (
                            <View style={styles.userItem}>
                                <View style={styles.userInfo}>
                                    <Avatar size="md">
                                        <AvatarImage src={item.avatar ?? undefined} />
                                        <AvatarFallback>{(item.name ?? '?')[0]}</AvatarFallback>
                                    </Avatar>
                                    <View style={styles.userText}>
                                        <Text style={styles.userName} numberOfLines={1}>
                                            {item.name}
                                        </Text>
                                        {!!item.handle && (
                                            <Text style={styles.userHandle} numberOfLines={1}>
                                                {item.userId ? `@${item.handle}` : item.handle}
                                            </Text>
                                        )}
                                    </View>
                                </View>
                                <TouchableOpacity
                                    style={[styles.sendBtn, isSent && styles.sentBtn]}
                                    onPress={() => !isSent && handleSend(item)}
                                    disabled={isSent || sending === item.key}
                                >
                                    {sending === item.key ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={isSent ? styles.sentText : styles.sendText}>
                                            {isSent ? 'Enviado' : 'Enviar'}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        );
                    }}
                    ListEmptyComponent={
                        loading ? (
                            <ActivityIndicator style={{ marginTop: 40 }} />
                        ) : (
                            <View style={styles.empty}>
                                <Text style={styles.emptyText}>
                                    {term
                                        ? `No encontramos a nadie con “${searchText.trim()}”.`
                                        : 'Todavía no tenés conversaciones. Buscá a alguien por su @usuario.'}
                                </Text>
                            </View>
                        )
                    }
                />
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        sheetContent: {
            backgroundColor: c.glass,
            height: '70%',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.divider,
        },
        title: { fontSize: 16, fontWeight: '800', color: c.text },
        closeBtn: { position: 'absolute', right: 16, top: 16 },
        searchContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: c.surface2,
            margin: 16,
            marginBottom: 8,
            borderRadius: Radius.md,
            paddingHorizontal: 12,
            height: 44,
        },
        searchIcon: { marginRight: 8 },
        input: { flex: 1, fontSize: 15, color: c.text },
        sectionLabel: {
            fontSize: 11,
            fontWeight: '700',
            color: c.textMuted,
            paddingHorizontal: 16,
            marginBottom: 4,
            textTransform: 'uppercase',
        },
        list: { paddingHorizontal: 16, paddingBottom: 24 },
        userItem: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 10,
            gap: 12,
        },
        userInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
        userText: { flex: 1 },
        userName: { fontWeight: '600', fontSize: 14, color: c.text },
        userHandle: { fontSize: 12, color: c.textMuted },
        sendBtn: {
            minWidth: 82,
            alignItems: 'center',
            backgroundColor: c.primary,
            paddingHorizontal: 16,
            paddingVertical: 7,
            borderRadius: Radius.sm,
        },
        sentBtn: { backgroundColor: c.surface3 },
        sendText: { color: '#fff', fontWeight: '700', fontSize: 13 },
        sentText: { color: c.text, fontWeight: '700', fontSize: 13 },
        empty: { alignItems: 'center', marginTop: 40, paddingHorizontal: 24 },
        emptyText: { color: c.textMuted, textAlign: 'center', lineHeight: 20 },
    });
};
