import React, { useState } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    Platform,
    Switch,
    ActivityIndicator,
} from 'react-native';
import { useNotifications, AppNotification } from '../contexts/NotificationsContext';
import {
    Bell,
    Trash2,
    ArrowLeft,
    Package,
    CreditCard,
    Tag,
    Settings2,
    MessageCircle,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { colors, Radius, Space } from '../theme/tokens';

const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getIconForType = (type: string, isDark: boolean) => {
    switch (type) {
        case 'order':
            return <Package size={20} color="#2563EB" />;
        case 'payment':
        case 'money':
            return <CreditCard size={20} color="#059669" />;
        case 'promo':
        case 'campaign':
            return <Tag size={20} color="#7C3AED" />;
        case 'social':
        case 'dispute':
            return <MessageCircle size={20} color="#F59E0B" />;
        default:
            return <Bell size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />;
    }
};

export default function NotificationsScreen() {
    const {
        notifications,
        markAsRead,
        markAllAsRead,
        clearAll,
        deleteNotification,
        preferences,
        updatePreferences,
        loading,
        unreadCount,
    } = useNotifications();
    const navigation = useNavigation();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const styles = getStyles(isDark, c);
    const { show } = useToast();
    const [tab, setTab] = useState<'inbox' | 'prefs'>('inbox');

    const togglePref = async (key: keyof typeof preferences) => {
        try {
            await updatePreferences({ [key]: !preferences[key] });
            show('Preferencia actualizada', 'success');
        } catch {
            show('No se pudo guardar', 'error');
        }
    };

    const renderItem = ({ item }: { item: AppNotification }) => (
        <TouchableOpacity
            style={[styles.item, !item.read && styles.unreadItem]}
            onPress={() => markAsRead(item.id)}
            activeOpacity={0.7}
        >
            <View style={[styles.iconContainer, !item.read && styles.unreadIconContainer]}>
                {getIconForType(item.type, isDark)}
            </View>
            <View style={styles.contentContainer}>
                <View style={styles.headerRow}>
                    <Text style={[styles.title, !item.read && styles.unreadText]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    <Text style={styles.date}>{formatDate(item.date)}</Text>
                </View>
                <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
            </View>
            <TouchableOpacity style={styles.deleteAction} onPress={() => deleteNotification(item.id)}>
                <Trash2 size={16} color={c.textSubtle} />
            </TouchableOpacity>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft size={24} color={c.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Notificaciones</Text>
                {tab === 'inbox' ? (
                    <TouchableOpacity onPress={markAllAsRead} disabled={notifications.length === 0}>
                        <Text style={[styles.actionLink, notifications.length === 0 && styles.disabledLink]}>
                            Leer todo
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 72 }} />
                )}
            </View>

            <View style={styles.tabs}>
                <TouchableOpacity
                    style={[styles.tab, tab === 'inbox' && styles.tabActive]}
                    onPress={() => setTab('inbox')}
                >
                    <Bell size={16} color={tab === 'inbox' ? c.primary : c.textMuted} />
                    <Text style={[styles.tabText, tab === 'inbox' && styles.tabTextActive]}>
                        Bandeja{unreadCount > 0 ? ` (${unreadCount})` : ''}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, tab === 'prefs' && styles.tabActive]}
                    onPress={() => setTab('prefs')}
                >
                    <Settings2 size={16} color={tab === 'prefs' ? c.primary : c.textMuted} />
                    <Text style={[styles.tabText, tab === 'prefs' && styles.tabTextActive]}>Preferencias</Text>
                </TouchableOpacity>
            </View>

            {tab === 'prefs' ? (
                <View style={styles.prefsBox}>
                    {(
                        [
                            ['push', 'Push', 'Avisos en el dispositivo'],
                            ['email', 'Email', 'Resúmenes y alertas por correo'],
                            ['sms', 'SMS', 'Mensajes de texto (si disponible)'],
                            ['marketingEmails', 'Promociones', 'Ofertas y campañas'],
                        ] as const
                    ).map(([key, label, hint], i, arr) => (
                        <View key={key}>
                            <View style={styles.prefRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.prefLabel}>{label}</Text>
                                    <Text style={styles.prefHint}>{hint}</Text>
                                </View>
                                <Switch
                                    value={preferences[key]}
                                    onValueChange={() => togglePref(key)}
                                    trackColor={{ false: '#767577', true: c.primary }}
                                    thumbColor="#fff"
                                />
                            </View>
                            {i < arr.length - 1 && <View style={styles.divider} />}
                        </View>
                    ))}
                </View>
            ) : loading ? (
                <View style={styles.emptyState}>
                    <ActivityIndicator color={c.primary} />
                </View>
            ) : notifications.length === 0 ? (
                <View style={styles.emptyState}>
                    <Bell size={48} color={c.textSubtle} />
                    <Text style={styles.emptyTitle}>Sin notificaciones</Text>
                    <Text style={styles.emptyText}>Te avisaremos cuando haya novedades importantes.</Text>
                </View>
            ) : (
                <FlatList
                    data={notifications}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.list}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                    ListFooterComponent={
                        <TouchableOpacity style={styles.clearAllBtn} onPress={clearAll}>
                            <Text style={styles.clearAllText}>Borrar historial</Text>
                        </TouchableOpacity>
                    }
                />
            )}
        </View>
    );
}

