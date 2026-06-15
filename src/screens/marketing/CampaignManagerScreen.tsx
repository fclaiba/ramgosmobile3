import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Plus, Copy, TrendingUp, DollarSign, Users } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

/**
 * CampaignManagerScreen — influencer-side view to propose campaigns to
 * a business. Replaces the legacy `WalletContext.campaigns` mock with
 * `api.campaigns.*` queries/mutations against the Convex
 * `influencerCampaigns` table.
 *
 * Note: actual sales / earnings stats per campaign live on the
 * `payments` table and need a future aggregator query
 * (`api.campaigns.getCampaignStats`); for now we render zeros until that
 * lands so the UI stays honest about what's wired up.
 */
export default function CampaignManagerScreen() {
    const { user } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [businessLookup, setBusinessLookup] = useState('');
    const [commissionPct, setCommissionPct] = useState('5');
    const [submitting, setSubmitting] = useState(false);

    const myId = user?.id;
    const campaigns = useQuery(
        api.campaigns.getMyCampaigns,
        myId ? { influencerId: myId as Id<"users"> } : 'skip',
    ) ?? [];

    const proposeCampaign = useMutation(api.campaigns.proposeCampaign);

    const handleCreate = async () => {
        if (!myId) {
            show('Iniciá sesión para crear una campaña.', 'error');
            return;
        }
        const businessId = businessLookup.trim();
        const ratePct = Number(commissionPct);
        if (!businessId) {
            show('Pegá el ID del negocio.', 'error');
            return;
        }
        if (!Number.isFinite(ratePct) || ratePct <= 0 || ratePct > 50) {
            show('La comisión debe ser entre 1% y 50%.', 'error');
            return;
        }

        setSubmitting(true);
        try {
            await proposeCampaign({
                businessId: businessId as any,
                influencerId: myId as Id<"users">,
                commissionRate: ratePct / 100,
            });
            setIsModalOpen(false);
            setBusinessLookup('');
            setCommissionPct('5');
            show('Propuesta enviada al negocio.', 'success');
        } catch (e: any) {
            show(e?.message ?? 'No se pudo crear la campaña.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>Mis Campañas</Text>
                    <Text style={styles.headerSubtitle}>Propuestas y campañas activas con negocios</Text>
                </View>
                <TouchableOpacity style={styles.createBtn} onPress={() => setIsModalOpen(true)}>
                    <Plus size={20} color="#fff" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 16 }}>
                {campaigns.length === 0 && (
                    <Text style={{ color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', marginTop: 32 }}>
                        Todavía no tenés campañas. Tocá + para proponerle una a un negocio.
                    </Text>
                )}
                {campaigns.map((camp: any) => (
                    <CampaignCard key={camp._id} campaign={camp} isDark={isDark} styles={styles} />
                ))}
            </ScrollView>

            <Modal visible={isModalOpen} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Proponer Campaña</Text>

                        <Text style={styles.label}>ID del Negocio</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="users/abc123..."
                            placeholderTextColor="#9CA3AF"
                            value={businessLookup}
                            onChangeText={setBusinessLookup}
                            autoCapitalize="none"
                        />

                        <Text style={styles.label}>Comisión (%)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="5"
                            placeholderTextColor="#9CA3AF"
                            value={commissionPct}
                            onChangeText={setCommissionPct}
                            keyboardType="numeric"
                        />

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                onPress={() => setIsModalOpen(false)}
                                style={styles.cancelBtn}
                                disabled={submitting}
                            >
                                <Text style={styles.cancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleCreate}
                                style={styles.confirmBtn}
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.confirmText}>Enviar Propuesta</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function CampaignCard({ campaign, isDark, styles }: { campaign: any; isDark: boolean; styles: any }) {
    const statusColor =
        campaign.status === 'active'
            ? '#10B981'
            : campaign.status === 'pending'
                ? '#F59E0B'
                : campaign.status === 'paused'
                    ? '#6B7280'
                    : '#EF4444';
    return (
        <View style={styles.card}>
            <LinearGradient
                colors={isDark ? ['#1F2937', '#374151'] : ['#ffffff', '#F9FAFB']}
                style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
            />
            <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.storeName}>{campaign.businessName ?? 'Negocio'}</Text>
                    <View style={styles.codeBadge}>
                        <Text style={styles.codeText}>
                            {(campaign.commissionRate * 100).toFixed(1)}% por venta
                        </Text>
                        <Copy size={12} color="#7C3AED" />
                    </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
                    <View style={[styles.activeDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.activeText, { color: statusColor }]}>
                        {labelForStatus(campaign.status)}
                    </Text>
                </View>
            </View>

            <View style={styles.statsRow}>
                <View style={styles.statItem}>
                    <Users size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    <Text style={styles.statValue}>—</Text>
                    <Text style={styles.statLabel}>Usos</Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.statItem}>
                    <TrendingUp size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    <Text style={styles.statValue}>—</Text>
                    <Text style={styles.statLabel}>Ventas</Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.statItem}>
                    <DollarSign size={16} color="#10B981" />
                    <Text style={[styles.statValue, { color: '#10B981' }]}>—</Text>
                    <Text style={styles.statLabel}>Comisión</Text>
                </View>
            </View>
        </View>
    );
}

