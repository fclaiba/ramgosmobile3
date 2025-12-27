import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Share, TextInput } from 'react-native';
import { Heart, ShoppingBag, Ticket, Calendar, MapPin, Star, Trash2, Search, X, Share2, ExternalLink, Gift } from 'lucide-react-native';

import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { MobileHeader } from '../components/MobileHeader';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { useFavorites, FavoriteItem } from '../contexts/FavoritesContext';

export default function SavedScreen({ navigation }: any) {
    const { favorites, removeFromFavorites, toggleFavorite } = useFavorites();
    const [activeTab, setActiveTab] = useState<'all' | 'product' | 'bono' | 'event'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const handleUnsave = (id: string | number) => {
        removeFromFavorites(id);
        // Alert.alert('Eliminado', 'Elemento eliminado de guardados');
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

    const handleClearAll = () => {
        Alert.alert(
            "Eliminar Todos",
            "¿Estás seguro de que quieres eliminar todos los elementos guardados?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Eliminar",
                    style: "destructive",
                    onPress: () => {
                        favorites.forEach(item => removeFromFavorites(item.id));
                        Alert.alert("Eliminados", "Todos los guardados han sido eliminados.");
                    }
                }
            ]
        );
    };

    const filteredItems = favorites.filter(item => {
        // Handle "bono" vs "bonus" mapping if necessary, but context normalizes to input type
        // In FavoritesContext we said: type: 'product' | 'bono' | 'event' | 'bonus'
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
            case 'bono': return Gift;
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
                    <Search size={20} color="#999" />
                    <TextInput
                        placeholder="Buscar guardados..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        style={styles.searchInput}
                    />
                    {searchQuery !== '' && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X size={20} color="#999" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* TABS STATS */}
                <View style={styles.tabsRow}>
                    {[
                        { id: 'all', icon: Heart, label: 'Todos', count: stats.all, color: '#ef4444' },
                        { id: 'product', icon: ShoppingBag, label: 'Prod', count: stats.product, color: '#3b82f6' },
                        { id: 'bono', icon: Gift, label: 'Bonos', count: stats.bono, color: '#a855f7' },
                        { id: 'event', icon: Calendar, label: 'Eventos', count: stats.event, color: '#ec4899' }
                    ].map((tab) => (
                        <TouchableOpacity
                            key={tab.id}
                            style={[
                                styles.tabCard,
                                activeTab === tab.id && styles.activeTabCard,
                                { borderColor: activeTab === tab.id ? tab.color : '#e5e7eb' }
                            ]}
                            onPress={() => setActiveTab(tab.id as any)}
                        >
                            <tab.icon size={16} color={tab.color} style={{ marginBottom: 4 }} />
                            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{tab.count}</Text>
                            <Text style={{ fontSize: 10, color: '#666' }}>{tab.label}</Text>
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
                        <Trash2 size={16} color="#000" />
                        <Text>Eliminar Todos</Text>
                    </Button>
                )}

                {filteredItems.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                        <Heart size={48} color="#e5e7eb" />
                        <Text style={{ marginTop: 16, fontSize: 16, color: '#666', fontWeight: '600' }}>
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
                                                        <Text style={{ fontSize: 12 }}>{item.rating}</Text>
                                                    </View>
                                                )}
                                                {item.category && (
                                                    <Badge variant="secondary" style={{ height: 20 }}>{item.category}</Badge>
                                                )}
                                            </View>

                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                                                {item.location && typeof item.location === 'string' && (
                                                    <>
                                                        <MapPin size={12} color="#666" />
                                                        <Text style={{ fontSize: 12, color: '#666' }} numberOfLines={1}>{item.location}</Text>
                                                    </>
                                                )}
                                                {item.date && (
                                                    <>
                                                        <Calendar size={12} color="#666" />
                                                        <Text style={{ fontSize: 12, color: '#666' }}>{item.date}</Text>
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
                                                    <Share2 size={14} color="#000" />
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
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9f9f9' },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 10, borderRadius: 12, height: 44, marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb' },
    searchInput: { flex: 1, paddingHorizontal: 10, fontSize: 14 },

    tabsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    tabCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 8, alignItems: 'center', borderWidth: 2, borderBottomWidth: 4 },
    activeTabCard: {},

    itemCard: { overflow: 'hidden' },
    imageContainer: { width: 90, height: 90, borderRadius: 12, position: 'relative' },
    image: { width: '100%', height: '100%', borderRadius: 12 },
    typeIcon: { position: 'absolute', top: 4, left: 4, width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },

    itemTitle: { fontWeight: 'bold', fontSize: 14, flex: 1, marginRight: 8 },
    itemBusiness: { fontSize: 12, color: '#666' },

    priceText: { fontWeight: 'bold', fontSize: 16, color: '#007AFF', marginBottom: 6 }
});
