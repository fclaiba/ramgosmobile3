import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, ActivityIndicator } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useCart } from '../../contexts/CartContext';
import { useFavorites } from '../../hooks/useFavorites';
import { useToast } from '../../contexts/ToastContext';
import { Heart, ShoppingCart, ArrowRight, Crosshair, Minus, Plus, Bell, BellOff, Settings, X, Check } from 'lucide-react-native';
import Slider from '@react-native-community/slider';

// react-leaflet imports (web only)
import { MapContainer, TileLayer, Marker as LeafletMarker, Popup, Circle as LeafletCircle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { BlurView } from 'expo-blur';
import { Radius, colors } from '../../theme/tokens';
import { UNIFIED_CATEGORIES } from '../../config/UnifiedCategories';


// ponytail: inject leaflet CSS from CDN at runtime instead of importing the file
// (Metro can't handle CSS url() references to local images)
if (typeof document !== 'undefined' && !document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
}

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ponytail: Tile URLs — dark uses CartoDB dark_matter (no labels clutter), light uses CartoDB positron
const DARK_TILES = 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_nolabels/{z}/{x}/{y}{r}.png';
const DARK_LABELS = 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_only_labels/{z}/{x}/{y}{r}.png';
const LIGHT_TILES = 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}{r}.png';
const LIGHT_LABELS = 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_only_labels/{z}/{x}/{y}{r}.png';

const FALLBACK_IMAGE = 'https://placehold.co/300x300.png';

const getMarkerColor = (type: string) => {
    switch (type) {
        case 'product': return '#4FC3F7';
        case 'bono': return '#10B981';
        case 'event': return '#F59E0B';
        case 'service': return '#38BDF8';
        case 'business': return '#EC4899';
        default: return '#6B7280';
    }
};

// Custom marketplace marker: item image, thematic color, compact label
const createMarketplaceMarkerIcon = (item: any, isActive: boolean, isDark: boolean) => {
    const color = getMarkerColor(item.type);
    const size = isActive ? 48 : 36;
    const borderWidth = isActive ? 4 : 3;
    const innerSize = size - borderWidth * 2;
    const imageUrl = item.image || FALLBACK_IMAGE;
    const label = String(item.name || '').slice(0, 14);

    return L.divIcon({
        className: 'ramgos-marketplace-marker',
        html: `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
            ">
                <div style="
                    width: ${size}px;
                    height: ${size}px;
                    border-radius: 50%;
                    border: ${borderWidth}px solid ${color};
                    background: ${isDark ? '#09090B' : '#FAFAFA'};
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <img
                        src="${imageUrl}"
                        style="
                            width: ${innerSize}px;
                            height: ${innerSize}px;
                            border-radius: 50%;
                            object-fit: cover;
                            display: block;
                        "
                        alt=""
                        onerror="this.src='${FALLBACK_IMAGE}'"
                    />
                </div>
                <div style="
                    width: 0;
                    height: 0;
                    border-left: 6px solid transparent;
                    border-right: 6px solid transparent;
                    border-top: 8px solid ${color};
                    margin-top: -2px;
                "></div>
                <div style="
                    margin-top: 4px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    background: ${isDark ? 'rgba(17, 24, 39, 0.85)' : 'rgba(255, 255, 255, 0.92)'};
                    border: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
                    max-width: 96px;
                    text-align: center;
                ">
                    <span style="
                        font-size: 10px;
                        font-weight: 600;
                        color: ${isDark ? '#F9FAFB' : '#111827'};
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        display: block;
                    ">${label}</span>
                </div>
            </div>
        `,
        iconSize: [size, size + 24],
        iconAnchor: [size / 2, size + 12],
    });
};

// Component to update map center/zoom programmatically
const MapUpdater = ({ center, zoom }: { center: [number, number]; zoom: number }) => {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom, { animate: true });
    }, [center[0], center[1], zoom]);
    return null;
};

