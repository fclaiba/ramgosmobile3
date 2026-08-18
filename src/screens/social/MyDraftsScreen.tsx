import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, FileText, Clock, Trash2, Send } from 'lucide-react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { colors, Radius } from '../../theme/tokens';

/** Borradores y posts programados. Antes de la Fase 7 no existía forma de
 *  guardar un post sin publicarlo. */
export default function MyDraftsScreen({ navigation }: any) {
    const insets = useSafeAreaInsets();
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const drafts = useQuery(api.social.drafts.listMyDrafts, sessionToken ? { sessionToken } : 'skip');
    const publishNow = useMutation(api.social.drafts.publishDraftNow);
    const deleteDraft = useMutation(api.social.drafts.deleteDraft);

    const handlePublish = async (draftId: string) => {
        if (!sessionToken) return;
        try {
            await publishNow({ sessionToken, draftId: draftId as any });
            show('Publicado', 'success');
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo publicar', 'error');
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <ArrowLeft size={22} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Borradores</Text>
                <View style={{ width: 22 }} />
            </View>

            {drafts === undefined ? (
                <ActivityIndicator style={{ marginTop: 24 }} color={colors(isDark).primary} />
            ) : drafts.length === 0 ? (
                <View style={styles.empty}>
                    <FileText size={40} color={isDark ? '#4B5563' : '#D1D5DB'} />
                    <Text style={styles.emptyText}>No tenés borradores ni posts programados.</Text>
                </View>
            ) : (
                <FlatList
                    data={drafts}
                    keyExtractor={(item: any) => String(item._id)}
                    contentContainerStyle={{ padding: 16, gap: 10 }}
                    renderItem={({ item }: any) => (
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                {item.status === 'scheduled' ? (
                                    <Clock size={16} color="#F59E0B" />
                                ) : (
                                    <FileText size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                )}
                                <Text style={styles.cardMeta}>
                                    {item.status === 'scheduled'
                                        ? `Programado para ${new Date(item.scheduledFor).toLocaleString()}`
                                        : 'Borrador'}
                                </Text>
                            </View>
                            <Text style={styles.cardText} numberOfLines={3}>{item.payload?.content}</Text>
                            <View style={styles.cardActions}>
                                <TouchableOpacity style={styles.actionBtn} onPress={() => handlePublish(String(item._id))}>
                                    <Send size={14} color={colors(isDark).primary} />
                                    <Text style={styles.actionBtnText}>Publicar ahora</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.actionBtn}
                                    onPress={() => sessionToken && deleteDraft({ sessionToken, draftId: item._id })}
                                >
                                    <Trash2 size={14} color="#EF4444" />
                                    <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Eliminar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
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
        card: { padding: 14, borderRadius: Radius.md, backgroundColor: isDark ? '#18181B' : '#F9FAFB', borderWidth: 1, borderColor: isDark ? '#27272A' : '#E5E7EB', gap: 8 },
        cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        cardMeta: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280', fontWeight: '600' },
        cardText: { fontSize: 14, color: isDark ? '#fff' : '#111827' },
        cardActions: { flexDirection: 'row', gap: 16, marginTop: 4 },
        actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        actionBtnText: { fontSize: 13, fontWeight: '600', color: colors(isDark).primary },
        empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 100 },
        emptyText: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', paddingHorizontal: 40 },
    });
