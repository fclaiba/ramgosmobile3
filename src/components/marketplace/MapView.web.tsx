import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Platform } from 'react-native';
import { Map, Marker, Overlay } from 'pigeon-maps';
import {
    MapPin,
    ShoppingCart,
    Tag,
    Ticket,
    Plus as PlusIcon,
    Minus,
    Target,
    Locate,
    ChevronUp,
    ChevronDown,
    Move,
    MapPinned,
    Crosshair,
    Star,
    Calendar,
    X,
    Layers,
    Bookmark
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ImageWithFallback } from '../figma/ImageWithFallback'; // Assuming this works on web or has web fallback
import { useCart } from '../../contexts/CartContext';
import { useFavorites } from '../../contexts/FavoritesContext';
import { useTheme } from '../../contexts/ThemeContext';

// Types
interface MapItem {
    id: number;
    type: 'product' | 'bono' | 'event';
    name: string;
    price: number;
    originalPrice?: number;
    discount?: number;
    rating?: number;
    reviews?: number;
    date?: string;
    time?: string;
    description?: string;
    validUntil?: string;
    image: string;
    category: string;
    location: { lat: number; lng: number; name: string };
    distance?: number;
    attendees?: number;
}

interface MapViewProps {
    items: MapItem[];
    radius: number;
    onItemClick: (item: MapItem) => void;
    searchLocation?: { lat: number; lng: number };
    onSearchLocationChange?: (loc: { lat: number; lng: number }) => void;
    isCustomSearch?: boolean;
    onToggleCustomSearch?: () => void;
}

const metersPerPixel = (latitude: number, zoom: number) => {
    const latRad = (latitude * Math.PI) / 180;
    return (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom);
};

// Custom Marker Component
const CustomMarker = ({ type, isSelected, emoji, onClick }: any) => {
    const size = isSelected ? 50 : 40;

    // Gradient colors mapping
    const getColors = (): readonly [string, string, ...string[]] => {
        switch (type) {
            case 'product': return ['#3B82F6', '#2563EB'];
            case 'bono': return ['#8B5CF6', '#7C3AED'];
            case 'event': return ['#F97316', '#EA580C'];
            default: return ['#3B82F6', '#2563EB'];
        }
    };

    return (
        <TouchableOpacity onPress={onClick} activeOpacity={0.8} style={{
            width: size,
            height: size,
            transform: [{ translateX: -size / 2 }, { translateY: -size / 2 }],
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: isSelected ? 20 : 10
        }}>
            <LinearGradient
                colors={getColors()}
                style={[
                    styles.markerBody,
                    { width: size, height: size, borderRadius: size / 2 },
                    isSelected && styles.selectedMarker
                ]}
            >
                <Text style={{ fontSize: size * 0.45 }}>{emoji}</Text>
            </LinearGradient>

            {/* Shadow simulation */}
            <View style={styles.markerShadow} />
        </TouchableOpacity>
    );
};

