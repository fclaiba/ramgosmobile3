import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Platform,
    KeyboardAvoidingView,
    Share,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { ChevronLeft, Ticket, Copy, Share2 } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useReferral } from '../contexts/ReferralContext';
import { buildBonoShareLink } from '../utils/bonoDeepLink';
import * as Clipboard from 'expo-clipboard';
import { ImageUploadField } from '../components/ui/ImageUploadField';

function InfluencerBonusesScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { sessionToken, user } = useAuth();
    const { show } = useToast();
    const { referralLink, referralCode } = useReferral();

    const myListings =
        useQuery(
            api.listings.getMyListings,
            user?.id && sessionToken ? { sessionToken, type: 'bono' } : 'skip',
        ) ?? [];
    const myBonuses = useMemo(
        () => myListings.filter((l: any) => l.type === 'bono'),
        [myListings],
    );

    const campaignRows =
        useQuery(
            api.campaigns.getMyCampaigns,
            user?.id ? { influencerId: user.id as Id<'users'>, sessionToken } : 'skip',
        ) ?? [];

    const businessOptions = useMemo(() => {
        const active = campaignRows.filter((c: any) => c.status === 'active');
        const byId = new Map<string, { id: string; name: string }>();
        for (const c of active) {
            const id = String(c.businessId || '');
            if (!id || byId.has(id)) continue;
            byId.set(id, { id, name: c.businessName || 'Negocio' });
        }
        return Array.from(byId.values());
    }, [campaignRows]);

    const createBono = useMutation(api.listings.createListing);
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);

    const [isCreating, setIsCreating] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [paidPrice, setPaidPrice] = useState('50');
    const [creditValue, setCreditValue] = useState('100');
    const [validityDays, setValidityDays] = useState('4');
    const [selectedBusinessId, setSelectedBusinessId] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);

    const shareBase = referralLink || referralCode || '';

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

    const handleCreate = async () => {
        if (!title.trim()) {
            show('Ingresá un título para el bono', 'error');
            return;
        }
        if (!selectedBusinessId) {
            show('Elegí el negocio emisor (campaña activa).', 'error');
            return;
        }
        if (photos.length === 0) {
            show('Subí una foto del bono.', 'error');
            return;
        }
        const price = Number(paidPrice);
        const credit = Number(creditValue);
        const days = Math.floor(Number(validityDays) || 4);
        if (!Number.isFinite(price) || price <= 0) {
            show('El precio pagado debe ser mayor a 0.', 'error');
            return;
        }
        if (!Number.isFinite(credit) || credit <= price) {
            show('El crédito debe ser mayor al precio (ej. 50 → 100).', 'error');
            return;
        }

        try {
            const uploadedImages = await Promise.all(photos.map((uri) => uploadPhoto(uri)));
            await createBono({
                sessionToken,
                title: title.trim(),
                description:
                    description.trim() ||
                    `Pagás $${price} y tenés $${credit} de crédito.`,
                type: 'bono',
                price,
                discountValue: credit,
                discountType: 'fixed',
                validityDays: Math.min(Math.max(days, 1), 365),
                stock: 1000,
                category: 'bonos',
                sellerId: selectedBusinessId,
                image: uploadedImages[0],
                gallery: uploadedImages,
            });
            setIsCreating(false);
            setTitle('');
            setDescription('');
            setPaidPrice('50');
            setCreditValue('100');
            setValidityDays('4');
            setSelectedBusinessId('');
            setPhotos([]);
            show(`Bono creado: pagás $${price} · crédito $${credit}`, 'success');
        } catch (error: any) {
            show(error.message || 'Error al crear bono', 'error');
        }
    };

    const copyBonoLink = async (bono: any) => {
        const link = buildBonoShareLink({
            referralCodeOrLink: shareBase,
            listingId: bono._id,
        });
        if (!link) {
            show('No se pudo armar el enlace', 'error');
            return;
        }
        await Clipboard.setStringAsync(link);
        show('Enlace del bono copiado', 'success');
    };

    const shareBonoLink = async (bono: any) => {
        const link = buildBonoShareLink({
            referralCodeOrLink: shareBase,
            listingId: bono._id,
        });
        if (!link) {
            show('No se pudo armar el enlace', 'error');
            return;
        }
        try {
            await Share.share({
                title: bono.title,
                message: `${bono.title}\nPagás $${bono.price} · Crédito $${bono.discountValue}\n${link}`,
                url: Platform.OS === 'ios' ? link : undefined,
            });
        } catch {
            /* cancelled */
        }
    };

    const styles = StyleSheet.create({
        container: { flex: 1, backgroundColor: isDark ? '#111827' : '#F3F4F6' },
        header: {
            padding: 16,
            backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
            flexDirection: 'row',
            alignItems: 'center',
            elevation: 2,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.1,
            shadowRadius: 2,
        },
        backBtn: { marginRight: 16 },
        title: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#FFFFFF' : '#111827' },
        content: { padding: 16 },
        formCard: {
            backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
            padding: 16,
            borderRadius: 12,
            marginBottom: 12,
        },
        formTitle: {
            fontSize: 16,
            fontWeight: 'bold',
            color: isDark ? '#FFFFFF' : '#111827',
            marginBottom: 4,
        },
        formDesc: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', marginBottom: 8 },
        createBtn: {
            backgroundColor: '#2196F3',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            borderRadius: 12,
            marginTop: 16,
        },
        createBtnText: { color: '#FFFFFF', fontWeight: 'bold', marginLeft: 8 },
        input: {
            backgroundColor: isDark ? '#374151' : '#F9FAFB',
            borderRadius: 8,
            padding: 12,
            color: isDark ? '#FFFFFF' : '#111827',
            marginBottom: 12,
            borderWidth: 1,
            borderColor: isDark ? '#4B5563' : '#E5E7EB',
        },
        label: {
            fontSize: 14,
            fontWeight: '600',
            color: isDark ? '#D1D5DB' : '#374151',
            marginBottom: 8,
        },
        typeOption: {
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: isDark ? '#4B5563' : '#E5E7EB',
            marginBottom: 8,
        },
        typeOptionSelected: {
            borderColor: '#2196F3',
            backgroundColor: isDark ? 'rgba(33, 150, 243, 0.1)' : '#EBF5FF',
        },
        cancelBtn: { padding: 16, alignItems: 'center' },
        cancelText: { color: isDark ? '#9CA3AF' : '#6B7280', fontWeight: '600' },
        row: { flexDirection: 'row', gap: 12 },
        chip: {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#D1FAE5',
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 8,
            maxWidth: 130,
        },
        actionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
        miniBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: '#2196F3',
        },
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
                <Text style={styles.title}>Mis bonos de crédito</Text>
            </View>
            <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
                {isCreating ? (
                    <View style={styles.formCard}>
                        <Text style={styles.label}>Negocio emisor</Text>
                        {businessOptions.length === 0 ? (
                            <Text style={{ color: '#EF4444', marginBottom: 12 }}>
                                No tenés campañas activas. Necesitás una para emitir bonos.
                            </Text>
                        ) : (
                            businessOptions.map((b) => (
                                <TouchableOpacity
                                    key={b.id}
                                    style={[
                                        styles.typeOption,
                                        selectedBusinessId === b.id && styles.typeOptionSelected,
                                    ]}
                                    onPress={() => setSelectedBusinessId(b.id)}
                                >
                                    <Text style={{ color: isDark ? '#fff' : '#111827', fontWeight: '600' }}>
                                        {b.name}
                                    </Text>
                                </TouchableOpacity>
                            ))
                        )}

                        <Text style={styles.label}>Título del bono</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ej. Bono $50 → $100"
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                            value={title}
                            onChangeText={setTitle}
                        />
                        <View style={{ marginBottom: 12 }}>
                            <ImageUploadField
                                title="Foto del bono"
                                images={photos}
                                onChange={setPhotos}
                                maxImages={3}
                            />
                        </View>
                        <Text style={styles.label}>Descripción</Text>
                        <TextInput
                            style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                            placeholder="Detalles del bono..."
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                            multiline
                            value={description}
                            onChangeText={setDescription}
                        />
                        <View style={styles.row}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>Precio pagado ($)</Text>
                                <TextInput
                                    style={styles.input}
                                    keyboardType="decimal-pad"
                                    value={paidPrice}
                                    onChangeText={setPaidPrice}
                                    placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>Crédito ($)</Text>
                                <TextInput
                                    style={styles.input}
                                    keyboardType="decimal-pad"
                                    value={creditValue}
                                    onChangeText={setCreditValue}
                                    placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                />
                            </View>
                        </View>
                        <Text style={styles.label}>Validez (días)</Text>
                        <TextInput
                            style={styles.input}
                            keyboardType="number-pad"
                            value={validityDays}
                            onChangeText={setValidityDays}
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                        />
                        <TouchableOpacity
                            style={[
                                styles.createBtn,
                                businessOptions.length === 0 && { opacity: 0.5 },
                            ]}
                            onPress={handleCreate}
                            disabled={businessOptions.length === 0}
                        >
                            <Text style={styles.createBtnText}>Generar bono</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsCreating(false)}>
                            <Text style={styles.cancelText}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {myBonuses.map((bono: any) => (
                            <View key={bono._id} style={styles.formCard}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <View style={{ flex: 1, paddingRight: 8 }}>
                                        <Text style={styles.formTitle}>{bono.title}</Text>
                                        <Text style={styles.formDesc}>{bono.description}</Text>
                                    </View>
                                    <View style={styles.chip}>
                                        <Text
                                            style={{
                                                color: '#059669',
                                                fontWeight: 'bold',
                                                fontSize: 12,
                                                textAlign: 'center',
                                            }}
                                        >
                                            {`Pagás $${bono.price ?? '—'} · Crédito $${bono.discountValue ?? '—'}`}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.actionsRow}>
                                    <TouchableOpacity
                                        style={styles.miniBtn}
                                        onPress={() => copyBonoLink(bono)}
                                    >
                                        <Copy size={14} color="#fff" />
                                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                                            Copiar
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.miniBtn, { backgroundColor: '#4B5563' }]}
                                        onPress={() => shareBonoLink(bono)}
                                    >
                                        <Share2 size={14} color="#fff" />
                                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                                            Compartir
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                        <TouchableOpacity style={styles.createBtn} onPress={() => setIsCreating(true)}>
                            <Ticket size={20} color="#FFFFFF" />
                            <Text style={styles.createBtnText}>Crear nuevo bono</Text>
                        </TouchableOpacity>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const HOC_KeyboardAvoidingView_InfluencerBonusesScreen = (props: any) => (
    <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
        <InfluencerBonusesScreen {...props} />
    </KeyboardAvoidingView>
);
export default HOC_KeyboardAvoidingView_InfluencerBonusesScreen;