function labelForStatus(status: string) {
    switch (status) {
        case 'active': return 'Activa';
        case 'pending': return 'Pendiente';
        case 'paused': return 'Pausada';
        case 'ended': return 'Finalizada';
        case 'rejected': return 'Rechazada';
        default: return status;
    }
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: isDark ? '#111827' : '#F3F4F6',
    },
    header: {
        padding: 24,
        paddingTop: 60,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    headerSubtitle: {
        fontSize: 14,
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
    createBtn: {
        backgroundColor: '#7C3AED',
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    card: {
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        backgroundColor: isDark ? '#1F2937' : '#fff',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    storeName: {
        fontSize: 16,
        fontWeight: '600',
        color: isDark ? '#F9FAFB' : '#1F2937',
        marginBottom: 4,
    },
    codeBadge: {
        backgroundColor: isDark ? 'rgba(124, 58, 237, 0.2)' : '#EDE9FE',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start'
    },
    codeText: {
        color: '#7C3AED',
        fontWeight: 'bold',
        fontSize: 13,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    activeDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#10B981',
    },
    activeText: {
        fontSize: 12,
        color: '#10B981',
        fontWeight: '600',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: isDark ? '#374151' : '#F3F4F6',
        paddingTop: 16,
    },
    statItem: {
        alignItems: 'center',
        gap: 4,
    },
    statValue: {
        fontSize: 16,
        fontWeight: '700',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    statLabel: {
        fontSize: 12,
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
    verticalDivider: {
        width: 1,
        height: 30,
        backgroundColor: isDark ? '#374151' : '#F3F4F6',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 24,
    },
    modalContent: {
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderRadius: 24,
        padding: 24,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: isDark ? '#F9FAFB' : '#111827',
        marginBottom: 20,
        textAlign: 'center',
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: isDark ? '#D1D5DB' : '#4B5563',
        marginBottom: 8,
    },
    input: {
        backgroundColor: isDark ? '#374151' : '#F9FAFB',
        borderRadius: 12,
        padding: 12,
        color: isDark ? '#F9FAFB' : '#111827',
        marginBottom: 16,
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    cancelBtn: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        backgroundColor: isDark ? '#374151' : '#E5E7EB',
        alignItems: 'center',
    },
    cancelText: {
        fontWeight: '600',
        color: isDark ? '#D1D5DB' : '#4B5563',
    },
    confirmBtn: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        backgroundColor: '#7C3AED',
        alignItems: 'center',
    },
    confirmText: {
        fontWeight: '600',
        color: '#fff',
    },
});
