import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ScrollView, Platform, useWindowDimensions, Image, Modal, StatusBar , KeyboardAvoidingView} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate, Extrapolation, useAnimatedScrollHandler, FadeInUp, Layout } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ShoppingCart, Heart, Search, Filter, LayoutGrid, List, MapPin, Plus as PlusIcon, Tag, Ticket, Star, Calendar, Wrench, X, Store } from 'lucide-react-native';
import { api } from '../../convex/_generated/api';
import { useQuery } from 'convex/react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useMarketplace } from '../contexts/MarketplaceContext';
import { useMarketplaceProducts } from '../hooks/useMarketplaceProducts';
import { useFavorites } from '../hooks/useFavorites';
import { usePoints } from '../contexts/PointsContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';

import { MobileHeader } from '../components/MobileHeader';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { SidebarMenu } from '../components/SidebarMenu';
import { MobileNav, NAV_CONTENT_HEIGHT } from '../components/MobileNav';
import { AdvancedFilters } from '../components/AdvancedFilters';
import { RadiusFilterCard } from '../components/marketplace/RadiusFilterCard';
import { MapView as MarketplaceMap } from '../components/marketplace/MapView';


import { useResponsive } from '../hooks/useResponsive';
import { ResponsiveLayout } from '../components/ResponsiveLayout';
import { DesktopSidebar } from '../components/DesktopSidebar';
import { useUserLocation } from '../hooks/useUserLocation';
import { glassShadow, Radius, colors } from '../theme/tokens';
import { useTranslation } from 'react-i18next';

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
    discountValue?: number;
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

// ponytail: same default as LocationPicker / MAP_DEFAULTS (CABA)
const DEFAULT_MAP_CENTER = { lat: -34.6037, lng: -58.3816 };
const FALLBACK_RADIUS_KM = 18;

const hashId = (id: string | number) => {
    const str = String(id);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash);
};

/** Stable coords near CABA when a listing has no location. */
const getStableFallbackLocation = (id: string | number, name: string = '') => {
    const seed = hashId(id) + hashId(name);
    const r = FALLBACK_RADIUS_KM * Math.sqrt((seed % 10000) / 10000);
    const theta = (seed * 0.61803398875) % (2 * Math.PI);
    const latOffset = (r * Math.cos(theta)) / 111.32;
    const lngOffset =
        (r * Math.sin(theta)) /
        (111.32 * Math.cos(DEFAULT_MAP_CENTER.lat * (Math.PI / 180)));
    return {
        lat: DEFAULT_MAP_CENTER.lat + latOffset,
        lng: DEFAULT_MAP_CENTER.lng + lngOffset,
        name: 'Buenos Aires, AR',
        address: 'Ubicación aproximada',
    };
};


