import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShoppingBag, Store, Zap, ArrowRight, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { glassShadow, Radius, colors } from '../theme/tokens';


const { width } = Dimensions.get('window');

interface RoleOption {
    id: 'consumer' | 'business' | 'influencer';
    title: string;
    description: string;
    icon: any;
    color: string;
    benefits: string[];
}

const roles: RoleOption[] = [
    {
        id: 'consumer',
        title: 'Usuario / Comprador',
        description: 'Compra productos, gana puntos y descubre ofertas increíbles.',
        icon: ShoppingBag,
        color: '#3B82F6',
        benefits: ['Gana puntos por cada compra', 'Acceso a ofertas exclusivas', 'Sin costos de mantenimiento']
    },
    {
        id: 'business',
        title: 'Negocio / Vendedor',
        description: 'Vende tus productos, gestiona tu inventario y llega a más clientes.',
        icon: Store,
        color: '#10B981',
        benefits: ['Publica productos y servicios', 'Panel de administración completo', 'Verificación KYC requerida']
    },
    {
        id: 'influencer',
        title: 'Influencer / Creador',
        description: 'Monetiza tu contenido y promociona marcas exclusivas.',
        icon: Zap,
        color: '#4FC3F7',
        benefits: ['Gana comisiones por referidos', 'Colaboraciones con marcas', 'Verificación KYC requerida']
    }
];

export default function RoleSelectionScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const { updateRole, user } = useAuth();
    const [selectedRole, setSelectedRole] = React.useState<string | null>(null);

    const handleContinue = async () => {
        if (!selectedRole) return;

        try {
            if (user) {
                await updateRole(selectedRole as any);
            }
            // Navigate to basic profile setup with the selected role context
            navigation.navigate('BasicProfileSetup', { role: selectedRole });
        } catch (error) {
            console.error('Error selecting role:', error);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Hola, {user?.name?.split(' ')[0] || 'Viajero'}</Text>
                <Text style={styles.headerSubtitle}>¿Cómo quieres usar Ramgos?</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {roles.map((role) => {
                    const isSelected = selectedRole === role.id;
                    return (
                        <TouchableOpacity
                            key={role.id}
                            style={[
                                styles.card,
                                isSelected && { borderColor: role.color, borderWidth: 2, backgroundColor: colors(isDark).glass }
                            ]}
                            onPress={() => setSelectedRole(role.id)}
                            activeOpacity={0.9}
                        >
                            <View style={[styles.iconContainer, { backgroundColor: isSelected ? role.color : (isDark ? '#374151' : '#F3F4F6') }]}>
                                <role.icon size={24} color={isSelected ? '#fff' : (isDark ? '#9CA3AF' : '#6B7280')} />
                            </View>

                            <View style={styles.cardContent}>
                                <Text style={[styles.cardTitle, isSelected && { color: role.color }]}>{role.title}</Text>
                                <Text style={styles.cardDesc}>{role.description}</Text>

                                {isSelected && (
                                    <View style={styles.benefitsContainer}>
                                        {role.benefits.map((benefit, index) => (
                                            <View key={index} style={styles.benefitRow}>
                                                <Check size={12} color={role.color} />
                                                <Text style={styles.benefitText}>{benefit}</Text>
                                            </View>
                                        ))}
                                        {role.id === 'influencer' && (
                                            <View style={[styles.benefitRow, { marginTop: 8, padding: 8, backgroundColor: isDark ? 'rgba(79, 195, 247, 0.1)' : 'rgba(79, 195, 247, 0.05)', borderRadius: 8 }]}>
                                                <Text style={[styles.benefitText, { fontSize: 11, color: isDark ? '#9CA3AF' : '#6B7280', lineHeight: 16 }]}>
                                                    Al continuar, aceptas nuestros Términos y Condiciones para Creadores, incluyendo el esquema de comisiones y pagos por referidos.
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>

                            {isSelected && (
                                <View style={[styles.checkCircle, { backgroundColor: role.color }]}>
                                    <Check size={16} color="#fff" />
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.btn, !selectedRole && styles.btnDisabled]}
                    onPress={handleContinue}
                    disabled={!selectedRole}
                >
                    <LinearGradient
                        colors={selectedRole ? ['#2196F3', '#EC4899'] : ['#E5E7EB', '#E5E7EB']}
                        style={styles.btnGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        <Text style={[styles.btnText, !selectedRole && { color: '#9CA3AF' }]}>Continuar</Text>
                        {selectedRole && <ArrowRight size={20} color="#fff" />}
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors(isDark).bg },
    header: { padding: 24, paddingTop: 40 },
    headerTitle: { fontSize: 28, fontWeight: 'bold', color: colors(isDark).text, marginBottom: 8 },
    headerSubtitle: { fontSize: 16, color: colors(isDark).textMuted },

    scrollContent: { padding: 16, paddingBottom: 100 },

    card: {
        flexDirection: 'row',
        backgroundColor: colors(isDark).glass,
        borderRadius: Radius.xl,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
        ...glassShadow(isDark),shadowOffset: { width: 0, height: 4 },
        elevation: 2,
        position: 'relative',
        overflow: 'hidden'
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: Radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16
    },
    cardContent: { flex: 1 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: colors(isDark).text, marginBottom: 4 },
    cardDesc: { fontSize: 13, color: colors(isDark).textMuted, lineHeight: 20 },

    benefitsContainer: { marginTop: 12, gap: 4 },
    benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    benefitText: { fontSize: 12, color: colors(isDark).textMuted },

    checkCircle: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 24,
        height: 24,
        borderRadius: Radius.md,
        alignItems: 'center',
        justifyContent: 'center'
    },

    footer: {
        padding: 24,
        backgroundColor: colors(isDark).glass,
        borderTopWidth: 1,
        borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)'
    },
    btn: { width: '100%', height: 56, borderRadius: Radius.lg, overflow: 'hidden' },
    btnDisabled: { backgroundColor: colors(isDark).glass },
    btnGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
