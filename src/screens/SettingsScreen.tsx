import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { Settings, Bell, Globe, CreditCard, ChevronRight, Moon, Sun, Mail, Shield, FileText, Key, UserX, Target, FlaskConical, Zap, LogOut } from 'lucide-react-native';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { MobileHeader } from '../components/MobileHeader';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { usePaymentMode } from '../contexts/PaymentModeContext';
import { useUserPreferences } from '../hooks/useUserPreferences';
import { Radius, colors } from '../theme/tokens';


export default function SettingsScreen({ navigation }: any) {
    const { theme, setTheme, colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();
    const { isTest, toggle } = usePaymentMode();
    const {
        language,
        setLanguage,
        notifications,
        setNotifications,
    } = useUserPreferences();

    const toggleNotif = async (key: 'push' | 'email' | 'sms' | 'marketingEmails') => {
        try {
            await setNotifications({ ...notifications, [key]: !notifications[key] });
            show('Preferencia guardada', 'success');
        } catch {
            show('No se pudo guardar', 'error');
        }
    };

    const SectionHeader = ({ title }: { title: string }) => (
        <Text style={styles.sectionHeader}>{title}</Text>
    );

    const SettingRow = ({ icon: Icon, label, value, type = 'chevron', onPress, color = isDark ? '#D1D5DB' : '#666' }: any) => (
        <TouchableOpacity
            style={styles.settingRow}
            onPress={onPress}
            disabled={type === 'switch'}
        >
            <View style={styles.settingIconContainer}>
                <Icon size={20} color={color} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>{label}</Text>
            </View>
            {type === 'chevron' && <ChevronRight size={18} color={isDark ? '#4B5563' : "#ccc"} />}
            {type === 'switch' && (
                <Switch
                    value={value}
                    onValueChange={onPress}
                    trackColor={{ false: '#767577', true: '#2196F3' }}
                    thumbColor={value ? '#fff' : '#f4f3f4'}
                />
            )}
            {type === 'value' && <Text style={styles.settingValueText}>{value}</Text>}
        </TouchableOpacity>
    );

    const { logout, deleteMyAccount } = useAuth();
    const [logoutModalVisible, setLogoutModalVisible] = useState(false);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);

    const handleLogout = () => {
        setLogoutModalVisible(false);
        logout();
    };

    const handleDelete = async () => {
        setDeleteModalVisible(false);
        try {
            await deleteMyAccount();
            show('Cuenta eliminada correctamente.');
        } catch (error) {
            show('Error al eliminar cuenta.', 'error');
        }
    };

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Configuración"
                subtitle="Personaliza tu experiencia"
                onMenuPress={() => navigation.openDrawer && navigation.openDrawer()}
                backButton
                onBack={() => navigation.goBack()}
            />

            <ScrollView contentContainerStyle={styles.content}>

                {/* ... existing sections ... */}
                <SectionHeader title="Cuenta" />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <SettingRow
                            icon={Settings}
                            label="Editar Perfil"
                            onPress={() => navigation.navigate('Profile')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={CreditCard}
                            label="Métodos de Pago"
                            onPress={() => navigation.navigate('PaymentMethods')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Globe}
                            label="Idioma"
                            type="value"
                            value={language === 'es' ? 'Español' : 'English'}
                            onPress={() => setLanguage(language === 'es' ? 'en' : 'es')}
                        />
                    </CardContent>
                </Card>

                <SectionHeader title="Pagos" />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingIconContainer}>
                                {isTest ? <FlaskConical size={20} color="#F59E0B" /> : <Zap size={20} color="#10B981" />}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.settingLabel}>Modo de Pagos</Text>
                                <Text style={[styles.settingValueText, { color: isTest ? '#F59E0B' : '#10B981' }]}>
                                    {isTest ? 'TEST (simulado)' : 'LIVE (real)'}
                                </Text>
                            </View>
                            {/* Fase 5: modo live deshabilitado hasta Bloque D — switch fijo en TEST. */}
                            <Switch
                                value={isTest}
                                onValueChange={() => {
                                    toggle();
                                    show('Pagos LIVE deshabilitados hasta el lanzamiento (solo modo TEST)', 'info');
                                }}
                                trackColor={{ false: '#10B981', true: '#F59E0B' }}
                                thumbColor="#fff"
                            />
                        </View>
                        {isTest && (
                            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                <View style={{
                                    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
                                    borderRadius: Radius.md,
                                    padding: 12,
                                    borderLeftWidth: 3,
                                    borderLeftColor: '#F59E0B',
                                }}>
                                    <Text style={{
                                        fontSize: 13,
                                        color: isDark ? '#FCD34D' : '#92400E',
                                        lineHeight: 18,
                                    }}>
                                        MODO TEST: Los pagos se procesan con tarjetas de prueba de Stripe. Se simulan órdenes, escrow y disputas completas. No se mueve dinero real.
                                    </Text>
                                </View>
                            </View>
                        )}
                    </CardContent>
                </Card>

                <SectionHeader title="Apariencia" />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <SettingRow
                            icon={theme === 'dark' ? Moon : Sun}
                            label="Tema Oscuro"
                            type="switch"
                            value={theme === 'dark'}
                            onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        />
                    </CardContent>
                </Card>

                <SectionHeader title="Seguridad y privacidad" />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <SettingRow
                            icon={Shield}
                            label="Privacidad y Seguridad"
                            onPress={() => navigation.navigate('PrivacySecurity')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Key}
                            label="Cambiar Contraseña"
                            onPress={() => navigation.navigate('ChangePassword')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Bell}
                            label="Bandeja de notificaciones"
                            onPress={() => navigation.navigate('Notifications')}
                        />
                    </CardContent>
                </Card>

                <SectionHeader title="Notificaciones" />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <SettingRow
                            icon={Bell}
                            label="Notificaciones Push"
                            type="switch"
                            value={notifications.push}
                            onPress={() => toggleNotif('push')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Mail}
                            label="Emails"
                            type="switch"
                            value={notifications.email}
                            onPress={() => toggleNotif('email')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Target}
                            label="Promociones"
                            type="switch"
                            value={notifications.marketingEmails}
                            onPress={() => toggleNotif('marketingEmails')}
                        />
                    </CardContent>
                </Card>

                <SectionHeader title="Legal" />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <SettingRow
                            icon={FileText}
                            label="Términos de Servicio"
                            onPress={() => navigation.navigate('Terms')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Shield}
                            label="Política de Privacidad"
                            onPress={() => navigation.navigate('Privacy')}
                        />
                    </CardContent>
                </Card>

                <View style={{ height: 20 }} />

                <Button variant="outline" onPress={() => setLogoutModalVisible(true)}>
                    <Text style={{ color: '#dc2626' }}>Cerrar Sesión</Text>
                </Button>

                <TouchableOpacity onPress={() => setDeleteModalVisible(true)} style={{ marginTop: 24, marginBottom: 8, alignItems: 'center' }}>
                    <Text style={{ color: isDark ? '#6B7280' : '#9CA3AF', fontSize: 13, textDecorationLine: 'underline' }}>Eliminar mi cuenta y datos</Text>
                </TouchableOpacity>

                <View style={{ height: 40 }} />
            </ScrollView>

            <Sheet open={logoutModalVisible} onOpenChange={setLogoutModalVisible}>
                <SheetContent side="bottom" style={styles.sheetContent}>
                    <SheetHeader>
                        <SheetTitle>Cerrar Sesión</SheetTitle>
                    </SheetHeader>
                    <View style={styles.sheetBody}>
                        <View style={[styles.confirmationIcon, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2' }]}>
                            <LogOut size={32} color={isDark ? '#ef4444' : '#dc2626'} />
                        </View>
                        <Text style={styles.sheetText}>
                            ¿Estás seguro de que quieres cerrar sesión en este dispositivo?
                        </Text>
                        <View style={styles.sheetActions}>
                            <Button variant="outline" style={{ flex: 1 }} onPress={() => setLogoutModalVisible(false)}>
                                <Text style={{ color: isDark ? '#D1D5DB' : '#374151' }}>Cancelar</Text>
                            </Button>
                            <Button
                                style={{ flex: 1, backgroundColor: '#dc2626' }}
                                onPress={handleLogout}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Cerrar Sesión</Text>
                            </Button>
                        </View>
                    </View>
                </SheetContent>
            </Sheet>

            <Sheet open={deleteModalVisible} onOpenChange={setDeleteModalVisible}>
                <SheetContent side="bottom" style={styles.sheetContent}>
                    <SheetHeader>
                        <SheetTitle>Eliminar Cuenta</SheetTitle>
                    </SheetHeader>
                    <View style={styles.sheetBody}>
                        <View style={[styles.confirmationIcon, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2' }]}>
                            <UserX size={32} color={isDark ? '#ef4444' : '#dc2626'} />
                        </View>
                        <Text style={styles.sheetText}>
                            ¿Estás seguro? Esta acción borrará PERMANENTEMENTE todos tus datos, puntos, nivel de mascota y progreso. No se puede deshacer.
                        </Text>
                        <View style={styles.sheetActions}>
                            <Button variant="outline" style={{ flex: 1 }} onPress={() => setDeleteModalVisible(false)}>
                                <Text style={{ color: isDark ? '#D1D5DB' : '#374151' }}>Cancelar</Text>
                            </Button>
                            <Button
                                style={{ flex: 1, backgroundColor: '#dc2626' }}
                                onPress={handleDelete}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Sí, Eliminar</Text>
                            </Button>
                        </View>
                    </View>
                </SheetContent>
            </Sheet>
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors(isDark).bg },
    content: { padding: 16, paddingBottom: 100 }, // Added padding for bottom safe area
    sectionHeader: { fontSize: 13, fontWeight: '600', color: isDark ? '#9CA3AF' : '#666', marginTop: 16, marginBottom: 8, paddingLeft: 4, textTransform: 'uppercase' },
    card: { overflow: 'hidden', borderWidth: 0, shadowColor: isDark ? '#F9FAFB' : "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 }, // Removed bg color, handled by Card component
    cardContent: { padding: 0 },
    settingRow: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors(isDark).glass },
    settingIconContainer: { marginRight: 12 },
    settingLabel: { fontSize: 16, color: isDark ? '#F9FAFB' : '#333' },
    settingValueText: { fontSize: 14, color: isDark ? '#9CA3AF' : '#666' },
    divider: { height: 1, backgroundColor: isDark ? '#374151' : '#f0f0f0', marginLeft: 48 },

    // Sheet Styles
    sheetContent: {
        backgroundColor: colors(isDark).glass,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    sheetBody: {
        padding: 24,
        paddingBottom: 40,
        alignItems: 'center',
        gap: 16
    },
    confirmationIcon: {
        width: 64,
        height: 64,
        borderRadius: Radius['2xl'],
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8
    },
    sheetText: {
        fontSize: 16,
        color: colors(isDark).textMuted,
        textAlign: 'center',
        marginBottom: 16
    },
    sheetActions: {
        flexDirection: 'row',
        gap: 12,
        width: '100%'
    }
});
