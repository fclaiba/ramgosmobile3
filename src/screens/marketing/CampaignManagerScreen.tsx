import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { useWallet, Campaign } from '../../contexts/WalletContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Megaphone, Plus, Copy, TrendingUp, DollarSign, Users } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function CampaignManagerScreen() {
    const { campaigns, createCampaign } = useWallet();
    const { user } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newCode, setNewCode] = useState('');
    const [storeName, setStoreName] = useState('');

    // Filter campaigns for current user (influencer)
    // For demo: assume current user is 'inf_1' if not set, or match user.id
    const myId = user?.id || 'inf_1'; // fallback

    // In our mock WalletContext, we initialized with 'inf_1'. If we want to test effectively, 
    // we should align IDs. But let's just show ALL campaigns for demo purposes if ID doesn't match,
    // or strictly filter. Let's strictly filter but ensure WalletContext has a match or we create one.
    // Actually, let's just show all for the demo to ensure visibility.
    const myCampaigns = campaigns; // .filter(c => c.influencerId === myId);

    const handleCreate = () => {
        if (!newCode || !storeName) {
            Alert.alert('Error', 'Completa todos los campos');
            return;
        }
        createCampaign(myId, 'store_temp', storeName, newCode);
        setIsModalOpen(false);
        setNewCode('');
        setStoreName('');
        Alert.alert('¡Éxito!', 'Campaña creada correctamente.');
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>Campañas Activas</Text>
                    <Text style={styles.headerSubtitle}>Gestiona tus códigos de influencer</Text>
                </View>
                <TouchableOpacity style={styles.createBtn} onPress={() => setIsModalOpen(true)}>
                    <Plus size={20} color="#fff" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 16 }}>
                {myCampaigns.map(camp => (
                    <CampaignCard key={camp.id} campaign={camp} isDark={isDark} styles={styles} />
                ))}
            </ScrollView>

            {/* Create Campaign Modal */}
            <Modal visible={isModalOpen} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Nueva Campaña</Text>

                        <Text style={styles.label}>Nombre de la Tienda / Marca</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ej: Nike Store"
                            placeholderTextColor="#9CA3AF"
                            value={storeName}
                            onChangeText={setStoreName}
                        />

                        <Text style={styles.label}>Código Promocional</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ej: JORGE10"
                            autoCapitalize="characters"
                            placeholderTextColor="#9CA3AF"
                            value={newCode}
                            onChangeText={setNewCode}
                        />

                        <View style={styles.modalActions}>
                            <TouchableOpacity onPress={() => setIsModalOpen(false)} style={styles.cancelBtn}>
                                <Text style={styles.cancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleCreate} style={styles.confirmBtn}>
                                <Text style={styles.confirmText}>Crear Campaña</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function CampaignCard({ campaign, isDark, styles }: { campaign: Campaign, isDark: boolean, styles: any }) {
    return (
        <View style={styles.card}>
            <LinearGradient
                colors={isDark ? ['#1F2937', '#374151'] : ['#ffffff', '#F9FAFB']}
                style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
            />
            <View style={styles.cardHeader}>
                <View>
                    <Text style={styles.storeName}>{campaign.targetStoreName}</Text>
                    <View style={styles.codeBadge}>
                        <Text style={styles.codeText}>{campaign.code}</Text>
                        <Copy size={12} color="#7C3AED" />
                    </View>
                </View>
                <View style={styles.statusBadge}>
                    <View style={styles.activeDot} />
                    <Text style={styles.activeText}>Activa</Text>
                </View>
            </View>

            <View style={styles.statsRow}>
                <View style={styles.statItem}>
                    <Users size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    <Text style={styles.statValue}>{campaign.stats.uses}</Text>
                    <Text style={styles.statLabel}>Usos</Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.statItem}>
                    <TrendingUp size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    <Text style={styles.statValue}>${campaign.stats.totalSales.toFixed(0)}</Text>
                    <Text style={styles.statLabel}>Ventas</Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.statItem}>
                    <DollarSign size={16} color="#10B981" />
                    <Text style={[styles.statValue, { color: '#10B981' }]}>${campaign.stats.totalEarnings.toFixed(2)}</Text>
                    <Text style={styles.statLabel}>Comisión</Text>
                </View>
            </View>
        </View>
    );
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
        backgroundColor: isDark ? '#1F2937' : '#fff', // fallback
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

    // Modal
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
