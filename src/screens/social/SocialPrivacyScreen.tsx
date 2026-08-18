import React, { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, VolumeX, EyeOff, Star, UserPlus2 } from 'lucide-react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useDebouncedSearchTerm } from '../../hooks/useDebounce';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { colors, Radius } from '../../theme/tokens';

type Tab = 'muted' | 'hidden' | 'closeFriends';

/**
 * Gestión de privacidad social: silenciados, contenido oculto y "mejores
 * amigos". Las tres listas existían del lado del backend (Fase 2 y Fase 7)
 * sin ninguna pantalla para revisarlas o revertirlas.
 */
export default function SocialPrivacyScreen({ navigation }: any) {
    const insets = useSafeAreaInsets();
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [tab, setTab] = useState<Tab>('muted');
    const [term, setTerm] = useState('');
    const debouncedTerm = useDebouncedSearchTerm(term, 300);

    const mutes = useQuery(api.social.moderation.listMyMutes, sessionToken && tab === 'muted' ? { sessionToken } : 'skip');
    const hidden = useQuery(api.social.moderation.listMyHiddenPosts, sessionToken && tab === 'hidden' ? { sessionToken } : 'skip');
    const closeFriends = useQuery(api.social.listCloseFriends, sessionToken && tab === 'closeFriends' ? { sessionToken } : 'skip');
    const people = useQuery(
        api.userDirectory.search,
        sessionToken && tab === 'closeFriends' && debouncedTerm ? { sessionToken, term: debouncedTerm, limit: 15 } : 'skip',
    );

    const unmuteUser = useMutation(api.social.moderation.unmuteUser);
    const unhidePost = useMutation(api.social.moderation.unhidePost);
    const addCloseFriend = useMutation(api.social.addCloseFriend);
    const removeCloseFriend = useMutation(api.social.removeCloseFriend);

    const closeFriendIds = new Set((closeFriends ?? []).map((c: any) => c.friendUserId));

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <ArrowLeft size={22} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Privacidad social</Text>
                <View style={{ width: 22 }} />
            </View>

            <View style={styles.tabs}>
                <TouchableOpacity style={[styles.tab, tab === 'muted' && styles.tabActive]} onPress={() => setTab('muted')}>
                    <Text style={[styles.tabText, tab === 'muted' && styles.tabTextActive]}>Silenciados</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, tab === 'hidden' && styles.tabActive]} onPress={() => setTab('hidden')}>
                    <Text style={[styles.tabText, tab === 'hidden' && styles.tabTextActive]}>Ocultos</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, tab === 'closeFriends' && styles.tabActive]} onPress={() => setTab('closeFriends')}>
                    <Text style={[styles.tabText, tab === 'closeFriends' && styles.tabTextActive]}>Mejores amigos</Text>
                </TouchableOpacity>
            </View>

            {tab === 'muted' && (
                mutes === undefined ? <ActivityIndicator style={{ marginTop: 24 }} color={colors(isDark).primary} /> : (
                    <FlatList
                        data={mutes}
                        keyExtractor={(item: any) => String(item._id)}
                        contentContainerStyle={{ padding: 16, gap: 8 }}
                        renderItem={({ item }: any) => (
                            <View style={styles.row}>
                                <VolumeX size={18} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                <Text style={[styles.rowText, { flex: 1 }]}>{item.mutedUserId}</Text>
                                <TouchableOpacity onPress={() => sessionToken && unmuteUser({ sessionToken, targetUserId: item.mutedUserId })}>
                                    <Text style={styles.actionLink}>Quitar</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        ListEmptyComponent={<Text style={styles.emptyText}>No silenciaste a nadie.</Text>}
                    />
                )
            )}

            {tab === 'hidden' && (
                hidden === undefined ? <ActivityIndicator style={{ marginTop: 24 }} color={colors(isDark).primary} /> : (
                    <FlatList
                        data={hidden}
                        keyExtractor={(item: any) => String(item._id)}
                        contentContainerStyle={{ padding: 16, gap: 8 }}
                        renderItem={({ item }: any) => (
                            <View style={styles.row}>
                                <EyeOff size={18} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                <Text style={[styles.rowText, { flex: 1 }]} numberOfLines={1}>Post oculto</Text>
                                <TouchableOpacity onPress={() => sessionToken && unhidePost({ sessionToken, postId: item.postId })}>
                                    <Text style={styles.actionLink}>Mostrar</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        ListEmptyComponent={<Text style={styles.emptyText}>No ocultaste ningún post.</Text>}
                    />
                )
            )}

            {tab === 'closeFriends' && (
                <>
                    <View style={styles.searchBox}>
                        <UserPlus2 size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Buscar por @usuario…"
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                            value={term}
                            onChangeText={setTerm}
                        />
                    </View>
                    <FlatList
                        data={term ? (people ?? []) : (closeFriends ?? [])}
                        keyExtractor={(item: any) => String(item.userId ?? item.friendUserId)}
                        contentContainerStyle={{ padding: 16, gap: 8 }}
                        renderItem={({ item }: any) => {
                            const userId = term ? item.userId : item.friendUserId;
                            const displayName = term ? item.displayName : (item.profile?.displayName ?? userId);
                            const isFriend = closeFriendIds.has(userId);
                            return (
                                <View style={styles.row}>
                                    <Avatar style={styles.avatar}>
                                        <AvatarImage src={item.avatar ?? item.profile?.avatar} />
                                        <AvatarFallback>{(displayName ?? '?')[0]}</AvatarFallback>
                                    </Avatar>
                                    <Text style={[styles.rowText, { flex: 1 }]}>{displayName}</Text>
                                    <TouchableOpacity
                                        onPress={() =>
                                            sessionToken &&
                                            (isFriend
                                                ? removeCloseFriend({ sessionToken, friendUserId: userId })
                                                : addCloseFriend({ sessionToken, friendUserId: userId }))
                                        }
                                    >
                                        <Star size={18} color={isFriend ? '#FBBF24' : (isDark ? '#9CA3AF' : '#6B7280')} fill={isFriend ? '#FBBF24' : 'transparent'} />
                                    </TouchableOpacity>
                                </View>
                            );
                        }}
                        ListEmptyComponent={<Text style={styles.emptyText}>Buscá a alguien para agregarlo a tus mejores amigos.</Text>}
                    />
                </>
            )}
        </View>
    );
}

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: isDark ? '#000' : '#fff' },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
        iconBtn: { padding: 4 },
        headerTitle: { fontSize: 18, fontWeight: '700', color: isDark ? '#fff' : '#111827' },
        tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
        tab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.full ?? 999, backgroundColor: isDark ? '#18181B' : '#F3F4F6' },
        tabActive: { backgroundColor: colors(isDark).primary },
        tabText: { fontSize: 12, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },
        tabTextActive: { color: '#fff' },
        searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md, backgroundColor: isDark ? '#18181B' : '#F3F4F6' },
        searchInput: { flex: 1, color: isDark ? '#fff' : '#111827', fontSize: 14 },
        row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: Radius.md, backgroundColor: isDark ? '#18181B' : '#F9FAFB' },
        rowText: { fontSize: 14, color: isDark ? '#fff' : '#111827' },
        avatar: { width: 32, height: 32 },
        actionLink: { fontSize: 13, fontWeight: '600', color: colors(isDark).primary },
        emptyText: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', paddingTop: 40 },
    });
