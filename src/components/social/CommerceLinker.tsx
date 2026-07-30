import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Image, Platform } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { Search, Tag, X } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Radius } from '../../theme/tokens';
import * as Haptics from 'expo-haptics';

export interface CommerceLinkerProps {
    onSelect: (product: { listingId: string, name: string, price: number, imageUrl?: string }) => void;
    onClose: () => void;
}

export function CommerceLinker({ onSelect, onClose }: CommerceLinkerProps) {
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    // Obtenemos los listings del usuario autenticado (para etiquetar SUS productos o bonos)
    const listings = useQuery(api.listings.getMyListings, sessionToken ? { sessionToken } : 'skip');

    const handleSelect = (item: any) => {
        if (Platform.OS !== 'web') Haptics.selectionAsync();
        onSelect({
            listingId: item._id,
            name: item.title,
            price: item.price,
            imageUrl: item.image || item.images?.[0]?.url,
        });
    };

    const renderItem = ({ item }: { item: any }) => {
        const displayImage = item.image || item.images?.[0]?.url;

        return (
            <TouchableOpacity 
                style={[styles.itemCard, isDark ? styles.itemCardDark : styles.itemCardLight]}
                onPress={() => handleSelect(item)}
            >
                {displayImage ? (
                    <Image source={{ uri: displayImage }} style={styles.itemImage} />
                ) : (
                    <View style={[styles.itemImage, styles.itemImageFallback]}>
                        <Tag size={20} color="#9CA3AF" />
                    </View>
                )}
                <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, isDark ? styles.textLight : styles.textDark]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    <Text style={styles.itemPrice}>${item.price}</Text>
                    <View style={styles.badgeWrapper}>
                        <Text style={styles.badgeText}>{item.type === 'bono' ? 'Bono' : 'Producto'}</Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
            <View style={styles.header}>
                <Text style={[styles.title, isDark ? styles.textLight : styles.textDark]}>
                    Etiquetar Producto
                </Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <X size={24} color={isDark ? '#FFF' : '#000'} />
                </TouchableOpacity>
            </View>

            <View style={styles.searchBar}>
                <Search size={20} color="#9CA3AF" />
                <Text style={styles.searchPlaceholder}>Buscar en mi catálogo...</Text>
            </View>

            {listings === undefined ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#4F46E5" />
                </View>
            ) : listings.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Tag size={48} color="#9CA3AF" />
                    <Text style={styles.emptyText}>No tenés productos activos.</Text>
                </View>
            ) : (
                <FlatList
                    data={listings}
                    keyExtractor={item => item._id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        borderTopLeftRadius: Radius.xl,
        borderTopRightRadius: Radius.xl,
        overflow: 'hidden',
    },
    containerDark: {
        backgroundColor: '#111827',
    },
    containerLight: {
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(156, 163, 175, 0.2)',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    textLight: {
        color: '#FFFFFF',
    },
    textDark: {
        color: '#111827',
    },
    closeBtn: {
        padding: 4,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        margin: 16,
        padding: 12,
        backgroundColor: 'rgba(156, 163, 175, 0.15)',
        borderRadius: Radius.lg,
        gap: 8,
    },
    searchPlaceholder: {
        color: '#9CA3AF',
        fontSize: 16,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    itemCard: {
        flexDirection: 'row',
        padding: 12,
        borderRadius: Radius.lg,
        marginBottom: 12,
        borderWidth: 1,
    },
    itemCardDark: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderColor: 'rgba(255,255,255,0.1)',
    },
    itemCardLight: {
        backgroundColor: '#F9FAFB',
        borderColor: '#E5E7EB',
    },
    itemImage: {
        width: 60,
        height: 60,
        borderRadius: Radius.md,
    },
    itemImageFallback: {
        backgroundColor: 'rgba(156, 163, 175, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemInfo: {
        flex: 1,
        marginLeft: 12,
        justifyContent: 'center',
    },
    itemTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    itemPrice: {
        fontSize: 14,
        color: '#10B981',
        fontWeight: 'bold',
        marginBottom: 4,
    },
    badgeWrapper: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: Radius.sm,
    },
    badgeText: {
        color: '#4F46E5',
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        color: '#9CA3AF',
        marginTop: 16,
        textAlign: 'center',
    }
});
