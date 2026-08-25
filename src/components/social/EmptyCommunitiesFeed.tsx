/**
 * Estado vacío de la tab "Comunidades".
 *
 * Es la primera pantalla que ve casi todo el mundo al abrir la tab, porque
 * nadie pertenece a ninguna comunidad todavía. Así que no dice "no hay nada":
 * muestra comunidades reales para entrar y una salida al directorio.
 */
import { Users2 } from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { createThemedStyles } from '../../theme/makeThemedStyles';
import { colors, Radius, Space, Touch, Type } from '../../theme/tokens';
import { CommunityDirectoryCard } from './CommunityDirectoryCard';

export function EmptyCommunitiesFeed({
    onOpenDirectory,
    onOpenCommunity,
}: {
    onOpenDirectory: () => void;
    onOpenCommunity: (communityId: string) => void;
}) {
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const c = colors(isDark);

    const suggestions = useQuery(
        api.social.communities.searchCommunities,
        sessionToken ? { sessionToken, limit: 3 } : 'skip',
    );

    return (
        <View style={styles.container}>
            <View style={styles.icon}>
                <Users2 size={28} color={c.primary} />
            </View>
            <Text style={styles.title}>Todavía no estás en ninguna comunidad</Text>
            <Text style={styles.subtitle}>
                Las comunidades son espacios por tema. Lo que se publica adentro aparece acá.
            </Text>

            {(suggestions ?? []).length > 0 ? (
                <View style={styles.suggestions}>
                    <Text style={styles.sectionLabel}>Para empezar</Text>
                    {(suggestions ?? []).map((community: any) => (
                        <CommunityDirectoryCard
                            key={String(community._id)}
                            community={community}
                            onPress={() => onOpenCommunity(String(community._id))}
                        />
                    ))}
                </View>
            ) : null}

            <Pressable
                onPress={onOpenDirectory}
                style={styles.cta}
                accessibilityRole="button"
                accessibilityLabel="Explorar comunidades"
            >
                <Text style={styles.ctaText}>Explorar comunidades</Text>
            </Pressable>
        </View>
    );
}

const getStyles = createThemedStyles((isDark, c) => ({
    container: {
        paddingHorizontal: Space[4],
        paddingTop: Space[10],
        paddingBottom: Space[8],
        alignItems: 'center',
    },
    icon: {
        width: 64,
        height: 64,
        borderRadius: Radius.full,
        backgroundColor: c.primaryMuted,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Space[4],
    },
    title: {
        ...Type.title,
        color: c.text,
        textAlign: 'center',
    },
    subtitle: {
        ...Type.bodySm,
        color: c.textMuted,
        textAlign: 'center',
        marginTop: Space[2],
        marginBottom: Space[6],
    },
    suggestions: {
        alignSelf: 'stretch',
        marginBottom: Space[6],
    },
    sectionLabel: {
        ...Type.caption,
        color: c.textSubtle,
        textTransform: 'uppercase',
        marginBottom: Space[2],
    },
    cta: {
        height: Touch.min,
        paddingHorizontal: Space[6],
        borderRadius: Radius.full,
        backgroundColor: c.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaText: {
        ...Type.bodySm,
        fontWeight: '800',
        color: '#FFF',
    },
}));
