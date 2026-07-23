import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { ArrowRight, Calendar, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { glassSurface, glassChip } from '../../utils/glass';
import { formatCurrency } from '../../utils/formatters';

interface CampaignsProps {
    pendingInvitations: any[];
    myProposals: any[];
    activeCampaigns: any[];
    containerWidth?: number;
}

export default function CampaignsManager({ pendingInvitations, myProposals, activeCampaigns, containerWidth }: CampaignsProps) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    const textPrimary = { color: isDark ? '#fff' : '#111827' };
    const textSecondary = { color: isDark ? '#9CA3AF' : '#6B7280' };

    const renderEmpty = (message: string) => (
        <View style={styles.emptyBox}>
            <Text style={textSecondary}>{message}</Text>
        </View>
    );

    const renderCampaignsList = (campaigns: any[], emptyMessage: string) => {
        if (campaigns.length === 0) return renderEmpty(emptyMessage);
        
        return campaigns.map(c => (
            <View key={c._id} style={[styles.campaignCard, glassSurface(isDark, 'subtle')]}>
                <View style={styles.campaignHeader}>
                    <Text style={[styles.campaignTitle, textPrimary]}>{c.businessName || 'Campaña'}</Text>
                    <View style={glassChip(isDark, c.status === 'active' ? '#10B981' : '#F59E0B')}>
                        <Text style={{ color: c.status === 'active' ? '#10B981' : '#F59E0B', fontSize: 12, fontWeight: '600' }}>
                            {c.status.toUpperCase()}
                        </Text>
                    </View>
                </View>
                <View style={styles.campaignFooter}>
                    <Text style={textSecondary}>Comisión: {c.rateType === 'percentage' ? `${c.ratePct}%` : formatCurrency(c.rateFixed || 0)}</Text>
                    <TouchableOpacity style={styles.btnAction}>
                        <Text style={{ color: isDark ? '#818cf8' : '#4f46e5', fontWeight: '600', fontSize: 13 }}>Ver detalles</Text>
                        <ArrowRight size={14} color={isDark ? '#818cf8' : '#4f46e5'} />
                    </TouchableOpacity>
                </View>
            </View>
        ));
    };

    return (
        <View style={[styles.container, containerWidth ? { maxWidth: containerWidth } : undefined]}>
            <Text style={[styles.sectionTitle, textPrimary]}>Mis Campañas</Text>
            
            <View style={styles.section}>
                <Text style={[styles.subTitle, textPrimary]}><AlertCircle size={16} color="#F59E0B" style={{marginRight: 6}}/> Invitaciones Pendientes</Text>
                {renderCampaignsList(pendingInvitations, 'No tienes invitaciones pendientes.')}
            </View>

            <View style={styles.section}>
                <Text style={[styles.subTitle, textPrimary]}><Calendar size={16} color={isDark ? '#818cf8' : '#4f46e5'} style={{marginRight: 6}}/> Campañas Activas</Text>
                {renderCampaignsList(activeCampaigns, 'No tienes campañas activas en este momento.')}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        alignSelf: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '800',
        marginBottom: 16,
        paddingHorizontal: 4,
    },
    section: {
        marginBottom: 24,
    },
    subTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 12,
        paddingHorizontal: 4,
        flexDirection: 'row',
        alignItems: 'center',
    },
    emptyBox: {
        padding: 16,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: 'rgba(128,128,128,0.3)',
        borderRadius: 12,
        alignItems: 'center',
    },
    campaignCard: {
        padding: 16,
        marginBottom: 8,
    },
    campaignHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    campaignTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    campaignFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    btnAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        padding: 6,
    },
});
