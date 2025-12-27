import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ScrollView, Platform, useWindowDimensions, Image, Animated, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShoppingCart, Heart, Search, Filter, LayoutGrid, List, MapPin, Plus as PlusIcon, Gift, Ticket, Star, Calendar, X } from 'lucide-react-native';

import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useMarketplace } from '../contexts/MarketplaceContext';
import { useFavorites } from '../contexts/FavoritesContext';

import { MobileHeader } from '../components/MobileHeader';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { SidebarMenu } from '../components/SidebarMenu';
import { AdvancedFilters } from '../components/AdvancedFilters';
import { RadiusFilterCard } from '../components/marketplace/RadiusFilterCard';
import { MapView as MarketplaceMap } from '../components/marketplace/MapView';
import { ItemDetailView } from '../components/ItemDetailView';

type ViewMode = 'grid' | 'list' | 'map';
type ItemType = 'products' | 'bonos' | 'events' | 'businesses';

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
    type: 'product' | 'bono' | 'event' | 'business';
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

const PROMO_ITEMS: MarketplaceFeedItem[] = [
    {
        id: 'promo_bono_001',
        type: 'bono',
        name: 'Bono 2x1 Gastronomía',
        price: 25,
        discount: 50,
        image: 'https://images.unsplash.com/photo-1674735967100-544dd340ddab?w=1080',
        category: 'Bonos',
        location: { lat: -34.604722, lng: -58.382592, name: 'Experiencias Gourmet' },
        distance: 1.9,
        description: 'Promoción 2x1 en restaurantes aliados. Válido 15 días.',
        validUntil: '15 días',
    },
    {
        id: 'promo_bono_002',
        type: 'bono',
        name: 'Cashback Wellness $40',
        price: 12,
        discount: 40,
        image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1080',
        category: 'Bonos',
        location: { lat: -34.606722, lng: -58.384592, name: 'Wellness Partners' },
        distance: 2.4,
        description: 'Recibe $40 de cashback en experiencias wellness seleccionadas.',
    },
    {
        id: 'promo_event_001',
        type: 'event',
        name: 'Mercado Creativo Palermo',
        price: 10,
        image: 'https://images.unsplash.com/photo-1523475472560-d2df97ec485c?w=1080',
        category: 'Eventos',
        location: { lat: -34.588722, lng: -58.420592, name: 'Plaza Palermo' },
        distance: 4.5,
        description: 'Evento con diseñadores independientes y música en vivo.',
        date: '12 Mar',
        time: '18:00',
    },
    // Migrated Business Markers
    {
        id: '1',
        type: 'business',
        name: 'Sushi Supreme',
        price: 0, // Placeholder
        rating: 4.8,
        reviews: 124,
        image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400',
        category: 'Restaurante',
        location: { lat: -34.6037, lng: -58.3816, name: 'Av. Corrientes 1234' },
        distance: 1.2,
        description: 'El mejor sushi de la ciudad.',
    },
    {
        id: '2',
        type: 'business',
        name: 'PowerGym Center',
        price: 0,
        rating: 4.5,
        reviews: 89,
        image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400',
        category: 'Gimnasio',
        location: { lat: -34.6080, lng: -58.3750, name: 'Florida 500' },
        distance: 0.8,
        description: 'Entrena duro, vive mejor.',
    },
    {
        id: '3',
        type: 'business',
        name: 'Moda Urbana',
        price: 0,
        rating: 4.6,
        reviews: 56,
        image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400',
        category: 'Ropa',
        location: { lat: -34.5990, lng: -58.3900, name: 'Santa Fe 2000' },
        distance: 2.1,
        description: 'Tendencias urbanas para todos.',
    },
    {
        id: '4',
        type: 'business',
        name: 'Café del Sol',
        price: 0,
        rating: 4.9,
        reviews: 210,
        image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400',
        category: 'Cafetería',
        location: { lat: -34.6050, lng: -58.3850, name: 'Callao 450' },
        distance: 1.5,
        description: 'Tu café de especialidad favorito.',
    }
];


