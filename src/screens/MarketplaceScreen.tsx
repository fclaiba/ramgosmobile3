import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ScrollView, Platform, useWindowDimensions, Image, Animated, Modal, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShoppingCart, Heart, Search, Filter, LayoutGrid, List, MapPin, Plus as PlusIcon, Tag, Ticket, Star, Calendar, Wrench, X } from 'lucide-react-native';
import { api } from '../../convex/_generated/api';
import { useQuery } from 'convex/react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useMarketplace } from '../contexts/MarketplaceContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useTheme } from '../contexts/ThemeContext'; // Import useTheme

import { MobileHeader } from '../components/MobileHeader';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { SidebarMenu } from '../components/SidebarMenu';
import { MobileNav, NAV_CONTENT_HEIGHT } from '../components/MobileNav';
import { AdvancedFilters } from '../components/AdvancedFilters';
import { RadiusFilterCard } from '../components/marketplace/RadiusFilterCard';
import { MapView as MarketplaceMap } from '../components/marketplace/MapView';
import { ItemDetailView } from '../components/ItemDetailView';

type ViewMode = 'grid' | 'list' | 'map';
type ItemType = 'products' | 'bonos' | 'events' | 'services' | 'businesses';

type FilterState = {
    priceRange: number[];
    minRating: number | null;
    minDiscount: number | null;
    categories: string[];
    sortBy: 'relevancia' | 'menor_precio' | 'mayor_precio' | 'distance' | 'mejor_calificado';
    searchLocation?: { lat: number; lng: number };
};

const MAP_LIST_HEIGHT = 400;

type MarketplaceFeedItem = {
    id: string | number;
    type: 'product' | 'bono' | 'event' | 'service' | 'business';
    name: string;
    price: number;
    originalPrice?: number;
    discount?: number;
    rating?: number;
    reviews?: number;
    image: string;
    gallery?: string[];
    category: string;
    location: { lat: number; lng: number; name: string; address?: string };
    distance: number;
    description?: string;
    date?: string;
    time?: string;
    validUntil?: string;
    sellerId?: string;
    sellerName?: string;
    condition?: 'new' | 'used';
    damageDescription?: string;
    shippingWeightKg?: number;
    shippingDimensionsCm?: { length: number; width: number; height: number };
    sourceProductId?: string;
};

// Mock seeds removed.

// Mock generation code removed.

// Service mocks removed.

// Mock definitions removed.


