import { useState, useRef } from 'react';
import { Dimensions, Platform } from 'react-native';
import RNMapView from 'react-native-maps';

export const useMapLogic = (
    radius: number,
    searchLocation: { lat: number; lng: number } | undefined,
    isCustomSearch: boolean,
    onSearchLocationChange?: (loc: { lat: number; lng: number }) => void,
    onRegionChangeExternal?: (region: any) => void
) => {
    const mapRef = useRef<RNMapView>(null);
    const [mapType, setMapType] = useState<'standard' | 'satellite' | 'hybrid'>('standard');
    const [mapRegion, setMapRegion] = useState<any>(null);
    const [showList, setShowList] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Initial Region (Buenos Aires)
    const initialRegion = {
        latitude: -34.603722,
        longitude: -58.381592,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
    };

    const toggleMapType = () => {
        setMapType(current => current === 'standard' ? 'satellite' : 'standard');
    };

    // Calculate effective center for the radius circle
    const center = (isCustomSearch && searchLocation)
        ? { latitude: searchLocation.lat, longitude: searchLocation.lng }
        : initialRegion;

    // Radius Handles Logic
    const getHandles = () => {
        if (!center || isDragging) return [];
        const latDelta = radius / 111;
        const lngDelta = radius / (111 * Math.cos(center.latitude * (Math.PI / 180)));

        return [
            { id: 'n', lat: center.latitude + latDelta, lng: center.longitude },
            { id: 's', lat: center.latitude - latDelta, lng: center.longitude },
            { id: 'e', lat: center.latitude, lng: center.longitude + lngDelta },
            { id: 'w', lat: center.latitude, lng: center.longitude - lngDelta },
        ];
    };

    // Label position
    const getLabelPosition = () => {
        if (!center || isDragging) return null;
        const latDelta = radius / 111;
        return { latitude: center.latitude + latDelta, longitude: center.longitude };
    };

    const zoomIn = () => {
        mapRef.current?.getCamera().then((cam) => {
            if (cam && cam.zoom) mapRef.current?.animateCamera({ zoom: cam.zoom + 1 });
        });
    };

    const zoomOut = () => {
        mapRef.current?.getCamera().then((cam) => {
            if (cam && cam.zoom) mapRef.current?.animateCamera({ zoom: cam.zoom - 1 });
        });
    };

    const centerOnUser = (onResetCustom?: () => void) => {
        if (center && mapRef.current) {
            mapRef.current.animateToRegion({
                latitude: center.latitude,
                longitude: center.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
            });
        }
    };

    const handleRegionChange = (region: any) => {
        if (!isDragging) setIsDragging(true);
        if (onRegionChangeExternal) {
            onRegionChangeExternal(region);
        }
    };

    const handleRegionChangeComplete = (region: any) => {
        setIsDragging(false);
        setMapRegion(region);
        if (onRegionChangeExternal) {
            onRegionChangeExternal(region);
        }
    };

    return {
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
    };
};
