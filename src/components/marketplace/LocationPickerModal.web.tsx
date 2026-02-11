import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
// @ts-ignore - pigeon-maps might not have types installed or handled correctly in this env
import { Map, Marker } from 'pigeon-maps';
import * as Location from 'expo-location';
import { X } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
// @ts-ignore - web implementation often mocks this or it works if essentially mapped
// import { useSafeAreaInsets } from 'react-native-safe-area-context';
// On web, safe area insets might be zero or different, but we can import it.
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ui/button';

interface LocationPickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (location: { lat: number; lng: number; address?: string }) => void;
    initialLocation?: { lat: number; lng: number };
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({ visible, onClose, onSelect, initialLocation }) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();

    // Pigeon maps uses [lat, lng] center and zoom
    const [center, setCenter] = useState<[number, number]>([
        initialLocation?.lat || -34.603722, // Default CABA
        initialLocation?.lng || -58.381592
    ]);
    const [zoom, setZoom] = useState(13);

    const [selectedCoord, setSelectedCoord] = useState<{ latitude: number; longitude: number } | null>(
        initialLocation ? { latitude: initialLocation.lat, longitude: initialLocation.lng } : null
    );
    const [address, setAddress] = useState<string>('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (visible && !initialLocation) {
            (async () => {
                let { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') return;
                try {
                    const loc = await Location.getCurrentPositionAsync({});
                    setCenter([loc.coords.latitude, loc.coords.longitude]);
                } catch (e) {
                    console.log("Error getting location", e);
                }
            })();
        }
    }, [visible, initialLocation]);

    const handleMapClick = async ({ latLng }: { latLng: [number, number] }) => {
        const [lat, lng] = latLng;
        setSelectedCoord({ latitude: lat, longitude: lng });
        setLoading(true);
        try {
            // Expo Location reverseGeocodeAsync works on web too (often backed by Google Maps or OpenStreetMap depending on config/browser)
            const geocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
            if (geocode && geocode.length > 0) {
                const addr = geocode[0];
                const addrString = `${addr.street || ''} ${addr.streetNumber || ''}, ${addr.city || addr.subregion || ''}`;
                setAddress(addrString.trim());
            } else {
                setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            }
        } catch (error) {
            setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = () => {
        if (selectedCoord) {
            onSelect({
                lat: selectedCoord.latitude,
                lng: selectedCoord.longitude,
                address: address
            });
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <View style={[styles.container, { backgroundColor: isDark ? '#111827' : '#fff' }]}>
                {/* Header */}
                <View style={[styles.header, { paddingTop: 16, backgroundColor: isDark ? '#1F2937' : '#fff' }]}>
                    <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>Seleccionar Ubicación</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color={isDark ? '#fff' : '#000'} />
                    </TouchableOpacity>
                </View>

                {/* Map */}
                <View style={styles.map}>
                    <Map
                        height={Platform.OS === 'web' ? ('100%' as any) : 300} // Pigeon needs explicit height often or flex container
                        defaultCenter={center}
                        defaultZoom={zoom}
                        center={center}
                        zoom={zoom}
                        onBoundsChanged={({ center, zoom }) => {
                            setCenter(center);
                            setZoom(zoom);
                        }}
                        onClick={handleMapClick}
                    >
                        {selectedCoord && (
                            <Marker width={50} anchor={[selectedCoord.latitude, selectedCoord.longitude]} color={isDark ? '#8B5CF6' : '#8B5CF6'} />
                        )}
                    </Map>
                </View>

                {/* Bottom Sheet similar UI */}
                <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: isDark ? '#1F2937' : '#fff' }]}>
                    {selectedCoord ? (
                        <View>
                            <Text style={[styles.addressLabel, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>Ubicación seleccionada:</Text>
                            {loading ? (
                                <ActivityIndicator color="#8B5CF6" />
                            ) : (
                                <Text style={[styles.addressText, { color: isDark ? '#fff' : '#111827' }]}>{address || 'Coordenadas seleccionadas'}</Text>
                            )}
                            <Button onPress={handleConfirm} style={{ marginTop: 16, backgroundColor: '#8B5CF6' }}>
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Confirmar Ubicación</Text>
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
    header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, elevation: 4 },
    title: { fontSize: 18, fontWeight: 'bold' },
    closeBtn: { padding: 4 },
    map: { flex: 1, overflow: 'hidden' }, // overflow hidden for map web
    footer: { padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, elevation: 10 },
    addressLabel: { fontSize: 14, marginBottom: 4 },
    addressText: { fontSize: 16, fontWeight: '500' },
});
