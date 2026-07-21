import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Animated, ImageBackground, Image, useWindowDimensions } from 'react-native';
import { Sparkles, MapPin, Zap, ShoppingBag, ShoppingCart, Percent, Calendar, Tag, Star, DollarSign, ArrowRight, TrendingUp } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';

import { MobileHeader } from '../components/MobileHeader';
import { MobileNav, type NavSection, NAV_CONTENT_HEIGHT } from '../components/MobileNav';
import { SidebarMenu } from '../components/SidebarMenu';
import CartSidebar from '../components/CartSidebar';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { PointsManager } from '../components/PointsManager';

import { useResponsive } from '../hooks/useResponsive';
import { ResponsiveLayout } from '../components/ResponsiveLayout';
import { DesktopSidebar } from '../components/DesktopSidebar';

import MarketplaceScreen from './MarketplaceScreen';
import SocialScreen from './SocialScreen';
import BusinessDashboardScreen from './BusinessDashboardScreen';
import InfluencerDashboardScreen from './InfluencerDashboardScreen';
import AdminDashboardScreen from './AdminDashboardScreen';
import { glassShadow, Radius, colors } from '../theme/tokens';


const heroSlides = [
    {
        id: 1,
        title: 'Descuentos Exclusivos en Moda de Verano',
        subtitle: 'Renueva tu armario con las últimas tendencias.',
        image: 'https://images.unsplash.com/photo-1733564377865-997953d57fd4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzdW1tZXIlMjBmYXNoaW9uJTIwc2hvcHBpbmd8ZW58MXx8fHwxNzYxNDA3MjYwfDA&ixlib=rb-4.1.0&q=80&w=1080',
        cta: 'Comprar Ahora',
        filter: 'products',
    },
    {
        id: 2,
        title: 'Eventos Latinos Increíbles',
        subtitle: 'Conciertos, fiestas y más cerca de ti.',
        image: 'https://images.unsplash.com/photo-1743791022256-40413c5f019b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb25jZXJ0JTIwZXZlbnQlMjBtdXNpY3xlbnwxfHx8fDE3NjE0MDcyNjN8MA&ixlib=rb-4.1.0&q=80&w=1080',
        cta: 'Ver Eventos',
        filter: 'events',
    },
    {
        id: 3,
        title: 'Bonos y Cupones Especiales',
        subtitle: 'Ahorra en tus negocios favoritos.',
        image: 'https://images.unsplash.com/photo-1532795986-dbef1643a596?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzaG9wcGluZyUyMGRlYWxzJTIwZGlzY291bnR8ZW58MXx8fHwxNzYxMzAyMDc3fDA&ixlib=rb-4.1.0&q=80&w=1080',
        cta: 'Explorar Bonos',
        filter: 'bonos',
    },
];

const featuredOffers = [
    { id: 1, title: 'Super Descuentos', subtitle: 'Hasta 50% OFF', image: 'https://images.unsplash.com/photo-1700843699012-0dadd2089fe4?w=1080', badge: '50% OFF', badgeColor: '#EF4444', gradient: ['rgba(37,99,235,0.9)', 'rgba(41, 182, 246,0.9)'], icon: Percent, filter: 'products', advancedFilters: { minDiscount: 50 } },
    { id: 2, title: 'Eventos Latinos', subtitle: 'Música en vivo', image: 'https://images.unsplash.com/photo-1618414098138-c33f9e82b405?w=1080', badge: 'Nuevo', badgeColor: '#22C55E', gradient: ['rgba(219,39,119,0.9)', 'rgba(234,88,12,0.9)'], icon: Calendar, filter: 'events' },
    { id: 3, title: 'Bonos Exclusivos', subtitle: 'Negocios locales', image: 'https://images.unsplash.com/photo-1671749999622-4087a86868cc?w=1080', badge: 'Popular', badgeColor: '#4FC3F7', gradient: ['rgba(33, 150, 243,0.9)', 'rgba(41, 182, 246,0.9)'], icon: Tag, filter: 'bonos' },
];

