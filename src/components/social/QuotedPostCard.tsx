import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { ImageOff, PlayCircle } from 'lucide-react-native';
import { Id } from '../../../convex/_generated/dataModel';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/formatters';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';

/**
 * Shape reducido que devuelve `decoratePosts` en `quotedPost` — a propósito
 * NO tiene `quotedPost` propio, y eso es lo que corta la recursión de una
 * cita de una cita de forma estructural, sin contadores de profundidad.
 */
export interface QuotedPost {
    _id: Id<'socialPosts'>;
    authorUserId: string;
    type: 'text' | 'image' | 'video' | 'poll' | 'commercial';
    content: string;
    images?: string[];
    imageAlts?: string[];
    videoUrl?: string;
    createdAt: string;
    likeCount: number;
    commentCount: number;
    retweetCount: number;
    isRetweetedByMe?: boolean;
    author?: {
        username?: string | null;
        displayName?: string | null;
        avatar?: string | null;
    } | null;
}

/**
 * Vista previa embebida del post citado, dentro de una cita.
 *
 * Es una PREVIEW, no un post interactivo: sin barra de acciones, texto a 3
 * líneas y media en una caja apaisada fija — dentro de una cita no querés
 * que una foto vertical se coma la pantalla. Tampoco monta un reproductor
 * de video: multiplicaría los players por celda del feed.
 */
export const QuotedPostCard = React.memo(({
    quoted,
    onPress,
    onUserPress,
}: {
    quoted: QuotedPost | null;
    onPress?: (postId: string) => void;
    /** Tocar el autor abre su perfil; tocar el resto abre el post citado. */
    onUserPress?: (userId: string) => void;
}) => {
    const isDark = useTheme().colorScheme === 'dark';
    const c = colors(isDark);
    const styles = getStyles(isDark);

    if (!quoted) {
        return (
            <View style={[styles.card, styles.cardUnavailable]}>
                <ImageOff size={15} color={c.textSubtle} />
                <Text style={styles.unavailableText}>Esta publicación ya no está disponible</Text>
            </View>
        );
    }

    const name = quoted.author?.displayName || quoted.author?.username || 'Usuario';
    const thumb = quoted.images?.[0];
    const openAuthorProfile =
        onUserPress && quoted.authorUserId
            ? () => onUserPress(String(quoted.authorUserId))
            : undefined;

    return (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.75}
            disabled={!onPress}
            onPress={() => onPress?.(String(quoted._id))}
            accessibilityRole="button"
            accessibilityLabel={`Ver publicación de ${name}`}
        >
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={openAuthorProfile}
                    disabled={!openAuthorProfile}
                    activeOpacity={0.7}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver el perfil de ${name}`}
                >
                    <Avatar size="sm" style={styles.avatar}>
                        {quoted.author?.avatar ? <AvatarImage src={quoted.author.avatar} /> : null}
                        <AvatarFallback size="sm">{name[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                </TouchableOpacity>
                <Text style={styles.name} numberOfLines={1}>
                    <Text onPress={openAuthorProfile} suppressHighlighting>{name}</Text>
                    {quoted.author?.username ? (
                        <Text style={styles.handle}> @{quoted.author.username}</Text>
                    ) : null}
                    <Text style={styles.handle}>{'  '}·{'  '}{formatRelativeTime(quoted.createdAt)}</Text>
                </Text>
            </View>

            {quoted.content ? (
                <Text style={styles.content} numberOfLines={3}>
                    {quoted.content}
                </Text>
            ) : null}

            {thumb ? (
                <View style={styles.media}>
                    <Image source={{ uri: thumb }} style={styles.mediaImage} resizeMode="cover" />
                </View>
            ) : quoted.videoUrl ? (
                <View style={[styles.media, styles.mediaVideo]}>
                    <PlayCircle size={26} color={c.textMuted} />
                    <Text style={styles.mediaVideoText}>Video</Text>
                </View>
            ) : null}
        </TouchableOpacity>
    );
});

QuotedPostCard.displayName = 'QuotedPostCard';

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        card: {
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.border,
            borderRadius: Radius.md,
            padding: 10,
            marginBottom: 12,
            backgroundColor: c.surface1,
        },
        cardUnavailable: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderStyle: 'dashed',
        },
        unavailableText: {
            flex: 1,
            fontSize: 13,
            fontWeight: '500',
            color: c.textSubtle,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 4,
        },
        avatar: { marginRight: 8 },
        name: {
            flex: 1,
            fontSize: 13,
            fontWeight: '700',
            color: c.text,
        },
        handle: {
            fontWeight: '500',
            color: c.textMuted,
        },
        content: {
            fontSize: 14,
            lineHeight: 19,
            color: c.textSecondary,
        },
        media: {
            marginTop: 8,
            width: '100%',
            aspectRatio: 16 / 9,
            borderRadius: Radius.sm,
            overflow: 'hidden',
            backgroundColor: c.surface2,
        },
        mediaImage: { width: '100%', height: '100%' },
        mediaVideo: {
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
        },
        mediaVideoText: {
            fontSize: 12,
            fontWeight: '600',
            color: c.textMuted,
        },
    });
};