function MarketplaceScreen({ navigation, route, initialParams }: any) {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { addItem, openCart, items: cartItems } = useCart();
    const { user, requireAuth } = useAuth();
    const { show } = useToast();
    const { isFavorite, toggleFavorite } = useFavorites();
    const { } = useMarketplace();
    const products = useMarketplaceProducts();
    const { progressChallenge } = usePoints();
    const { theme, colorScheme } = useTheme(); // Use theme
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { t } = useTranslation();

    const { numColumns, isDesktop, maxContainerWidth } = useResponsive();
    const { location: userLocation } = useUserLocation();

    const canPublish = !!user && (user.role === 'business' || user.role === 'consumer' || user.role === 'influencer');

    // Determine params from either navigation route or direct prop (for tab mode)
    const activeParams = initialParams || route?.params;

    const lastNonServiceSearchLocationRef = useRef<{ lat: number; lng: number } | null>(null);
    const browseProgressedRef = useRef(false);

    // ponytail: +1 browse challenge when opening marketplace
    useEffect(() => {
        if (!user?.id || browseProgressedRef.current) return;
        browseProgressedRef.current = true;
        void progressChallenge('daily_browse', 1);
    }, [user?.id, progressChallenge]);

    // State
    const [viewMode, setViewMode] = useState<ViewMode>(activeParams?.viewMode || 'grid');
    const [filter, setFilter] = useState<ItemType | 'all'>(activeParams?.filter || 'all');
    const [radius, setRadius] = useState<number>(50);
    // Map List Overlay
    const [isMapListVisible, setIsMapListVisible] = useState(false);
    const mapListAnim = useSharedValue(MAP_LIST_HEIGHT);

    useEffect(() => {
        mapListAnim.value = withTiming(isMapListVisible ? 0 : MAP_LIST_HEIGHT, { duration: 300 });
    }, [isMapListVisible]);

    // Scroll Animation
    const scrollY = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler((event) => {
        scrollY.value = event.contentOffset.y;
    });

    const toggleFavWithHaptic = (item: any) => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleFavorite(item);
    };


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
        // Do not force setViewMode from params here to avoid resetting when user changes mode

        // Handle focus location from navigation (e.g. after creating a listing)
        if (activeParams?.focusLocation) {
            setAdvancedFilters(prev => ({
                ...prev,
                searchLocation: activeParams.focusLocation
            }));
            // Ensure map centers on it
            setCurrentMapCenter(activeParams.focusLocation);
        }

        if (activeParams?.advancedFilters) {
            setAdvancedFilters(prev => ({ ...prev, ...activeParams.advancedFilters }));
        }
    }, [activeParams?.filter, activeParams?.viewMode, activeParams?.focusLocation, activeParams?.advancedFilters]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [advancedFilters, setAdvancedFilters] = useState<FilterState>({
        // ponytail: cars/events can be >> $2k — don't hide them by default
        priceRange: [0, 1_000_000],
        minRating: null,
        minDiscount: null,
        categories: [],
        sortBy: 'relevancia',
        searchLocation: DEFAULT_MAP_CENTER,
    });
    const [currentMapCenter, setCurrentMapCenter] = useState<{ lat: number; lng: number } | null>(DEFAULT_MAP_CENTER);

    // Center on GPS when available; focusLocation from create-listing wins
    useEffect(() => {
        if (activeParams?.focusLocation) {
            setAdvancedFilters((prev) => ({ ...prev, searchLocation: activeParams.focusLocation }));
            setCurrentMapCenter(activeParams.focusLocation);
            return;
        }
        if (userLocation?.coords) {
            const loc = { lat: userLocation.coords.latitude, lng: userLocation.coords.longitude };
            setAdvancedFilters((prev) => ({ ...prev, searchLocation: loc }));
            setCurrentMapCenter(loc);
        }
    }, [activeParams?.focusLocation, userLocation?.coords?.latitude, userLocation?.coords?.longitude]);

    // (keep param handling only via activeParams to avoid ReferenceError / duplication)

    // Derived Logic
    const activeFiltersCount =
        (advancedFilters.priceRange[0] > 0 || advancedFilters.priceRange[1] < 1_000_000 ? 1 : 0) +
        (advancedFilters.minRating ? 1 : 0) +
        (advancedFilters.minDiscount ? 1 : 0) +
        advancedFilters.categories.length +
        (advancedFilters.sortBy !== 'relevancia' ? 1 : 0);

    // Server-side Search
    // If searchQuery is present, we fetch from api.listings.searchListings
    // Otherwise we use 'products' from context (which is getValidListings)
    const searchResults = useQuery(api.listings.searchListings, searchQuery ? { query: searchQuery } : "skip");
    const businessStores = useQuery(api.users.listBusinessStores) ?? [];

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

        // If the listing has no real coordinates, give it a stable location
        // around NYC so it still appears on the marketplace map.
        const hasValidLocation =
            item.location?.lat && item.location?.lng &&
            !(item.location.lat === 0 && item.location.lng === 0);
        const fallbackLocation = getStableFallbackLocation(item._id || item.id, item.title);
        const location = hasValidLocation
            ? {
                lat: item.location.lat,
                lng: item.location.lng,
                name: item.location.name || 'Buenos Aires, AR',
                address: item.location.address || '',
            }
            : fallbackLocation;

        return {
            id: item.id || item._id, // Handle both id formats
            type: (item.listingType ?? item.type ?? 'product') as MarketplaceFeedItem['type'],
            name: item.title,
            price: item.price,
            originalPrice,
            discount,
            discountValue: item.discountValue,
            rating: item.rating?.average,
            reviews: item.rating?.count,
            image: primaryImage,
            gallery: item.images?.map((img: any) => img.url) || [],
            category: item.category,
            location,
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

    const storeItems = useMemo<MarketplaceFeedItem[]>(() => {
        return (businessStores as any[]).map((store) => ({
            id: store.id || store._id,
            type: 'business' as const,
            name: store.title || store.name,
            price: 0,
            image:
                store.image ||
                'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80',
            gallery: store.images?.map((img: any) => img.url) || [],
            category: store.category || 'Negocio',
            location: {
                lat: store.location.lat,
                lng: store.location.lng,
                name: store.location.name || store.location.city || 'Manhattan, NY',
                address: store.location.address || '',
            },
            distance: 0,
            description: store.description,
            sellerId: store.seller?.id || store.id,
            sellerName: store.seller?.name || store.name,
            rating: store.sellerRating,
            reviews: store.sellerReviewCount,
            sourceProductId: store.id || store._id,
        }));
    }, [businessStores]);

    const combinedItems = useMemo<MarketplaceFeedItem[]>(() => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matchingStores = storeItems.filter(
                (s) =>
                    s.name.toLowerCase().includes(q) ||
                    (s.description || '').toLowerCase().includes(q),
            );
            return [...productItems, ...matchingStores];
        }
        return [...productItems, ...storeItems];
    }, [productItems, storeItems, searchQuery]);

    const applyFilters = (items: MarketplaceFeedItem[]) => {
        let result = items.filter(item => {
            if (filter !== 'all' && (
                (filter === 'products' && item.type !== 'product') ||
                (filter === 'bonos' && item.type !== 'bono') ||
                (filter === 'events' && item.type !== 'event') ||
                (filter === 'services' && item.type !== 'service') ||
                (filter === 'businesses' && item.type !== 'business')
            )) return false;

            if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;

            if (item.price < advancedFilters.priceRange[0] || item.price > advancedFilters.priceRange[1]) {
                if (item.type !== 'business') return false;
            }

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
            result = result.map((item) => ({
                ...item,
                distance: Number(haversineKm(center, item.location).toFixed(2)),
            })).filter(item => item.distance <= radius);
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
            case 'business': return Store;
            default: return ShoppingCart;
        }
    };

    const openFeedItem = (item: MarketplaceFeedItem) => {
        if (Platform.OS !== 'web') Haptics.selectionAsync();
        if (item.type === 'business') {
            navigation.navigate('CommercialProfile', { sellerId: String(item.sellerId || item.id) });
            return;
        }
        navigation.navigate('ItemDetail', { itemId: item.id, itemData: item });
    };

    const handleAddToCart = (item: MarketplaceFeedItem) => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        addItem({
            id: String(item.id),
            name: item.name,
            price: item.price,
            image: item.image,
            type: item.type,
            location: item.location.name,
            sellerId: item.sellerId,
            sellerName: item.sellerName,
            condition: item.condition,
            shippingWeightKg: item.shippingWeightKg,
            shippingDimensionsCm: item.shippingDimensionsCm,
            distanceKm: item.distance,
            quantity: 1,
        });
    };

    const effectiveWidth = Math.min(width, maxContainerWidth);
    const cardWidth = Math.floor((effectiveWidth - 32 - (16 * (numColumns - 1))) / numColumns);

    const renderGridItem = ({ item, index }: any) => {
        const Icon = getItemIcon(item.type);
        const saved = isFavorite(item.id);

        return (
            <Animated.View 
                entering={FadeInUp.delay(Math.min(index, 10) * 50).springify().damping(15)} 
                layout={Layout.springify()} 
                style={[styles.gridCardWrapper, { width: cardWidth }]}
            >
            <TouchableOpacity
                style={styles.gridCard}
                activeOpacity={0.8}
                onPress={() => openFeedItem(item)}
            >
                <View style={styles.gridImgContainer}>
                    <ImageWithFallback src={item.image} style={styles.cardImg} />
                    {item.discount > 0 && (
                        <BlurView intensity={80} tint="dark" style={styles.discountBadge}>
                            <Text style={styles.discountText}>-{item.discount}%</Text>
                        </BlurView>
                    )}
                    {/* Favorites Button */}
                    <TouchableOpacity
                        style={[styles.favBtn, saved && styles.favBtnActive]}
                        onPress={(e) => {
                            e.stopPropagation();
                            toggleFavWithHaptic(item);
                        }}
                    >
                        <Heart size={16} color={saved ? '#EF4444' : isDark ? '#E5E7EB' : '#4B5563'} fill={saved ? '#EF4444' : 'transparent'} />
                    </TouchableOpacity>

                    <BlurView intensity={isDark ? 40 : 80} tint={isDark ? "dark" : "light"} style={styles.categoryBadge}>
                        <Icon size={10} color={isDark ? '#F9FAFB' : '#111827'} style={{ marginRight: 4 }} />
                        <Text style={styles.categoryText}>{item.category}</Text>
                    </BlurView>
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

                    {item.type === 'bono' && item.discountValue ? (
                        <View style={styles.priceRow}>
                            <Text style={[styles.originalPrice, { textDecorationLine: 'none', color: '#10B981', fontWeight: '700' }]}>Valor real: ${item.discountValue}</Text>
                            <Text style={styles.price}>${item.price}</Text>
                        </View>
                    ) : item.type === 'business' ? (
                        <View style={styles.priceRow}>
                            <Text style={[styles.originalPrice, { textDecorationLine: 'none', color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                                {item.location.address || item.location.name}
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.priceRow}>
                            <Text style={styles.price}>${item.price}</Text>
                            {item.originalPrice && (
                                <Text style={styles.originalPrice}>${item.originalPrice}</Text>
                            )}
                        </View>
                    )}

                    {item.type === 'business' ? (
                        <TouchableOpacity
                            style={[styles.btnSm, { backgroundColor: '#10B981' }]}
                            onPress={(e) => {
                                e.stopPropagation();
                                openFeedItem(item);
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
            </Animated.View>
        );
    };

    const renderListItem = ({ item, index }: any) => {
        const Icon = getItemIcon(item.type);
        const saved = isFavorite(item.id);

        return (
            <Animated.View 
                entering={FadeInUp.delay(Math.min(index, 10) * 50).springify().damping(15)} 
                layout={Layout.springify()} 
                style={{ width: '100%' }}
            >
            <TouchableOpacity
                style={styles.listCard}
                activeOpacity={0.8}
                onPress={() => openFeedItem(item)}
            >
                <View style={styles.listImgContainer}>
                    <ImageWithFallback src={item.image} style={styles.cardImg} />
                    {item.discount > 0 && (
                        <BlurView intensity={80} tint="dark" style={[styles.discountBadge, { top: 4, right: 4 }]}>
                            <Text style={styles.discountText}>-{item.discount}%</Text>
                        </BlurView>
                    )}
                    {/* Favorites Button (Image - Bottom Left) */}
                    <TouchableOpacity
                        style={[styles.favBtn, saved && styles.favBtnActive]}
                        onPress={(e) => {
                            e.stopPropagation();
                            toggleFavWithHaptic(item);
                        }}
                        accessibilityLabel="Guardar"
                    >
                        <Heart size={16} color={saved ? '#EF4444' : isDark ? '#E5E7EB' : '#4B5563'} fill={saved ? '#EF4444' : 'transparent'} />
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
                        {item.type === 'bono' && item.discountValue ? (
                            <View style={styles.priceRow}>
                                <Text style={[styles.originalPrice, { textDecorationLine: 'none', color: '#10B981', fontWeight: '700' }]}>Valor real: ${item.discountValue}</Text>
                                <Text style={styles.price}>${item.price}</Text>
                            </View>
                        ) : (
                            <View style={styles.priceRow}>
                                <Text style={styles.price}>${item.price}</Text>
                            </View>
                        )}
                        {item.type === 'business' ? (
                            <TouchableOpacity
                                style={[styles.btnSm, { backgroundColor: '#10B981', width: 'auto', paddingHorizontal: 16 }]}
                                onPress={(e) => {
                                    e.stopPropagation();
                                    openFeedItem(item);
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
            </Animated.View>
        );
    };

    const headerActions = (
        <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
                onPress={() => {
                    if (user?.role === 'business' && user?.kycStatus !== 'approved') {
                        show('Debes completar y aprobar tu verificación de negocio (KYC) en tu perfil para poder vender', 'error');
                        return;
                    }
                    navigation.navigate('CreateListing');
                }}
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
        <ResponsiveLayout 
            style={styles.container}
            sidebar={
                !activeParams?.isTabMode ? (
                    <DesktopSidebar 
                        activeSection="marketplace" 
                        onSectionChange={(section) => {
                            if (section === 'home') navigation.navigate('Home');
                            else if (section === 'social') navigation.navigate('Social');
                            else if (section === 'dashboard') navigation.navigate('Home', { initialTab: 'dashboard' });
                        }} 
                    />
                ) : undefined
            }
        >
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
                            openFeedItem(item);
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
                        topInset={viewMode === 'map' ? (200 + insets.top) : (220 + insets.top)}
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
                    actions={headerActions}
                />

                {/* Header Controls (always visible) */}
                <View style={[styles.headerControls, viewMode === 'map' && styles.mapHeaderControls]}>
                    {/* Search & Filter Row (always visible) */}
                    <View style={styles.searchRow}>
                        <View style={styles.searchInputWrapper}>
                            <Search size={20} color={isDark ? "#9CA3AF" : "#6B7280"} style={{ marginLeft: 16 }} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Buscar productos, bonos..."
                                placeholderTextColor={isDark ? "#9CA3AF" : "#6B7280"}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                        </View>
                        <TouchableOpacity
                            style={styles.filterBtn}
                            onPress={() => {
                                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setAdvancedFiltersOpen(true);
                            }}
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
                                        onPress={() => {
                                            if (Platform.OS !== 'web') Haptics.selectionAsync();
                                            setViewMode(mode.id as ViewMode);
                                        }}
                                        accessibilityLabel={t('marketplace.viewMode', { mode: mode.label, defaultValue: `Ver en ${mode.label}` })}
                                    >
                                        <mode.Icon size={16} color={active ? '#2196F3' : (isDark ? '#D1D5DB' : '#6B7280')} />
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
                            {(['all', 'products', 'services', 'bonos', 'events', 'businesses'] as const).map((itemType) => {
                                const active = filter === itemType;
                                const label =
                                    itemType === 'products' ? t('marketplace.products', { defaultValue: 'Productos' }) :
                                        itemType === 'services' ? t('marketplace.services', { defaultValue: 'Servicios' }) :
                                            itemType === 'bonos' ? t('marketplace.vouchers', { defaultValue: 'Bonos' }) :
                                                itemType === 'events' ? t('marketplace.events', { defaultValue: 'Eventos' }) :
                                                    itemType === 'businesses' ? t('marketplace.stores', { defaultValue: 'Tiendas' }) : t('marketplace.all', { defaultValue: 'Todos' });

                                return (
                                    <TouchableOpacity
                                        key={itemType}
                                        style={[styles.categoryChip, active && styles.categoryChipActive]}
                                        onPress={() => {
                                            if (Platform.OS !== 'web') Haptics.selectionAsync();
                                            setFilter(itemType as any);
                                        }}
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
                    <Animated.FlatList
                        data={filteredItems}
                        key={`${viewMode}-${numColumns}`}
                        numColumns={viewMode === 'grid' ? numColumns : 1}
                        keyExtractor={(item) => item.id.toString()}
                        contentContainerStyle={{ padding: 16, paddingBottom: NAV_CONTENT_HEIGHT + insets.bottom + 20 }}
                        columnWrapperStyle={viewMode === 'grid' ? { justifyContent: 'flex-start', gap: 16 } : undefined}
                        renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
                        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
                        showsVerticalScrollIndicator={false}
                        onScroll={scrollHandler}
                        scrollEventThrottle={16}
                    />
                )}
            </View >

            {/* Modals */}
            <AdvancedFilters
                open={advancedFiltersOpen}
                onOpenChange={setAdvancedFiltersOpen}
                currentFilters={advancedFilters}
                onApplyFilters={setAdvancedFilters}
                filterType={filter}
            />

            {/* Navbar for Standalone Mode */}
            {!activeParams?.isTabMode && !isDesktop && (
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
        </ResponsiveLayout>
    );
}

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    headerControls: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    mapHeaderControls: {
        marginHorizontal: 12,
        marginTop: 8,
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 10,
        borderRadius: Radius.xl,
        backgroundColor: c.surface1,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.glassBorder,
        ...glassShadow(isDark),
    },
    cartBtn: { width: 36, height: 36, borderRadius: Radius.lg, backgroundColor: c.surface2, justifyContent: 'center', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.glassBorder },
    cartBadge: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: Radius.sm, backgroundColor: '#EF4444' },

    // Favorites
    favBtn: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center', zIndex: 10, overflow: 'hidden', backgroundColor: c.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: c.glassBorder },
    favBtnActive: { ...glassShadow(isDark) },

    // Search
    searchRow: { flexDirection: 'row', gap: 12, marginBottom: 16, alignItems: 'center' },
    searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: Radius['2xl'], borderWidth: StyleSheet.hairlineWidth, borderColor: c.glassBorder, backgroundColor: c.surface1, height: 52, overflow: 'hidden' },
    searchInput: { flex: 1, paddingHorizontal: 12, fontSize: 15, color: c.text, height: '100%', outlineStyle: 'none' } as any,
    filterBtn: { width: 52, height: 52, borderRadius: Radius['2xl'], justifyContent: 'center', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.glassBorder, backgroundColor: c.surface1 },
    activeFilterBadge: { position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: Radius.md, backgroundColor: '#4FC3F7', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: c.bg },
    activeFilterText: { color: '#fff', fontSize: 10, fontWeight: '700' },

    // Compact Controls (View mode + Categories)
    compactControlsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    viewModeGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 4,
        borderRadius: Radius.lg,
        backgroundColor: c.surface1,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.glassBorder,
    },
    viewModeBtn: { width: 34, height: 34, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
    viewModeBtnActive: { backgroundColor: c.surface3 },
    categoryChipsScroll: { flex: 1 },
    categoryChipsContent: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
    categoryChip: {
        paddingHorizontal: 12,
        height: 34,
        borderRadius: Radius.lg,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
        backgroundColor: c.surface1,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.glassBorder,
    },
    categoryChipActive: { backgroundColor: c.surface3, borderColor: c.primary },
    categoryChipText: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    categoryChipTextActive: { color: c.primary, fontWeight: '700' },

    // Toggles
    viewToggleContainer: { flexDirection: 'row', backgroundColor: c.surface1, borderRadius: Radius.xl, padding: 4, marginBottom: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.glassBorder },
    toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: Radius.xl },
    toggleBtnActive: { backgroundColor: c.surface3, ...glassShadow(isDark) },
    toggleBtnText: { fontSize: 13, marginLeft: 8, color: c.textMuted, fontWeight: '600' },
    toggleBtnTextActive: { color: c.primary, fontWeight: '800' },
    categoryToggleText: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    categoryToggleTextActive: { color: c.primary, fontWeight: '800' },

    // Tabs
    tabsContainer: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
    tab: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: Radius.xl, backgroundColor: c.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: c.glassBorder },
    tabActive: { backgroundColor: c.primary, borderColor: c.primary },
    tabText: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    tabTextActive: { color: '#fff', fontWeight: '700' },

    // Grid Card
    gridCardWrapper: { marginBottom: 4 },
    gridCard: { flex: 1, backgroundColor: c.surface1, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: c.glassBorder, ...glassShadow(isDark) },
    gridImgContainer: { aspectRatio: 1, backgroundColor: c.surface2, position: 'relative' },
    cardImg: { width: '100%', height: '100%' },
    discountBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(239, 68, 68, 0.95)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm, overflow: 'hidden' },
    discountText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    categoryBadge: { position: 'absolute', top: 8, left: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
    categoryText: { fontSize: 10, color: c.text, fontWeight: '600' },
    gridContent: { padding: 12 },
    cardTitle: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 4, height: 36, letterSpacing: -0.2 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
    ratingText: { fontSize: 11, color: c.textMuted },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 8 },
    price: { fontSize: 16, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    originalPrice: { fontSize: 11, color: c.textSubtle, textDecorationLine: 'line-through' },
    btnSm: { backgroundColor: c.surface3, paddingVertical: 6, alignItems: 'center', borderRadius: Radius.sm },
    btnSmText: { color: c.text, fontSize: 12, fontWeight: '700' },

    // List Card
    listCard: { flexDirection: 'row', backgroundColor: c.surface1, borderRadius: Radius.lg, padding: 12, gap: 12, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.glassBorder, ...glassShadow(isDark) },
    listImgContainer: { width: 96, height: 96, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: c.surface2 },
    listContent: { flex: 1 },
    listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
    locationText: { fontSize: 11, color: c.textMuted },
    descText: { fontSize: 11, color: c.textMuted, marginBottom: 8 },
    listFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' },

    // Map Specific
    mapContainer: { flex: 1, borderRadius: Radius.xl, overflow: 'hidden', marginTop: 8 },
    mapFloatBtnContainer: { position: 'absolute', bottom: 24, alignSelf: 'center', zIndex: 20 },
    mapFloatBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: Radius.xl, gap: 8, ...glassShadow(isDark) },
    mapFloatBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    // Map List Overlay
    mapListOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: MAP_LIST_HEIGHT, backgroundColor: c.surface1, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: c.glassBorder, ...glassShadow(isDark), zIndex: 30 },
    mapListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.glassBorder },
    mapListHandle: { width: 40, height: 4, borderRadius: Radius.sm, backgroundColor: c.border },
    closeListBtn: { position: 'absolute', right: 16, top: 16, padding: 4 },
    mapListTitle: { fontSize: 16, fontWeight: '800', color: c.text, margin: 16 },
});
};

// HOC inyectado automáticamente para soporte de teclado
const HOC_KeyboardAvoidingView_MarketplaceScreen = (props: any) => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <MarketplaceScreen {...props} />
    </KeyboardAvoidingView>
);
export default HOC_KeyboardAvoidingView_MarketplaceScreen;
