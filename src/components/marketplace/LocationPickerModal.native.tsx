import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions, ActivityIndicator, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { X, Check } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ui/button';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE, MAP_DEFAULTS } from '../../constants/darkMapStyle';

interface LocationPickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (location: { lat: number; lng: number; address?: string }) => void;
    initialLocation?: { lat: number; lng: number };
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({ visible, onClose, onSelect, initialLocation }) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const insets = useSafeAreaInsets();
    const [region, setRegion] = useState({
        latitude: initialLocation?.lat || 40.7128, // Default Manhattan
        longitude: initialLocation?.lng || -74.0060,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
    });
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
                const loc = await Location.getCurrentPositionAsync({});
                setRegion({
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                });
            })();
        }
    }, [visible, initialLocation]);

    const handleMapPress = async (e: any) => {
        const coord = e.nativeEvent.coordinate;
        setSelectedCoord(coord);
        setLoading(true);
        try {
            const geocode = await Location.reverseGeocodeAsync(coord);
            if (geocode && geocode.length > 0) {
                const addr = geocode[0];
                const addrString = `${addr.street || ''} ${addr.streetNumber || ''}, ${addr.city || addr.subregion || ''}`;
                setAddress(addrString.trim());
            } else {
                setAddress(`${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)}`);
            }
        } catch (error) {
            setAddress(`${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)}`);
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
            <View style={[styles.container, { backgroundColor: isDark ? '#09090B' : '#FAFAFA' }]}>
                {/* Header */}
                <View style={[styles.header, { paddingTop: insets.top, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)' }]}>
                    <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>Seleccionar Ubicación</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color={isDark ? '#fff' : '#000'} />
                    </TouchableOpacity>
                </View>

                {/* Map */}
                <MapView
                    style={styles.map}
                    region={region}
                    onRegionChangeComplete={setRegion}
                    onPress={handleMapPress}
                    showsUserLocation
                    provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
                    customMapStyle={isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
                    {...MAP_DEFAULTS.CLEAN_MAP_PROPS}
                >
                    {selectedCoord && <Marker coordinate={selectedCoord} />}
                </MapView>

                {/* Bottom Sheet */}
                <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)' }]}>
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

const getStyles = (isDark: any) => StyleSheet.create({
    container: { flex: 1 },
    header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, shadowColor: isDark ? '#F9FAFB' : '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, elevation: 4 },
    title: { fontSize: 18, fontWeight: 'bold' },
    closeBtn: { padding: 4 },
    map: { flex: 1 },
    footer: { padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, shadowColor: isDark ? '#F9FAFB' : '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, elevation: 10 },
    addressLabel: { fontSize: 14, marginBottom: 4 },
    addressText: { fontSize: 16, fontWeight: '500' },
});