const categoryCards = [
    { id: 1, title: 'Moda', image: 'https://images.unsplash.com/photo-1733564377865-997953d57fd4?w=1080', badge: 'Marketplace', badgeColor: '#3B82F6', filter: 'products', gradient: ['rgba(17,24,39,0.4)', 'rgba(17,24,39,0.2)', 'transparent'] },
    { id: 2, title: 'Beauty & Care', image: 'https://images.unsplash.com/photo-1643379855122-3d3162b56a99?w=1080', badge: 'Marketplace', badgeColor: '#3B82F6', filter: 'products', gradient: ['rgba(17,24,39,0.4)', 'rgba(17,24,39,0.2)', 'transparent'] },
    { id: 3, title: 'Discotecas y Bares', image: 'https://images.unsplash.com/photo-1744313930610-1649242d1fcd?w=1080', badge: 'Eventos', badgeColor: '#F97316', filter: 'events', gradient: ['rgba(17,24,39,0.6)', 'rgba(17,24,39,0.3)', 'transparent'] },
    { id: 4, title: 'Restaurantes', image: 'https://images.unsplash.com/photo-1676471932681-45fa972d848a?w=1080', badge: 'Marketplace', badgeColor: '#3B82F6', filter: 'products', gradient: ['rgba(17,24,39,0.5)', 'rgba(17,24,39,0.25)', 'transparent'] },
    { id: 5, title: 'Restaurantes', image: 'https://images.unsplash.com/photo-1656439659132-24c68e36b553?w=1080', badge: 'Cupones', badgeColor: '#22C55E', filter: 'bonos', gradient: ['rgba(17,24,39,0.6)', 'rgba(17,24,39,0.3)', 'transparent'] },
    { id: 6, title: 'Influencers', image: 'https://images.unsplash.com/photo-1613053341193-2b7f654c155f?w=1080', badge: 'Red Social', badgeColor: '#EC4899', filter: 'all', action: 'social', gradient: ['rgba(17,24,39,0.4)', 'rgba(17,24,39,0.2)', 'transparent'] },
];

const quickActions = [
    { id: 1, title: 'Mi Mascota', icon: Sparkles, color: '#2196F3', bg: 'rgba(33, 150, 243,0.1)', action: 'mascota' },
    { id: 2, title: 'Mapa', icon: MapPin, color: '#2563EB', bg: 'rgba(37,99,235,0.1)', action: 'marketplace-map' },
    { id: 3, title: 'Mis Puntos', icon: Zap, color: '#D97706', bg: 'rgba(217,119,6,0.1)', action: 'points' },
];

const consumptionData: any[] = [];

