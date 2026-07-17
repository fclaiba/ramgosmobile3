import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { X, Crosshair, Check, MapPin } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import DarkMapView, { Marker, Region } from '../map/DarkMapView';
import { MAP_DEFAULTS } from '../../constants/darkMapStyle';
import { useUserLocation } from '../../hooks/useUserLocation';

interface LocationPickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (location: { lat: number; lng: number; address?: string }) => void;
    initialLocation?: { lat: number; lng: number };
}

const DEFAULT_REGION: Region = MAP_DEFAULTS.INITIAL_REGION;

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
    visible,
    onClose,
    onSelect,
    initialLocation,
}) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const insets = useSafeAreaInsets();
    const mapRef = useRef<any>(null);

    const [selectedCoord, setSelectedCoord] = useState<{ latitude: number; longitude: number } | null>(
        initialLocation
            ? { latitude: initialLocation.lat, longitude: initialLocation.lng }
            : null,
    );
    const [region, setRegion] = useState<Region>(
        initialLocation
            ? {
                  latitude: initialLocation.lat,
                  longitude: initialLocation.lng,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
              }
            : DEFAULT_REGION,
    );
    const [address, setAddress] = useState<string>('');
    const [loadingAddress, setLoadingAddress] = useState(false);
    const [gettingLocation, setGettingLocation] = useState(false);

    const { location: hookLocation, refetch: refetchLocation } = useUserLocation();

    const reverseGeocode = useCallback(async (lat: number, lng: number) => {
        setLoadingAddress(true);
        try {
            if (Platform.OS === 'web') {
                // ponytail: Nominatim on web — expo-location reverseGeocode doesn't work in browser
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
                    { headers: { 'Accept-Language': 'es' } },
                );
                const data = await res.json();
                setAddress(data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            } else {
                const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
                const first = results[0];
                if (first) {
                    const street = [first.street, first.streetNumber].filter(Boolean).join(' ') || '';
                    const city = first.city || first.subregion || '';
                    const regionName = first.region || '';
                    const composed = [street, city, regionName]
                        .filter((p) => p && p.length > 0)
                        .join(', ');
                    setAddress(composed || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
                } else {
                    setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
                }
            }
        } catch {
            setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        } finally {
            setLoadingAddress(false);
        }
    }, []);

    useEffect(() => {
        if (!visible) return;
        if (selectedCoord) {
            void reverseGeocode(selectedCoord.latitude, selectedCoord.longitude);
        }
    }, [visible, selectedCoord, reverseGeocode]);

    const centerOnCoordinate = useCallback((lat: number, lng: number, animated = true) => {
        const newRegion = {
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
        };
        setRegion(newRegion);
        setSelectedCoord({ latitude: lat, longitude: lng });
        if (animated && mapRef.current) {
            mapRef.current.animateToRegion(newRegion, 500);
        }
        void reverseGeocode(lat, lng);
    }, [reverseGeocode]);

    const handleGetCurrentLocation = async () => {
        setGettingLocation(true);
        try {
            if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 10000,
                    }),
                );
                centerOnCoordinate(pos.coords.latitude, pos.coords.longitude);
            } else {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.LocationAccuracy.Balanced });
                centerOnCoordinate(loc.coords.latitude, loc.coords.longitude);
            }
        } catch (e) {
            console.log('Error getting location', e);
            if (hookLocation) {
                centerOnCoordinate(hookLocation.coords.latitude, hookLocation.coords.longitude);
            }
        } finally {
            setGettingLocation(false);
        }
    };

    const handleMapPress = (e: any) => {
        const { latitude, longitude } = e.nativeEvent.coordinate;
        centerOnCoordinate(latitude, longitude, false);
    };

    const handleRegionChangeComplete = (newRegion: Region) => {
        setRegion(newRegion);
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
            <View style={styles.container}>
                <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                    <Text style={styles.title}>Seleccionar ubicación</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color={isDark ? '#fff' : '#000'} />
                    </TouchableOpacity>
                </View>

                <View style={styles.mapContainer}>
                    <DarkMapView
                        ref={mapRef}
                        style={styles.map}
                        initialRegion={region}
                        onPress={handleMapPress}
                        onRegionChangeComplete={handleRegionChangeComplete}
                        showsUserLocation
                        showsMyLocationButton={false}
                    >
                        {selectedCoord && (
                            <Marker
                                coordinate={{
                                    latitude: selectedCoord.latitude,
                                    longitude: selectedCoord.longitude,
                                }}
                            >
                                <View style={styles.markerContainer}>
                                    <MapPin size={28} color="#7C3AED" />
                                </View>
                            </Marker>
                        )}
                    </DarkMapView>

                    {/* Crosshair overlay to show map center when no selection */}
                    {!selectedCoord && (
                        <View style={styles.crosshairOverlay} pointerEvents="none">
                            <MapPin size={32} color="#7C3AED" />
                        </View>
                    )}

                    {/* Current location button */}
                    <TouchableOpacity
                        style={[styles.fab, styles.fabLocation, { top: insets.top + 70 }]}
                        onPress={handleGetCurrentLocation}
                        disabled={gettingLocation}
                    >
                        <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={styles.fabBlur}>
                            {gettingLocation ? (
                                <ActivityIndicator size="small" color="#7C3AED" />
                            ) : (
                                <Crosshair size={22} color={isDark ? '#F9FAFB' : '#111827'} />
                            )}
                        </BlurView>
                    </TouchableOpacity>
                </View>

                <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
                    <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={styles.footerBlur}>
                        <View style={styles.footerContent}>
                            <View style={styles.addressRow}>
                                <MapPin size={18} color="#7C3AED" style={{ marginRight: 8 }} />
                                {loadingAddress ? (
                                    <ActivityIndicator size="small" color="#7C3AED" />
                                ) : (
                                    <Text style={styles.addressText} numberOfLines={2}>
                                        {selectedCoord
                                            ? address || 'Ubicación seleccionada'
                                            : 'Tocá el mapa o usá tu ubicación actual'}
                                    </Text>
                                )}
                            </View>

                            <TouchableOpacity
                                style={[styles.confirmBtn, !selectedCoord && styles.confirmBtnDisabled]}
                                onPress={handleConfirm}
                                disabled={!selectedCoord}
                            >
                                <Check size={20} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.confirmBtnText}>Confirmar ubicación</Text>
                            </TouchableOpacity>
                        </View>
                    </BlurView>
                </View>
            </View>
        </Modal>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: isDark ? '#09090B' : '#FAFAFA',
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        paddingHorizontal: 16,
        paddingBottom: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: isDark ? 'rgba(17, 24, 39, 0.85)' : 'rgba(255, 255, 255, 0.85)',
        ...Platform.select({
            web: { backdropFilter: 'blur(8px)' },
            default: {},
        }),
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    closeBtn: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: isDark ? 'rgba(31, 41, 55, 0.8)' : 'rgba(243, 244, 246, 0.8)',
    },
    mapContainer: {
        flex: 1,
    },
    map: {
        flex: 1,
    },
    crosshairOverlay: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginLeft: -16,
        marginTop: -32,
        zIndex: 5,
    },
    markerContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    fab: {
        position: 'absolute',
        right: 16,
        zIndex: 15,
        borderRadius: 14,
        overflow: 'hidden',
        ...Platform.select({
            web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.15)' },
            default: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 8,
                elevation: 5,
            },
        }),
    },
    fabLocation: {
        top: 70,
    },
    fabBlur: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20,
    },
    footerBlur: {
        width: '100%',
    },
    footerContent: {
        padding: 16,
    },
    addressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    addressText: {
        flex: 1,
        fontSize: 14,
        fontWeight: '500',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    confirmBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#7C3AED',
        paddingVertical: 14,
        borderRadius: 14,
    },
    confirmBtnDisabled: {
        backgroundColor: '#9CA3AF',
    },
    confirmBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
});

export default LocationPickerModal;
