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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, PenSquare, Search, Users } from 'lucide-react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { useClockTick } from '../../hooks/useMessaging';
import { formatRelativeTime } from '../../utils/formatters';
import { toUserMessage } from '../../utils/errors';
import { colors, Radius } from '../../theme/tokens';

const ONLINE_WINDOW_MS = 60_000;

export default function InboxScreen({ navigation }: any) {
    const { user, sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const insets = useSafeAreaInsets();
    const isDark = colorScheme === 'dark';
    const styles = useMemo(() => getStyles(isDark), [isDark]);

    const [folder, setFolder] = useState<'inbox' | 'requests'>('inbox');
    const [search, setSearch] = useState('');
    const [groupMode, setGroupMode] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);
    const [groupTitle, setGroupTitle] = useState('');

    const getOrCreateChat = useMutation(api.social.dm.getOrCreateDirectChat);
    const createGroup = useMutation(api.social.dm.createGroupChat);

    const chats = useQuery(
        api.social.dm.listChats,
        sessionToken ? { sessionToken, folder, limit: 30 } : 'skip',
    );
    const unread = useQuery(
        api.social.dm.getUnreadTotal,
        sessionToken ? { sessionToken } : 'skip',
    );
    const people = useQuery(
        api.social.searchUsers,
        sessionToken && search.trim() ? { term: search.trim(), limit: 20, sessionToken } : 'skip',
    );

    // Reevalúa el punto verde de "en línea" sin depender de datos nuevos.
    useClockTick(30_000, !!chats?.items?.length);

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

    const toggleSelected = (userId: string) =>
        setSelected((prev) =>
            prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
        );

    const handleCreateGroup = async () => {
        if (!sessionToken || selected.length < 2) return;
        try {
            const chatId = await createGroup({
                sessionToken,
                participantIds: selected,
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
        const isSelected = selected.includes(item.userId);
        return (
            <TouchableOpacity
                style={styles.chatRow}
                activeOpacity={0.75}
                onPress={() => (groupMode ? toggleSelected(item.userId) : openDirect(item.userId))}
            >
                <Avatar size="lg">
                    <AvatarImage src={item.avatar ?? undefined} />
                    <AvatarFallback>{(item.displayName ?? '?').charAt(0)}</AvatarFallback>
                </Avatar>
                <View style={styles.chatInfo}>
                    <Text style={styles.chatTitle} numberOfLines={1}>
                        {item.displayName}
                    </Text>
                    <Text style={styles.chatPreview} numberOfLines={1}>
                        @{item.username}
                    </Text>
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
    const searchResults = (people ?? []).filter((p: any) => p.userId !== user?.id);

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
                >
                    <PenSquare size={20} color={groupMode ? colors(isDark).primary : colors(isDark).text} />
                </TouchableOpacity>
            </View>

            {groupMode && (
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
            )}

            <View style={styles.searchWrap}>
                <Search size={18} color={colors(isDark).textMuted} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar personas…"
                    placeholderTextColor={colors(isDark).textMuted}
                    value={search}
                    onChangeText={setSearch}
                />
            </View>

            {!searching && (
                <View style={styles.tabs}>
                    {(['inbox', 'requests'] as const).map((tab) => (
                        <TouchableOpacity
                            key={tab}
                            style={[styles.tab, folder === tab && styles.tabActive]}
                            onPress={() => setFolder(tab)}
                        >
                            <Text style={[styles.tabText, folder === tab && styles.tabTextActive]}>
                                {tab === 'inbox' ? 'Mensajes' : 'Solicitudes'}
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
                    data={searchResults}
                    keyExtractor={(item: any) => item.userId}
                    renderItem={renderPerson}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                        people === undefined ? (
                            <ActivityIndicator style={{ marginTop: 32 }} />
                        ) : (
                            <Text style={styles.empty}>No encontramos a nadie con ese nombre.</Text>
                        )
                    }
                />
            ) : (
                <FlatList
                    data={chats?.items ?? []}
                    keyExtractor={(item: any) => item.chatId}
                    renderItem={renderChat}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                        chats === undefined ? (
                            <ActivityIndicator style={{ marginTop: 32 }} />
                        ) : (
                            <Text style={styles.empty}>
                                {folder === 'inbox'
                                    ? 'Todavía no tenés conversaciones. Buscá a alguien para empezar.'
                                    : 'No tenés solicitudes pendientes.'}
                            </Text>
                        )
                    }
                />
            )}
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
        groupBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
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
