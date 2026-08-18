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
import { Search } from 'lucide-react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { useDebouncedSearchTerm } from '../../hooks/useDebounce';
import { toUserMessage } from '../../utils/errors';
import { colors, Radius } from '../../theme/tokens';

interface ShareListingModalProps {
    listingId: string;
    visible: boolean;
    onClose: () => void;
}

/**
 * "Recomendar por mensaje". El card se arma en el servidor con el precio real
 * y el id de quien recomienda, así la atribución de la venta no depende del
 * cliente. El buscador consulta el directorio de personas: antes sólo se podía
 * recomendar a alguien con quien ya tenías una conversación abierta.
 */
export const ShareListingModal = ({ listingId, visible, onClose }: ShareListingModalProps) => {
    const { user, sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const isDark = colorScheme === 'dark';
    const styles = useMemo(() => getStyles(isDark), [isDark]);

    const [searchText, setSearchText] = useState('');
    const [sentTo, setSentTo] = useState<string[]>([]);
    const [sending, setSending] = useState<string | null>(null);

    const shareListing = useMutation(api.social.dm.shareListingInChat);
    const shareToUser = useMutation(api.social.dm.shareToUser);

    const chats = useQuery(
        api.social.dm.listChats,
        user && sessionToken && visible
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
                handle: p.username ? `@${p.username}` : null,
                avatar: p.avatar,
            }));
        }
        return (chats?.items ?? []).map((c: any) => ({
            key: `chat:${c.chatId}`,
            userId: null as string | null,
            chatId: c.chatId as string,
            name: c.title ?? 'Conversación',
            handle:
                c.kind === 'group'
                    ? `${c.memberCount} integrantes`
                    : c.participants?.[0]?.username
                      ? `@${c.participants[0].username}`
                      : null,
            avatar: c.avatar,
        }));
    }, [term, people, chats?.items]);

    const handleSend = async (row: any) => {
        if (!sessionToken || sending) return;
        setSending(row.key);
        try {
            const clientId = `share-listing-${listingId}-${row.key}`;
            if (row.chatId) {
                await shareListing({
                    sessionToken,
                    chatId: row.chatId as any,
                    listingId,
                    clientId,
                });
            } else {
                await shareToUser({
                    sessionToken,
                    participantId: row.userId,
                    listingId,
                    clientId,
                });
            }
            setSentTo((prev) => [...prev, row.key]);
            show('Recomendación enviada', 'success');
        } catch (e) {
            show(toUserMessage(e), 'error');
        } finally {
            setSending(null);
        }
    };

    const loading = term ? people === undefined : chats === undefined;

    return (
        <Sheet open={visible} onOpenChange={(open: boolean) => !open && onClose()}>
            <SheetContent side="bottom" style={styles.sheet}>
                <SheetHeader>
                    <SheetTitle>Recomendar por mensaje</SheetTitle>
                </SheetHeader>

                <View style={styles.searchWrap}>
                    <Search size={18} color={colors(isDark).textMuted} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Buscar por @usuario o nombre…"
                        placeholderTextColor={colors(isDark).textMuted}
                        value={searchText}
                        onChangeText={setSearchText}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>

                {!term && <Text style={styles.sectionLabel}>Conversaciones recientes</Text>}

                <FlatList
                    data={rows}
                    keyExtractor={(item) => item.key}
                    contentContainerStyle={{ paddingBottom: 24 }}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                        loading ? (
                            <ActivityIndicator style={{ marginTop: 24 }} />
                        ) : (
                            <Text style={styles.empty}>
                                {term
                                    ? `No encontramos a nadie con “${searchText.trim()}”.`
                                    : 'Todavía no tenés conversaciones. Buscá a alguien por su @usuario.'}
                            </Text>
                        )
                    }
                    renderItem={({ item }) => {
                        const isSent = sentTo.includes(item.key);
                        return (
                            <View style={styles.row}>
                                <Avatar size="md">
                                    <AvatarImage src={item.avatar ?? undefined} />
                                    <AvatarFallback>{(item.name ?? '?').charAt(0)}</AvatarFallback>
                                </Avatar>
                                <View style={styles.info}>
                                    <Text style={styles.name} numberOfLines={1}>
                                        {item.name}
                                    </Text>
                                    {!!item.handle && (
                                        <Text style={styles.handle} numberOfLines={1}>
                                            {item.handle}
                                        </Text>
                                    )}
                                </View>
                                <TouchableOpacity
                                    style={[styles.btn, isSent && styles.btnSent]}
                                    disabled={isSent || sending === item.key}
                                    onPress={() => handleSend(item)}
                                >
                                    {sending === item.key ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={isSent ? styles.btnSentText : styles.btnText}>
                                            {isSent ? 'Enviado' : 'Enviar'}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        );
                    }}
                />
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        sheet: { height: '70%' },
        searchWrap: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginHorizontal: 16,
            marginVertical: 10,
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: Radius.lg,
            backgroundColor: c.surface2,
        },
        searchInput: { flex: 1, color: c.text, fontSize: 14, padding: 0 },
        sectionLabel: {
            fontSize: 11,
            fontWeight: '700',
            color: c.textMuted,
            paddingHorizontal: 16,
            marginBottom: 4,
            textTransform: 'uppercase',
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
        },
        info: { flex: 1 },
        name: { fontSize: 15, fontWeight: '600', color: c.text },
        handle: { fontSize: 12, color: c.textMuted },
        btn: {
            minWidth: 84,
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: Radius.md,
            backgroundColor: c.primary,
        },
        btnSent: { backgroundColor: c.surface3 },
        btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
        btnSentText: { color: c.text, fontWeight: '700', fontSize: 13 },
        empty: { textAlign: 'center', marginTop: 32, color: c.textMuted, paddingHorizontal: 32 },
    });
};
