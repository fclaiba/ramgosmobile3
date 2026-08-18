import React, { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ShieldAlert, Trash2, Ban, UserX, Plus } from 'lucide-react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { colors, Radius } from '../../theme/tokens';

type SubTab = 'queue' | 'terms';

const REASON_LABELS: Record<string, string> = {
    spam: 'Spam', harassment: 'Acoso', nudity: 'Desnudez', violence: 'Violencia',
    hate: 'Odio', scam: 'Estafa', selfharm: 'Autolesión', ip: 'Propiedad intelectual', other: 'Otro',
};

/**
 * Cola de moderación para admin. Pantalla aparte de `AdminDashboardScreen`
 * (que ya tiene 1360+ líneas) siguiendo la misma convención de tabs propios,
 * queries condicionadas por tab, y estilos por tema.
 */
export default function AdminModerationScreen({ navigation }: any) {
    const insets = useSafeAreaInsets();
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const [subTab, setSubTab] = useState<SubTab>('queue');
    const [status, setStatus] = useState<'open' | 'reviewing' | 'actioned' | 'dismissed'>('open');
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

    const reports = useQuery(
        api.social.moderation.adminListReports,
        sessionToken && subTab === 'queue' ? { sessionToken, status, limit: 30 } : 'skip',
    );
    const detail = useQuery(
        api.social.moderation.adminGetReportDetail,
        sessionToken && selectedReportId ? { sessionToken, reportId: selectedReportId as any } : 'skip',
    );
    const stats = useQuery(api.social.moderation.adminGetModerationStats, sessionToken ? { sessionToken } : 'skip');
    const terms = useQuery(api.social.moderation.adminListTerms, sessionToken && subTab === 'terms' ? { sessionToken } : 'skip');

    const resolveReport = useMutation(api.social.moderation.adminResolveReport);
    const upsertTerm = useMutation(api.social.moderation.adminUpsertTerm);
    const deleteTerm = useMutation(api.social.moderation.adminDeleteTerm);

    const [newTerm, setNewTerm] = useState('');

    const handleResolve = async (action: 'remove_content' | 'warn' | 'shadowban' | 'suspend' | 'dismiss') => {
        if (!sessionToken || !selectedReportId) return;
        try {
            await resolveReport({
                sessionToken,
                reportId: selectedReportId as any,
                action,
                reason: `Acción admin: ${action}`,
                suspendDays: action === 'suspend' ? 3 : undefined,
            });
            show('Reporte resuelto', 'success');
            setSelectedReportId(null);
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo resolver', 'error');
        }
    };

    const handleAddTerm = async () => {
        if (!sessionToken || newTerm.trim().length < 2) return;
        try {
            await upsertTerm({ sessionToken, term: newTerm.trim(), severity: 'block', scope: 'all' });
            setNewTerm('');
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo agregar', 'error');
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <ArrowLeft size={22} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Moderación</Text>
                <View style={{ width: 22 }} />
            </View>

            {stats && (
                <Text style={styles.statsText}>
                    {stats.open} abiertos · {stats.reviewing} en revisión
                </Text>
            )}

            <View style={styles.tabs}>
                {(['queue', 'terms'] as SubTab[]).map((t) => (
                    <TouchableOpacity key={t} style={[styles.tab, subTab === t && styles.tabActive]} onPress={() => setSubTab(t)}>
                        <Text style={[styles.tabText, subTab === t && styles.tabTextActive]}>
                            {t === 'queue' ? 'Cola de reportes' : 'Filtro de palabras'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {subTab === 'queue' && (
                <>
                    <View style={styles.tabs}>
                        {(['open', 'reviewing', 'actioned', 'dismissed'] as const).map((s) => (
                            <TouchableOpacity key={s} style={[styles.statusChip, status === s && styles.tabActive]} onPress={() => setStatus(s)}>
                                <Text style={[styles.tabText, status === s && styles.tabTextActive]}>{s}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {selectedReportId && detail ? (
                        <View style={styles.detailPanel}>
                            <Text style={styles.detailTitle}>
                                {REASON_LABELS[detail.report?.reason] ?? detail.report?.reason} — {detail.report?.targetType}
                            </Text>
                            {detail.report?.details ? <Text style={styles.detailBody}>{detail.report.details}</Text> : null}
                            {detail.target?.content ? (
                                <Text style={styles.detailBody} numberOfLines={4}>"{detail.target.content}"</Text>
                            ) : null}
                            <View style={styles.actionsRow}>
                                <TouchableOpacity style={styles.actionBtn} onPress={() => handleResolve('remove_content')}>
                                    <Trash2 size={16} color="#EF4444" />
                                    <Text style={styles.actionBtnText}>Remover</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.actionBtn} onPress={() => handleResolve('shadowban')}>
                                    <UserX size={16} color="#F59E0B" />
                                    <Text style={styles.actionBtnText}>Shadowban</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.actionBtn} onPress={() => handleResolve('suspend')}>
                                    <Ban size={16} color="#EF4444" />
                                    <Text style={styles.actionBtnText}>Suspender 3d</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.actionBtn} onPress={() => handleResolve('dismiss')}>
                                    <Text style={styles.actionBtnText}>Descartar</Text>
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity onPress={() => setSelectedReportId(null)}>
                                <Text style={styles.closeDetail}>Cerrar</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    {reports === undefined ? (
                        <ActivityIndicator style={{ marginTop: 24 }} color={colors(isDark).primary} />
                    ) : (
                        <FlatList
                            data={reports.items}
                            keyExtractor={(item: any) => String(item._id)}
                            contentContainerStyle={{ padding: 16, gap: 10 }}
                            renderItem={({ item }: any) => (
                                <TouchableOpacity style={styles.reportRow} onPress={() => setSelectedReportId(String(item._id))}>
                                    <ShieldAlert size={18} color="#F59E0B" />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.reportTitle}>
                                            {REASON_LABELS[item.reason] ?? item.reason} · {item.targetType}
                                        </Text>
                                        <Text style={styles.reportMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={<Text style={styles.emptyText}>No hay reportes en este estado.</Text>}
                        />
                    )}
                </>
            )}

            {subTab === 'terms' && (
                <>
                    <View style={styles.addTermRow}>
                        <TextInput
                            style={styles.termInput}
                            placeholder="Agregar término bloqueado…"
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                            value={newTerm}
                            onChangeText={setNewTerm}
                        />
                        <TouchableOpacity style={styles.addTermBtn} onPress={handleAddTerm}>
                            <Plus size={18} color="#fff" />
                        </TouchableOpacity>
                    </View>
                    <FlatList
                        data={terms ?? []}
                        keyExtractor={(item: any) => String(item._id)}
                        contentContainerStyle={{ padding: 16, gap: 8 }}
                        renderItem={({ item }: any) => (
                            <View style={styles.termRow}>
                                <Text style={styles.postText}>{item.term}</Text>
                                <Text style={styles.reportMeta}>{item.severity} · {item.scope}</Text>
                                <TouchableOpacity onPress={() => sessionToken && deleteTerm({ sessionToken, termId: item._id })}>
                                    <Trash2 size={16} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        )}
                    />
                </>
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
        statsText: { paddingHorizontal: 16, marginBottom: 8, fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280' },
        tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8, flexWrap: 'wrap' },
        tab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.full ?? 999, backgroundColor: isDark ? '#18181B' : '#F3F4F6' },
        statusChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.full ?? 999, backgroundColor: isDark ? '#18181B' : '#F3F4F6' },
        tabActive: { backgroundColor: colors(isDark).primary },
        tabText: { fontSize: 12, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },
        tabTextActive: { color: '#fff' },
        reportRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: Radius.md, backgroundColor: isDark ? '#18181B' : '#F9FAFB' },
        reportTitle: { fontSize: 14, fontWeight: '600', color: isDark ? '#fff' : '#111827' },
        reportMeta: { fontSize: 11, color: isDark ? '#9CA3AF' : '#6B7280', marginTop: 2 },
        detailPanel: { margin: 16, padding: 16, borderRadius: Radius.lg, backgroundColor: isDark ? '#18181B' : '#F9FAFB', gap: 8 },
        detailTitle: { fontSize: 15, fontWeight: '700', color: isDark ? '#fff' : '#111827' },
        detailBody: { fontSize: 13, color: isDark ? '#D1D5DB' : '#374151' },
        actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
        actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.md, backgroundColor: isDark ? '#27272A' : '#F3F4F6' },
        actionBtnText: { fontSize: 12, fontWeight: '600', color: isDark ? '#fff' : '#111827' },
        closeDetail: { marginTop: 8, fontSize: 13, color: colors(isDark).primary, fontWeight: '600' },
        emptyText: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', paddingTop: 40 },
        addTermRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
        termInput: { flex: 1, borderRadius: Radius.md, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB', paddingHorizontal: 12, color: isDark ? '#fff' : '#111827' },
        addTermBtn: { width: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: colors(isDark).primary },
        termRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: Radius.md, backgroundColor: isDark ? '#18181B' : '#F9FAFB' },
        postText: { fontSize: 14, color: isDark ? '#fff' : '#111827', flex: 1 },
    });
