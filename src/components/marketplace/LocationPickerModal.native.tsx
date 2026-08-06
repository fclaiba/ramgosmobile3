import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { X, Check } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ui/button';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE, MAP_DEFAULTS } from '../../constants/darkMapStyle';
import { glassShadow, colors } from '../../theme/tokens';
import { resolveLandLocation } from '../../utils/landLocation';
import { useToast } from '../../contexts/ToastContext';

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
    const { show } = useToast();
    const [region, setRegion] = useState({
        latitude: initialLocation?.lat || 40.7484,
        longitude: initialLocation?.lng || -73.9857,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
    });
    const [selectedCoord, setSelectedCoord] = useState<{ latitude: number; longitude: number } | null>(
        initialLocation ? { latitude: initialLocation.lat, longitude: initialLocation.lng } : null,
    );
    const [address, setAddress] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [landOk, setLandOk] = useState(true);

    useEffect(() => {
        if (visible && !initialLocation) {
            (async () => {
                const { status } = await Location.requestForegroundPermissionsAsync();
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
        setLandOk(false);
        try {
            const result = await resolveLandLocation(coord.latitude, coord.longitude);
            if (!result.ok) {
                setAddress(result.message);
                setLandOk(false);
                show(result.message, 'warning');
                return;
            }
            setSelectedCoord({ latitude: result.lat, longitude: result.lng });
            setAddress(result.address);
            setLandOk(true);
            if (result.snapped) {
                show('Ajustamos el pin a tierra firme (estaba sobre agua)', 'info');
                setRegion((prev) => ({
                    ...prev,
                    latitude: result.lat,
                    longitude: result.lng,
                }));
            }
        } catch {
            setAddress(`${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)}`);
            setLandOk(false);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = () => {
        if (selectedCoord && landOk) {
            onSelect({
                lat: selectedCoord.latitude,
                lng: selectedCoord.longitude,
                address,
            });
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <View style={[styles.container, { backgroundColor: colors(isDark).bg }]}>
                <View style={[styles.header, { paddingTop: insets.top, backgroundColor: colors(isDark).glass }]}>
                    <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>Seleccionar Ubicación</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color={isDark ? '#fff' : '#000'} />
                    </TouchableOpacity>
                </View>

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
                    {selectedCoord && <Marker coordinate={selectedCoord} pinColor={landOk ? undefined : 'red'} />}
                </MapView>

                <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: colors(isDark).glass }]}>
                    {selectedCoord ? (
                        <View>
                            <Text style={[styles.addressLabel, { color: colors(isDark).textMuted }]}>
                                Ubicación seleccionada:
                            </Text>
                            {loading ? (
                                <ActivityIndicator color="#4FC3F7" />
                            ) : (
                                <Text
                                    style={[
                                        styles.addressText,
                                        { color: landOk ? (isDark ? '#fff' : '#111827') : '#EF4444' },
                                    ]}
                                >
                                    {address || 'Coordenadas seleccionadas'}
                                </Text>
                            )}
                            <Button
                                onPress={handleConfirm}
                                disabled={!landOk || loading}
                                style={{
                                    marginTop: 16,
                                    backgroundColor: landOk && !loading ? '#4FC3F7' : '#9CA3AF',
                                }}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                                    {loading ? 'Validando tierra firme…' : 'Confirmar Ubicación'}
                                </Text>
                            </Button>
                        </View>
                    ) : (
                        <Text style={{ color: colors(isDark).textMuted, textAlign: 'center' }}>
                            Tocá tierra firme en el mapa (no ríos ni mar)
                        </Text>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const getStyles = (isDark: any) =>
    StyleSheet.create({
        container: { flex: 1 },
        header: {
            padding: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 10,
            ...glassShadow(isDark),
        },
        title: { fontSize: 18, fontWeight: 'bold' },
        closeBtn: { padding: 4 },
        map: { flex: 1 },
        footer: {
            padding: 16,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            ...glassShadow(isDark),
        },
        addressLabel: { fontSize: 14, marginBottom: 4 },
        addressText: { fontSize: 16, fontWeight: '500' },
    });
