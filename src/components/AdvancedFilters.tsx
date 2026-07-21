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
import { glassShadow, Radius, colors } from '../theme/tokens';


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
            priceRange: [0, 1_000_000],
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
    header: { paddingHorizontal: 24, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: colors(isDark).text },
    closeBtn: { width: 32, height: 32, borderRadius: Radius.lg, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', alignItems: 'center', justifyContent: 'center' },
    scrollContent: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
    section: { marginBottom: 32 },
    sectionTitle: { fontSize: 13, fontWeight: 'bold', color: colors(isDark).text, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
    subSectionTitle: { fontSize: 13, fontWeight: '600', color: colors(isDark).textMuted, marginBottom: 12, marginTop: 4 },
    chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
    chipInactive: { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' },
    chipActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
    chipText: { fontSize: 13, fontWeight: '600' },
    chipTextInactive: { color: colors(isDark).textMuted },
    chipTextActive: { color: '#fff' },

    priceRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    priceInput: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', borderRadius: Radius.md, paddingHorizontal: 16, height: 48 },
    currency: { color: isDark ? '#9CA3AF' : '#9CA3AF', marginRight: 8, fontSize: 15 },
    input: { flex: 1, fontSize: 15, color: colors(isDark).text, fontWeight: '600' },
    priceDivider: { width: 12, height: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)' },

    ratingChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', gap: 6 },
    ratingChipActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
    ratingText: { fontSize: 14, fontWeight: '600', color: colors(isDark).textMuted },
    ratingTextActive: { color: '#fff' },

    footer: { flexDirection: 'row', padding: 24, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', gap: 16 },
    clearBtn: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: Radius.lg, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', alignItems: 'center' },
    clearBtnText: { color: colors(isDark).textMuted, fontWeight: '600', fontSize: 15 },
    applyBtn: { flex: 1, backgroundColor: isDark ? '#2196F3' : '#111827', borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, ...glassShadow(isDark),},
    applyBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
