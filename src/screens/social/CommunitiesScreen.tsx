/**
 * Directorio de comunidades.
 *
 * Pasó a ser SÓLO descubrimiento. Antes tenía dos pestañas — "Mis
 * comunidades" y "Descubrir" — pero la primera ya no tiene razón de estar
 * acá: las comunidades a las que pertenecés se leen en la tab "Comunidades"
 * del feed, y las fijadas tienen tab propia. Dejarla duplicada obligaba a
 * elegir dos veces dónde mirar lo mismo.
 *
 * Con el buscador vacío muestra recomendadas y temas (el estado en reposo es
 * la pantalla que más se ve); con término, resultados planos. Mismo contrato
 * de debounce que `UserSearch`: 250 ms y mínimo 2 caracteres, para no disparar
 * una búsqueda por tecla.
 */
import { ArrowLeft, Plus, Search, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { CommunityDirectoryCard } from '../../components/social/CommunityDirectoryCard';
import { CommunityTopicChips } from '../../components/social/CommunityTopicChips';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { useDebouncedSearchTerm } from '../../hooks/useDebounce';
import { useResponsive } from '../../hooks/useResponsive';
import { openCommunityJoin } from '../../navigation/openCommunityJoin';
import { createThemedStyles } from '../../theme/makeThemedStyles';
import { colors, Radius, Space, Touch, Type } from '../../theme/tokens';

const MIN_TERM_LENGTH = 2;

export default function CommunitiesScreen({ navigation, route }: any) {
    const insets = useSafeAreaInsets();
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const c = colors(isDark);
    const { show } = useToast();
    const { feedMaxWidth } = useResponsive();

    const [term, setTerm] = useState('');
    const [topic, setTopic] = useState<string | null>(null);
    const debouncedTerm = useDebouncedSearchTerm(term, 250);
    const searching = debouncedTerm.trim().length >= MIN_TERM_LENGTH;

    const results = useQuery(
        api.social.communities.searchCommunities,
        sessionToken
            ? {
                  sessionToken,
                  ...(searching ? { term: debouncedTerm.trim() } : {}),
                  ...(topic ? { topic } : {}),
                  limit: 30,
              }
            : 'skip',
    );
    const mine = useQuery(
        api.social.communities.listMyCommunities,
        sessionToken ? { sessionToken } : 'skip',
    );
    const joinCommunity = useMutation(api.social.communities.joinCommunity);

    // Los temas salen de lo que hay, no de una lista fija: una categoría vacía
    // en el directorio es una promesa incumplida.
    const topics = useMemo(() => {
        const seen = new Set<string>();
        for (const community of results ?? []) {
            if (community?.topic) seen.add(community.topic);
        }
        return Array.from(seen).sort();
    }, [results]);

    const myIds = useMemo(
        () => new Set((mine ?? []).map((m: any) => String(m._id))),
        [mine],
    );

    const openCommunity = (communityId: string) =>
        navigation.navigate('CommunityDetail', { communityId });

    const handleAction = async (community: any) => {
        const id = String(community._id);
        if (myIds.has(id)) {
            openCommunity(id);
            return;
        }
        // Abierta: se entra en el acto sin sacar a nadie del directorio. El
        // resto pasa por el modal, que sabe de cuestionario y aprobación.
        if (community.joinPolicy === 'open' && sessionToken) {
            try {
                await joinCommunity({ sessionToken, communityId: id as any });
                show(`Te uniste a ${community.name}`, 'success');
            } catch (e: any) {
                show(e?.data?.message || 'No se pudo unir', 'error');
            }
            return;
        }
        openCommunityJoin({ communityIdOrSlug: id });
    };

    /**
     * Un link corto `/i/{código}` no trae id de comunidad, así que
     * `getStateFromPath` abre esta pantalla de fondo y deja el token en los
     * params. Leerlos acá es lo que hace que el modal aparezca cuando la app
     * arranca DESDE el link: `useCommunityDeepLinkHandler` sólo ve la URL
     * cuando llega por `Linking`, y en un arranque en frío por navegación esa
     * ruta puede no dispararse. Sin esto el link abría el directorio y nada más.
     */
    const inviteToken = route?.params?.inviteToken;
    const inviteHandled = useRef(false);
    useEffect(() => {
        if (!inviteToken || inviteHandled.current) return;
        inviteHandled.current = true;
        openCommunityJoin({ inviteToken, referralCode: route?.params?.referralCode });
    }, [inviteToken, route?.params?.referralCode]);

    const loading = results === undefined;

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={[styles.header, styles.column, { maxWidth: feedMaxWidth, paddingTop: insets.top + Space[2] }]}>
                <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
                    <ArrowLeft size={22} color={c.text} />
                </Pressable>
                <Text style={styles.headerTitle}>Comunidades</Text>
                <Pressable
                    onPress={() => navigation.navigate('CreateCommunity')}
                    hitSlop={10}
                    style={styles.backBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Crear comunidad"
                >
                    <Plus size={22} color={c.primary} />
                </Pressable>
            </View>

            <View style={[styles.searchWrap, styles.column, { maxWidth: feedMaxWidth }]}>
                <Search size={16} color={c.textSubtle} />
                <TextInput
                    style={styles.searchInput}
                    value={term}
                    onChangeText={setTerm}
                    placeholder="Buscar comunidades"
                    placeholderTextColor={c.textSubtle}
                    autoCorrect={false}
                    returnKeyType="search"
                />
                {term.length > 0 ? (
                    <Pressable onPress={() => setTerm('')} hitSlop={8}>
                        <X size={16} color={c.textSubtle} />
                    </Pressable>
                ) : null}
            </View>

            {!searching && topics.length > 0 ? (
                <CommunityTopicChips topics={topics} selected={topic} onSelect={setTopic} />
            ) : null}

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={c.primary} />
                </View>
            ) : (
                <View style={[styles.listWrap, styles.column, { maxWidth: feedMaxWidth }]}>
                <FlashList
                    data={results ?? []}
                    keyExtractor={(item: any) => String(item._id)}
                    contentContainerStyle={{
                        paddingHorizontal: Space[4],
                        paddingBottom: insets.bottom + Space[8],
                    }}
                    ListHeaderComponent={
                        <Text style={styles.sectionLabel}>
                            {searching
                                ? 'Resultados'
                                : topic
                                  ? topic
                                  : 'Recomendadas'}
                        </Text>
                    }
                    renderItem={({ item }: any) => (
                        <CommunityDirectoryCard
                            community={item}
                            membership={myIds.has(String(item._id)) ? 'member' : 'none'}
                            onPress={() => openCommunity(String(item._id))}
                            onAction={() => handleAction(item)}
                        />
                    )}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Text style={styles.emptyTitle}>
                                {searching ? 'Sin resultados' : 'Todavía no hay comunidades'}
                            </Text>
                            <Text style={styles.emptyBody}>
                                {searching
                                    ? 'Probá con otro nombre.'
                                    : 'Creá la primera y empezá a juntar gente.'}
                            </Text>
                        </View>
                    }
                />
                </View>
            )}
        </KeyboardAvoidingView>
    );
}