export default function MarketplaceScreen({ navigation, route, initialParams }: any) {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { addItem, openCart, items: cartItems } = useCart();
    const { user, requireAuth } = useAuth();
    const { isFavorite, toggleFavorite } = useFavorites();
    const { products } = useMarketplace();
    const { theme, colorScheme } = useTheme(); // Use theme
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const canPublish = !!user && (user.role === 'business' || user.role === 'consumer' || user.role === 'influencer');

    // Determine params from either navigation route or direct prop (for tab mode)
    const activeParams = initialParams || route?.params;

    const NYC_DEFAULT_CENTER = useMemo(() => ({ lat: 40.7549, lng: -73.9840 }), []);
    const lastNonServiceSearchLocationRef = useRef<{ lat: number; lng: number } | null>(null);

    // State
    const [viewMode, setViewMode] = useState<ViewMode>(activeParams?.viewMode || 'grid');
    const [filter, setFilter] = useState<ItemType | 'all'>(activeParams?.filter || 'all');
    const [radius, setRadius] = useState<number>(5);
    const [detailItemId, setDetailItemId] = useState<string | number | null>(null);

    // Map List Overlay
    const [isMapListVisible, setIsMapListVisible] = useState(false);
    const mapListAnim = useRef(new Animated.Value(MAP_LIST_HEIGHT)).current;

    useEffect(() => {
        Animated.timing(mapListAnim, {
            toValue: isMapListVisible ? 0 : MAP_LIST_HEIGHT,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [isMapListVisible]);


    const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
    // React to param changes
    useEffect(() => {
        if (activeParams?.filter) {
            setFilter(
                activeParams.filter === 'products'
                    ? 'products'
                    : activeParams.filter === 'services'
                        ? 'services'
                        : activeParams.filter === 'bonos'
                            ? 'bonos'
                            : activeParams.filter === 'events'
                                ? 'events'
                                : 'all'
            );
        }
        if (activeParams?.viewMode) {
            setViewMode(activeParams.viewMode);
        }
        // Handle focus location from navigation (e.g. after creating a listing)
        if (activeParams?.focusLocation) {
            setAdvancedFilters(prev => ({
                ...prev,
                searchLocation: activeParams.focusLocation
            }));
            // Ensure map centers on it
            setCurrentMapCenter(activeParams.focusLocation);
        }
    }, [activeParams]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [advancedFilters, setAdvancedFilters] = useState<FilterState>({
        priceRange: [0, 2000],
        minRating: null,
        minDiscount: null,
        categories: [],
        sortBy: 'relevancia',
        // Manual center by default (independent of GPS)
        searchLocation: { lat: -34.603722, lng: -58.381592 },
    });
    const [currentMapCenter, setCurrentMapCenter] = useState<{ lat: number; lng: number } | null>(null);

    // (keep param handling only via activeParams to avoid ReferenceError / duplication)

    // Derived Logic
    const activeFiltersCount =
        (advancedFilters.priceRange[0] > 0 || advancedFilters.priceRange[1] < 2000 ? 1 : 0) +
        (advancedFilters.minRating ? 1 : 0) +
        (advancedFilters.minDiscount ? 1 : 0) +
        advancedFilters.categories.length +
        (advancedFilters.sortBy !== 'relevancia' ? 1 : 0);

    // Server-side Search
    // If searchQuery is present, we fetch from api.listings.searchListings
    // Otherwise we use 'products' from context (which is getValidListings)
    const searchResults = useQuery(api.listings.searchListings, searchQuery ? { query: searchQuery } : "skip");

    // Determine which source to use
    const sourceListings = searchQuery ? (searchResults || []) : products;

    const normalizeListing = (item: any): MarketplaceFeedItem => {
        const primaryImage =
            item.images?.find((img: any) => img.isPrimary)?.url ||
            item.images?.[0]?.url ||
            'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1080';

        const originalPrice = item.condition === 'used'
            ? Number((item.price * 1.18).toFixed(0))
            : undefined;

        const discount = originalPrice
            ? Math.max(0, Math.round((1 - item.price / originalPrice) * 100))
            : undefined;

        return {
            id: item.id || item._id, // Handle both id formats
            type: (item.listingType ?? 'product') as MarketplaceFeedItem['type'],
            name: item.title,
            price: item.price,
            originalPrice,
            discount,
            rating: item.rating?.average,
            reviews: item.rating?.count,
            image: primaryImage,
            gallery: item.images?.map((img: any) => img.url) || [],
            category: item.category,
            location: {
                lat: item.location?.lat || 0,
                lng: item.location?.lng || 0,
                name: item.location?.name || '',
                address: item.location?.address || '',
            },
            distance: Number(item.location?.distanceKm ?? 0),
            description: item.description,
            sellerId: item.seller?.id || '',
            sellerName: item.seller?.name || '',
            condition: item.condition,
            damageDescription: item.damageDescription,
            shippingWeightKg: item.shippingProfile?.weightKg || 0,
            shippingDimensionsCm: item.shippingProfile?.dimensionsCm,
            sourceProductId: item.id || item._id,
            date: item.eventDate,
            time: item.eventTime,
            validUntil: item.validUntil,
        };
    };

    const productItems = useMemo<MarketplaceFeedItem[]>(() => {
        return sourceListings.map(normalizeListing);
    }, [sourceListings]);

    const combinedItems = useMemo<MarketplaceFeedItem[]>(() => {
        // If searching, we likely only want real results, not mocks
        if (searchQuery) return productItems;

        return productItems;
    }, [productItems, searchQuery]);

    const applyFilters = (items: MarketplaceFeedItem[]) => {
        let result = items.filter(item => {
            if (filter !== 'all' && (
                (filter === 'products' && item.type !== 'product') ||
                (filter === 'bonos' && item.type !== 'bono') ||
                (filter === 'events' && item.type !== 'event') ||
                (filter === 'services' && item.type !== 'service')
            )) return false;

            if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;

            if (item.price < advancedFilters.priceRange[0] || item.price > advancedFilters.priceRange[1]) return false;

            if (advancedFilters.minRating) {
                if (item.type !== 'product' || !item.rating || item.rating < advancedFilters.minRating) return false;
            }

            if (advancedFilters.minDiscount) {
                if (!item.discount || item.discount < advancedFilters.minDiscount) return false;
            }

            if (advancedFilters.categories.length > 0 && !advancedFilters.categories.includes(item.category)) return false;

            return true;
        });

        const center = advancedFilters.searchLocation;
        if (center) {
            const toRad = (value: number) => (value * Math.PI) / 180;
            const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
                const R = 6371;
                const dLat = toRad(b.lat - a.lat);
                const dLng = toRad(b.lng - a.lng);
                const lat1 = toRad(a.lat);
                const lat2 = toRad(b.lat);
                const h =
                    Math.sin(dLat / 2) ** 2 +
                    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
                return 2 * R * Math.asin(Math.sqrt(h));
            };
            result = result
                .map((item) => ({
                    ...item,
                    distance: Number(haversineKm(center, item.location).toFixed(2)),
                }))
                .filter((item) => item.distance <= radius);
        }

        switch (advancedFilters.sortBy) {
            case 'menor_precio': result.sort((a, b) => a.price - b.price); break;
            case 'mayor_precio': result.sort((a, b) => b.price - a.price); break;
            case 'distance': result.sort((a, b) => a.distance - b.distance); break;
            case 'mejor_calificado': result.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
            default: break;
        }

        return result;
    };

    const filteredItems = useMemo(
        () => applyFilters(combinedItems),
        [combinedItems, filter, searchQuery, advancedFilters, radius]
    );


    const getItemIcon = (type: string) => {
        switch (type) {
            case 'product': return ShoppingCart;
            case 'bono': return Tag;
            case 'event': return Ticket;
            case 'service': return Wrench;
            case 'business': return MapPin;
            default: return ShoppingCart;
        }
    };

    const handleAddToCart = (item: MarketplaceFeedItem) => {
        addItem({
            id: item.id,
            name: item.name,
            price: item.price,
            image: item.image,
            type: item.type as any,
            location: item.location.name,
            sellerId: item.sellerId,
            sellerName: item.sellerName,
            condition: item.condition,
            shippingWeightKg: item.shippingWeightKg,
            shippingDimensionsCm: item.shippingDimensionsCm,
            distanceKm: item.distance,
        });
    };

    const selectedItem = useMemo(
        () => combinedItems.find((item) => item.id === detailItemId) ?? null,
        [combinedItems, detailItemId]
    );

    const selectedProduct = useMemo(() => {
        if (!selectedItem) return null;
        const productId = selectedItem.sourceProductId || (typeof selectedItem.id === 'string' ? selectedItem.id : undefined);
        if (!productId) return null;
        return products.find((product) => product.id === productId) ?? null;
    }, [products, selectedItem]);

    const renderGridItem = ({ item }: any) => {
        const Icon = getItemIcon(item.type);
        const saved = isFavorite(item.id);

        return (
            <TouchableOpacity
                style={[styles.gridCard, { width: (width - 48) / 2 }]}
                activeOpacity={0.9}
                onPress={() => setDetailItemId(item.id)}
            >
                <View style={styles.gridImgContainer}>
                    <ImageWithFallback src={item.image} style={styles.cardImg} />
                    {item.discount > 0 && (
                        <View style={styles.discountBadge}>
                            <Text style={styles.discountText}>-{item.discount}%</Text>
                        </View>
                    )}
                    {/* Favorites Button */}
                    <TouchableOpacity
                        style={[styles.favBtn, saved && styles.favBtnActive]}
                        onPress={(e) => {
                            e.stopPropagation();
                            toggleFavorite(item);
                        }}
                    >
                        <Heart size={16} color={saved ? '#EF4444' : isDark ? '#D1D5DB' : '#6B7280'} fill={saved ? '#EF4444' : 'transparent'} />
                    </TouchableOpacity>

                    <View style={styles.categoryBadge}>
                        <Icon size={10} color={isDark ? '#F9FAFB' : '#374151'} style={{ marginRight: 4 }} />
                        <Text style={styles.categoryText}>{item.category}</Text>
                    </View>
                </View>

                <View style={styles.gridContent}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>

                    {item.type === 'product' && item.rating && (
                        <View style={styles.ratingRow}>
                            <Star size={12} color="#FBBF24" fill="#FBBF24" />
                            <Text style={styles.ratingText}>{item.rating}</Text>
                        </View>
                    )}
                    {item.type === 'event' && (
                        <View style={styles.ratingRow}>
                            <Calendar size={12} color={isDark ? '#9CA3AF' : '#6B7280'} />
                            <Text style={styles.ratingText}>{item.date} • {item.time}</Text>
                        </View>
                    )}
                    {item.type === 'service' && (
                        <View style={styles.ratingRow}>
                            <Wrench size={12} color={isDark ? '#9CA3AF' : '#6B7280'} />
                            <Text style={styles.ratingText}>Servicio • A coordinar</Text>
                        </View>
                    )}

                    <View style={styles.priceRow}>
                        <Text style={styles.price}>${item.price}</Text>
                        {item.originalPrice && (
                            <Text style={styles.originalPrice}>${item.originalPrice}</Text>
                        )}
                    </View>

                    {item.type === 'business' ? (
                        <TouchableOpacity
                            style={[styles.btnSm, { backgroundColor: '#10B981' }]}
                            onPress={(e) => {
                                e.stopPropagation();
                                navigation.navigate('BusinessDetail', { businessId: item.id, business: item });
                            }}
                        >
                            <Text style={styles.btnSmText}>Ver Perfil</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={styles.btnSm}
                            onPress={(e) => {
                                e.stopPropagation();
                                handleAddToCart(item);
                            }}
                        >
                            <Text style={styles.btnSmText}>Agregar</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    const renderListItem = ({ item }: any) => {
        const Icon = getItemIcon(item.type);
        const saved = isFavorite(item.id);

        return (
            <TouchableOpacity
                style={styles.listCard}
                activeOpacity={0.9}
                onPress={() => setDetailItemId(item.id)}
            >
                <View style={styles.listImgContainer}>
                    <ImageWithFallback src={item.image} style={styles.cardImg} />
                    {item.discount > 0 && (
                        <View style={[styles.discountBadge, { top: 4, right: 4 }]}>
                            <Text style={styles.discountText}>-{item.discount}%</Text>
                        </View>
                    )}
                    {/* Favorites Button (Image - Bottom Left) */}
                    <TouchableOpacity
                        style={[styles.favBtn, saved && styles.favBtnActive]}
                        onPress={(e) => {
                            e.stopPropagation();
                            toggleFavorite(item);
                        }}
                        accessibilityLabel="Guardar"
                    >
                        <Heart size={16} color={saved ? '#EF4444' : isDark ? '#D1D5DB' : '#6B7280'} fill={saved ? '#EF4444' : 'transparent'} />
                    </TouchableOpacity>
                </View>

                <View style={styles.listContent}>
                    <View style={styles.listHeader}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                    </View>
                    <View style={[styles.categoryBadge, { position: 'relative', top: 0, left: 0, alignSelf: 'flex-start', marginBottom: 6, backgroundColor: isDark ? 'rgba(31, 41, 55, 0.5)' : '#F3F4F6' }]}>
                        <Icon size={10} color={isDark ? '#D1D5DB' : '#374151'} style={{ marginRight: 2 }} />
                        <Text style={styles.categoryText}>{item.type}</Text>
                    </View>

                    <View style={styles.locationRow}>
                        <MapPin size={12} color="#6B7280" />
                        <Text style={styles.locationText}>{item.location.name} • {item.distance}km</Text>
                    </View>

                    {item.type === 'bono' && <Text style={styles.descText} numberOfLines={1}>{item.description}</Text>}

                    <View style={styles.listFooter}>
                        <View style={styles.priceRow}>
                            <Text style={styles.price}>${item.price}</Text>
                        </View>
                        {item.type === 'business' ? (
                            <TouchableOpacity
                                style={[styles.btnSm, { backgroundColor: '#10B981', width: 'auto', paddingHorizontal: 16 }]}
                                onPress={(e) => {
                                    e.stopPropagation();
                                    navigation.navigate('BusinessDetail', { businessId: item.id, business: item });
                                }}
                            >
                                <Text style={styles.btnSmText}>Ver Perfil</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={[styles.btnSm, { backgroundColor: isDark ? '#374151' : '#111827', width: 'auto', paddingHorizontal: 16 }]}
                                onPress={(e) => {
                                    e.stopPropagation();
                                    handleAddToCart(item);
                                }}
                            >
                                <Text style={styles.btnSmText}>Agregar</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const headerActions = (
        <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
                onPress={() => navigation.navigate('CreateListing')}
                style={{ padding: 4 }}
            >
                <PlusIcon size={24} color={isDark || viewMode === 'map' ? '#D1D5DB' : '#374151'} />
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.cartBtn}
                onPress={openCart}
            >
                <ShoppingCart size={20} color={isDark ? '#D1D5DB' : '#374151'} />
                {cartItems.length > 0 && <View style={styles.cartBadge} />}
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={isDark ? ['#111827', '#000000'] : ['#F9FAFB', '#F3F4F6']}
                style={StyleSheet.absoluteFill}
            />

            {/* Map Background (When in Map Mode) */}
            {viewMode === 'map' && (
                <View
                    style={[
                        StyleSheet.absoluteFill,
                        { zIndex: 0 },
                    ]}
                >
                    <MarketplaceMap
                        items={filteredItems}
                        onItemClick={(item: any) => {
                            if (item.type === 'business') {
                                navigation.navigate('BusinessDetail', { businessId: item.id, business: item });
                            } else {
                                setDetailItemId(item.id);
                            }
                        }}
                        radius={radius}
                        searchLocation={advancedFilters.searchLocation}
                        onSearchLocationChange={(loc: any) => setAdvancedFilters(prev => ({ ...prev, searchLocation: loc }))}
                        isCustomSearch={true}
                        onRegionChangeComplete={(region: any) => {
                            setCurrentMapCenter({ lat: region.latitude, lng: region.longitude });
                            setAdvancedFilters(prev => ({ ...prev, searchLocation: { lat: region.latitude, lng: region.longitude } }));
                        }}
                        onRadiusChange={setRadius}
                        bottomInset={NAV_CONTENT_HEIGHT + insets.bottom}
                        // Props passed to satisfy interface, though map handles overlay now?
                        // Actually I reverted overlay in MapView, so these might be unused there, but needed to match props if strict
                        // Checking MapView interface... I didn't revert the interface, just the implementation content.
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        filter={filter}
                        onFilterChange={setFilter}
                        onOpenFilters={() => setAdvancedFiltersOpen(true)}
                        activeFiltersCount={activeFiltersCount}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                    />
                </View>
            )}

            <View
                style={viewMode === 'map' ? [StyleSheet.absoluteFill, { zIndex: 10 }] : { zIndex: 10 }}
                pointerEvents="box-none"
            >
                {viewMode === 'map' && (
                    <LinearGradient
                        colors={isDark ? ['rgba(0,0,0,0.78)', 'rgba(0,0,0,0)'] : ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
                        style={[StyleSheet.absoluteFill, { height: 240 }]}
                        pointerEvents="none"
                    />
                )}
                <MobileHeader
                    title="Marketplace"
                    subtitle="Productos, Bonos y Eventos"
                    onMenuPress={() => setIsSidebarOpen(true)}
                    // Float over the map
                    style={viewMode === 'map' ? { backgroundColor: 'transparent' } : undefined}
                    actions={headerActions}
                />

                {/* Header Controls (always visible) */}
                <View style={[styles.headerControls, viewMode === 'map' && styles.mapHeaderControls]}>
                    {/* Search & Filter Row (always visible) */}
                    <View style={styles.searchRow}>
                        <View style={styles.searchInputContainer}>
                            <Search size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Buscar productos, bonos..."
                                placeholderTextColor="#9CA3AF"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                        </View>
                        <TouchableOpacity
                            style={styles.filterBtn}
                            onPress={() => setAdvancedFiltersOpen(true)}
                            accessibilityLabel="Abrir filtros avanzados"
                        >
                            <Filter size={20} color={isDark ? '#D1D5DB' : '#374151'} />
                            {activeFiltersCount > 0 && (
                                <View style={styles.activeFilterBadge}>
                                    <Text style={styles.activeFilterText}>{activeFiltersCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Compact controls row (view mode + categories) */}
                    <View style={styles.compactControlsRow}>
                        <View style={styles.viewModeGroup}>
                            {[
                                { id: 'grid', Icon: LayoutGrid, label: 'Grid' },
                                { id: 'list', Icon: List, label: 'Lista' },
                                { id: 'map', Icon: MapPin, label: 'Mapa' }
                            ].map((mode) => {
                                const active = viewMode === mode.id;
                                return (
                                    <TouchableOpacity
                                        key={mode.id}
                                        style={[styles.viewModeBtn, active && styles.viewModeBtnActive]}
                                        onPress={() => setViewMode(mode.id as ViewMode)}
                                        accessibilityLabel={`Ver en ${mode.label}`}
                                    >
                                        <mode.Icon size={16} color={active ? '#7C3AED' : (isDark ? '#D1D5DB' : '#6B7280')} />
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.categoryChipsContent}
                            style={styles.categoryChipsScroll}
                        >
                            {(['all', 'products', 'services', 'bonos', 'events'] as const).map((t) => {
                                const active = filter === t;
                                const label =
                                    t === 'products' ? 'Productos' :
                                        t === 'services' ? 'Servicios' :
                                            t === 'bonos' ? 'Bonos' :
                                                t === 'events' ? 'Eventos' : 'Todos';

                                return (
                                    <TouchableOpacity
                                        key={t}
                                        style={[styles.categoryChip, active && styles.categoryChipActive]}
                                        onPress={() => setFilter(t as any)}
                                        accessibilityLabel={`Filtrar: ${label}`}
                                    >
                                        <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                                            {label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </View>

            {/* (Removed duplicated non-map header controls; controls are always rendered above) */}


            {/* Content Area */}
            <View style={{ flex: 1, zIndex: 1 }} pointerEvents="box-none">
                {viewMode !== 'map' && (
                    <FlatList
                        data={filteredItems}
                        key={viewMode}
                        numColumns={viewMode === 'grid' ? 2 : 1}
                        keyExtractor={(item) => item.id.toString()}
                        contentContainerStyle={{ padding: 16, paddingBottom: NAV_CONTENT_HEIGHT + insets.bottom + 20 }}
                        columnWrapperStyle={viewMode === 'grid' ? { justifyContent: 'space-between' } : undefined}
                        renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
                        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View >

            {/* Modals */}
            {
                selectedItem && (
                    <ItemDetailView
                        item={selectedItem}
                        product={selectedProduct}
                        onClose={() => setDetailItemId(null)}
                        onAddToCart={() => handleAddToCart(selectedItem)}
                        onOpenCart={openCart}
                    />
                )
            }

            <AdvancedFilters
                open={advancedFiltersOpen}
                onOpenChange={setAdvancedFiltersOpen}
                currentFilters={advancedFilters}
                onApplyFilters={setAdvancedFilters}
                filterType={filter}
            />

            {/* Navbar for Standalone Mode */}
            {!activeParams?.isTabMode && (
                <MobileNav
                    activeSection="marketplace"
                    onSectionChange={(section) => {
                        if (section === 'home') navigation.navigate('Home');
                        else if (section === 'social') navigation.navigate('Social');
                        else if (section === 'dashboard') navigation.navigate('Home', { initialTab: 'dashboard' });
                    }}
                />
            )}

            <SidebarMenu visible={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        </View >
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#111827' : '#F9FAFB' },
    headerControls: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    mapHeaderControls: {
        marginHorizontal: 12,
        marginTop: 8,
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 10,
        borderRadius: 22,
        backgroundColor: isDark ? 'rgba(17, 24, 39, 0.72)' : 'rgba(255, 255, 255, 0.82)',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(148, 163, 184, 0.18)' : 'rgba(229, 231, 235, 0.9)',
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 6,
    },
    cartBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? '#374151' : '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
    cartBadge: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },

    // Favorites
    favBtn: { position: 'absolute', bottom: 8, left: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: isDark ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    favBtnActive: { backgroundColor: isDark ? '#1F2937' : '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },

    // Search
    searchRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
    searchInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 24, borderWidth: 1, borderColor: isDark ? '#374151' : '#F3F4F6', height: 48 },
    searchInput: { flex: 1, paddingHorizontal: 16, fontSize: 14, color: isDark ? '#F9FAFB' : '#1F2937' },
    filterBtn: { width: 48, height: 48, borderRadius: 16, backgroundColor: isDark ? '#1F2937' : '#fff', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: isDark ? '#374151' : '#F3F4F6' },
    activeFilterBadge: { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: isDark ? '#1F2937' : '#fff' },
    activeFilterText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

    // Compact Controls (View mode + Categories)
    compactControlsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    viewModeGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 4,
        borderRadius: 18,
        backgroundColor: isDark ? '#1F2937' : '#F3F4F6',
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    viewModeBtn: { width: 34, height: 34, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    viewModeBtnActive: { backgroundColor: isDark ? '#374151' : '#fff' },
    categoryChipsScroll: { flex: 1 },
    categoryChipsContent: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
    categoryChip: {
        paddingHorizontal: 12,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
        backgroundColor: isDark ? '#1F2937' : '#F3F4F6',
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    categoryChipActive: { backgroundColor: isDark ? '#374151' : '#fff', borderColor: '#7C3AED' },
    categoryChipText: { fontSize: 12, color: isDark ? '#D1D5DB' : '#6B7280', fontWeight: '600' },
    categoryChipTextActive: { color: '#7C3AED' },

    // Toggles
    viewToggleContainer: { flexDirection: 'row', backgroundColor: isDark ? '#1F2937' : '#F3F4F6', borderRadius: 24, padding: 4, marginBottom: 16 },
    toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 20 },
    toggleBtnActive: { backgroundColor: isDark ? '#374151' : '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    toggleBtnText: { fontSize: 13, marginLeft: 8, color: '#6B7280', fontWeight: '500' },
    toggleBtnTextActive: { color: '#7C3AED', fontWeight: 'bold' },
    categoryToggleText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
    categoryToggleTextActive: { color: '#7C3AED', fontWeight: 'bold' },

    // Tabs
    tabsContainer: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
    tab: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 24, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
    tabActive: { backgroundColor: '#111827', borderColor: '#111827' },
    tabText: { fontSize: 13, color: '#4B5563', fontWeight: '500' },
    tabTextActive: { color: '#fff' },

    // Grid Card
    gridCard: { backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
    gridImgContainer: { height: 144, backgroundColor: isDark ? '#374151' : '#F3F4F6', position: 'relative' },
    cardImg: { width: '100%', height: '100%' },
    discountBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    discountText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    categoryBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: isDark ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255,255,255,0.9)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, flexDirection: 'row', alignItems: 'center' },
    categoryText: { fontSize: 10, color: isDark ? '#F9FAFB' : '#374151', fontWeight: '500' },
    gridContent: { padding: 12 },
    cardTitle: { fontSize: 13, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 4, height: 36 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
    ratingText: { fontSize: 11, color: '#6B7280' },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 8 },
    price: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827' },
    originalPrice: { fontSize: 11, color: '#9CA3AF', textDecorationLine: 'line-through' },
    btnSm: { backgroundColor: isDark ? '#374151' : '#111827', paddingVertical: 6, alignItems: 'center', borderRadius: 8 },
    btnSmText: { color: '#fff', fontSize: 12, fontWeight: '600' },

    // List Card
    listCard: { flexDirection: 'row', backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 16, padding: 12, gap: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    listImgContainer: { width: 96, height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: isDark ? '#374151' : '#F3F4F6' },
    listContent: { flex: 1 },
    listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
    locationText: { fontSize: 11, color: '#6B7280' },
    descText: { fontSize: 11, color: '#6B7280', marginBottom: 8 },
    listFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' },

    // Map Specific
    mapContainer: { flex: 1, borderRadius: 24, overflow: 'hidden', marginTop: 8 },
    mapFloatBtnContainer: { position: 'absolute', bottom: 24, alignSelf: 'center', zIndex: 20 },
    mapFloatBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, gap: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
    mapFloatBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

    // Map List Overlay
    mapListOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: MAP_LIST_HEIGHT, backgroundColor: isDark ? '#1F2937' : '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 10, zIndex: 30 },
    mapListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F3F4F6' },
    mapListHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB' },
    closeListBtn: { position: 'absolute', right: 16, top: 16, padding: 4 },
    mapListTitle: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827', margin: 16 },
});
