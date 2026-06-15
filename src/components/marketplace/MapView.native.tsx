import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform, TouchableOpacity, Image, TextInput, ScrollView, Animated, LayoutAnimation, UIManager, ActivityIndicator } from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';

// Basic LayoutAnimation configuration for Android (Old Arch)
// In New Arch (Fabric), this is a no-op and logs a warning.
// @ts-ignore
if (Platform.OS === 'android' && !global?.nativeFabricUIManager) {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../contexts/ThemeContext';
import { useCart } from '../../contexts/CartContext';
import { useFavorites } from '../../contexts/FavoritesContext';
import { useToast } from '../../contexts/ToastContext';
import { MapPin, ShoppingCart, Tag, Ticket, Crosshair, Minus, Plus, Search, Filter, ArrowRight, LayoutGrid, List, Heart, Map } from 'lucide-react-native';
import * as Location from 'expo-location';
import { MapErrorBoundary, logMapEvent, logMapError } from '../MapErrorBoundary';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE, MAP_DEFAULTS } from '../../constants/darkMapStyle';

import Slider from '@react-native-community/slider';
import { useUserLocation } from '../../hooks/useUserLocation';

const { width } = Dimensions.get('window');

interface MarketplaceMapProps {
    items: any[];
    onItemClick: (item: any) => void;
    radius: number;
    bottomInset?: number;
    topInset?: number;
    searchLocation?: { lat: number; lng: number };
    onSearchLocationChange?: (loc: { lat: number; lng: number }) => void;
    isCustomSearch?: boolean;
    onRegionChange?: (region: any) => void;
    onRegionChangeComplete?: (region: any) => void;
    onRadiusChange?: (radius: any) => void; // Changed type to allow functional update if needed, or stick to number and handle wrapper
    // New Props for Search & Filters
    searchQuery: string;
    onSearchChange: (text: string) => void;
    filter: string;
    onFilterChange: (filter: any) => void;
    onOpenFilters: () => void;
    activeFiltersCount: number;
    viewMode: 'grid' | 'list' | 'map';
    onViewModeChange: (mode: 'grid' | 'list' | 'map') => void;
}