const getStyles = (isDark: boolean, c: ReturnType<typeof colors>) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: c.bg,
            paddingTop: Platform.OS === 'android' ? 30 : Platform.OS === 'ios' ? 50 : 16,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 16,
            backgroundColor: c.glassStrong,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.border,
        },
        backButton: { padding: 4 },
        headerTitle: { fontSize: 18, fontWeight: '700', color: c.text },
        actionLink: { color: c.primary, fontWeight: '600', fontSize: 13, width: 72, textAlign: 'right' },
        disabledLink: { color: c.textSubtle },
        tabs: {
            flexDirection: 'row',
            margin: Space[4],
            marginBottom: Space[2],
            padding: 4,
            borderRadius: Radius.lg,
            backgroundColor: c.glass,
            gap: 4,
        },
        tab: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: Radius.md,
        },
        tabActive: { backgroundColor: c.bgElevated },
        tabText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
        tabTextActive: { color: c.primary },
        list: { paddingVertical: 8 },
        item: {
            flexDirection: 'row',
            padding: 16,
            backgroundColor: c.glassStrong,
            alignItems: 'flex-start',
        },
        unreadItem: {
            backgroundColor: isDark ? 'rgba(124,58,237,0.12)' : '#F5F3FF',
        },
        iconContainer: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: c.glass,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
        },
        unreadIconContainer: {
            backgroundColor: c.primaryMuted,
        },
        contentContainer: { flex: 1, marginRight: 8 },
        headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
        title: { fontSize: 15, fontWeight: '500', color: c.textMuted, flex: 1 },
        unreadText: { fontWeight: '700', color: c.text },
        date: { fontSize: 11, color: c.textSubtle },
        body: { fontSize: 14, color: c.textMuted, lineHeight: 20 },
        deleteAction: { padding: 4 },
        separator: { height: StyleSheet.hairlineWidth, backgroundColor: c.divider, marginLeft: 68 },
        emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
        emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text, marginTop: 16, marginBottom: 8 },
        emptyText: { textAlign: 'center', color: c.textMuted },
        clearAllBtn: { padding: 16, alignItems: 'center' },
        clearAllText: { color: '#EF4444', fontSize: 14, fontWeight: '600' },
        prefsBox: {
            margin: Space[4],
            borderRadius: Radius.xl,
            overflow: 'hidden',
            backgroundColor: c.glassStrong,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
        },
        prefRow: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 16,
            gap: 12,
        },
        prefLabel: { fontSize: 15, fontWeight: '600', color: c.text },
        prefHint: { fontSize: 12, color: c.textMuted, marginTop: 2 },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.divider, marginLeft: 16 },
    });
