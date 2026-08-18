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
import { ArrowLeft, Check, LogOut, Search, UserMinus, UserPlus } from 'lucide-react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { useDebouncedSearchTerm } from '../../hooks/useDebounce';
import { toUserMessage } from '../../utils/errors';
import { colors, Radius } from '../../theme/tokens';

/**
 * Info del grupo. Las mutations de administración (`addGroupMembers`,
 * `removeGroupMember`, `updateGroup`, `leaveChat`) existían en el backend sin
 * un solo punto de entrada en la app: un grupo creado no se podía renombrar,
 * ni editar, ni abandonar nunca.
 */
export default function GroupInfoScreen({ route, navigation }: any) {
    const chatId: string | undefined = route?.params?.chatId;
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const insets = useSafeAreaInsets();
    const isDark = colorScheme === 'dark';
    const styles = useMemo(() => getStyles(isDark), [isDark]);

    const [title, setTitle] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState(false);

    const header = useQuery(
        api.social.dm.getChat,
        chatId && sessionToken ? { chatId: chatId as any, sessionToken } : 'skip',
    );

    const term = useDebouncedSearchTerm(search, 250, 2);
    const people = useQuery(
        api.userDirectory.search,
        sessionToken && term ? { term, limit: 15, excludeSelf: true, sessionToken } : 'skip',
    );

    const updateGroup = useMutation(api.social.dm.updateGroup);
    const addMembers = useMutation(api.social.dm.addGroupMembers);
    const removeMember = useMutation(api.social.dm.removeGroupMember);
    const leaveChat = useMutation(api.social.dm.leaveChat);

    const isOwner = header?.myRole === 'owner';
    const currentTitle = title ?? header?.title ?? '';
    const memberIds = new Set((header?.participants ?? []).map((p: any) => p.userId));

    const run = async (fn: () => Promise<any>, okMessage: string, goBack = false) => {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
            show(okMessage, 'success');
            if (goBack) navigation.goBack();
        } catch (e) {
            show(toUserMessage(e), 'error');
        } finally {
            setBusy(false);
        }
    };

    if (!chatId) return null;

    if (header === undefined) {
        return (
            <View style={[styles.screen, styles.center]}>
                <ActivityIndicator color={colors(isDark).primary} />
            </View>
        );
    }

    if (header === null || header.kind !== 'group') {
        return (
            <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
                <Text style={styles.empty}>Esta conversación no es un grupo.</Text>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={styles.link}>Volver</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <ArrowLeft size={24} color={colors(isDark).text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Info del grupo</Text>
                <View style={styles.iconBtn} />
            </View>

            <FlatList
                data={term ? (people ?? []).filter((p: any) => !memberIds.has(p.userId)) : header.participants}
                keyExtractor={(item: any) => item.userId}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                    <View>
                        <View style={styles.groupHead}>
                            <Avatar size="xl">
                                <AvatarImage src={header.avatar ?? undefined} />
                                <AvatarFallback>{(header.title ?? 'G').charAt(0)}</AvatarFallback>
                            </Avatar>
                            <Text style={styles.memberCount}>
                                {header.memberCount} integrantes
                            </Text>
                        </View>

                        {isOwner ? (
                            <View style={styles.renameRow}>
                                <TextInput
                                    style={styles.renameInput}
                                    value={currentTitle}
                                    onChangeText={setTitle}
                                    placeholder="Nombre del grupo"
                                    placeholderTextColor={colors(isDark).textMuted}
                                    maxLength={60}
                                />
                                <TouchableOpacity
                                    style={[
                                        styles.renameBtn,
                                        (!currentTitle.trim() || currentTitle === header.title) &&
                                            styles.renameBtnDisabled,
                                    ]}
                                    disabled={!currentTitle.trim() || currentTitle === header.title}
                                    onPress={() =>
                                        run(
                                            () =>
                                                updateGroup({
                                                    sessionToken: sessionToken!,
                                                    chatId: chatId as any,
                                                    title: currentTitle.trim(),
                                                }),
                                            'Nombre actualizado',
                                        )
                                    }
                                >
                                    <Check size={18} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <Text style={styles.groupTitle}>{header.title}</Text>
                        )}

                        {isOwner && (
                            <View style={styles.searchWrap}>
                                <Search size={18} color={colors(isDark).textMuted} />
                                <TextInput
                                    style={styles.searchInput}
                                    value={search}
                                    onChangeText={setSearch}
                                    placeholder="Agregar por @usuario o nombre…"
                                    placeholderTextColor={colors(isDark).textMuted}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>
                        )}

                        <Text style={styles.sectionLabel}>
                            {term ? 'Resultados' : 'Integrantes'}
                        </Text>
                    </View>
                }
                renderItem={({ item }: any) => {
                    const adding = !!term;
                    return (
                        <View style={styles.memberRow}>
                            <Avatar size="md">
                                <AvatarImage src={item.avatar ?? undefined} />
                                <AvatarFallback>
                                    {(item.displayName ?? '?').charAt(0)}
                                </AvatarFallback>
                            </Avatar>
                            <View style={styles.memberInfo}>
                                <Text style={styles.memberName} numberOfLines={1}>
                                    {item.displayName}
                                </Text>
                                {!!item.username && (
                                    <Text style={styles.memberHandle} numberOfLines={1}>
                                        @{item.username}
                                    </Text>
                                )}
                            </View>
                            {isOwner && (
                                <TouchableOpacity
                                    disabled={busy}
                                    onPress={() =>
                                        adding
                                            ? run(
                                                  () =>
                                                      addMembers({
                                                          sessionToken: sessionToken!,
                                                          chatId: chatId as any,
                                                          userIds: [item.userId],
                                                      }),
                                                  `${item.displayName} agregado`,
                                              ).then(() => setSearch(''))
                                            : run(
                                                  () =>
                                                      removeMember({
                                                          sessionToken: sessionToken!,
                                                          chatId: chatId as any,
                                                          userId: item.userId,
                                                      }),
                                                  `${item.displayName} salió del grupo`,
                                              )
                                    }
                                    style={styles.memberAction}
                                >
                                    {adding ? (
                                        <UserPlus size={18} color={colors(isDark).primary} />
                                    ) : (
                                        <UserMinus size={18} color="#EF4444" />
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                }}
                ListEmptyComponent={
                    term && people === undefined ? (
                        <ActivityIndicator style={{ marginTop: 24 }} />
                    ) : (
                        <Text style={styles.empty}>
                            {term ? 'No encontramos a nadie con ese nombre.' : 'Sin integrantes.'}
                        </Text>
                    )
                }
                ListFooterComponent={
                    <TouchableOpacity
                        style={styles.leaveBtn}
                        disabled={busy}
                        onPress={() =>
                            run(
                                () =>
                                    leaveChat({
                                        sessionToken: sessionToken!,
                                        chatId: chatId as any,
                                    }),
                                'Saliste del grupo',
                                true,
                            )
                        }
                    >
                        <LogOut size={17} color="#EF4444" />
                        <Text style={styles.leaveText}>Salir del grupo</Text>
                    </TouchableOpacity>
                }
            />
        </View>
    );
}

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.surface1 },
        center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 12,
            paddingBottom: 8,
        },
        headerTitle: { fontSize: 17, fontWeight: '800', color: c.text },
        iconBtn: { padding: 8, borderRadius: Radius.md, minWidth: 40 },
        groupHead: { alignItems: 'center', gap: 8, paddingVertical: 12 },
        groupTitle: { fontSize: 18, fontWeight: '700', color: c.text, textAlign: 'center' },
        memberCount: { fontSize: 13, color: c.textMuted },
        renameRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
        renameInput: {
            flex: 1,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: Radius.md,
            backgroundColor: c.surface2,
            color: c.text,
        },
        renameBtn: {
            paddingHorizontal: 14,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: Radius.md,
            backgroundColor: c.primary,
        },
        renameBtnDisabled: { opacity: 0.4 },
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
        sectionLabel: {
            fontSize: 12,
            fontWeight: '700',
            color: c.textMuted,
            paddingHorizontal: 16,
            marginBottom: 4,
            textTransform: 'uppercase',
        },
        memberRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 9,
        },
        memberInfo: { flex: 1 },
        memberName: { fontSize: 15, fontWeight: '600', color: c.text },
        memberHandle: { fontSize: 12, color: c.textMuted },
        memberAction: { padding: 8 },
        leaveBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 24,
            marginBottom: 40,
            paddingVertical: 14,
        },
        leaveText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },
        empty: { textAlign: 'center', marginTop: 24, color: c.textMuted, paddingHorizontal: 40 },
        link: { color: c.primary, fontWeight: '700' },
    });
};