export const MapViewComponent: React.FC<MarketplaceMapProps> = ({
    items,
    onItemClick,
    radius,
    bottomInset,
    searchLocation,
    onSearchLocationChange,
    isCustomSearch,
    onRegionChange,
    onRegionChangeComplete,
    onRadiusChange,
    searchQuery,
    onSearchChange,
    filter,
    onFilterChange,
    onOpenFilters,
    activeFiltersCount,
    viewMode,
    onViewModeChange
}) => {
    const mapRef = useRef<MapView>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const insets = useSafeAreaInsets();
    const bottomOffset = typeof bottomInset === 'number' ? bottomInset : (insets.bottom + 65);

    // Hooks
    const { addItem } = useCart();
    const { toggleFavorite, isFavorite } = useFavorites();
    const { show } = useToast();

    // State
    const [userLocation, setUserLocation] = useState<any>(null);
    const [activeItem, setActiveItem] = useState<any>(null);
    const [isTrackingUser, setIsTrackingUser] = useState(true);
    const [mapReady, setMapReady] = useState(false);
    const { location: hookLocation, errorMsg: hookError, refetch: refetchLocation } = useUserLocation();
    const [locationError, setLocationError] = useState<string | null>(null);
    const [mapKey, setMapKey] = useState(0); // For forcing re-mount on retry

    // Map ready handler with logging
    const handleMapReady = useCallback(() => {
        setMapReady(true);
        logMapEvent('READY', {
            provider: Platform.OS === 'ios' ? 'apple' : 'google',
            itemCount: items.length
        });
    }, [items.length]);

    // Initial Location with improved logging
    useEffect(() => {
        logMapEvent('INIT', { radius, itemCount: items.length });
    }, [items.length, radius]);

    useEffect(() => {
        if (hookError) {
            setLocationError(hookError);
            if (hookError.includes('denegado')) {
                show('Activa los permisos de ubicación para ver el mapa', 'warning');
            } else {
                show('No se pudo obtener tu ubicación', 'error');
            }
        } else if (hookLocation) {
            const coords = {
                latitude: hookLocation.coords.latitude,
                longitude: hookLocation.coords.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
            };

            setUserLocation(coords);
            setLocationError(null);
            logMapEvent('LOCATION_ACQUIRED', {
                lat: coords.latitude.toFixed(4),
                lng: coords.longitude.toFixed(4)
            });
        }
    }, [hookLocation, hookError, show]);

    // Removed the searchLocation useEffect loop. Map only animates on Marker press or initial load.

    const handleMarkerPress = (item: any) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActiveItem(item);
        setIsTrackingUser(false);
        mapRef.current?.animateToRegion({
            latitude: item.location.lat,
            longitude: item.location.lng,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
        }, 500);
    };

    const handleZoom = (direction: 'in' | 'out') => {
        mapRef.current?.getCamera().then((cam: any) => {
            const newZoom = direction === 'in' ? cam.zoom + 1 : cam.zoom - 1;
            mapRef.current?.animateCamera({ zoom: newZoom });
        });
    };

    const getItemIcon = (type: string) => {
        switch (type) {
            case 'product': return ShoppingCart;
            case 'bono': return Tag;
            case 'event': return Ticket;
            case 'service': return MapPin;
            case 'business': return MapPin;
            default: return MapPin;
        }
    };

    const getMarkerColor = (type: string) => {
        switch (type) {
            case 'product': return '#8B5CF6'; // Violet
            case 'bono': return '#10B981'; // Emerald
            case 'event': return '#F59E0B'; // Amber
            case 'service': return '#38BDF8'; // Sky
            case 'business': return '#EC4899'; // Pink
            default: return '#6B7280';
        }
    };

    // Retry handler for error boundary
    const handleMapRetry = useCallback(() => {
        setMapKey(k => k + 1);
        setMapReady(false);
        setLocationError(null);
    }, []);

    // Loading state while getting location
    if (!userLocation && !locationError) {
        return (
            <View style={[styles.container, styles.loadingContainer]}>
                <ActivityIndicator size="large" color="#8B5CF6" />
                <Text style={[styles.loadingText, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                    Obteniendo ubicación...
                </Text>
            </View>
        );
    }

    // Error state for location permission
    if (locationError && !userLocation) {
        return (
            <View style={[styles.container, styles.errorContainer]}>
                <View style={[styles.errorIconContainer, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]}>
                    <Map size={40} color={isDark ? '#9CA3AF' : '#6B7280'} />
                </View>
                <Text style={[styles.errorTitle, { color: isDark ? '#F9FAFB' : '#111827' }]}>
                    Ubicación no disponible
                </Text>
                <Text style={[styles.errorMessage, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                    {locationError}
                </Text>
                <TouchableOpacity style={styles.retryButton} onPress={handleMapRetry}>
                    <Text style={styles.retryButtonText}>Reintentar</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <MapErrorBoundary onRetry={handleMapRetry} isDark={isDark}>
            <View style={styles.container}>
                <MapView
                    key={mapKey}
                    ref={mapRef}
                    style={styles.map}
                    provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
                    customMapStyle={isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
                    showsUserLocation={true}
                    showsMyLocationButton={false}
                    onRegionChangeComplete={(region) => {
                        logMapEvent('REGION_CHANGE', {
                            lat: region.latitude.toFixed(4),
                            lng: region.longitude.toFixed(4),
                            delta: region.latitudeDelta.toFixed(4)
                        });
                        onRegionChange && onRegionChange(region);
                        onRegionChangeComplete && onRegionChangeComplete(region);
                        if (isCustomSearch && onSearchLocationChange) {
                            // Debounce logic could be added here
                        }
                    }}
                    onMapReady={handleMapReady}
                    onPress={() => {
                        if (activeItem) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setActiveItem(null);
                    }}
                >
                    {/* Search Circle */}
                    {searchLocation && (
                        <Circle
                            center={{ latitude: searchLocation.lat, longitude: searchLocation.lng }}
                            radius={radius * 1000}
                            strokeWidth={2}
                            strokeColor={isDark ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.6)'}
                            fillColor={isDark ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)'}
                        />
                    )}

                    {/* Markers */}
                    {items?.map((item) => {
                        const Icon = getItemIcon(item.type);
                        const color = getMarkerColor(item.type);
                        const isSelected = activeItem?.id === item.id;

                        return (
                            <Marker
                                key={item.id}
                                coordinate={{ latitude: item.location.lat, longitude: item.location.lng }}
                                onPress={() => handleMarkerPress(item)}
                                title={item.name}
                                description={item.type === 'service' ? 'Servicio' : item.type === 'business' ? 'Negocio' : 'Producto'}
                            >
                                <View style={[styles.markerContainer, isSelected && styles.markerActive, { borderColor: color }]}>
                                    {isSelected ? (
                                        <Image source={{ uri: item.image }} style={styles.markerImage} />
                                    ) : (
                                        <Icon size={16} color={color} />
                                    )}
                                </View>
                                <View style={[styles.triangle, { borderTopColor: color }]} />
                                <Text style={{ fontSize: 10, fontWeight: 'bold', color: isDark ? '#fff' : '#000', backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)', paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden', textAlign: 'center', marginTop: 2 }}>{item.name}</Text>
                            </Marker>
                        );
                    })}
                </MapView>

                {/* Radius Slider (Dynamic Position) */}
                <View style={[styles.sliderContainer, { bottom: activeItem ? (bottomOffset + 180) : (bottomOffset + 30) }]}>
                    <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={styles.blurPill}>
                        <Text style={[styles.sliderLabel, { color: isDark ? '#fff' : '#000' }]}>Radio: {radius}km</Text>
                        <View style={styles.sliderRow}>
                            <TouchableOpacity
                                onPressIn={() => {
                                    onRadiusChange && onRadiusChange(Math.max(1, radius - 1));
                                    intervalRef.current = setInterval(() => {
                                        onRadiusChange && onRadiusChange((prev: number) => Math.max(1, prev - 1));
                                    }, 100);
                                }}
                                onPressOut={() => {
                                    if (intervalRef.current) clearInterval(intervalRef.current);
                                }}
                                style={styles.iconBtn}
                            >
                                <Minus size={20} color={isDark ? '#fff' : '#000'} />
                            </TouchableOpacity>

                            <Slider
                                style={{ flex: 1, height: 40 }}
                                minimumValue={1}
                                maximumValue={50}
                                step={1}
                                value={radius}
                                onValueChange={onRadiusChange}
                                minimumTrackTintColor="#8B5CF6"
                                maximumTrackTintColor={isDark ? '#4B5563' : '#D1D5DB'}
                                thumbTintColor="#8B5CF6"
                            />

                            <TouchableOpacity
                                onPressIn={() => {
                                    onRadiusChange && onRadiusChange(Math.min(50, radius + 1));
                                    intervalRef.current = setInterval(() => {
                                        onRadiusChange && onRadiusChange((prev: number) => Math.min(50, prev + 1));
                                    }, 100);
                                }}
                                onPressOut={() => {
                                    if (intervalRef.current) clearInterval(intervalRef.current);
                                }}
                                style={styles.iconBtn}
                            >
                                <Plus size={20} color={isDark ? '#fff' : '#000'} />
                            </TouchableOpacity>
                        </View>
                    </BlurView>
                </View>

                {/* Map Controls (Right Center) */}
                <View style={styles.controlsContainer}>
                    <TouchableOpacity
                        style={[styles.controlBtn, { backgroundColor: isDark ? 'rgba(31,41,55,0.9)' : 'rgba(255,255,255,0.9)' }]}
                        onPress={() => {
                            setIsTrackingUser(true);
                            if (userLocation) mapRef.current?.animateToRegion(userLocation, 1000);
                        }}
                    >
                        <Crosshair size={24} color={isTrackingUser ? '#8B5CF6' : (isDark ? '#fff' : '#000')} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.controlBtn, { backgroundColor: isDark ? 'rgba(31,41,55,0.9)' : 'rgba(255,255,255,0.9)' }]}
                        onPress={() => handleZoom('in')}
                    >
                        <Plus size={24} color={isDark ? '#fff' : '#000'} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.controlBtn, { backgroundColor: isDark ? 'rgba(31,41,55,0.9)' : 'rgba(255,255,255,0.9)' }]}
                        onPress={() => handleZoom('out')}
                    >
                        <Minus size={24} color={isDark ? '#fff' : '#000'} />
                    </TouchableOpacity>
                </View>

                {/* Item Detail Card (Bottom Sheet Style) */}
                {activeItem && (
                    <Animated.View style={[styles.detailCard, { backgroundColor: isDark ? '#1F2937' : '#fff', bottom: bottomOffset + 16 }]}>
                        <View style={styles.detailHeader}>
                            <TouchableOpacity
                                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                                onPress={() => onItemClick(activeItem)}
                            >
                                <Image source={{ uri: activeItem.image }} style={styles.detailImage} />
                                <View style={styles.detailContent}>
                                    <Text style={[styles.detailTitle, { color: isDark ? '#fff' : '#000' }]} numberOfLines={1}>
                                        {activeItem.name}
                                    </Text>
                                    <Text style={[styles.detailSub, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                                        {activeItem.category} • {activeItem.distance}km
                                    </Text>
                                    <View style={styles.priceTag}>
                                        <Text style={styles.priceText}>${activeItem.price}</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>

                            {/* Actions */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <TouchableOpacity
                                    style={[styles.actionBtn, { backgroundColor: isDark ? '#374151' : '#F3F4F6' }]}
                                    onPress={() => toggleFavorite(activeItem)}
                                >
                                    <Heart
                                        size={18}
                                        color={isFavorite(activeItem.id) ? '#EF4444' : (isDark ? '#D1D5DB' : '#6B7280')}
                                        fill={isFavorite(activeItem.id) ? '#EF4444' : 'transparent'}
                                    />
                                </TouchableOpacity>

                                {activeItem.type === 'product' && (
                                    <TouchableOpacity
                                        style={[styles.actionBtn, { backgroundColor: '#8B5CF6' }]}
                                        onPress={() => {
                                            addItem({
                                                id: activeItem.id,
                                                name: activeItem.name,
                                                price: activeItem.price,
                                                image: activeItem.image,
                                                type: activeItem.type || 'product',
                                                location: activeItem.location.name,
                                                sellerId: activeItem.sellerId,
                                                sellerName: activeItem.sellerName,
                                                condition: activeItem.condition,
                                                shippingWeightKg: activeItem.shippingWeightKg,
                                                shippingDimensionsCm: activeItem.shippingDimensionsCm,
                                                distanceKm: activeItem.distance,
                                                quantity: 1
                                            });
                                            show('Agregado al carrito', 'success');
                                        }}
                                    >
                                        <ShoppingCart size={18} color="#fff" />
                                    </TouchableOpacity>
                                )}

                                <TouchableOpacity
                                    style={[styles.actionBtn, { backgroundColor: isDark ? '#374151' : '#F3F4F6' }]}
                                    onPress={() => onItemClick(activeItem)}
                                >
                                    <ArrowRight size={18} color={isDark ? '#D1D5DB' : '#6B7280'} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Animated.View>
                )}
            </View>
        </MapErrorBoundary>
    );
};

export { MapViewComponent as MapView };

const getStyles = (isDark: any) => StyleSheet.create({
    container: { flex: 1 },
    map: { width: '100%', height: '100%' },

    // Loading/Error States
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        fontWeight: '500',
    },
    errorContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        backgroundColor: '#F9FAFB',
    },
    errorIconContainer: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    errorTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    errorMessage: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20,
    },
    retryButton: {
        backgroundColor: '#6366F1',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    retryButtonText: {
        color: isDark ? '#1F2937' : '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
    markerContainer: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderWidth: 3,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: isDark ? '#F9FAFB' : '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5
    },
    markerActive: { width: 48, height: 48, borderRadius: 24, borderWidth: 4, zIndex: 10 },
    markerImage: { width: 40, height: 40, borderRadius: 20 },
    triangle: {
        width: 0, height: 0,
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 0, borderTopWidth: 8,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        alignSelf: 'center', marginTop: -2
    },

    // Top Overlay
    topOverlay: { position: 'absolute', left: 16, right: 16, zIndex: 10 },
    searchRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    blurSearch: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 24, height: 48, overflow: 'hidden', paddingRight: 4 },
    searchInput: { flex: 1, paddingHorizontal: 16, height: 48, fontSize: 14 },
    filterBtn: { borderRadius: 16, overflow: 'hidden', width: 48, height: 48 },
    blurBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
    activeFilterBadge: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C3AED', borderWidth: 1, borderColor: isDark ? '#1F2937' : '#fff' },

    secondRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    viewToggles: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 4, height: 40, alignItems: 'center' },
    viewToggleBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
    viewToggleBtnActive: { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' },

    catsRow: { gap: 8 },
    catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'transparent' },
    catChipActive: { borderColor: '#7C3AED' },
    catText: { fontSize: 13, fontWeight: '500' },
    catTextActive: { fontWeight: 'bold' },

    // Controls
    controlsContainer: { position: 'absolute', right: 16, top: '50%', marginTop: -66, gap: 12 },
    controlBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: isDark ? '#F9FAFB' : '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },

    // Slider
    sliderContainer: { position: 'absolute', alignSelf: 'center', width: '60%', maxWidth: 300, zIndex: 5 },
    blurPill: { borderRadius: 24, padding: 12, overflow: 'hidden' },
    sliderLabel: { textAlign: 'center', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
    sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    barContainer: { flex: 1, height: 4, backgroundColor: 'rgba(150,150,150,0.3)', borderRadius: 2 },
    barFill: { height: '100%', backgroundColor: '#8B5CF6', borderRadius: 2 },
    iconBtn: { padding: 4 },

    // Detail Card
    detailCard: {
        position: 'absolute', left: 16, right: 16,
        borderRadius: 20, padding: 16,
        shadowColor: isDark ? '#F9FAFB' : '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8
    },
    detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    detailImage: { width: 56, height: 56, borderRadius: 12 },
    detailContent: { flex: 1 },
    detailTitle: { fontSize: 16, fontWeight: 'bold' },
    detailSub: { fontSize: 13 },
    priceTag: { backgroundColor: '#10B981', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
    priceText: { color: isDark ? '#1F2937' : '#fff', fontSize: 12, fontWeight: 'bold' },
    actionBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center' }
});

// Map styles are now centralized in src/constants/darkMapStyle.ts