const getStyles = createThemedStyles((isDark, c) => ({
    // `alignItems: 'center'` centra la columna cuando sobra ancho (escritorio);
    // en mobile `feedMaxWidth` es la pantalla y no cambia nada.
    container: { flex: 1, backgroundColor: c.bg, alignItems: 'center' },
    column: { width: '100%', alignSelf: 'center' },
    listWrap: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center', paddingTop: Space[10], gap: Space[1] },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Space[4],
        paddingBottom: Space[3],
    },
    backBtn: {
        width: Touch.min - 12,
        height: Touch.min - 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: { ...Type.title, color: c.text, flex: 1, textAlign: 'center' },
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Space[2],
        height: 40,
        marginHorizontal: Space[4],
        marginBottom: Space[3],
        paddingHorizontal: Space[3],
        borderRadius: Radius.full,
        backgroundColor: c.surface1,
        borderWidth: 1,
        borderColor: c.border,
    },
    searchInput: { ...Type.bodySm, flex: 1, color: c.text, padding: 0 },
    sectionLabel: {
        ...Type.caption,
        color: c.textSubtle,
        textTransform: 'uppercase',
        marginBottom: Space[2],
    },
    emptyTitle: { ...Type.title, color: c.text, textAlign: 'center' },
    emptyBody: { ...Type.bodySm, color: c.textMuted, textAlign: 'center' },
}));
