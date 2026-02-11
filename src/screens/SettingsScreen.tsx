import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Switch } from 'react-native';
import { Settings, Bell, Globe, Lock, CreditCard, Download, Trash2, ChevronRight, Moon, Sun, Smartphone, Volume2, Mail, MessageSquare, Shield, Eye, Database, FileText, Plus, Check, Keyboard, Key, Fingerprint, UserX, MapPin, History as HistoryIcon, Target, Camera, Mic, Wifi, Share2 } from 'lucide-react-native';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { MobileHeader } from '../components/MobileHeader';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { LogOut } from 'lucide-react-native';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

export default function SettingsScreen({ navigation }: any) {
    const { theme, setTheme, colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const [language, setLanguage] = useState('es');

    const [notifications, setNotifications] = useState({
        push: true,
        email: true,
        promotions: true,
        orders: true,
    });

    const [privacy, setPrivacy] = useState({
        showLocation: true,
        showActivity: true,
        allowMessages: true,
    });

    const [biometrics, setBiometrics] = useState(false);
    const [twoFactor, setTwoFactor] = useState(false);

    const toggleSwitch = (key: string, section: 'notifications' | 'privacy') => {
        if (section === 'notifications') {
            setNotifications(prev => ({ ...prev, [key]: !prev[key as keyof typeof notifications] }));
        } else {
            setPrivacy(prev => ({ ...prev, [key]: !prev[key as keyof typeof privacy] }));
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
                    trackColor={{ false: '#767577', true: '#007AFF' }}
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
                            onPress={() => show('Gestión de tarjetas próximamente', 'info')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Globe}
                            label="Idioma"
                            type="value"
                            value={language === 'es' ? 'Español' : 'English'}
                            onPress={() => setLanguage(l => l === 'es' ? 'en' : 'es')}
                        />
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

                <SectionHeader title="Seguridad" />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <SettingRow
                            icon={Key}
                            label="Cambiar Contraseña"
                            onPress={() => show('Seguridad: Formulario de cambio de contraseña próximamente', 'info')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Shield}
                            label="Autenticación 2 Factores"
                            type="switch"
                            value={twoFactor}
                            onPress={() => setTwoFactor(!twoFactor)}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Fingerprint}
                            label="Biometría"
                            type="switch"
                            value={biometrics}
                            onPress={() => setBiometrics(!biometrics)}
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
                            onPress={() => toggleSwitch('push', 'notifications')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Mail}
                            label="Emails"
                            type="switch"
                            value={notifications.email}
                            onPress={() => toggleSwitch('email', 'notifications')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Target}
                            label="Promociones"
                            type="switch"
                            value={notifications.promotions}
                            onPress={() => toggleSwitch('promotions', 'notifications')}
                        />
                    </CardContent>
                </Card>

                <SectionHeader title="Privacidad" />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <SettingRow
                            icon={MapPin}
                            label="Mostrar Ubicación"
                            type="switch"
                            value={privacy.showLocation}
                            onPress={() => toggleSwitch('showLocation', 'privacy')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={HistoryIcon}
                            label="Mostrar Actividad"
                            type="switch"
                            value={privacy.showActivity}
                            onPress={() => toggleSwitch('showActivity', 'privacy')}
                        />
                    </CardContent>
                </Card>

                <SectionHeader title="Legal" />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <SettingRow
                            icon={FileText}
                            label="Términos de Servicio"
                            onPress={() => show('Términos de servicio detallados próximamente', 'info')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Shield}
                            label="Política de Privacidad"
                            onPress={() => show('Política de privacidad detallada próximamente', 'info')}
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
    container: { flex: 1, backgroundColor: isDark ? '#111827' : '#FAFAFA' },
    content: { padding: 16, paddingBottom: 100 }, // Added padding for bottom safe area
    sectionHeader: { fontSize: 13, fontWeight: '600', color: isDark ? '#9CA3AF' : '#666', marginTop: 16, marginBottom: 8, paddingLeft: 4, textTransform: 'uppercase' },
    card: { overflow: 'hidden', borderWidth: 0, shadowColor: isDark ? '#F9FAFB' : "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 }, // Removed bg color, handled by Card component
    cardContent: { padding: 0 },
    settingRow: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: isDark ? '#1F2937' : '#fff' },
    settingIconContainer: { marginRight: 12 },
    settingLabel: { fontSize: 16, color: isDark ? '#F9FAFB' : '#333' },
    settingValueText: { fontSize: 14, color: isDark ? '#9CA3AF' : '#666' },
    divider: { height: 1, backgroundColor: isDark ? '#374151' : '#f0f0f0', marginLeft: 48 },

    // Sheet Styles
    sheetContent: {
        backgroundColor: isDark ? '#1F2937' : '#fff',
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
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8
    },
    sheetText: {
        fontSize: 16,
        color: isDark ? '#D1D5DB' : '#4B5563',
        textAlign: 'center',
        marginBottom: 16
    },
    sheetActions: {
        flexDirection: 'row',
        gap: 12,
        width: '100%'
    }
});
