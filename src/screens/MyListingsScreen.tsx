import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { useToast } from '../contexts/ToastContext';
import { Edit2, Trash2, Plus, PackageOpen, LayoutGrid, Search, ArrowLeft, MoreVertical } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '../components/ui/sheet';
import { glassShadow, Radius, colors } from '../theme/tokens';


const { width } = Dimensions.get('window');

export default function MyListingsScreen() {
    const { user, sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const navigation = useNavigation<any>();
    const { show } = useToast();

    // Using (user as any)._id because Convex users have _id
    const userId = (user as any)?._id || (user as any)?.id;
    const listings = useQuery(
        api.listings.getMyListings,
        userId && sessionToken ? { sellerId: userId, sessionToken } : "skip"
    );
    const deleteListing = useMutation(api.listings.deleteListing);

    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

    const [confirmDelete, setConfirmDelete] = useState<{id: any, title: string} | null>(null);

    const handleDelete = (id: any, title: string) => {
        setConfirmDelete({ id, title });
    };

    const handleEdit = (item: any) => {
        navigation.navigate('CreateListing', { editMode: true, initialData: item });
    };

    // --- RENDERERS ---

    const renderLoading = () => (
        <View style={[styles.centerContainer, isDark && styles.containerDark]}>
            <ActivityIndicator size="large" color="#4FC3F7" />
            <Text style={[styles.loadingText, isDark && styles.textDark]}>Cargando tus publicaciones...</Text>
        </View>
    );

    const renderEmpty = () => (
        <View style={styles.emptyState}>
            <View style={[styles.iconCircle, isDark && styles.iconCircleDark]}>
                <PackageOpen size={48} color={isDark ? '#5DD3F3' : '#2196F3'} />
            </View>
            <Text style={[styles.emptyTitle, isDark && styles.textDark]}>No hay publicaciones</Text>
            <Text style={styles.emptySub}>Aún no has puesto nada a la venta. ¡Empieza hoy mismo!</Text>

            <TouchableOpacity onPress={() => navigation.navigate('CreateListing')} activeOpacity={0.8}>
                <LinearGradient
                    colors={['#2196F3', '#EC4899']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.emptyBtn}
                >
                    <Plus size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.emptyBtnText}>Crear Publicación</Text>
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );

    const renderCard = ({ item }: { item: any }) => (
        <View style={[styles.card, isDark && styles.cardDark, { flexDirection: 'row' }]}>
            <Image
                source={{ uri: item.image || 'https://placehold.co/300x300.png' }}
                style={styles.cardImageList}
                resizeMode="cover"
            />
            <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, isDark && styles.textDark]} numberOfLines={1}>{item.title}</Text>
                    <View style={[styles.statusBadge, item.status === 'active' ? styles.statusActive : styles.statusInactive]}>
                        <Text style={[styles.statusText, item.status === 'active' ? styles.statusTextActive : styles.statusTextInactive]}>
                            {item.status === 'active' ? 'Activo' : 'Inactivo'}
                        </Text>
                    </View>
                </View>

                <Text style={styles.cardPrice}>${item.price?.toFixed(2) || '0.00'}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.category || 'Varios'} • Stock: {item.stock || 0}
                </Text>

                <View style={styles.cardActions}>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.editButton, isDark && styles.actionButtonDark]}
                        onPress={() => handleEdit(item)}
                    >
                        <Edit2 size={16} color={isDark ? '#60A5FA' : '#2563EB'} />
                        <Text style={[styles.actionText, { color: isDark ? '#60A5FA' : '#2563EB' }]}>Editar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, styles.deleteButton, isDark && styles.actionButtonDark]}
                        onPress={() => handleDelete(item._id, item.title)}
                    >
                        <Trash2 size={16} color={isDark ? '#F87171' : '#DC2626'} />
                        <Text style={[styles.actionText, { color: isDark ? '#F87171' : '#DC2626' }]}>Borrar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );

    if (listings === undefined) return renderLoading();

    return (
        <SafeAreaView style={[styles.container, isDark && styles.containerDark]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, isDark && styles.headerDark]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <ArrowLeft size={24} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, isDark && styles.textDark]}>Mis Publicaciones</Text>
                <TouchableOpacity onPress={() => navigation.navigate('CreateListing')} style={styles.iconBtn}>
                    <Plus size={24} color="#4FC3F7" />
                </TouchableOpacity>
            </View>

            {/* List */}
            <FlatList
                data={listings}
                renderItem={renderCard}
                keyExtractor={(item) => item._id}
                contentContainerStyle={[
                    styles.listContent,
                    listings.length === 0 && { flex: 1, justifyContent: 'center' }
                ]}
                ListEmptyComponent={renderEmpty}
                showsVerticalScrollIndicator={false}
            />

            {/* Confirm Delete Sheet */}
            <Sheet open={!!confirmDelete} onOpenChange={(open: boolean) => !open && setConfirmDelete(null)}>
                <SheetContent side="bottom" style={{ height: 'auto', paddingBottom: 40 }}>
                    <SheetHeader>
                        <SheetTitle>Eliminar Publicación</SheetTitle>
                        <SheetDescription>
                            {confirmDelete ? `¿Estás seguro de que quieres eliminar "${confirmDelete.title}"?\nEsta acción no se puede deshacer.` : ''}
                        </SheetDescription>
                    </SheetHeader>
                    <SheetFooter style={{ flexDirection: 'row', marginTop: 16, gap: 12 }}>
                        <TouchableOpacity 
                            style={[styles.actionButton, { flex: 1, justifyContent: 'center', backgroundColor: colors(isDark).glass }]} 
                            onPress={() => setConfirmDelete(null)}
                        >
                            <Text style={[styles.actionText, { color: colors(isDark).textMuted, fontSize: 16 }]}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.actionButton, styles.deleteButton, { flex: 1, justifyContent: 'center' }]} 
                            onPress={async () => {
                                if (confirmDelete) {
                                    try {
                                        await deleteListing({
                                            id: confirmDelete.id,
                                            sessionToken,
                                            sellerId: userId,
                                        });
                                    } catch (e) {
                                        show("No se pudo eliminar la publicación.", "error");
                                    }
                                    setConfirmDelete(null);
                                }
                            }}
                        >
                            <Text style={[styles.actionText, { color: '#DC2626', fontSize: 16 }]}>Eliminar</Text>
                        </TouchableOpacity>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </SafeAreaView>
    );
}

