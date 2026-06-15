import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Platform, TextInput, ScrollView, Keyboard, Animated, FlatList } from 'react-native';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Search, Navigation as NavIcon, Star, ArrowRight, MapPin, Globe, List, Map as MapIcon, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useMarketplace } from '../contexts/MarketplaceContext';
import { useUserLocation } from '../hooks/useUserLocation';
import DarkMapView, { Marker, Circle } from '../components/map/DarkMapView';
import { CustomMapMarker, type ListingType } from '../components/map/CustomMapMarker';

const { width, height } = Dimensions.get('window');

const FILTERS = [
    { id: 'all', label: 'Todos' },
    { id: 'product', label: 'Productos' },
    { id: 'service', label: 'Servicios' },
    { id: 'event', label: 'Eventos' },
];

const RADIUS_OPTIONS = [
    { label: '100m', value: 0.1 },
    { label: '1km', value: 1 },
    { label: '5km', value: 5 },
    { label: '10km', value: 10 },
    { label: '25km', value: 25 },
    { label: '50km', value: 50 },
];

const INITIAL_REGION = {
    latitude: -34.6037,
    longitude: -58.3816,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
};

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
}

let cachedViewMode: 'map' | 'list' = 'map';

export default function MapExplorerScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();
    const { products } = useMarketplace();

    const mapRef = useRef<any>(null);
    const { location, errorMsg: hookError, refetch: refetchLocation } = useUserLocation();
    const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [radius, setRadius] = useState<number>(10);
    const [viewMode, setViewModeState] = useState<'map'|'list'>(cachedViewMode);

    const setViewMode = (mode: 'map'|'list') => {
        cachedViewMode = mode;
        setViewModeState(mode);
    };

    const cardTranslateY = useRef(new Animated.Value(300)).current;

    useEffect(() => {
        if (hookError) {
            console.warn("Error getting location in MapExplorer", hookError);
        }
    }, [hookError]);

    const userLat = location?.coords.latitude ?? INITIAL_REGION.latitude;
    const userLng = location?.coords.longitude ?? INITIAL_REGION.longitude;

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            if (!p.location) return false;
            if (activeFilter !== 'all' && p.listingType !== activeFilter) return false;
            if (searchQuery && !p.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            
            const dist = getDistance(userLat, userLng, p.location.lat, p.location.lng);
            return dist <= radius;
        }).map(p => {
            const dist = getDistance(userLat, userLng, p.location.lat, p.location.lng);
            return { ...p, calculatedDistance: dist };
        }).sort((a, b) => a.calculatedDistance - b.calculatedDistance);
    }, [products, activeFilter, searchQuery, userLat, userLng, radius]);

    const selectedMarker = useMemo(() => {
        return filteredProducts.find(p => p.id === selectedMarkerId) || null;
    }, [filteredProducts, selectedMarkerId]);

    useEffect(() => {
        if (selectedMarker && viewMode === 'map') {
            Animated.spring(cardTranslateY, {
                toValue: 0,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(cardTranslateY, {
                toValue: 300,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
    }, [selectedMarker, viewMode]);

    const handleMarkerPress = (product: any) => {
        setSelectedMarkerId(product.id);
        mapRef.current?.animateToRegion({
            latitude: product.location.lat - 0.002,
            longitude: product.location.lng,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
        }, 500);
    };

    const handleMapPress = () => {
        if (selectedMarkerId) setSelectedMarkerId(null);
        Keyboard.dismiss();
    };

    const handleMyLocation = async () => {
        if (location) {
            mapRef.current?.animateToRegion({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            }, 1000);
        } else {
            refetchLocation();
        }
    };

    // Marker type mapping — used by CustomMapMarker
    const getListingType = (type?: string): ListingType => {
        switch(type) {
            case 'service': return 'service';
            case 'event': return 'event';
            case 'bono': return 'bono';
            case 'product': default: return 'product';
        }
    };

    return (
        <View style={styles.container}>
            {/* Header / Search & Filters */}
            <View style={[styles.header, { top: insets.top + 10 }]} pointerEvents="box-none">
                <View style={[styles.searchBar, isDark && styles.searchBarDark]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <ArrowLeft size={24} color={isDark ? "#D1D5DB" : "#374151"} />
                    </TouchableOpacity>
                    <TextInput
                        placeholder="Buscar en tu zona..."
                        style={[styles.searchInput, isDark && { color: '#fff' }]}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholderTextColor="#9CA3AF"
                    />
                    <Search size={20} color="#9CA3AF" />
                </View>

                {/* Radius Filter */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.radiusScroll}>
                    {RADIUS_OPTIONS.map(opt => (
                        <TouchableOpacity
                            key={opt.label}
                            style={[
                                styles.radiusChip,
                                isDark && styles.radiusChipDark,
                                radius === opt.value && styles.activeRadiusChip
                            ]}
                            onPress={() => setRadius(opt.value)}
                        >
                            <Text style={[
                                styles.radiusText,
                                isDark && { color: '#D1D5DB' },
                                radius === opt.value && styles.activeRadiusText
                            ]}>
                                {opt.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Category Filters */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
                    {FILTERS.map(filter => (
                        <TouchableOpacity
                            key={filter.id}
                            style={[
                                styles.filterChip,
                                isDark && styles.filterChipDark,
                                activeFilter === filter.id && styles.activeFilterChip
                            ]}
                            onPress={() => setActiveFilter(filter.id)}
                        >
                            <Text style={[
                                styles.filterText,
                                isDark && { color: '#D1D5DB' },
                                activeFilter === filter.id && styles.activeFilterText
                            ]}>
                                {filter.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {viewMode === 'map' ? (
                <>
                    <DarkMapView
                        ref={mapRef}
                        style={styles.map}
                        forceDark={true}
                        initialRegion={INITIAL_REGION}
                        showsUserLocation={true}
                        onPress={handleMapPress}
                        mapPadding={{
                            top: insets.top + 130,
                            right: 0,
                            bottom: selectedMarker ? 180 : 80,
                            left: 0
                        }}
                    >
                        {/* Vision Radius Circle */}
                        {location && (
                            <Circle
                                center={{
                                    latitude: location.coords.latitude,
                                    longitude: location.coords.longitude
                                }}
                                radius={radius * 1000}
                                fillColor={isDark ? 'rgba(139, 92, 246, 0.12)' : 'rgba(124, 58, 237, 0.08)'}
                                strokeColor={isDark ? 'rgba(139, 92, 246, 0.6)' : 'rgba(124, 58, 237, 0.5)'}
                                strokeWidth={1.5}
                            />
                        )}

                        {filteredProducts.map((product) => (
                            <Marker
                                key={product.id}
                                coordinate={{ latitude: product.location.lat, longitude: product.location.lng }}
                                onPress={() => handleMarkerPress(product)}
                                tracksViewChanges={false}
                            >
                                <CustomMapMarker
                                    type={getListingType(product.listingType)}
                                    isSelected={selectedMarkerId === product.id}
                                />
                            </Marker>
                        ))}
                    </DarkMapView>

                    {/* Map Controls */}
                    <View style={[styles.controlsContainer, { top: insets.top + 180 }]} pointerEvents="box-none">
                        <TouchableOpacity
                            style={[styles.controlBtn, isDark && styles.controlBtnDark]}
                            onPress={handleMyLocation}
                        >
                            <NavIcon size={24} color={isDark ? '#fff' : '#374151'} fill={isDark ? '#fff' : 'transparent'} />
                        </TouchableOpacity>
                    </View>

                    {/* Selected Marker Card */}
                    {selectedMarker && (
                        <Animated.View style={[
                            styles.cardContainer,
                            {
                                bottom: Platform.OS === 'ios' ? insets.bottom + 80 : 80,
                                transform: [{ translateY: cardTranslateY }]
                            }
                        ]} pointerEvents="box-none">
                            <TouchableOpacity
                                style={[styles.card, isDark && styles.cardDark]}
                                activeOpacity={0.9}
                                onPress={() => navigation.navigate('ItemDetail', { slug: selectedMarker.slug })}
                            >
                                <ImageWithFallback src={selectedMarker.images[0]?.url} style={styles.cardImage} />
                                <View style={styles.cardContent}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.cardTitle, isDark && { color: '#fff' }]} numberOfLines={1}>{selectedMarker.title}</Text>
                                        <Text style={styles.cardCategory}>{selectedMarker.category} • {selectedMarker.calculatedDistance.toFixed(1)}km</Text>
                                        <Text style={styles.cardPrice}>${selectedMarker.price}</Text>
                                    </View>
                                    <View style={styles.actionBtn}>
                                        <ArrowRight size={20} color="#fff" />
                                    </View>
                                </View>
                                <TouchableOpacity 
                                    style={styles.closeCardBtn}
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        setSelectedMarkerId(null);
                                    }}
                                >
                                    <X size={16} color="#9CA3AF" />
                                </TouchableOpacity>
                            </TouchableOpacity>
                        </Animated.View>
                    )}
                </>
            ) : (
                /* List View */
                <View style={[styles.listView, isDark && styles.listViewDark, { paddingTop: insets.top + 160 }]}>
                    {filteredProducts.length === 0 ? (
                        <View style={styles.emptyState}>
                            <MapPin size={48} color="#9CA3AF" />
                            <Text style={[styles.emptyStateText, isDark && { color: '#D1D5DB' }]}>No se encontraron productos en este radio.</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={filteredProducts}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.listItem, isDark && styles.listItemDark]}
                                    onPress={() => navigation.navigate('ItemDetail', { slug: item.slug })}
                                >
                                    <ImageWithFallback src={item.images[0]?.url} style={styles.listItemImage} />
                                    <View style={styles.listItemContent}>
                                        <Text style={[styles.listItemTitle, isDark && { color: '#fff' }]} numberOfLines={1}>{item.title}</Text>
                                        <Text style={styles.listItemCategory}>{item.category} • {item.calculatedDistance.toFixed(1)}km</Text>
                                        <Text style={styles.listItemPrice}>${item.price}</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        />
                    )}
                </View>
            )}

            {/* View Toggle Button */}
            <View style={[styles.viewToggleContainer, { bottom: Platform.OS === 'ios' ? insets.bottom + 20 : 20 }]} pointerEvents="box-none">
                <TouchableOpacity
                    style={[styles.viewToggleBtn, isDark && styles.viewToggleBtnDark]}
                    onPress={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
                >
                    {viewMode === 'map' ? (
                        <>
                            <List size={20} color={isDark ? '#fff' : '#111827'} />
                            <Text style={[styles.viewToggleText, isDark && { color: '#fff' }]}>Ver {filteredProducts.length} resultados</Text>
                        </>
                    ) : (
                        <>
                            <MapIcon size={20} color={isDark ? '#fff' : '#111827'} />
                            <Text style={[styles.viewToggleText, isDark && { color: '#fff' }]}>Ver Mapa</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

// Map styles are now centralized in src/constants/darkMapStyle.ts
// and automatically applied by the <DarkMapView> component.

const getStyles = (isDark: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0a' },
    map: { flex: 1 },
    header: { position: 'absolute', left: 16, right: 16, zIndex: 10 },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        shadowColor: isDark ? '#F9FAFB' : '#000',
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        gap: 8
    },
    searchBarDark: {
        backgroundColor: '#1F2937',
        shadowColor: isDark ? '#F9FAFB' : '#000',
    },
    backButton: { padding: 4 },
    searchInput: { flex: 1, fontSize: 16, color: '#111827' },
    radiusScroll: { marginTop: 12, gap: 8, paddingBottom: 4 },
    radiusChip: {
        backgroundColor: isDark ? '#374151' : '#e5e7eb',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        marginRight: 8
    },
    radiusChipDark: { backgroundColor: isDark ? '#D1D5DB' : '#374151' },
    activeRadiusChip: { backgroundColor: '#7C3AED' },
    radiusText: { fontSize: 12, fontWeight: '600', color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#4B5563' },
    activeRadiusText: { color: isDark ? '#1F2937' : '#fff' },

    filtersScroll: { marginTop: 8, gap: 8, paddingBottom: 4 },
    filterChip: {
        backgroundColor: isDark ? '#1F2937' : '#fff',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        shadowColor: isDark ? '#F9FAFB' : '#000',
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
        marginRight: 8
    },
    filterChipDark: { backgroundColor: isDark ? '#D1D5DB' : '#374151' },
    activeFilterChip: { backgroundColor: '#111827' },
    filterText: { fontSize: 13, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },
    activeFilterText: { color: isDark ? '#1F2937' : '#fff' },

    // Custom marker styles removed — now handled by <CustomMapMarker> component

    cardContainer: { position: 'absolute', left: 16, right: 16, zIndex: 10 },
    card: {
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderRadius: 20,
        flexDirection: 'row',
        padding: 12,
        shadowColor: isDark ? '#F9FAFB' : '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8
    },
    cardDark: { backgroundColor: '#1F2937' },
    cardImage: { width: 80, height: 80, borderRadius: 16, backgroundColor: isDark ? '#1F2937' : '#F3F4F6' },
    cardContent: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 12 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
    cardCategory: { fontSize: 12, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280', marginBottom: 4 },
    cardPrice: { fontSize: 15, fontWeight: '800', color: '#7C3AED' },
    actionBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#111827',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8
    },
    closeCardBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        padding: 4,
    },

    // Controls
    controlsContainer: {
        position: 'absolute',
        right: 16,
        gap: 12,
        zIndex: 10
    },
    controlBtn: {
        backgroundColor: isDark ? '#1F2937' : '#fff',
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: isDark ? '#F9FAFB' : '#000',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5
    },
    controlBtnDark: {
        backgroundColor: '#1F2937'
    },

    // View Toggle
    viewToggleContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 20,
    },
    viewToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isDark ? '#1F2937' : '#fff',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 24,
        gap: 8,
        shadowColor: isDark ? '#F9FAFB' : '#000',
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
    },
    viewToggleBtnDark: {
        backgroundColor: '#1F2937',
    },
    viewToggleText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
    },

    // List View
    listView: {
        flex: 1,
        backgroundColor: isDark ? '#1F2937' : '#F3F4F6',
    },
    listViewDark: {
        backgroundColor: '#111827',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyStateText: {
        marginTop: 16,
        fontSize: 16,
        color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280',
        textAlign: 'center',
    },
    listItem: {
        flexDirection: 'row',
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderRadius: 16,
        padding: 12,
        marginBottom: 12,
        shadowColor: isDark ? '#F9FAFB' : '#000',
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    listItemDark: {
        backgroundColor: '#1F2937',
    },
    listItemImage: {
        width: 70,
        height: 70,
        borderRadius: 12,
        backgroundColor: isDark ? '#1F2937' : '#F3F4F6',
    },
    listItemContent: {
        flex: 1,
        marginLeft: 12,
        justifyContent: 'center',
    },
    listItemTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 4,
    },
    listItemCategory: {
        fontSize: 12,
        color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280',
        marginBottom: 4,
    },
    listItemPrice: {
        fontSize: 14,
        fontWeight: '800',
        color: '#7C3AED',
    },
});