// Handle clicks to change the center
const MapClickHandler = ({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) => {
    useMapEvents({
        click: (e) => {
            onMapClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
};

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
    onRadiusChange?: (radius: any) => void;
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
    topInset,
    searchLocation,
    onSearchLocationChange,
    isCustomSearch,
    onRegionChangeComplete,
    onRadiusChange,
}) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { addItem } = useCart();
    const { toggleFavorite, isFavorite } = useFavorites();
    const { show } = useToast();

    const [activeItem, setActiveItem] = useState<any>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>({ lat: 40.7128, lng: -74.0060 });
    const [loading, setLoading] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [notificationDistance, setNotificationDistance] = useState(500); // meters
    const [isNotifConfigOpen, setIsNotifConfigOpen] = useState(false);
    const [notifTypes, setNotifTypes] = useState<string[]>(['product', 'service', 'event', 'business', 'bono']);
    const [notifCategories, setNotifCategories] = useState<string[]>([]);
    const mapRef = useRef<any>(null);

    // ponytail: browser geolocation API, no extra deps
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                },
                (err) => {
                    // Ignore error, fallback to Manhattan
                },
                { enableHighAccuracy: false, timeout: 5000 }
            );
        } else {
            setUserLocation({ lat: 40.7128, lng: -74.0060 });
            setLoading(false);
        }
    }, []);

    const center = searchLocation || userLocation || { lat: -34.6037, lng: -58.3816 };

    const handleMarkerClick = useCallback((item: any) => {
        setActiveItem(item);
    }, []);

    const handleToggleNotifications = () => {
        const next = !notificationsEnabled;
        setNotificationsEnabled(next);
        if (next) {
            show(`Notificaciones activadas: te avisaremos a ${notificationDistance}m de una oferta`, 'success');
        } else {
            show('Notificaciones de proximidad desactivadas', 'info');
        }
    };

    if (loading) {
        return (
            <View style={[s.container, { backgroundColor: isDark ? '#0a0a0a' : '#f9fafb' }]}>
                <ActivityIndicator size="large" color="#4FC3F7" />
                <Text style={{ color: colors(isDark).textMuted, marginTop: 12 }}>Cargando mapa...</Text>
            </View>
        );
    }

    return (
        <View style={[s.container, { backgroundColor: isDark ? '#0a0a0a' : '#f9fafb' }]}>
            <MapContainer
                ref={mapRef}
                center={[center.lat, center.lng]}
                zoom={13}
                style={{ width: '100%', height: '100%', background: isDark ? '#0a0a0a' : '#f3f4f6' }}
                zoomControl={false}
                attributionControl={false}
                whenReady={() => { /* Map ready */ }}
            >
                <MapUpdater center={[center.lat, center.lng]} zoom={13} />
                <MapClickHandler onMapClick={(lat, lng) => {
                    const newLoc = { lat, lng };
                    if (onSearchLocationChange) onSearchLocationChange(newLoc);
                    if (onRegionChangeComplete) onRegionChangeComplete({ latitude: lat, longitude: lng });
                }} />

                {/* Base tiles */}
                <TileLayer url={isDark ? DARK_TILES : LIGHT_TILES} />
                {/* Street labels on top */}
                <TileLayer url={isDark ? DARK_LABELS : LIGHT_LABELS} />

                {/* Radius circle */}
                <LeafletCircle
                    center={[center.lat, center.lng]}
                    radius={radius * 1000}
                    pathOptions={{
                        color: 'rgba(79, 195, 247, 0.5)',
                        fillColor: 'rgba(79, 195, 247, 0.08)',
                        weight: 2,
                    }}
                />

                {/* Center point */}
                <LeafletMarker
                    position={[center.lat, center.lng]}
                    icon={L.divIcon({
                        className: 'center-pin',
                        html: `<div style="
                            width: 16px; height: 16px; border-radius: 50%;
                            background: #4FC3F7; border: 3px solid white;
                            box-shadow: 0 0 0 4px rgba(79, 195, 247,0.3), 0 2px 8px rgba(0,0,0,0.3);
                        "></div>`,
                        iconSize: [16, 16],
                        iconAnchor: [8, 8],
                    })}
                />

                {/* Product markers */}
                {items.map((item) => {
                    if (!item.location?.lat || !item.location?.lng) return null;
                    const isActive = activeItem?.id === item.id;
                    return (
                        <LeafletMarker
                            key={item.id}
                            position={[item.location.lat, item.location.lng]}
                            icon={createMarketplaceMarkerIcon(item, isActive, isDark)}
                            eventHandlers={{ click: () => handleMarkerClick(item) }}
                        />
                    );
                })}
            </MapContainer>

            {/* Radius Slider (Compact Bottom-Center) */}
            <View style={[
                s.sliderPanel, 
                { 
                    bottom: (bottomInset || 0) + (activeItem ? 120 : 20),
                }
            ]}>
                <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={s.blurContainerCompact}>
                    <View style={s.sliderRowCompact}>
                        <Text style={[s.sliderLabelCompact, { color: colors(isDark).text }]}>
                            RADIO
                        </Text>
                        
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingHorizontal: 12 }}>
                            <TouchableOpacity
                                style={[s.zoomBtnCompact, { backgroundColor: colors(isDark).glass }]}
                                onPress={() => onRadiusChange && onRadiusChange(Math.max(1, radius - 1))}
                            >
                                <Minus size={12} color={isDark ? '#D1D5DB' : '#374151'} />
                            </TouchableOpacity>
                            
                            <Slider
                                style={{ flex: 1, width: '100%', minWidth: 80, height: 30, marginHorizontal: 8 }}
                                minimumValue={1}
                                maximumValue={50}
                                step={1}
                                value={radius}
                                onValueChange={onRadiusChange}
                                minimumTrackTintColor="#4FC3F7"
                                maximumTrackTintColor={isDark ? '#4B5563' : '#D1D5DB'}
                                thumbTintColor="#4FC3F7"
                            />

                            <TouchableOpacity
                                style={[s.zoomBtnCompact, { backgroundColor: colors(isDark).glass }]}
                                onPress={() => onRadiusChange && onRadiusChange(Math.min(50, radius + 1))}
                            >
                                <Plus size={12} color={isDark ? '#D1D5DB' : '#374151'} />
                            </TouchableOpacity>
                        </View>

                        <Text style={s.radiusBadgeTextCompact}>
                            {radius}km
                        </Text>
                    </View>
                </BlurView>
            </View>

            {/* Notification Toggle (Compact) */}
            <View style={[s.notifPanelCompact, { top: (topInset || 0) + 16, right: 16 }]}>
                <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={s.notifBlurCompact}>
                    <TouchableOpacity style={s.notifRowCompact} onPress={handleToggleNotifications}>
                        {notificationsEnabled
                            ? <Bell size={18} color="#4FC3F7" />
                            : <BellOff size={18} color={isDark ? '#6B7280' : '#9CA3AF'} />
                        }
                    </TouchableOpacity>
                    
                    {notificationsEnabled && (
                        <>
                            <View style={[s.notifDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)' }]} />
                            <TouchableOpacity 
                                style={[s.notifRowCompact, { paddingHorizontal: 4 }]} 
                                onPress={() => setIsNotifConfigOpen(true)}
                            >
                                <Settings size={18} color={isDark ? '#D1D5DB' : '#374151'} />
                            </TouchableOpacity>
                        </>
                    )}

                    {notificationsEnabled && (
                        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', marginLeft: 4 }}>
                            {[100, 500, 1000].map(d => (
                                <TouchableOpacity
                                    key={d}
                                    style={[s.distChipCompact, notificationDistance === d && s.distChipCompactActive]}
                                    onPress={() => {
                                        setNotificationDistance(d);
                                        show(`Alertas a ${d >= 1000 ? `${d / 1000}km` : `${d}m`}`, 'info');
                                    }}
                                >
                                    <Text style={[s.distChipTextCompact, notificationDistance === d && s.distChipTextCompactActive, { color: notificationDistance === d ? '#fff' : (isDark ? '#9CA3AF' : '#6B7280') }]}>
                                        {d >= 1000 ? '1km' : `${d}m`}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </BlurView>
            </View>

            {/* Notification Config Modal */}
            {isNotifConfigOpen && (
                <View style={[StyleSheet.absoluteFill, { zIndex: 10000, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.4)' }]}>
                    <BlurView intensity={90} tint={isDark ? 'dark' : 'light'} style={[s.notifConfigModal, { backgroundColor: isDark ? 'rgba(31,41,55,0.85)' : 'rgba(255,255,255,0.9)' }]}>
                        <View style={s.notifConfigHeader}>
                            <View>
                                <Text style={[s.notifConfigTitle, { color: colors(isDark).text }]}>Configurar Filtros</Text>
                                <Text style={[s.notifConfigSub, { color: colors(isDark).textMuted }]}>Alertas en mapa para:</Text>
                            </View>
                            <TouchableOpacity onPress={() => setIsNotifConfigOpen(false)} style={s.closeBtn}>
                                <X size={20} color={colors(isDark).textMuted} />
                            </TouchableOpacity>
                        </View>
                        
                        {/* Tipo de Unidad Comercial */}
                        <Text style={[s.notifSectionTitle, { color: colors(isDark).text }]}>Tipos de unidades</Text>
                        <View style={s.chipGroup}>
                            {['product', 'service', 'event', 'business', 'bono'].map(type => {
                                const isSelected = notifTypes.includes(type);
                                const label = type === 'product' ? 'Productos' : type === 'service' ? 'Servicios' : type === 'event' ? 'Eventos' : type === 'business' ? 'Negocios' : 'Bonos';
                                return (
                                    <TouchableOpacity 
                                        key={type} 
                                        style={[s.configChip, isSelected && s.configChipActive, { borderColor: isSelected ? '#4FC3F7' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') }]}
                                        onPress={() => {
                                            setNotifTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
                                        }}
                                    >
                                        {isSelected && <Check size={14} color="#fff" style={{ marginRight: 4 }} />}
                                        <Text style={[s.configChipText, isSelected && { color: '#fff', fontWeight: 'bold' }]}>{label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Categorías Internas */}
                        {notifTypes.length > 0 && (
                            <View style={{ marginTop: 20 }}>
                                <Text style={[s.notifSectionTitle, { color: colors(isDark).text }]}>Categorías internas</Text>
                                <View style={s.chipGroup}>
                                    {Array.from(new Set(notifTypes.flatMap(t => (UNIFIED_CATEGORIES as any)[t] || []))).sort().map(cat => {
                                        const isSelected = notifCategories.includes(cat as string);
                                        return (
                                            <TouchableOpacity 
                                                key={cat as string} 
                                                style={[s.configChip, isSelected && s.configChipActive, { borderColor: isSelected ? '#4FC3F7' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') }]}
                                                onPress={() => {
                                                    setNotifCategories(prev => prev.includes(cat as string) ? prev.filter(c => c !== cat) : [...prev, cat as string]);
                                                }}
                                            >
                                                {isSelected && <Check size={14} color="#fff" style={{ marginRight: 4 }} />}
                                                <Text style={[s.configChipText, isSelected && { color: '#fff', fontWeight: 'bold' }]}>{cat as string}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        )}
                        
                    </BlurView>
                </View>
            )}

            {/* Recenter Button */}
            {userLocation && (
                <TouchableOpacity
                    style={[s.recenterBtn, { 
                        backgroundColor: isDark ? 'rgba(17,24,39,0.92)' : 'rgba(255,255,255,0.95)',
                        top: (topInset || 0) + 16
                    }]}
                    onPress={() => {
                        if (onSearchLocationChange) onSearchLocationChange(userLocation);
                        if (onRegionChangeComplete) onRegionChangeComplete({ latitude: userLocation.lat, longitude: userLocation.lng });
                        mapRef.current?.setView([userLocation.lat, userLocation.lng], 13, { animate: true });
                    }}
                >
                    <Crosshair size={20} color="#4FC3F7" />
                </TouchableOpacity>
            )}

            {/* Detail Card (bottom bar when item selected) */}
            {activeItem && (
                <View style={[s.detailCard, { bottom: (bottomInset || 0) + 16 }]}>
                    <BlurView intensity={70} tint={isDark ? 'dark' : 'light'} style={s.blurContainerRow}>
                        <TouchableOpacity
                            style={s.detailMain}
                            onPress={() => onItemClick(activeItem)}
                            activeOpacity={0.7}
                        >
                            <Image source={{ uri: activeItem.image }} style={s.detailImg} />
                            <View style={s.detailInfo}>
                                <Text style={[s.detailTitle, { color: colors(isDark).text }]} numberOfLines={1}>
                                    {activeItem.name}
                                </Text>
                                <Text style={[s.detailSub, { color: colors(isDark).textMuted }]}>
                                    {activeItem.category} • {activeItem.distance}km
                                </Text>
                                <View style={s.priceTag}>
                                    <Text style={s.priceText}>${activeItem.price}</Text>
                                </View>
                            </View>
                        </TouchableOpacity>

                        <View style={s.detailActions}>
                            {/* Save */}
                            <TouchableOpacity
                                style={[s.actionBtn, { backgroundColor: colors(isDark).glass }]}
                                onPress={() => toggleFavorite(activeItem)}
                            >
                                <Heart
                                    size={18}
                                    color={isFavorite(activeItem.id) ? '#EF4444' : (isDark ? '#D1D5DB' : '#6B7280')}
                                    fill={isFavorite(activeItem.id) ? '#EF4444' : 'transparent'}
                                />
                            </TouchableOpacity>

                            {/* Cart */}
                            {activeItem.type === 'product' && (
                                <TouchableOpacity
                                    style={[s.actionBtn, { backgroundColor: '#4FC3F7' }]}
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

                            {/* Detail */}
                            <TouchableOpacity
                                style={[s.actionBtn, { backgroundColor: colors(isDark).glass }]}
                                onPress={() => onItemClick(activeItem)}
                            >
                                <ArrowRight size={18} color={isDark ? '#D1D5DB' : '#6B7280'} />
                            </TouchableOpacity>
                        </View>
                    </BlurView>
                </View>
            )}
        </View>
    );
};

export { MapViewComponent as MapView };

// ─── Styles ──────────────────────────────────────────────
const s = StyleSheet.create({
    container: {
        flex: 1,
        position: 'relative' as any,
    },

    // Radius slider panel
    sliderPanel: {
        position: 'absolute' as any,
        alignSelf: 'center',
        width: 320,
        borderRadius: Radius.xl,
        overflow: 'hidden',
        zIndex: 9999,
        ...Platform.select({
            web: { boxShadow: '0 4px 20px rgba(0,0,0,0.12)' },
            default: { elevation: 8 },
        }),
    },
    blurContainerCompact: {
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    sliderRowCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    zoomBtnCompact: {
        width: 24,
        height: 24,
        borderRadius: Radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sliderLabelCompact: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    radiusBadgeTextCompact: {
        fontSize: 13,
        fontWeight: '800',
        color: '#4FC3F7',
    },

    // Notification panel
    notifPanelCompact: {
        position: 'absolute' as any,
        borderRadius: Radius.xl,
        overflow: 'hidden',
        zIndex: 9999,
        ...Platform.select({
            web: { boxShadow: '0 4px 20px rgba(0,0,0,0.12)' },
            default: { elevation: 8 },
        }),
    },
    notifBlurCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
    },
    notifRowCompact: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    notifDivider: {
        width: 1,
        height: 16,
        marginHorizontal: 4,
    },
    distChipCompact: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: Radius.md,
        backgroundColor: 'transparent',
    },
    distChipCompactActive: {
        backgroundColor: '#4FC3F7',
    },
    distChipTextCompact: {
        fontSize: 12,
        fontWeight: '700',
    },
    distChipTextCompactActive: {
        color: '#fff',
    },

    // Recenter
    recenterBtn: {
        position: 'absolute' as any,
        top: 16,
        left: 16,
        width: 44,
        height: 44,
        borderRadius: Radius.xl,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        ...Platform.select({
            web: { boxShadow: '0 2px 12px rgba(0,0,0,0.15)' },
            default: { elevation: 6 },
        }),
    },

    // Detail card
    detailCard: {
        position: 'absolute' as any,
        left: 16,
        right: 16,
        borderRadius: Radius.xl,
        overflow: 'hidden',
        zIndex: 9999,
        ...Platform.select({
            web: { boxShadow: '0 8px 30px rgba(0,0,0,0.18)' },
            default: { elevation: 10 },
        }),
    },
    blurContainerRow: {
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
    },
    detailMain: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    detailImg: {
        width: 52,
        height: 52,
        borderRadius: Radius.md,
    },
    detailInfo: {
        flex: 1,
    },
    detailTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    detailSub: {
        fontSize: 12,
        marginTop: 2,
    },
    priceTag: {
        backgroundColor: '#10B981',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: Radius.sm,
        marginTop: 4,
    },
    priceText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '800',
    },
    detailActions: {
        flexDirection: 'row',
        gap: 8,
        marginLeft: 8,
    },
    actionBtn: {
        width: 40,
        height: 40,
        borderRadius: Radius.xl,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Notification Config Modal
    notifConfigModal: {
        width: '100%',
        maxWidth: 480,
        maxHeight: '80%',
        borderRadius: Radius.xl,
        padding: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        ...Platform.select({
            web: { boxShadow: '0 16px 40px rgba(0,0,0,0.25)' }
        })
    },
    notifConfigHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24
    },
    notifConfigTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 4,
        letterSpacing: -0.5
    },
    notifConfigSub: {
        fontSize: 14
    },
    closeBtn: {
        padding: 8,
        backgroundColor: 'rgba(150,150,150,0.1)',
        borderRadius: Radius.full
    },
    notifSectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 12,
        letterSpacing: -0.3
    },
    chipGroup: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    configChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: Radius.full,
        borderWidth: 1,
        backgroundColor: 'rgba(150,150,150,0.05)'
    },
    configChipActive: {
        backgroundColor: '#4FC3F7'
    },
    configChipText: {
        fontSize: 13,
        color: '#6B7280',
        fontWeight: '500'
    },
});
