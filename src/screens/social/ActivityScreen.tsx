import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Heart, MessageCircle, UserPlus, AtSign, Repeat2, ShoppingBag, Bell } from 'lucide-react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { colors, Radius } from '../../theme/tokens';

/**
 * Bandeja de "Actividad" real. NO se deriva de `pushDeliveries` (log de
 * auditoría de envíos): lee `socialActivity`, que sí tiene estado de leído,
 * agrupación ("le gustó a Fran y 12 personas más") y un `targetId` navegable.
 */
export default function ActivityScreen({ navigation }: any) {
    const insets = useSafeAreaInsets();
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [filter, setFilter] = useState<'all' | 'mentions' | 'sales'>('all');

    const result = useQuery(
        api.social.activity.listActivity,
        sessionToken ? { sessionToken, filter, limit: 30 } : 'skip',
    );
    const markRead = useMutation(api.social.activity.markActivityRead);

    useEffect(() => {
        if (sessionToken) markRead({ sessionToken }).catch(() => {});
    }, [sessionToken, markRead]);

    const items = result?.items ?? [];

    const iconFor = (type: string) => {
        switch (type) {
            case 'like': return <Heart size={18} color="#EF4444" />;
            case 'comment':
            case 'reply': return <MessageCircle size={18} color={colors(isDark).primary} />;
            case 'follow': return <UserPlus size={18} color={colors(isDark).primary} />;
            case 'mention': return <AtSign size={18} color={colors(isDark).primary} />;
            case 'repost':
            case 'quote': return <Repeat2 size={18} color="#10B981" />;
            case 'sale': return <ShoppingBag size={18} color="#10B981" />;
            case 'match': return <Heart size={18} color="#EC4899" fill="#EC4899" />;
            default: return <Bell size={18} color={isDark ? '#9CA3AF' : '#6B7280'} />;
        }
    };

    const labelFor = (item: any) => {
        const who = item.actor?.displayName || item.actor?.username || 'Alguien';
        const extra = item.groupCount && item.groupCount > 1 ? ` y ${item.groupCount - 1} más` : '';
        switch (item.type) {
            case 'like': return `${who}${extra} le gustó tu post`;
            case 'comment': return `${who} comentó tu post`;
            case 'reply': return `${who} te respondió`;
            case 'follow': return `${who} empezó a seguirte`;
            case 'mention': return `${who} te mencionó`;
            case 'repost': return `${who} republicó tu post`;
            case 'quote': return `${who} citó tu post`;
            case 'sale': return 'Vendiste desde tu post';
            case 'match': return `Hiciste match con ${who}`;
            case 'community_invite': return `${who} pidió unirse a tu comunidad`;
            case 'moderation': return 'Un admin actuó sobre tu contenido';
            default: return 'Nueva actividad';
        }
    };

    const handlePress = (item: any) => {
        if (item.type === 'match') {
            navigation.navigate('HybridProfile', { userId: item.actorUserId });
        } else if (item.targetType === 'post' && item.targetId) {
            navigation.navigate('PostDetail', { postId: item.targetId });
        } else if (item.type === 'follow' && item.actorUserId) {
            navigation.navigate('HybridProfile', { userId: item.actorUserId });
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft size={22} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Actividad</Text>
                <View style={{ width: 22 }} />
            </View>

            <View style={styles.tabs}>
                {(['all', 'mentions', 'sales'] as const).map((f) => (
                    <TouchableOpacity
                        key={f}
                        style={[styles.tab, filter === f && styles.tabActive]}
                        onPress={() => setFilter(f)}
                    >
                        <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>
                            {f === 'all' ? 'Todo' : f === 'mentions' ? 'Menciones' : 'Ventas'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {result === undefined ? (
                <ActivityIndicator style={{ marginTop: 40 }} color={colors(isDark).primary} />
            ) : items.length === 0 ? (
                <View style={styles.empty}>
                    <Bell size={40} color={isDark ? '#4B5563' : '#D1D5DB'} />
                    <Text style={styles.emptyText}>Todavía no tenés actividad</Text>
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item) => String(item._id)}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.row, !item.readAt && styles.rowUnread]}
                            onPress={() => handlePress(item)}
                        >
                            <Avatar style={styles.avatar}>
                                <AvatarImage src={item.actor?.avatar} />
                                <AvatarFallback>{(item.actor?.displayName ?? '?')[0]}</AvatarFallback>
                            </Avatar>
                            <View style={styles.rowIcon}>{iconFor(item.type)}</View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.rowText}>{labelFor(item)}</Text>
                                {item.preview ? (
                                    <Text style={styles.rowPreview} numberOfLines={1}>{item.preview}</Text>
                                ) : null}
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
        backBtn: { padding: 4 },
        headerTitle: { fontSize: 18, fontWeight: '700', color: isDark ? '#fff' : '#111827' },
        tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
        tab: {
            paddingVertical: 6,
            paddingHorizontal: 14,
            borderRadius: Radius.full ?? 999,
            backgroundColor: isDark ? '#18181B' : '#F3F4F6',
        },
        tabActive: { backgroundColor: colors(isDark).primary },
        tabText: { fontSize: 13, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },
        tabTextActive: { color: '#fff' },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: isDark ? '#27272A' : '#E5E7EB',
        },
        rowUnread: { backgroundColor: isDark ? 'rgba(37,99,235,0.08)' : 'rgba(37,99,235,0.05)' },
        avatar: { width: 40, height: 40 },
        rowIcon: { width: 24, alignItems: 'center' },
        rowText: { fontSize: 14, color: isDark ? '#fff' : '#111827', fontWeight: '500' },
        rowPreview: { fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280', marginTop: 2 },
        empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 100 },
        emptyText: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280' },
    });
