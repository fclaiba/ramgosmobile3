import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { X, Crosshair } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ui/button';
import { useUserLocation } from '../../hooks/useUserLocation';

interface LocationPickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (location: { lat: number; lng: number; address?: string }) => void;
    initialLocation?: { lat: number; lng: number };
}

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

    const [selectedCoord, setSelectedCoord] = useState<{ latitude: number; longitude: number } | null>(
        initialLocation
            ? { latitude: initialLocation.lat, longitude: initialLocation.lng }
            : null,
    );
    const [address, setAddress] = useState<string>('');
    const [loadingAddress, setLoadingAddress] = useState(false);

    const { location: hookLocation, refetch: refetchLocation } = useUserLocation();

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

    useEffect(() => {
        if (!visible) return;
        if (selectedCoord) {
            void reverseGeocode(selectedCoord.latitude, selectedCoord.longitude);
        }
    }, [visible]);

    const handleGetCurrentLocation = async () => {
        setLoadingAddress(true);
        try {
            const loc = await Location.getCurrentPositionAsync({});
            setSelectedCoord({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            void reverseGeocode(loc.coords.latitude, loc.coords.longitude);
        } catch (e) {
            console.log("Error getting location", e);
            setLoadingAddress(false);
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
                        Ubicación
                    </Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color={isDark ? '#fff' : '#000'} />
                    </TouchableOpacity>
                </View>

                <View style={styles.contentWrap}>
                    <Text style={{ color: isDark ? '#D1D5DB' : '#374151', textAlign: 'center', marginBottom: 20 }}>
                        No necesitas ver un mapa pesado. Usa tu ubicación actual.
                    </Text>
                    
                    <Button onPress={handleGetCurrentLocation} style={{ backgroundColor: '#8B5CF6', marginBottom: 20 }}>
                        <Crosshair size={20} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Obtener Mi Ubicación Actual</Text>
                    </Button>

                    {selectedCoord && (
                        <View style={{ marginTop: 20 }}>
                            <Text style={[styles.addressLabel, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                                Ubicación seleccionada:
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
                        </View>
                    )}
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
                    <Button onPress={handleConfirm} disabled={!selectedCoord} style={{ backgroundColor: selectedCoord ? '#8B5CF6' : '#9CA3AF' }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                            Confirmar Ubicación
                        </Text>
                    </Button>
                </View>
            </View>
        </Modal>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1 },
    header: {
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10,
        shadowColor: isDark ? '#F9FAFB' : '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        elevation: 4,
    },
    title: { fontSize: 18, fontWeight: 'bold' },
    closeBtn: { padding: 4 },
    contentWrap: { flex: 1, padding: 24, justifyContent: 'center' },
    footer: {
        padding: 16,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        shadowColor: isDark ? '#F9FAFB' : '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        elevation: 10,
    },
    addressLabel: { fontSize: 14, marginBottom: 4 },
    addressText: { fontSize: 16, fontWeight: '500' },
});

export default LocationPickerModal;
