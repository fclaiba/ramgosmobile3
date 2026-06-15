import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    useWindowDimensions,
    ScrollView,
} from 'react-native';
import { Package, Ticket, Calendar, Briefcase, Tag } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MobileHeader } from '../components/MobileHeader';
import { useBusiness } from '../contexts/BusinessContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UnifiedListingForm, ListingType } from '../components/forms/UnifiedListingForm';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

export default function BusinessCreateScreen({ navigation, route }: any) {
    const [selectedType, setSelectedType] = useState<ListingType | null>(route?.params?.type || null);

    useEffect(() => {
        if (route?.params?.type) {
            setSelectedType(route.params.type as ListingType);
        }
    }, [route?.params?.type]);

    const { branches } = useBusiness();
    const { show } = useToast();
    const { width } = useWindowDimensions();
    const { colorScheme } = useTheme();
    const { requireKycFor } = useAuth();
    const isDark = colorScheme === 'dark';
    const styles = useMemo(() => getStyles(isDark), [isDark]);

    const initialData = route?.params?.initialData;
    const isEditMode = !!initialData;

    const toISO = (dateStr: string) => {
        if (!dateStr) return new Date().toISOString();
        if (dateStr.includes('-')) return new Date(dateStr).toISOString(); // already ISO or YYYY-MM-DD
        if (dateStr.includes('/')) {
            const [day, month, year] = dateStr.split('/');
            return new Date(Number(year), Number(month) - 1, Number(day)).toISOString();
        }
        return new Date().toISOString();
    };

    const createListingConvex = useMutation(api.listings.createListing);
    const updateListingConvex = useMutation(api.listings.updateListing);

    const handleUnifiedSubmit = async (data: any) => {
        if (!selectedType) return;

        await new Promise((resolve) => {
            requireKycFor('business', async () => {
                try {
                    // 1. Sync directly to Convex Marketplace database
                    const commonData = {
                        title: data.name,
                        description: data.description || 'Sin descripción',
                        price: Number(data.price) || 0,
                        stock: Number(data.stock) || (selectedType === 'event' ? Number(data.capacity) : 1),
                        condition: 'new' as const,
                        type: selectedType as 'product' | 'service' | 'event' | 'bono',
                        category: data.category || (selectedType === 'service' ? 'Servicios' : selectedType === 'event' ? 'Eventos' : 'General'),
                        image: data.images?.[0] || undefined,
                        gallery: data.images || [],
                        location: {
                            lat: -34.603722,
                            lng: -58.381592,
                            name: 'Sucursal', 
                            address: 'Av. Libertador 123',
                            distanceKm: 2,
                        },
                        eventDate: selectedType === 'event' ? toISO(data.date) : undefined,
                        eventTime: data.time,
                        validUntil: selectedType === 'bono' ? toISO(data.endDate) : undefined,
                        discountValue: selectedType === 'bono' ? Number(data.value) || 0 : undefined,
                        discountType: selectedType === 'bono' ? 'fixed' : undefined,
                    };

                    if (isEditMode && initialData?.id) {
                        await updateListingConvex({
                            id: initialData.id,
                            updates: commonData
                        });
                        show('Publicación actualizada correctamente', 'success');
                    } else {
                        await createListingConvex(commonData);
                        show('Publicado en Marketplace exitosamente', 'success');
                    }

                    if (navigation.canGoBack()) {
                        navigation.goBack();
                    } else {
                        navigation.navigate('BusinessDashboard');
                    }

                } catch (e: any) {
                    show(e.message || 'Error al publicar', 'error');
                }
                resolve(true);
            });
        });
    };

    const CREATION_TYPES = [
        { id: 'product', label: 'Producto', icon: Package, desc: 'Vende artículos físicos', color: ['#3B82F6', '#2563EB'] },
        { id: 'service', label: 'Servicio', icon: Briefcase, desc: 'Ofrece tus servicios', color: ['#8B5CF6', '#7C3AED'] },
        { id: 'event', label: 'Evento', icon: Calendar, desc: 'Vende entradas', color: ['#F59E0B', '#D97706'] },
        { id: 'bono', label: 'Bono', icon: Tag, desc: 'Ofrece cupones', color: ['#10B981', '#059669'] },
    ] as const;

    if (selectedType) {
        return (
            <View style={styles.container}>
                <MobileHeader
                    title={isEditMode ? 'Editar Publicación' : 'Nueva Publicación'}
                    backButton={true}
                    onBack={() => setSelectedType(null)}
                />
                <UnifiedListingForm
                    type={selectedType}
                    initialData={initialData}
                    onSubmit={handleUnifiedSubmit}
                    onCancel={() => setSelectedType(null)}
                    branches={branches}
                />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Crear Nuevo"
                backButton={true}
                onBack={() => {
                    if (navigation.canGoBack()) navigation.goBack();
                    else navigation.navigate('BusinessDashboard');
                }}
            />
            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <Text style={styles.sectionTitle}>¿Qué deseas publicar hoy?</Text>
                <View style={styles.grid}>
                    {CREATION_TYPES.map((type) => (
                        <TouchableOpacity
                            key={type.id}
                            style={styles.typeCard}
                            onPress={() => setSelectedType(type.id as ListingType)}
                        >
                            <LinearGradient
                                colors={type.color}
                                style={styles.cardGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <type.icon size={32} color="#fff" />
                                <Text style={styles.cardTitle}>{type.label}</Text>
                                <Text style={styles.cardDesc}>{type.desc}</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#111827' : '#f8fafc' },
    sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4, color: isDark ? '#F9FAFB' : '#0f172a' },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
    },
    typeCard: {
        width: '47%',
        aspectRatio: 1,
        borderRadius: 16,
        overflow: 'hidden',
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 10,
    },
    cardGradient: {
        flex: 1,
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardTitle: {
        marginTop: 12,
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        textAlign: 'center',
    },
    cardDesc: {
        marginTop: 4,
        fontSize: 12,
        color: 'rgba(255,255,255,0.9)',
        textAlign: 'center',
    },

    selectorCard: {
        flexDirection: 'row',
        gap: 16,
        padding: 18,
        borderRadius: 16,
        backgroundColor: isDark ? '#1F2937' : '#fff',
        marginBottom: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: isDark ? '#374151' : 'transparent',
    },
    selectorIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectorTitle: { fontSize: 16, fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827' },
    selectorSubtitle: { fontSize: 13, color: isDark ? '#9CA3AF' : '#64748b', marginTop: 4 },
    formWrapper: { gap: 16 },
    formCard: { padding: 16, borderRadius: 16, backgroundColor: isDark ? '#1F2937' : '#fff', gap: 16, borderWidth: 1, borderColor: isDark ? '#374151' : 'transparent' },
    formGroup: { gap: 8 },
    formRow: { flexDirection: 'row', gap: 12 },
    formColumn: { flex: 1, gap: 6 },
    inputGroup: { gap: 8 },
    label: { fontSize: 13, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },
    input: {
        backgroundColor: isDark ? '#374151' : '#F9FAFB',
        borderWidth: 1,
        borderColor: isDark ? '#4B5563' : '#E5E7EB',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 14,
        color: isDark ? '#F9FAFB' : '#111827',
    },

    // Picker Styles
    pickerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: isDark ? '#374151' : '#F9FAFB',
        borderWidth: 1,
        borderColor: isDark ? '#4B5563' : '#E5E7EB',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    pickerText: {
        fontSize: 14,
        color: isDark ? '#F9FAFB' : '#111827',
    },
    placeholderText: {
        color: isDark ? '#9CA3AF' : '#9CA3AF',
    },
    pickerDropdown: {
        marginTop: 8,
        backgroundColor: isDark ? '#374151' : '#fff',
        borderWidth: 1,
        borderColor: isDark ? '#4B5563' : '#E5E7EB',
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 4,
    },
    pickerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#4B5563' : '#F3F4F6',
    },
    pickerItemText: {
        fontSize: 14,
        color: isDark ? '#D1D5DB' : '#4B5563',
    },
    pickerItemTextActive: {
        color: '#2563EB',
        fontWeight: '600',
    },

    inputMultiline: { height: 100, textAlignVertical: 'top' },
    toggle: {
        height: 42,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDark ? '#111827' : 'transparent',
    },
    toggleActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    toggleLabel: { fontSize: 14, fontWeight: '600', color: isDark ? '#9CA3AF' : '#475569' },
    toggleLabelActive: { color: '#fff' },
    selectorRow: { flexDirection: 'row', gap: 10 },
    selectorChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#e2e8f0',
        backgroundColor: isDark ? '#111827' : '#fff',
    },
    selectorChipActive: { backgroundColor: isDark ? '#F3F4F6' : '#111827', borderColor: isDark ? '#F3F4F6' : '#111827' },
    selectorChipText: { fontSize: 12, fontWeight: '600', color: isDark ? '#9CA3AF' : '#475569' },
    selectorChipTextActive: { color: isDark ? '#000' : '#fff' },
    branchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    branchChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: isDark ? '#4B5563' : '#cbd5f5',
        backgroundColor: isDark ? '#1F2937' : '#f8fafc',
    },
    branchChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    branchChipText: { fontSize: 12, fontWeight: '600', color: isDark ? '#9CA3AF' : '#475569' },
    branchChipTextActive: { color: '#fff' },
    buttonTextLight: { color: '#fff', fontWeight: '600', fontSize: 14 },
    buttonTextDark: { color: isDark ? '#111827' : '#111827', fontWeight: '600', fontSize: 14 },
    placeholderCard: { padding: 24, borderRadius: 18, backgroundColor: isDark ? '#1F2937' : '#fff', gap: 12, marginTop: 16 },
    placeholderTitle: { fontSize: 18, fontWeight: '700', color: isDark ? '#F9FAFB' : '#0f172a' },
    placeholderCopy: { fontSize: 14, color: isDark ? '#9CA3AF' : '#475569', lineHeight: 20 },
});
