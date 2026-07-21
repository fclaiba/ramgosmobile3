import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import MapView, { Marker } from './NativeMap'; // Adjust path if needed
import { Region } from 'react-native-maps';

import * as Location from 'expo-location';
import { Button } from './ui/button';
import { X, MapPin, Check } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useUserLocation } from '../hooks/useUserLocation';
import { glassShadow, colors } from '../theme/tokens';


interface LocationData {
    lat: number;
    lng: number;
    address?: string;
}

interface LocationPickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (location: LocationData) => void;
    initialLocation?: { lat: number, lng: number };
}

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.02; // Zoom level
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

export default function LocationPickerModal({ visible, onClose, onSelect, initialLocation }: LocationPickerModalProps) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const [region, setRegion] = useState<Region>({
        latitude: initialLocation?.lat || -34.6037,
        latitudeDelta: LATITUDE_DELTA,
        longitude: initialLocation?.lng || -58.3816,
        longitudeDelta: LONGITUDE_DELTA,
    });
    const [markerCoord, setMarkerCoord] = useState(initialLocation ? { latitude: initialLocation.lat, longitude: initialLocation.lng } : { latitude: -34.6037, longitude: -58.3816 });
    const [address, setAddress] = useState<string>('Selecciona una ubicación...');
    const [loading, setLoading] = useState(false);

    const { location: hookLocation, refetch: refetchLocation } = useUserLocation();

    useEffect(() => {
        if (visible) {
            // Get current location if no initial
            if (!initialLocation && hookLocation) {
                const newRegion = {
                    latitude: hookLocation.coords.latitude,
                    longitude: hookLocation.coords.longitude,
                    latitudeDelta: LATITUDE_DELTA,
                    longitudeDelta: LONGITUDE_DELTA
                };
                setRegion(newRegion);
                setMarkerCoord(hookLocation.coords);
                fetchAddress(hookLocation.coords.latitude, hookLocation.coords.longitude);
            } else if (initialLocation) {
                setRegion({
                    latitude: initialLocation.lat,
                    latitudeDelta: LATITUDE_DELTA,
                    longitude: initialLocation.lng,
                    longitudeDelta: LONGITUDE_DELTA,
                });
                setMarkerCoord({ latitude: initialLocation.lat, longitude: initialLocation.lng });
                fetchAddress(initialLocation.lat, initialLocation.lng);
            }
        }
    }, [visible, initialLocation, hookLocation]);

    const fetchAddress = async (lat: number, lng: number) => {
        try {
            const result = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
            if (result && result.length > 0) {
                const r = result[0];
                const addr = `${r.street || ''} ${r.streetNumber || ''}, ${r.city || ''}`.trim();
                setAddress(addr || 'Ubicación seleccionada');
            } else {
                setAddress('Ubicación seleccionada (Lat/Lng)');
            }
        } catch (e) {
            setAddress('Ubicación marcada');
        }
    };

    const handleRegionChange = (newRegion: Region) => {
        // Update marker to center safely, maybe debounce this
        // Or using DragEnd on marker is better UX for "Pin" style?
        // User asked "que figure en el mapa". Center pin is standard for Uber-like checks.
        setRegion(newRegion);
        setMarkerCoord({ latitude: newRegion.latitude, longitude: newRegion.longitude });
    };

    const handleDragEnd = (e: any) => { // If using draggable marker logic
        const coord = e.nativeEvent.coordinate;
        setMarkerCoord(coord);
        fetchAddress(coord.latitude, coord.longitude);
    };

    // Center-focused interaction: User moves map, marker stays center (or marker moves?)
    // Simpler: Tap to move marker? Or Draggable Marker?
    // Draggable Marker is explicit.
    // "Center Pin" is better for precise selection.
    // Let's go with "Center Pin" logic.
    // The marker is always at region.center

    const handleRegionChangeComplete = (newRegion: Region) => {
        setRegion(newRegion);
        setMarkerCoord({ latitude: newRegion.latitude, longitude: newRegion.longitude });
        fetchAddress(newRegion.latitude, newRegion.longitude);
    };

    const handleConfirm = () => {
        onSelect({
            lat: markerCoord.latitude,
            lng: markerCoord.longitude,
            address: address
        });
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <View style={[styles.container, isDark && styles.containerDark]}>
                {/* Header */}
                <View style={[styles.header, isDark && styles.headerDark]}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color={isDark ? '#fff' : '#000'} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>Elige ubicación</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Map */}
                <View style={styles.mapContainer}>
                    <MapView
                        style={StyleSheet.absoluteFill}
                        region={region}
                        onRegionChangeComplete={handleRegionChangeComplete}
                        showsUserLocation
                    />

                    {/* Fixed Center Marker */}
                    <View style={styles.centerMarkerContainer} pointerEvents="none">
                        <MapPin size={40} color="#EF4444" fill="#EF4444" style={{ marginBottom: 40 }} />
                    </View>
                </View>

                {/* Footer Info */}
                <View style={[styles.footer, isDark && styles.footerDark]}>
                    <Text style={[styles.addressLabel, isDark && styles.addressLabelDark]}>Dirección aproximada</Text>
                    <Text style={[styles.addressText, isDark && styles.addressTextDark]} numberOfLines={2}>
                        {address}
                    </Text>

                    <Button onPress={handleConfirm} style={{ marginTop: 16 }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Confirmar Ubicación</Text>
                    </Button>
                </View>
            </View>
        </Modal>
    );
}

const getStyles = (isDark: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors(isDark).bg },
    containerDark: { backgroundColor: '#111827' },
    header: {
        paddingTop: 50,
        paddingHorizontal: 16,
        paddingBottom: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors(isDark).glass,
        zIndex: 10
    },
    headerDark: { backgroundColor: '#111827' },
    closeBtn: { padding: 8 },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    headerTitleDark: { color: isDark ? '#09090B' : '#FAFAFA' },

    mapContainer: { flex: 1, position: 'relative' },
    centerMarkerContainer: {
        position: 'absolute',
        top: 0, bottom: 0, left: 0, right: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent'
    },

    footer: {
        padding: 24,
        paddingBottom: 40,
        backgroundColor: colors(isDark).glass,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        marginTop: -20,
        ...glassShadow(isDark),},
    footerDark: { backgroundColor: 'rgba(31,41,55,0.72)' },
    addressLabel: { fontSize: 12, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280', textTransform: 'uppercase', marginBottom: 4 },
    addressLabelDark: { color: isDark ? '#6B7280' : '#9CA3AF' },
    addressText: { fontSize: 16, fontWeight: 'bold', color: '#111827', minHeight: 40 },
    addressTextDark: { color: '#F9FAFB' }
});

