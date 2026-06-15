import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Platform, useWindowDimensions, Animated, TextInput, PanResponder, Modal, Switch
} from 'react-native';
import { Map, Marker, Overlay } from 'pigeon-maps';
import {
    MapPin, ShoppingCart, Tag, Ticket, Plus as PlusIcon, Minus,
    Locate, X, Bookmark, List as ListIcon, ChevronUp, Navigation,
    Bell, Check
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { useCart } from '../../contexts/CartContext';
import { useFavorites } from '../../contexts/FavoritesContext';
import { useTheme } from '../../contexts/ThemeContext';

// ─── Types ───────────────────────────────────────────────────────────────────
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
    bottomInset?: number;
    topInset?: number;
    onRadiusChange?: (r: number) => void;
    [key: string]: any;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const metersPerPixel = (latitude: number, zoom: number) => {
    const latRad = (latitude * Math.PI) / 180;
    return (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom);
};

const clampRadius = (val: number) => Math.max(0.1, Math.min(50, Math.round(val * 10) / 10));

// ─── Custom Marker ───────────────────────────────────────────────────────────
const ItemMarker = React.memo(({ type, isSelected, onClick }: {
    type: string; isSelected: boolean; onClick: () => void;
}) => {
    const size = isSelected ? 44 : 36;
    const emoji = type === 'product' ? '🛍️' : type === 'bono' ? '🎁' : type === 'event' ? '🎫' : '📍';

    const colors: readonly [string, string, ...string[]] =
        type === 'product' ? ['#3B82F6', '#1D4ED8'] :
        type === 'bono' ? ['#8B5CF6', '#6D28D9'] :
        type === 'event' ? ['#F97316', '#C2410C'] :
        ['#3B82F6', '#1D4ED8'];

    return (
        <View pointerEvents="auto">
            <TouchableOpacity
                onPress={onClick}
                activeOpacity={0.8}
                style={[
                    s.markerTouch,
                    { width: size, height: size },
                    Platform.select({
                        web: { transform: `translate(-${size / 2}px, -${size / 2}px)` } as any,
                        default: { transform: [{ translateX: -size / 2 }, { translateY: -size / 2 }] },
                    }),
                ]}
            >
                <LinearGradient
                    colors={colors}
                    style={[s.markerBody, { width: size, height: size, borderRadius: size / 2 }, isSelected && s.markerSelected]}
                >
                    <Text style={{ fontSize: size * 0.4 }}>{emoji}</Text>
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );
});

// ─── Slider component (with PanResponder) ────────────────────────────────────
const RadiusSlider = ({ value, onChange, isDark }: { value: number; onChange: (v: number) => void; isDark: boolean }) => {
    const trackWidthRef = useRef<number>(200);
    const startValueRef = useRef<number>(value);

    // Map value 0.1-50 to 0-1 on a logarithmic scale
    const toSlider = (v: number) => Math.log(clampRadius(v) / 0.1) / Math.log(50 / 0.1);
    const fromSlider = (s: number) => clampRadius(0.1 * Math.pow(50 / 0.1, s));

    const sliderPos = toSlider(value);
    const thumbLeft = sliderPos * trackWidthRef.current;

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                startValueRef.current = toSlider(value);
            },
            onPanResponderMove: (_, gestureState) => {
                const ratioDelta = gestureState.dx / trackWidthRef.current;
                const newRatio = Math.max(0, Math.min(1, startValueRef.current + ratioDelta));
                onChange(fromSlider(newRatio));
            },
            onPanResponderRelease: () => { },
        })
    ).current;

    const handlePressTrack = (e: any) => {
        const nativeEvent = e.nativeEvent;
        if (!nativeEvent) return;
        const x = nativeEvent.locationX ?? nativeEvent.offsetX ?? 0;
        const ratio = Math.max(0, Math.min(1, x / trackWidthRef.current));
        onChange(fromSlider(ratio));
    };

    return (
        <View style={s.sliderContainer}>
            <TouchableOpacity
                activeOpacity={1}
                onPress={handlePressTrack}
                style={s.sliderTrackWrap}
            >
                <View
                    onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
                    style={[s.sliderTrack, isDark && { backgroundColor: '#374151' }]}
                >
                    <View style={[s.sliderFill, { width: `${sliderPos * 100}%` }]} />
                    <View
                        {...panResponder.panHandlers}
                        style={[s.sliderThumb, { left: thumbLeft - 14 }]}
                    >
                        <View style={s.sliderThumbInner} />
                    </View>
                </View>
            </TouchableOpacity>
        </View>
    );
};

