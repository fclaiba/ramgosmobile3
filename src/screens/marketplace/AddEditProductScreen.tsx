import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, Switch, Image, Alert } from 'react-native';
import { Camera, ChevronLeft, Upload, X } from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { useMarketplace } from '../../contexts/MarketplaceContext';
import { useAuth } from '../../contexts/AuthContext';

export default function AddEditProductScreen({ navigation }: any) {
    const { createProduct } = useMarketplace();
    const { user } = useAuth();

    const [title, setTitle] = useState('');
    const [price, setPrice] = useState('');
    const [description, setDescription] = useState('');
    const [condition, setCondition] = useState<'new' | 'used'>('new');
    const [damageDescription, setDamageDescription] = useState('');
    const [stock, setStock] = useState('1');
    const [category, setCategory] = useState('Electrónica');

    // Mock Image State
    const [images, setImages] = useState<string[]>([]);

    const handleAddImage = () => {
        // Mock image picker
        if (images.length < 5) {
            setImages([...images, 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=500']);
        }
    };

    const handleRemoveImage = (index: number) => {
        const newImages = [...images];
        newImages.splice(index, 1);
        setImages(newImages);
    };

    const handleSubmit = async () => {
        if (!title || !price || !description) {
            Alert.alert('Error', 'Por favor completa los campos obligatorios');
            return;
        }

        if (condition === 'used' && !damageDescription) {
            Alert.alert('Error', 'Debes describir el estado del producto usado');
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

        const result = createProduct(input);
        if (result.success) {
            Alert.alert('Éxito', 'Producto publicado correctamente', [
                { text: 'OK', onPress: () => navigation.goBack() }
            ]);
        } else {
            Alert.alert('Error', result.error || 'No se pudo crear el producto');
        }
    };

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Publicar Producto"
                showBack
                onBack={() => navigation.goBack()}
            />

            <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
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
                            <TouchableOpacity style={styles.addBtn} onPress={handleAddImage}>
                                <Camera size={24} color="#6B7280" />
                                <Text style={styles.addBtnText}>Agregar</Text>
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
                        value={title}
                        onChangeText={setTitle}
                    />

                    <Text style={styles.label}>Precio (USD)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="0.00"
                        keyboardType="numeric"
                        value={price}
                        onChangeText={setPrice}
                    />

                    <Text style={styles.label}>Categoría</Text>
                    <TextInput
                        style={styles.input}
                        value={category}
                        onChangeText={setCategory}
                    />

                    <Text style={styles.label}>Descripción</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Describe tu producto..."
                        multiline
                        numberOfLines={4}
                        value={description}
                        onChangeText={setDescription}
                    />
                </View>

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

                <View style={styles.section}>
                    <Text style={styles.label}>Stock Disponible</Text>
                    <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={stock}
                        onChangeText={setStock}
                    />
                </View>

                <TouchableOpacity style={styles.publishBtn} onPress={handleSubmit}>
                    <Upload size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.publishBtnText}>Publicar Producto</Text>
                </TouchableOpacity>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    content: { padding: 16 },
    section: { marginBottom: 24, backgroundColor: '#fff', padding: 16, borderRadius: 12 },
    label: { fontSize: 14, fontWeight: '600', color: '#1F2937', marginBottom: 8 },
    input: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: '#111827',
        backgroundColor: '#F9FAFB',
        marginBottom: 16
    },
    textArea: { height: 100, textAlignVertical: 'top' },

    // Images
    imageScroll: { flexDirection: 'row', marginBottom: 8 },
    imageContainer: { marginRight: 12, position: 'relative' },
    image: { width: 100, height: 100, borderRadius: 8 },
    removeBtn: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: '#EF4444',
        borderRadius: 12,
        padding: 4
    },
    addBtn: {
        width: 100,
        height: 100,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#E5E7EB',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center'
    },
    addBtnText: { marginTop: 8, fontSize: 12, color: '#6B7280' },

    // Toggle
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    toggleContainer: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 20, padding: 2 },
    toggleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 },
    toggleActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    toggleText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
    textActive: { color: '#111827', fontWeight: '600' },

    // Warning Used
    warningBox: {
        backgroundColor: '#FFFBEB',
        borderWidth: 1,
        borderColor: '#FCD34D',
        borderRadius: 8,
        padding: 12
    },
    warningLabel: { fontSize: 13, fontWeight: '600', color: '#92400E', marginBottom: 8 },
    warningInput: { backgroundColor: '#fff', borderColor: '#FDE68A', marginBottom: 4 },
    helperText: { fontSize: 12, color: '#B45309' },

    publishBtn: {
        backgroundColor: '#7C3AED',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        marginTop: 8
    },
    publishBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
