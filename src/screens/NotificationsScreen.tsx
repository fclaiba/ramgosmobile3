import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView, Platform, ScrollView } from 'react-native';
import { useNotifications, AppNotification } from '../contexts/NotificationsContext';
import { Bell, Check, Trash2, ArrowLeft, Package, CreditCard, Tag, Info } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Badge } from '../components/ui/badge';

const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getIconForType = (type: string) => {
    switch (type) {
        case 'order': return <Package size={20} color="#2563EB" />;
        case 'money': return <CreditCard size={20} color="#059669" />;
        case 'promo': return <Tag size={20} color="#7C3AED" />;
        case 'referral': return <UsersIcon color="#F59E0B" />;
        default: return <Bell size={20} color="#6B7280" />;
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

    const renderItem = ({ item }: { item: AppNotification }) => (
        <TouchableOpacity
            style={[styles.itemCallback, !item.read && styles.unreadItem]}
            onPress={() => markAsRead(item.id)}
            activeOpacity={0.7}
        >
            <View style={styles.iconContainer}>
                {getIconForType(item.type)}
            </View>
            <View style={styles.contentContainer}>
                <View style={styles.headerRow}>
                    <Text style={[styles.title, !item.read && styles.unreadText]}>{item.title}</Text>
                    <Text style={styles.date}>{formatDate(item.date)}</Text>
                </View>
                <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
            </View>
            <TouchableOpacity style={styles.deleteAction} onPress={() => deleteNotification(item.id)}>
                <Trash2 size={16} color="#9CA3AF" />
            </TouchableOpacity>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft size={24} color="#1F2937" />
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
                    <Bell size={48} color="#D1D5DB" />
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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB', paddingTop: Platform.OS === 'android' ? 30 : 0 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    backButton: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
    actionLink: { color: '#2563EB', fontWeight: '500', fontSize: 14 },
    disabledLink: { color: '#9CA3AF' },

    list: { paddingVertical: 8 },
    itemCallback: { flexDirection: 'row', padding: 16, backgroundColor: '#fff', alignItems: 'flex-start' },
    unreadItem: { backgroundColor: '#EFF6FF' },
    iconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    contentContainer: { flex: 1, marginRight: 8 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    title: { fontSize: 15, fontWeight: '500', color: '#374151' },
    unreadText: { fontWeight: '700', color: '#111827' },
    date: { fontSize: 12, color: '#9CA3AF' },
    body: { fontSize: 14, color: '#6B7280', lineHeight: 20 },
    deleteAction: { padding: 4 },
    separator: { height: 1, backgroundColor: '#E5E7EB', marginLeft: 68 },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16, marginBottom: 8 },
    emptyText: { textAlign: 'center', color: '#6B7280' },

    clearAllBtn: { padding: 16, alignItems: 'center' },
    clearAllText: { color: '#EF4444', fontSize: 14, fontWeight: '500' },
});
