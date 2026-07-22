import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, Switch, ActivityIndicator, AccessibilityInfo, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Settings, LogOut, HelpCircle, Save, History, Moon, Sun, X, Plus, PawPrint, Info, Shield, Store, Zap, Bell, ChevronRight, Users, Mail, RefreshCw, PackageOpen } from 'lucide-react-native';
import { useAuth, type UserRole } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationsContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { LinearGradient } from 'expo-linear-gradient';
import { useToast } from '../contexts/ToastContext';
import { Sheet, SheetContent } from './ui/sheet';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { Radius, colors } from '../theme/tokens';


interface SidebarMenuProps {
    visible: boolean;
    onClose: () => void;
    navigation?: any;
}

// Matches the bcrypt-backed development users created by the Convex seeds.
const DEMO_PASSWORD = 'RamgosDemo1!';

export const SidebarMenu = ({ visible, onClose }: SidebarMenuProps) => {
    const navigation = useNavigation<any>();
    const { user, status, pendingVerification, logout, loginWithEmail, signUpWithEmail, verifyEmailCode, isProcessing, updateRole } = useAuth();
    const { unreadCount } = useNotifications();
    const { theme, toggleTheme, colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { show } = useToast();

    // Loading states for async operations
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [isChangingRole, setIsChangingRole] = useState(false);

    const effectiveUser = user ?? pendingVerification?.user ?? null;
    const isAnonymous = status === 'anonymous' && !effectiveUser;
    const isPending = status === 'pending_verification';
    const isAuthenticated = status === 'authenticated' && !!user;

    const statusDotColor = isPending ? '#F59E0B' : isAuthenticated ? '#10B981' : '#6B7280';
    const statusLabel = isPending ? 'Pendiente de verificación' : isAuthenticated ? 'Conectado' : 'Invitado';

    // Dynamic Styles
    const styles = getStyles(isDark);

    // Haptic feedback helper
    const triggerHaptic = useCallback((style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(style);
        }
    }, []);

    const handleLogout = async () => {
        triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
        setIsLoggingOut(true);
        try {
            await logout();
            onClose();
            // Reset navigation to Welcome screen to prevent going back
            navigation.reset({
                index: 0,
                routes: [{ name: 'Welcome' }],
            });
        } catch (error) {
            show('Error al cerrar sesión. Intenta de nuevo.', 'error');
        } finally {
            setIsLoggingOut(false);
        }
    };



    // Local state to simulate identity for Dev Mode visual feedback
    const [simulatedProfile, setSimulatedProfile] = useState<{ name: string; email: string } | null>(null);

    // Reset simulation when closing or when user logs out
    useEffect(() => {
        if (!user) {
            setSimulatedProfile(null);
        }
    }, [user]);

    const handleRoleChange = async (role: UserRole | 'guest') => {
        if (isProcessing || isChangingRole) return;

        triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
        setIsChangingRole(true);
        try {
            if (role === 'guest') {
                setSimulatedProfile(null);
                await logout();
                show('Modo Invitado Activado', 'success');
                onClose();
                setTimeout(() => {
                    navigation.reset({ index: 0, routes: [{ name: 'Home', params: { initialTab: 'marketplace' } }] });
                }, 100);
                return;
            }

            const credentials = {
                business: { email: 'business@test.com', pass: DEMO_PASSWORD, name: 'Usuario Negocio' },
                influencer: { email: 'influencer@test.com', pass: DEMO_PASSWORD, name: 'Usuario Influencer' },
                admin: { email: 'admin@test.com', pass: DEMO_PASSWORD, name: 'Usuario Admin' },
                consumer: { email: 'consumer@test.com', pass: DEMO_PASSWORD, name: 'Usuario Consumidor' },
            };

            const creds = credentials[role as keyof typeof credentials];
            if (creds) {
                let loggedInUser = null;
                try {
                    // Always try to login as the test account, passing role as override
                    const result = await loginWithEmail(creds.email, creds.pass, role as UserRole);
                    loggedInUser = result.user;
                } catch (e: any) {
                    if (e.message.includes('no encontrado') || e.message.includes('not found') || e.message.includes('credenciales')) {
                        console.log(`[DevMode] Login failed, attempting auto-registration for ${role}...`);
                        try {
                            const result = await signUpWithEmail({
                                email: creds.email,
                                password: creds.pass,
                                name: creds.name,
                                role: role as UserRole
                            });
                            loggedInUser = result.user;
                        } catch (regError) {
                            console.error("Auto-registration failed", regError);
                            show('No se pudo crear el usuario de prueba', 'error');
                            throw e;
                        }
                    } else {
                        throw e;
                    }
                }
            }

            triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
            show(`Modo Dev Activado: ${role.toUpperCase()}`, 'success');
            onClose();
            setTimeout(() => {
                navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            }, 100);

        } catch (error: any) {
            console.error(error);
            show(error.message || 'Error al cambiar rol.', 'error');
        } finally {
            setIsChangingRole(false);
        }
    };

    const MenuItem = ({ icon: Icon, label, action, badge, color = isDark ? "#D1D5DB" : "#4B5563", danger = false, isSwitch = false, switchValue = false, onSwitchChange, loading = false, accessibilityHint }: any) => (
        <TouchableOpacity
            style={[styles.menuItem, danger && styles.menuItemDanger, loading && { opacity: 0.6 }]}
            onPress={isSwitch && onSwitchChange ? undefined : loading ? undefined : () => { triggerHaptic(); action?.(); }}
            activeOpacity={isSwitch ? 1 : 0.7}
            disabled={loading}
            accessible={true}
            accessibilityLabel={label}
            accessibilityHint={accessibilityHint || `Navegar a ${label}`}
            accessibilityRole={isSwitch ? 'switch' : 'button'}
            accessibilityState={{ disabled: loading, checked: isSwitch ? switchValue : undefined }}
        >
            <View style={[styles.iconContainer, danger && { backgroundColor: '#FEE2E2' }]}>
                {loading ? (
                    <ActivityIndicator size="small" color={danger ? "#EF4444" : color} />
                ) : (
                    <Icon size={20} color={danger ? "#EF4444" : color} />
                )}
            </View>
            <Text style={[styles.menuText, danger && { color: "#EF4444" }]}>{label}</Text>
            {isSwitch ? (
                <Switch
                    value={switchValue}
                    onValueChange={(val) => { triggerHaptic(); onSwitchChange?.(val); }}
                    trackColor={{ false: '#767577', true: '#4FC3F7' }}
                    thumbColor={switchValue ? '#fff' : '#f4f3f4'}
                    accessibilityLabel={`${label} ${switchValue ? 'activado' : 'desactivado'}`}
                />
            ) : badge !== undefined && badge > 0 ? (
                <View style={styles.badge} accessibilityLabel={`${badge} notificaciones`}>
                    <Text style={styles.badgeText}>{badge}</Text>
                </View>
            ) : (
                <ChevronRight size={16} color={isDark ? "#4B5563" : "#D1D5DB"} style={{ marginLeft: 'auto' }} />
            )}
        </TouchableOpacity>
    );

    if (!visible && !effectiveUser) return null; // keep it mounted for signed-in users, unmount for guests when hidden

    const displayName = simulatedProfile?.name || (effectiveUser?.name || (isPending ? 'Cuenta pendiente' : 'Invitado'));
    const displayEmail = simulatedProfile?.email || (pendingVerification?.email ?? effectiveUser?.email ?? 'Bienvenido a Ramgos');

    return (
        <Sheet open={visible} onOpenChange={(val: boolean) => !val && onClose()}>
            <SheetContent side="left" style={styles.sheetContent}>
                <LinearGradient
                    colors={isDark ? ['#111827', '#000'] : ['#fff', '#F9FAFB']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />

                <SafeAreaView style={{ flex: 1 }}>
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 24, paddingRight: 8 }}>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <X color={isDark ? "#9CA3AF" : "#6B7280"} size={24} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.profileSection}>
                            <View style={styles.avatarContainer} accessible={true} accessibilityLabel={`Avatar de ${effectiveUser?.name || 'usuario'}. Estado: ${statusLabel}`}>
                                <Avatar style={styles.avatar}>
                                    <AvatarImage src={effectiveUser?.avatar} />
                                    <AvatarFallback>{effectiveUser?.name?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                                </Avatar>
                                <View
                                    style={[styles.statusDot, { backgroundColor: statusDotColor }]}
                                    accessible={true}
                                    accessibilityLabel={statusLabel}
                                />
                            </View>
                            <View style={styles.userInfo}>
                                {isProcessing || isChangingRole ? (
                                    <ActivityIndicator size="small" color={isDark ? "#D1D5DB" : "#4B5563"} style={{ alignSelf: 'flex-start' }} />
                                ) : (
                                    <>
                                        <Text style={styles.userName}>
                                            {displayName}
                                        </Text>
                                        <Text style={styles.userEmail} numberOfLines={1}>
                                            {displayEmail}
                                        </Text>
                                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                                            <View style={[styles.roleBadge, !effectiveUser && { backgroundColor: colors(isDark).glass }]}>
                                                <Text style={styles.roleText}>
                                                    {isPending ? 'PENDING_VERIFICATION' : effectiveUser?.role?.toUpperCase() || 'MODO INVITADO'}
                                                </Text>
                                            </View>
                                            {effectiveUser && (
                                                <View style={[styles.roleBadge, { backgroundColor: effectiveUser.kycStatus === 'approved' ? (isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5') : (effectiveUser.kycStatus === 'pending' ? (isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7') : (isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2')) }]}>
                                                    <Text style={[styles.roleText, { color: effectiveUser.kycStatus === 'approved' ? (isDark ? '#34D399' : '#065F46') : (effectiveUser.kycStatus === 'pending' ? (isDark ? '#FBBF24' : '#92400E') : (isDark ? '#F87171' : '#991B1B')) }]}>
                                                        {effectiveUser.kycStatus === 'approved' ? '✅ VERIFICADO' : (effectiveUser.kycStatus === 'pending' ? '⏳ KYC PENDIENTE' : '❌ NO VERIFICADO')}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    </>
                                )}
                            </View>
                        </View>
                    </View>

                    <ScrollView
                        style={styles.content}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Guest CTA */}
                        {isAnonymous && (
                            <View style={styles.section}>
                                <Text style={styles.sectionHeader}>Acceso</Text>
                                <MenuItem
                                    icon={User}
                                    label="Iniciar sesión"
                                    action={() => { onClose(); navigation.navigate('Login'); }}
                                    color="#4FC3F7"
                                />
                                <MenuItem
                                    icon={Plus}
                                    label="Crear cuenta"
                                    action={() => { onClose(); navigation.navigate('Register'); }}
                                    color="#10B981"
                                />
                            </View>
                        )}

                        {/* Pending verification CTA */}
                        {isPending && (
                            <View style={styles.section}>
                                <Text style={styles.sectionHeader}>Verificación</Text>
                                <MenuItem
                                    icon={Mail}
                                    label="Verificar email"
                                    action={() => {
                                        const email = pendingVerification?.email ?? effectiveUser?.email;
                                        onClose();
                                        navigation.navigate('Verification', { email });
                                    }}
                                    color="#F59E0B"
                                />
                            </View>
                        )}

                        <View style={styles.section}>
                            <Text style={styles.sectionHeader}>Principal</Text>
                            {!isAnonymous && (
                                <>
                                    <MenuItem icon={Bell} label="Notificaciones" action={() => { onClose(); navigation.navigate('Notifications'); }} badge={unreadCount} color="#6366F1" />
                                    <MenuItem icon={PawPrint} label="Mi Mascota" action={() => { onClose(); navigation.navigate('MiMascota'); }} color="#EC4899" />
                                    <MenuItem icon={User} label="Mi Perfil" action={() => { onClose(); navigation.navigate('Profile'); }} color="#4FC3F7" />
                                    <MenuItem icon={Users} label="Invitar Amigos" action={() => { onClose(); navigation.navigate('Referrals'); }} color="#10B981" />
                                    <MenuItem icon={Save} label="Guardados" action={() => { onClose(); navigation.navigate('Saved'); }} color="#F59E0B" />
                                    <MenuItem icon={PackageOpen} label="Mis Publicaciones" action={() => { onClose(); navigation.navigate('MyListings'); }} color="#3B82F6" />
                                </>
                            )}
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionHeader}>Cuenta</Text>
                            <MenuItem
                                icon={isDark ? Moon : Sun}
                                label="Tema Oscuro"
                                isSwitch
                                switchValue={isDark}
                                onSwitchChange={toggleTheme}
                                color={isDark ? "#5DD3F3" : "#F59E0B"}
                            />
                            {!isAnonymous && (
                                <MenuItem icon={History} label="Mis compras" action={() => { onClose(); navigation.navigate('History'); }} />
                            )}
                            {!isAnonymous && (
                                <MenuItem icon={Settings} label="Configuración" action={() => { onClose(); navigation.navigate('Settings'); }} />
                            )}
                            <MenuItem icon={HelpCircle} label="Ayuda" action={() => { onClose(); navigation.navigate('HelpCenter'); }} />
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionHeader}>Legales</Text>
                            <MenuItem icon={Shield} label="Términos y Condiciones" action={() => { onClose(); navigation.navigate('Terms'); }} color="#6366F1" />
                            <MenuItem icon={Info} label="Política de Privacidad" action={() => { onClose(); navigation.navigate('Privacy'); }} color="#4FC3F7" />
                        </View>

                        {/* Dynamic Sections based on Role */}
                        {user?.role === 'business' && (
                            <View style={styles.section}>
                                <Text style={[styles.sectionHeader, { color: '#10B981' }]}>Negocio</Text>
                                <MenuItem icon={Store} label="Panel de Negocio" action={() => { onClose(); navigation.navigate('Home', { initialTab: 'dashboard' }); }} color="#10B981" />
                            </View>
                        )}
                        {user?.role === 'influencer' && (
                            <View style={styles.section}>
                                <Text style={[styles.sectionHeader, { color: '#A855F7' }]}>Influencer</Text>
                                <MenuItem icon={Zap} label="Panel Influencer" action={() => { onClose(); navigation.navigate('Home', { initialTab: 'dashboard' }); }} color="#A855F7" />
                            </View>
                        )}
                        {user?.role === 'admin' && (
                            <View style={styles.section}>
                                <Text style={[styles.sectionHeader, { color: '#EF4444' }]}>Admin</Text>
                                <MenuItem icon={Shield} label="Panel Admin" action={() => { onClose(); navigation.navigate('AdminDashboard'); }} color="#EF4444" />
                            </View>
                        )}


                        {isAuthenticated && (
                            <View style={[styles.section, { borderBottomWidth: 0, marginBottom: 40 }]}>
                                <MenuItem
                                    icon={isLoggingOut ? RefreshCw : LogOut}
                                    label={isLoggingOut ? "Cerrando sesión..." : "Cerrar Sesión"}
                                    action={handleLogout}
                                    danger
                                    loading={isLoggingOut}
                                    accessibilityHint="Cerrar tu sesión actual y volver a la pantalla de bienvenida"
                                />
                            </View>
                        )}

                    </ScrollView>
                </SafeAreaView>
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    sheetContent: {
        backgroundColor: colors(isDark).glass,
        width: '85%',
        maxWidth: 380,
    },
    header: {
        padding: 24,
        paddingTop: Platform.OS === 'android' ? 20 : 20,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)'
    },
    closeButton: {
        position: 'absolute',
        top: 24,
        right: 24,
        zIndex: 10,
        padding: 4,
    },
    profileSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginTop: 10,
    },
    avatarContainer: {
        position: 'relative',
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: Radius['2xl'],
        borderWidth: 3,
        borderColor: isDark ? '#374151' : '#fff',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4
    },
    statusDot: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 14,
        height: 14,
        borderRadius: Radius.sm,
        backgroundColor: '#10B981',
        borderWidth: 2,
        borderColor: isDark ? '#09090B' : '#FAFAFA'
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors(isDark).text,
        marginBottom: 2
    },
    userEmail: {
        fontSize: 13,
        color: colors(isDark).textMuted,
        marginBottom: 6
    },
    roleBadge: {
        alignSelf: 'flex-start',
        backgroundColor: colors(isDark).glass,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: Radius.full,
    },
    roleText: {
        fontSize: 10,
        fontWeight: '700',
        color: colors(isDark).textMuted,
        letterSpacing: 0.5
    },
    content: { flex: 1 },
    scrollContent: { paddingVertical: 16 },
    section: {
        marginBottom: 24,
        paddingHorizontal: 16,
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: '700',
        color: isDark ? '#6B7280' : '#9CA3AF',
        marginBottom: 12,
        paddingHorizontal: 12,
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: Radius.md,
        marginBottom: 4,
        backgroundColor: 'transparent'
    },
    menuItemDanger: {
        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: Radius.md,
        backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    menuText: {
        fontSize: 15,
        fontWeight: '500',
        color: isDark ? '#D1D5DB' : '#374151',
        flex: 1
    },
    badge: {
        backgroundColor: '#EF4444',
        borderRadius: Radius.md,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginLeft: 'auto'
    },
    badgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700'
    },
    roleSelector: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 12
    },
    roleChip: {
        width: 36,
        height: 36,
        borderRadius: Radius.lg,
        backgroundColor: colors(isDark).glass,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)'
    },
    roleChipActive: {
        backgroundColor: colors(isDark).text,
        borderColor: colors(isDark).text
    },
    roleChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors(isDark).textMuted
    },
    roleChipTextActive: {
        color: isDark ? '#09090B' : '#FAFAFA'
    }
});
