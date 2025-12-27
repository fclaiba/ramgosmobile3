import React, { useRef, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Image, Platform, StyleSheet } from 'react-native';
import RNMapView, { Marker, Callout, PROVIDER_GOOGLE, PROVIDER_DEFAULT, Circle } from '../NativeMap';
import BottomSheet, { BottomSheetScrollView, BottomSheetView } from '@gorhom/bottom-sheet';
import { ShoppingBag, Gift, Ticket, Target, Plus as PlusIcon, Minus, Crosshair, MapPin, Layers, X, Bookmark } from 'lucide-react-native';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { useMapLogic } from './hooks/useMapLogic';
import { useCart } from '../../contexts/CartContext';
import { useFavorites } from '../../contexts/FavoritesContext';
import { BlurView } from 'expo-blur';

interface MapViewProps {
    items: any[];
    onItemClick: (item: any) => void;
    radius: number;
    searchLocation?: { lat: number; lng: number };
    onSearchLocationChange?: (loc: { lat: number; lng: number }) => void;
    isCustomSearch?: boolean;
    onToggleCustomSearch?: () => void;
    onRegionChange?: (region: any) => void;
}

export const MapView = ({
    items,
    onItemClick,
    radius,
    searchLocation,
    onSearchLocationChange,
    isCustomSearch = false,
    onToggleCustomSearch,
    onRegionChange
}: MapViewProps) => {
    // 1. Hooks Extraction
    const {
        mapRef,
        mapType,
        mapRegion,
        showList,
        setShowList,
        isDragging,
        initialRegion,
        center,
        getHandles,
        getLabelPosition,
        toggleMapType,
        zoomIn,
        zoomOut,
        centerOnUser,
        handleRegionChange,
        handleRegionChangeComplete
    } = useMapLogic(radius, searchLocation, isCustomSearch, onSearchLocationChange, onRegionChange);

    // Track deltas so centering doesn't reset zoom.
    const lastDeltasRef = useRef<{ latitudeDelta: number; longitudeDelta: number }>({
        latitudeDelta: initialRegion.latitudeDelta,
        longitudeDelta: initialRegion.longitudeDelta,
    });

    // 2. Cart & Favorites
    const { addItem } = useCart();
    const { isFavorite, toggleFavorite } = useFavorites();

    // 3. Bottom Sheet Config
    const bottomSheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ['45%', '85%'], []);
    const [isListOpen, setIsListOpen] = useState(false);

    // Helper for markers
    const getItemColor = (type: string) => {
        switch (type) {
            case 'product': return '#8B5CF6';
            case 'bono': return '#F59E0B';
            case 'event': return '#F97316';
            case 'business': return '#10B981'; // Emerald/Green for businesses
            default: return '#3B82F6';
        }
    };

    const getItemIcon = (type: string) => {
        switch (type) {
            case 'product': return <ShoppingBag size={14} color="#fff" />;
            case 'bono': return <Gift size={14} color="#fff" />;
            case 'event': return <Ticket size={14} color="#fff" />;
            case 'business': return <MapPin size={14} color="#fff" />;
            default: return <ShoppingBag size={14} color="#fff" />;
        }
    };

    return (
        <View className="flex-1 bg-white rounded-3xl overflow-hidden relative">
            <RNMapView
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
                initialRegion={initialRegion}
                showsMyLocationButton={false}
                showsCompass={false}
                rotateEnabled={false}
                mapType={mapType}
                showsUserLocation={false}
                onPress={(e: any) => {
                    const { latitude, longitude } = e?.nativeEvent?.coordinate || {};
                    if (typeof latitude !== 'number' || typeof longitude !== 'number') return;
                    onSearchLocationChange?.({ lat: latitude, lng: longitude });
                    // Recenter to keep the point perfectly centered without changing zoom.
                    mapRef.current?.animateToRegion({
                        latitude,
                        longitude,
                        latitudeDelta: lastDeltasRef.current.latitudeDelta,
                        longitudeDelta: lastDeltasRef.current.longitudeDelta,
                    });
                }}
                onRegionChange={handleRegionChange}
                onRegionChangeComplete={(region) => {
                    handleRegionChangeComplete(region);
                    const prev = lastDeltasRef.current;
                    const zoomChanged =
                        Math.abs(region.latitudeDelta - prev.latitudeDelta) > 1e-6 ||
                        Math.abs(region.longitudeDelta - prev.longitudeDelta) > 1e-6;

                    // Always track latest zoom deltas.
                    lastDeltasRef.current = {
                        latitudeDelta: region.latitudeDelta,
                        longitudeDelta: region.longitudeDelta,
                    };

                    // IMPORTANT: don't rewrite the center on zoom. Keep the exact same coordinate.
                    if (zoomChanged) return;

                    // If the user pans, keep the center point locked to the viewport center.
                    onSearchLocationChange?.({ lat: region.latitude, lng: region.longitude });
                }}
                customMapStyle={[{ "featureType": "poi", "elementType": "labels", "stylers": [{ "visibility": "off" }] }]}
            >
                {center && (
                    <>
                        <Circle
                            center={{ latitude: center.latitude, longitude: center.longitude }}
                            radius={radius * 1000}
                            fillColor="rgba(139, 92, 246, 0.15)"
                            strokeColor="#8B5CF6"
                            strokeWidth={3}
                            lineDashPattern={[10, 5]}
                            zIndex={2}
                        />
                        {[0.25, 0.5, 0.75].map((fraction) => (
                            <Circle
                                key={fraction}
                                center={{ latitude: center.latitude, longitude: center.longitude }}
                                radius={radius * 1000 * fraction}
                                strokeColor="rgba(139, 92, 246, 0.5)"
                                strokeWidth={1.5}
                                lineDashPattern={[4, 4]}
                                zIndex={2}
                            />
                        ))}
                    </>
                )}

                {/* Search Center Pin (draggable) */}
                {center && (
                    <Marker
                        key="search-center"
                        coordinate={{ latitude: center.latitude, longitude: center.longitude }}
                        tracksViewChanges={false}
                    >
                        <View className="items-center justify-center w-12 h-12">
                            <View
                                className="w-10 h-10 rounded-full items-center justify-center border-2 border-white shadow-lg"
                                style={{ backgroundColor: '#111827' }}
                            >
                                <Target size={16} color="#fff" />
                            </View>
                            <View className="w-0 h-0 border-l-[7px] border-r-[7px] border-t-[10px] border-l-transparent border-r-transparent border-t-transparent" />
                        </View>
                        <Callout tooltip>
                            <View className="bg-white rounded-lg px-3 py-2 items-center shadow-sm border border-black/5">
                                <Text className="font-bold text-xs text-gray-800">
                                    Centro
                                </Text>
                                <Text className="text-[10px] text-gray-500 mt-0.5">Tocá el mapa para mover</Text>
                            </View>
                        </Callout>
                    </Marker>
                )}

                {items.map((item) => (
                    <Marker
                        key={item.id}
                        coordinate={{ latitude: item.location.lat, longitude: item.location.lng }}
                        tracksViewChanges={false}
                        onPress={() => onItemClick(item)}
                    >
                        <View className="items-center justify-center w-10 h-10">
                            <View
                                className="w-8 h-8 rounded-full items-center justify-center border-2 border-white shadow-lg"
                                style={{ backgroundColor: getItemColor(item.type) }}
                            >
                                {getItemIcon(item.type)}
                            </View>
                            <View className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-transparent" />
                        </View>
                        <Callout tooltip>
                            <View className="w-36 bg-white rounded-lg p-2 items-center shadow-sm">
                                <Text className="font-bold text-xs mb-1 text-gray-800">{item.name}</Text>
                                <Text className="text-violet-600 font-bold text-xs">${item.price}</Text>
                            </View>
                        </Callout>
                    </Marker>
                ))}
            </RNMapView>

            {/* Top Left Stats */}
            <View className="absolute top-4 left-4 z-20">
                <BlurView intensity={30} tint="light" className="flex-row items-center px-3 py-1.5 rounded-xl border border-white/20 overflow-hidden">
                    <MapPin size={14} color="#7C3AED" />
                    <Text className="ml-1 text-xs font-semibold text-gray-800">{items.length}</Text>
                    <Text className="ml-1 text-xs text-gray-500">en {radius}km</Text>
                </BlurView>
            </View>

            {/* Right Controls */}
            <View className="absolute top-4 right-4 z-20 gap-2">
                <TouchableOpacity onPress={zoomIn} className="w-10 h-10 bg-white/90 rounded-xl items-center justify-center shadow-sm border border-black/5">
                    <PlusIcon size={20} color="#1F2937" />
                </TouchableOpacity>
                <TouchableOpacity onPress={zoomOut} className="w-10 h-10 bg-white/90 rounded-xl items-center justify-center shadow-sm border border-black/5">
                    <Minus size={20} color="#1F2937" />
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => centerOnUser(onToggleCustomSearch)}
                    className="w-10 h-10 rounded-xl items-center justify-center shadow-sm border border-black/5 bg-white/90"
                >
                    <Crosshair size={20} color="#1F2937" />
                </TouchableOpacity>
                <TouchableOpacity onPress={toggleMapType} className="w-10 h-10 bg-white/90 rounded-xl items-center justify-center shadow-sm border border-black/5">
                    <Layers size={20} color="#1F2937" />
                </TouchableOpacity>
            </View>

            {/* Bottom List Button */}
            <View className="absolute bottom-6 left-0 right-0 items-center z-30">
                <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                        if (isListOpen) bottomSheetRef.current?.close();
                        else bottomSheetRef.current?.snapToIndex(0);
                    }}
                    className="flex-row items-center bg-white/95 px-4 py-2.5 rounded-full shadow-sm border border-black/10"
                >
                    <Text className="text-sm font-semibold text-gray-900">Ver lista ({items.length})</Text>
                </TouchableOpacity>
            </View>

            {/* 4. Bottom Sheet Implementation */}
            <BottomSheet
                ref={bottomSheetRef}
                index={-1} // Hidden by default; opened via button
                snapPoints={snapPoints}
                enablePanDownToClose={true}
                onChange={(idx) => setIsListOpen(idx >= 0)}
                backgroundStyle={{ backgroundColor: 'white', borderRadius: 24 }}
                handleIndicatorStyle={{ backgroundColor: '#D1D5DB' }}
            >
                <View className="px-4 pb-2 border-b border-gray-100 flex-row justify-between items-center">
                    <View>
                        <Text className="text-lg font-bold text-gray-800">Resultados</Text>
                        <Text className="text-xs text-gray-500">{items.length} productos cerca</Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => bottomSheetRef.current?.collapse()}
                        className="p-1 bg-gray-50 rounded-full"
                    >
                        <X size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                </View>

                <BottomSheetScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                    {items.map(item => {
                        const saved = isFavorite(item.id);
                        return (
                            <TouchableOpacity
                                key={item.id}
                                className="flex-row p-3 bg-white rounded-2xl border border-gray-100 shadow-sm items-center relative"
                                onPress={() => {
                                    onItemClick(item);
                                    bottomSheetRef.current?.snapToIndex(1); // Snap to half so map is visible
                                }}
                            >
                                <View className="w-12 h-12 bg-gray-100 rounded-xl mr-3 items-center justify-center">
                                    {getItemIcon(item.type)}
                                </View>
                                <View className="flex-1">
                                    <View className="flex-row justify-between items-start">
                                        <Text className="text-sm font-semibold text-gray-900 flex-1 mr-2" numberOfLines={1}>{item.name}</Text>
                                        <View className="flex-row items-center bg-gray-50 px-1.5 py-0.5 rounded text-[10px]">
                                            <Text className="text-[10px] text-gray-500 font-medium">{item.category}</Text>
                                        </View>
                                    </View>
                                    <View className="flex-row justify-between items-end mt-1">
                                        <Text className="text-xs text-gray-500">{item.distance}km</Text>
                                        <Text className="text-sm font-bold text-violet-600">${item.price}</Text>
                                    </View>
                                </View>

                                {/* Action Buttons Container */}
                                <View className="flex-row items-center ml-2 gap-2">
                                    {/* Save Button */}
                                    <TouchableOpacity
                                        className={`w-8 h-8 rounded-full items-center justify-center border ${saved ? 'bg-violet-50 border-violet-100' : 'bg-gray-50 border-gray-100'}`}
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            toggleFavorite(item);
                                        }}
                                        accessibilityLabel="Guardar"
                                    >
                                        <Bookmark size={14} color={saved ? '#7C3AED' : '#9CA3AF'} fill={saved ? '#7C3AED' : 'transparent'} />
                                    </TouchableOpacity>

                                    {/* Add to Cart Quick Action */}
                                    <TouchableOpacity
                                        className="w-8 h-8 bg-violet-50 rounded-full items-center justify-center border border-violet-100"
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            addItem({
                                                id: item.id,
                                                name: item.name,
                                                price: item.price,
                                                image: item.image || 'https://via.placeholder.com/150',
                                                type: item.type,
                                                sellerId: item.sellerId,
                                                sellerName: item.sellerName,
                                                condition: item.condition,
                                                shippingWeightKg: item.shippingWeightKg,
                                                shippingDimensionsCm: item.shippingDimensionsCm,
                                                distanceKm: item.distance,
                                                location: item.location?.name,
                                            });
                                        }}
                                        accessibilityLabel="Agregar al carrito"
                                    >
                                        <PlusIcon size={16} color="#7C3AED" />
                                    </TouchableOpacity>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                    {/* Padding for bottom safety */}
                    <View className="h-10" />
                </BottomSheetScrollView>
            </BottomSheet>
        </View>
    );
};
