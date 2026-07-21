import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Share, TextInput } from 'react-native';
import { Heart, ShoppingBag, Ticket, Calendar, MapPin, Star, Trash2, Search, X, Share2, ExternalLink, Tag } from 'lucide-react-native';

import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { MobileHeader } from '../components/MobileHeader';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { useFavorites, FavoriteItem } from '../hooks/useFavorites';
import { useTheme } from '../contexts/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useToast } from '../contexts/ToastContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { AlertTriangle } from 'lucide-react-native';
import { Radius, colors } from '../theme/tokens';


export default function SavedScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const { favorites, removeFromFavorites, toggleFavorite } = useFavorites();
    const [activeTab, setActiveTab] = useState<'all' | 'product' | 'bono' | 'event'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const handleUnsave = (id: string | number) => {
        removeFromFavorites(id);
        show('Elemento eliminado de guardados', 'success');
    };

    const handleShare = async (item: FavoriteItem) => {
        try {
            await Share.share({
                title: item.name,
                message: `¡Mira esto! ${item.name} en ${item.business || item.location}`,
            });
        } catch (error) {
            console.error(error);
        }
    };

    const [clearModalVisible, setClearModalVisible] = useState(false);

    const handleClearAll = () => {
        setClearModalVisible(true);
    };

    const confirmClearAll = () => {
        favorites.forEach(item => removeFromFavorites(item.id));
        show("Todos los guardados han sido eliminados", "success");
        setClearModalVisible(false);
    };

    const filteredItems = favorites.filter(item => {
        // Handle "bono" vs "bonus" mapping if necessary, but context normalizes to input type
        // In useFavorites we said: type: 'product' | 'bono' | 'event' | 'bonus'
        // Marketplace uses 'bono'. SavedScreen used 'bonus'. Let's stick to what's in item.type
        const matchesTab = activeTab === 'all' || item.type === activeTab || (activeTab === 'bono' && item.type === 'bonus');

        const matchesSearch =
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (item.business && item.business.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesTab && matchesSearch;
    });

    const getItemIcon = (type: string) => {
        switch (type) {
            case 'product': return ShoppingBag;
            case 'bonus':
            case 'bono': return Tag;
            case 'event': return Calendar;
            default: return ShoppingBag;
        }
    };

    const getItemColor = (type: string) => {
        switch (type) {
            case 'product': return '#06b6d4'; // cyan
            case 'bonus':
            case 'bono': return '#a855f7'; // purple
            case 'event': return '#ec4899'; // pink
            default: return '#666';
        }
    };

    const stats = {
        all: favorites.length,
        product: favorites.filter(i => i.type === 'product').length,
        bono: favorites.filter(i => i.type === 'bono' || i.type === 'bonus').length,
        event: favorites.filter(i => i.type === 'event').length,
    };

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Guardados"
                subtitle={`${filteredItems.length} elementos`}
                backButton={true}
                onBack={() => navigation.goBack()}
            />

            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                {/* SEARCH */}
                <View style={styles.searchContainer}>
                    <Search size={20} color={isDark ? "#9CA3AF" : "#999"} />
                    <TextInput
                        placeholder="Buscar guardados..."
                        placeholderTextColor={isDark ? "#6B7280" : "#999"}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        style={styles.searchInput}
                    />
                    {searchQuery !== '' && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X size={20} color={isDark ? "#9CA3AF" : "#999"} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* TABS STATS */}
                <View style={styles.tabsRow}>
                    {[
                        { id: 'all', icon: Heart, label: 'Todos', count: stats.all, color: '#ef4444' },
                        { id: 'product', icon: ShoppingBag, label: 'Prod', count: stats.product, color: '#3b82f6' },
                        { id: 'bono', icon: Tag, label: 'Bonos', count: stats.bono, color: '#a855f7' },
                        { id: 'event', icon: Calendar, label: 'Eventos', count: stats.event, color: '#ec4899' }
                    ].map((tab) => (
                        <TouchableOpacity
                            key={tab.id}
                            style={[
                                styles.tabCard,
                                activeTab === tab.id && styles.activeTabCard,
                                { borderColor: activeTab === tab.id ? tab.color : (isDark ? '#374151' : '#e5e7eb') }
                            ]}
                            onPress={() => setActiveTab(tab.id as any)}
                        >
                            <tab.icon size={16} color={tab.color} style={{ marginBottom: 4 }} />
                            <Text style={{ fontWeight: 'bold', fontSize: 16, color: isDark ? '#fff' : '#000' }}>{tab.count}</Text>
                            <Text style={{ fontSize: 10, color: isDark ? '#9CA3AF' : '#666' }}>{tab.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>
                {favorites.length > 0 && (
                    <Button
                        variant="outline"
                        onPress={handleClearAll}
                        style={{ marginBottom: 16, flexDirection: 'row', gap: 8 }}
                    >
                        <Trash2 size={16} color={isDark ? "#EF4444" : "#000"} />
                        <Text style={{ color: isDark ? '#EF4444' : '#000' }}>Eliminar Todos</Text>
                    </Button>
                )}

                {filteredItems.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                        <Heart size={48} color={isDark ? "#374151" : "#e5e7eb"} />
                        <Text style={{ marginTop: 16, fontSize: 16, color: isDark ? "#9CA3AF" : "#666", fontWeight: '600' }}>
                            {searchQuery ? 'No hay resultados' : 'No tienes guardados'}
                        </Text>
                    </View>
                ) : (
                    <View style={{ gap: 12 }}>
                        {filteredItems.map(item => {
                            const Icon = getItemIcon(item.type);
                            const color = getItemColor(item.type);

                            return (
                                <Card key={item.id} style={styles.itemCard}>
                                    <View style={{ flexDirection: 'row', padding: 12, gap: 12 }}>
                                        {/* IMAGE */}
                                        <View style={styles.imageContainer}>
                                            <ImageWithFallback src={item.image} style={styles.image} />
                                            <View style={[styles.typeIcon, { backgroundColor: color }]}>
                                                <Icon size={12} color="#fff" />
                                            </View>
                                        </View>

                                        {/* CONTENT */}
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <Text style={styles.itemTitle} numberOfLines={1}>{item.name}</Text>
                                                <TouchableOpacity onPress={() => handleUnsave(item.id)} style={{ padding: 4 }}>
                                                    <Heart size={16} color="#ef4444" fill="#ef4444" />
                                                </TouchableOpacity>
                                            </View>

                                            <Text style={styles.itemBusiness}>{item.business || item.location}</Text>

                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4 }}>
                                                {item.rating && (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                                        <Star size={12} color="#eab308" fill="#eab308" />
                                                        <Text style={{ fontSize: 12, color: isDark ? "#D1D5DB" : "#000" }}>{item.rating}</Text>
                                                    </View>
                                                )}
                                                {item.category && (
                                                    <Badge variant="secondary" style={{ height: 20 }}>{item.category}</Badge>
                                                )}
                                            </View>

                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                                                {item.location && typeof item.location === 'string' && (
                                                    <>
                                                        <MapPin size={12} color={isDark ? "#9CA3AF" : "#666"} />
                                                        <Text style={{ fontSize: 12, color: isDark ? "#9CA3AF" : "#666" }} numberOfLines={1}>{item.location}</Text>
                                                    </>
                                                )}
                                                {item.date && (
                                                    <>
                                                        <Calendar size={12} color={isDark ? "#9CA3AF" : "#666"} />
                                                        <Text style={{ fontSize: 12, color: isDark ? "#9CA3AF" : "#666" }}>{item.date}</Text>
                                                    </>
                                                )}
                                            </View>

                                            {(item.price || item.discount) && (
                                                <Text style={styles.priceText}>
                                                    {item.price ? `$${item.price}` : `${item.discount}% OFF`}
                                                </Text>
                                            )}

                                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 'auto' }}>
                                                <Button size="sm" style={{ flex: 1, height: 32 }} onPress={() => navigation.navigate('ItemDetail', { itemId: item.id, itemData: item.originalItem || item })}> {/* Improved navigation */}
                                                    <ExternalLink size={14} color="#fff" style={{ marginRight: 4 }} />
                                                    Ver
                                                </Button>
                                                <Button size="sm" variant="outline" style={{ width: 32, height: 32, paddingHorizontal: 0 }} onPress={() => handleShare(item)}>
                                                    <Share2 size={14} color={isDark ? "#fff" : "#000"} />
                                                </Button>
                                            </View>
                                        </View>
                                    </View>
                                </Card>
                            );
                        })}
                    </View>
                )}
            </ScrollView>

            <Sheet open={clearModalVisible} onOpenChange={setClearModalVisible}>
                <SheetContent side="bottom" style={styles.sheetContent}>
                    <SheetHeader>
                        <SheetTitle>Eliminar Todos</SheetTitle>
                    </SheetHeader>
                    <View style={styles.sheetBody}>
                        <View style={[styles.confirmationIcon, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2' }]}>
                            <AlertTriangle size={32} color={isDark ? '#ef4444' : '#dc2626'} />
                        </View>
                        <Text style={styles.sheetText}>
                            ¿Estás seguro de que deseas eliminar todos los elementos guardados?
                        </Text>
                        <View style={styles.sheetActions}>
                            <Button variant="outline" style={{ flex: 1 }} onPress={() => setClearModalVisible(false)}>
                                <Text style={{ color: isDark ? '#D1D5DB' : '#374151' }}>Cancelar</Text>
                            </Button>
                            <Button
                                style={{ flex: 1, backgroundColor: '#dc2626' }}
                                onPress={confirmClearAll}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Eliminar</Text>
                            </Button>
                        </View>
                    </View>
                </SheetContent>
            </Sheet>
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors(isDark).bg },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors(isDark).bg, paddingHorizontal: 10, borderRadius: Radius.md, height: 44, marginBottom: 16, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' },
    searchInput: { flex: 1, paddingHorizontal: 10, fontSize: 14, color: isDark ? '#fff' : '#000' },

    tabsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    tabCard: { flex: 1, backgroundColor: colors(isDark).glass, borderRadius: Radius.md, padding: 8, alignItems: 'center', borderWidth: 2, borderBottomWidth: 4 },
    activeTabCard: {},

    itemCard: { overflow: 'hidden' }, // Card is now smart, no need to touch bg
    imageContainer: { width: 90, height: 90, borderRadius: Radius.md, position: 'relative' },
    image: { width: '100%', height: '100%', borderRadius: Radius.md },
    typeIcon: { position: 'absolute', top: 4, left: 4, width: 20, height: 20, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },

    itemTitle: { fontWeight: 'bold', fontSize: 14, flex: 1, marginRight: 8, color: isDark ? '#fff' : '#000' },
    itemBusiness: { fontSize: 12, color: isDark ? '#9CA3AF' : '#666' },

    priceText: { fontWeight: 'bold', fontSize: 16, color: '#2196F3', marginBottom: 6 },

    // Sheet Styles
    sheetContent: {
        backgroundColor: colors(isDark).glass,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    sheetBody: {
        padding: 24,
        paddingBottom: 40,
        alignItems: 'center',
        gap: 16
    },
    confirmationIcon: {
        width: 64,
        height: 64,
        borderRadius: Radius['2xl'],
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8
    },
    sheetText: {
        fontSize: 16,
        color: colors(isDark).textMuted,
        textAlign: 'center',
        marginBottom: 16
    },
    sheetActions: {
        flexDirection: 'row',
        gap: 12,
        width: '100%'
    }
});
