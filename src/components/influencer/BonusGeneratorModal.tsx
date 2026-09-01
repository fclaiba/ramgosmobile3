import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, TextInput } from 'react-native';
import { X, Gift } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useAuth } from '../../contexts/AuthContext';
import { glassSurface } from '../../utils/glass';
import { useResponsive } from '../../hooks/useResponsive';
import { ImageUploadField } from '../ui/ImageUploadField';

interface Props {
    visible: boolean;
    onClose: () => void;
    user: any;
}

const DEFAULT_PAID = '50';
const DEFAULT_CREDIT = '100';
const DEFAULT_DAYS = '4';

export default function BonusGeneratorModal({ visible, onClose, user }: Props) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { show } = useToast();
    const { width: windowWidth, height: windowHeight } = useResponsive();
    const { sessionToken } = useAuth();

    const [bonoTitle, setBonoTitle] = useState('');
    const [bonoDescription, setBonoDescription] = useState(
        'Pagás el precio y recibís crédito para gastar en el negocio.',
    );
    const [paidPrice, setPaidPrice] = useState(DEFAULT_PAID);
    const [creditValue, setCreditValue] = useState(DEFAULT_CREDIT);
    const [validityDays, setValidityDays] = useState(DEFAULT_DAYS);
    const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const createListingMutation = useMutation(api.listings.createListing);
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);

    const campaignRows =
        useQuery(
            api.campaigns.getMyCampaigns,
            user?.id ? { influencerId: user.id as Id<'users'>, sessionToken } : 'skip',
        ) ?? [];
    const whitelistedBusinesses =
        useQuery(
            api.influencers.getMyWhitelistedBusinesses,
            user?.id && sessionToken ? { sessionToken } : 'skip',
        ) ?? [];

    const businessOptions = useMemo(() => {
        const active = campaignRows.filter((c: any) => c.status === 'active');
        const byId = new Map<string, { id: string; name: string; source: string }>();
        for (const c of active) {
            const id = String(c.businessId || '');
            if (!id || byId.has(id)) continue;
            byId.set(id, {
                id,
                name: c.businessName || 'Negocio',
                source: 'campaña',
            });
        }
        for (const b of whitelistedBusinesses) {
            const id = String(b.businessId || '');
            if (!id) continue;
            if (byId.has(id)) {
                const prev = byId.get(id)!;
                byId.set(id, { ...prev, source: 'campaña + whitelist' });
                continue;
            }
            byId.set(id, {
                id,
                name: b.name || 'Negocio',
                source: 'whitelist',
            });
        }
        return Array.from(byId.values());
    }, [campaignRows, whitelistedBusinesses]);

    useEffect(() => {
        if (!visible) return;
        if (businessOptions.length === 1) {
            setSelectedBusinessId(businessOptions[0].id);
            return;
        }
        if (
            selectedBusinessId &&
            !businessOptions.some((b) => b.id === selectedBusinessId)
        ) {
            setSelectedBusinessId('');
        }
    }, [visible, businessOptions, selectedBusinessId]);

    const resetForm = () => {
        setBonoTitle('');
        setBonoDescription('Pagás el precio y recibís crédito para gastar en el negocio.');
        setPaidPrice(DEFAULT_PAID);
        setCreditValue(DEFAULT_CREDIT);
        setValidityDays(DEFAULT_DAYS);
        setSelectedBusinessId('');
        setPhotos([]);
    };

    const uploadPhoto = async (uri: string): Promise<string> => {
        const isStorageId =
            !uri.startsWith('http') &&
            !uri.startsWith('blob:') &&
            !uri.startsWith('data:') &&
            !uri.startsWith('file:') &&
            uri.length < 64;
        const isRemoteUrl =
            (uri.startsWith('http') || uri.startsWith('https')) && !uri.startsWith('blob:');
        if (isStorageId || isRemoteUrl) return uri;

        if (!user?.id) {
            throw new Error('Debes iniciar sesión para subir imágenes.');
        }

        const postUrl = await generateUploadUrl({
            sessionToken,
            actorId: String(user.id),
        });
        const response = await fetch(uri);
        const blob = await response.blob();
        const result = await fetch(postUrl, {
            method: 'POST',
            headers: {
                'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
            },
            body: blob,
        });
        if (!result.ok) {
            throw new Error('No se pudo subir la imagen al servidor.');
        }
        const { storageId } = await result.json();
        if (!storageId) {
            throw new Error('El servidor no devolvió un ID de imagen.');
        }
        return storageId as string;
    };

    const handleCreateBono = async () => {
        if (!user) {
            show('Debes iniciar sesión.', 'error');
            return;
        }
        if (!bonoTitle.trim()) {
            show('Ingresá un título para el bono', 'warning');
            return;
        }
        if (!selectedBusinessId) {
            show(
                'Elegí el negocio emisor (necesitás campaña activa o estar en su whitelist).',
                'warning',
            );
            return;
        }
        if (photos.length === 0) {
            show('Subí una foto del bono.', 'warning');
            return;
        }
        const price = Number(paidPrice);
        const credit = Number(creditValue);
        const days = Math.floor(Number(validityDays) || 4);
        if (!Number.isFinite(credit) || credit <= 0) {
            show('El crédito debe ser mayor a 0.', 'warning');
            return;
        }
        if (!Number.isFinite(price) || price <= 0) {
            show('El precio pagado debe ser mayor a 0.', 'warning');
            return;
        }

        setIsSubmitting(true);
        try {
            const uploadedImages = await Promise.all(photos.map((uri) => uploadPhoto(uri)));
            await createListingMutation({
                sessionToken,
                title: bonoTitle.trim(),
                description: bonoDescription.trim() || `Pagás $${price} y tenés $${credit} de crédito.`,
                price,
                discountValue: credit,
                discountType: 'fixed',
                validityDays: Math.min(Math.max(days, 1), 365),
                type: 'bono',
                category: 'Bono',
                stock: 1000,
                sellerId: selectedBusinessId,
                image: uploadedImages[0],
                gallery: uploadedImages,
            });
            resetForm();
            onClose();
            show(`Bono creado: pagás $${price} · crédito $${credit}`, 'success');
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
                <View
                    style={[
                        styles.modalView,
                        glassSurface(isDark, 'prominent'),
                        { maxHeight: windowHeight * 0.9 },
                    ]}
                >
                    <View style={styles.modalHeaderRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.modalTitle, { color: isDark ? '#fff' : '#111827' }]}>
                                Crear bono de crédito
                            </Text>
                            <Text
                                style={[
                                    styles.modalText,
                                    { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' },
                                ]}
                            >
                                El seguidor paga un precio y recibe más crédito para gastar en el negocio.
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={onClose}
                            style={styles.modalCloseBtn}
                            accessibilityRole="button"
                        >
                            <X size={18} color={isDark ? '#CBD5E1' : '#64748b'} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        contentContainerStyle={styles.modalScroll}
                        keyboardShouldPersistTaps="handled"
                    >
                        <View style={styles.formGroup}>
                            <Text style={[styles.modalLabel, { color: isDark ? '#E2E8F0' : '#374151' }]}>
                                Negocio emisor
                            </Text>
                            {businessOptions.length === 0 ? (
                                <Text
                                    style={{
                                        color: isDark ? '#FCA5A5' : '#B91C1C',
                                        fontSize: 13,
                                        lineHeight: 18,
                                    }}
                                >
                                    No tenés negocios autorizados. Pedile a un negocio que te añada a su
                                    whitelist o que te invite a una campaña (y aceptala).
                                </Text>
                            ) : (
                                <View style={{ gap: 8 }}>
                                    {businessOptions.map((b) => {
                                        const selected = selectedBusinessId === b.id;
                                        return (
                                            <TouchableOpacity
                                                key={b.id}
                                                onPress={() => setSelectedBusinessId(b.id)}
                                                style={[
                                                    styles.input,
                                                    {
                                                        backgroundColor: isDark
                                                            ? 'rgba(255,255,255,0.05)'
                                                            : '#fff',
                                                        borderColor: selected
                                                            ? '#4f46e5'
                                                            : isDark
                                                              ? 'rgba(255,255,255,0.1)'
                                                              : '#E5E7EB',
                                                    },
                                                    selected && {
                                                        backgroundColor: isDark
                                                            ? 'rgba(79,70,229,0.2)'
                                                            : 'rgba(79,70,229,0.08)',
                                                    },
                                                ]}
                                            >
                                                <Text
                                                    style={{
                                                        color: isDark ? '#fff' : '#111827',
                                                        fontWeight: selected ? '700' : '500',
                                                    }}
                                                >
                                                    {b.name}
                                                </Text>
                                                <Text
                                                    style={{
                                                        color: isDark ? '#94A3B8' : '#6B7280',
                                                        fontSize: 12,
                                                        marginTop: 4,
                                                    }}
                                                >
                                                    Autorizado por {b.source}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={[styles.modalLabel, { color: isDark ? '#E2E8F0' : '#374151' }]}>
                                Título del bono
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                                        color: isDark ? '#fff' : '#111827',
                                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
                                    },
                                ]}
                                placeholder="Ej: Bono $50 → $100 en La Cafetería"
                                value={bonoTitle}
                                onChangeText={setBonoTitle}
                                placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <ImageUploadField
                                title="Foto del bono"
                                images={photos}
                                onChange={setPhotos}
                                maxImages={3}
                            />
                        </View>

                        <View style={styles.row2}>
                            <View style={[styles.formGroup, { flex: 1 }]}>
                                <Text style={[styles.modalLabel, { color: isDark ? '#E2E8F0' : '#374151' }]}>
                                    Crédito ($)
                                </Text>
                                <TextInput
                                    style={[
                                        styles.input,
                                        {
                                            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                                            color: isDark ? '#fff' : '#111827',
                                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
                                        },
                                    ]}
                                    keyboardType="decimal-pad"
                                    value={creditValue}
                                    onChangeText={(t) => {
                                        const sanitized = t.replace(/[^0-9.]/g, '');
                                        const num = parseFloat(sanitized) || 0;
                                        setCreditValue(sanitized);
                                        setPaidPrice(num > 0 ? (num / 2).toString() : '');
                                    }}
                                    placeholder="100"
                                    placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                                />
                            </View>
                            <View style={[styles.formGroup, { flex: 1 }]}>
                                <Text style={[styles.modalLabel, { color: isDark ? '#E2E8F0' : '#374151' }]}>
                                    Precio pagado (50%)
                                </Text>
                                <View
                                    style={[
                                        styles.input,
                                        {
                                            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F3F4F6',
                                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
                                            justifyContent: 'center',
                                        },
                                    ]}
                                >
                                    <Text style={{ color: isDark ? '#94A3B8' : '#6B7280' }}>
                                        ${paidPrice || '0.00'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={[styles.modalLabel, { color: isDark ? '#E2E8F0' : '#374151' }]}>
                                Validez (días desde la compra)
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                                        color: isDark ? '#fff' : '#111827',
                                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
                                    },
                                ]}
                                keyboardType="number-pad"
                                value={validityDays}
                                onChangeText={setValidityDays}
                                placeholder="4"
                                placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={[styles.modalLabel, { color: isDark ? '#E2E8F0' : '#374151' }]}>
                                Descripción
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    styles.inputMultiline,
                                    {
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                                        color: isDark ? '#fff' : '#111827',
                                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
                                    },
                                ]}
                                placeholder="Instrucciones para usar el bono"
                                value={bonoDescription}
                                onChangeText={setBonoDescription}
                                multiline
                                placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                            />
                        </View>
                    </ScrollView>

                    <View style={styles.modalFooter}>
                        <View
                            style={[
                                styles.modalActionsRow,
                                windowWidth < 420 && { flexDirection: 'column' },
                            ]}
                        >
                            <TouchableOpacity
                                onPress={onClose}
                                style={[
                                    styles.btn,
                                    styles.btnOutline,
                                    windowWidth < 420 ? { width: '100%' } : { flex: 1 },
                                ]}
                            >
                                <Text style={{ color: isDark ? '#D1D5DB' : '#111827', fontWeight: '700' }}>
                                    Cancelar
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                disabled={isSubmitting || businessOptions.length === 0}
                                onPress={handleCreateBono}
                                style={[
                                    styles.btn,
                                    styles.btnPrimary,
                                    windowWidth < 420 ? { width: '100%' } : { flex: 1 },
                                    (isSubmitting || businessOptions.length === 0) && { opacity: 0.5 },
                                ]}
                            >
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
        marginBottom: 16,
    },
    row2: {
        flexDirection: 'row',
        gap: 12,
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
        height: 90,
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