// ─── Main Component ──────────────────────────────────────────────────────────
export const MapView = ({
    items,
    radius,
    onItemClick,
    searchLocation,
    onSearchLocationChange,
    isCustomSearch = false,
    bottomInset = 0,
    topInset = 0,
    onRadiusChange,
}: MapViewProps) => {
    const [zoom, setZoom] = useState(14);
    const lastZoomRef = useRef<number>(14);
    const [selectedItem, setSelectedItem] = useState<MapItem | null>(null);
    const [showList, setShowList] = useState(false);
    const [showAlertsMenu, setShowAlertsMenu] = useState(false);
    
    // Radius input state: only updates component state when not dragging to prevent jank
    const [radiusInput, setRadiusInput] = useState(String(radius));
    useEffect(() => {
        setRadiusInput(String(radius));
    }, [radius]);

    const [alertsConfig, setAlertsConfig] = useState({
        enabled: false,
        products: true,
        businesses: true,
        events: false
    });

    const windowDims = useWindowDimensions();
    const listAnim = useRef(new Animated.Value(0)).current;
    
    // Simulated Alert State
    const [simulatedAlert, setSimulatedAlert] = useState<MapItem | null>(null);
    const alertAnim = useRef(new Animated.Value(0)).current;

    const { addItem } = useCart();
    const { isFavorite, toggleFavorite } = useFavorites();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    // ── Simulation Effect ────────────────────────────────────────────────────
    useEffect(() => {
        if (alertsConfig.enabled && items.length > 0) {
            // Wait 1.5s after enabling or changing radius to simulate finding a deal
            const timer = setTimeout(() => {
                const randomItem = items[Math.floor(Math.random() * items.length)];
                setSimulatedAlert(randomItem);
                
                Animated.spring(alertAnim, {
                    toValue: 1,
                    useNativeDriver: false,
                    tension: 60,
                    friction: 10
                }).start();

                // Auto hide after 6 seconds
                setTimeout(() => {
                    Animated.timing(alertAnim, {
                        toValue: 0,
                        duration: 300,
                        useNativeDriver: false
                    }).start(() => setSimulatedAlert(null));
                }, 6000);

            }, 1500);

            return () => clearTimeout(timer);
        } else {
            setSimulatedAlert(null);
            alertAnim.setValue(0);
        }
    }, [alertsConfig.enabled, radius, items]);

    // ── Derived ──────────────────────────────────────────────────────────────
    const searchCenter = useMemo<[number, number]>(() => {
        if (isCustomSearch && searchLocation) return [searchLocation.lat, searchLocation.lng];
        return [-34.603722, -58.381592];
    }, [isCustomSearch, searchLocation]);

    const radiusPx = useMemo(() => {
        const mpp = metersPerPixel(searchCenter[0], zoom);
        const px = (radius * 1000) / (mpp || 1);
        return Math.max(10, Math.min(2000, px));
    }, [radius, searchCenter, zoom]);

    // ── List animation ───────────────────────────────────────────────────────
    const toggleList = useCallback((show: boolean) => {
        setShowList(show);
        Animated.spring(listAnim, {
            toValue: show ? 1 : 0,
            useNativeDriver: false,
            tension: 65,
            friction: 11,
        }).start();
    }, [listAnim]);

    const listTranslateY = listAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [600, 0],
    });

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleRadiusInputSubmit = useCallback(() => {
        const parsed = parseFloat(radiusInput.replace(',', '.'));
        if (!isNaN(parsed) && parsed > 0) {
            const clamped = clampRadius(parsed);
            onRadiusChange?.(clamped);
            setRadiusInput(String(clamped));
        } else {
            setRadiusInput(String(radius));
        }
    }, [radiusInput, radius, onRadiusChange]);

    const handleSliderChange = useCallback((val: number) => {
        onRadiusChange?.(val);
    }, [onRadiusChange]);

    // ── Safe zones ───────────────────────────────────────────────────────────
    const CONTROL_BAR_HEIGHT = 120; // Calculated exact height of control bar to prevent overflow
    const safeTop = topInset + 8;
    const zoomCenter = (topInset + (windowDims.height - bottomInset - CONTROL_BAR_HEIGHT)) / 2;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <View style={[s.root, isDark && { backgroundColor: '#111827' }, { paddingBottom: bottomInset }]}>
            {/* ═══ MAP AREA ═══ */}
            <View style={s.mapArea}>
                <Map
                    height={windowDims.height - bottomInset - CONTROL_BAR_HEIGHT}
                    width={windowDims.width}
                    center={searchCenter}
                    zoom={zoom}
                    onClick={({ latLng }: any) => {
                        const [lat, lng] = latLng || [];
                        if (typeof lat !== 'number' || typeof lng !== 'number') return;
                        setSelectedItem(null);
                        onSearchLocationChange?.({ lat, lng });
                    }}
                    onBoundsChanged={({ center, zoom: newZoom }: any) => {
                        setZoom(newZoom);
                        if (lastZoomRef.current !== newZoom) {
                            lastZoomRef.current = newZoom;
                            return;
                        }
                        const [lat, lng] = center || [];
                        if (typeof lat !== 'number' || typeof lng !== 'number') return;
                        if (Math.abs(lat - searchCenter[0]) < 1e-4 && Math.abs(lng - searchCenter[1]) < 1e-4) return;
                        onSearchLocationChange?.({ lat, lng });
                    }}
                >
                    {/* Radius circle */}
                    <Overlay anchor={searchCenter} offset={[0, 0]}>
                        <View
                            pointerEvents="none"
                            style={{
                                width: radiusPx * 2, height: radiusPx * 2, borderRadius: radiusPx,
                                marginLeft: -radiusPx, marginTop: -radiusPx,
                                borderWidth: 2, borderColor: alertsConfig.enabled ? 'rgba(16,185,129,0.5)' : (isDark ? 'rgba(139,92,246,0.5)' : 'rgba(124,58,237,0.4)'),
                                backgroundColor: alertsConfig.enabled ? 'rgba(16,185,129,0.1)' : (isDark ? 'rgba(139,92,246,0.1)' : 'rgba(124,58,237,0.08)'),
                            }}
                        />
                    </Overlay>

                    {/* Center dot */}
                    <Overlay anchor={searchCenter} offset={[0, 0]}>
                        <View pointerEvents="none" style={s.centerDotOuter}>
                            <View style={[s.centerDotInner, alertsConfig.enabled && { backgroundColor: '#10B981', shadowColor: '#10B981' }]} />
                        </View>
                    </Overlay>

                    {/* Item markers */}
                    {items.map(item => (
                        <Marker key={item.id} anchor={[item.location.lat, item.location.lng]} payload={item.id}>
                            <ItemMarker
                                type={item.type}
                                isSelected={selectedItem?.id === item.id}
                                onClick={() => setSelectedItem(item)}
                            />
                        </Marker>
                    ))}

                    {/* Popup */}
                    {selectedItem && (
                        <Overlay anchor={[selectedItem.location.lat, selectedItem.location.lng]} offset={[0, 0]}>
                            <View pointerEvents="auto" style={[
                                s.popup, isDark && s.popupDark,
                                Platform.select({ web: { transform: 'translate(-50%, -100%)', marginTop: -28 } as any, default: {} }),
                            ]}>
                                <View style={s.popupHeader}>
                                    <Text style={[s.popupTitle, isDark && { color: '#F9FAFB' }]} numberOfLines={1}>{selectedItem.name}</Text>
                                    <TouchableOpacity onPress={() => setSelectedItem(null)} style={s.popupX}>
                                        <X size={12} color="#9CA3AF" />
                                    </TouchableOpacity>
                                </View>
                                <Text style={s.popupPrice}>${selectedItem.price}</Text>
                                <TouchableOpacity style={s.popupBtn} onPress={() => onItemClick(selectedItem)} activeOpacity={0.7}>
                                    <Text style={s.popupBtnText}>Ver Detalle</Text>
                                </TouchableOpacity>
                            </View>
                        </Overlay>
                    )}
                </Map>

                {/* ═══ FLOATING UI ═══ */}
                {/* Badge pushed safely below the header bar */}
                <View pointerEvents="none" style={[s.badge, { top: safeTop + 24 }, isDark && s.badgeDark]}>
                    <MapPin size={12} color="#fff" />
                    <Text style={[s.badgeText, isDark && { color: '#fff' }]}>
                        {items.length} {items.length === 1 ? 'resultado' : 'resultados'}
                    </Text>
                </View>

                {/* ═══ SIMULATED PROXIMITY ALERT TOAST ═══ */}
                {simulatedAlert && (
                    <Animated.View pointerEvents="auto" style={[
                        s.alertToast,
                        isDark && s.alertToastDark,
                        { 
                            top: safeTop + 70, // Below the badge
                            opacity: alertAnim,
                            transform: [{
                                translateY: alertAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] })
                            }]
                        }
                    ]}>
                        <View style={s.alertToastIconBox}>
                            <Bell size={18} color="#fff" />
                        </View>
                        <View style={s.alertToastBody}>
                            <Text style={[s.alertToastTitle, isDark && { color: '#F9FAFB' }]}>¡Oferta en tu radar!</Text>
                            <Text style={[s.alertToastDesc, isDark && { color: '#D1D5DB' }]} numberOfLines={2}>
                                {simulatedAlert.distance != null ? `A ${simulatedAlert.distance.toFixed(1)}km:` : 'Cerca tuyo:'} "{simulatedAlert.name}" por ${simulatedAlert.price}.
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => setSimulatedAlert(null)} style={s.alertToastClose}>
                            <X size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                        </TouchableOpacity>
                    </Animated.View>
                )}

                {/* Zoom controls */}
                <View pointerEvents="box-none" style={[s.zoom, { top: zoomCenter - 60 }]}>
                    <TouchableOpacity style={[s.zoomBtn, isDark && s.zoomBtnDark]} onPress={() => setZoom(z => Math.min(z + 1, 18))}>
                        <PlusIcon size={18} color={isDark ? '#E5E7EB' : '#374151'} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.zoomBtn, isDark && s.zoomBtnDark]} onPress={() => setZoom(z => Math.max(z - 1, 3))}>
                        <Minus size={18} color={isDark ? '#E5E7EB' : '#374151'} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.zoomBtn, s.zoomBtnLocate]} onPress={() => onSearchLocationChange?.({ lat: searchCenter[0], lng: searchCenter[1] })}>
                        <Locate size={18} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* ═══ BOTTOM CONTROL BAR ═══ */}
            <View style={[s.controlBar, isDark && s.controlBarDark]}>
                {/* Slider Row */}
                <View style={s.radiusRow}>
                    <Navigation size={14} color="#7C3AED" style={{ marginRight: 6 }} />
                    <Text style={[s.radiusLabel, isDark && { color: '#D1D5DB' }]}>Radio</Text>
                    <View style={s.sliderWrap}>
                        <RadiusSlider value={radius} onChange={handleSliderChange} isDark={isDark} />
                    </View>
                    <View style={[s.radiusInputWrap, isDark && s.radiusInputWrapDark]}>
                        <TextInput
                            style={[s.radiusInput, isDark && { color: '#F9FAFB' }]}
                            value={radiusInput}
                            onChangeText={setRadiusInput}
                            onBlur={handleRadiusInputSubmit}
                            onSubmitEditing={handleRadiusInputSubmit}
                            keyboardType="numeric"
                            selectTextOnFocus
                            maxLength={4}
                        />
                        <Text style={[s.radiusUnit, isDark && { color: '#9CA3AF' }]}>km</Text>
                    </View>
                </View>
                
                {/* Buttons Row */}
                <View style={s.actionRow}>
                    <TouchableOpacity style={[s.alertBtn, isDark && s.alertBtnDark, alertsConfig.enabled && s.alertBtnActive]} onPress={() => setShowAlertsMenu(true)} activeOpacity={0.8}>
                        <Bell size={16} color={alertsConfig.enabled ? '#fff' : '#7C3AED'} />
                        <Text style={alertsConfig.enabled ? s.alertBtnTextActive : s.alertBtnText}>
                            {alertsConfig.enabled ? 'Radar ON' : 'Radar'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[s.listBtn, isDark && s.listBtnDark]} onPress={() => toggleList(true)} activeOpacity={0.8}>
                        <ListIcon size={16} color="#fff" />
                        <Text style={[s.listBtnText, isDark && { color: '#fff' }]}>Ver lista ({items.length})</Text>
                        <ChevronUp size={16} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* ═══ PROXIMITY ALERTS MODAL ═══ */}
            <Modal visible={showAlertsMenu} transparent animationType="fade">
                <View style={s.modalBackdrop}>
                    <View style={[s.modalBox, isDark && s.modalBoxDark]}>
                        <View style={s.modalHeader}>
                            <Bell size={20} color="#7C3AED" />
                            <Text style={[s.modalTitle, isDark && { color: '#F9FAFB' }]}>Alertas de Proximidad</Text>
                            <TouchableOpacity onPress={() => setShowAlertsMenu(false)} style={s.modalCloseBtn}>
                                <X size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                            </TouchableOpacity>
                        </View>
                        
                        <Text style={[s.modalDesc, isDark && { color: '#9CA3AF' }]}>
                            Recibí notificaciones en tiempo real cuando pases físicamente cerca de comercios o productos disponibles en tu radio actual ({radius} km).
                        </Text>

                        <View style={[s.switchRow, isDark && { borderBottomColor: '#374151' }]}>
                            <Text style={[s.switchLabelMain, isDark && { color: '#F9FAFB' }]}>Activar Radar de Ofertas</Text>
                            <Switch
                                value={alertsConfig.enabled}
                                onValueChange={val => setAlertsConfig(p => ({ ...p, enabled: val }))}
                                trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                                thumbColor="#fff"
                            />
                        </View>

                        <View style={[s.alertsOptsGroup, !alertsConfig.enabled && { opacity: 0.5 }]} pointerEvents={alertsConfig.enabled ? 'auto' : 'none'}>
                            <Text style={[s.optsTitle, isDark && { color: '#D1D5DB' }]}>¿Qué te gustaría descubrir?</Text>
                            
                            {(['products', 'businesses', 'events'] as const).map(key => {
                                const active = alertsConfig[key];
                                const label = key === 'products' ? 'Productos en Venta' : key === 'businesses' ? 'Comercios y Ofertas' : 'Eventos y Bonos';
                                return (
                                    <TouchableOpacity key={key} style={s.optRow} onPress={() => setAlertsConfig(p => ({ ...p, [key]: !p[key] }))}>
                                        <View style={[s.checkbox, active && s.checkboxActive, isDark && !active && { borderColor: '#6B7280' }]}>
                                            {active && <Check size={12} color="#fff" />}
                                        </View>
                                        <Text style={[s.optLabel, isDark && { color: '#F9FAFB' }]}>{label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <TouchableOpacity style={s.modalSaveBtn} onPress={() => setShowAlertsMenu(false)}>
                            <Text style={s.modalSaveText}>Guardar Configuración</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ═══ LIST PANEL ═══ */}
            {showList && (
                <Animated.View style={[
                    s.listPanel, isDark && s.listPanelDark,
                    { bottom: bottomInset, transform: [{ translateY: listTranslateY }] },
                ]}>
                    <View style={s.listPanelHead}>
                        <View style={[s.listHandle, isDark && { backgroundColor: '#4B5563' }]} />
                    </View>
                    <View style={[s.listTitleRow, isDark && { borderBottomColor: 'rgba(255,255,255,0.06)' }]}>
                        <Text style={[s.listTitle, isDark && { color: '#F9FAFB' }]}>Resultados cerca tuyo</Text>
                        <TouchableOpacity style={s.listCloseCircle} onPress={() => toggleList(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <X size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                        </TouchableOpacity>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.listScroll}>
                        {items.length === 0 && (
                            <View style={s.empty}>
                                <View style={s.emptyIconCircle}>
                                    <MapPin size={28} color="#7C3AED" />
                                </View>
                                <Text style={[s.emptyText, isDark && { color: '#9CA3AF' }]}>No hay productos en esta zona</Text>
                            </View>
                        )}
                        {items.map(item => {
                            const saved = isFavorite(item.id);
                            return (
                                <TouchableOpacity key={item.id} style={[s.row, isDark && s.rowDark]} onPress={() => { toggleList(false); onItemClick(item); }} activeOpacity={0.7}>
                                    <ImageWithFallback src={item.image} style={[s.rowImg, isDark && { backgroundColor: '#374151' }]} />
                                    <View style={s.rowBody}>
                                        <Text style={[s.rowName, isDark && { color: '#F9FAFB' }]} numberOfLines={1}>{item.name}</Text>
                                        <Text style={[s.rowMeta, isDark && { color: '#9CA3AF' }]} numberOfLines={1}>{item.category} • {item.distance != null ? `${item.distance.toFixed(1)}km` : '-'}</Text>
                                        <Text style={s.rowPrice}>${item.price}</Text>
                                    </View>
                                    <View style={s.rowActs}>
                                        <TouchableOpacity style={[s.actBtn, isDark && s.actBtnDark, saved && s.actBtnActive]} onPress={(e) => { e.stopPropagation(); toggleFavorite(item); }}>
                                            <Bookmark size={15} color={saved ? '#7C3AED' : '#9CA3AF'} fill={saved ? '#7C3AED' : 'transparent'} />
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[s.actBtn, s.actBtnAdd, isDark && s.actBtnDark]} onPress={(e) => { e.stopPropagation(); addItem({ id: item.id, name: item.name, price: item.price, image: item.image || 'https://placehold.co/300x300.png', type: item.type, distanceKm: item.distance, location: item.location?.name }); }}>
                                            <PlusIcon size={15} color="#fff" />
                                        </TouchableOpacity>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </Animated.View>
            )}
        </View>
    );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#f3f4f6' },

    // ── Map area (takes all space above the control bar) ──
    mapArea: { flex: 1, position: 'relative', overflow: 'hidden' },

    centerDotOuter: { width: 24, height: 24, borderRadius: 12, marginLeft: -12, marginTop: -12, backgroundColor: 'rgba(59,130,246,0.25)', alignItems: 'center', justifyContent: 'center' },
    centerDotInner: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#3B82F6', borderWidth: 2.5, borderColor: '#fff', shadowColor: '#3B82F6', shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },

    markerTouch: { alignItems: 'center', justifyContent: 'center' },
    markerBody: { alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
    markerSelected: { borderColor: '#EDE9FE', borderWidth: 3 },

    popup: { width: 200, backgroundColor: 'white', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
    popupDark: { backgroundColor: '#1F2937', borderColor: 'rgba(255,255,255,0.08)' },
    popupHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
    popupTitle: { fontSize: 13, fontWeight: '700', color: '#1F2937', flex: 1, lineHeight: 17 },
    popupX: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center' },
    popupPrice: { fontSize: 16, fontWeight: '800', color: '#7C3AED', marginBottom: 10 },
    popupBtn: { backgroundColor: '#7C3AED', paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
    popupBtnText: { color: 'white', fontSize: 12, fontWeight: '700' },

    badge: { position: 'absolute', left: 16, zIndex: 5, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#7C3AED', gap: 6, shadowColor: '#7C3AED', shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    badgeDark: { backgroundColor: '#6D28D9' },
    badgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },

    zoom: { position: 'absolute', right: 16, zIndex: 5, gap: 8 },
    zoomBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5, ...Platform.select({ web: { backdropFilter: 'blur(12px)' } as any }) },
    zoomBtnDark: { backgroundColor: 'rgba(31,41,55,0.9)' },
    zoomBtnLocate: { backgroundColor: '#7C3AED', shadowColor: '#7C3AED', shadowOpacity: 0.4 },

    // ═══ BOTTOM CONTROL BAR ═══
    controlBar: { backgroundColor: 'white', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', gap: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: -4 }, elevation: 10 },
    controlBarDark: { backgroundColor: '#1F2937', borderTopColor: 'rgba(255,255,255,0.05)' },

    radiusRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
    radiusLabel: { fontSize: 13, fontWeight: '700', color: '#4B5563', marginRight: 12 },
    sliderWrap: { flex: 1 },
    radiusInputWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 6, height: 28, width: 50, marginLeft: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    radiusInputWrapDark: { backgroundColor: '#374151', borderColor: '#4B5563' },
    radiusInput: { fontSize: 13, fontWeight: '700', color: '#1F2937', textAlign: 'center', paddingVertical: 0, width: 22 },
    radiusUnit: { fontSize: 11, color: '#6B7280', fontWeight: '600' },

    actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    alertBtn: { flexDirection: 'row', paddingHorizontal: 14, height: 44, borderRadius: 14, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EDE9FE', gap: 6 },
    alertBtnDark: { backgroundColor: '#374151', borderColor: '#4B5563' },
    alertBtnActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
    alertBtnText: { color: '#7C3AED', fontSize: 14, fontWeight: '700' },
    alertBtnTextActive: { color: '#fff', fontSize: 14, fontWeight: '700' },

    listBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827', height: 44, borderRadius: 14, gap: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
    listBtnDark: { backgroundColor: '#7C3AED' },
    listBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    // ═══ SLIDER ═══
    sliderContainer: { height: 36, justifyContent: 'center' },
    sliderTrackWrap: { flex: 1, justifyContent: 'center', paddingVertical: 10 },
    sliderTrack: { height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, position: 'relative' },
    sliderFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#7C3AED', borderRadius: 3 },
    sliderThumb: { position: 'absolute', top: -11, width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', borderWidth: 2, borderColor: '#7C3AED', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
    sliderThumbInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7C3AED' },

    // ═══ ALERTS MODAL ═══
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
    modalBoxDark: { backgroundColor: '#1F2937' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827', flex: 1 },
    modalCloseBtn: { padding: 4 },
    modalDesc: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginBottom: 24 },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', marginBottom: 20 },
    switchLabelMain: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
    alertsOptsGroup: { gap: 14, marginBottom: 28 },
    optsTitle: { fontSize: 13, fontWeight: '700', color: '#4B5563', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    optRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
    checkboxActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
    optLabel: { fontSize: 15, fontWeight: '500', color: '#374151' },
    modalSaveBtn: { backgroundColor: '#111827', height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    modalSaveText: { color: '#fff', fontSize: 15, fontWeight: '700' },

    // ═══ LIST PANEL ═══
    listPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '65%', backgroundColor: 'white', borderTopLeftRadius: 28, borderTopRightRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 20, zIndex: 20 },
    listPanelDark: { backgroundColor: '#1F2937' },
    listPanelHead: { alignItems: 'center', paddingTop: 12, paddingBottom: 6 },
    listHandle: { width: 40, height: 5, borderRadius: 2.5, backgroundColor: '#E5E7EB' },
    listTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
    listTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
    listCloseCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
    listScroll: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 12, gap: 12 },
    empty: { alignItems: 'center', paddingVertical: 40, gap: 16 },
    emptyIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontSize: 15, fontWeight: '500', color: '#6B7280' },
    row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 12, gap: 14, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    rowDark: { backgroundColor: '#374151', borderColor: 'transparent' },
    rowImg: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#F3F4F6' },
    rowBody: { flex: 1 },
    rowName: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
    rowMeta: { fontSize: 12, color: '#6B7280', marginBottom: 4, fontWeight: '500' },
    rowPrice: { fontSize: 16, fontWeight: '800', color: '#7C3AED' },
    rowActs: { flexDirection: 'row', gap: 8 },
    actBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
    actBtnDark: { backgroundColor: '#4B5563', borderColor: '#6B7280' },
    actBtnActive: { borderColor: '#DDD6FE', backgroundColor: '#F5F3FF' },
    actBtnAdd: { borderColor: 'transparent', backgroundColor: '#111827' },

    // ═══ ALERT TOAST SIMULATION ═══
    alertToast: {
        position: 'absolute', alignSelf: 'center', zIndex: 100,
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', borderRadius: 16, padding: 12, width: '90%', maxWidth: 360,
        shadowColor: '#10B981', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 15,
        borderWidth: 1, borderColor: '#10B981',
    },
    alertToastDark: { backgroundColor: '#1F2937', borderColor: '#10B981' },
    alertToastIconBox: {
        width: 38, height: 38, borderRadius: 19, backgroundColor: '#10B981',
        alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    alertToastBody: { flex: 1, justifyContent: 'center' },
    alertToastTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 2 },
    alertToastDesc: { fontSize: 13, color: '#4B5563', lineHeight: 18, fontWeight: '500' },
    alertToastClose: { padding: 6, alignSelf: 'flex-start', marginLeft: 8 },
});
