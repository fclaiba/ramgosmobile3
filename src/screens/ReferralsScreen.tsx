import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput , KeyboardAvoidingView, Platform} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useReferral } from '../contexts/ReferralContext';
import { useAuth } from '../contexts/AuthContext';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useToast } from '../contexts/ToastContext';
import { ReferralCard } from '../components/referral/ReferralCard';
import { ArrowLeft, Users, DollarSign, Award, ShieldAlert, Edit2, Check, X } from 'lucide-react-native';
import { Radius, colors, glassShadow } from '../theme/tokens';
import { LinearGradient } from 'expo-linear-gradient';

function ReferralsScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const styles = getStyles(isDark);
    const insets = useSafeAreaInsets();
    
    const { user, sessionToken } = useAuth();
    const { stats, history, shareReferral, simulateReferral } = useReferral();
    const { show } = useToast();
    const updateProfileMutation = useMutation(api.users.updateProfile);

    // Usa el referal de perfil si existe, si no usa el generado (o nada)
    const initialCode = (user as any)?.referralCode || '';
    const [referralCode, setReferralCode] = useState(initialCode);
    const [isEditingCode, setIsEditingCode] = useState(false);
    const [tempCode, setTempCode] = useState(initialCode);

    useEffect(() => {
        setReferralCode((user as any)?.referralCode || '');
        setTempCode((user as any)?.referralCode || '');
    }, [(user as any)?.referralCode]);

    const handleSaveCode = async () => {
        if (!tempCode.trim()) {
            show('El código no puede estar vacío', 'error');
            return;
        }
        try {
            await updateProfileMutation({
                id: (user as any)?.id,
                sessionToken: sessionToken || '',
                updates: {
                    referralCode: tempCode.toUpperCase().trim(),
                }
            });
            setReferralCode(tempCode.toUpperCase().trim());
            setIsEditingCode(false);
            show('Código de referido actualizado', 'success');
        } catch (error: any) {
            show(error.message || 'Error al actualizar', 'error');
        }
    };

    const needsKyc = user?.kycStatus !== 'approved' && user?.kycStatus !== 'pending';

    const StatCard = ({ icon: Icon, value, label, color }: any) => (
        <View style={styles.statCard}>
            <View style={[styles.iconBox, { backgroundColor: color + '20' }]}>
                <Icon size={22} color={color} />
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
                
                {needsKyc && (
                    <TouchableOpacity 
                        style={styles.kycBanner}
                        onPress={() => navigation.navigate('KYC', { accountType: user?.role || 'consumer' })}
                    >
                        <LinearGradient
                            colors={isDark ? ['#7F1D1D', '#450A0A'] : ['#FEE2E2', '#FECACA']}
                            style={styles.kycGradient}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        >
                            <View style={styles.kycBannerContent}>
                                <View style={styles.kycIconWrapper}>
                                    <ShieldAlert size={24} color={isDark ? '#FCA5A5' : '#DC2626'} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.kycBannerTitle}>Verificación requerida</Text>
                                    <Text style={styles.kycBannerText}>
                                        Completá tu verificación (KYC) para poder retirar el dinero que ganes invitando amigos.
                                    </Text>
                                </View>
                            </View>
                        </LinearGradient>
                    </TouchableOpacity>
                )}

                {/* Hero Section */}
                <View style={styles.heroContainer}>
                    <Text style={styles.heroTitle}>
                        ¡Gana dinero con Ramgos! 🚀
                    </Text>
                    <Text style={styles.heroSubtitle}>
                        Construye tu propio negocio invitando a tu red.
                        Tú pones los contactos, nosotros la tecnología.
                    </Text>
                </View>

                {/* Custom Code Section */}
                <View style={styles.customCodeSection}>
                    <View style={styles.customCodeHeader}>
                        <Text style={styles.sectionTitle}>Tu Código Personalizado</Text>
                        {!isEditingCode && (
                            <TouchableOpacity onPress={() => setIsEditingCode(true)} style={styles.editBtn}>
                                <Edit2 size={16} color={c.primary} />
                                <Text style={styles.editBtnText}>Cambiar</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    
                    {isEditingCode ? (
                        <View style={styles.codeEditRow}>
                            <TextInput
                                style={styles.codeInput}
                                value={tempCode}
                                onChangeText={setTempCode}
                                placeholder="Ej: JUAN123"
                                placeholderTextColor={c.textMuted}
                                autoCapitalize="characters"
                            />
                            <TouchableOpacity onPress={handleSaveCode} style={styles.saveBtn}>
                                <Check size={20} color="#FFF" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => { setIsEditingCode(false); setTempCode(referralCode); }} style={styles.cancelBtn}>
                                <X size={20} color={c.textMuted} />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.codeDisplayBox}>
                            <Text style={styles.codeDisplayText}>{referralCode || 'Sin definir'}</Text>
                            {!referralCode && (
                                <Text style={styles.codeHelpText}>Configurá tu código para empezar a compartir.</Text>
                            )}
                        </View>
                    )}
                </View>

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
                        color="#8B5CF6"
                    />
                </View>

                {/* History */}
                <View style={styles.historySection}>
                    <View style={styles.historyHeader}>
                        <Text style={styles.sectionTitle}>Historial</Text>
                        {/* BOTÓN DEBUG: Solo para desarrollo */}
                        {__DEV__ ? (
                            <TouchableOpacity onPress={() => simulateReferral()}>
                                <Text style={{ color: '#8B5CF6', fontSize: 12, fontWeight: 'bold' }}>+ Simular</Text>
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

                <View style={{ height: 60 }} />
            </ScrollView>
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors(isDark).bg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 16,
        backgroundColor: colors(isDark).glass,
        borderBottomWidth: 1,
        borderBottomColor: colors(isDark).glassBorder,
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
    kycBanner: {
        borderRadius: Radius.xl,
        overflow: 'hidden',
        marginBottom: 24,
        ...glassShadow(isDark),
    },
    kycGradient: {
        padding: 16,
    },
    kycBannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    kycIconWrapper: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)',
        padding: 10,
        borderRadius: Radius.lg,
    },
    kycBannerTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: isDark ? '#FECACA' : '#991B1B',
        marginBottom: 2,
    },
    kycBannerText: {
        fontSize: 13,
        color: isDark ? '#FCA5A5' : '#B91C1C',
        lineHeight: 18,
    },
    heroContainer: {
        marginBottom: 24,
        alignItems: 'center',
    },
    heroTitle: {
        fontSize: 28,
        fontWeight: '900',
        color: isDark ? '#FFF' : '#111827',
        marginBottom: 10,
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    heroSubtitle: {
        fontSize: 15,
        color: colors(isDark).textMuted,
        textAlign: 'center',
        lineHeight: 22,
        paddingHorizontal: 10,
    },
    customCodeSection: {
        backgroundColor: colors(isDark).glass,
        borderRadius: Radius.xl,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: colors(isDark).glassBorder,
        ...glassShadow(isDark),
    },
    customCodeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: 'bold',
        color: isDark ? '#FFF' : '#111827',
    },
    editBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#E0F2FE',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: Radius.md,
    },
    editBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors(isDark).primary,
    },
    codeDisplayBox: {
        backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
        padding: 16,
        borderRadius: Radius.lg,
        alignItems: 'center',
    },
    codeDisplayText: {
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: 2,
        color: colors(isDark).primary,
    },
    codeHelpText: {
        fontSize: 12,
        color: colors(isDark).textMuted,
        marginTop: 6,
    },
    codeEditRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    codeInput: {
        flex: 1,
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFF',
        borderWidth: 1,
        borderColor: colors(isDark).glassBorder,
        borderRadius: Radius.lg,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        fontWeight: 'bold',
        color: isDark ? '#FFF' : '#000',
    },
    saveBtn: {
        backgroundColor: '#10B981',
        padding: 12,
        borderRadius: Radius.lg,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelBtn: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
        padding: 12,
        borderRadius: Radius.lg,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 32,
        gap: 12,
        marginTop: 12,
    },
    statCard: {
        flex: 1,
        backgroundColor: colors(isDark).glass,
        padding: 16,
        borderRadius: Radius.xl,
        borderWidth: 1,
        borderColor: colors(isDark).glassBorder,
        ...glassShadow(isDark),
    },
    iconBox: {
        width: 42,
        height: 42,
        borderRadius: Radius.lg,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
    },
    statValue: {
        fontSize: 19,
        fontWeight: '900',
        color: isDark ? '#FFF' : '#111827',
        marginBottom: 2,
    },
    statLabel: {
        fontSize: 12,
        fontWeight: '500',
        color: colors(isDark).textMuted,
    },
    historySection: {
        backgroundColor: colors(isDark).glass,
        borderRadius: Radius.xl,
        padding: 20,
        borderWidth: 1,
        borderColor: colors(isDark).glassBorder,
        ...glassShadow(isDark),
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
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors(isDark).glassBorder,
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
        fontWeight: '700',
        color: isDark ? '#FFF' : '#111827',
    },
    historyAction: {
        fontSize: 12,
        color: colors(isDark).textMuted,
        marginTop: 2,
    },
    historyPoints: {
        fontSize: 14,
        fontWeight: '900',
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

// HOC inyectado automáticamente para soporte de teclado
const HOC_KeyboardAvoidingView_ReferralsScreen = (props: any) => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ReferralsScreen {...props} />
    </KeyboardAvoidingView>
);
export default HOC_KeyboardAvoidingView_ReferralsScreen;