export const MapView = ({
    items,
    radius,
    onItemClick,
    searchLocation,
    onSearchLocationChange,
    isCustomSearch = false,
    onToggleCustomSearch,
}: MapViewProps) => {
    // State
    const [zoom, setZoom] = useState(14);
    const lastZoomRef = useRef<number>(14);
    const [selectedItem, setSelectedItem] = useState<MapItem | null>(null);
    const [showProductsList, setShowProductsList] = useState(false);

    const { addItem } = useCart();
    const { isFavorite, toggleFavorite } = useFavorites();
    const { theme, colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    // Dynamic styles for the component below, but we also pass isDark to getStyles if needed or use inline.
    // Since styles are generally static, we can use conditional styling in render.

    const searchCenter = useMemo<[number, number]>(() => {
        // Reference point for the radius circle: GPS or Manual.
        if (isCustomSearch && searchLocation) return [searchLocation.lat, searchLocation.lng];
        // Fallback (shouldn't happen if parent always provides a searchLocation)
        return [-34.603722, -58.381592];
    }, [isCustomSearch, searchLocation]);

    const radiusPx = useMemo(() => {
        const mpp = metersPerPixel(searchCenter[0], zoom);
        const px = (radius * 1000) / (mpp || 1);
        return Math.max(10, Math.min(2000, px));
    }, [radius, searchCenter, zoom]);

    // Helpers
    const getMarkerEmoji = (type: string) => {
        switch (type) {
            case 'product': return '🛍️';
            case 'bono': return '🎁';
            case 'event': return '🎫';
            default: return '📍';
        }
    };

    const getItemIcon = (type: string) => {
        switch (type) {
            case 'product': return ShoppingCart;
            case 'bono': return Tag;
            case 'event': return Ticket;
            default: return ShoppingCart;
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: isDark ? '#1F2937' : '#f3f4f6' }]}>
            {/* Map */}
            <View style={styles.mapContainer}>
                <Map
                    height={600}
                    center={searchCenter}
                    zoom={zoom}
                    onClick={({ latLng }: any) => {
                        const [lat, lng] = latLng || [];
                        if (typeof lat !== 'number' || typeof lng !== 'number') return;
                        onSearchLocationChange?.({ lat, lng });
                    }}
                    onBoundsChanged={({ center, zoom }: any) => {
                        setZoom(zoom);
                        const zoomChanged = lastZoomRef.current !== zoom;
                        lastZoomRef.current = zoom;

                        // IMPORTANT: do NOT update the center point during zoom.
                        // Otherwise it can "drift" slightly and the radius no longer measures from the same exact coord.
                        if (zoomChanged) return;

                        // Keep the search center visually centered: map pan updates the center point.
                        const [lat, lng] = center || [];
                        if (typeof lat !== 'number' || typeof lng !== 'number') return;
                        // avoid noisy updates when we're already at the same coord
                        if (Math.abs(lat - searchCenter[0]) < 1e-7 && Math.abs(lng - searchCenter[1]) < 1e-7) return;
                        onSearchLocationChange?.({ lat, lng });
                    }}
                >
                    {/* Radius circle around the reference point (GPS or Manual) */}
                    <Overlay anchor={searchCenter} offset={[0, 0]}>
                        <View
                            pointerEvents="none"
                            style={[
                                styles.radiusCircle,
                                {
                                    width: radiusPx * 2,
                                    height: radiusPx * 2,
                                    borderRadius: radiusPx,
                                    marginLeft: -radiusPx,
                                    marginTop: -radiusPx,
                                    borderColor: isDark ? 'rgba(139, 92, 246, 0.9)' : 'rgba(124, 58, 237, 0.9)',
                                    backgroundColor: isDark ? 'rgba(139, 92, 246, 0.25)' : 'rgba(124, 58, 237, 0.15)',
                                },
                            ]}
                        />
                    </Overlay>

                    {/* Reference point (center of the radius) */}
                    <Marker anchor={searchCenter} payload="center">
                        <View style={styles.userMarkerOuter}>
                            <View style={styles.userMarkerInner} />
                        </View>
                    </Marker>

                    {/* Items Markers */}
                    {items.map(item => (
                        <Marker
                            key={item.id}
                            anchor={[item.location.lat, item.location.lng]}
                            payload={item.id}
                            onClick={() => {
                                setSelectedItem(item);
                                onSearchLocationChange?.({ lat: item.location.lat, lng: item.location.lng });
                            }}
                        >
                            <CustomMarker
                                type={item.type}
                                isSelected={selectedItem?.id === item.id}
                                emoji={getMarkerEmoji(item.type)}
                                onClick={() => {
                                    setSelectedItem(item);
                                    onSearchLocationChange?.({ lat: item.location.lat, lng: item.location.lng });
                                }}
                            />
                        </Marker>
                    ))}

                    {/* Overlay for Selected Item (Popup) */}
                    {selectedItem && (
                        <Overlay anchor={[selectedItem.location.lat, selectedItem.location.lng]} offset={[0, 80]}>
                            <View style={[styles.popupContainer, { backgroundColor: isDark ? '#374151' : 'white' }]}>
                                <View style={styles.popupHeader}>
                                    <Text style={[styles.popupTitle, { color: isDark ? 'white' : '#1F2937' }]} numberOfLines={1}>{selectedItem.name}</Text>
                                    <TouchableOpacity onPress={() => setSelectedItem(null)}>
                                        <X size={16} color={isDark ? '#9CA3AF' : '#666'} />
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.popupPrice}>${selectedItem.price}</Text>
                                <TouchableOpacity
                                    style={[styles.popupBtn, { backgroundColor: isDark ? '#111827' : '#1F2937' }]}
                                    onPress={() => onItemClick(selectedItem)}
                                >
                                    <Text style={styles.popupBtnText}>Ver Detalle</Text>
                                </TouchableOpacity>
                            </View>
                        </Overlay>
                    )}
                </Map>

                {/* Controls Overlay */}
                <View style={styles.controlsContainer}>
                    <TouchableOpacity style={[styles.controlBtn, isDark && { backgroundColor: '#374151' }]} onPress={() => setZoom(z => Math.min(z + 1, 18))}>
                        <PlusIcon size={20} color={isDark ? '#D1D5DB' : '#333'} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.controlBtn, isDark && { backgroundColor: '#374151' }]} onPress={() => setZoom(z => Math.max(z - 1, 10))}>
                        <Minus size={20} color={isDark ? '#D1D5DB' : '#333'} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.controlBtn, styles.primaryControlBtn]}
                        onPress={() => {
                            // Center map view on the current search center.
                            onSearchLocationChange?.({ lat: searchCenter[0], lng: searchCenter[1] });
                        }}
                    >
                        <Locate size={20} color="#fff" />
                    </TouchableOpacity>
                </View>

                {/* Top Info Badge */}
                <View style={styles.topBadgeContainer}>
                    <View style={[styles.glassBadge, isDark && { backgroundColor: 'rgba(31, 41, 55, 0.85)' }]}>
                        <MapPin size={14} color="#7C3AED" />
                        <Text style={[styles.badgeText, isDark && { color: 'white' }]}>{items.length} resultados</Text>
                    </View>
                </View>

                {/* Bottom Toggle */}
                <View style={styles.bottomContainer}>
                    <TouchableOpacity
                        style={[styles.listToggleBtn, isDark && { backgroundColor: '#374151' }]}
                        onPress={() => setShowProductsList(!showProductsList)}
                    >
                        <Text style={[styles.listToggleText, isDark && { color: 'white' }]}>
                            {`Ver lista (${items.length})`}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Vertical List under map */}
            {showProductsList && (
                <View style={[styles.listContainer, isDark && { backgroundColor: '#1F2937', borderTopColor: '#374151' }]}>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listScroll}>
                        {items.map(item => {
                            const Icon = getItemIcon(item.type);
                            const saved = isFavorite(item.id);
                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    style={[styles.listRow, isDark && { backgroundColor: '#374151', borderColor: '#4B5563' }]}
                                    onPress={() => {
                                        setSelectedItem(item);
                                        onItemClick(item);
                                    }}
                                >
                                    <ImageWithFallback src={item.image} style={[styles.rowImage, isDark && { backgroundColor: '#4B5563' }]} />
                                    <View style={styles.rowContent}>
                                        <Text style={[styles.rowTitle, isDark && { color: 'white' }]} numberOfLines={1}>{item.name}</Text>
                                        <Text style={[styles.rowMeta, isDark && { color: '#9CA3AF' }]} numberOfLines={1}>{item.category} • {item.distance ?? '-'}km</Text>
                                        <Text style={styles.rowPrice}>${item.price}</Text>
                                    </View>
                                    <View style={styles.rowActions}>
                                        <TouchableOpacity
                                            style={[styles.iconBtn, isDark && { backgroundColor: '#4B5563', borderColor: '#6B7280' }, saved ? styles.iconBtnActive : null]}
                                            onPress={(e) => {
                                                e.stopPropagation();
                                                toggleFavorite(item);
                                            }}
                                            accessibilityLabel="Guardar"
                                        >
                                            <Bookmark size={14} color={saved ? '#7C3AED' : '#9CA3AF'} fill={saved ? '#7C3AED' : 'transparent'} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.iconBtn, styles.iconBtnPrimary, isDark && { backgroundColor: '#4B5563', borderColor: '#6B7280' }]}
                                            onPress={(e) => {
                                                e.stopPropagation();
                                                addItem({
                                                    id: item.id,
                                                    name: item.name,
                                                    price: item.price,
                                                    image: item.image || 'https://via.placeholder.com/150',
                                                    type: item.type,
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
                            )
                        })}
                    </ScrollView>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f3f4f6',
        borderRadius: 16,
        overflow: 'hidden',
        height: '100%',
        minHeight: 600,
    },
    mapContainer: {
        flex: 1,
        position: 'relative',
    },

    // Markers
    markerBody: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: '#fff',
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
    },
    selectedMarker: {
        borderColor: '#EDE9FE', // Light violet ring
        borderWidth: 4,
        transform: [{ scale: 1.1 }],
    },
    markerShadow: {
        position: 'absolute',
        bottom: -5,
        width: 20,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    userMarkerOuter: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(59, 130, 246, 0.3)',
        alignItems: 'center',
        justifyContent: 'center',
        // Pigeon positions the marker at the anchor using the element's top-left corner.
        // Use a percentage translate to keep the dot perfectly centered at any zoom / size.
        ...(Platform.select({
            web: {
                transform: 'translate(-50%, -50%)',
            } as any,
            default: {
                transform: [{ translateX: -12 }, { translateY: -12 }],
            },
        }) as any),
    },
    userMarkerInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#3B82F6',
        borderWidth: 2,
        borderColor: '#fff'
    },

    // Radius circle (web)
    radiusCircle: {
        borderWidth: 2,
        borderColor: 'rgba(124, 58, 237, 0.9)',
        backgroundColor: 'rgba(124, 58, 237, 0.15)',
    },

    // Popup
    popupContainer: {
        width: 200,
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 12,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 10,
        // Web specific
        ...Platform.select({
            web: {
                filter: 'drop-shadow(0px 10px 15px rgba(0,0,0,0.1))',
                transform: 'translate(-50%, -100%)', // Center overlay above marker
                marginTop: -10
            } as any
        })
    },
    popupHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    popupTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#1F2937',
        flex: 1,
        marginRight: 8,
    },
    popupPrice: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#7C3AED',
        marginBottom: 8,
    },
    popupBtn: {
        backgroundColor: '#1F2937',
        paddingVertical: 6,
        borderRadius: 6,
        alignItems: 'center',
    },
    popupBtnText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '500',
    },

    // Controls
    controlsContainer: {
        position: 'absolute',
        right: 16,
        top: '50%',
        transform: [{ translateY: -60 }],
        gap: 8,
    },
    controlBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.9)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        // Web specific backdrop filter
        ...Platform.select({
            web: {
                backdropFilter: 'blur(10px)'
            } as any
        })
    },
    primaryControlBtn: {
        backgroundColor: '#7C3AED',
    },

    // Top Badge
    topBadgeContainer: {
        position: 'absolute',
        top: 16,
        left: 16,
    },
    glassBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.85)',
        gap: 6,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        ...Platform.select({
            web: {
                backdropFilter: 'blur(8px)'
            } as any
        })
    },
    badgeText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#1F2937',
    },

    // Bottom Toggle
    bottomContainer: {
        position: 'absolute',
        bottom: 24,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    listToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
        gap: 8,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    listToggleText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#374151',
    },

    // List (under map)
    listContainer: {
        maxHeight: 320,
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    listScroll: {
        padding: 16,
        gap: 12,
    },
    listRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        padding: 12,
        gap: 12,
    },
    rowImage: {
        width: 56,
        height: 56,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
    },
    rowContent: {
        flex: 1,
    },
    rowTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 2,
    },
    rowMeta: {
        fontSize: 11,
        color: '#6B7280',
        marginBottom: 4,
    },
    rowPrice: {
        fontSize: 13,
        fontWeight: '800',
        color: '#7C3AED',
    },
    rowActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    iconBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: '#F9FAFB',
    },
    iconBtnActive: {
        borderColor: '#EDE9FE',
        backgroundColor: '#F5F3FF',
    },
    iconBtnPrimary: {
        borderColor: '#EDE9FE',
        backgroundColor: '#F5F3FF',
    },
});
