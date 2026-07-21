import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useReferral } from '../contexts/ReferralContext';
import { ReferralCard } from '../components/referral/ReferralCard';
import { ArrowLeft, Users, DollarSign, Award } from 'lucide-react-native';
import { Radius, colors } from '../theme/tokens';


export default function ReferralsScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    
    const insets = useSafeAreaInsets();
    const { referralCode, stats, history, shareReferral, simulateReferral } = useReferral();
    const styles = getStyles(isDark, insets);

    const StatCard = ({ icon: Icon, value, label, color }: any) => (
        <View style={styles.statCard}>
            <View style={[styles.iconBox, { backgroundColor: color + '20' }]}>
                <Icon size={24} color={color} />
            </View>
            <View>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft size={24} color={isDark ? '#FFF' : '#374151'} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Invitar Amigos</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* Hero Section */}
                <Text style={styles.heroTitle}>
                    ¡Gana dinero con Ramgos! 🚀
                </Text>
                <Text style={styles.heroSubtitle}>
                    Construye tu propio negocio invitando a tu red.
                    Tú pones los contactos, nosotros la tecnología.
                </Text>

                {/* Main Card */}
                <ReferralCard code={referralCode} onShare={shareReferral} />

                {/* Stats Grid */}
                <Text style={styles.sectionTitle}>Tu Impacto</Text>
                <View style={styles.statsGrid}>
                    <StatCard
                        icon={Users}
                        value={stats.totalInvited}
                        label="Amigos"
                        color="#3B82F6"
                    />
                    <StatCard
                        icon={DollarSign}
                        value={`$${(stats.totalEarned / 100).toFixed(2)}`}
                        label="Ganado"
                        color="#10B981"
                    />
                    <StatCard
                        icon={Award}
                        value={stats.level}
                        label="Nivel"
                        color="#4FC3F7"
                    />
                </View>

                {/* History */}
                <View style={styles.historySection}>
                    <View style={styles.historyHeader}>
                        <Text style={styles.sectionTitle}>Historial</Text>
                        {/* BOTÓN DEBUG: Solo para desarrollo */}
                        {__DEV__ ? (
                            <TouchableOpacity onPress={() => simulateReferral()}>
                                <Text style={{ color: '#4FC3F7', fontSize: 12 }}>+ Simular</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>

                    {history.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>Aún no has invitado a nadie.</Text>
                            <Text style={styles.emptySubtext}>¡Comparte tu link y empieza hoy!</Text>
                        </View>
                    ) : (
                        history.map((item) => (
                            <View key={item.id} style={styles.historyItem}>
                                <View style={styles.historyLeft}>
                                    <View style={[styles.dot, { backgroundColor: item.status === 'completed' ? '#10B981' : '#F59E0B' }]} />
                                    <View>
                                        <Text style={styles.historyUser}>{item.user}</Text>
                                        <Text style={styles.historyAction}>{item.action} • {new Date(item.date).toLocaleDateString()}</Text>
                                    </View>
                                </View>
                                <Text style={styles.historyPoints}>+{item.points} pts</Text>
                            </View>
                        ))
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const getStyles = (isDark: boolean, insets: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: isDark ? '#111827' : '#F3F4F6',
        paddingTop: insets.top,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: colors(isDark).glass,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
    },
    backButton: {
        padding: 8,
        borderRadius: Radius.md,
        backgroundColor: colors(isDark).glass,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: isDark ? '#FFF' : '#111827',
    },
    scrollContent: {
        padding: 20,
    },
    heroTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: isDark ? '#FFF' : '#111827',
        marginBottom: 8,
        textAlign: 'center',
    },
    heroSubtitle: {
        fontSize: 16,
        color: colors(isDark).textMuted,
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: isDark ? '#FFF' : '#111827',
        marginBottom: 16,
        marginTop: 8,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 32,
        gap: 12,
    },
    statCard: {
        flex: 1,
        backgroundColor: colors(isDark).glass,
        padding: 16,
        borderRadius: Radius.xl,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: Radius.md,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    statValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: isDark ? '#FFF' : '#111827',
        marginBottom: 2,
    },
    statLabel: {
        fontSize: 12,
        color: colors(isDark).textMuted,
    },
    historySection: {
        backgroundColor: colors(isDark).glass,
        borderRadius: Radius.xl,
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 4,
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    historyItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
    },
    historyLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: Radius.sm,
    },
    historyUser: {
        fontSize: 14,
        fontWeight: '600',
        color: isDark ? '#FFF' : '#111827',
    },
    historyAction: {
        fontSize: 12,
        color: colors(isDark).textMuted,
    },
    historyPoints: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#10B981',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: isDark ? '#FFF' : '#111827',
        marginBottom: 4,
    },
    emptySubtext: {
        fontSize: 14,
        color: colors(isDark).textMuted,
    }
});
