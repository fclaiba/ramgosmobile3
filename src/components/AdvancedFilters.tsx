import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, Dimensions, Platform } from 'react-native';
import { X, Star, Check } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';

export interface FilterState {
    priceRange: [number, number];
    minRating: number | null;
    minDiscount: number | null;
    categories: string[];
    sortBy: string;
    searchLocation?: { lat: number, lng: number }; // For custom search center
}

import { UNIFIED_CATEGORIES } from '../config/UnifiedCategories';

const SORT_OPTIONS = [
    { id: 'relevancia', label: 'Relevancia' },
    { id: 'menor_precio', label: 'Menor Precio' },
    { id: 'mayor_precio', label: 'Mayor Precio' },
    { id: 'distance', label: 'Distancia' },
    { id: 'mejor_calificado', label: 'Mejor Calificado' },
];

export const AdvancedFilters = ({ open, onOpenChange, onApplyFilters, currentFilters }: any) => {
    const [filters, setFilters] = useState<FilterState>(currentFilters);
    const { theme, colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    useEffect(() => {
        if (open) {
            setFilters(currentFilters);
        }
    }, [open, currentFilters]);

    const handleCategoryToggle = (cat: string) => {
        setFilters(prev => {
            const exists = prev.categories.includes(cat);
            return {
                ...prev,
                categories: exists
                    ? prev.categories.filter(c => c !== cat)
                    : [...prev.categories, cat]
            };
        });
    };

    const handleApply = () => {
        onApplyFilters(filters);
        onOpenChange(false);
    };

    const handleClear = () => {
        const reset: FilterState = {
            priceRange: [0, 2000],
            minRating: null,
            minDiscount: null,
            categories: [],
            sortBy: 'relevancia',
        };
        setFilters(reset);
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" style={styles.sheetContent}>
                <SheetHeader style={styles.header}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <SheetTitle style={styles.headerTitle}>Filtros Avanzados</SheetTitle>
                        <TouchableOpacity
                            onPress={() => onOpenChange(false)}
                            style={styles.closeBtn}
                        >
                            <X size={20} color={isDark ? '#D1D5DB' : '#6B7280'} />
                        </TouchableOpacity>
                    </View>
                </SheetHeader>

                <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {/* ORDENAR POR */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Ordenar por</Text>
                        <View style={styles.chipsContainer}>
                            {SORT_OPTIONS.map(opt => {
                                const active = filters.sortBy === opt.id;
                                return (
                                    <TouchableOpacity
                                        key={opt.id}
                                        style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                                        onPress={() => setFilters({ ...filters, sortBy: opt.id })}
                                    >
                                        <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
                                            {opt.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* RANGO DE PRECIO */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Rango de Precio</Text>
                        <View style={styles.priceRow}>
                            <View style={styles.priceInput}>
                                <Text style={styles.currency}>$</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Min"
                                    placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
                                    keyboardType="numeric"
                                    value={filters.priceRange[0].toString()}
                                    onChangeText={(text) => setFilters({ ...filters, priceRange: [Number(text) || 0, filters.priceRange[1]] })}
                                />
                            </View>
                            <View style={styles.priceDivider} />
                            <View style={styles.priceInput}>
                                <Text style={styles.currency}>$</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Max"
                                    placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
                                    keyboardType="numeric"
                                    value={filters.priceRange[1].toString()}
                                    onChangeText={(text) => setFilters({ ...filters, priceRange: [filters.priceRange[0], Number(text) || 0] })}
                                />
                            </View>
                        </View>
                    </View>

                    {/* CALIFICACIÓN */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Calificación Mínima</Text>
                        <View style={styles.chipsContainer}>
                            {[4, 3, 2, 1].map((rating) => {
                                const active = filters.minRating === rating;
                                return (
                                    <TouchableOpacity
                                        key={rating}
                                        style={[styles.ratingChip, active && styles.ratingChipActive]}
                                        onPress={() => setFilters({ ...filters, minRating: active ? null : rating })}
                                    >
                                        <Star size={14} color={active ? '#fff' : '#FBBF24'} fill={active ? '#fff' : '#FBBF24'} />
                                        <Text style={[styles.ratingText, active && styles.ratingTextActive]}>{rating}+</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* CATEGORÍAS */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Categorías</Text>

                        {(['product', 'service', 'bono', 'event'] as const).map((type) => {
                            const label = type === 'product' ? 'Productos' :
                                type === 'service' ? 'Servicios' :
                                    type === 'bono' ? 'Bonos' : 'Eventos';

                            const categories = UNIFIED_CATEGORIES[type];

                            return (
                                <View key={type} style={{ marginBottom: 20 }}>
                                    <Text style={styles.subSectionTitle}>{label}</Text>
                                    <View style={styles.chipsContainer}>
                                        {categories.map(cat => {
                                            const active = filters.categories.includes(cat);
                                            return (
                                                <TouchableOpacity
                                                    key={cat}
                                                    style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                                                    onPress={() => handleCategoryToggle(cat)}
                                                >
                                                    {active && <Check size={12} color="#fff" style={{ marginRight: 4 }} />}
                                                    <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
                                                        {cat}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </ScrollView>

                {/* Footer Actions */}
                <View style={styles.footer}>
                    <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
                        <Text style={styles.clearBtnText}>Limpiar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleApply} style={styles.applyBtn}>
                        <Text style={styles.applyBtnText}>Aplicar Filtros</Text>
                    </TouchableOpacity>
                </View>
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    sheetContent: { backgroundColor: isDark ? '#1F2937' : 'white' },
    header: { paddingHorizontal: 24, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F3F4F6' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827' },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: isDark ? '#374151' : '#F9FAFB', alignItems: 'center', justifyContent: 'center' },
    scrollContent: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
    section: { marginBottom: 32 },
    sectionTitle: { fontSize: 13, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
    subSectionTitle: { fontSize: 13, fontWeight: '600', color: isDark ? '#9CA3AF' : '#4B5563', marginBottom: 12, marginTop: 4 },
    chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
    chipInactive: { backgroundColor: isDark ? '#374151' : '#F9FAFB', borderColor: isDark ? '#4B5563' : '#E5E7EB' },
    chipActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
    chipText: { fontSize: 13, fontWeight: '600' },
    chipTextInactive: { color: isDark ? '#D1D5DB' : '#4B5563' },
    chipTextActive: { color: '#fff' },

    priceRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    priceInput: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#374151' : '#F9FAFB', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, height: 48 },
    currency: { color: isDark ? '#9CA3AF' : '#9CA3AF', marginRight: 8, fontSize: 15 },
    input: { flex: 1, fontSize: 15, color: isDark ? '#F9FAFB' : '#111827', fontWeight: '600' },
    priceDivider: { width: 12, height: 2, backgroundColor: isDark ? '#4B5563' : '#E5E7EB' },

    ratingChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: isDark ? '#374151' : '#F9FAFB', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB', gap: 6 },
    ratingChipActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
    ratingText: { fontSize: 14, fontWeight: '600', color: isDark ? '#D1D5DB' : '#4B5563' },
    ratingTextActive: { color: '#fff' },

    footer: { flexDirection: 'row', padding: 24, borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#F3F4F6', gap: 16 },
    clearBtn: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 16, borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB', alignItems: 'center' },
    clearBtnText: { color: isDark ? '#D1D5DB' : '#4B5563', fontWeight: '600', fontSize: 15 },
    applyBtn: { flex: 1, backgroundColor: isDark ? '#7C3AED' : '#111827', borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
    applyBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
