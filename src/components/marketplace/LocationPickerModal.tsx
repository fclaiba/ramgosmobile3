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
import { glassShadow, Radius, colors } from '../../theme/tokens';
import { resolveLandLocation } from '../../utils/landLocation';
import { useToast } from '../../contexts/ToastContext';

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
    const { show } = useToast();

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
    const [landOk, setLandOk] = useState(true);
    const [validatingLand, setValidatingLand] = useState(false);

    const { location: hookLocation } = useUserLocation();

    const applyLandResolved = useCallback(
        async (lat: number, lng: number, animated = true) => {
            setValidatingLand(true);
            setLoadingAddress(true);
            setLandOk(false);
            try {
                const result = await resolveLandLocation(lat, lng);
                if (!result.ok) {
                    setSelectedCoord({ latitude: lat, longitude: lng });
                    setAddress(result.message);
                    setLandOk(false);
                    show(result.message, 'warning');
                    return;
                }

                const newRegion = {
                    latitude: result.lat,
                    longitude: result.lng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                };
                setRegion(newRegion);
                setSelectedCoord({ latitude: result.lat, longitude: result.lng });
                setAddress(result.address);
                setLandOk(true);
                if (result.snapped) {
                    show('Ajustamos el pin a tierra firme (estaba sobre agua)', 'info');
                }
                if (animated && mapRef.current) {
                    mapRef.current.animateToRegion(newRegion, 500);
                }
            } finally {
                setValidatingLand(false);
                setLoadingAddress(false);
            }
        },
        [show],
    );

    useEffect(() => {
        if (!visible) return;
        if (initialLocation) {
            void applyLandResolved(initialLocation.lat, initialLocation.lng, false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

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
                await applyLandResolved(pos.coords.latitude, pos.coords.longitude);
            } else {
                const loc = await Location.getCurrentPositionAsync({
                    accuracy: Location.LocationAccuracy.Balanced,
                });
                await applyLandResolved(loc.coords.latitude, loc.coords.longitude);
            }
        } catch (e) {
            console.log('Error getting location', e);
            if (hookLocation) {
                await applyLandResolved(hookLocation.coords.latitude, hookLocation.coords.longitude);
            }
        } finally {
            setGettingLocation(false);
        }
    };

    const handleMapPress = (e: any) => {
        const { latitude, longitude } = e.nativeEvent.coordinate;
        void applyLandResolved(latitude, longitude, false);
    };

    const handleRegionChangeComplete = (newRegion: Region) => {
        setRegion(newRegion);
    };

    const handleConfirm = () => {
        if (!selectedCoord || !landOk || validatingLand) return;
        onSelect({
            lat: selectedCoord.latitude,
            lng: selectedCoord.longitude,
            address,
        });
    };

    const canConfirm = !!selectedCoord && landOk && !validatingLand && !loadingAddress;

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
                                    <MapPin size={28} color={landOk ? '#2196F3' : '#EF4444'} />
                                </View>
                            </Marker>
                        )}
                    </DarkMapView>

                    {!selectedCoord && (
                        <View style={styles.crosshairOverlay} pointerEvents="none">
                            <MapPin size={32} color="#2196F3" />
                        </View>
                    )}

                    <TouchableOpacity
                        style={[styles.fab, styles.fabLocation, { top: insets.top + 70 }]}
                        onPress={handleGetCurrentLocation}
                        disabled={gettingLocation || validatingLand}
                    >
                        <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={styles.fabBlur}>
                            {gettingLocation || validatingLand ? (
                                <ActivityIndicator size="small" color="#2196F3" />
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
                                <MapPin
                                    size={18}
                                    color={landOk ? '#2196F3' : '#EF4444'}
                                    style={{ marginRight: 8 }}
                                />
                                {loadingAddress || validatingLand ? (
                                    <ActivityIndicator size="small" color="#2196F3" />
                                ) : (
                                    <Text
                                        style={[styles.addressText, !landOk && { color: '#EF4444' }]}
                                        numberOfLines={2}
                                    >
                                        {selectedCoord
                                            ? address || 'Ubicación seleccionada'
                                            : 'Tocá tierra firme en el mapa (no ríos ni mar)'}
                                    </Text>
                                )}
                            </View>

                            <TouchableOpacity
                                style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
                                onPress={handleConfirm}
                                disabled={!canConfirm}
                            >
                                <Check size={20} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.confirmBtnText}>
                                    {validatingLand ? 'Validando tierra firme…' : 'Confirmar ubicación'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </BlurView>
                </View>
            </View>
        </Modal>
    );
};

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors(isDark).bg,
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
            color: colors(isDark).text,
        },
        closeBtn: {
            padding: 8,
            borderRadius: Radius.xl,
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
            borderRadius: Radius.md,
            overflow: 'hidden',
            ...Platform.select({
                web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.15)' },
                default: {
                    ...glassShadow(isDark),
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
            color: colors(isDark).text,
        },
        confirmBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#2196F3',
            paddingVertical: 14,
            borderRadius: Radius.md,
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