export default function MarketplaceScreen({ navigation, route, initialParams }: any) {
    const { width } = useWindowDimensions();
    const { addItem, openCart, items: cartItems } = useCart();
    const { user, requireAuth } = useAuth();
    const { isFavorite, toggleFavorite } = useFavorites();
    const { products } = useMarketplace();

    const canPublish = !!user && (user.role === 'business' || user.role === 'consumer');

    // Determine params from either navigation route or direct prop (for tab mode)
    const activeParams = initialParams || route?.params;

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
            setFilter(activeParams.filter === 'products' ? 'products' : activeParams.filter === 'bonos' ? 'bonos' : activeParams.filter === 'events' ? 'events' : 'all');
        }
        if (activeParams?.viewMode) {
            setViewMode(activeParams.viewMode);
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

    const productItems = useMemo<MarketplaceFeedItem[]>(() => {
        return products.map((product) => {
            const primaryImage =
                product.images.find((img) => img.isPrimary)?.url ||
                product.images[0]?.url ||
                'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1080';

            const originalPrice = product.condition === 'used'
                ? Number((product.price * 1.18).toFixed(0))
                : undefined;

            const discount = originalPrice
                ? Math.max(0, Math.round((1 - product.price / originalPrice) * 100))
                : undefined;

            return {
                id: product.id,
                type: 'product',
                name: product.title,
                price: product.price,
                originalPrice,
                discount,
                rating: product.rating?.average,
                reviews: product.rating?.count,
                image: primaryImage,
                gallery: product.images.map((img) => img.url),
                category: product.category,
                location: {
                    lat: product.location.lat,
                    lng: product.location.lng,
                    name: product.location.name,
                    address: product.location.address,
                },
                distance: Number(product.location.distanceKm ?? 0),
                description: product.description,
                sellerId: product.seller.id,
                sellerName: product.seller.name,
                condition: product.condition,
                damageDescription: product.damageDescription,
                shippingWeightKg: product.shippingProfile.weightKg,
                shippingDimensionsCm: product.shippingProfile.dimensionsCm,
                sourceProductId: product.id,
            } as MarketplaceFeedItem;
        });
    }, [products]);

    const combinedItems = useMemo<MarketplaceFeedItem[]>(() => {
        const extras = PROMO_ITEMS.map((item) => ({ ...item }));
        return [...productItems, ...extras];
    }, [productItems]);

    const applyFilters = (items: MarketplaceFeedItem[]) => {
        let result = items.filter(item => {
            if (filter !== 'all' && (
                (filter === 'products' && item.type !== 'product') ||
                (filter === 'bonos' && item.type !== 'bono') ||
                (filter === 'events' && item.type !== 'event')
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

        // Radius filtering could be done using proper Lat/Lng calcs, keeping simple for ahora
        result = result.filter(item => item.distance <= radius);

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
            case 'bono': return Gift;
            case 'event': return Ticket;
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
                style={[marketplaceStyles.gridCard, { width: (width - 48) / 2 }]}
                activeOpacity={0.9}
                onPress={() => setDetailItemId(item.id)}
            >
                <View style={marketplaceStyles.gridImgContainer}>
                    <ImageWithFallback src={item.image} style={marketplaceStyles.cardImg} />
                    {item.discount > 0 && (
                        <View style={marketplaceStyles.discountBadge}>
                            <Text style={marketplaceStyles.discountText}>-{item.discount}%</Text>
                        </View>
                    )}
                    {/* Favorites Button */}
                    <TouchableOpacity
                        style={[marketplaceStyles.favBtn, saved && marketplaceStyles.favBtnActive]}
                        onPress={(e) => {
                            e.stopPropagation();
                            toggleFavorite(item);
                        }}
                    >
                        <Heart size={16} color={saved ? '#EF4444' : '#6B7280'} fill={saved ? '#EF4444' : 'transparent'} />
                    </TouchableOpacity>

                    <View style={marketplaceStyles.categoryBadge}>
                        <Icon size={10} color="#374151" style={{ marginRight: 4 }} />
                        <Text style={marketplaceStyles.categoryText}>{item.category}</Text>
                    </View>
                </View>

                <View style={marketplaceStyles.gridContent}>
                    <Text style={marketplaceStyles.cardTitle} numberOfLines={2}>{item.name}</Text>

                    {item.type === 'product' && item.rating && (
                        <View style={marketplaceStyles.ratingRow}>
                            <Star size={12} color="#FBBF24" fill="#FBBF24" />
                            <Text style={marketplaceStyles.ratingText}>{item.rating}</Text>
                        </View>
                    )}
                    {item.type === 'event' && (
                        <View style={marketplaceStyles.ratingRow}>
                            <Calendar size={12} color="#6B7280" />
                            <Text style={marketplaceStyles.ratingText}>{item.date} • {item.time}</Text>
                        </View>
                    )}

                    <View style={marketplaceStyles.priceRow}>
                        <Text style={marketplaceStyles.price}>${item.price}</Text>
                        {item.originalPrice && (
                            <Text style={marketplaceStyles.originalPrice}>${item.originalPrice}</Text>
                        )}
                    </View>

                    {item.type === 'business' ? (
                        <TouchableOpacity
                            style={[marketplaceStyles.btnSm, { backgroundColor: '#10B981' }]}
                            onPress={(e) => {
                                e.stopPropagation();
                                navigation.navigate('BusinessDetail', { businessId: item.id, business: item });
                            }}
                        >
                            <Text style={marketplaceStyles.btnSmText}>Ver Perfil</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={marketplaceStyles.btnSm}
                            onPress={(e) => {
                                e.stopPropagation();
                                handleAddToCart(item);
                            }}
                        >
                            <Text style={marketplaceStyles.btnSmText}>Agregar</Text>
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
                style={marketplaceStyles.listCard}
                activeOpacity={0.9}
                onPress={() => setDetailItemId(item.id)}
            >
                <View style={marketplaceStyles.listImgContainer}>
                    <ImageWithFallback src={item.image} style={marketplaceStyles.cardImg} />
                    {item.discount > 0 && (
                        <View style={[marketplaceStyles.discountBadge, { top: 4, right: 4 }]}>
                            <Text style={marketplaceStyles.discountText}>-{item.discount}%</Text>
                        </View>
                    )}
                </View>

                <View style={marketplaceStyles.listContent}>
                    <View style={marketplaceStyles.listHeader}>
                        <Text style={marketplaceStyles.cardTitle} numberOfLines={1}>{item.name}</Text>
                        {/* Favorites Button (List) */}
                        <TouchableOpacity
                            onPress={(e) => {
                                e.stopPropagation();
                                toggleFavorite(item);
                            }}
                            style={{ padding: 4 }}
                        >
                            <Heart size={18} color={saved ? '#EF4444' : '#9CA3AF'} fill={saved ? '#EF4444' : 'transparent'} />
                        </TouchableOpacity>
                    </View>
                    <View style={[marketplaceStyles.categoryBadge, { position: 'relative', top: 0, left: 0, alignSelf: 'flex-start', marginBottom: 6 }]}>
                        <Icon size={10} color="#374151" style={{ marginRight: 2 }} />
                        <Text style={marketplaceStyles.categoryText}>{item.type}</Text>
                    </View>

                    <View style={marketplaceStyles.locationRow}>
                        <MapPin size={12} color="#6B7280" />
                        <Text style={marketplaceStyles.locationText}>{item.location.name} • {item.distance}km</Text>
                    </View>

                    {item.type === 'bono' && <Text style={marketplaceStyles.descText} numberOfLines={1}>{item.description}</Text>}

                    <View style={marketplaceStyles.listFooter}>
                        <View style={marketplaceStyles.priceRow}>
                            <Text style={marketplaceStyles.price}>${item.price}</Text>
                        </View>
                        {item.type === 'business' ? (
                            <TouchableOpacity
                                style={[marketplaceStyles.btnSm, { backgroundColor: '#10B981', width: 'auto', paddingHorizontal: 16 }]}
                                onPress={(e) => {
                                    e.stopPropagation();
                                    navigation.navigate('BusinessDetail', { businessId: item.id, business: item });
                                }}
                            >
                                <Text style={marketplaceStyles.btnSmText}>Ver Perfil</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={[marketplaceStyles.btnSm, { backgroundColor: '#111827', width: 'auto', paddingHorizontal: 16 }]}
                                onPress={(e) => {
                                    e.stopPropagation();
                                    handleAddToCart(item);
                                }}
                            >
                                <Text style={marketplaceStyles.btnSmText}>Agregar</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={marketplaceStyles.container}>
            <LinearGradient colors={['#F9FAFB', '#F3F4F6']} style={StyleSheet.absoluteFill} />

            <MobileHeader
                title="Marketplace"
                subtitle="Productos, Bonos y Eventos"
                onMenuPress={() => setIsSidebarOpen(true)}
                actions={
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        {canPublish && (
                            <TouchableOpacity
                                onPress={() => navigation.navigate('CreateListing')}
                                style={{ padding: 4 }}
                            >
                                <PlusIcon size={24} color="#374151" />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={marketplaceStyles.cartBtn}
                            onPress={openCart}
                        >
                            <ShoppingCart size={20} color="#374151" />
                            {cartItems.length > 0 && (
                                <View style={marketplaceStyles.cartBadge} />
                            )}
                        </TouchableOpacity>
                    </View>
                }
            />

            <View style={marketplaceStyles.headerControls}>
                {/* Search & Filter Row */}
                <View style={marketplaceStyles.searchRow}>
                    <View style={marketplaceStyles.searchInputContainer}>
                        <Search size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                        <TextInput
                            style={marketplaceStyles.searchInput}
                            placeholder="Buscar productos, bonos..."
                            placeholderTextColor="#9CA3AF"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>
                    <TouchableOpacity
                        style={marketplaceStyles.filterBtn}
                        onPress={() => setAdvancedFiltersOpen(true)}
                    >
                        <Filter size={20} color="#374151" />
                        {activeFiltersCount > 0 && (
                            <View style={marketplaceStyles.activeFilterBadge}>
                                <Text style={marketplaceStyles.activeFilterText}>{activeFiltersCount}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                {/* View Toggles */}
                <View style={marketplaceStyles.viewToggleContainer}>
                    {[
                        { id: 'grid', Icon: LayoutGrid, label: 'Grid' },
                        { id: 'list', Icon: List, label: 'Lista' },
                        { id: 'map', Icon: MapPin, label: 'Mapa' }
                    ].map((mode) => {
                        const active = viewMode === mode.id;
                        return (
                            <TouchableOpacity
                                key={mode.id}
                                style={[marketplaceStyles.toggleBtn, active && marketplaceStyles.toggleBtnActive]}
                                onPress={() => setViewMode(mode.id as ViewMode)}
                            >
                                <mode.Icon size={16} color={active ? '#7C3AED' : '#6B7280'} />
                                <Text style={[marketplaceStyles.toggleBtnText, active && marketplaceStyles.toggleBtnTextActive]}>{mode.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Categories Tabs (single segmented bar like Grid/Lista/Mapa) */}
                <View style={[marketplaceStyles.viewToggleContainer, { marginBottom: 8 }]}>
                    {(['all', 'products', 'bonos', 'events'] as const).map((t) => {
                        const active = filter === t;
                        const label =
                            t === 'products' ? 'Productos' :
                                t === 'bonos' ? 'Bonos' :
                                    t === 'events' ? 'Eventos' : 'Todos';

                        return (
                            <TouchableOpacity
                                key={t}
                                style={[marketplaceStyles.toggleBtn, active && marketplaceStyles.toggleBtnActive]}
                                onPress={() => setFilter(t as any)}
                            >
                                <Text style={[marketplaceStyles.categoryToggleText, active && marketplaceStyles.categoryToggleTextActive]}>
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {/* Content Area */}
            <View style={{ flex: 1 }}>
                {viewMode === 'map' ? (
                    <View style={{ flex: 1 }}>
                        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
                            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, zIndex: 10 }}>
                                <RadiusFilterCard
                                    radius={radius}
                                    setRadius={(val: number) => {
                                        const clamped = Math.max(0.5, Math.min(25, val));
                                        setRadius(clamped);
                                    }}
                                    resultsCount={filteredItems.length}
                                    onMoveCenter={() => {
                                        // Set center to current map view center (if known).
                                        setAdvancedFilters(prev => ({
                                            ...prev,
                                            searchLocation: currentMapCenter || prev.searchLocation || { lat: -34.603722, lng: -58.381592 },
                                        }));
                                    }}
                                    isCustomMode={true}
                                />
                            </View>
                            <View style={marketplaceStyles.mapContainer}>
                                <MarketplaceMap
                                    items={filteredItems}
                                    onItemClick={(item) => {
                                        if (item.type === 'business') {
                                            // Navigate to Business Profile for businesses
                                            navigation.navigate('BusinessDetail', { businessId: item.id, business: item });
                                        } else {
                                            // Use internal detail modal for products/events
                                            setDetailItemId(item.id);
                                        }
                                    }}
                                    radius={radius}
                                    searchLocation={advancedFilters.searchLocation}
                                    onSearchLocationChange={(loc) => setAdvancedFilters(prev => ({ ...prev, searchLocation: loc }))}
                                    isCustomSearch={true}
                                    onRegionChange={(region) => setCurrentMapCenter({ lat: region.latitude, lng: region.longitude })}
                                />
                            </View>
                        </ScrollView>

                        {/* Floating "See List" Button */}
                        {!isMapListVisible && (
                            <Animated.View style={[marketplaceStyles.mapFloatBtnContainer, { transform: [{ translateY: mapListAnim }] }]}>
                                <TouchableOpacity
                                    style={marketplaceStyles.mapFloatBtn}
                                    onPress={() => setIsMapListVisible(true)}
                                    activeOpacity={0.9}
                                >
                                    <List size={20} color="#fff" />
                                    <Text style={marketplaceStyles.mapFloatBtnText}>Ver lista ({filteredItems.length})</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        )}

                        {/* Map List Overlay */}
                        <Animated.View
                            style={[
                                marketplaceStyles.mapListOverlay,
                                { transform: [{ translateY: mapListAnim }] }
                            ]}
                        >
                            <View style={marketplaceStyles.mapListHeader}>
                                <View style={marketplaceStyles.mapListHandle} />
                                <TouchableOpacity style={marketplaceStyles.closeListBtn} onPress={() => setIsMapListVisible(false)}>
                                    <X size={20} color="#6B7280" />
                                </TouchableOpacity>
                            </View>
                            <Text style={marketplaceStyles.mapListTitle}>Resultados en esta zona ({filteredItems.length})</Text>

                            <FlatList
                                data={filteredItems}
                                keyExtractor={(item) => item.id.toString()}
                                renderItem={renderListItem}
                                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                                showsVerticalScrollIndicator={false}
                            />
                        </Animated.View>
                    </View>
                ) : (
                    <FlatList
                        data={filteredItems}
                        key={viewMode}
                        numColumns={viewMode === 'grid' ? 2 : 1}
                        keyExtractor={(item) => item.id.toString()}
                        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                        columnWrapperStyle={viewMode === 'grid' ? { justifyContent: 'space-between' } : undefined}
                        renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
                        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View>

            {/* Modals */}
            {selectedItem && (
                <ItemDetailView
                    item={selectedItem}
                    product={selectedProduct}
                    onClose={() => setDetailItemId(null)}
                    onAddToCart={() => handleAddToCart(selectedItem)}
                    onOpenCart={openCart}
                />
            )}

            <AdvancedFilters
                open={advancedFiltersOpen}
                onOpenChange={setAdvancedFiltersOpen}
                currentFilters={advancedFilters}
                onApplyFilters={setAdvancedFilters}
                filterType={filter}
            />

            <SidebarMenu visible={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} navigation={navigation} />
        </View>
    );
}

const marketplaceStyles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    headerControls: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    cartBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
    cartBadge: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },

    // Favorites
    favBtn: { position: 'absolute', top: 8, left: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    favBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },

    // Search
    searchRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    searchInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: '#F3F4F6', height: 48 },
    searchInput: { flex: 1, paddingHorizontal: 16, fontSize: 14, color: '#1F2937' },
    filterBtn: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' },
    activeFilterBadge: { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
    activeFilterText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

    // Toggles
    viewToggleContainer: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 24, padding: 4, marginBottom: 16 },
    toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 20 },
    toggleBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
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
    gridCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
    gridImgContainer: { height: 144, backgroundColor: '#F3F4F6', position: 'relative' },
    cardImg: { width: '100%', height: '100%' },
    discountBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    discountText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    categoryBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, flexDirection: 'row', alignItems: 'center' },
    categoryText: { fontSize: 10, color: '#374151', fontWeight: '500' },
    gridContent: { padding: 12 },
    cardTitle: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 4, height: 36 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
    ratingText: { fontSize: 11, color: '#6B7280' },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 8 },
    price: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
    originalPrice: { fontSize: 11, color: '#9CA3AF', textDecorationLine: 'line-through' },
    btnSm: { backgroundColor: '#111827', paddingVertical: 6, alignItems: 'center', borderRadius: 8 },
    btnSmText: { color: '#fff', fontSize: 12, fontWeight: '600' },

    // List Card
    listCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 12, gap: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    listImgContainer: { width: 96, height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: '#F3F4F6' },
    listContent: { flex: 1 },
    listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
    locationText: { fontSize: 11, color: '#6B7280' },
    descText: { fontSize: 11, color: '#6B7280', marginBottom: 8 },
    listFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' },

    // Map Helper
    mapContainer: { height: 650, borderRadius: 24, overflow: 'hidden', marginHorizontal: 16, backgroundColor: '#E5E7EB' },

    // Map List Overlay Styles
    mapFloatBtnContainer: { position: 'absolute', bottom: 30, left: 0, right: 0, alignItems: 'center', zIndex: 20 },
    mapFloatBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6, gap: 8 },
    mapFloatBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

    mapListOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: MAP_LIST_HEIGHT,
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 20,
        zIndex: 30
    },
    mapListHeader: { alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    mapListHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, marginBottom: 8 },
    closeListBtn: { position: 'absolute', right: 16, top: 16, padding: 4 },
    mapListTitle: { fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 4, marginLeft: 16, marginTop: 8 },
});
