import React, { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MessageCircle, Users, ShoppingBag, Check, X } from 'lucide-react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { colors, Radius } from '../../theme/tokens';

type Tab = 'feed' | 'catalog' | 'members' | 'requests';

export default function CommunityDetailScreen({ route, navigation }: any) {
    const communityId = route?.params?.communityId;
    const insets = useSafeAreaInsets();
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const [tab, setTab] = useState<Tab>('feed');

    const community = useQuery(
        api.social.communities.getCommunity,
        sessionToken && communityId ? { sessionToken, communityId } : 'skip',
    );
    const feed = useQuery(
        api.social.communities.getCommunityFeed,
        sessionToken && communityId && tab === 'feed' ? { sessionToken, communityId, limit: 20 } : 'skip',
    );
    const catalog = useQuery(
        api.social.communities.listCommunityCatalog,
        sessionToken && communityId && tab === 'catalog' ? { sessionToken, communityId } : 'skip',
    );
    const members = useQuery(
        api.social.communities.listMembers,
        sessionToken && communityId && tab === 'members' ? { sessionToken, communityId } : 'skip',
    );
    const requests = useQuery(
        api.social.communities.listPendingRequests,
        sessionToken && communityId && tab === 'requests' && community?.myMembership?.role !== 'member'
            ? { sessionToken, communityId }
            : 'skip',
    );

    const joinCommunity = useMutation(api.social.communities.joinCommunity);
    const leaveCommunity = useMutation(api.social.communities.leaveCommunity);
    const approveMember = useMutation(api.social.communities.approveMember);
    const rejectMember = useMutation(api.social.communities.rejectMember);
    const getOrCreateChat = useMutation(api.social.communities.getOrCreateCommunityChat);

    const isMember = community?.myMembership?.status === 'active';
    const isAdmin = community?.myMembership?.role === 'owner' || community?.myMembership?.role === 'admin';

    const handleJoin = async () => {
        if (!sessionToken) return;
        try {
            const result = await joinCommunity({ sessionToken, communityId });
            show(result.status === 'pending' ? 'Solicitud enviada' : 'Te uniste a la comunidad', 'success');
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo unir', 'error');
        }
    };

    const handleOpenChat = async () => {
        if (!sessionToken) return;
        try {
            const chatId = await getOrCreateChat({ sessionToken, communityId });
            navigation.navigate('Chat', { chatId });
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo abrir el chat', 'error');
        }
    };

    const handleLeave = async () => {
        if (!sessionToken) return;
        try {
            await leaveCommunity({ sessionToken, communityId });
            show('Saliste de la comunidad', 'success');
            navigation.goBack();
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo salir de la comunidad', 'error');
        }
    };

    if (community === undefined) {
        return (
            <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
                <ActivityIndicator color={colors(isDark).primary} />
            </View>
        );
    }
    if (community === null) {
        return (
            <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
                <Text style={styles.emptyText}>Esta comunidad no existe o es privada.</Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <ArrowLeft size={22} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{community.name}</Text>
                {isMember ? (
                    <TouchableOpacity onPress={handleOpenChat} style={styles.iconBtn}>
                        <MessageCircle size={22} color={colors(isDark).primary} />
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 22 }} />
                )}
            </View>

            {!isMember && (
                <TouchableOpacity
                    style={styles.joinBtn}
                    onPress={handleJoin}
                    disabled={community.myMembership?.status === 'pending'}
                >
                    <Text style={styles.joinBtnText}>
                        {community.myMembership?.status === 'pending' ? 'Solicitud pendiente' : 'Unirse'}
                    </Text>
                </TouchableOpacity>
            )}
            {isMember && community.myMembership?.role !== 'owner' && (
                <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
                    <Text style={styles.leaveBtnText}>Salir de la comunidad</Text>
                </TouchableOpacity>
            )}

            <View style={styles.tabs}>
                {(['feed', 'catalog', 'members', ...(isAdmin ? ['requests' as const] : [])] as Tab[]).map((t) => (
                    <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
                        <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                            {t === 'feed' ? 'Feed' : t === 'catalog' ? 'Catálogo' : t === 'members' ? 'Miembros' : 'Solicitudes'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {tab === 'feed' && (
                !isMember ? (
                    <View style={styles.empty}><Text style={styles.emptyText}>Unite para ver el feed de la comunidad.</Text></View>
                ) : feed === undefined ? (
                    <ActivityIndicator style={{ marginTop: 24 }} color={colors(isDark).primary} />
                ) : (
                    <FlatList
                        data={feed.items}
                        keyExtractor={(item: any) => String(item._id)}
                        contentContainerStyle={{ padding: 16, gap: 12 }}
                        renderItem={({ item }: any) => (
                            <TouchableOpacity style={styles.postCard} onPress={() => navigation.navigate('PostDetail', { postId: item._id })}>
                                <Text style={styles.postText} numberOfLines={3}>{item.content}</Text>
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={<Text style={styles.emptyText}>Todavía no hay posts en esta comunidad.</Text>}
                    />
                )
            )}

            {tab === 'catalog' && (
                catalog === undefined ? (
                    <ActivityIndicator style={{ marginTop: 24 }} color={colors(isDark).primary} />
                ) : (
                    <FlatList
                        data={catalog}
                        keyExtractor={(item: any) => String(item._id)}
                        contentContainerStyle={{ padding: 16, gap: 12 }}
                        renderItem={({ item }: any) => (
                            <TouchableOpacity
                                style={styles.catalogRow}
                                onPress={() => navigation.navigate('ItemDetail', { listingId: item.listing._id })}
                            >
                                <ShoppingBag size={20} color={colors(isDark).primary} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.postText} numberOfLines={1}>{item.listing?.title}</Text>
                                    <Text style={styles.cardMeta}>${item.listing?.price}</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={<Text style={styles.emptyText}>Nadie agregó productos todavía.</Text>}
                    />
                )
            )}

            {tab === 'members' && (
                members === undefined ? (
                    <ActivityIndicator style={{ marginTop: 24 }} color={colors(isDark).primary} />
                ) : (
                    <FlatList
                        data={members}
                        keyExtractor={(item: any) => String(item._id)}
                        contentContainerStyle={{ padding: 16, gap: 8 }}
                        renderItem={({ item }: any) => (
                            <View style={styles.memberRow}>
                                <Avatar style={styles.avatar}>
                                    <AvatarImage src={item.user?.avatar} />
                                    <AvatarFallback>{(item.user?.displayName ?? '?')[0]}</AvatarFallback>
                                </Avatar>
                                <Text style={styles.postText}>{item.user?.displayName ?? item.userId}</Text>
                                {item.role !== 'member' && <Text style={styles.cardMeta}>{item.role}</Text>}
                            </View>
                        )}
                    />
                )
            )}

            {tab === 'requests' && isAdmin && (
                requests === undefined ? (
                    <ActivityIndicator style={{ marginTop: 24 }} color={colors(isDark).primary} />
                ) : (
                    <FlatList
                        data={requests}
                        keyExtractor={(item: any) => String(item._id)}
                        contentContainerStyle={{ padding: 16, gap: 8 }}
                        renderItem={({ item }: any) => (
                            <View style={styles.memberRow}>
                                <Avatar style={styles.avatar}>
                                    <AvatarImage src={item.user?.avatar} />
                                    <AvatarFallback>{(item.user?.displayName ?? '?')[0]}</AvatarFallback>
                                </Avatar>
                                <Text style={[styles.postText, { flex: 1 }]}>{item.user?.displayName ?? item.userId}</Text>
                                <TouchableOpacity
                                    style={styles.approveBtn}
                                    onPress={() => sessionToken && approveMember({ sessionToken, communityId, userId: item.userId })}
                                >
                                    <Check size={16} color="#10B981" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.approveBtn}
                                    onPress={() => sessionToken && rejectMember({ sessionToken, communityId, userId: item.userId })}
                                >
                                    <X size={16} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        )}
                        ListEmptyComponent={<Text style={styles.emptyText}>No hay solicitudes pendientes.</Text>}
                    />
                )
            )}
        </View>
    );
}

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: isDark ? '#000' : '#fff' },
        center: { alignItems: 'center', justifyContent: 'center' },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
        iconBtn: { padding: 4 },
        headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: isDark ? '#fff' : '#111827' },
        joinBtn: { marginHorizontal: 16, marginBottom: 8, backgroundColor: colors(isDark).primary, borderRadius: Radius.md, paddingVertical: 10, alignItems: 'center' },
        joinBtnText: { color: '#fff', fontWeight: '700' },
        leaveBtn: { marginHorizontal: 16, marginBottom: 8, alignItems: 'center', paddingVertical: 6 },
        leaveBtnText: { color: '#EF4444', fontWeight: '600', fontSize: 13 },
        tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
        tab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.full ?? 999, backgroundColor: isDark ? '#18181B' : '#F3F4F6' },
        tabActive: { backgroundColor: colors(isDark).primary },
        tabText: { fontSize: 12, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },
        tabTextActive: { color: '#fff' },
        postCard: { padding: 14, borderRadius: Radius.md, backgroundColor: isDark ? '#18181B' : '#F9FAFB', borderWidth: 1, borderColor: isDark ? '#27272A' : '#E5E7EB' },
        postText: { fontSize: 14, color: isDark ? '#fff' : '#111827' },
        catalogRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius.md, backgroundColor: isDark ? '#18181B' : '#F9FAFB' },
        cardMeta: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280' },
        memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
        avatar: { width: 36, height: 36 },
        approveBtn: { padding: 6, borderRadius: Radius.full ?? 999, backgroundColor: isDark ? '#27272A' : '#F3F4F6' },
        empty: { paddingTop: 40, alignItems: 'center' },
        emptyText: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', paddingHorizontal: 40 },
    });
