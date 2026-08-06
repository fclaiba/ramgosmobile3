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
import { useTranslation } from 'react-i18next';


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
    const { t } = useTranslation(['settings', 'common']);

    const toggleNotif = async (key: 'push' | 'email' | 'sms' | 'marketingEmails') => {
        try {
            await setNotifications({ ...notifications, [key]: !notifications[key] });
            show(t('settings:messages.saved'), 'success');
        } catch {
            show(t('settings:messages.saveFailed'), 'error');
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

    const handleLogout = async () => {
        setLogoutModalVisible(false);
        await logout();
        navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
    };

    const handleDelete = async () => {
        setDeleteModalVisible(false);
        try {
            await deleteMyAccount();
            show(t('settings:messages.accountDeleted'));
            navigation.reset({
                index: 0,
                routes: [{ name: 'Welcome' }],
            });
        } catch (error) {
            show(t('settings:messages.deleteFailed'), 'error');
        }
    };

    return (
        <View style={styles.container}>
            <MobileHeader
                title={t('settings:title')}
                subtitle={t('settings:subtitle')}
                onMenuPress={() => navigation.openDrawer && navigation.openDrawer()}
                backButton
                onBack={() => navigation.goBack()}
            />

            <ScrollView contentContainerStyle={styles.content}>

                {/* ... existing sections ... */}
                <SectionHeader title={t('settings:sections.account')} />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <SettingRow
                            icon={Settings}
                            label={t('settings:rows.editProfile')}
                            onPress={() => navigation.navigate('Profile')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={CreditCard}
                            label={t('settings:rows.paymentMethods')}
                            onPress={() => navigation.navigate('PaymentMethods')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Globe}
                            label={t('settings:rows.language')}
                            type="value"
                            value={language === 'es' ? t('common:language.es') : t('common:language.en')}
                            onPress={() => setLanguage(language === 'es' ? 'en' : 'es')}
                        />
                    </CardContent>
                </Card>

                <SectionHeader title={t('settings:sections.payments')} />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingIconContainer}>
                                {isTest ? <FlaskConical size={20} color="#F59E0B" /> : <Zap size={20} color="#10B981" />}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.settingLabel}>{t('settings:rows.paymentMode')}</Text>
                                <Text style={[styles.settingValueText, { color: isTest ? '#F59E0B' : '#10B981' }]}>
                                    {isTest ? t('settings:rows.testMode') : t('settings:rows.liveMode')}
                                </Text>
                            </View>
                            {/* Mismo PaymentModeContext que /Payment — Simulado | Producción */}
                            <Switch
                                value={isTest}
                                onValueChange={() => {
                                    toggle();
                                    show(t('settings:rows.paymentModeInfo'), 'info');
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
                                        {t('settings:rows.testBanner')}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </CardContent>
                </Card>

                <SectionHeader title={t('settings:sections.appearance')} />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <SettingRow
                            icon={theme === 'dark' ? Moon : Sun}
                            label={t('settings:rows.darkMode')}
                            type="switch"
                            value={theme === 'dark'}
                            onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        />
                    </CardContent>
                </Card>

                <SectionHeader title={t('settings:sections.securityPrivacy')} />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <SettingRow
                            icon={Shield}
                            label={t('settings:rows.privacySecurity')}
                            onPress={() => navigation.navigate('PrivacySecurity')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Key}
                            label={t('settings:rows.changePassword')}
                            onPress={() => navigation.navigate('ChangePassword')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Bell}
                            label={t('settings:rows.notificationInbox')}
                            onPress={() => navigation.navigate('Notifications')}
                        />
                    </CardContent>
                </Card>

                <SectionHeader title={t('settings:sections.notifications')} />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <SettingRow
                            icon={Bell}
                            label={t('settings:rows.pushNotifications')}
                            type="switch"
                            value={notifications.push}
                            onPress={() => toggleNotif('push')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Mail}
                            label={t('settings:rows.emails')}
                            type="switch"
                            value={notifications.email}
                            onPress={() => toggleNotif('email')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Target}
                            label={t('settings:rows.promotions')}
                            type="switch"
                            value={notifications.marketingEmails}
                            onPress={() => toggleNotif('marketingEmails')}
                        />
                    </CardContent>
                </Card>

                <SectionHeader title={t('settings:sections.legal')} />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <SettingRow
                            icon={FileText}
                            label={t('settings:rows.termsOfService')}
                            onPress={() => navigation.navigate('Terms')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            icon={Shield}
                            label={t('settings:rows.privacyPolicy')}
                            onPress={() => navigation.navigate('Privacy')}
                        />
                    </CardContent>
                </Card>

                <View style={{ height: 20 }} />

                <Button variant="outline" onPress={() => setLogoutModalVisible(true)}>
                    <Text style={{ color: '#dc2626' }}>{t('settings:actions.logout')}</Text>
                </Button>

                <TouchableOpacity onPress={() => setDeleteModalVisible(true)} style={{ marginTop: 24, marginBottom: 8, alignItems: 'center' }}>
                    <Text style={{ color: isDark ? '#6B7280' : '#9CA3AF', fontSize: 13, textDecorationLine: 'underline' }}>{t('settings:actions.deleteAccount')}</Text>
                </TouchableOpacity>

                <View style={{ height: 40 }} />
            </ScrollView>

            <Sheet open={logoutModalVisible} onOpenChange={setLogoutModalVisible}>
                <SheetContent side="bottom" style={styles.sheetContent}>
                    <SheetHeader>
                        <SheetTitle>{t('settings:actions.confirmLogoutTitle')}</SheetTitle>
                    </SheetHeader>
                    <View style={styles.sheetBody}>
                        <View style={[styles.confirmationIcon, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2' }]}>
                            <LogOut size={32} color={isDark ? '#ef4444' : '#dc2626'} />
                        </View>
                        <Text style={styles.sheetText}>
                            {t('settings:actions.confirmLogoutBody')}
                        </Text>
                        <View style={styles.sheetActions}>
                            <Button variant="outline" style={{ flex: 1 }} onPress={() => setLogoutModalVisible(false)}>
                                <Text style={{ color: isDark ? '#D1D5DB' : '#374151' }}>{t('common:buttons.cancel')}</Text>
                            </Button>
                            <Button
                                style={{ flex: 1, backgroundColor: '#dc2626' }}
                                onPress={handleLogout}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>{t('settings:actions.logout')}</Text>
                            </Button>
                        </View>
                    </View>
                </SheetContent>
            </Sheet>

            <Sheet open={deleteModalVisible} onOpenChange={setDeleteModalVisible}>
                <SheetContent side="bottom" style={styles.sheetContent}>
                    <SheetHeader>
                        <SheetTitle>{t('settings:actions.confirmDeleteTitle')}</SheetTitle>
                    </SheetHeader>
                    <View style={styles.sheetBody}>
                        <View style={[styles.confirmationIcon, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2' }]}>
                            <UserX size={32} color={isDark ? '#ef4444' : '#dc2626'} />
                        </View>
                        <Text style={styles.sheetText}>
                            {t('settings:actions.confirmDeleteBody')}
                        </Text>
                        <View style={styles.sheetActions}>
                            <Button variant="outline" style={{ flex: 1 }} onPress={() => setDeleteModalVisible(false)}>
                                <Text style={{ color: isDark ? '#D1D5DB' : '#374151' }}>{t('common:buttons.cancel')}</Text>
                            </Button>
                            <Button
                                style={{ flex: 1, backgroundColor: '#dc2626' }}
                                onPress={handleDelete}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>{t('settings:actions.deleteNow')}</Text>
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