const getStyles = (isDark: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    containerDark: { backgroundColor: '#111827' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors(isDark).glass,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#1F2937' : '#F3F4F6',
    },
    headerDark: {
        backgroundColor: 'rgba(31,41,55,0.72)',
        borderBottomColor: isDark ? '#D1D5DB' : '#374151',
    },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
    iconBtn: { padding: 8 },

    listContent: { padding: 16, paddingBottom: 100 },

    // Card Styles
    card: {
        backgroundColor: colors(isDark).glass,
        borderRadius: Radius.lg,
        marginBottom: 16,
        padding: 12,
        ...glassShadow(isDark),
        borderWidth: 1,
        borderColor: 'transparent',
    },
    cardDark: {
        backgroundColor: 'rgba(31,41,55,0.72)',
        borderWidth: 1,
        borderColor: isDark ? '#D1D5DB' : '#374151',
    },
    cardImageList: {
        width: 100,
        height: 100,
        borderRadius: Radius.md,
    },
    cardContent: {
        flex: 1,
        marginLeft: 12,
        justifyContent: 'space-between'
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        flex: 1,
        marginRight: 8,
    },
    cardPrice: {
        fontSize: 18,
        fontWeight: '700',
        color: '#2196F3',
        marginTop: 4,
    },
    cardMeta: {
        fontSize: 12,
        color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280',
        marginTop: 2,
    },

    // Status Badge
    statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.md },
    statusActive: { backgroundColor: '#DCFCE7' },
    statusInactive: { backgroundColor: colors(isDark).glass },
    statusText: { fontSize: 10, fontWeight: '700' },
    statusTextActive: { color: '#166534' },
    statusTextInactive: { color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280' },

    // Actions
    cardActions: {
        flexDirection: 'row',
        marginTop: 8,
        gap: 8,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: Radius.sm,
        backgroundColor: '#FAFAFA',
    },
    actionButtonDark: {
        backgroundColor: isDark ? '#D1D5DB' : '#374151',
    },
    editButton: { backgroundColor: '#EFF6FF' },
    deleteButton: { backgroundColor: '#FEF2F2' },
    actionText: {
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
    },

    // Empty State
    emptyState: { alignItems: 'center', padding: 24 },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: Radius.full,
        backgroundColor: colors(isDark).glass,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    iconCircleDark: { backgroundColor: isDark ? '#D1D5DB' : '#374151' },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
    emptySub: { fontSize: 14, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280', textAlign: 'center', marginBottom: 24, paddingHorizontal: 32 },
    emptyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: Radius.xl,
        ...glassShadow(isDark),
    },
    emptyBtnText: { color: isDark ? '#09090B' : '#FAFAFA', fontWeight: 'bold', fontSize: 16 },

    // Misc
    loadingText: { marginTop: 16, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280' },
    textDark: { color: '#F9FAFB' },
});
