import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Copy, Gift, Settings2 } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { glassSurface, glassChip } from '../../utils/glass';
import { useReferral } from '../../contexts/ReferralContext';

interface BonusItem {
    _id: string;
    title: string;
    description: string;
    discountPercent?: number;
    status: string;
}

interface Props {
    bonuses: BonusItem[];
    containerWidth?: number;
}

export default function MyBonusesList({ bonuses, containerWidth }: Props) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { show } = useToast();
    const { referralLink } = useReferral();

    const handleCopy = async (bonus: BonusItem) => {
        try {
            const Clipboard = await import('expo-clipboard');
            // Formato de enlace de bono: link de afiliado + parámetro de bono
            const bonusLink = `${referralLink}?bono=${bonus._id}`;
            await Clipboard.setStringAsync(bonusLink);
            show('Enlace del bono copiado', 'success');
        } catch (error) {
            show('Error al copiar', 'error');
        }
    };

    if (bonuses.length === 0) return null;

    return (
        <View style={[styles.container, containerWidth ? { maxWidth: containerWidth } : undefined]}>
            <View style={styles.header}>
                <Gift size={20} color={isDark ? "#818cf8" : "#4f46e5"} />
                <Text style={[styles.title, { color: isDark ? '#fff' : '#111827' }]}>Mis Bonos Activos</Text>
            </View>
            
            <View style={styles.list}>
                {bonuses.map((bonus) => (
                    <View key={bonus._id} style={[styles.bonusCard, glassSurface(isDark, 'subtle')]}>
                        <View style={styles.bonusHeaderRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.bonusTitle, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                                    {bonus.title}
                                </Text>
                                <Text style={[styles.bonusDesc, { color: isDark ? '#9CA3AF' : '#6B7280' }]} numberOfLines={2}>
                                    {bonus.description}
                                </Text>
                            </View>
                            <View style={glassChip(isDark, '#4f46e5')}>
                                <Text style={{ color: '#4f46e5', fontWeight: 'bold' }}>
                                    {bonus.discountPercent}% OFF
                                </Text>
                            </View>
                        </View>
                        <View style={styles.bonusFooter}>
                            <View style={[styles.statusBadge, { backgroundColor: bonus.status === 'active' ? (isDark ? 'rgba(52, 211, 153, 0.2)' : '#D1FAE5') : (isDark ? 'rgba(156, 163, 175, 0.2)' : '#F3F4F6') }]}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: bonus.status === 'active' ? (isDark ? '#34D399' : '#059669') : (isDark ? '#9CA3AF' : '#4B5563') }}>
                                    {bonus.status === 'active' ? 'Activo' : 'Pausado'}
                                </Text>
                            </View>
                            <View style={styles.actions}>
                                <TouchableOpacity onPress={() => handleCopy(bonus)} style={[styles.btn, styles.btnPrimary]}>
                                    <Copy size={14} color="#fff" style={{ marginRight: 6 }} />
                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Copiar Enlace</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        alignSelf: 'center',
        marginBottom: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
        paddingHorizontal: 4,
    },
    title: {
        fontSize: 18,
        fontWeight: '800',
    },
    list: {
        gap: 12,
    },
    bonusCard: {
        padding: 16,
        borderRadius: 16,
    },
    bonusHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 12,
    },
    bonusTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4,
    },
    bonusDesc: {
        fontSize: 13,
        lineHeight: 18,
    },
    bonusFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    actions: {
        flexDirection: 'row',
        gap: 8,
    },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    btnPrimary: {
        backgroundColor: '#4f46e5',
    },
});
