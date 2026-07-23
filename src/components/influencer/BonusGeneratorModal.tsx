import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, TextInput } from 'react-native';
import { X, Gift } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { glassSurface } from '../../utils/glass';
import { useResponsive } from '../../hooks/useResponsive';

interface Props {
    visible: boolean;
    onClose: () => void;
    user: any;
}

export default function BonusGeneratorModal({ visible, onClose, user }: Props) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { show } = useToast();
    const { width: windowWidth, height: windowHeight } = useResponsive();

    const [bonoTitle, setBonoTitle] = useState('');
    const [bonoDiscount, setBonoDiscount] = useState('40'); // 40, 50, 60
    const [bonoDescription, setBonoDescription] = useState('Cupón exclusivo para mis seguidores.');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const createListingMutation = useMutation(api.listings.createListing);

    const handleCreateBono = async () => {
        if (!user) {
            show('Debes iniciar sesión.', 'error');
            return;
        }
        const discount = Number(bonoDiscount);
        if (![40, 50, 60].includes(discount)) {
            show('El descuento debe ser 40, 50 o 60%.', 'warning');
            return;
        }
        if (!bonoTitle.trim()) {
            show('Ingresa un título para el bono', 'warning');
            return;
        }
        
        setIsSubmitting(true);
        try {
            await createListingMutation({
                title: bonoTitle,
                description: bonoDescription,
                price: 0,
                type: 'bono',
                category: 'social',
                stock: 1000,
                discountPercent: discount,
            });
            onClose();
            show(`¡Bono del ${discount}% creado con éxito!`, 'success');
        } catch (error: any) {
            show(error.message || 'Error al crear bono', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={[styles.modalView, glassSurface(isDark, 'prominent'), { maxHeight: windowHeight * 0.86 }]}>
                    <View style={styles.modalHeaderRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.modalTitle, { color: isDark ? '#fff' : '#111827' }]}>Crear Bono de Descuento</Text>
                            <Text style={[styles.modalText, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>Tus seguidores podrán reclamar este bono en la plataforma.</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} accessibilityRole="button">
                            <X size={18} color={isDark ? '#CBD5E1' : '#64748b'} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
                        <View style={styles.formGroup}>
                            <Text style={[styles.modalLabel, { color: isDark ? '#E2E8F0' : '#374151' }]}>Título del bono</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff', color: isDark ? '#fff' : '#111827', borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]}
                                placeholder="Ej: Promo de Verano 50%"
                                value={bonoTitle}
                                onChangeText={setBonoTitle}
                                placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={[styles.modalLabel, { color: isDark ? '#E2E8F0' : '#374151' }]}>Porcentaje de descuento (%)</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                                {['40', '50', '60'].map((perc) => (
                                    <TouchableOpacity
                                        key={perc}
                                        style={[
                                            styles.input,
                                            { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff', borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' },
                                            bonoDiscount === perc && { borderColor: '#4f46e5', backgroundColor: isDark ? 'rgba(79, 70, 229, 0.2)' : 'rgba(79, 70, 229, 0.1)' }
                                        ]}
                                        onPress={() => setBonoDiscount(perc)}
                                    >
                                        <Text style={[{ color: isDark ? '#fff' : '#111827', fontWeight: '600' }, bonoDiscount === perc && { color: '#4f46e5' }]}>{perc}%</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={[styles.modalLabel, { color: isDark ? '#E2E8F0' : '#374151' }]}>Descripción</Text>
                            <TextInput
                                style={[styles.input, styles.inputMultiline, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff', color: isDark ? '#fff' : '#111827', borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]}
                                placeholder="Instrucciones para usar el bono"
                                value={bonoDescription}
                                onChangeText={setBonoDescription}
                                multiline
                                placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                            />
                        </View>
                    </ScrollView>

                    <View style={styles.modalFooter}>
                        <View style={[styles.modalActionsRow, windowWidth < 420 && { flexDirection: 'column' }]}>
                            <TouchableOpacity onPress={onClose} style={[styles.btn, styles.btnOutline, windowWidth < 420 ? { width: '100%' } : { flex: 1 }]}>
                                <Text style={{ color: isDark ? '#D1D5DB' : '#111827', fontWeight: '700' }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity disabled={isSubmitting} onPress={handleCreateBono} style={[styles.btn, styles.btnPrimary, windowWidth < 420 ? { width: '100%' } : { flex: 1 }]}>
                                <Gift size={16} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={{ color: '#fff', fontWeight: '800' }}>Crear bono</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalView: {
        width: '100%',
        maxWidth: 500,
        borderRadius: 24,
        padding: 24,
    },
    modalHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        marginBottom: 4,
    },
    modalText: {
        fontSize: 14,
    },
    modalCloseBtn: {
        padding: 8,
        backgroundColor: 'rgba(128,128,128,0.1)',
        borderRadius: 20,
    },
    modalScroll: {
        paddingBottom: 24,
    },
    formGroup: {
        marginBottom: 20,
    },
    modalLabel: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
    },
    inputMultiline: {
        height: 100,
        textAlignVertical: 'top',
    },
    modalFooter: {
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(128,128,128,0.1)',
    },
    modalActionsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
    },
    btnOutline: {
        borderWidth: 1,
        borderColor: 'rgba(128,128,128,0.2)',
    },
    btnPrimary: {
        backgroundColor: '#4f46e5',
    },
});
