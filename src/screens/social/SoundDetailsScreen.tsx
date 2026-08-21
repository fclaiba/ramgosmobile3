import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    FlatList,
    Dimensions,
} from 'react-native';
import { ArrowLeft, Music2 } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius } from '../../theme/tokens';
import { glassSurface } from '../../utils/glass';
import { formatCompactCount } from '../../utils/formatCompactCount';

const { width } = Dimensions.get('window');
const GRID_IMG_SIZE = width / 3;

/**
 * Tile de la grilla — dueño de su propio `useVideoPlayer` (no se puede
 * llamar un hook dentro de `renderItem` directamente). Muestra el primer
 * frame en pausa, mismo look que un poster estático, sin decodificar todo
 * el clip.
 */
const SoundGridTile = ({ item, onPress }: { item: any; onPress: () => void }) => {
    const player = useVideoPlayer(item.videoUrl || '', (p) => {
        p.pause();
    });

    return (
        <TouchableOpacity style={styles.gridItem} activeOpacity={0.85} onPress={onPress}>
            <VideoView
                style={StyleSheet.absoluteFill}
                player={player}
                contentFit="cover"
                nativeControls={false}
                pointerEvents="none"
            />
        </TouchableOpacity>
    );
};

export default function SoundDetailsScreen({ route, navigation }: any) {
    const { trackId } = route.params;
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const insets = useSafeAreaInsets();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    const track = useQuery(
        api.social.audio.getAudioTrack,
        sessionToken ? { sessionToken, trackId } : 'skip',
    );

    const [cursor, setCursor] = useState<string | undefined>(undefined);
    const [pages, setPages] = useState<Array<{ cursor: string; items: any[] }>>([]);

    const page = useQuery(
        api.social.audio.getPostsByAudioTrack,
        sessionToken ? { sessionToken, trackId, cursor, limit: 30 } : 'skip',
    );

    useEffect(() => {
        setCursor(undefined);
        setPages([]);
    }, [trackId, sessionToken]);

    useEffect(() => {
        if (!page) return;
        const pageCursor = cursor || 'first';
        setPages((prev) =>
            prev.some((p) => p.cursor === pageCursor) ? prev : [...prev, { cursor: pageCursor, items: page.items }],
        );
    }, [page, cursor]);

    const posts = useMemo(() => {
        const seen = new Set<string>();
        return pages
            .flatMap((p) => p.items)
            .filter((item) => {
                const id = String(item?._id ?? '');
                if (!id || seen.has(id)) return false;
                seen.add(id);
                return true;
            });
    }, [pages]);

    const loadMore = useCallback(() => {
        if (!page?.nextCursor || page.nextCursor === cursor) return;
        setCursor(page.nextCursor);
    }, [page, cursor]);

    const handleUseSound = () => {
        navigation.navigate('CreateReel', {
            audioTrackId: trackId,
            audioUrl: track?.audioUrl,
        });
    };

    return (
        <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Volver">
                    <ArrowLeft size={24} color={c.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: c.text }]}>Sonido</Text>
            </View>

            {track === undefined ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={c.primary} />
                </View>
            ) : track === null ? (
                <View style={styles.center}>
                    <Text style={{ color: c.textSecondary, fontSize: 16, textAlign: 'center' }}>
                        Este sonido ya no existe.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={posts}
                    keyExtractor={(item) => String(item._id)}
                    numColumns={3}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.5}
                    contentContainerStyle={styles.gridContent}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                        <SoundGridTile
                            item={item}
                            onPress={() => navigation.navigate('PostDetail', { postId: item._id })}
                        />
                    )}
                    ListHeaderComponent={
                        <View style={[styles.trackHeader, glassSurface(isDark, 'regular')]}>
                            <View style={styles.trackIconWrap}>
                                <Music2 size={28} color={c.primary} />
                            </View>
                            <Text style={[styles.trackName, { color: c.text }]} numberOfLines={2}>
                                {track.name}
                            </Text>
                            {track.authorUsername && (
                                <Text style={[styles.trackAuthor, { color: c.textSecondary }]}>
                                    @{track.authorUsername}
                                </Text>
                            )}
                            <Text style={[styles.trackUsage, { color: c.textSecondary }]}>
                                {formatCompactCount(track.usageCount)} video{track.usageCount === 1 ? '' : 's'}
                            </Text>
                            <TouchableOpacity
                                style={[styles.useSoundBtn, { backgroundColor: c.primary }]}
                                onPress={handleUseSound}
                                accessibilityRole="button"
                                accessibilityLabel="Usar este sonido"
                            >
                                <Text style={styles.useSoundText}>Usar este sonido</Text>
                            </TouchableOpacity>
                        </View>
                    }
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Text style={{ color: c.textSecondary, fontSize: 15 }}>
                                Todavía no hay videos con este sonido.
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(150,150,150,0.2)',
    },
    backBtn: { padding: 4, marginRight: 16 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    gridContent: { paddingBottom: 100 },
    trackHeader: {
        margin: 16,
        padding: 20,
        alignItems: 'center',
        gap: 4,
    },
    trackIconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(150,150,150,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    trackName: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
    trackAuthor: { fontSize: 14 },
    trackUsage: { fontSize: 13, marginBottom: 12 },
    useSoundBtn: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: Radius.full,
        marginTop: 4,
    },
    useSoundText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    gridItem: {
        width: GRID_IMG_SIZE,
        height: GRID_IMG_SIZE,
        backgroundColor: '#000',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.4)',
        overflow: 'hidden',
    },
});
