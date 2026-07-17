import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    ScrollView,
    TouchableOpacity,
    Image,
    KeyboardAvoidingView,
    Platform,
    useWindowDimensions,
    ActivityIndicator,
} from 'react-native';
import { Camera, ChevronLeft, Upload, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from 'convex/react';
import { MobileHeader } from '../../components/MobileHeader';
import { useMarketplace } from '../../contexts/MarketplaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';
import { api } from '../../../convex/_generated/api';

export default function AddEditProductScreen({ navigation }: any) {
    const { createProduct } = useMarketplace();
    const { user, sessionToken } = useAuth();
    const { show } = useToast();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const styles = useMemo(() => getStyles(isDark, windowWidth, windowHeight), [isDark, windowHeight, windowWidth]);

    const CATEGORY_OPTIONS = [
        'Electrónica',
        'Moda',
        'Hogar',
        'Fitness',
        'Belleza',
        'Gastronomía',
        'Servicios',
        'Experiencias',
    ];

    const [title, setTitle] = useState('');
    const [price, setPrice] = useState('');
    const [description, setDescription] = useState('');
    const [condition, setCondition] = useState<'new' | 'used'>('new');
    const [damageDescription, setDamageDescription] = useState('');
    const [stock, setStock] = useState('1');
    const [category, setCategory] = useState('Electrónica');

    const [images, setImages] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);

    const handleAddImage = async () => {
        if (images.length >= 5) {
            show('Máximo 5 fotos por producto.', 'info');
            return;
        }
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                show('Necesitamos permiso para acceder a la galería.', 'error');
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });
            if (result.canceled || !result.assets?.[0]?.uri) return;

            setUploading(true);
            const uri = result.assets[0].uri;
            const mime = result.assets[0].mimeType ?? 'image/jpeg';
            const uploadUrl = await generateUploadUrl({
                sessionToken, actorId: user?.id as any,
            });
            const blob = await (await fetch(uri)).blob();
            const uploadRes = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': mime },
                body: blob,
            });
            if (!uploadRes.ok) {
                show('No se pudo subir la imagen. Intentá de nuevo.', 'error');
                return;
            }
            const { storageId } = await uploadRes.json();
            setImages((prev) => [...prev, `convex-storage:${storageId}`]);
        } catch (err: any) {
            show(err?.message ?? 'Error subiendo la imagen.', 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveImage = (index: number) => {
        const newImages = [...images];
        newImages.splice(index, 1);
        setImages(newImages);
    };

    const handleSubmit = async () => {
        if (!title || !price || !description) {
            show('Completa los campos obligatorios', 'error');
            return;
        }

        if (condition === 'used' && !damageDescription) {
            show('Describe el estado del producto usado', 'error');
            return;
        }

        if (images.length === 0) {
            show('Agrega al menos una foto del producto', 'error');
            return;
        }

        const input = {
            title,
            description,
            price: Number(price),
            condition,
            damageDescription: condition === 'used' ? damageDescription : undefined,
            stock: Number(stock),
            category,
            images: images.map((url, i) => ({ url, isPrimary: i === 0 })),
            shippingProfile: {
                weightKg: 1, // Default mock
                dimensionsCm: { length: 30, width: 20, height: 10 },
                shipsFromPostalCode: '1000',
            },
            location: {
                lat: -34.6,
                lng: -58.4,
                name: 'Ubicación Predeterminada',
                address: 'Calle Falsa 123',
                distanceKm: 0
            }
        };

        const result = await createProduct(input);
        if (result.success) {
            show('Producto publicado correctamente', 'success');
            setTimeout(() => navigation.goBack(), 500);
        } else {
            show(result.error || 'No se pudo crear el producto', 'error');
        }
    };

    return (
        <View style={styles.page}>
            <MobileHeader
                title="Publicar Producto"
                backButton
                onBack={() => navigation.goBack()}
            />

            <KeyboardAvoidingView
                style={styles.page}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
            >
                <ScrollView
                    style={styles.content}
                    contentContainerStyle={styles.contentContainer}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.maxWidth}>
                        <View style={styles.grid}>
                            <View style={styles.col}>
                                {/* Images Section */}
                                <View style={styles.section}>
                                    <Text style={styles.label}>Fotos del Producto (Máx 5)</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
                                        {images.map((img, index) => (
                                            <View key={index} style={styles.imageContainer}>
                                                <Image source={{ uri: img }} style={styles.image} />
                                                <TouchableOpacity
                                                    style={styles.removeBtn}
                                                    onPress={() => handleRemoveImage(index)}
                                                >
                                                    <X size={16} color="#fff" />
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                        {images.length < 5 && (
                                            <TouchableOpacity
                                                style={styles.addBtn}
                                                onPress={handleAddImage}
                                                disabled={uploading}
                                            >
                                                {uploading ? (
                                                    <ActivityIndicator color={isDark ? '#D1D5DB' : '#6B7280'} />
                                                ) : (
                                                    <Camera size={24} color={isDark ? '#D1D5DB' : '#6B7280'} />
                                                )}
                                                <Text style={styles.addBtnText}>
                                                    {uploading ? 'Subiendo...' : 'Agregar'}
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                    </ScrollView>
                                </View>

                                {/* Basic Info */}
                                <View style={styles.section}>
                                    <Text style={styles.label}>Título</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Ej: iPhone 13 Pro Max"
                                        placeholderTextColor={styles.placeholder.color as any}
                                        value={title}
                                        onChangeText={setTitle}
                                    />

                                    <View style={styles.row}>
                                        <View style={styles.field}>
                                            <Text style={styles.label}>Precio (USD)</Text>
                                            <TextInput
                                                style={styles.input}
                                                placeholder="0.00"
                                                placeholderTextColor={styles.placeholder.color as any}
                                                keyboardType="numeric"
                                                value={price}
                                                onChangeText={setPrice}
                                            />
                                        </View>
                                        <View style={styles.field}>
                                            <Text style={styles.label}>Stock Disponible</Text>
                                            <TextInput
                                                style={styles.input}
                                                placeholder="1"
                                                placeholderTextColor={styles.placeholder.color as any}
                                                keyboardType="numeric"
                                                value={stock}
                                                onChangeText={setStock}
                                            />
                                        </View>
                                    </View>

                                    <Text style={styles.label}>Categoría</Text>
                                    <View style={styles.categoryGrid}>
                                        {CATEGORY_OPTIONS.map((option) => {
                                            const selected = category === option;
                                            return (
                                                <TouchableOpacity
                                                    key={option}
                                                    style={[styles.categoryChip, selected && styles.categoryChipActive]}
                                                    onPress={() => setCategory(option)}
                                                >
                                                    <Text style={[styles.categoryChipText, selected && styles.categoryChipTextActive]}>
                                                        {option}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>

                                    <Text style={styles.label}>Descripción</Text>
                                    <TextInput
                                        style={[styles.input, styles.textArea]}
                                        placeholder="Describe tu producto..."
                                        placeholderTextColor={styles.placeholder.color as any}
                                        multiline
                                        numberOfLines={4}
                                        value={description}
                                        onChangeText={setDescription}
                                    />
                                </View>
                            </View>

                            <View style={styles.col}>
                                {/* Condition Logic */}
                                <View style={styles.section}>
                                    <View style={styles.rowBetween}>
                                        <Text style={styles.label}>Condición</Text>
                                        <View style={styles.toggleContainer}>
                                            <TouchableOpacity
                                                style={[styles.toggleBtn, condition === 'new' && styles.toggleActive]}
                                                onPress={() => setCondition('new')}
                                            >
                                                <Text style={[styles.toggleText, condition === 'new' && styles.textActive]}>Nuevo</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.toggleBtn, condition === 'used' && styles.toggleActive]}
                                                onPress={() => setCondition('used')}
                                            >
                                                <Text style={[styles.toggleText, condition === 'used' && styles.textActive]}>Usado</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    {condition === 'used' && (
                                        <View style={styles.warningBox}>
                                            <Text style={styles.warningLabel}>Detalle de Imperfecciones *</Text>
                                            <TextInput
                                                style={[styles.input, styles.warningInput]}
                                                placeholder="Describe rayones, golpes o fallas..."
                                                placeholderTextColor={styles.placeholder.color as any}
                                                multiline
                                                value={damageDescription}
                                                onChangeText={setDamageDescription}
                                            />
                                            <Text style={styles.helperText}>
                                                Sé honesto para evitar disputas futuras.
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                <TouchableOpacity style={styles.publishBtn} onPress={handleSubmit}>
                                    <Upload size={20} color="#fff" style={{ marginRight: 8 }} />
                                    <Text style={styles.publishBtnText}>Publicar Producto</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const getStyles = (isDark: boolean, windowWidth: number, windowHeight: number) => {
    const isCompact = windowWidth < 360;
    const isWide = windowWidth >= 900;
    const maxWidth = isWide ? 980 : 640;

    const pageBg = isDark ? '#09090B' : '#FAFAFA';
    const cardBg = isDark ? 'rgba(17, 24, 39, 0.85)' : '#FFFFFF';
    const cardBorder = isDark ? 'rgba(148, 163, 184, 0.18)' : '#E5E7EB';
    const textPrimary = isDark ? '#F9FAFB' : '#111827';
    const textMuted = isDark ? '#9CA3AF' : '#6B7280';
    const inputBg = isDark ? 'rgba(31, 41, 55, 0.9)' : '#F9FAFB';
    const inputBorder = isDark ? 'rgba(148, 163, 184, 0.25)' : '#E5E7EB';
    const accent = '#7C3AED';

    return StyleSheet.create({
        page: { flex: 1, backgroundColor: pageBg },
        content: { flex: 1 },
        contentContainer: {
            paddingHorizontal: isCompact ? 12 : 16,
            paddingTop: 16,
            paddingBottom: 40,
            minHeight: Math.max(windowHeight - 80, 0),
        },
        maxWidth: { width: '100%', maxWidth, alignSelf: 'center' },
        grid: { flexDirection: isWide ? 'row' : 'column', gap: 16 },
        col: { flex: 1, minWidth: 0 },

        section: {
            marginBottom: 16,
            backgroundColor: cardBg,
            padding: 16,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: cardBorder,
        },

        label: { fontSize: 14, fontWeight: '700', color: textPrimary, marginBottom: 8 },

        placeholder: { color: isDark ? '#64748B' : '#9CA3AF' },

        input: {
            borderWidth: 1,
            borderColor: inputBorder,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 12,
            fontSize: 16,
            color: textPrimary,
            backgroundColor: inputBg,
            marginBottom: 12,
            minWidth: 0,
        },
        textArea: { height: 110, textAlignVertical: 'top' },

        row: { flexDirection: isWide ? 'row' : 'column', gap: 12 },
        field: { flex: 1, minWidth: 0 },

        categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
        categoryChip: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: inputBorder,
            backgroundColor: isDark ? 'rgba(31, 41, 55, 0.7)' : '#F9FAFB',
        },
        categoryChipActive: {
            borderColor: isDark ? 'rgba(167, 139, 250, 0.7)' : accent,
            backgroundColor: isDark ? 'rgba(124, 58, 237, 0.28)' : '#EDE9FE',
        },
        categoryChipText: { fontSize: 13, color: textMuted, fontWeight: '600' },
        categoryChipTextActive: { color: isDark ? '#E9D5FF' : '#5B21B6', fontWeight: '800' },

        // Images
        imageScroll: { flexDirection: 'row', marginBottom: 8 },
        imageContainer: { marginRight: 12, position: 'relative' },
        image: { width: 110, height: 110, borderRadius: 10 },
        removeBtn: {
            position: 'absolute',
            top: -8,
            right: -8,
            backgroundColor: '#EF4444',
            borderRadius: 12,
            padding: 4,
        },
        addBtn: {
            width: 110,
            height: 110,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: inputBorder,
            borderStyle: 'dashed',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(31, 41, 55, 0.5)' : 'transparent',
        },
        addBtnText: { marginTop: 8, fontSize: 12, color: textMuted, fontWeight: '600' },

        // Toggle
        rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
        toggleContainer: { flexDirection: 'row', backgroundColor: isDark ? 'rgba(31, 41, 55, 0.9)' : '#F3F4F6', borderRadius: 20, padding: 2, borderWidth: 1, borderColor: inputBorder },
        toggleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 },
        toggleActive: {
            backgroundColor: isDark ? 'rgba(148, 163, 184, 0.18)' : '#fff',
            ...Platform.select({
                web: { boxShadow: '0 4px 10px rgba(0,0,0,0.12)' } as any,
                default: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
            }),
        },
        toggleText: { fontSize: 14, color: textMuted, fontWeight: '700' },
        textActive: { color: textPrimary, fontWeight: '800' },

        // Warning Used
        warningBox: {
            backgroundColor: isDark ? 'rgba(234, 179, 8, 0.12)' : '#FFFBEB',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(234, 179, 8, 0.35)' : '#FCD34D',
            borderRadius: 10,
            padding: 12,
        },
        warningLabel: { fontSize: 13, fontWeight: '800', color: isDark ? '#FDE68A' : '#92400E', marginBottom: 8 },
        warningInput: { backgroundColor: inputBg, borderColor: isDark ? 'rgba(234, 179, 8, 0.35)' : '#FDE68A', marginBottom: 4 },
        helperText: { fontSize: 12, color: isDark ? '#FCD34D' : '#B45309', fontWeight: '600' },

        publishBtn: {
            backgroundColor: accent,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
            borderRadius: 14,
            marginTop: 8,
            ...Platform.select({
                web: { boxShadow: '0 10px 24px rgba(124, 58, 237, 0.35)' } as any,
                default: { shadowColor: accent, shadowOpacity: 0.35, shadowRadius: 10, elevation: 5 },
            }),
        },
        publishBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
    });
};
