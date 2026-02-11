
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Platform, TextInput, ScrollView, Alert, Keyboard, Animated } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from '../components/NativeMap';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Search, Navigation as NavIcon, Star, ArrowRight, MapPin, Globe } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';

const { width, height } = Dimensions.get('window');

// Mock Data for Map Markers - Expanded
const BUSINESS_MARKERS = [
    {
        id: '1',
        name: 'Sushi Supreme',
        category: 'Restaurante',
        rating: 4.8,
        reviews: 124,
        latitude: -34.6037, // Buenos Aires approx
        longitude: -58.3816,
        image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400',
        address: 'Av. Corrientes 1234',
        type: 'food'
    },
    {
        id: '2',
        name: 'PowerGym Center',
        category: 'Gimnasio',
        rating: 4.5,
        reviews: 89,
        latitude: -34.6080,
        longitude: -58.3750,
        image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400',
        address: 'Florida 500',
        type: 'health'
    },
    {
        id: '3',
        name: 'Moda Urbana',
        category: 'Ropa',
        rating: 4.6,
        reviews: 56,
        latitude: -34.5990,
        longitude: -58.3900,
        image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400',
        address: 'Santa Fe 2000',
        type: 'shop'
    },
    {
        id: '4',
        name: 'Café del Sol',
        category: 'Cafetería',
        rating: 4.9,
        reviews: 210,
        latitude: -34.6050,
        longitude: -58.3850,
        image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400',
        address: 'Callao 450',
        type: 'food'
    },
];

const FILTERS = [
    { id: 'all', label: 'Todos' },
    { id: 'food', label: 'Restaurantes' },
    { id: 'health', label: 'Salud' },
    { id: 'shop', label: 'Tiendas' },
];

const INITIAL_REGION = {
    latitude: -34.6037,
    longitude: -58.3816,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
};

