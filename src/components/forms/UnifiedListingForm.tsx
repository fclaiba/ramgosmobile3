import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions, Platform, KeyboardAvoidingView } from 'react-native';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { ImageUploadField } from '../ui/ImageUploadField';
import { useTheme } from '../../contexts/ThemeContext';
import { CheckCircle, Circle, MapPin, Calendar, Clock, ChevronDown } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, colors } from '../../theme/tokens';


export type ListingType = 'product' | 'service' | 'event' | 'bono';

interface BranchOption {
    id: string;
    name: string;
}

interface UnifiedListingFormProps {
    type: ListingType;
    initialData?: any;
    onSubmit: (data: any) => Promise<void>;
    onCancel: () => void;
    isLoading?: boolean;
    branches?: BranchOption[]; // Optional branches for selection
}

export const UnifiedListingForm = ({ type, initialData, onSubmit, onCancel, isLoading, branches = [] }: UnifiedListingFormProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { width } = useWindowDimensions();
    const isMobile = width < 768;
    const styles = getStyles(isDark, isMobile);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        stock: '',
        category: '',
        // Product specific
        condition: 'new' as 'new' | 'used',
        featured: false,
        // Event specific
        date: '',
        time: '',
        location: '',
        capacity: '',
        // Bonus specific
        discountType: 'percentage' as 'percentage' | 'fixed',
        value: '',
        maxPerUser: '',
        startDate: '',
        endDate: '',
        branchIds: [] as string[],
        // Common
        images: [] as string[],
    });

    useEffect(() => {
        if (initialData) {
            setFormData(prev => ({ ...prev, ...initialData }));
        }
    }, [initialData]);

    const handleChange = (key: string, value: any) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const toggleBranch = (id: string) => {
        setFormData(prev => {
            const current = prev.branchIds;
            if (current.includes(id)) {
                return { ...prev, branchIds: current.filter(b => b !== id) };
            } else {
                return { ...prev, branchIds: [...current, id] };
            }
        });
    };

    const handleSubmit = async () => {
        await onSubmit(formData);
    };

    // Render helpers
    const renderInput = (label: string, value: string, key: string, placeholder: string, keyboardType: 'default' | 'numeric' = 'default', multiline = false) => (
        <View style={styles.inputContainer}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                style={[styles.input, multiline && styles.textArea]}
                value={value}
                onChangeText={(text) => handleChange(key, text)}
                placeholder={placeholder}
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                keyboardType={keyboardType}
                multiline={multiline}
            />
        </View>
    );

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Card style={styles.card}>
                    {/* Header showing type */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>
                            {type === 'product' && 'Nuevo Producto'}
                            {type === 'service' && 'Nuevo Servicio'}
                            {type === 'event' && 'Nuevo Evento'}
                            {type === 'bono' && 'Nuevo Bono'}
                        </Text>
                        <Text style={styles.headerSubtitle}>Completa la información para publicar</Text>
                    </View>

                    {/* Common Fields */}
                    {renderInput('Título / Nombre', formData.name, 'name', 'Ej. Pizza Familiar')}

                    {/* Dynamic Fields Grid */}
                    <View style={styles.grid}>
                        {/* Price & Stock */}
                        <View style={styles.row}>
                            {type === 'bono' ? (
                                <View style={styles.col}>
                                    {/* For Bono, price is automatically 50% of value */}
                                    <View style={styles.inputGroup}>
                                        <Text style={styles.label}>Precio a Cobrar (50%)</Text>
                                        <View style={[styles.input, { backgroundColor: colors(isDark).glass, justifyContent: 'center' }]}>
                                            <Text style={{ color: colors(isDark).textMuted }}>
                                                ${formData.price || '0.00'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            ) : (
                                <View style={styles.col}>{renderInput('Precio ($)', formData.price, 'price', '0.00', 'numeric')}</View>
                            )}
                            {(type === 'product' || type === 'event' || type === 'bono') && (
                                <View style={styles.col}>{renderInput(type === 'event' ? 'Aforo' : 'Stock', type === 'event' ? formData.capacity : formData.stock, type === 'event' ? 'capacity' : 'stock', '0', 'numeric')}</View>
                            )}
                        </View>

                        {/* Bono Specifics */}
                        {type === 'bono' && (
                            <>
                                <View style={styles.row}>
                                    <View style={styles.col}>
                                        <View style={styles.inputGroup}>
                                            <Text style={styles.label}>Monto a Consumir ($)</Text>
                                            <TextInput
                                                style={styles.input}
                                                value={formData.value}
                                                onChangeText={(t) => {
                                                    const sanitized = t.replace(/[^0-9.]/g, '');
                                                    const num = parseFloat(sanitized) || 0;
                                                    handleChange('value', sanitized);
                                                    handleChange('price', num > 0 ? (num / 2).toString() : '');
                                                }}
                                                placeholder="Ej. 200"
                                                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                                keyboardType="numeric"
                                            />
                                        </View>
                                    </View>
                                    <View style={styles.col}>{renderInput('Max por usuario', formData.maxPerUser, 'maxPerUser', '1', 'numeric')}</View>
                                </View>
                                <View style={styles.row}>
                                    <View style={styles.col}>{renderInput('Fecha Inicio', formData.startDate, 'startDate', 'DD/MM/YYYY')}</View>
                                    <View style={styles.col}>{renderInput('Fecha Fin', formData.endDate, 'endDate', 'DD/MM/YYYY')}</View>
                                </View>
                            </>
                        )}

                        {/* Event Specifics */}
                        {type === 'event' && (
                            <>
                                <View style={styles.row}>
                                    <View style={styles.col}>{renderInput('Fecha', formData.date, 'date', 'DD/MM/YYYY')}</View>
                                    <View style={styles.col}>{renderInput('Hora', formData.time, 'time', 'HH:MM')}</View>
                                </View>
                                {renderInput('Ubicación (Dirección)', formData.location, 'location', 'Av. Principal 123')}
                            </>
                        )}

                        {/* Branch Selection for Coupon/Events if enabled */}
                        {branches.length > 0 && (type === 'bono' || type === 'event' || type === 'product' || type === 'service') && (
                            <View style={styles.inputContainer}>
                                <Text style={styles.label}>Sucursales Disponibles</Text>
                                <View style={styles.branchRow}>
                                    {branches.map(branch => (
                                        <TouchableOpacity
                                            key={branch.id}
                                            style={[styles.chip, formData.branchIds.includes(branch.id) && styles.chipActive]}
                                            onPress={() => toggleBranch(branch.id)}
                                        >
                                            <Text style={[styles.chipText, formData.branchIds.includes(branch.id) && styles.chipTextActive]}>{branch.name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Product Condition */}
                        {type === 'product' && (
                            <View style={styles.inputContainer}>
                                <Text style={styles.label}>Condición</Text>
                                <View style={styles.toggleRowSimple}>
                                    <TouchableOpacity
                                        style={[styles.chip, formData.condition === 'new' && styles.chipActive]}
                                        onPress={() => handleChange('condition', 'new')}
                                    >
                                        <Text style={[styles.chipText, formData.condition === 'new' && styles.chipTextActive]}>Nuevo</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.chip, formData.condition === 'used' && styles.chipActive]}
                                        onPress={() => handleChange('condition', 'used')}
                                    >
                                        <Text style={[styles.chipText, formData.condition === 'used' && styles.chipTextActive]}>Usado</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Common Description */}
                    {renderInput('Descripción detallada', formData.description, 'description', 'Describe tu publicación...', 'default', true)}

                    {/* Images Integration */}
                    <ImageUploadField
                        images={formData.images}
                        onChange={(imgs) => handleChange('images', imgs)}
                        maxImages={5}
                    />

                    {/* Actions */}
                    <View style={styles.actions}>
                        <Button onPress={handleSubmit} disabled={isLoading} style={styles.submitBtn}>
                            <Text style={styles.submitText}>{isLoading ? 'Guardando...' : 'Publicar'}</Text>
                        </Button>
                        <Button variant="outline" onPress={onCancel} disabled={isLoading} style={styles.cancelBtn}>
                            <Text style={styles.cancelText}>Cancelar</Text>
                        </Button>
                    </View>
                </Card>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const getStyles = (isDark: boolean, isMobile: boolean) => StyleSheet.create({
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    card: {
        padding: 24,
        backgroundColor: colors(isDark).glass,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
    },
    header: {
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors(isDark).text,
    },
    headerSubtitle: {
        fontSize: 14,
        color: colors(isDark).textMuted,
        marginTop: 4,
    },
    grid: {
        gap: 16,
    },
    row: {
        flexDirection: isMobile ? 'column' : 'row',
        gap: 16,
    },
    col: {
        flex: 1,
    },
    inputGroup: {
        gap: 8,
    },
    inputContainer: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: colors(isDark).text,
        marginBottom: 8,
    },
    input: {
        backgroundColor: colors(isDark).glass,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
        borderRadius: Radius.md,
        padding: 12,
        color: colors(isDark).text,
        fontSize: 16,
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    actions: {
        marginTop: 32,
        gap: 12,
    },
    submitBtn: {
        backgroundColor: '#2196F3', // Premium Purple
        borderRadius: Radius.md,
        paddingVertical: 16,
    },
    submitText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
        textAlign: 'center',
    },
    cancelBtn: {
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
    },
    cancelText: {
        color: colors(isDark).textMuted,
        textAlign: 'center',
    },
    toggleRow: {
        flexDirection: 'row',
        backgroundColor: isDark ? '#111827' : '#F3F4F6',
        borderRadius: Radius.sm,
        padding: 4,
    },
    toggleBtn: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: Radius.sm,
    },
    toggleBtnActive: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)',
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    toggleText: {
        fontWeight: 'bold',
        color: isDark ? '#6B7280' : '#9CA3AF',
    },
    toggleTextActive: {
        color: '#2196F3',
    },
    toggleRowSimple: {
        flexDirection: 'row',
        gap: 12,
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: Radius.xl,
        backgroundColor: colors(isDark).glass,
    },
    chipActive: {
        backgroundColor: '#2196F3',
    },
    chipText: {
        color: colors(isDark).textMuted,
        fontWeight: '600',
    },
    chipTextActive: {
        color: '#FFFFFF',
    },
    branchRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    }
});
