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
import { ArrowLeft, Plus, Search, Users, Lock, Globe } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useDebouncedSearchTerm } from '../../hooks/useDebounce';
import { colors, Radius } from '../../theme/tokens';

/**
 * "Comunidades Comerciales" (Sprint 4 del doc) — los pasillos digitales.
 * Tabs: Mis comunidades / Descubrir.
 */
export default function CommunitiesScreen({ navigation }: any) {
    const insets = useSafeAreaInsets();
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [tab, setTab] = useState<'mine' | 'discover'>('mine');
    const [term, setTerm] = useState('');
    const debouncedTerm = useDebouncedSearchTerm(term, 300);

    const mine = useQuery(
        api.social.communities.listMyCommunities,
        sessionToken && tab === 'mine' ? { sessionToken } : 'skip',
    );
    const discover = useQuery(
        api.social.communities.searchCommunities,
        sessionToken && tab === 'discover' ? { sessionToken, term: debouncedTerm || undefined, limit: 30 } : 'skip',
    );

    const data = tab === 'mine' ? mine : discover;
    const loading = data === undefined;

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <ArrowLeft size={22} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Comunidades</Text>
                <TouchableOpacity onPress={() => navigation.navigate('CreateCommunity')} style={styles.iconBtn}>
                    <Plus size={22} color={colors(isDark).primary} />
                </TouchableOpacity>
            </View>

            <View style={styles.tabs}>
                <TouchableOpacity style={[styles.tab, tab === 'mine' && styles.tabActive]} onPress={() => setTab('mine')}>
                    <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>Mis comunidades</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, tab === 'discover' && styles.tabActive]} onPress={() => setTab('discover')}>
                    <Text style={[styles.tabText, tab === 'discover' && styles.tabTextActive]}>Descubrir</Text>
                </TouchableOpacity>
            </View>

            {tab === 'discover' && (
                <View style={styles.searchBox}>
                    <Search size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Buscar comunidades…"
                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                        value={term}
                        onChangeText={setTerm}
                    />
                </View>
            )}

            {loading ? (
                <ActivityIndicator style={{ marginTop: 40 }} color={colors(isDark).primary} />
            ) : (data?.length ?? 0) === 0 ? (
                <View style={styles.empty}>
                    <Users size={40} color={isDark ? '#4B5563' : '#D1D5DB'} />
                    <Text style={styles.emptyText}>
                        {tab === 'mine' ? 'Todavía no te uniste a ninguna comunidad' : 'No encontramos comunidades'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={data}
                    keyExtractor={(item: any) => String(item._id)}
                    contentContainerStyle={{ padding: 16, gap: 12 }}
                    renderItem={({ item }: any) => (
                        <TouchableOpacity
                            style={styles.card}
                            onPress={() => navigation.navigate('CommunityDetail', { communityId: item._id })}
                        >
                            <View style={styles.cardHeader}>
                                <Text style={styles.cardTitle}>{item.name}</Text>
                                {item.visibility === 'private' ? (
                                    <Lock size={14} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                ) : (
                                    <Globe size={14} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                )}
                            </View>
                            {item.description ? (
                                <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
                            ) : null}
                            <View style={styles.cardFooter}>
                                <Users size={13} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                <Text style={styles.cardMeta}>{item.memberCount} miembros</Text>
                                {item.location ? <Text style={styles.cardMeta}>· {item.location}</Text> : null}
                            </View>
                        </TouchableOpacity>
                    )}
                />
            )}
        </View>
    );
}

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: isDark ? '#000' : '#fff' },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
        },
        iconBtn: { padding: 4 },
        headerTitle: { fontSize: 18, fontWeight: '700', color: isDark ? '#fff' : '#111827' },
        tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
        tab: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: Radius.full ?? 999, backgroundColor: isDark ? '#18181B' : '#F3F4F6' },
        tabActive: { backgroundColor: colors(isDark).primary },
        tabText: { fontSize: 13, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },
        tabTextActive: { color: '#fff' },
        searchBox: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginHorizontal: 16,
            marginBottom: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: Radius.md,
            backgroundColor: isDark ? '#18181B' : '#F3F4F6',
        },
        searchInput: { flex: 1, color: isDark ? '#fff' : '#111827', fontSize: 14 },
        card: {
            padding: 16,
            borderRadius: Radius.lg,
            backgroundColor: isDark ? '#18181B' : '#F9FAFB',
            borderWidth: 1,
            borderColor: isDark ? '#27272A' : '#E5E7EB',
        },
        cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        cardTitle: { fontSize: 16, fontWeight: '700', color: isDark ? '#fff' : '#111827' },
        cardDesc: { fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280', marginTop: 4 },
        cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
        cardMeta: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280' },
        empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 100 },
        emptyText: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', paddingHorizontal: 40 },
    });
