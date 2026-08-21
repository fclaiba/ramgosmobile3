import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Link2 } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius } from '../../theme/tokens';

const URL_RE = /https?:\/\/[^\s]+/;

/**
 * Card de preview de link (Fase 5 del gap analysis, 0% antes de esto). El
 * fetch de metadata OG corre server-side y en background al publicar
 * (`convex/social/linkPreview.ts`, disparado desde `createPost`) — este
 * componente sólo LEE el caché; si todavía no llegó o el sitio no tenía
 * metadata OG, no renderiza nada (no hay estado de carga visible, para no
 * meter un spinner en cada post que tenga un link).
 */
export const LinkPreviewCard = ({ content }: { content?: string }) => {
    const url = content?.match(URL_RE)?.[0];
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    const preview = useQuery(api.social.linkPreview.getLinkPreview, url ? { url } : 'skip');

    if (!url || !preview || preview.status !== 'ok' || (!preview.title && !preview.imageUrl)) {
        return null;
    }

    let hostname = '';
    try {
        hostname = new URL(url).hostname.replace(/^www\./, '');
    } catch {
        // URL rara que igual pasó el fetch — mostramos el link crudo.
        hostname = url;
    }

    return (
        <TouchableOpacity
            style={[styles.card, { borderColor: c.border, backgroundColor: c.surface1 }]}
            onPress={() => Linking.openURL(url)}
            activeOpacity={0.8}
            accessibilityRole="link"
            accessibilityLabel={preview.title ?? hostname}
        >
            {preview.imageUrl ? (
                <Image source={{ uri: preview.imageUrl }} style={styles.image} />
            ) : (
                <View style={[styles.image, styles.imagePlaceholder]}>
                    <Link2 size={20} color="#9CA3AF" />
                </View>
            )}
            <View style={styles.info}>
                {preview.title ? (
                    <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
                        {preview.title}
                    </Text>
                ) : null}
                {preview.description ? (
                    <Text style={[styles.desc, { color: c.textMuted }]} numberOfLines={2}>
                        {preview.description}
                    </Text>
                ) : null}
                <Text style={styles.site} numberOfLines={1}>
                    {preview.siteName || hostname}
                </Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
        marginTop: 8,
        marginBottom: 4,
    },
    image: { width: 84, height: 84 },
    imagePlaceholder: {
        backgroundColor: 'rgba(156,163,175,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    info: { flex: 1, padding: 10, justifyContent: 'center', gap: 2 },
    title: { fontSize: 13, fontWeight: '700' },
    desc: { fontSize: 12 },
    site: { fontSize: 11, color: '#9CA3AF', marginTop: 2, textTransform: 'uppercase' },
});
