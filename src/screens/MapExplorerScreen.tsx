import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Image, Platform, TextInput, ScrollView, Alert } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from '../components/NativeMap';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Search, Filter, Navigation as NavIcon, Star, MapPin, ArrowRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

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

export default function MapExplorerScreen() {
    const navigation = useNavigation<any>();
    const mapRef = useRef<MapView>(null);
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [selectedMarker, setSelectedMarker] = useState<typeof BUSINESS_MARKERS[0] | null>(null);
    const [activeFilter, setActiveFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        (async () => {
            try {
                let { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    setErrorMsg('Permiso de ubicación denegado');
                    Alert.alert('Permiso denegado', 'Necesitamos acceso a tu ubicación para mostrarte negocios cercanos.');
                    return;
                }

                let loc = await Location.getCurrentPositionAsync({});
                setLocation(loc);

                // Animate to user location initially
                if (loc && mapRef.current) {
                    mapRef.current.animateToRegion({
                        latitude: loc.coords.latitude,
                        longitude: loc.coords.longitude,
                        latitudeDelta: 0.05,
                        longitudeDelta: 0.05,
                    }, 1000);
                }
            } catch (error) {
                console.warn("Error getting location", error);
            }
        })();
    }, []);

    const handleMarkerPress = (marker: typeof BUSINESS_MARKERS[0]) => {
        setSelectedMarker(marker);
        // Center map on marker slightly offset to leave room for card
        mapRef.current?.animateToRegion({
            latitude: marker.latitude - 0.005, // Offset
            longitude: marker.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
        }, 500);
    };

    const handleMapPress = () => {
        setSelectedMarker(null);
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
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
                initialRegion={{
                    latitude: -34.6037,
                    longitude: -58.3816,
                    latitudeDelta: 0.0922,
                    longitudeDelta: 0.0421,
                }}
                showsUserLocation={true}
                showsMyLocationButton={false}
                onPress={handleMapPress}
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
            <View style={styles.header}>
                <View style={styles.searchBar}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <ArrowLeft size={24} color="#374151" />
                    </TouchableOpacity>
                    <TextInput
                        placeholder="Buscar 'Sushi' o 'Zapatillas'"
                        style={styles.searchInput}
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
                            style={[styles.filterChip, activeFilter === filter.id && styles.activeFilterChip]}
                            onPress={() => setActiveFilter(filter.id)}
                        >
                            <Text style={[styles.filterText, activeFilter === filter.id && styles.activeFilterText]}>
                                {filter.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Bottom Card */}
            {selectedMarker && (
                <View style={styles.cardContainer}>
                    <TouchableOpacity
                        style={styles.card}
                        activeOpacity={0.9}
                        onPress={() => navigation.navigate('BusinessDetail', { businessId: selectedMarker.id, business: selectedMarker })}
                    >
                        <ImageWithFallback src={selectedMarker.image} style={styles.cardImage} />
                        <View style={styles.cardContent}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.cardTitle}>{selectedMarker.name}</Text>
                                <Text style={styles.cardCategory}>{selectedMarker.category} • {selectedMarker.address}</Text>
                                <View style={styles.ratingRow}>
                                    <Star size={14} color="#F59E0B" fill="#F59E0B" />
                                    <Text style={styles.ratingText}>{selectedMarker.rating} ({selectedMarker.reviews})</Text>
                                </View>
                            </View>
                            <View style={styles.actionBtn}>
                                <ArrowRight size={20} color="#fff" />
                            </View>
                        </View>
                    </TouchableOpacity>
                </View>
            )}

            {/* My Location Button (if no card selected) */}
            {!selectedMarker && location && (
                <TouchableOpacity
                    style={styles.myLocationBtn}
                    onPress={() => {
                        mapRef.current?.animateToRegion({
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                            latitudeDelta: 0.01,
                            longitudeDelta: 0.01,
                        }, 1000);
                    }}
                >
                    <NavIcon size={24} color="#111827" fill="#111827" />
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    map: { width: '100%', height: '100%' },
    header: { position: 'absolute', top: 50, left: 16, right: 16 },
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
        alignItems: 'center'
    },
    selectedMarker: { backgroundColor: '#F59E0B', borderColor: '#fff', transform: [{ scale: 1.2 }] },
    emoji: { fontSize: 16 },

    cardContainer: { position: 'absolute', bottom: 40, left: 16, right: 16 },
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

    myLocationBtn: {
        position: 'absolute',
        bottom: 40,
        right: 16,
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
    }
});
