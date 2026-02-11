import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView, Platform, ScrollView } from 'react-native';
import { useNotifications, AppNotification } from '../contexts/NotificationsContext';
import { Bell, Check, Trash2, ArrowLeft, Package, CreditCard, Tag, Info } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Badge } from '../components/ui/badge';
import { useTheme } from '../contexts/ThemeContext';

const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getIconForType = (type: string, isDark: boolean) => {
    switch (type) {
        case 'order': return <Package size={20} color="#2563EB" />;
        case 'money': return <CreditCard size={20} color="#059669" />;
        case 'promo': return <Tag size={20} color="#7C3AED" />;
        case 'referral': return <UsersIcon color="#F59E0B" />;
        default: return <Bell size={20} color={isDark ? "#9CA3AF" : "#6B7280"} />;
    }
};

const UsersIcon = ({ color }: { color: string }) => (
    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
    </View>
);

export default function NotificationsScreen() {
    const { notifications, markAsRead, markAllAsRead, clearAll, deleteNotification } = useNotifications();
    const navigation = useNavigation();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const renderItem = ({ item }: { item: AppNotification }) => (
        <TouchableOpacity
            style={[styles.itemCallback, !item.read && styles.unreadItem]}
            onPress={() => markAsRead(item.id)}
            activeOpacity={0.7}
        >
            <View style={[styles.iconContainer, !item.read && styles.unreadIconContainer]}>
                {getIconForType(item.type, isDark)}
            </View>
            <View style={styles.contentContainer}>
                <View style={styles.headerRow}>
                    <Text style={[styles.title, !item.read && styles.unreadText]}>{item.title}</Text>
                    <Text style={styles.date}>{formatDate(item.date)}</Text>
                </View>
                <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
            </View>
            <TouchableOpacity style={styles.deleteAction} onPress={() => deleteNotification(item.id)}>
                <Trash2 size={16} color={isDark ? "#6B7280" : "#9CA3AF"} />
            </TouchableOpacity>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft size={24} color={isDark ? "#F9FAFB" : "#1F2937"} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Notificaciones</Text>
                <TouchableOpacity onPress={markAllAsRead} disabled={notifications.length === 0}>
                    <Text style={[styles.actionLink, notifications.length === 0 && styles.disabledLink]}>
                        Marcar todo leído
                    </Text>
                </TouchableOpacity>
            </View>

            {notifications.length === 0 ? (
                <View style={styles.emptyState}>
                    <Bell size={48} color={isDark ? "#374151" : "#D1D5DB"} />
                    <Text style={styles.emptyTitle}>Sin notificaciones</Text>
                    <Text style={styles.emptyText}>Te avisaremos cuando haya novedades importantes.</Text>
                </View>
            ) : (
                <FlatList
                    data={notifications}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.list}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                    ListFooterComponent={
                        <TouchableOpacity style={styles.clearAllBtn} onPress={clearAll}>
                            <Text style={styles.clearAllText}>Borrar historial</Text>
                        </TouchableOpacity>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#111827' : '#F9FAFB', paddingTop: Platform.OS === 'android' ? 30 : 0 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#374151' : '#E5E7EB'
    },
    backButton: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },
    actionLink: { color: '#3B82F6', fontWeight: '500', fontSize: 14 },
    disabledLink: { color: isDark ? '#4B5563' : '#9CA3AF' },

    list: { paddingVertical: 8 },
    itemCallback: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: isDark ? '#1F2937' : '#fff',
        alignItems: 'flex-start'
    },
    unreadItem: {
        backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF'  // Darker blue for dark mode
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: isDark ? '#374151' : '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12
    },
    unreadIconContainer: {
        backgroundColor: isDark ? '#1E40AF' : '#DBEAFE' // Light blue bg for unread icon
    },
    contentContainer: { flex: 1, marginRight: 8 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    title: { fontSize: 15, fontWeight: '500', color: isDark ? '#E5E7EB' : '#374151' },
    unreadText: { fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827' },
    date: { fontSize: 12, color: isDark ? '#9CA3AF' : '#9CA3AF' },
    body: { fontSize: 14, color: isDark ? '#D1D5DB' : '#6B7280', lineHeight: 20 },
    deleteAction: { padding: 4 },
    separator: { height: 1, backgroundColor: isDark ? '#374151' : '#E5E7EB', marginLeft: 68 },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: isDark ? '#F9FAFB' : '#374151', marginTop: 16, marginBottom: 8 },
    emptyText: { textAlign: 'center', color: isDark ? '#9CA3AF' : '#6B7280' },

    clearAllBtn: { padding: 16, alignItems: 'center' },
    clearAllText: { color: '#EF4444', fontSize: 14, fontWeight: '500' },
});
