import React, { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bookmark, Plus, FolderPlus } from 'lucide-react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { colors, Radius } from '../../theme/tokens';

/**
 * Posts guardados. Antes de esto `api.social.toggleSavePost` /
 * `getSavedPosts` existían enteros en el backend (los usa `Post.tsx` para
 * guardar/desguardar) pero no había NINGUNA pantalla para ver todo lo
 * guardado — sólo se podía guardar "a ciegas". Suma colecciones (Fase 7).
 */
export default function SavedPostsScreen({ navigation }: any) {
    const insets = useSafeAreaInsets();
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    // undefined = todos, null = sueltos, string = una colección puntual.
    const [activeCollection, setActiveCollection] = useState<string | null | undefined>(undefined);
    const [creating, setCreating] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');

    const collections = useQuery(api.social.listMySavedCollections, sessionToken ? { sessionToken } : 'skip');
    const saved = useQuery(
        api.social.getSavedPosts,
        sessionToken ? { sessionToken, limit: 30, collectionId: activeCollection as any } : 'skip',
    );
    const createCollection = useMutation(api.social.createSavedCollection);
    const toggleSave = useMutation(api.social.toggleSavePost);

    const handleCreateCollection = async () => {
        if (!sessionToken || newCollectionName.trim().length < 1) return;
        try {
            await createCollection({ sessionToken, name: newCollectionName.trim() });
            setNewCollectionName('');
            setCreating(false);
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo crear la colección', 'error');
        }
    };

    const handleUnsave = async (postId: string) => {
        if (!sessionToken) return;
        try {
            await toggleSave({ sessionToken, postId: postId as any });
        } catch {}
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <ArrowLeft size={22} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Posts guardados</Text>
                <TouchableOpacity onPress={() => setCreating((c) => !c)} style={styles.iconBtn}>
                    <FolderPlus size={20} color={colors(isDark).primary} />
                </TouchableOpacity>
            </View>

            {creating && (
                <View style={styles.createRow}>
                    <TextInput
                        style={styles.createInput}
                        placeholder="Nombre de la colección"
                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                        value={newCollectionName}
                        onChangeText={setNewCollectionName}
                    />
                    <TouchableOpacity style={styles.createBtn} onPress={handleCreateCollection}>
                        <Plus size={18} color="#fff" />
                    </TouchableOpacity>
                </View>
            )}

            <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.collectionTabs}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
                data={[
                    { id: undefined, name: 'Todo' },
                    { id: null, name: 'Sueltos' },
                    ...(collections ?? []).map((c: any) => ({ id: String(c._id), name: c.name })),
                ]}
                keyExtractor={(item: any) => String(item.id)}
                renderItem={({ item }: any) => (
                    <TouchableOpacity
                        style={[styles.chip, activeCollection === item.id && styles.chipActive]}
                        onPress={() => setActiveCollection(item.id)}
                    >
                        <Text style={[styles.chipText, activeCollection === item.id && styles.chipTextActive]}>
                            {item.name}
                        </Text>
                    </TouchableOpacity>
                )}
            />

            {saved === undefined ? (
                <ActivityIndicator style={{ marginTop: 24 }} color={colors(isDark).primary} />
            ) : saved.items.length === 0 ? (
                <View style={styles.empty}>
                    <Bookmark size={40} color={isDark ? '#4B5563' : '#D1D5DB'} />
                    <Text style={styles.emptyText}>No tenés posts guardados acá todavía.</Text>
                </View>
            ) : (
                <FlatList
                    data={saved.items}
                    keyExtractor={(item: any) => String(item._id)}
                    contentContainerStyle={{ padding: 16, gap: 12 }}
                    renderItem={({ item }: any) => (
                        <TouchableOpacity
                            style={styles.postCard}
                            onPress={() => navigation.navigate('PostDetail', { postId: item._id })}
                        >
                            <Text style={styles.postAuthor}>{item.author?.displayName ?? item.authorUserId}</Text>
                            <Text style={styles.postText} numberOfLines={3}>{item.content}</Text>
                            <TouchableOpacity onPress={() => handleUnsave(String(item._id))} style={styles.unsaveBtn}>
                                <Bookmark size={16} color={colors(isDark).primary} fill={colors(isDark).primary} />
                            </TouchableOpacity>
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
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
        iconBtn: { padding: 4 },
        headerTitle: { fontSize: 18, fontWeight: '700', color: isDark ? '#fff' : '#111827' },
        createRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
        createInput: { flex: 1, borderRadius: Radius.md, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB', paddingHorizontal: 12, color: isDark ? '#fff' : '#111827' },
        createBtn: { width: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: colors(isDark).primary },
        collectionTabs: { flexGrow: 0, marginBottom: 8 },
        chip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: Radius.full ?? 999, backgroundColor: isDark ? '#18181B' : '#F3F4F6' },
        chipActive: { backgroundColor: colors(isDark).primary },
        chipText: { fontSize: 13, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },
        chipTextActive: { color: '#fff' },
        postCard: { padding: 14, borderRadius: Radius.md, backgroundColor: isDark ? '#18181B' : '#F9FAFB', borderWidth: 1, borderColor: isDark ? '#27272A' : '#E5E7EB' },
        postAuthor: { fontSize: 12, fontWeight: '700', color: isDark ? '#9CA3AF' : '#6B7280', marginBottom: 4 },
        postText: { fontSize: 14, color: isDark ? '#fff' : '#111827' },
        unsaveBtn: { position: 'absolute', top: 12, right: 12 },
        empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 100 },
        emptyText: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', paddingHorizontal: 40 },
    });
