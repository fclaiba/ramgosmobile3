import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, PenSquare, Search, Users } from 'lucide-react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { useClockTick, ONLINE_WINDOW_MS } from '../../hooks/useMessaging';
import { useDebouncedSearchTerm } from '../../hooks/useDebounce';
import { formatRelativeTime } from '../../utils/formatters';
import { toUserMessage } from '../../utils/errors';
import { colors, Radius } from '../../theme/tokens';

type Folder = 'inbox' | 'requests' | 'archived';

const PAGE_SIZE = 25;

export default function InboxScreen({ navigation }: any) {
    const { user, sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const insets = useSafeAreaInsets();
    const isDark = colorScheme === 'dark';
    const styles = useMemo(() => getStyles(isDark), [isDark]);

    const [folder, setFolder] = useState<Folder>('inbox');
    const [search, setSearch] = useState('');
    const [groupMode, setGroupMode] = useState(false);
    const [selected, setSelected] = useState<any[]>([]);
    const [groupTitle, setGroupTitle] = useState('');
    const [olderPages, setOlderPages] = useState<any[][]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [actionsFor, setActionsFor] = useState<any | null>(null);

    const getOrCreateChat = useMutation(api.social.dm.getOrCreateDirectChat);
    const createGroup = useMutation(api.social.dm.createGroupChat);
    const muteChat = useMutation(api.social.dm.muteChat);
    const archiveChat = useMutation(api.social.dm.archiveChat);
    const leaveChat = useMutation(api.social.dm.leaveChat);

    // El cursor viaja en la query: acumular páginas sin mandarlo es lo que
    // dejaba la paginación cableada a nada.
    const chats = useQuery(
        api.social.dm.listChats,
        sessionToken
            ? { sessionToken, folder, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) }
            : 'skip',
    );
    const unread = useQuery(
        api.social.dm.getUnreadTotal,
        sessionToken ? { sessionToken } : 'skip',
    );

    // Sin debounce esto abría una suscripción de Convex por cada tecla.
    const term = useDebouncedSearchTerm(search, 250, 2);
    const people = useQuery(
        api.userDirectory.search,
        sessionToken && term ? { term, limit: 20, excludeSelf: true, sessionToken } : 'skip',
    );

    // Reevalúa el punto verde de "en línea" sin depender de datos nuevos.
    useClockTick(30_000, !!chats?.items?.length);

    const items = useMemo(
        () => [...olderPages.flat(), ...(chats?.items ?? [])],
        [olderPages, chats?.items],
    );

    const loadMore = useCallback(() => {
        const next = chats?.nextCursor;
        if (!next || !chats?.items?.length) return;
        setOlderPages((prev) => [...prev, chats.items]);
        setCursor(next);
    }, [chats?.nextCursor, chats?.items]);

    const switchFolder = (next: Folder) => {
        setFolder(next);
        setOlderPages([]);
        setCursor(null);
    };

    const openDirect = async (userId: string) => {
        if (!sessionToken) return;
        try {
            const chatId = await getOrCreateChat({ participantId: userId, sessionToken });
            setSearch('');
            navigation.navigate('Chat', { chatId });
        } catch (e) {
            show(toUserMessage(e), 'error');
        }
    };

    const toggleSelected = (person: any) =>
        setSelected((prev) =>
            prev.some((p) => p.userId === person.userId)
                ? prev.filter((p) => p.userId !== person.userId)
                : [...prev, person],
        );

    const handleCreateGroup = async () => {
        if (!sessionToken || selected.length < 2) return;
        try {
            const chatId = await createGroup({
                sessionToken,
                participantIds: selected.map((p) => p.userId),
                title: groupTitle.trim() || 'Grupo',
            });
            setGroupMode(false);
            setSelected([]);
            setGroupTitle('');
            setSearch('');
            navigation.navigate('Chat', { chatId });
        } catch (e) {
            show(toUserMessage(e), 'error');
        }
    };

    const runAction = async (fn: () => Promise<any>, okMessage: string) => {
        setActionsFor(null);
        try {
            await fn();
            show(okMessage, 'success');
            setOlderPages([]);
            setCursor(null);
        } catch (e) {
            show(toUserMessage(e), 'error');
        }
    };

    const renderChat = ({ item }: any) => {
        const online =
            item.kind === 'direct' &&
            item.participants?.[0]?.lastSeenAt &&
            Date.now() - item.participants[0].lastSeenAt < ONLINE_WINDOW_MS;

        return (
            <TouchableOpacity
                style={styles.chatRow}
                activeOpacity={0.75}
                onPress={() => navigation.navigate('Chat', { chatId: item.chatId })}
                onLongPress={() => setActionsFor(item)}
                delayLongPress={280}
            >
                <View>
                    <Avatar size="lg" status={online ? 'online' : undefined}>
                        <AvatarImage src={item.avatar ?? undefined} />
                        <AvatarFallback>{(item.title ?? '?').charAt(0)}</AvatarFallback>
                    </Avatar>
                    {item.kind === 'group' && (
                        <View style={styles.groupBadge}>
                            <Users size={10} color="#fff" />
                        </View>
                    )}
                </View>

                <View style={styles.chatInfo}>
                    <View style={styles.chatTopRow}>
                        <Text
                            style={[styles.chatTitle, item.unreadCount > 0 && styles.chatTitleUnread]}
                            numberOfLines={1}
                        >
                            {item.title}
                        </Text>
                        <Text style={styles.chatTime}>{formatRelativeTime(item.lastMessageAt)}</Text>
                    </View>
                    <View style={styles.chatBottomRow}>
                        <Text
                            style={[
                                styles.chatPreview,
                                item.unreadCount > 0 && styles.chatPreviewUnread,
                            ]}
                            numberOfLines={1}
                        >
                            {item.lastMessageMine ? 'Vos: ' : ''}
                            {item.lastMessagePreview ?? 'Nuevo chat'}
                        </Text>
                        {item.muted && <Text style={styles.mutedMark}>🔕</Text>}
                        {item.unreadCount > 0 && (
                            <View style={styles.unreadDot}>
                                <Text style={styles.unreadDotText}>
                                    {item.unreadCount > 99 ? '99+' : item.unreadCount}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const renderPerson = ({ item }: any) => {
        const isSelected = selected.some((p) => p.userId === item.userId);
        return (
            <TouchableOpacity
                style={styles.chatRow}
                activeOpacity={0.75}
                onPress={() => (groupMode ? toggleSelected(item) : openDirect(item.userId))}
            >
                <Avatar size="lg">
                    <AvatarImage src={item.avatar ?? undefined} />
                    <AvatarFallback>{(item.displayName ?? '?').charAt(0)}</AvatarFallback>
                </Avatar>
                <View style={styles.chatInfo}>
                    <Text style={styles.chatTitle} numberOfLines={1}>
                        {item.displayName}
                    </Text>
                    {!!item.username && (
                        <Text style={styles.chatPreview} numberOfLines={1}>
                            @{item.username}
                        </Text>
                    )}
                </View>
                {groupMode && (
                    <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                        {isSelected && <Text style={styles.checkboxMark}>✓</Text>}
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    const searching = !!search.trim();
    const loadingSearch = searching && (people === undefined || term !== search.trim());

    return (
        <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <ArrowLeft size={24} color={colors(isDark).text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Mensajes</Text>
                <TouchableOpacity
                    onPress={() => {
                        setGroupMode((v) => !v);
                        setSelected([]);
                    }}
                    style={styles.iconBtn}
                    accessibilityLabel={groupMode ? 'Cancelar grupo' : 'Crear grupo'}
                >
                    <PenSquare size={20} color={groupMode ? colors(isDark).primary : colors(isDark).text} />
                </TouchableOpacity>
            </View>

            {groupMode && (
                <View style={styles.groupPanel}>
                    <Text style={styles.groupHint}>
                        Buscá personas y tocalas para sumarlas. Mínimo 2.
                    </Text>
                    {selected.length > 0 && (
                        <Text style={styles.groupChosen} numberOfLines={2}>
                            {selected.map((p) => p.displayName).join(', ')}
                        </Text>
                    )}
                    <View style={styles.groupBar}>
                        <TextInput
                            style={styles.groupInput}
                            placeholder="Nombre del grupo"
                            placeholderTextColor={colors(isDark).textMuted}
                            value={groupTitle}
                            onChangeText={setGroupTitle}
                        />
                        <TouchableOpacity
                            style={[styles.groupBtn, selected.length < 2 && styles.groupBtnDisabled]}
                            onPress={handleCreateGroup}
                            disabled={selected.length < 2}
                        >
                            <Text style={styles.groupBtnText}>Crear ({selected.length})</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <View style={styles.searchWrap}>
                <Search size={18} color={colors(isDark).textMuted} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar por @usuario o nombre…"
                    placeholderTextColor={colors(isDark).textMuted}
                    value={search}
                    onChangeText={setSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </View>

            {!searching && (
                <View style={styles.tabs}>
                    {(['inbox', 'requests', 'archived'] as const).map((tab) => (
                        <TouchableOpacity
                            key={tab}
                            style={[styles.tab, folder === tab && styles.tabActive]}
                            onPress={() => switchFolder(tab)}
                        >
                            <Text style={[styles.tabText, folder === tab && styles.tabTextActive]}>
                                {tab === 'inbox'
                                    ? 'Mensajes'
                                    : tab === 'requests'
                                      ? 'Solicitudes'
                                      : 'Archivados'}
                                {tab === 'requests' && !!unread?.requests
                                    ? ` (${unread.requests})`
                                    : ''}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {searching ? (
                <FlatList
                    data={people ?? []}
                    keyExtractor={(item: any) => item.userId}
                    renderItem={renderPerson}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                        loadingSearch ? (
                            <ActivityIndicator style={{ marginTop: 32 }} />
                        ) : (
                            <Text style={styles.empty}>
                                No encontramos a nadie con “{search.trim()}”. Probá con el @usuario
                                exacto.
                            </Text>
                        )
                    }
                />
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item: any) => item.chatId}
                    renderItem={renderChat}
                    keyboardShouldPersistTaps="handled"
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.4}
                    ListFooterComponent={
                        chats?.nextCursor ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null
                    }
                    ListEmptyComponent={
                        chats === undefined ? (
                            <ActivityIndicator style={{ marginTop: 32 }} />
                        ) : (
                            <Text style={styles.empty}>
                                {folder === 'inbox'
                                    ? 'Todavía no tenés conversaciones. Buscá a alguien por su @usuario para empezar.'
                                    : folder === 'requests'
                                      ? 'No tenés solicitudes pendientes.'
                                      : 'No archivaste ninguna conversación.'}
                            </Text>
                        )
                    }
                />
            )}

            <Sheet open={!!actionsFor} onOpenChange={(open: boolean) => !open && setActionsFor(null)}>
                <SheetContent side="bottom">
                    <SheetHeader>
                        <SheetTitle>{actionsFor?.title ?? 'Conversación'}</SheetTitle>
                    </SheetHeader>
                    <TouchableOpacity
                        style={styles.action}
                        onPress={() =>
                            runAction(
                                () =>
                                    muteChat({
                                        sessionToken: sessionToken!,
                                        chatId: actionsFor.chatId,
                                        muted: !actionsFor.muted,
                                    }),
                                actionsFor?.muted ? 'Notificaciones activadas' : 'Conversación silenciada',
                            )
                        }
                    >
                        <Text style={styles.actionText}>
                            {actionsFor?.muted ? 'Activar notificaciones' : 'Silenciar'}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.action}
                        onPress={() =>
                            runAction(
                                () =>
                                    archiveChat({
                                        sessionToken: sessionToken!,
                                        chatId: actionsFor.chatId,
                                        archived: folder !== 'archived',
                                    }),
                                folder === 'archived' ? 'Conversación restaurada' : 'Conversación archivada',
                            )
                        }
                    >
                        <Text style={styles.actionText}>
                            {folder === 'archived' ? 'Desarchivar' : 'Archivar'}
                        </Text>
                    </TouchableOpacity>
                    {actionsFor?.kind === 'group' && (
                        <TouchableOpacity
                            style={styles.action}
                            onPress={() =>
                                runAction(
                                    () =>
                                        leaveChat({
                                            sessionToken: sessionToken!,
                                            chatId: actionsFor.chatId,
                                        }),
                                    'Saliste del grupo',
                                )
                            }
                        >
                            <Text style={[styles.actionText, styles.actionDanger]}>Salir del grupo</Text>
                        </TouchableOpacity>
                    )}
                </SheetContent>
            </Sheet>
        </View>
    );
}

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.surface1 },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 12,
            paddingBottom: 8,
        },
        headerTitle: { fontSize: 18, fontWeight: '800', color: c.text },
        iconBtn: { padding: 8, borderRadius: Radius.md },
        searchWrap: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginHorizontal: 16,
            marginBottom: 10,
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: Radius.lg,
            backgroundColor: c.surface2,
        },
        searchInput: { flex: 1, color: c.text, fontSize: 14, padding: 0 },
        tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 18, marginBottom: 6 },
        tab: { paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
        tabActive: { borderBottomColor: c.primary },
        tabText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
        tabTextActive: { color: c.text },
        chatRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
        },
        groupBadge: {
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: 18,
            height: 18,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.primary,
        },
        chatInfo: { flex: 1, gap: 3 },
        chatTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        chatTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: c.text },
        chatTitleUnread: { fontWeight: '800' },
        chatTime: { fontSize: 11, color: c.textMuted, marginLeft: 8 },
        chatBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        chatPreview: { flex: 1, fontSize: 13, color: c.textMuted },
        chatPreviewUnread: { color: c.text, fontWeight: '600' },
        mutedMark: { fontSize: 12, marginLeft: 6 },
        unreadDot: {
            minWidth: 20,
            height: 20,
            paddingHorizontal: 5,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.primary,
            marginLeft: 8,
        },
        unreadDotText: { fontSize: 11, fontWeight: '800', color: '#fff' },
        checkbox: {
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2,
            borderColor: c.border,
            alignItems: 'center',
            justifyContent: 'center',
        },
        checkboxOn: { backgroundColor: c.primary, borderColor: c.primary },
        checkboxMark: { color: '#fff', fontSize: 12, fontWeight: '900' },
        groupPanel: { paddingHorizontal: 16, marginBottom: 8, gap: 6 },
        groupHint: { fontSize: 12, color: c.textMuted },
        groupChosen: { fontSize: 12, color: c.text, fontWeight: '600' },
        groupBar: { flexDirection: 'row', gap: 8 },
        groupInput: {
            flex: 1,
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: Radius.md,
            backgroundColor: c.surface2,
            color: c.text,
        },
        groupBtn: {
            paddingHorizontal: 14,
            justifyContent: 'center',
            borderRadius: Radius.md,
            backgroundColor: c.primary,
        },
        groupBtnDisabled: { opacity: 0.4 },
        groupBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
        action: { paddingVertical: 14, paddingHorizontal: 20 },
        actionText: { fontSize: 15, fontWeight: '600', color: c.text },
        actionDanger: { color: c.danger ?? '#EF4444' },
        empty: {
            textAlign: 'center',
            marginTop: 48,
            paddingHorizontal: 40,
            color: c.textMuted,
            fontSize: 14,
            lineHeight: 20,
        },
    });
};
