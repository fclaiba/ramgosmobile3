/**
 * LocationPickerModal — native (iOS/Android) implementation.
 *
 * On web, Metro auto-resolves to `LocationPickerModal.web.tsx` which uses
 * `pigeon-maps`. This file uses `react-native-maps` (Google Maps under the
 * hood on Android via the API key configured in app.json, Apple Maps on
 * iOS by default).
 *
 * Behavior:
 *   1. On open, requests foreground location permission and centers on the
 *      user (or `initialLocation` if provided, or CABA as fallback).
 *   2. User taps the map → marker drops, we reverse-geocode to a human
 *      address with `expo-location`.
 *   3. "Confirmar" returns `{ lat, lng, address }` to the parent via
 *      `onSelect`.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type MapPressEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import { X, Crosshair } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ui/button';

interface LocationPickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (location: { lat: number; lng: number; address?: string }) => void;
    initialLocation?: { lat: number; lng: number };
}

const DEFAULT_REGION = {
    latitude: -34.603722,
    longitude: -58.381592,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
};

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
    visible,
    onClose,
    onSelect,
    initialLocation,
}) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();
    const mapRef = useRef<MapView>(null);

    const [selectedCoord, setSelectedCoord] = useState<{ latitude: number; longitude: number } | null>(
        initialLocation
            ? { latitude: initialLocation.lat, longitude: initialLocation.lng }
            : null,
    );
    const [address, setAddress] = useState<string>('');
    const [loadingAddress, setLoadingAddress] = useState(false);
    const [region, setRegion] = useState({
        ...DEFAULT_REGION,
        ...(initialLocation
            ? { latitude: initialLocation.lat, longitude: initialLocation.lng }
            : {}),
    });

    useEffect(() => {
        if (!visible) return;
        if (initialLocation) return;
        let cancelled = false;
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted' || cancelled) return;
                const loc = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                });
                if (cancelled) return;
                const next = {
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                };
                setRegion(next);
                mapRef.current?.animateToRegion(next, 500);
            } catch (err) {
                console.log('[LocationPicker] permission/get failed:', err);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [visible, initialLocation]);

    const reverseGeocode = async (lat: number, lng: number) => {
        setLoadingAddress(true);
        try {
            const results = await Location.reverseGeocodeAsync({
                latitude: lat,
                longitude: lng,
            });
            const first = results[0];
            if (first) {
                const street =
                    [first.street, first.streetNumber].filter(Boolean).join(' ') || '';
                const city = first.city || first.subregion || '';
                const region = first.region || '';
                const composed = [street, city, region]
                    .filter((p) => p && p.length > 0)
                    .join(', ');
                setAddress(composed || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            } else {
                setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            }
        } catch (err) {
            setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        } finally {
            setLoadingAddress(false);
        }
    };

    const handlePress = (event: MapPressEvent) => {
        const { latitude, longitude } = event.nativeEvent.coordinate;
        setSelectedCoord({ latitude, longitude });
        void reverseGeocode(latitude, longitude);
    };

    const recenterOnUser = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;
            const loc = await Location.getCurrentPositionAsync({});
            const next = {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            };
            setRegion(next);
            mapRef.current?.animateToRegion(next, 400);
        } catch (err) {
            console.log('[LocationPicker] recenter failed:', err);
        }
    };

    const handleConfirm = () => {
        if (!selectedCoord) return;
        onSelect({
            lat: selectedCoord.latitude,
            lng: selectedCoord.longitude,
            address,
        });
    };

    return (
        <Modal visible={visible} animationType="slide">
            <View style={[styles.container, { backgroundColor: isDark ? '#111827' : '#fff' }]}>
                <View
                    style={[
                        styles.header,
                        { paddingTop: insets.top + 12, backgroundColor: isDark ? '#1F2937' : '#fff' },
                    ]}
                >
                    <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
                        Seleccionar Ubicación
                    </Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color={isDark ? '#fff' : '#000'} />
                    </TouchableOpacity>
                </View>

                <View style={styles.mapWrap}>
                    <MapView
                        ref={mapRef}
                        provider={PROVIDER_GOOGLE}
                        style={styles.map}
                        initialRegion={region}
                        onPress={handlePress}
                        showsUserLocation
                        showsMyLocationButton={false}
                    >
                        {selectedCoord && (
                            <Marker
                                coordinate={selectedCoord}
                                pinColor="#8B5CF6"
                                draggable
                                onDragEnd={(e) => {
                                    const { latitude, longitude } = e.nativeEvent.coordinate;
                                    setSelectedCoord({ latitude, longitude });
                                    void reverseGeocode(latitude, longitude);
                                }}
                            />
                        )}
                    </MapView>

                    <TouchableOpacity
                        style={[
                            styles.crosshairBtn,
                            { backgroundColor: isDark ? '#1F2937' : '#fff' },
                        ]}
                        onPress={recenterOnUser}
                        accessibilityLabel="Centrar en mi ubicación"
                    >
                        <Crosshair size={20} color={isDark ? '#fff' : '#111'} />
                    </TouchableOpacity>
                </View>

                <View
                    style={[
                        styles.footer,
                        {
                            paddingBottom: insets.bottom + 16,
                            backgroundColor: isDark ? '#1F2937' : '#fff',
                        },
                    ]}
                >
                    {selectedCoord ? (
                        <View>
                            <Text style={[styles.addressLabel, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                                Ubicación seleccionada
                            </Text>
                            {loadingAddress ? (
                                <ActivityIndicator color="#8B5CF6" />
                            ) : (
                                <Text
                                    style={[styles.addressText, { color: isDark ? '#fff' : '#111827' }]}
                                    numberOfLines={2}
                                >
                                    {address || 'Coordenadas seleccionadas'}
                                </Text>
                            )}
                            <Button onPress={handleConfirm} style={{ marginTop: 16, backgroundColor: '#8B5CF6' }}>
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                                    Confirmar Ubicación
                                </Text>
                            </Button>
                        </View>
                    ) : (
                        <Text style={{ color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center' }}>
                            Toca en el mapa para seleccionar una ubicación
                        </Text>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        elevation: 4,
    },
    title: { fontSize: 18, fontWeight: 'bold' },
    closeBtn: { padding: 4 },
    mapWrap: { flex: 1, overflow: 'hidden', position: 'relative' },
    map: { flex: 1 },
    crosshairBtn: {
        position: 'absolute',
        right: 16,
        bottom: 16,
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
    },
    footer: {
        padding: 16,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        elevation: 10,
    },
    addressLabel: { fontSize: 14, marginBottom: 4 },
    addressText: { fontSize: 16, fontWeight: '500' },
});

export default LocationPickerModal;
