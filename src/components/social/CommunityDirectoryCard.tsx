/**
 * Fila de comunidad del directorio y de los resultados de búsqueda.
 *
 * Dos zonas táctiles distintas a propósito, como en X: la fila entera abre la
 * comunidad; el botón de la derecha ejecuta la acción (unirse / solicitar) sin
 * navegar. Mezclarlas obligaría a entrar para poder unirse.
 *
 * El ícono de privacidad no es decorativo: es lo que diferencia "entro y ya"
 * de "mando una solicitud y espero", y conviene saberlo ANTES de tocar.
 */
import { EyeOff, Globe, Lock } from 'lucide-react-native';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { createThemedStyles } from '../../theme/makeThemedStyles';
import { colors, Radius, Space, Type } from '../../theme/tokens';
import { glassSurface } from '../../utils/glass';

export type DirectoryCommunity = {
    _id: string;
    name: string;
    description?: string;
    coverImage?: string;
    memberCount?: number;
    topic?: string;
    visibility?: 'public' | 'private' | 'secret';
    joinPolicy?: 'open' | 'approval' | 'questionnaire' | 'invite';
};

/** Estado del viewer respecto de esta comunidad. */
export type MembershipState = 'none' | 'pending' | 'member';

function actionLabel(community: DirectoryCommunity, state: MembershipState): string {
    if (state === 'member') return 'Ver';
    if (state === 'pending') return 'Solicitado';
    // `approval` y `questionnaire` no dan acceso inmediato: prometer "Unirse"
    // y devolver una espera es peor que decirlo de entrada.
    return community.joinPolicy === 'open' ? 'Unirse' : 'Solicitar';
}

function formatMembers(n?: number): string {
    if (!n) return 'Sin miembros';
    if (n === 1) return '1 miembro';
    if (n < 1000) return `${n} miembros`;
    return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k miembros`;
}

export function CommunityDirectoryCard({
    community,
    membership = 'none',
    onPress,
    onAction,
}: {
    community: DirectoryCommunity;
    membership?: MembershipState;
    onPress: () => void;
    /** Sin esto no se dibuja el botón (ej. en listas de sólo lectura). */
    onAction?: () => void;
}) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const c = colors(isDark);

    const PrivacyIcon =
        community.visibility === 'secret' ? EyeOff : community.visibility === 'private' ? Lock : Globe;

    const meta = [formatMembers(community.memberCount), community.topic].filter(Boolean).join(' · ');
    const label = actionLabel(community, membership);
    const isPending = membership === 'pending';

    return (
        <Pressable
            onPress={onPress}
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={`${community.name}, ${meta}`}
        >
            {community.coverImage ? (
                <Image source={{ uri: community.coverImage }} style={styles.cover} />
            ) : (
                <View style={[styles.cover, styles.coverFallback]}>
                    <Text style={styles.coverInitial}>{community.name.charAt(0).toUpperCase()}</Text>
                </View>
            )}

            <View style={styles.info}>
                <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                        {community.name}
                    </Text>
                    <PrivacyIcon size={12} color={c.textSubtle} />
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                    {meta}
                </Text>
            </View>

            {onAction ? (
                <Pressable
                    onPress={onAction}
                    disabled={isPending}
                    style={[styles.action, isPending && styles.actionPending]}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} ${community.name}`}
                    hitSlop={8}
                >
                    <Text style={[styles.actionText, isPending && styles.actionTextPending]}>
                        {label}
                    </Text>
                </Pressable>
            ) : null}
        </Pressable>
    );
}

const getStyles = createThemedStyles((isDark, c) => ({
    row: {
        ...glassSurface(isDark, 'subtle'),
        flexDirection: 'row',
        alignItems: 'center',
        gap: Space[3],
        padding: Space[3],
        marginBottom: Space[2],
    },
    cover: {
        width: 48,
        height: 48,
        borderRadius: Radius.md,
        backgroundColor: c.surface2,
    },
    coverFallback: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    coverInitial: {
        ...Type.title,
        color: c.textMuted,
    },
    info: {
        flex: 1,
        minWidth: 0,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    name: {
        ...Type.bodySm,
        fontWeight: '700',
        color: c.text,
        flexShrink: 1,
    },
    meta: {
        ...Type.caption,
        fontWeight: '500',
        color: c.textMuted,
        marginTop: 2,
    },
    action: {
        height: 32,
        paddingHorizontal: Space[4],
        borderRadius: Radius.full,
        backgroundColor: c.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionPending: {
        backgroundColor: c.surface2,
        borderWidth: 1,
        borderColor: c.border,
    },
    actionText: {
        ...Type.caption,
        fontWeight: '800',
        color: '#FFF',
    },
    actionTextPending: {
        color: c.textMuted,
    },
}));
