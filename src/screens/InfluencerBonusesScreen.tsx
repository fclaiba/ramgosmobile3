import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Platform } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { ChevronLeft, Ticket, Percent } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import * as Clipboard from 'expo-clipboard';

export default function InfluencerBonusesScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { session, user } = useAuth();
    const { show } = useToast();

    // Reusing the listings system for bonuses (type = 'bono')
    // We assume there's a way to query my listings
    const myBonuses = useQuery(api.listings.listMyBonuses, { sessionToken: session?.sessionToken });
    const createBono = useMutation(api.listings.createListing);

    const [isCreating, setIsCreating] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [discountValue, setDiscountValue] = useState<number>(40);

    const handleCreate = async () => {
        if (!title.trim()) {
            show("Ingresa un título para el bono", 'error');
            return;
        }

        try {
            await createBono({
                sessionToken: session?.sessionToken,
                title,
                description,
                type: 'bono',
                priceInCents: 0,
                stock: 9999, // Ilimitado temporalmente
                images: [],
                discountValue, // % 40, 50, 60
            });
            setIsCreating(false);
            setTitle('');
            setDescription('');
            show('Bono creado con éxito', 'success');
        } catch (error: any) {
            show(error.message, 'error');
        }
    };

    const copyBonoCode = (bonoId: string) => {
        const link = `https://ramgos.com/bono/${bonoId}`;
        Clipboard.setStringAsync(link);
        show('Enlace del bono copiado al portapapeles', 'success');
    };

    const styles = StyleSheet.create({
        container: { flex: 1, backgroundColor: isDark ? '#111827' : '#F3F4F6' },
        header: { padding: 16, backgroundColor: isDark ? '#1F2937' : '#FFFFFF', flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
        backBtn: { marginRight: 16 },
        title: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#FFFFFF' : '#111827' },
        content: { padding: 16 },
        formCard: { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 12 },
        formTitle: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#FFFFFF' : '#111827', marginBottom: 4 },
        formDesc: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', marginBottom: 8 },
        createBtn: { backgroundColor: '#2196F3', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, marginTop: 16 },
        createBtnText: { color: '#FFFFFF', fontWeight: 'bold', marginLeft: 8 },
        input: { backgroundColor: isDark ? '#374151' : '#F9FAFB', borderRadius: 8, padding: 12, color: isDark ? '#FFFFFF' : '#111827', marginBottom: 12 },
        label: { fontSize: 14, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151', marginBottom: 8 },
        typeSelector: { flexDirection: 'row', gap: 12, marginBottom: 16 },
        typeOption: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB', alignItems: 'center' },
        typeOptionSelected: { borderColor: '#2196F3', backgroundColor: isDark ? 'rgba(33, 150, 243, 0.1)' : '#EBF5FF' },
        typeOptionText: { color: isDark ? '#D1D5DB' : '#374151', fontWeight: 'bold', marginTop: 4, fontSize: 18 },
        cancelBtn: { padding: 16, alignItems: 'center' },
        cancelText: { color: isDark ? '#9CA3AF' : '#6B7280', fontWeight: '600' }
    });

    if (user?.role !== 'influencer') {
        return (
            <View style={styles.container}>
                <Text style={[styles.title, { padding: 24, textAlign: 'center' }]}>Acceso denegado</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft size={24} color={isDark ? '#FFFFFF' : '#111827'} />
                </TouchableOpacity>
                <Text style={styles.title}>Mis Bonos de Descuento</Text>
            </View>
            <ScrollView style={styles.content}>
                {isCreating ? (
                    <View style={styles.formCard}>
                        <Text style={styles.label}>Título del Bono</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ej. Bono especial RAMGOS"
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                            value={title}
                            onChangeText={setTitle}
                        />
                        <Text style={styles.label}>Descripción</Text>
                        <TextInput
                            style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                            placeholder="Detalles del bono..."
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                            multiline
                            value={description}
                            onChangeText={setDescription}
                        />
                        <Text style={styles.label}>Porcentaje de Descuento</Text>
                        <View style={styles.typeSelector}>
                            {[40, 50, 60].map(val => (
                                <TouchableOpacity
                                    key={val}
                                    style={[styles.typeOption, discountValue === val && styles.typeOptionSelected]}
                                    onPress={() => setDiscountValue(val)}
                                >
                                    <Percent size={20} color={discountValue === val ? '#2196F3' : (isDark ? '#9CA3AF' : '#6B7280')} />
                                    <Text style={styles.typeOptionText}>{val}%</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
                            <Text style={styles.createBtnText}>Generar Bono</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsCreating(false)}>
                            <Text style={styles.cancelText}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {myBonuses?.map((bono: any) => (
                            <TouchableOpacity key={bono._id} style={styles.formCard} onPress={() => copyBonoCode(bono._id)}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <View>
                                        <Text style={styles.formTitle}>{bono.title}</Text>
                                        <Text style={styles.formDesc}>{bono.description}</Text>
                                    </View>
                                    <View style={{ alignItems: 'center', justifyContent: 'center', backgroundColor: '#EBF5FF', padding: 8, borderRadius: 8 }}>
                                        <Text style={{ color: '#2196F3', fontWeight: 'bold', fontSize: 18 }}>{bono.discountValue}%</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.createBtn} onPress={() => setIsCreating(true)}>
                            <Ticket size={20} color="#FFFFFF" />
                            <Text style={styles.createBtnText}>Crear Nuevo Bono</Text>
                        </TouchableOpacity>
                    </>
                )}
            </ScrollView>
        </View>
    );
}
