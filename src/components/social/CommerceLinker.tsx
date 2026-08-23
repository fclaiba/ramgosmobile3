import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Image } from 'react-native';
import { X, Search, Tag } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Radius, colors } from '../../theme/tokens';
import { formatCurrency } from '../../utils/formatters';

interface CommerceLinkerProps {
    onClose: () => void;
    onSelect: (listingId: string, listingName: string, price: number, imageUrl?: string) => void;
}

export const CommerceLinker = ({ onClose, onSelect }: CommerceLinkerProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const [searchTerm, setSearchTerm] = useState('');
    const { sessionToken } = useAuth();

    // Sólo lo que este usuario tiene derecho a etiquetar: sus productos, y si es
    // influencer también los de los negocios que lo autorizaron. Antes se listaba
    // el catálogo entero y el backend rechazaba el post recién al publicar.
    const searchResults = useQuery(
        api.listings.getTaggableListings,
        sessionToken ? { sessionToken, searchQuery: searchTerm, limit: 20 } : 'skip',
    );

    const handleSelect = (item: any) => {
        const imageUrl = item.image || item.gallery?.[0] || item.images?.[0]?.url || item.images?.[0] || undefined;
        onSelect(item._id, item.title, item.price, typeof imageUrl === 'string' ? imageUrl : undefined);
        onClose();
    };

    return (
        <Sheet open={true} onOpenChange={(val: boolean) => !val && onClose()}>
            <SheetContent side="bottom" style={styles.sheetContent}>
                <SheetHeader style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color={isDark ? '#D1D5DB' : '#374151'} />
                    </TouchableOpacity>
                    <SheetTitle style={styles.title}>Vincular Producto</SheetTitle>
                    <View style={{ width: 24 }} />
                </SheetHeader>

                <View style={styles.searchContainer}>
                    <Search size={20} color="#9CA3AF" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Buscar productos o servicios..."
                        placeholderTextColor="#9CA3AF"
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        autoFocus
                    />
                </View>

                {searchResults === undefined ? (
                    <ActivityIndicator style={{ marginTop: 40 }} color="#2196F3" />
                ) : searchResults.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>
                            {searchTerm
                                ? 'No se encontraron productos.'
                                : 'No tenés productos para etiquetar. Publicá los tuyos, o pedile a un negocio que te autorice como influencer.'}
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={searchResults}
                        keyExtractor={(item) => item._id}
                        style={styles.list}
                        contentContainerStyle={{ paddingBottom: 40 }}
                        renderItem={({ item }) => {
                            const imageUrl = item.image || item.gallery?.[0] || item.images?.[0]?.url || item.images?.[0] || undefined;
                            const validImageUrl = typeof imageUrl === 'string' ? imageUrl : undefined;
                            
                            return (
                            <TouchableOpacity style={styles.itemCard} onPress={() => handleSelect(item)}>
                                {validImageUrl ? (
                                    <Image source={{ uri: validImageUrl }} style={styles.itemImage} />
                                ) : (
                                    <View style={[styles.itemImage, styles.placeholderImage]}>
                                        <Tag size={24} color="#9CA3AF" />
                                    </View>
                                )}
                                <View style={styles.itemInfo}>
                                    <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                                    <Text style={styles.itemPrice}>{formatCurrency(item.price)}</Text>
                                </View>
                            </TouchableOpacity>
                            );
                        }}
                    />
                )}
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    sheetContent: {
        backgroundColor: colors(isDark).glass,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '85%'
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' },
    closeBtn: { padding: 4 },
    title: { fontSize: 16, fontWeight: 'bold', color: colors(isDark).text },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
        margin: 16,
        paddingHorizontal: 12,
        borderRadius: Radius.full,
        height: 48
    },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, color: colors(isDark).text, fontSize: 16 },
    list: { flex: 1 },
    itemCard: {
        flexDirection: 'row',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
        alignItems: 'center'
    },
    itemImage: { width: 48, height: 48, borderRadius: Radius.md, marginRight: 16 },
    placeholderImage: { backgroundColor: isDark ? '#374151' : '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
    itemInfo: { flex: 1 },
    itemTitle: { fontSize: 16, fontWeight: '600', color: colors(isDark).text, marginBottom: 4 },
    itemPrice: { fontSize: 14, color: '#10B981', fontWeight: 'bold' },
    emptyContainer: { padding: 40, alignItems: 'center' },
    emptyText: { color: colors(isDark).textMuted, fontSize: 16 }
});
