import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors } from '../../theme/tokens';
import { PostCard } from '../../components/social/PostCard';
import { mapPostToCardProps } from '../../utils/mapPostToCard';
import { openUserProfile } from '../../navigation/openUserProfile';

/**
 * A2: destino del sticker `hashtag` de historias — `getPostsByTag`
 * (`convex/social/hashtags.ts`) ya existía y funcionaba, pero no tenía
 * NINGÚN consumidor en `src/` (confirmado en la exploración). Sin esto el
 * sticker sería un callejón sin salida al tocarlo.
 */
export default function HashtagFeedScreen({ route, navigation }: any) {
    const tag: string = route?.params?.tag ?? '';
    const insets = useSafeAreaInsets();
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    const [cursor, setCursor] = useState<string | undefined>(undefined);
    const [pages, setPages] = useState<Array<{ cursor: string; items: any[] }>>([]);

    const page = useQuery(
        api.social.hashtags.getPostsByTag,
        sessionToken && tag ? { sessionToken, tag, cursor, limit: 20 } : 'skip',
    );
    const toggleLike = useMutation(api.social.toggleLike);

    useEffect(() => {
        setCursor(undefined);
        setPages([]);
    }, [tag, sessionToken]);

    useEffect(() => {
        if (!page) return;
        const pageCursor = cursor || 'first';
        setPages((prev) => (prev.some((p) => p.cursor === pageCursor) ? prev : [...prev, { cursor: pageCursor, items: page.items }]));
    }, [page, cursor]);

    const posts = pages.flatMap((p) => p.items).filter((item, i, arr) => arr.findIndex((x) => String(x._id) === String(item._id)) === i);

    const loadMore = useCallback(() => {
        if (!page?.nextCursor || page.nextCursor === cursor) return;
        setCursor(page.nextCursor);
    }, [page, cursor]);

    return (
        <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft size={24} color={c.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: c.text }]}>#{tag}</Text>
            </View>
            {page === undefined && pages.length === 0 ? (
                <ActivityIndicator style={{ marginTop: 24 }} color={c.primary} />
            ) : (
                <FlatList
                    data={posts}
                    keyExtractor={(item: any) => String(item._id)}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.5}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => (
                        <PostCard
                            post={mapPostToCardProps(item)}
                            author={item.author ? { name: item.author.displayName || item.author.username, avatar: item.author.avatar, username: item.author.username } : null}
                            onLike={() => sessionToken && toggleLike({ sessionToken, targetType: 'post', targetId: item._id }).catch(() => {})}
                            onComment={() => navigation.navigate('PostDetail', { postId: item._id })}
                            onCommercePress={() => {}}
                            onUserPress={(userId) => openUserProfile(navigation, userId)}
                        />
                    )}
                    ListEmptyComponent={<Text style={{ color: c.textSecondary, padding: 24, textAlign: 'center' }}>Todavía no hay posts con #{tag}.</Text>}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    listContent: { paddingHorizontal: 12, paddingBottom: 24 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(150,150,150,0.2)' },
    backBtn: { padding: 4, marginRight: 16 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
});
