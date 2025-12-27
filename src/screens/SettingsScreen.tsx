import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Switch } from 'react-native';
import { Settings, Bell, Globe, Lock, CreditCard, Download, Trash2, ChevronRight, Moon, Sun, Smartphone, Volume2, Mail, MessageSquare, Shield, Eye, Database, FileText, Plus, Check, Keyboard, Key, Fingerprint, UserX, MapPin, History as HistoryIcon, Target, Camera, Mic, Wifi, Share2 } from 'lucide-react-native';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { MobileHeader } from '../components/MobileHeader';

export default function SettingsScreen({ navigation }: any) {
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
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

    const SettingRow = ({ icon: Icon, label, value, type = 'chevron', onPress, color = '#666' }: any) => (
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
            {type === 'chevron' && <ChevronRight size={18} color="#ccc" />}
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
                            onPress={() => Alert.alert('Pagos', 'Gestión de tarjetas próximamente')}
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
                            onPress={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
                        />
                    </CardContent>
                </Card>

                <SectionHeader title="Seguridad" />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <SettingRow
                            icon={Key}
                            label="Cambiar Contraseña"
                            onPress={() => Alert.alert('Seguridad', 'Formulario de cambio de contraseña')}
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
                            onPress={() => Alert.alert('Legal', 'Términos de servicio')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Shield}
                            label="Política de Privacidad"
                            onPress={() => Alert.alert('Legal', 'Política de privacidad')}
                        />
                    </CardContent>
                </Card>

                <View style={{ height: 20 }} />

                <Button variant="outline" onPress={() => Alert.alert('Cerrar Sesión', '¿Estás seguro?')}>
                    <Text style={{ color: '#dc2626' }}>Cerrar Sesión</Text>
                </Button>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    content: { padding: 16 },
    sectionHeader: { fontSize: 13, fontWeight: '600', color: '#666', marginTop: 16, marginBottom: 8, paddingLeft: 4, textTransform: 'uppercase' },
    card: { overflow: 'hidden', borderWidth: 0, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    cardContent: { padding: 0 },
    settingRow: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff' },
    settingIconContainer: { marginRight: 12 },
    settingLabel: { fontSize: 16, color: '#333' },
    settingValueText: { fontSize: 14, color: '#666' },
    divider: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 48 },
});
