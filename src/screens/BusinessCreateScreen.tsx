import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Alert,
    TextInput,
} from 'react-native';
import { Package, Ticket, Calendar, Percent, BadgePercent, MapPin, Clock } from 'lucide-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useBusiness } from '../contexts/BusinessContext';

type PublicationType = 'product' | 'bonus' | 'event' | null;

interface ProductFormState {
    name: string;
    category: string;
    price: string;
    stock: string;
    description: string;
    featured: boolean;
}

interface BonusFormState {
    name: string;
    description: string;
    discountType: 'percentage' | 'fixed';
    value: string;
    stock: string;
    maxPerUser: string;
    startDate: string;
    endDate: string;
    minPurchase: string;
    branchIds: string[];
}

interface EventFormState {
    name: string;
    location: string;
    date: string;
    time: string;
    price: string;
    capacity: string;
    description: string;
}

export default function BusinessCreateScreen({ navigation, route }: any) {
    const [selectedType, setSelectedType] = useState<PublicationType>(route?.params?.type || null);
    const { addCatalogItem, createCoupon, branches } = useBusiness();

    const initialBranchSelection = useMemo(() => branches.map((branch) => branch.id), [branches]);

    const [productForm, setProductForm] = useState<ProductFormState>({
        name: '',
        category: '',
        price: '',
        stock: '',
        description: '',
        featured: false,
    });

    const [bonusForm, setBonusForm] = useState<BonusFormState>({
        name: '',
        description: '',
        discountType: 'percentage',
        value: '',
        stock: '',
        maxPerUser: '1',
        startDate: '',
        endDate: '',
        minPurchase: '',
        branchIds: initialBranchSelection,
    });

    const [eventForm, setEventForm] = useState<EventFormState>({
        name: '',
        location: '',
        date: '',
        time: '',
        price: '',
        capacity: '',
        description: '',
    });

    useEffect(() => {
        setBonusForm((prev) => {
            if (prev.branchIds.length === 0 && branches.length > 0) {
                return { ...prev, branchIds: branches.map((branch) => branch.id) };
            }
            const availableIds = branches.map((branch) => branch.id);
            const filteredSelection = prev.branchIds.filter((id) => availableIds.includes(id));
            return { ...prev, branchIds: filteredSelection };
        });
    }, [branches]);

    const resetForms = () => {
        setProductForm({
            name: '',
            category: '',
            price: '',
            stock: '',
            description: '',
            featured: false,
        });
        setBonusForm({
            name: '',
            description: '',
            discountType: 'percentage',
            value: '',
            stock: '',
            maxPerUser: '1',
            startDate: '',
            endDate: '',
            minPurchase: '',
            branchIds: branches.map((branch) => branch.id),
        });
        setEventForm({
            name: '',
            location: '',
            date: '',
            time: '',
            price: '',
            capacity: '',
            description: '',
        });
    };

    const handlePublishProduct = () => {
        if (!productForm.name || !productForm.price) {
            Alert.alert('Información incompleta', 'Añade al menos nombre y precio para publicar.');
            return;
        }
        addCatalogItem({
            name: productForm.name,
            category: productForm.category || 'General',
            price: Number(productForm.price) || 0,
            stock: Number(productForm.stock) || 0,
            description: productForm.description,
            status: 'published',
            featured: productForm.featured,
        });
        Alert.alert('Producto publicado', 'Tu producto ya aparece en el catálogo.', [
            {
                text: 'Volver al panel',
                onPress: () => {
                    resetForms();
                    setSelectedType(null);
                    navigation.navigate('BusinessDashboard');
                },
            },
        ]);
    };

    const handlePublishBonus = () => {
        if (!bonusForm.name || !bonusForm.value || !bonusForm.stock || !bonusForm.startDate || !bonusForm.endDate) {
            Alert.alert('Información incompleta', 'Completa nombre, valor, stock y fechas del bono.');
            return;
        }

        const payload = {
            name: bonusForm.name,
            description: bonusForm.description,
            discountType: bonusForm.discountType,
            value: Number(bonusForm.value) || 0,
            stock: Number(bonusForm.stock) || 0,
            maxPerUser: Number(bonusForm.maxPerUser) || 1,
            startDate: bonusForm.startDate,
            endDate: bonusForm.endDate,
            minPurchase: bonusForm.minPurchase ? Number(bonusForm.minPurchase) : undefined,
            branchIds: bonusForm.branchIds.length ? bonusForm.branchIds : branches.map((branch) => branch.id),
        };

        const coupon = createCoupon(payload);
        Alert.alert('Bono creado', `Código generado: ${coupon.code}`, [
            {
                text: 'Listo',
                onPress: () => {
                    resetForms();
                    setSelectedType(null);
                    navigation.navigate('BusinessDashboard');
                },
            },
        ]);
    };

    const handlePublishEvent = () => {
        if (!eventForm.name || !eventForm.date || !eventForm.location) {
            Alert.alert('Información incompleta', 'Nombre, fecha y ubicación son requeridos.');
            return;
        }

        // Logic to simulate event creation (can be connected to a Context later)
        Alert.alert('Evento Creado', `El evento "${eventForm.name}" ha sido publicado correctamente.`, [
            {
                text: 'Ir al Panel',
                onPress: () => {
                    resetForms();
                    setSelectedType(null);
                    navigation.navigate('BusinessDashboard');
                },
            },
        ]);
    };

    const toggleBranchSelection = (branchId: string) => {
        setBonusForm((prev) => {
            const isSelected = prev.branchIds.includes(branchId);
            if (isSelected) {
                const nextSelection = prev.branchIds.filter((id) => id !== branchId);
                return { ...prev, branchIds: nextSelection };
            }
            return { ...prev, branchIds: [...prev.branchIds, branchId] };
        });
    };

    const renderSelector = () => (
        <View style={{ gap: 16 }}>
            <Text style={styles.sectionTitle}>¿Qué deseas publicar?</Text>

            {[
                { id: 'product', icon: Package, title: 'Producto', desc: 'Vende artículos y combos', color: '#0284c7' },
                { id: 'bonus', icon: Ticket, title: 'Bono o cupón', desc: 'Define promociones y descuentos', color: '#7c3aed' },
                { id: 'event', icon: Calendar, title: 'Evento', desc: 'Vende tickets y gestiona aforo', color: '#059669' },
            ].map((item) => (
                <TouchableOpacity key={item.id} onPress={() => setSelectedType(item.id as PublicationType)}>
                    <Card style={styles.selectorCard}>
                        <View style={[styles.selectorIcon, { backgroundColor: item.color }]}>
                            <item.icon size={24} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.selectorTitle}>{item.title}</Text>
                            <Text style={styles.selectorSubtitle}>{item.desc}</Text>
                        </View>
                    </Card>
                </TouchableOpacity>
            ))}
        </View>
    );

    const renderProductForm = () => (
        <View style={styles.formWrapper}>
            <Card style={styles.formCard}>
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Nombre del producto</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ej. Pizza familiar"
                        value={productForm.name}
                        onChangeText={(value) => setProductForm((prev) => ({ ...prev, name: value }))}
                    />
                </View>
                <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Categoría</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Categoría"
                            value={productForm.category}
                            onChangeText={(value) => setProductForm((prev) => ({ ...prev, category: value }))}
                        />
                    </View>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Precio</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="0.00"
                            keyboardType="numeric"
                            value={productForm.price}
                            onChangeText={(value) => setProductForm((prev) => ({ ...prev, price: value }))}
                        />
                    </View>
                </View>
                <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Stock</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="0"
                            keyboardType="numeric"
                            value={productForm.stock}
                            onChangeText={(value) => setProductForm((prev) => ({ ...prev, stock: value }))}
                        />
                    </View>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Destacado</Text>
                        <TouchableOpacity
                            style={[styles.toggle, productForm.featured && styles.toggleActive]}
                            onPress={() => setProductForm((prev) => ({ ...prev, featured: !prev.featured }))}
                        >
                            <Text style={[styles.toggleLabel, productForm.featured && styles.toggleLabelActive]}>
                                {productForm.featured ? 'Sí' : 'No'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Descripción</Text>
                    <TextInput
                        style={[styles.input, styles.inputMultiline]}
                        placeholder="Detalla ingredientes, tamaño, etc."
                        multiline
                        value={productForm.description}
                        onChangeText={(value) => setProductForm((prev) => ({ ...prev, description: value }))}
                    />
                </View>
            </Card>

            <Button onPress={handlePublishProduct}>
                <Text style={styles.buttonTextLight}>Publicar producto</Text>
            </Button>
            <Button variant="outline" onPress={() => setSelectedType(null)}>
                <Text style={styles.buttonTextDark}>Cancelar</Text>
            </Button>
        </View>
    );

    const renderBonusForm = () => (
        <View style={styles.formWrapper}>
            <Card style={styles.formCard}>
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Nombre del bono</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ej. 2x1 en brunch"
                        value={bonusForm.name}
                        onChangeText={(value) => setBonusForm((prev) => ({ ...prev, name: value }))}
                    />
                </View>
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Descripción</Text>
                    <TextInput
                        style={[styles.input, styles.inputMultiline]}
                        placeholder="Condiciones y alcance de la promoción"
                        multiline
                        value={bonusForm.description}
                        onChangeText={(value) => setBonusForm((prev) => ({ ...prev, description: value }))}
                    />
                </View>
                <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Tipo de descuento</Text>
                        <View style={styles.selectorRow}>
                            <TouchableOpacity
                                style={[
                                    styles.selectorChip,
                                    bonusForm.discountType === 'percentage' && styles.selectorChipActive,
                                ]}
                                onPress={() => setBonusForm((prev) => ({ ...prev, discountType: 'percentage' }))}
                            >
                                <Percent size={14} color={bonusForm.discountType === 'percentage' ? '#fff' : '#475569'} />
                                <Text
                                    style={[
                                        styles.selectorChipText,
                                        bonusForm.discountType === 'percentage' && styles.selectorChipTextActive,
                                    ]}
                                >
                                    Porcentaje
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.selectorChip,
                                    bonusForm.discountType === 'fixed' && styles.selectorChipActive,
                                ]}
                                onPress={() => setBonusForm((prev) => ({ ...prev, discountType: 'fixed' }))}
                            >
                                <BadgePercent
                                    size={14}
                                    color={bonusForm.discountType === 'fixed' ? '#fff' : '#475569'}
                                />
                                <Text
                                    style={[
                                        styles.selectorChipText,
                                        bonusForm.discountType === 'fixed' && styles.selectorChipTextActive,
                                    ]}
                                >
                                    Monto fijo
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
                <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Valor</Text>
                        <TextInput
                            style={styles.input}
                            placeholder={bonusForm.discountType === 'percentage' ? 'Ej. 30' : 'Ej. 10.00'}
                            keyboardType="numeric"
                            value={bonusForm.value}
                            onChangeText={(value) => setBonusForm((prev) => ({ ...prev, value }))}
                        />
                    </View>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Stock total</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ej. 100"
                            keyboardType="numeric"
                            value={bonusForm.stock}
                            onChangeText={(value) => setBonusForm((prev) => ({ ...prev, stock: value }))}
                        />
                    </View>
                </View>
                <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Máximo por usuario</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ej. 2"
                            keyboardType="numeric"
                            value={bonusForm.maxPerUser}
                            onChangeText={(value) => setBonusForm((prev) => ({ ...prev, maxPerUser: value }))}
                        />
                    </View>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Compra mínima (opcional)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ej. 30"
                            keyboardType="numeric"
                            value={bonusForm.minPurchase}
                            onChangeText={(value) => setBonusForm((prev) => ({ ...prev, minPurchase: value }))}
                        />
                    </View>
                </View>
                <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Fecha inicio</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="YYYY-MM-DD"
                            value={bonusForm.startDate}
                            onChangeText={(value) => setBonusForm((prev) => ({ ...prev, startDate: value }))}
                        />
                    </View>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Fecha fin</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="YYYY-MM-DD"
                            value={bonusForm.endDate}
                            onChangeText={(value) => setBonusForm((prev) => ({ ...prev, endDate: value }))}
                        />
                    </View>
                </View>
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Sucursales habilitadas</Text>
                    <View style={styles.branchGrid}>
                        {branches.map((branch) => {
                            const isSelected = bonusForm.branchIds.includes(branch.id);
                            return (
                                <TouchableOpacity
                                    key={branch.id}
                                    style={[styles.branchChip, isSelected && styles.branchChipActive]}
                                    onPress={() => toggleBranchSelection(branch.id)}
                                >
                                    <Text
                                        style={[styles.branchChipText, isSelected && styles.branchChipTextActive]}
                                    >
                                        {branch.name}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            </Card>

            <Button onPress={handlePublishBonus}>
                <Text style={styles.buttonTextLight}>Crear bono</Text>
            </Button>
            <Button variant="outline" onPress={() => setSelectedType(null)}>
                <Text style={styles.buttonTextDark}>Cancelar</Text>
            </Button>
        </View>
    );

    const renderEventForm = () => (
        <View style={styles.formWrapper}>
            <Card style={styles.formCard}>
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Nombre del evento</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ej. Noche de Jazz"
                        value={eventForm.name}
                        onChangeText={(value) => setEventForm((prev) => ({ ...prev, name: value }))}
                    />
                </View>
                <View style={styles.formRow}>
                    <View style={{ flex: 1, gap: 6 }}>
                        <Text style={styles.label}>Ubicación</Text>
                        <View style={{ position: 'relative' }}>
                            <TextInput
                                style={[styles.input, { paddingLeft: 40 }]}
                                placeholder="Dirección o lugar"
                                value={eventForm.location}
                                onChangeText={(value) => setEventForm((prev) => ({ ...prev, location: value }))}
                            />
                            <MapPin size={18} color="#9CA3AF" style={{ position: 'absolute', left: 12, top: 12 }} />
                        </View>
                    </View>
                </View>
                <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Fecha</Text>
                        <View style={{ position: 'relative' }}>
                            <TextInput
                                style={[styles.input, { paddingLeft: 40 }]}
                                placeholder="YYYY-MM-DD"
                                value={eventForm.date}
                                onChangeText={(value) => setEventForm((prev) => ({ ...prev, date: value }))}
                            />
                            <Calendar size={18} color="#9CA3AF" style={{ position: 'absolute', left: 12, top: 12 }} />
                        </View>
                    </View>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Hora</Text>
                        <View style={{ position: 'relative' }}>
                            <TextInput
                                style={[styles.input, { paddingLeft: 40 }]}
                                placeholder="HH:MM"
                                value={eventForm.time}
                                onChangeText={(value) => setEventForm((prev) => ({ ...prev, time: value }))}
                            />
                            <Clock size={18} color="#9CA3AF" style={{ position: 'absolute', left: 12, top: 12 }} />
                        </View>
                    </View>
                </View>
                <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Precio Ticket</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="0.00"
                            keyboardType="numeric"
                            value={eventForm.price}
                            onChangeText={(value) => setEventForm((prev) => ({ ...prev, price: value }))}
                        />
                    </View>
                    <View style={styles.formColumn}>
                        <Text style={styles.label}>Aforo Max</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="0"
                            keyboardType="numeric"
                            value={eventForm.capacity}
                            onChangeText={(value) => setEventForm((prev) => ({ ...prev, capacity: value }))}
                        />
                    </View>
                </View>
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Descripción</Text>
                    <TextInput
                        style={[styles.input, styles.inputMultiline]}
                        placeholder="Detalles del evento..."
                        multiline
                        value={eventForm.description}
                        onChangeText={(value) => setEventForm((prev) => ({ ...prev, description: value }))}
                    />
                </View>
            </Card>

            <Button onPress={handlePublishEvent}>
                <Text style={styles.buttonTextLight}>Publicar Evento</Text>
            </Button>
            <Button variant="outline" onPress={() => setSelectedType(null)}>
                <Text style={styles.buttonTextDark}>Cancelar</Text>
            </Button>
        </View>
    );

    return (
        <View style={styles.container}>
            <MobileHeader
                title={
                    selectedType
                        ? `Crear ${selectedType === 'bonus' ? 'bono' : selectedType === 'product' ? 'producto' : 'evento'}`
                        : 'Nueva publicación'
                }
                backButton
                onBack={() => {
                    if (selectedType) {
                        setSelectedType(null);
                    } else {
                        navigation.goBack();
                    }
                }}
            />

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
                {selectedType === null && renderSelector()}
                {selectedType === 'product' && renderProductForm()}
                {selectedType === 'bonus' && renderBonusForm()}
                {selectedType === 'event' && renderEventForm()}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4, color: '#0f172a' },
    selectorCard: {
        flexDirection: 'row',
        gap: 16,
        padding: 18,
        borderRadius: 16,
        backgroundColor: '#fff',
        marginBottom: 12,
        alignItems: 'center',
    },
    selectorIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectorTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
    selectorSubtitle: { fontSize: 13, color: '#64748b', marginTop: 4 },
    formWrapper: { gap: 16 },
    formCard: { padding: 18, borderRadius: 16, backgroundColor: '#fff', gap: 16 },
    formGroup: { gap: 8 },
    formRow: { flexDirection: 'row', gap: 12 },
    formColumn: { flex: 1, gap: 6 },
    label: { fontSize: 13, fontWeight: '600', color: '#475569' },
    input: {
        backgroundColor: '#f8fafc',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: '#0f172a',
    },
    inputMultiline: { height: 100, textAlignVertical: 'top' },
    toggle: {
        height: 42,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    toggleActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    toggleLabel: { fontSize: 14, fontWeight: '600', color: '#475569' },
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
        borderColor: '#e2e8f0',
        backgroundColor: '#fff',
    },
    selectorChipActive: { backgroundColor: '#111827', borderColor: '#111827' },
    selectorChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
    selectorChipTextActive: { color: '#fff' },
    branchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    branchChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#cbd5f5',
        backgroundColor: '#f8fafc',
    },
    branchChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    branchChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
    branchChipTextActive: { color: '#fff' },
    buttonTextLight: { color: '#fff', fontWeight: '600', fontSize: 14 },
    buttonTextDark: { color: '#111827', fontWeight: '600', fontSize: 14 },
    placeholderCard: { padding: 24, borderRadius: 18, backgroundColor: '#fff', gap: 12, marginTop: 16 },
    placeholderTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
    placeholderCopy: { fontSize: 14, color: '#475569', lineHeight: 20 },
});