export default function MapExplorerScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { show } = useToast();

    const mapRef = useRef<MapView>(null);
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [selectedMarker, setSelectedMarker] = useState<typeof BUSINESS_MARKERS[0] | null>(null);
    const [activeFilter, setActiveFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Animation for card
    const cardTranslateY = useRef(new Animated.Value(300)).current;

    useEffect(() => {
        (async () => {
            try {
                let { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') return;

                let loc = await Location.getCurrentPositionAsync({});
                setLocation(loc);

                // Don't auto-animate here to allow user to see default view first or let them choose
            } catch (error) {
                console.warn("Error getting location", error);
            }
        })();
    }, []);

    // Animate card entrance/exit
    useEffect(() => {
        if (selectedMarker) {
            Animated.spring(cardTranslateY, {
                toValue: 0,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(cardTranslateY, {
                toValue: 300, // Slide down off-screen
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
    }, [selectedMarker]);

    const handleMarkerPress = (marker: typeof BUSINESS_MARKERS[0]) => {
        setSelectedMarker(marker);
        // Center map offset - IMPORTANT for UX so card doesn't cover marker
        mapRef.current?.animateToRegion({
            latitude: marker.latitude - 0.002, // Slight offset up
            longitude: marker.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
        }, 500);
    };

    const handleMapPress = () => {
        if (selectedMarker) setSelectedMarker(null);
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
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                let loc = await Location.getCurrentPositionAsync({});
                setLocation(loc);
                mapRef.current?.animateToRegion({
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                }, 1000);
            } else {
                show('Activa la localización para usar esta función', 'error');
            }
        }
    };

    const handleResetView = () => {
        mapRef.current?.animateToRegion(INITIAL_REGION, 1000);
    };

    const filteredMarkers = BUSINESS_MARKERS.filter(m =>
        (activeFilter === 'all' || m.type === activeFilter) &&
        (searchQuery === '' || m.name.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <View style={styles.container}>
            <MapView
                ref={mapRef}
                style={styles.map}

                initialRegion={INITIAL_REGION}
                showsUserLocation={true}
                showsMyLocationButton={false}
                onPress={handleMapPress}
                customMapStyle={isDark ? DARK_MAP_STYLE : []}
                // Add padding so Google logo and legal links are visible above the bottom card area
                mapPadding={{
                    top: insets.top + 60,
                    right: 0,
                    bottom: selectedMarker ? 180 : 20,
                    left: 0
                }}
            >
                {filteredMarkers.map((marker) => (
                    <Marker
                        key={marker.id}
                        coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
                        onPress={() => handleMarkerPress(marker)}
                    >
                        <View style={[styles.customMarker, selectedMarker?.id === marker.id && styles.selectedMarker]}>
                            {marker.type === 'food' && <Text style={styles.emoji}>🍔</Text>}
                            {marker.type === 'health' && <Text style={styles.emoji}>🏋️</Text>}
                            {marker.type === 'shop' && <Text style={styles.emoji}>👗</Text>}
                        </View>
                    </Marker>
                ))}
            </MapView>

            {/* Floating Header */}
            <View style={[styles.header, { top: insets.top + 10 }]}>
                <View style={[styles.searchBar, isDark && styles.searchBarDark]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <ArrowLeft size={24} color={isDark ? "#D1D5DB" : "#374151"} />
                    </TouchableOpacity>
                    <TextInput
                        placeholder="Buscar en el mapa..."
                        style={[styles.searchInput, isDark && { color: '#fff' }]}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholderTextColor="#9CA3AF"
                    />
                    <Search size={20} color="#9CA3AF" />
                </View>

                {/* Filter Chips */}
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

            {/* Map Controls (Right Side) */}
            <View style={[styles.controlsContainer, { top: insets.top + 180 }]}>
                {/* Reset View (Manual/Central) */}
                <TouchableOpacity
                    style={[styles.controlBtn, isDark && styles.controlBtnDark]}
                    onPress={handleResetView}
                >
                    <Globe size={24} color={isDark ? '#fff' : '#374151'} />
                </TouchableOpacity>

                {/* My Location */}
                <TouchableOpacity
                    style={[styles.controlBtn, isDark && styles.controlBtnDark]}
                    onPress={handleMyLocation}
                >
                    <NavIcon size={24} color={isDark ? '#fff' : '#374151'} fill={isDark ? '#fff' : 'transparent'} />
                </TouchableOpacity>
            </View>

            {/* Bottom Card - Animated */}
            {selectedMarker && (
                <Animated.View style={[
                    styles.cardContainer,
                    {
                        bottom: Platform.OS === 'ios' ? insets.bottom + 20 : 20,
                        transform: [{ translateY: cardTranslateY }]
                    }
                ]}>
                    <TouchableOpacity
                        style={[styles.card, isDark && styles.cardDark]}
                        activeOpacity={0.9}
                        onPress={() => navigation.navigate('BusinessDetail', { businessId: selectedMarker.id, business: selectedMarker })}
                    >
                        <ImageWithFallback src={selectedMarker.image} style={styles.cardImage} />
                        <View style={styles.cardContent}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.cardTitle, isDark && { color: '#fff' }]}>{selectedMarker.name}</Text>
                                <Text style={styles.cardCategory}>{selectedMarker.category} • {selectedMarker.address}</Text>
                                <View style={styles.ratingRow}>
                                    <Star size={14} color="#F59E0B" fill="#F59E0B" />
                                    <Text style={[styles.ratingText, isDark && { color: '#D1D5DB' }]}>{selectedMarker.rating} ({selectedMarker.reviews})</Text>
                                </View>
                            </View>
                            <View style={styles.actionBtn}>
                                <ArrowRight size={20} color="#fff" />
                            </View>
                        </View>
                    </TouchableOpacity>
                </Animated.View>
            )}
        </View>
    );
}

const DARK_MAP_STYLE = [
    { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
    {
        featureType: 'administrative.locality',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#d59563' }],
    },
    {
        featureType: 'poi',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#d59563' }],
    },
    {
        featureType: 'poi.park',
        elementType: 'geometry',
        stylers: [{ color: '#263c3f' }],
    },
    {
        featureType: 'poi.park',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#6b9a76' }],
    },
    {
        featureType: 'road',
        elementType: 'geometry',
        stylers: [{ color: '#38414e' }],
    },
    {
        featureType: 'road',
        elementType: 'geometry.stroke',
        stylers: [{ color: '#212a37' }],
    },
    {
        featureType: 'road',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#9ca5b3' }],
    },
    {
        featureType: 'road.highway',
        elementType: 'geometry',
        stylers: [{ color: '#746855' }],
    },
    {
        featureType: 'road.highway',
        elementType: 'geometry.stroke',
        stylers: [{ color: '#1f2835' }],
    },
    {
        featureType: 'road.highway',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#f3d19c' }],
    },
    {
        featureType: 'water',
        elementType: 'geometry',
        stylers: [{ color: '#17263c' }],
    },
    {
        featureType: 'water',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#515c6d' }],
    },
    {
        featureType: 'water',
        elementType: 'labels.text.stroke',
        stylers: [{ color: '#17263c' }],
    },
];

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    map: { flex: 1 },
    header: { position: 'absolute', left: 16, right: 16, zIndex: 10 },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        gap: 8
    },
    searchBarDark: {
        backgroundColor: '#1F2937',
        shadowColor: '#000',
    },
    backButton: { padding: 4 },
    searchInput: { flex: 1, fontSize: 16, color: '#111827' },
    filtersScroll: { marginTop: 12, gap: 8, paddingBottom: 4 },
    filterChip: {
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
        marginRight: 8
    },
    filterChipDark: { backgroundColor: '#374151' },
    activeFilterChip: { backgroundColor: '#111827' },
    filterText: { fontSize: 13, fontWeight: '600', color: '#374151' },
    activeFilterText: { color: '#fff' },

    customMarker: {
        backgroundColor: '#fff',
        padding: 5,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#111827',
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4
    },
    selectedMarker: { backgroundColor: '#F59E0B', borderColor: '#fff', transform: [{ scale: 1.2 }] },
    emoji: { fontSize: 16 },

    cardContainer: { position: 'absolute', left: 16, right: 16, zIndex: 10 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 20,
        flexDirection: 'row',
        padding: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8
    },
    cardDark: { backgroundColor: '#1F2937' },
    cardImage: { width: 80, height: 80, borderRadius: 16, backgroundColor: '#f3f4f6' },
    cardContent: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 12 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
    cardCategory: { fontSize: 12, color: '#6B7280', marginBottom: 6 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    ratingText: { fontSize: 12, fontWeight: '600', color: '#374151' },
    actionBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#111827',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8
    },

    // Controls
    controlsContainer: {
        position: 'absolute',
        right: 16,
        gap: 12,
        zIndex: 10
    },
    controlBtn: {
        backgroundColor: '#fff',
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5
    },
    controlBtnDark: {
        backgroundColor: '#1F2937'
    }
});

