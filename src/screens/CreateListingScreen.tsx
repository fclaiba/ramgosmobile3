import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, Switch } from 'react-native';
import { Package, Ticket, Calendar, ArrowLeft, CheckCircle, Truck, AlertTriangle, Image as ImageIcon, X } from 'lucide-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useMarketplace } from '../contexts/MarketplaceContext';
import { useAuth } from '../contexts/AuthContext';

type PublicationType = 'product' | 'bonus' | 'event' | null;

export default function CreateListingScreen({ navigation }: any) {
    const [selectedType, setSelectedType] = useState<PublicationType>(null);
    const { user } = useAuth();
    const { createProduct } = useMarketplace();
    const [form, setForm] = useState({
        title: '',
        price: '',
        stock: '',
        description: '',
        condition: 'new' as 'new' | 'used',
        visualState: '',
        functionalDetails: '',
        repairs: '',
        weight: '',
        dimensions: '',
        photos: [] as string[],
    });
    const [photoUrl, setPhotoUrl] = useState('');

    const allowedRoles = useMemo(() => ['business', 'consumer'], []);
    const isBusiness = user?.role === 'business';
    const isConsumer = user?.role === 'consumer';
    const canPublish = !!user && allowedRoles.includes(user.role);

    const calculateShipping = () => {
        if (!form.weight) return null;
        // Mock calculation
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

    if (!user) {
        return (
            <View style={styles.container}>
                <MobileHeader
                    title="Nueva Publicación"
                    backButton={true}
                    onBack={() => navigation.goBack()}
                />
                <View style={styles.blockedContainer}>
                    <Text style={styles.blockedTitle}>Inicia sesión para publicar</Text>
                    <Text style={styles.blockedSubtitle}>
                        Solo los comercios registrados y consumidores verificados pueden publicar productos en el marketplace.
                    </Text>
                    <Button onPress={() => navigation.navigate('Login')} style={styles.blockedButton}>
                        <Text style={{ color: '#fff', fontWeight: '600' }}>Ir a iniciar sesión</Text>
                    </Button>
                </View>
            </View>
        );
    }

    if (!canPublish) {
        return (
            <View style={styles.container}>
                <MobileHeader
                    title="Nueva Publicación"
                    backButton={true}
                    onBack={() => navigation.goBack()}
                />
                <View style={styles.blockedContainer}>
                    <Text style={styles.blockedTitle}>Tu perfil no puede publicar aún</Text>
                    <Text style={styles.blockedSubtitle}>
                        Esta sección está disponible para cuentas de negocio y consumidores regulares. Cambia tu rol o contacta a soporte si crees que es un error.
                    </Text>
                    <Button variant="outline" onPress={() => navigation.goBack()} style={styles.blockedButton}>
                        <Text style={{ fontWeight: '600' }}>Volver</Text>
                    </Button>
                </View>
            </View>
        );
    }

    const handlePublish = () => {
        if (!selectedType) {
            Alert.alert('Selecciona un tipo', 'Primero elige si publicarás un producto, bono o evento.');
            return;
        }

        if (selectedType !== 'product') {
            Alert.alert('Pendiente', 'Por el momento solo habilitamos publicaciones de productos físicos.');
            return;
        }

        if (!form.title || !form.price) {
            Alert.alert('Campos incompletos', 'Por favor completa al menos título y precio.');
            return;
        }

        if (form.condition === 'used' && !form.visualState.trim()) {
            Alert.alert('Falta información', 'Detalla el estado visual para productos usados.');
            return;
        }

        if (form.photos.length === 0) {
            Alert.alert('Fotos requeridas', 'Debes cargar al menos una foto real del artículo.');
            return;
        }

        const priceValue = parseFloat(form.price.replace(',', '.')) || 0;
        const stockValue = parseInt(form.stock || '1', 10) || 1;
        const weightValue = parseFloat(form.weight.replace(',', '.')) || 0.5;
        const damageDescription = form.condition === 'used'
            ? [form.visualState, form.functionalDetails, form.repairs].filter(Boolean).join(' | ')
            : undefined;

        const productResult = createProduct({
            title: form.title,
            description: form.description || 'Sin descripción detallada.',
            condition: form.condition,
            damageDescription,
            price: priceValue,
            stock: stockValue,
            category: 'Marketplace',
            tags: [],
            images: form.photos.map((url, index) => ({
                url,
                isPrimary: index === 0,
            })),
            shippingProfile: {
                weightKg: weightValue,
                dimensionsCm: parseDimensions(form.dimensions),
                shipsFromPostalCode: 'C1000',
                allowPickup: true,
            },
            location: {
                lat: -34.603722,
                lng: -58.381592,
                name: 'CABA',
                address: 'A coordinar con el comprador',
                distanceKm: 2,
            },
        });

        if (!productResult.success) {
            Alert.alert('No pudimos publicar tu producto', productResult.error || 'Inténtalo nuevamente en unos minutos.');
            return;
        }

        Alert.alert('¡Producto publicado!', 'Tu artículo ya figura en el marketplace.', [
            {
                text: 'Ver en Marketplace',
                onPress: () => {
                    setForm({
                        title: '', price: '', stock: '', description: '',
                        condition: 'new', visualState: '', functionalDetails: '', repairs: '',
                        weight: '', dimensions: '', photos: []
                    });
                    setPhotoUrl('');
                    setSelectedType(null);
                    navigation.navigate('Marketplace', { filter: 'products' });
                }
            }
        ]);
    };

    const renderSelector = () => (
        <View style={{ gap: 16 }}>
            <Text style={styles.sectionTitle}>¿Qué deseas publicar?</Text>

            {(isBusiness
                ? [
                    { id: 'product', icon: Package, title: 'Producto', desc: 'Vende artículos físicos', color: '#0284c7' },
                    { id: 'bonus', icon: Ticket, title: 'Bono', desc: 'Descuentos y cupones', color: '#7c3aed' },
                    { id: 'event', icon: Calendar, title: 'Evento', desc: 'Venta de entradas', color: '#059669' }
                ]
                : [
                    { id: 'product', icon: Package, title: 'Producto', desc: 'Publica artículos para vender', color: '#0284c7' }
                ]).map((item: any) => (
                <TouchableOpacity
                    key={item.id}
                    onPress={() => setSelectedType(item.id)}
                    style={styles.typeCardBtn}
                >
                    <Card style={{ flexDirection: 'row', padding: 16, alignItems: 'center', gap: 16 }}>
                        <View style={[styles.iconBox, { backgroundColor: item.color }]}>
                            <item.icon size={24} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{item.title}</Text>
                            <Text style={{ color: '#666', fontSize: 13 }}>{item.desc}</Text>
                        </View>
                    </Card>
                </TouchableOpacity>
            ))}
        </View>
    );

    const renderForm = () => (
        <View style={{ gap: 16 }}>
            <Card style={{ padding: 16, gap: 16 }}>
                <View>
                    <Text style={styles.label}>Título</Text>
                    <TextInput
                        style={styles.input}
                        placeholder={`Nombre del ${selectedType}`}
                        value={form.title}
                        onChangeText={t => setForm({ ...form, title: t })}
                    />
                </View>

                {selectedType === 'product' && (
                    <View style={styles.conditionContainer}>
                        <Text style={styles.label}>Condición</Text>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <TouchableOpacity
                                style={[styles.radioBtn, form.condition === 'new' && styles.radioBtnActive]}
                                onPress={() => setForm({ ...form, condition: 'new' })}
                            >
                                <Text style={[styles.radioText, form.condition === 'new' && styles.radioTextActive]}>Nuevo</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.radioBtn, form.condition === 'used' && styles.radioBtnActive]}
                                onPress={() => setForm({ ...form, condition: 'used' })}
                            >
                                <Text style={[styles.radioText, form.condition === 'used' && styles.radioTextActive]}>Usado</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {form.condition === 'used' && selectedType === 'product' && (
                    <View style={styles.usedSection}>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                            <AlertTriangle size={16} color="#eab308" />
                            <Text style={styles.sectionSubtitle}>Detalles del Estado (Obligatorio)</Text>
                        </View>
                        <View>
                            <Text style={styles.label}>Estado Visual</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Ej: Rayones leves en la carcasa..."
                                value={form.visualState}
                                onChangeText={t => setForm({ ...form, visualState: t })}
                            />
                        </View>
                        <View style={{ marginTop: 8 }}>
                            <Text style={styles.label}>Detalles Funcionales</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Ej: Batería al 85%..."
                                value={form.functionalDetails}
                                onChangeText={t => setForm({ ...form, functionalDetails: t })}
                            />
                        </View>
                    </View>
                )}

                <View>
                    <Text style={styles.label}>Precio</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="$0.00"
                        keyboardType="numeric"
                        value={form.price}
                        onChangeText={t => setForm({ ...form, price: t })}
                    />
                </View>
            </Card>

            {selectedType === 'product' && (
                <Card style={{ padding: 16, gap: 16 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <Truck size={18} color="#4b5563" />
                        <Text style={styles.sectionSubtitle}>Envío</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>Peso (kg)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="0.5"
                                keyboardType="numeric"
                                value={form.weight}
                                onChangeText={t => setForm({ ...form, weight: t })}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>Dimensiones (cm)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="20x10x5"
                                value={form.dimensions}
                                onChangeText={t => setForm({ ...form, dimensions: t })}
                            />
                        </View>
                    </View>
                    {shippingCosts && (
                        <View style={styles.shippingEstimate}>
                            <Text style={{ fontSize: 13, color: '#4b5563' }}>Estimación de envío (Nacional):</Text>
                            <Text style={{ fontWeight: 'bold', color: '#111827' }}>Estándar: ${shippingCosts.standard} | Express: ${shippingCosts.express}</Text>
                        </View>
                    )}
                </Card>
            )}

            <Card style={{ padding: 16, gap: 16 }}>
                <View>
                    <Text style={styles.label}>Descripción</Text>
                    <TextInput
                        style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
                        placeholder="Describe el estado general, accesorios incluidos y cualquier detalle relevante."
                        multiline
                        value={form.description}
                        onChangeText={t => setForm({ ...form, description: t })}
                    />
                </View>

                <View>
                    <Text style={styles.label}>Fotos (URL)</Text>
                    <View style={styles.photoRow}>
                        <TextInput
                            style={[styles.input, styles.photoInput]}
                            placeholder="https://..."
                            value={photoUrl}
                            onChangeText={setPhotoUrl}
                        />
                        <TouchableOpacity style={styles.photoAddButton} onPress={handleAddPhoto}>
                            <ImageIcon size={16} color="#fff" />
                            <Text style={styles.photoAddText}>Agregar</Text>
                        </TouchableOpacity>
                    </View>
                    {form.photos.length > 0 && (
                        <View style={styles.photoList}>
                            {form.photos.map((url) => (
                                <View key={url} style={styles.photoChip}>
                                    <ImageIcon size={14} color="#1F2937" />
                                    <Text style={styles.photoChipText} numberOfLines={1}>{url}</Text>
                                    <TouchableOpacity onPress={() => handleRemovePhoto(url)}>
                                        <X size={14} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            </Card>

            <Button onPress={handlePublish}>
                <Text>Publicar {selectedType === 'product' ? 'Producto' : selectedType === 'bonus' ? 'Bono' : 'Evento'}</Text>
            </Button>

            <Button variant="outline" onPress={() => setSelectedType(null)}>
                <Text>Cancelar</Text>
            </Button>
        </View>
    );

    return (
        <View style={styles.container}>
            <MobileHeader
                title={selectedType ? `Crear ${selectedType?.charAt(0).toUpperCase() + selectedType?.slice(1)}` : "Nueva Publicación"}
                backButton={true}
                onBack={() => {
                    if (selectedType) setSelectedType(null);
                    else navigation.goBack();
                }}
            />

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                {selectedType ? renderForm() : renderSelector()}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9f9f9' },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
    typeCardBtn: { marginBottom: 12 },
    iconBox: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    input: { backgroundColor: '#f3f4f6', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 4, color: '#374151' },
    
    conditionContainer: { marginBottom: 12 },
    radioBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', marginRight: 8, backgroundColor: '#fff' },
    radioBtnActive: { backgroundColor: '#111827', borderColor: '#111827' },
    radioText: { color: '#374151', fontSize: 13 },
    radioTextActive: { color: '#fff', fontWeight: 'bold' },

    usedSection: { backgroundColor: '#fefce8', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fde047', marginBottom: 12 },
    sectionSubtitle: { fontWeight: 'bold', color: '#374151', fontSize: 15 },
    
    shippingEstimate: { backgroundColor: '#f3f4f6', padding: 10, borderRadius: 8, marginTop: 4 },

    photoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    photoInput: { flex: 1 },
    photoAddButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#111827', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
    photoAddText: { color: '#fff', fontWeight: '600' },
    photoList: { marginTop: 12, gap: 8 },
    photoChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
    photoChipText: { flex: 1, fontSize: 12, color: '#1F2937' },

    blockedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
    blockedTitle: { fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center' },
    blockedSubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
    blockedButton: { minWidth: 200, marginTop: 8 }
});
