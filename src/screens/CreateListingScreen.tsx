import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    useWindowDimensions,
} from 'react-native';
import { Package, Calendar, Wrench, AlertTriangle, Truck, Image as ImageIcon, X, ChevronDown, CheckCircle, Tag, Briefcase, Percent, Circle, Lock, MapPin, Megaphone } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MobileHeader } from '../components/MobileHeader';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useMarketplace } from '../contexts/MarketplaceContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import { useActionGate } from '../utils/useActionGate';
import { useFocusEffect } from '@react-navigation/native';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { ImageUploadField } from '../components/ui/ImageUploadField';
import { LocationPickerModal } from '../components/marketplace/LocationPickerModal';
import { UNIFIED_CATEGORIES } from '../config/UnifiedCategories';

type PublicationType = 'product' | 'event' | 'service' | 'bono' | null;

export default function CreateListingScreen({ navigation, route }: any) {
    const [selectedType, setSelectedType] = useState<PublicationType>(null);
    const { user } = useAuth();
    const { createProduct } = useMarketplace();
    const { show } = useToast();
    const { getSellPublishWithdrawBlock, gateSellPublishWithdraw } = useActionGate();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { width } = useWindowDimensions();
    const styles = useMemo(() => getStyles(isDark, width), [isDark, width]);

    const isMobile = width < 640;
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);
    const updateListingMutation = useMutation(api.listings.updateListing);

    // Edit Mode Params
    const { editMode, initialData } = route.params || {};

    // Initial State Definition
    const initialFormState = {
        title: initialData?.title || '',
        price: initialData?.price?.toString() || '',
        stock: initialData?.stock?.toString() || '',
        description: initialData?.description || '',
        type: initialData?.type || null,
        category: initialData?.category || '',
        // Product specific
        condition: 'new' as 'new' | 'used',
        visualState: '',
        functionalDetails: '',
        repairs: '',
        weight: '',
        dimensions: '',
        // Service/Event specific
        eventDate: '',
        eventTime: '',
        eventVenue: '',
        serviceMode: 'presencial' as 'presencial' | 'online' | 'mixto',
        // Common
        photos: [] as string[],
        selectedLocation: initialData?.location || null as { lat: number, lng: number, address?: string } | null,
        location: initialData?.location || null as { lat: number, lng: number, address?: string } | null, // Kept for compatibility if used elsewhere
        // Influencer Campaign Backend — open promotion. Business-only;
        // server (`convex/listings.ts`) rejects the toggle if the
        // current seller doesn't have role='business'. UI mirrors the
        // backend by hiding the section unless the role matches.
        openPromotion: !!initialData?.openPromotion,
        openCommissionRate:
            typeof initialData?.openCommissionRate === 'number'
                ? String(Math.round(initialData.openCommissionRate * 100))
                : '5',
    };

    const [form, setForm] = useState(initialFormState);

    // If editing, verify selectedType needs to be set separately as it controls the UI steps
    if (editMode && !selectedType && initialData?.type) {
        setSelectedType(initialData.type);
    }

    const [photoUrl, setPhotoUrl] = useState('');
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);

    // Reset form when type selection changes (cancels) or when needed
    React.useEffect(() => {
        if (!selectedType) {
            setForm(initialFormState);
            setPhotoUrl('');
        }
    }, [selectedType]);

    // Function to handle image upload
    const uploadImage = async (uri: string) => {
        console.log("DEBUG: uploadImage called with:", uri);

        // Robust check: Upload anything that isn't clearly a Storage ID or a Remote HTTPS URL.
        // Storage IDs are typically alphanumeric characters (no protocol).
        // Blobs start with "blob:", Files start with "file://".

        const isStorageId = /^[a-zA-Z0-9]+$/.test(uri);
        // Ensure regular http URLs (like from previous uploads) are skipped, but blob:http are uploaded.
        const isRemoteUrl = (uri.startsWith('http') || uri.startsWith('https')) && !uri.startsWith('blob:');

        if (isStorageId || isRemoteUrl) {
            console.log("DEBUG: Skipping upload (already valid ID or Remote URL).");
            return uri;
        }
        console.log("DEBUG: Proceeding to upload...");

        try {
            if (!user?.id) {
                throw new Error('Debes iniciar sesión para subir imágenes.');
            }
            // 1. Get Upload URL
            const postUrl = await generateUploadUrl({ actorId: user.id as any, userId: user.id as any });

            // 2. Fetch the file blob
            const response = await fetch(uri);
            const blob = await response.blob();

            // 3. POST to Convex Storage
            const result = await fetch(postUrl, {
                method: "POST",
                headers: { "Content-Type": response.headers.get("Content-Type") || "image/jpeg" },
                body: blob,
            });

            // 4. Get Storage ID
            const { storageId } = await result.json();
            return storageId;
        } catch (error) {
            console.error("Upload failed", error);
            throw new Error("Error al subir imagen");
        }
    };


    const publishBlock = getSellPublishWithdrawBlock();
    const canPublish = !publishBlock;

    const BUSINESS_CATEGORIES = [
        'Gastronomía', 'Indumentaria', 'Tecnología', 'Salud y Belleza',
        'Hogar y Decoración', 'Servicios Profesionales', 'Entretenimiento',
        'Educación', 'Automotriz', 'Deportes', 'Mascotas', 'Otros'
    ];

    const calculateShipping = () => {
        if (!form.weight) return null;
        const weight = parseFloat(form.weight) || 1;
        return {
            standard: (weight * 5 + 10).toFixed(2),
            express: (weight * 8 + 15).toFixed(2)
        };
    };

    const shippingCosts = calculateShipping();

    const parseDimensions = (value: string) => {
        const [lengthRaw, widthRaw, heightRaw] = value.split('x').map((part) => parseFloat(part));
        return {
            length: !Number.isNaN(lengthRaw) ? lengthRaw : 25,
            width: !Number.isNaN(widthRaw) ? widthRaw : 20,
            height: !Number.isNaN(heightRaw) ? heightRaw : 10,
        };
    };

    const handleAddPhoto = () => {
        const trimmed = photoUrl.trim();
        if (!trimmed) return;
        setForm((prev) => ({ ...prev, photos: [...prev.photos, trimmed] }));
        setPhotoUrl('');
    };

    const handleRemovePhoto = (target: string) => {
        setForm((prev) => ({ ...prev, photos: prev.photos.filter((url) => url !== target) }));
    };

    if (!canPublish && publishBlock) {
        return (
            <View style={styles.container}>
                <MobileHeader title="Nueva Publicación" backButton={true} onBack={() => navigation.goBack()} />
                <View style={[styles.blockedContainer, { paddingHorizontal: isMobile ? 24 : 0 }]}>
                    <View style={styles.blockedIconContainer}>
                        <Lock size={48} color={isDark ? '#A78BFA' : '#7C3AED'} />
                    </View>
                    <Text style={styles.blockedTitle}>{publishBlock.title}</Text>
                    <Text style={styles.blockedSubtitle}>{publishBlock.message}</Text>

                    <View style={styles.blockedActions}>
                        <Button onPress={publishBlock.onCta} style={styles.blockedButton}>
                            <Text style={styles.buttonTextLight}>{publishBlock.ctaLabel}</Text>
                        </Button>
                        {publishBlock.reason === 'anonymous' && (
                            <Button variant="outline" onPress={() => navigation.navigate('Register')} style={styles.blockedButtonSecondary}>
                                <Text style={styles.buttonTextDark}>Crear cuenta</Text>
                            </Button>
                        )}
                    </View>
                </View>
            </View>
        );
    }

    const handlePublish = async () => {
        if (!selectedType) return;
        if (!gateSellPublishWithdraw()) return;

        // Validations
        if (!validateName(form.title)) {
            show('El nombre debe contener solo letras y tener al menos 3 caracteres.', 'error');
            return;
        }
        if (!validatePrice(form.price)) {
            show('El precio debe ser un número válido.', 'error');
            return;
        }
        if (selectedType !== 'bono' && !form.location) {
            show('Por favor selecciona una ubicación en el mapa.', 'error');
            return;
        }
        if (!form.category) {
            show('Por favor selecciona una categoría.', 'error');
            return;
        }

        setIsPublishing(true);
        try {
            const priceValue = parseFloat(form.price.replace(',', '.')) || 0;
            const stockValue = parseInt(form.stock || '1', 10) || 1;
            const weightValue = parseFloat(form.weight.replace(',', '.')) || 0.5;
            const damageDescription = form.condition === 'used'
                ? [form.visualState, form.functionalDetails, form.repairs].filter(Boolean).join(' | ')
                : undefined;

            const listingType = selectedType;
            const finalCategory = form.category;

            const extraLines: string[] = [];
            if (listingType === 'event') {
                if (form.eventDate) extraLines.push(`Fecha: ${form.eventDate}`);
                if (form.eventTime) extraLines.push(`Hora: ${form.eventTime}`);
                if (form.eventVenue) extraLines.push(`Lugar: ${form.eventVenue}`);
            }

            const fullDescription = [form.description, extraLines.join('\n')].filter(Boolean).join('\n\n').trim();

            const uploadedImages = await Promise.all(form.photos.map(uploadImage));

            const locationData = form.location ? {
                lat: form.location.lat,
                lng: form.location.lng,
                name: form.location.address?.split(',')[0] || 'Ubicación',
                address: form.location.address || 'Ubicación seleccionada',
                distanceKm: 0,
            } : {
                lat: -34.6037, lng: -58.3816, name: 'Online', address: 'Online', distanceKm: 0
            };

            // Resolve openPromotion + rate (only meaningful for business
            // role; the toggle is hidden from the UI otherwise but we
            // still guard here in case state was prefilled from edit).
            const isBusiness = user?.role === 'business' || user?.role === 'admin';
            const wantsOpenPromotion = isBusiness && form.openPromotion;
            const openCommissionRateValue = wantsOpenPromotion
                ? Math.max(0.01, Math.min(0.5, (Number(form.openCommissionRate) || 0) / 100))
                : undefined;

            if (editMode && initialData?._id) {
                // UPDATE LOGIC
                await updateListingMutation({
                    actorId: user?.id as any,
                    id: initialData._id,
                    sellerId: user?.id,
                    updates: {
                        title: form.title,
                        description: fullDescription || 'Sin descripción',
                        price: priceValue,
                        stock: stockValue,
                        category: finalCategory,
                        image: uploadedImages[0] || undefined,
                        gallery: uploadedImages.length > 0 ? uploadedImages : undefined,
                        condition: form.condition,
                        location: locationData,
                        openPromotion: isBusiness ? wantsOpenPromotion : undefined,
                        openCommissionRate: isBusiness ? openCommissionRateValue : undefined,
                    }
                });
                show('Publicación actualizada exitosamente!', 'success');
                navigation.goBack();
            } else {
                // CREATE LOGIC
                await createProduct({
                    title: form.title,
                    description: fullDescription || 'Sin descripción',
                    listingType,
                    condition: form.condition,
                    damageDescription,
                    price: priceValue,
                    stock: stockValue,
                    category: finalCategory,
                    tags: [listingType],
                    images: uploadedImages.map((url, index) => ({ url, isPrimary: index === 0 })),
                    shippingProfile: {
                        weightKg: listingType === 'product' ? weightValue : 0.1,
                        dimensionsCm: parseDimensions(form.dimensions),
                        shipsFromPostalCode: 'C1000',
                        allowPickup: true,
                    },
                    location: locationData,
                    openPromotion: wantsOpenPromotion || undefined,
                    openCommissionRate: openCommissionRateValue,
                });
                show('¡Publicado con éxito!', 'success');
                navigation.navigate('Marketplace');
            }
        } catch (error: any) {
            console.error(error);
            show(error.message || 'Error al procesar la solicitud.', 'error');
        } finally {
            setIsPublishing(false);
        }
    };

    const getRoleAllowedTypes = () => {
        const role = user?.role || 'user';
        // Business and Admin get everything
        if (role === 'business' || role === 'admin') return ['product', 'service', 'event', 'bono'];

        // Verified users (any role) get Product and Service explicitly
        if (user?.kycStatus === 'approved') return ['product', 'service'];

        // Influencer and Consumer (user) get only Product and Service
        return ['product', 'service'];
    };

    const allowedTypes = getRoleAllowedTypes();

    const renderTypeSelection = () => {
        const allOptions = [
            { id: 'product', label: 'Producto', icon: Package, desc: 'Vende artículos físicos', color: ['#3B82F6', '#2563EB'] },
            { id: 'service', label: 'Servicio', icon: Briefcase, desc: 'Ofrece tus servicios', color: ['#8B5CF6', '#7C3AED'] },
            { id: 'event', label: 'Evento', icon: Calendar, desc: 'Vende entradas', color: ['#F59E0B', '#D97706'] },
            { id: 'bono', label: 'Bono', icon: Tag, desc: 'Ofrece cupones', color: ['#10B981', '#059669'] },
        ];
        const filteredOptions = allOptions.filter((opt: any) => allowedTypes.includes(opt.id));

        return (
            <View>
                <Text style={styles.sectionTitle}>¿Qué deseas publicar?</Text>
                <View style={styles.grid}>
                    {filteredOptions.map((type: any) => (
                        <TouchableOpacity
                            key={type.id}
                            style={styles.typeCard}
                            onPress={() => setSelectedType(type.id)}
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
            </View>
        );
    };

    // Location State
    const [showLocationModal, setShowLocationModal] = useState(false);

    // Categories imported from central config
    const CATEGORIES = UNIFIED_CATEGORIES;

    // Validation Helpers
    const validateName = (text: string) => {
        // Allow letters (including accents) and spaces only. Min length 3.
        return /^[A-Za-z\s\u00C0-\u017F]+$/.test(text) && text.trim().length >= 3;
    };

    const validatePrice = (text: string) => {
        // Allow ONLY numbers and one decimal point. No currency symbols.
        return /^\d*\.?\d{0,2}$/.test(text);
    };

    const handlePriceChange = (text: string) => {
        // Strip non-numeric/decimal chars first (sanitization)
        const sanitized = text.replace(/[^0-9.]/g, '');
        if (validatePrice(sanitized)) {
            setForm({ ...form, price: sanitized });
        }
    };


    const renderLocationPicker = () => (
        <TouchableOpacity
            style={styles.locationButton}
            onPress={() => setShowLocationModal(true)}
        >
            <MapPin size={20} color={isDark ? '#D1D5DB' : '#374151'} />
            <Text style={styles.locationButtonText}>
                {form.location ? (form.location.address || 'Ubicación seleccionada') : 'Seleccionar Ubicación en Mapa'}
            </Text>
        </TouchableOpacity>
    );

    // Open Promotion section — visible to business sellers only. When
    // ON, ANY influencer can earn `openCommissionRate` on this listing
    // without an explicit campaign with the seller. Backend enforces
    // role and rate validity in `convex/listings.ts`.
    const isBusinessRole = user?.role === 'business' || user?.role === 'admin';
    const renderOpenPromotionSection = () => {
        if (!isBusinessRole) return null;
        return (
            <View style={styles.formGroup}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Megaphone size={16} color={isDark ? '#A78BFA' : '#7C3AED'} />
                            <Text style={[styles.label, { marginBottom: 0 }]}>Promoción abierta para influencers</Text>
                        </View>
                        <Text style={{ fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280' }}>
                            Cualquier influencer podrá promocionar este publicación con su código personal y cobrar la comisión definida abajo.
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => setForm((prev) => ({ ...prev, openPromotion: !prev.openPromotion }))}
                        style={{
                            width: 50,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: form.openPromotion ? '#7C3AED' : (isDark ? '#374151' : '#E5E7EB'),
                            justifyContent: 'center',
                            paddingHorizontal: 3,
                        }}
                    >
                        <View
                            style={{
                                width: 22,
                                height: 22,
                                borderRadius: 11,
                                backgroundColor: '#fff',
                                alignSelf: form.openPromotion ? 'flex-end' : 'flex-start',
                            }}
                        />
                    </TouchableOpacity>
                </View>

                {form.openPromotion && (
                    <View style={{ marginTop: 12 }}>
                        <Text style={styles.label}>Comisión para influencer (%)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="5"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="numeric"
                            value={form.openCommissionRate}
                            onChangeText={(t: string) => {
                                const sanitized = t.replace(/[^0-9.]/g, '');
                                setForm((prev) => ({ ...prev, openCommissionRate: sanitized }));
                            }}
                        />
                        <Text style={{ fontSize: 11, color: isDark ? '#9CA3AF' : '#6B7280', marginTop: 4 }}>
                            Entre 1% y 50%. Se descuenta de tu cobro neto, no del precio que paga el cliente.
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    // Dynamic Picker
    const renderCategoryPicker = (currentValue: string, onSelect: (val: string) => void, options: string[]) => (
        <View style={styles.formGroup}>
            <Text style={styles.label}>Categoría</Text>
            <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowCategoryPicker(!showCategoryPicker)}
            >
                <Text style={[styles.pickerText, !currentValue && styles.placeholderText]}>
                    {currentValue || 'Selecciona una categoría'}
                </Text>
                <ChevronDown size={20} color="#9CA3AF" />
            </TouchableOpacity>

            {showCategoryPicker && (
                <View style={styles.pickerDropdown}>
                    {options.map((cat) => (
                        <TouchableOpacity
                            key={cat}
                            style={styles.pickerItem}
                            onPress={() => {
                                onSelect(cat);
                                setShowCategoryPicker(false);
                            }}
                        >
                            <Text style={[styles.pickerItemText, currentValue === cat && styles.pickerItemTextActive]}>
                                {cat}
                            </Text>
                            {currentValue === cat && <CheckCircle size={16} color="#2563EB" />}
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );

    const renderBonoForm = () => (
        <View style={styles.formWrapper}>
            <Card style={styles.formCard}>
                <FormInput
                    label="Nombre del Bono"
                    placeholder="Ej. Vale de Compra"
                    value={form.title}
                    onChange={(t: string) => setForm({ ...form, title: t })}
                    styles={styles}
                />
                {renderCategoryPicker(form.category, (val) => setForm(prev => ({ ...prev, category: val })), CATEGORIES.bono)}

                <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                        <FormInput
                            label="Valor ($)"
                            placeholder="0.00"
                            keyboardType="decimal-pad"
                            value={form.price}
                            onChange={handlePriceChange}
                            styles={styles}
                        />
                    </View>
                    <View style={styles.formColumn}>
                        <FormInput
                            label="Cantidad"
                            placeholder="1"
                            keyboardType="numeric"
                            value={form.stock}
                            onChange={(t: string) => setForm({ ...form, stock: t })}
                            styles={styles}
                        />
                    </View>
                </View>

                {renderLocationPicker()}

                <FormInput
                    label="Condiciones / Descripción"
                    placeholder="Detalles del bono..."
                    multiline
                    value={form.description}
                    onChange={(t: string) => setForm({ ...form, description: t })}
                    styles={styles}
                />

                <View style={styles.formGroup}>
                    <ImageUploadField
                        title="Imagen del Bono"
                        images={form.photos}
                        onChange={(imgs) => setForm(prev => ({ ...prev, photos: imgs }))}
                        maxImages={3}
                    />
                </View>

                {renderOpenPromotionSection()}
            </Card>
            <Button onPress={handlePublish} style={{ backgroundColor: '#10B981' }}>
                <Text style={styles.buttonTextLight}>Publicar Bono</Text>
            </Button>
            <Button variant="outline" onPress={() => setSelectedType(null)}>
                <Text style={styles.buttonTextDark}>Cancelar</Text>
            </Button>
        </View>
    );

    const renderEventForm = () => (
        <View style={styles.formWrapper}>
            <Card style={styles.formCard}>
                <FormInput
                    label="Nombre del Evento"
                    placeholder="Ej. Concierto en Vivo"
                    value={form.title}
                    onChange={(t: string) => setForm({ ...form, title: t })}
                    styles={styles}
                />
                {renderCategoryPicker(form.category, (val) => setForm(prev => ({ ...prev, category: val })), CATEGORIES.event)}

                <View style={[styles.formRow, isMobile && { flexDirection: 'column' }]}>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Fecha</Text>
                        <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" value={form.eventDate} onChangeText={t => setForm({ ...form, eventDate: t })} />
                    </View>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Hora</Text>
                        <TextInput style={styles.input} placeholder="HH:MM" placeholderTextColor="#9CA3AF" value={form.eventTime} onChangeText={t => setForm({ ...form, eventTime: t })} />
                    </View>
                </View>

                <FormInput
                    label="Lugar / Dirección"
                    placeholder="Ej. Estadio Central"
                    value={form.eventVenue}
                    onChange={(t: string) => setForm({ ...form, eventVenue: t })}
                    styles={styles}
                />

                {renderLocationPicker()}

                <FormInput
                    label="Precio Entrada"
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    value={form.price}
                    onChange={handlePriceChange}
                    styles={styles}
                />

                <FormInput
                    label="Descripción"
                    placeholder="Detalles del evento..."
                    multiline
                    value={form.description}
                    onChange={(t: string) => setForm({ ...form, description: t })}
                    styles={styles}
                />

                <View style={styles.formGroup}>
                    <ImageUploadField
                        title="Flyer / Imagen"
                        images={form.photos}
                        onChange={(imgs) => setForm(prev => ({ ...prev, photos: imgs }))}
                        maxImages={3}
                    />
                </View>

                {renderOpenPromotionSection()}
            </Card>
            <Button onPress={handlePublish} style={{ backgroundColor: '#F59E0B' }}>
                <Text style={styles.buttonTextLight}>Publicar Evento</Text>
            </Button>
            <Button variant="outline" onPress={() => setSelectedType(null)}>
                <Text style={styles.buttonTextDark}>Cancelar</Text>
            </Button>
        </View>
    );


    const renderServiceForm = () => (
        <View style={styles.formWrapper}>
            <Card style={styles.formCard}>
                <FormInput
                    label="Título del Servicio"
                    placeholder="Ej. Plomería a Domicilio"
                    value={form.title}
                    onChange={(t: string) => setForm({ ...form, title: t })}
                    styles={styles}
                />

                {renderCategoryPicker(form.category, (val) => setForm(prev => ({ ...prev, category: val })), CATEGORIES.service)}

                <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                        <FormInput
                            label="Precio Base"
                            placeholder="0.00"
                            keyboardType="decimal-pad"
                            value={form.price}
                            onChange={handlePriceChange}
                            styles={styles}
                        />
                    </View>
                </View>

                {renderLocationPicker()}

                <FormInput
                    label="Descripción"
                    placeholder="Detalle de trabajos que realizas..."
                    multiline
                    value={form.description}
                    onChange={(t: string) => setForm({ ...form, description: t })}
                    styles={styles}
                />

                <View style={styles.formGroup}>
                    <ImageUploadField
                        title="Fotos de trabajos"
                        images={form.photos}
                        onChange={(imgs) => setForm(prev => ({ ...prev, photos: imgs }))}
                        maxImages={5}
                    />
                </View>

                {renderOpenPromotionSection()}
            </Card>

            <Button onPress={handlePublish} style={{ backgroundColor: '#7C3AED' }}>
                <Text style={styles.buttonTextLight}>Publicar servicio</Text>
            </Button>
            <Button variant="outline" onPress={() => setSelectedType(null)}>
                <Text style={styles.buttonTextDark}>Cancelar</Text>
            </Button>
        </View>
    );

    const renderProductForm = () => (
        <View style={styles.formWrapper}>
            <Card style={styles.formCard}>
                <FormInput
                    label="Nombre del Producto"
                    placeholder="Ej. Smartphone Modelo X"
                    value={form.title}
                    onChange={(t: string) => setForm({ ...form, title: t })}
                    styles={styles}
                />

                {renderCategoryPicker(form.category, (val) => setForm(prev => ({ ...prev, category: val })), CATEGORIES.product)}

                <View style={[styles.formRow, isMobile && { flexDirection: 'column' }]}>
                    <View style={styles.formColumn}>
                        <FormInput
                            label="Precio"
                            placeholder="0.00"
                            keyboardType="decimal-pad"
                            value={form.price}
                            onChange={handlePriceChange}
                            styles={styles}
                        />
                    </View>
                    <View style={styles.formColumn}>
                        <FormInput
                            label="Stock"
                            placeholder="1"
                            keyboardType="numeric"
                            value={form.stock}
                            onChange={(t: string) => setForm({ ...form, stock: t })}
                            styles={styles}
                        />
                    </View>
                </View>

                {renderLocationPicker()}

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Condición</Text>
                    <View style={styles.selectorRow}>
                        <TouchableOpacity
                            style={[styles.selectorChip, form.condition === 'new' && styles.selectorChipActive]}
                            onPress={() => setForm(prev => ({ ...prev, condition: 'new' }))}
                        >
                            {form.condition === 'new' ? <CheckCircle size={16} color="#fff" /> : <Circle size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />}
                            <Text style={[styles.selectorChipText, form.condition === 'new' && styles.selectorChipTextActive]}>Nuevo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.selectorChip, form.condition === 'used' && styles.selectorChipActive]}
                            onPress={() => setForm(prev => ({ ...prev, condition: 'used' }))}
                        >
                            {form.condition === 'used' ? <CheckCircle size={16} color="#fff" /> : <Circle size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />}
                            <Text style={[styles.selectorChipText, form.condition === 'used' && styles.selectorChipTextActive]}>Usado</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {form.condition === 'used' && (
                    <View style={styles.usedSection}>
                        <FormInput
                            label="Estado Visual"
                            placeholder="Ej. Rayones leves..."
                            value={form.visualState}
                            onChange={(t: string) => setForm({ ...form, visualState: t })}
                            styles={styles}
                        />
                    </View>
                )}

                <FormInput
                    label="Descripción"
                    placeholder="Descripción detallada..."
                    multiline
                    value={form.description}
                    onChange={(t: string) => setForm({ ...form, description: t })}
                    styles={styles}
                />

                <View style={styles.formGroup}>
                    <ImageUploadField
                        title="Fotos del producto"
                        images={form.photos}
                        onChange={(imgs) => setForm(prev => ({ ...prev, photos: imgs }))}
                        maxImages={8}
                    />
                </View>

                {renderOpenPromotionSection()}
            </Card>

            <Button onPress={handlePublish} style={{ backgroundColor: '#2563EB' }}>
                <Text style={styles.buttonTextLight}>Publicar producto</Text>
            </Button>
            <Button variant="outline" onPress={() => setSelectedType(null)}>
                <Text style={styles.buttonTextDark}>Cancelar</Text>
            </Button>
        </View>
    );

    return (
        <View style={styles.container}>
            <MobileHeader
                title={editMode ? 'Editar Publicación' : (selectedType ? `Crear ${selectedType === 'product' ? 'producto' : selectedType === 'event' ? 'evento' : selectedType === 'bono' ? 'bono' : 'servicio'}` : "Nueva Publicación")}
                backButton={true}
                onBack={() => {
                    if (editMode) {
                        navigation.goBack();
                    } else if (selectedType) {
                        setSelectedType(null);
                    } else {
                        navigation.goBack();
                    }
                }}
            />

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
            >
                <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                    <View style={styles.maxWidth}>
                        {!selectedType && renderTypeSelection()}
                        {selectedType === 'product' && renderProductForm()}
                        {selectedType === 'service' && renderServiceForm()}
                        {selectedType === 'event' && renderEventForm()}
                        {selectedType === 'bono' && renderBonoForm()}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            <LocationPickerModal
                visible={showLocationModal}
                onClose={() => setShowLocationModal(false)}
                onSelect={(loc: { lat: number; lng: number; address?: string }) => {
                    setForm({ ...form, location: loc });
                    setShowLocationModal(false);
                }}
            />
        </View>
    );
}

const getStyles = (isDark: boolean, width: number) => {
    const isWide = width >= 900;
    const maxWidth = isWide ? 920 : 560;

    const bg = isDark ? '#0B1220' : '#F9FAFB';
    const text = isDark ? '#F9FAFB' : '#111827';
    const muted = isDark ? '#9CA3AF' : '#6B7280';
    const inputBg = isDark ? 'rgba(31, 41, 55, 0.9)' : '#F3F4F6';
    const border = isDark ? 'rgba(148, 163, 184, 0.22)' : '#E5E7EB';

    return StyleSheet.create({
        container: { flex: 1, backgroundColor: bg },
        scrollContent: { padding: 16, paddingBottom: 40 },
        maxWidth: { width: '100%', maxWidth, alignSelf: 'center' },

        sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12, color: text },

        grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
        typeCard: { width: '47%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
        cardGradient: { flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center' },
        cardTitle: { marginTop: 12, fontSize: 16, fontWeight: '700', color: '#fff', textAlign: 'center' },
        cardDesc: { marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.9)', textAlign: 'center' },

        formWrapper: { gap: 16 },
        formCard: { padding: 16, borderRadius: 16, backgroundColor: isDark ? '#1F2937' : '#fff', gap: 16, borderWidth: 1, borderColor: border },
        formGroup: { gap: 8 },
        formRow: { flexDirection: 'row', gap: 12 },
        formColumn: { flex: 1, gap: 6 },
        inputGroup: { gap: 8 },

        label: { fontSize: 13, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },
        input: { backgroundColor: inputBg, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: border, color: text },
        inputMultiline: { minHeight: 100, textAlignVertical: 'top' },
        placeholderText: { color: muted },

        pickerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: inputBg, borderRadius: 12, borderWidth: 1, borderColor: border },
        pickerText: { fontSize: 14, color: text },
        pickerDropdown: { marginTop: 4, backgroundColor: inputBg, borderRadius: 10, borderWidth: 1, borderColor: border, overflow: 'hidden' },
        pickerItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        pickerItemText: { color: text, fontSize: 14 },
        pickerItemTextActive: { fontWeight: '700', color: '#2563EB' },

        selectorRow: { flexDirection: 'row', gap: 8 },
        selectorChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: border, backgroundColor: inputBg },
        selectorChipActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
        selectorChipText: { fontSize: 13, fontWeight: '600', color: text },
        selectorChipTextActive: { color: '#fff' },

        usedSection: { backgroundColor: isDark ? 'rgba(234, 179, 8, 0.10)' : '#fefce8', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: isDark ? 'rgba(234, 179, 8, 0.35)' : '#fde047', marginBottom: 12 },

        photoRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
        photoInput: { flex: 1 },
        photoAddButton: { backgroundColor: '#7C3AED', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
        photoAddText: { color: '#fff', fontWeight: '800' },
        photoList: { marginTop: 12, gap: 8 },
        photoChip: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: isDark ? 'rgba(31,41,55,0.7)' : '#fff', borderWidth: 1, borderColor: border },
        photoChipText: { flex: 1, color: text, fontSize: 12 },

        blockedContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
            gap: 20,
        },
        blockedIconContainer: {
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: isDark ? 'rgba(124, 58, 237, 0.15)' : 'rgba(124, 58, 237, 0.1)',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 8,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(124, 58, 237, 0.3)' : 'rgba(124, 58, 237, 0.2)',
        },
        blockedTitle: { fontSize: 24, fontWeight: '800', color: text, textAlign: 'center', letterSpacing: -0.5 },
        blockedSubtitle: { fontSize: 16, color: muted, textAlign: 'center', lineHeight: 24, maxWidth: 300 },
        blockedActions: { width: '100%', maxWidth: 320, gap: 12, marginTop: 12 },
        blockedButton: { width: '100%', backgroundColor: '#7C3AED', height: 56, borderRadius: 16 },
        blockedButtonSecondary: { width: '100%', borderColor: border, borderWidth: 1, height: 56, borderRadius: 16 },

        dropdownBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 12,
            backgroundColor: inputBg,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: border,
        },
        dropdownText: { fontSize: 14, color: text },

        actionBtn: {
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
        },
        actionBtnText: {
            color: '#fff',
            fontWeight: '700',
            fontSize: 16,
        },
        buttonTextLight: {
            color: '#fff',
            fontWeight: '700',
            fontSize: 16,
        },
        buttonTextDark: {
            color: isDark ? '#fff' : '#374151',
            fontWeight: '600',
            fontSize: 16,
        },
        locationButton: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: isDark ? '#374151' : '#D1D5DB',
            marginBottom: 16,
            gap: 8,
            backgroundColor: inputBg,
        },
        locationButtonText: {
            fontSize: 14,
            color: text,
        },
    });
};

// Generic Input with Label - Extracted to prevent re-renders
const FormInput = ({ label, value, onChange, placeholder, keyboardType = 'default', multiline = false, validate, styles }: any) => (
    <View style={styles.formGroup}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
            style={[styles.input, multiline && styles.inputMultiline]}
            placeholder={placeholder}
            placeholderTextColor="#9CA3AF"
            value={value}
            onChangeText={onChange}
            keyboardType={keyboardType}
            multiline={multiline}
        />
    </View>
);
