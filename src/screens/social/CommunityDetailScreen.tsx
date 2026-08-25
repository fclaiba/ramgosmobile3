import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MessageCircle, ShoppingBag, Check, X, Plus, Video, Pin, PinOff, Info, Settings } from 'lucide-react-native';
import { openCommunityJoin } from '../../navigation/openCommunityJoin';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { colors, Radius } from '../../theme/tokens';
import { UnifiedFeed } from '../../components/social/UnifiedFeed';
import { LoopFeed } from '../../components/social/LoopFeed';
import { InlineComposer } from '../../components/social/InlineComposer';
import { openUserProfile } from '../../navigation/openUserProfile';

type Tab = 'feed' | 'loops' | 'catalog' | 'members' | 'requests';

export default function CommunityDetailScreen({ route, navigation }: any) {
    const communityId = route?.params?.communityId;
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const [tab, setTab] = useState<Tab>('feed');
    const [showComposer, setShowComposer] = useState(false);
    const [showRules, setShowRules] = useState(false);

    const community = useQuery(
        api.social.communities.getCommunity,
        sessionToken && communityId ? { sessionToken, communityId } : 'skip',
    );
    const loopsFeed = useQuery(
        api.social.communities.getCommunityFeed,
        sessionToken && communityId && tab === 'loops' ? { sessionToken, communityId, type: 'video', limit: 30 } : 'skip',
    );
    // `getCommunity` devuelve una ficha REDUCIDA (`isPreview`) cuando la
    // comunidad es privada y el viewer todavía no es miembro: ahí no hay post
    // fijado que mostrar, sólo lo justo para decidir si solicitar entrar.
    const pinnedPostId = community && !community.isPreview ? community.pinnedPostId : undefined;
    const pinnedPost = useQuery(
        api.social.getPostById,
        sessionToken && pinnedPostId ? { sessionToken, postId: pinnedPostId } : 'skip',
    );
    const catalog = useQuery(
        api.social.communities.listCommunityCatalog,
        sessionToken && communityId && tab === 'catalog' ? { sessionToken, communityId } : 'skip',
    );
    const members = useQuery(
        api.social.communities.listMembers,
        sessionToken && communityId && tab === 'members' ? { sessionToken, communityId } : 'skip',
    );
    // `listJoinRequests` en vez de `listPendingRequests`: trae las RESPUESTAS
    // del cuestionario junto a cada solicitud, que es lo que el admin necesita
    // para decidir. La otra sólo devolvía filas de membresía sin contexto.
    const requests = useQuery(
        api.social.communityAccess.listJoinRequests,
        sessionToken && communityId && tab === 'requests' && community?.myMembership?.role !== 'member'
            ? { sessionToken, communityId }
            : 'skip',
    );

    const leaveCommunity = useMutation(api.social.communities.leaveCommunity);
    // `decideJoinRequest` es idempotente y cierra membresía + solicitud a la
    // vez; `approveMember`/`rejectMember` sólo tocaban la membresía y dejaban
    // la solicitud colgada en `pending` para siempre.
    const decideJoinRequest = useMutation(api.social.communityAccess.decideJoinRequest);
    const getOrCreateChat = useMutation(api.social.communities.getOrCreateCommunityChat);
    const unpinCommunityPost = useMutation(api.social.communities.unpinCommunityPost);

    const isMember = community?.myMembership?.status === 'active';
    const isAdmin = community?.myMembership?.role === 'owner' || community?.myMembership?.role === 'admin';

    // Debajo de header + botón unirse/salir + tabs — el paging de LoopFeed
    // necesita el alto REAL de su contenedor, no el de la pantalla entera
    // (ver comentario en `LoopFeed.tsx`).
    const loopsContainerHeight = Math.max(200, windowHeight - insets.top - 180);

    /**
     * Ingresar pasa por el modal compartido en vez de llamar `joinCommunity`
     * directo: es el único que sabe manejar cuestionario, invitación y
     * aprobación. Llamar la mutation acá funcionaba sólo para comunidades
     * abiertas y tiraba error en el resto.
     */
    const handleJoin = () => {
        openCommunityJoin({
            communityIdOrSlug: communityId,
            inviteToken: route?.params?.inviteToken,
            referralCode: route?.params?.referralCode,
        });
    };

    /**
     * Con `inviteToken` en los params, el link entró por la navegación normal
     * (`getStateFromPath`) y no por el handler, que sólo intercepta cuando la
     * app ya estaba abierta. Se abre el modal una sola vez.
     */
    const inviteToken = route?.params?.inviteToken;
    const inviteHandled = useRef(false);
    useEffect(() => {
        if (!inviteToken || inviteHandled.current) return;
        inviteHandled.current = true;
        openCommunityJoin({
            communityIdOrSlug: communityId,
            inviteToken,
            referralCode: route?.params?.referralCode,
        });
    }, [inviteToken, communityId, route?.params?.referralCode]);

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

    const handleUnpin = async () => {
        if (!sessionToken) return;
        try {
            await unpinCommunityPost({ sessionToken, communityId });
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo desfijar', 'error');
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
                <View style={{ flexDirection: 'row', gap: 4 }}>
                    {Boolean(community.rules?.length) && (
                        <TouchableOpacity onPress={() => setShowRules(true)} style={styles.iconBtn}>
                            <Info size={20} color={isDark ? '#fff' : '#111827'} />
                        </TouchableOpacity>
                    )}
                    {isAdmin && (
                        <TouchableOpacity
                            onPress={() => navigation.navigate('CommunitySettings', { communityId })}
                            style={styles.iconBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Ajustes de la comunidad"
                        >
                            <Settings size={20} color={isDark ? '#fff' : '#111827'} />
                        </TouchableOpacity>
                    )}
                    {isMember ? (
                        <TouchableOpacity onPress={handleOpenChat} style={styles.iconBtn}>
                            <MessageCircle size={22} color={colors(isDark).primary} />
                        </TouchableOpacity>
                    ) : (
                        <View style={{ width: 22 }} />
                    )}
                </View>
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
                {(['feed', 'loops', 'catalog', 'members', ...(isAdmin ? ['requests' as const] : [])] as Tab[]).map((t) => (
                    <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
                        <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                            {t === 'feed' ? 'Feed' : t === 'loops' ? 'Loops' : t === 'catalog' ? 'Catálogo' : t === 'members' ? 'Miembros' : 'Solicitudes'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {tab === 'feed' && (
                !isMember ? (
                    <View style={styles.empty}><Text style={styles.emptyText}>Unite para ver el feed de la comunidad.</Text></View>
                ) : (
                    <View style={{ flex: 1 }}>
                        {pinnedPost && (
                            <View style={styles.pinnedWrap}>
                                <View style={styles.pinnedHeaderRow}>
                                    <Pin size={14} color={colors(isDark).primary} />
                                    <Text style={styles.pinnedLabel}>Fijado</Text>
                                    {isAdmin && (
                                        <TouchableOpacity onPress={handleUnpin} style={{ marginLeft: 'auto' }}>
                                            <PinOff size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <TouchableOpacity onPress={() => navigation.navigate('PostDetail', { postId: pinnedPost._id })}>
                                    <Text style={styles.postText} numberOfLines={3}>{pinnedPost.content}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {/* Pantalla apilada: no vive bajo la tab bar global, así que
                        sólo reserva el gesture bar del dispositivo. */}
                    <UnifiedFeed
                        communityId={String(communityId)}
                        canModerate={isAdmin}
                        contentBottomInset={insets.bottom}
                    />
                    </View>
                )
            )}

            {tab === 'loops' && (
                !isMember ? (
                    <View style={styles.empty}><Text style={styles.emptyText}>Unite para ver los Loops de la comunidad.</Text></View>
                ) : loopsFeed === undefined ? (
                    <ActivityIndicator style={{ marginTop: 24 }} color={colors(isDark).primary} />
                ) : loopsFeed.items.length === 0 ? (
                    <View style={styles.empty}><Text style={styles.emptyText}>Todavía no hay Loops en esta comunidad.</Text></View>
                ) : (
                    <View style={{ height: loopsContainerHeight }}>
                        <LoopFeed
                            posts={loopsFeed.items}
                            onUserClick={(userId) => openUserProfile(navigation, userId)}
                            itemHeight={loopsContainerHeight}
                        bottomInset={insets.bottom}
                        />
                    </View>
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
                            <TouchableOpacity
                                style={styles.memberRow}
                                activeOpacity={0.7}
                                onPress={() => openUserProfile(navigation, item.userId)}
                                accessibilityRole="button"
                                accessibilityLabel={`Ver el perfil de ${item.user?.displayName ?? 'este miembro'}`}
                            >
                                <Avatar style={styles.avatar}>
                                    <AvatarImage src={item.user?.avatar} />
                                    <AvatarFallback>{(item.user?.displayName ?? '?')[0]}</AvatarFallback>
                                </Avatar>
                                <Text style={styles.postText}>{item.user?.displayName ?? item.userId}</Text>
                                {item.role !== 'member' && <Text style={styles.cardMeta}>{item.role}</Text>}
                            </TouchableOpacity>
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
                            <View style={styles.requestCard}>
                                <View style={styles.memberRow}>
                                    <TouchableOpacity
                                        onPress={() => openUserProfile(navigation, item.userId)}
                                        activeOpacity={0.7}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Ver el perfil de ${item.user?.displayName ?? 'este usuario'}`}
                                    >
                                        <Avatar style={styles.avatar}>
                                            <AvatarImage src={item.user?.avatar} />
                                            <AvatarFallback>{(item.user?.displayName ?? '?')[0]}</AvatarFallback>
                                        </Avatar>
                                    </TouchableOpacity>
                                    <Text
                                        style={[styles.postText, { flex: 1 }]}
                                        onPress={() => openUserProfile(navigation, item.userId)}
                                        suppressHighlighting
                                    >
                                        {item.user?.displayName ?? item.userId}
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.approveBtn}
                                        onPress={() =>
                                            sessionToken &&
                                            decideJoinRequest({ sessionToken, requestId: item._id, approve: true })
                                        }
                                        accessibilityRole="button"
                                        accessibilityLabel="Aprobar solicitud"
                                    >
                                        <Check size={16} color="#10B981" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.approveBtn}
                                        onPress={() =>
                                            sessionToken &&
                                            decideJoinRequest({ sessionToken, requestId: item._id, approve: false })
                                        }
                                        accessibilityRole="button"
                                        accessibilityLabel="Rechazar solicitud"
                                    >
                                        <X size={16} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>

                                {/* Las respuestas guardan su propio enunciado, así
                                    que siguen siendo legibles aunque el admin haya
                                    editado el cuestionario después. */}
                                {(item.answers ?? []).length > 0 && (
                                    <View style={styles.answers}>
                                        {(item.answers ?? []).map((a: any, i: number) => (
                                            <View key={`${a.questionId}-${i}`} style={styles.answer}>
                                                <Text style={styles.answerPrompt}>{a.prompt}</Text>
                                                <Text style={styles.answerValue}>
                                                    {a.value?.trim()
                                                        ? a.value
                                                        : (a.optionIds ?? []).length
                                                          ? `${(a.optionIds ?? []).length} opción(es) elegida(s)`
                                                          : '—'}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}
                        ListEmptyComponent={<Text style={styles.emptyText}>No hay solicitudes pendientes.</Text>}
                    />
                )
            )}

            {/* B1: puntos de entrada para postear DENTRO de la comunidad — hoy
                no existía ninguno en ningún lado de la app. */}
            {isMember && (tab === 'feed' || tab === 'loops') && (
                <View style={styles.fabRow}>
                    <TouchableOpacity
                        style={[styles.fab, { backgroundColor: colors(isDark).primary }]}
                        onPress={() => navigation.navigate('CreateReel', { communityId: String(communityId), communityName: community.name })}
                        accessibilityLabel="Grabar Loop"
                    >
                        <Video size={22} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.fab, { backgroundColor: colors(isDark).primary }]}
                        onPress={() => setShowComposer(true)}
                        accessibilityLabel="Postear"
                    >
                        <Plus size={24} color="#fff" />
                    </TouchableOpacity>
                </View>
            )}

            <Modal visible={showComposer} animationType="slide" transparent onRequestClose={() => setShowComposer(false)}>
                <View style={styles.composerOverlay}>
                    <View style={{ marginTop: insets.top + 40, paddingHorizontal: 16 }}>
                        <View style={styles.composerCloseRow}>
                            <TouchableOpacity onPress={() => setShowComposer(false)}>
                                <X size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>
                        <InlineComposer
                            communityId={String(communityId)}
                            communityName={community.name}
                            onPostCreated={() => setShowComposer(false)}
                        />
                    </View>
                </View>
            </Modal>

            <Modal visible={showRules} animationType="fade" transparent onRequestClose={() => setShowRules(false)}>
                <View style={styles.composerOverlay}>
                    <View style={styles.rulesCard}>
                        <Text style={styles.rulesTitle}>Reglas de la comunidad</Text>
                        {(community.rules ?? []).map((r: string, i: number) => (
                            <Text key={i} style={styles.rulesItem}>{i + 1}. {r}</Text>
                        ))}
                        <TouchableOpacity style={styles.approveBtn} onPress={() => setShowRules(false)}>
                            <Text style={{ color: isDark ? '#fff' : '#111827', fontWeight: '700' }}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
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
        postText: { fontSize: 14, color: isDark ? '#fff' : '#111827' },
        catalogRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius.md, backgroundColor: isDark ? '#18181B' : '#F9FAFB' },
        cardMeta: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280' },
        memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
        avatar: { width: 36, height: 36 },
        approveBtn: { padding: 6, borderRadius: Radius.full ?? 999, backgroundColor: isDark ? '#27272A' : '#F3F4F6', alignItems: 'center' },
        requestCard: {
            padding: 12,
            borderRadius: Radius.lg,
            backgroundColor: isDark ? '#18181B' : '#F9FAFB',
            borderWidth: 1,
            borderColor: isDark ? '#27272A' : '#E5E7EB',
        },
        answers: { marginTop: 10, gap: 8 },
        answer: {
            paddingLeft: 10,
            borderLeftWidth: 2,
            borderLeftColor: colors(isDark).primaryMuted,
        },
        answerPrompt: { fontSize: 11, fontWeight: '700', color: isDark ? '#A1A1AA' : '#71717A' },
        answerValue: { fontSize: 13, color: isDark ? '#D4D4D8' : '#3F3F46', marginTop: 2 },
        empty: { paddingTop: 40, alignItems: 'center' },
        emptyText: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', paddingHorizontal: 40 },
        pinnedWrap: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: Radius.md, backgroundColor: isDark ? '#18181B' : '#F9FAFB', borderWidth: 1, borderColor: isDark ? '#27272A' : '#E5E7EB' },
        pinnedHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
        pinnedLabel: { fontSize: 12, fontWeight: '700', color: colors(isDark).primary },
        fabRow: { position: 'absolute', right: 16, bottom: 24, gap: 12 },
        fab: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
        composerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
        composerCloseRow: { alignItems: 'flex-end', marginBottom: 8 },
        rulesCard: { margin: 24, marginTop: 'auto', marginBottom: 'auto', padding: 20, borderRadius: Radius.lg, backgroundColor: isDark ? '#18181B' : '#fff', gap: 10 },
        rulesTitle: { fontSize: 16, fontWeight: '700', color: isDark ? '#fff' : '#111827', marginBottom: 4 },
        rulesItem: { fontSize: 14, color: isDark ? '#D1D5DB' : '#374151', lineHeight: 20 },
    });