export default function HomeScreen({ navigation, route }: any) {
    const { user, sessionToken } = useAuth();
    const { openCart, items: cartItems } = useCart();
    const { width: windowWidth } = useWindowDimensions();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();
    const { isDesktop } = useResponsive();
    const styles = getStyles(isDark);

    const myOrders = useQuery(api.orders.getMyOrders, user?.id ? { sessionToken, userId: user.id } : "skip") || [];
    const mySellerOrders = useQuery(api.orders.getOrdersBySeller, user?.id ? { sellerId: user.id } : "skip") || [];

    const allActivity = useMemo(() => {
        const purchases = myOrders.map((o: any) => ({
            id: `buy-${o._id}`,
            name: o.items?.[0]?.title || 'Compra',
            date: o.createdAt,
            amount: `$${(o.total || 0).toFixed(2)}`,
            rawAmount: o.total || 0,
            status: o.status === 'completed' ? 'Completado' : o.status === 'cancelled' ? 'Cancelado' : 'Pendiente',
            statusColor: o.status === 'completed' ? '#16A34A' : o.status === 'cancelled' ? '#EF4444' : '#D97706',
            image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop',
            description: `${o.items?.length || 0} item(s)`,
            type: 'purchase',
        }));
        const sales = mySellerOrders.map((o: any) => ({
            id: `sell-${o._id}`,
            name: o.items?.[0]?.title || 'Venta',
            date: o.createdAt,
            amount: `+$${(o.total || 0).toFixed(2)}`,
            rawAmount: o.total || 0,
            status: o.status === 'completed' ? 'Completado' : o.status === 'cancelled' ? 'Cancelado' : 'Pendiente',
            statusColor: o.status === 'completed' ? '#16A34A' : o.status === 'cancelled' ? '#EF4444' : '#D97706',
            image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop',
            description: `Venta a ${String(o.userId).slice(-6)}`,
            type: 'sale',
        }));
        return [...purchases, ...sales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [myOrders, mySellerOrders]);

    const monthStats = useMemo(() => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const recent = allActivity.filter(a => new Date(a.date) >= monthStart);
        const totalSpent = recent
            .filter(a => a.type === 'purchase' && a.status === 'Completado')
            .reduce((sum, a) => sum + a.rawAmount, 0);
        const totalEarned = recent
            .filter(a => a.type === 'sale' && a.status === 'Completado')
            .reduce((sum, a) => sum + a.rawAmount, 0);
        return { totalSpent, totalEarned, count: recent.length };
    }, [allActivity]);

    // UI State
    const [activeTab, setActiveTab] = useState<NavSection>('home');
    const [view, setView] = useState<'home' | 'consumos' | 'puntos'>('home');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [marketplaceParams, setMarketplaceParams] = useState<any>(null);
    const [gridWidth, setGridWidth] = useState(windowWidth - 32);

    // Initial Tab from Params
    useEffect(() => {
        if (route.params?.initialTab) {
            setActiveTab(route.params.initialTab);
        }
    }, [route.params]);

    // Carousel State
    const [currentSlide, setCurrentSlide] = useState(0);
    const fadeAnim = useRef(new Animated.Value(1)).current;

    // Auto-advance carousel
    useEffect(() => {
        if (view !== 'home') return;

        const timer = setInterval(() => {
            Animated.sequence([
                Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
                Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true })
            ]).start();

            setTimeout(() => {
                setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
            }, 300);

        }, 5000);

        return () => clearInterval(timer);
    }, [view]);

    const handleTabChange = (tab: NavSection) => {
        if (tab === 'dashboard' && !user) {
            navigation.navigate('Login');
            return;
        }
        setActiveTab(tab);
    };

    const handleNavigate = (screen: string, params?: any) => {
        if (screen === 'Marketplace') {
            setMarketplaceParams(params);
            setActiveTab('marketplace');
        } else if (screen === 'Social') {
            setActiveTab('social');
        } else {
            navigation.navigate(screen, params);
        }
    };

    const marketplaceInitialParams = { ...marketplaceParams, isTabMode: true };

    // Render helper for quick actions to clean up JSX
    const renderQuickActions = () => (
        <View style={styles.quickActionsGrid}>
            {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                    <TouchableOpacity
                        key={action.id}
                        style={styles.actionBtn}
                        onPress={() => {
                            if (action.action === 'points') setView('puntos');
                            else if (action.action === 'marketplace-map') handleNavigate('Marketplace', { viewMode: 'map' });
                            else if (action.action === 'mascota') navigation.navigate('MiMascota');
                            else console.log(action.action);
                        }}
                    >
                        <View style={[styles.actionIcon, { backgroundColor: isDark ? 'rgba(31, 41, 55, 0.5)' : action.bg }]}>
                            <Icon size={24} color={action.color} />
                        </View>
                        <Text style={styles.actionTitle}>{action.title}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

    // --- MAIN RENDER ---
    return (
        <ResponsiveLayout 
            style={styles.container}
            sidebar={
                <DesktopSidebar 
                    activeSection={activeTab} 
                    onSectionChange={handleTabChange} 
                />
            }
        >
            <LinearGradient
                colors={isDark ? ['#111827', '#000'] : ['#F9FAFB', '#F3F4F6']}
                style={StyleSheet.absoluteFill}
            />

            <View style={{ flex: 1 }}>
                {activeTab === 'home' && (
                    <>
                        <MobileHeader
                            title="Ramgos"
                            subtitle="Descubre la oportunidad"
                            onMenuPress={() => setIsSidebarOpen(true)}
                            actions={
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <TouchableOpacity
                                        style={[styles.headerBtn, view === 'puntos' && styles.headerBtnActive]}
                                        onPress={() => setView(view === 'puntos' ? 'home' : 'puntos')}
                                    >
                                        <Star size={16} color={view === 'puntos' ? '#fff' : (isDark ? '#D1D5DB' : '#374151')} fill={view === 'puntos' ? '#fff' : 'none'} />
                                        <Text style={[styles.headerBtnText, view === 'puntos' && { color: '#fff' }]}>Puntos</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.headerIconBtn}
                                        onPress={openCart}
                                    >
                                        <ShoppingCart size={20} color={isDark ? '#D1D5DB' : '#374151'} />
                                        {cartItems.length > 0 && <View style={styles.badge} />}
                                    </TouchableOpacity>
                                </View>
                            }
                        />

                        {/* View Tabs In-Content */}
                        <View style={styles.viewTabs}>
                            <TouchableOpacity
                                onPress={() => setView('home')}
                                style={[styles.viewTab, view === 'home' && styles.viewTabActive]}
                            >
                                <Sparkles size={16} color={view === 'home' ? (isDark ? '#F9FAFB' : '#111827') : '#6B7280'} />
                                <Text style={[styles.viewTabText, view === 'home' && styles.viewTabTextActive]}>Principal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setView('consumos')}
                                style={[styles.viewTab, view === 'consumos' && styles.viewTabActive]}
                            >
                                <TrendingUp size={16} color={view === 'consumos' ? (isDark ? '#F9FAFB' : '#111827') : '#6B7280'} />
                                <Text style={[styles.viewTabText, view === 'consumos' && styles.viewTabTextActive]}>Actividad</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={{ paddingBottom: NAV_CONTENT_HEIGHT + insets.bottom + 30 }} showsVerticalScrollIndicator={false}>

                            {/* HOME VIEW */}
                            {view === 'home' && (
                                <View style={styles.contentContainer}>
                                    {/* Hero Carousel */}
                                    <View style={styles.heroContainer}>
                                        <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
                                            <ImageBackground source={{ uri: heroSlides[currentSlide].image }} style={styles.heroImage} imageStyle={{ borderRadius: Radius.xl }}>
                                                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} />
                                                <View style={styles.heroContent}>
                                                    <Text style={styles.heroTitle}>{heroSlides[currentSlide].title}</Text>
                                                    <Text style={styles.heroSubtitle}>{heroSlides[currentSlide].subtitle}</Text>
                                                    <TouchableOpacity
                                                        style={styles.heroBtn}
                                                        onPress={() => handleNavigate('Marketplace', { filter: heroSlides[currentSlide].filter })}
                                                    >
                                                        <Text style={styles.heroBtnText}>{heroSlides[currentSlide].cta}</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </ImageBackground>
                                        </Animated.View>

                                        {/* Indicators */}
                                        <View style={styles.indicators}>
                                            {heroSlides.map((_, index) => (
                                                <View
                                                    key={index}
                                                    style={[
                                                        styles.indicatorDot,
                                                        index === currentSlide && styles.indicatorDotActive
                                                    ]}
                                                />
                                            ))}
                                        </View>
                                    </View>

                                    {renderQuickActions()}

                                    {/* Featured Offers */}
                                    <View style={styles.sectionHeader}>
                                        <Text style={styles.sectionTitle}>Ofertas Especiales</Text>
                                        <TouchableOpacity onPress={() => handleNavigate('Marketplace')}>
                                            <Text style={styles.seeAll}>Ver todas <ArrowRight size={14} /></Text>
                                        </TouchableOpacity>
                                    </View>

                                    <View style={styles.grid3}>
                                        {featuredOffers.map((offer) => {
                                            const Icon = offer.icon;
                                            return (
                                                <TouchableOpacity
                                                    key={offer.id}
                                                    style={styles.featuredRef}
                                                    onPress={() => handleNavigate('Marketplace', { 
                                                        filter: offer.filter,
                                                        ...(offer.advancedFilters ? { advancedFilters: offer.advancedFilters } : {})
                                                    })}
                                                >
                                                    <ImageWithFallback src={offer.image} style={styles.featuredImg} />
                                                    <LinearGradient colors={offer.gradient as [string, string, ...string[]]} style={StyleSheet.absoluteFill} />
                                                    <View style={styles.featuredOverlay}>
                                                        <View style={[styles.miniBadge, { backgroundColor: offer.badgeColor }]}>
                                                            <Text style={styles.miniBadgeText}>{offer.badge}</Text>
                                                        </View>
                                                        <View>
                                                            <Icon size={16} color="#fff" style={{ marginBottom: 4 }} />
                                                            <Text style={styles.featuredTitle} numberOfLines={1}>{offer.title}</Text>
                                                            <Text style={styles.featuredSub} numberOfLines={1}>{offer.subtitle}</Text>
                                                        </View>
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>

                                    {/* Categories */}
                                    <View style={[styles.sectionHeader, { marginTop: 24 }]}>
                                        <Text style={styles.sectionTitle}>Categorías</Text>
                                    </View>

                                    <View style={styles.grid2} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
                                        {categoryCards.map((card) => (
                                            <TouchableOpacity
                                                key={card.id}
                                                style={[styles.catCard, { width: (gridWidth - 12) / 2 }]}
                                                onPress={() => {
                                                    if (card.action === 'social') {
                                                        handleNavigate('Social');
                                                    } else {
                                                        handleNavigate('Marketplace', { filter: card.filter });
                                                    }
                                                }}
                                            >
                                                <ImageWithFallback src={card.image} style={styles.catImg} />
                                                <LinearGradient colors={card.gradient as [string, string, ...string[]]} style={StyleSheet.absoluteFill} />
                                                <View style={styles.catOverlay}>
                                                    <View style={[styles.miniBadge, { backgroundColor: card.badgeColor }]}>
                                                        <Text style={styles.miniBadgeText}>{card.badge}</Text>
                                                    </View>
                                                    <Text style={styles.catTitle}>{card.title}</Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Explore CTA */}
                                    <TouchableOpacity
                                        style={styles.exploreCard}
                                        onPress={() => handleNavigate('Marketplace', { viewMode: 'map' })}
                                    >
                                        <Image source={{ uri: 'https://images.unsplash.com/photo-1759091161289-017ad3c7e836?w=1080' }} style={StyleSheet.absoluteFill} />
                                        <LinearGradient colors={['rgba(41, 182, 246,0.9)', 'rgba(219,39,119,0.9)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
                                        <View style={styles.exploreContent}>
                                            <View>
                                                <Text style={styles.exploreTitle}>Explora el Mapa</Text>
                                                <Text style={styles.exploreSub}>Descubre negocios cerca de ti</Text>
                                            </View>
                                            <View style={styles.arrowCircle}>
                                                <ArrowRight size={20} color="#fff" />
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* CONSUMOS VIEW */}
                            {view === 'consumos' && (
                                <View style={styles.contentContainer}>
                                    <View style={styles.summaryCard}>
                                        <LinearGradient
                                            colors={['#2196F3', '#29B6F6', '#DB2777']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={styles.summaryGradient}
                                        >
                                            <View style={styles.summaryHeader}>
                                                <View>
                                                    <Text style={styles.summaryLabel}>Resumen del Mes</Text>
                                                    <Text style={styles.summaryMonth}>
                                                        {new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
                                                    </Text>
                                                </View>
                                                <View style={styles.summaryIcon}>
                                                    <DollarSign size={24} color="#fff" />
                                                </View>
                                            </View>

                                            <View style={styles.summaryGrid}>
                                                <View style={styles.summaryStat}>
                                                    <Text style={styles.statLabel}>Total Gastado</Text>
                                                    <Text style={styles.statValue}>${monthStats.totalSpent.toFixed(2)}</Text>
                                                    <Text style={styles.statSub}>{monthStats.count} transacciones</Text>
                                                </View>
                                                <View style={styles.summaryStat}>
                                                    <Text style={styles.statLabel}>Ingresos (Ventas)</Text>
                                                    <Text style={styles.statValue}>${monthStats.totalEarned.toFixed(2)}</Text>
                                                    <Text style={[styles.statSub, { color: '#6EE7B7' }]}>Tus ganancias</Text>
                                                </View>
                                            </View>
                                        </LinearGradient>
                                    </View>


                                    {/* Timeline */}
                                    <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                                        <Text style={styles.sectionTitle}>Historial</Text>
                                        <View style={styles.pillBadge}>
                                            <Text style={styles.pillText}>Últimos 30 días</Text>
                                        </View>
                                    </View>

                                    {allActivity.length === 0 ? (
                                        <View style={{ padding: 24, alignItems: 'center' }}>
                                            <Text style={{ color: colors(isDark).textMuted }}>No hay actividad reciente.</Text>
                                        </View>
                                    ) : (
                                        <View style={{ gap: 12, marginTop: 12 }}>
                                            {allActivity.map((item, idx) => (
                                                <View key={item.id || idx} style={styles.historyItem}>
                                                    <Image source={{ uri: item.image }} style={styles.historyImg} />
                                                    <View style={styles.historyInfo}>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                            <Text style={styles.historyName}>{item.name}</Text>
                                                            <View style={[styles.statusBadge, { borderColor: item.statusColor }]}>
                                                                <Text style={[styles.statusText, { color: item.statusColor }]}>{item.status}</Text>
                                                            </View>
                                                        </View>
                                                        <Text style={styles.historyDesc}>{item.description}</Text>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                                                            <Text style={styles.historyDate}>{new Date(item.date).toLocaleDateString()}</Text>
                                                            <Text style={styles.historyAmount}>{item.amount}</Text>
                                                        </View>
                                                    </View>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* POINTS VIEW */}
                            {view === 'puntos' && (
                                <View style={styles.contentContainer}>
                                    <PointsManager />
                                </View>
                            )}

                        </ScrollView>
                    </>
                )}

                {activeTab === 'marketplace' && <MarketplaceScreen navigation={navigation} initialParams={marketplaceInitialParams} />}
                {activeTab === 'social' && <SocialScreen isTabMode={true} />}
                {activeTab === 'dashboard' && (
                    user?.role === 'business' ? <BusinessDashboardScreen isTabMode onMenuPress={() => setIsSidebarOpen(true)} /> :
                        user?.role === 'influencer' ? <InfluencerDashboardScreen isTabMode onMenuPress={() => setIsSidebarOpen(true)} /> :
                            user?.role === 'admin' ? <AdminDashboardScreen isTabMode onMenuPress={() => setIsSidebarOpen(true)} /> :
                                <View style={styles.center}><Text>No Dashboard Access</Text></View>
                )}
            </View>

            {!isDesktop && <MobileNav activeSection={activeTab} onSectionChange={handleTabChange} />}
            <SidebarMenu visible={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
            <CartSidebar />
        </ResponsiveLayout>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors(isDark).glass, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.xl },
    headerBtnActive: { backgroundColor: isDark ? '#4B5563' : '#111827' },
    headerBtnText: { fontSize: 13, fontWeight: '600', color: isDark ? '#9CA3AF' : '#374151', marginLeft: 6 },
    headerIconBtn: { width: 36, height: 36, borderRadius: Radius.lg, backgroundColor: colors(isDark).glass, justifyContent: 'center', alignItems: 'center' },
    badge: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: Radius.sm, backgroundColor: '#EF4444' },

    viewTabs: { flexDirection: 'row', marginHorizontal: 16, marginVertical: 12, padding: 4, backgroundColor: colors(isDark).glass, borderRadius: Radius.lg },
    viewTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: Radius.md },
    viewTabActive: { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', ...glassShadow(isDark),},
    viewTabText: { fontSize: 13, fontWeight: '600', color: colors(isDark).textMuted, marginLeft: 6 },
    viewTabTextActive: { color: colors(isDark).text },

    contentContainer: { paddingHorizontal: 16 },
    heroContainer: { height: 380, borderRadius: Radius.xl, overflow: 'hidden', marginBottom: 20, backgroundColor: colors(isDark).glass },
    heroImage: { width: '100%', height: '100%', justifyContent: 'flex-end' },
    heroContent: { padding: 24 },
    heroTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
    heroSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginBottom: 16 },
    heroBtn: { backgroundColor: 'rgba(255,255,255,0.62)', paddingHorizontal: 24, paddingVertical: 10, borderRadius: Radius.xl, alignSelf: 'flex-start' },
    heroBtnText: { fontWeight: 'bold', color: '#000' },
    indicators: { position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 },
    indicatorDot: { width: 8, height: 8, borderRadius: Radius.sm, backgroundColor: 'rgba(255,255,255,0.5)' },
    indicatorDotActive: { width: 32, backgroundColor: 'rgba(255,255,255,0.62)' },

    quickActionsGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    actionBtn: { flex: 1, alignItems: 'center', padding: 16, backgroundColor: colors(isDark).glass, borderRadius: Radius.lg, elevation: 1, ...glassShadow(isDark),shadowOpacity: 0.05 },
    actionIcon: { width: 48, height: 48, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    actionTitle: { fontSize: 12, fontWeight: '500', color: isDark ? '#D1D5DB' : '#374151' },

    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors(isDark).text },
    seeAll: { fontSize: 13, color: '#4F46E5', fontWeight: '600' },

    grid3: { flexDirection: 'row', gap: 10 },
    featuredRef: { flex: 1, height: 128, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: colors(isDark).glass },
    featuredImg: { width: '100%', height: '100%' },
    featuredOverlay: { position: 'absolute', inset: 0, padding: 12, justifyContent: 'space-between' },
    featuredTitle: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
    featuredSub: { color: 'rgba(255,255,255,0.9)', fontSize: 9 },

    grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    catCard: { height: 180, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: colors(isDark).glass },
    catImg: { width: '100%', height: '100%' },
    catOverlay: { position: 'absolute', inset: 0, padding: 16, justifyContent: 'space-between' },
    catTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

    miniBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
    miniBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

    exploreCard: { height: 128, marginTop: 20, borderRadius: Radius.lg, overflow: 'hidden' },
    exploreContent: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
    exploreTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 2 },
    exploreSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
    arrowCircle: { width: 40, height: 40, borderRadius: Radius.xl, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },

    // Consumos Styles
    summaryCard: { borderRadius: Radius.xl, overflow: 'hidden', marginBottom: 16, elevation: 4 },
    summaryGradient: { padding: 24 },
    summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    summaryLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 2 },
    summaryMonth: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
    summaryIcon: { width: 48, height: 48, borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    summaryGrid: { flexDirection: 'row', gap: 12 },
    summaryStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: Radius.lg, padding: 12 },
    statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 2 },
    statValue: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    statSub: { color: 'rgba(255,255,255,0.8)', fontSize: 10, marginTop: 2 },

    statCard: { flex: 1, backgroundColor: colors(isDark).glass, borderRadius: Radius.lg, padding: 12, elevation: 1 },
    statIcon: { width: 40, height: 40, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    catLabel: { fontSize: 11, color: colors(isDark).textMuted, marginBottom: 2 },
    catValue: { fontSize: 14, fontWeight: 'bold', color: colors(isDark).text },
    catCount: { fontSize: 10, color: '#9CA3AF' },

    pillBadge: { borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', borderRadius: Radius.xl, paddingHorizontal: 10, paddingVertical: 4 },
    pillText: { fontSize: 11, color: isDark ? '#D1D5DB' : '#374151' },

    historyItem: { flexDirection: 'row', backgroundColor: colors(isDark).glass, padding: 10, borderRadius: Radius.lg, gap: 12 },
    historyImg: { width: 64, height: 64, borderRadius: Radius.md, backgroundColor: colors(isDark).glass },
    historyInfo: { flex: 1, justifyContent: 'center' },
    historyName: { fontSize: 13, fontWeight: '600', color: colors(isDark).text },
    historyDesc: { fontSize: 11, color: colors(isDark).textMuted, marginVertical: 2 },
    historyDate: { fontSize: 11, color: '#9CA3AF' },
    historyAmount: { fontSize: 13, fontWeight: '600', color: colors(isDark).text },
    statusBadge: { borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: 4, paddingVertical: 1 },
    statusText: { fontSize: 9, fontWeight: 'bold' }
});
