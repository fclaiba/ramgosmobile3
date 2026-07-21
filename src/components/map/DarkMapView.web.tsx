import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import { MapContainer, TileLayer, Marker as LMarker, Circle as LCircle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useTheme } from '../../contexts/ThemeContext';
import { MAP_DEFAULTS } from '../../constants/darkMapStyle';

// ponytail: inject leaflet CSS from CDN (Metro can't handle local CSS url refs)
if (typeof document !== 'undefined' && !document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
}

const DARK_TILES = 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_nolabels/{z}/{x}/{y}{r}.png';
const DARK_LABELS = 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_only_labels/{z}/{x}/{y}{r}.png';
const LIGHT_TILES = 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}{r}.png';
const LIGHT_LABELS = 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_only_labels/{z}/{x}/{y}{r}.png';

export type Region = {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
};
export type EdgePadding = { top: number; right: number; bottom: number; left: number };
export type MapPressEvent = { nativeEvent: { coordinate: { latitude: number; longitude: number } } };

const regionToZoom = (latitudeDelta: number) => {
    const z = Math.log2(360 / Math.max(latitudeDelta, 0.0001));
    return Math.min(18, Math.max(3, Math.round(z)));
};

const purplePinIcon = L.divIcon({
    className: 'ramgos-picker-pin',
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#2196F3;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
});

const userDotIcon = L.divIcon({
    className: 'ramgos-user-dot',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#3B82F6;border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,0.3);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
});

interface DarkMapViewProps {
    style?: object;
    initialRegion?: Region;
    onPress?: (e: MapPressEvent) => void;
    onRegionChangeComplete?: (region: Region) => void;
    showsUserLocation?: boolean;
    forceDark?: boolean;
    children?: React.ReactNode;
}

const MapController = forwardRef<{ animateToRegion: (r: Region, d?: number) => void }, object>((_, ref) => {
    const map = useMap();
    useImperativeHandle(ref, () => ({
        animateToRegion: (region: Region) => {
            map.setView([region.latitude, region.longitude], regionToZoom(region.latitudeDelta), { animate: true });
        },
    }));
    return null;
});
MapController.displayName = 'MapController';

const MapEvents = ({
    onPress,
    onRegionChangeComplete,
}: {
    onPress?: DarkMapViewProps['onPress'];
    onRegionChangeComplete?: DarkMapViewProps['onRegionChangeComplete'];
}) => {
    const map = useMap();
    useMapEvents({
        click: (e) => {
            onPress?.({
                nativeEvent: { coordinate: { latitude: e.latlng.lat, longitude: e.latlng.lng } },
            });
        },
    });
    useEffect(() => {
        const emit = () => {
            const c = map.getCenter();
            const b = map.getBounds();
            onRegionChangeComplete?.({
                latitude: c.lat,
                longitude: c.lng,
                latitudeDelta: Math.abs(b.getNorth() - b.getSouth()),
                longitudeDelta: Math.abs(b.getEast() - b.getWest()),
            });
        };
        map.on('moveend', emit);
        return () => {
            map.off('moveend', emit);
        };
    }, [map, onRegionChangeComplete]);
    return null;
};

const UserLocationMarker = () => {
    const [pos, setPos] = useState<[number, number] | null>(null);
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (p) => setPos([p.coords.latitude, p.coords.longitude]),
            () => {},
            { enableHighAccuracy: false, timeout: 8000 },
        );
    }, []);
    if (!pos) return null;
    return <LMarker position={pos} icon={userDotIcon} />;
};

export const Marker = ({
    coordinate,
}: {
    coordinate: { latitude: number; longitude: number };
    children?: React.ReactNode;
}) => <LMarker position={[coordinate.latitude, coordinate.longitude]} icon={purplePinIcon} />;

export const Circle = ({
    center,
    radius,
}: {
    center: { latitude: number; longitude: number };
    radius: number;
}) => (
    <LCircle
        center={[center.latitude, center.longitude]}
        radius={radius}
        pathOptions={{ color: 'rgba(33, 150, 243, 0.5)', fillColor: 'rgba(33, 150, 243, 0.08)', weight: 2 }}
    />
);

export const Callout = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

const DarkMapView = forwardRef<{ animateToRegion: (r: Region, d?: number) => void }, DarkMapViewProps>(
    ({ style, initialRegion, onPress, onRegionChangeComplete, showsUserLocation, forceDark, children }, ref) => {
        const { colorScheme } = useTheme();
        const isDark = forceDark !== undefined ? forceDark : colorScheme === 'dark';
        const region = initialRegion ?? MAP_DEFAULTS.INITIAL_REGION;
        const innerRef = useRef<{ animateToRegion: (r: Region, d?: number) => void }>(null);

        useImperativeHandle(ref, () => ({
            animateToRegion: (r: Region, _d?: number) => innerRef.current?.animateToRegion(r),
        }));

        return (
            <View style={[{ flex: 1 }, style]}>
                <MapContainer
                    center={[region.latitude, region.longitude]}
                    zoom={regionToZoom(region.latitudeDelta)}
                    style={{ width: '100%', height: '100%', background: isDark ? '#0a0a0a' : '#f3f4f6' }}
                    zoomControl
                    attributionControl={false}
                    scrollWheelZoom
                    dragging
                >
                    <TileLayer url={isDark ? DARK_TILES : LIGHT_TILES} />
                    <TileLayer url={isDark ? DARK_LABELS : LIGHT_LABELS} />
                    <MapController ref={innerRef} />
                    <MapEvents onPress={onPress} onRegionChangeComplete={onRegionChangeComplete} />
                    {showsUserLocation && <UserLocationMarker />}
                    {children}
                </MapContainer>
            </View>
        );
    },
);

DarkMapView.displayName = 'DarkMapView';
export default DarkMapView;
