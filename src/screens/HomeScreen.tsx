import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Animated, ImageBackground, Image, useWindowDimensions } from 'react-native';
import { Sparkles, MapPin, Zap, ShoppingBag, ShoppingCart, Percent, Calendar, Tag, Star, DollarSign, ArrowRight, TrendingUp } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';

import { MobileHeader } from '../components/MobileHeader';
import { MobileNav, type NavSection, NAV_CONTENT_HEIGHT } from '../components/MobileNav';
import { SidebarMenu } from '../components/SidebarMenu';
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
    { id: 1, title: 'Super Descuentos', subtitle: 'Hasta 50% OFF', image: 'https://images.unsplash.com/photo-1700843699012-0dadd2089fe4?w=1080', badge: '50% OFF', badgeColor: '#EF4444', gradient: ['rgba(37,99,235,0.9)', 'rgba(147,51,234,0.9)'], icon: Percent, filter: 'products', advancedFilters: { minDiscount: 50 } },
    { id: 2, title: 'Eventos Latinos', subtitle: 'Música en vivo', image: 'https://images.unsplash.com/photo-1618414098138-c33f9e82b405?w=1080', badge: 'Nuevo', badgeColor: '#22C55E', gradient: ['rgba(219,39,119,0.9)', 'rgba(234,88,12,0.9)'], icon: Calendar, filter: 'events' },
    { id: 3, title: 'Bonos Exclusivos', subtitle: 'Negocios locales', image: 'https://images.unsplash.com/photo-1671749999622-4087a86868cc?w=1080', badge: 'Popular', badgeColor: '#8B5CF6', gradient: ['rgba(124,58,237,0.9)', 'rgba(147,51,234,0.9)'], icon: Tag, filter: 'bonos' },
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
    { id: 1, title: 'Mi Mascota', icon: Sparkles, color: '#7C3AED', bg: 'rgba(124,58,237,0.1)', action: 'mascota' },
    { id: 2, title: 'Mapa', icon: MapPin, color: '#2563EB', bg: 'rgba(37,99,235,0.1)', action: 'marketplace-map' },
    { id: 3, title: 'Mis Puntos', icon: Zap, color: '#D97706', bg: 'rgba(217,119,6,0.1)', action: 'points' },
];

const consumptionData = [
    {
        id: 1,
        category: 'Marketplace',
        icon: ShoppingBag,
        color: ['#3B82F6', '#06B6D4'],
        items: [
            { name: 'Laptop Gaming', date: '15 Oct 2025', amount: '$1,299', status: 'Completado', statusColor: '#16A34A', image: 'https://images.unsplash.com/photo-1606625000171-fa7d471da28c?w=1080', description: 'ROG Strix G15' },
            { name: 'Auriculares', date: '10 Oct 2025', amount: '$89', status: 'Completado', statusColor: '#16A34A', image: 'https://images.unsplash.com/photo-1638967277194-4b73d3d2e72b?w=1080', description: 'Sony WH-1000XM5' }
        ]
    },
    {
        id: 2,
        category: 'Bonos',
        icon: Tag,
        color: ['#8B5CF6', '#A855F7'],
        items: [
            { name: 'Descuento 20%', date: '14 Oct 2025', amount: '-$260', status: 'Aplicado', statusColor: '#7C3AED', image: 'https://images.unsplash.com/photo-1703206390947-24130b2eaf9d?w=1080', description: 'Bono exclusivo' }
        ]
    }
];

export default function HomeScreen({ navigation, route }: any) {
    const { user } = useAuth();
    const { openCart, items: cartItems } = useCart();
    const { width: windowWidth } = useWindowDimensions();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();
    const { isDesktop } = useResponsive();
    const styles = getStyles(isDark);

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
                                            <ImageBackground source={{ uri: heroSlides[currentSlide].image }} style={styles.heroImage} imageStyle={{ borderRadius: 24 }}>
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
                                        <LinearGradient colors={['rgba(147,51,234,0.9)', 'rgba(219,39,119,0.9)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
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
                                            colors={['#7C3AED', '#9333EA', '#DB2777']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={styles.summaryGradient}
                                        >
                                            <View style={styles.summaryHeader}>
                                                <View>
                                                    <Text style={styles.summaryLabel}>Resumen del Mes</Text>
                                                    <Text style={styles.summaryMonth}>Octubre 2025</Text>
                                                </View>
                                                <View style={styles.summaryIcon}>
                                                    <DollarSign size={24} color="#fff" />
                                                </View>
                                            </View>

                                            <View style={styles.summaryGrid}>
                                                <View style={styles.summaryStat}>
                                                    <Text style={styles.statLabel}>Total Gastado</Text>
                                                    <Text style={styles.statValue}>$1,658</Text>
                                                    <Text style={styles.statSub}>7 transacciones</Text>
                                                </View>
                                                <View style={styles.summaryStat}>
                                                    <Text style={styles.statLabel}>Ahorrado</Text>
                                                    <Text style={styles.statValue}>$410</Text>
                                                    <Text style={[styles.statSub, { color: '#6EE7B7' }]}>+$260 en bonos</Text>
                                                </View>
                                            </View>
                                        </LinearGradient>
                                    </View>

                                    {/* Category Stats */}
                                    <View style={styles.grid3}>
                                        {consumptionData.map((cat) => {
                                            const Icon = cat.icon;
                                            const total = cat.items.reduce((sum, item) => sum + parseFloat(item.amount.replace(/[^0-9.-]/g, '')), 0);
                                            return (
                                                <View key={cat.id} style={styles.statCard}>
                                                    <LinearGradient colors={cat.color as [string, string, ...string[]]} style={styles.statIcon}>
                                                        <Icon size={20} color="#fff" />
                                                    </LinearGradient>
                                                    <Text style={styles.catLabel}>{cat.category}</Text>
                                                    <Text style={styles.catValue}>${Math.abs(total)}</Text>
                                                    <Text style={styles.catCount}>{cat.items.length} items</Text>
                                                </View>
                                            );
                                        })}
                                    </View>

                                    {/* Timeline */}
                                    <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                                        <Text style={styles.sectionTitle}>Historial</Text>
                                        <View style={styles.pillBadge}>
                                            <Text style={styles.pillText}>Últimos 30 días</Text>
                                        </View>
                                    </View>

                                    {consumptionData.map((section) => (
                                        <View key={section.id} style={{ gap: 12, marginTop: 12 }}>
                                            {section.items.map((item, idx) => (
                                                <View key={idx} style={styles.historyItem}>
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
                                                            <Text style={styles.historyDate}>{item.date}</Text>
                                                            <Text style={styles.historyAmount}>{item.amount}</Text>
                                                        </View>
                                                    </View>
                                                </View>
                                            ))}
                                        </View>
                                    ))}
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
        </ResponsiveLayout>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#374151' : '#e5e7eb', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    headerBtnActive: { backgroundColor: isDark ? '#4B5563' : '#111827' },
    headerBtnText: { fontSize: 13, fontWeight: '600', color: isDark ? '#9CA3AF' : '#374151', marginLeft: 6 },
    headerIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? '#374151' : '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
    badge: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },

    viewTabs: { flexDirection: 'row', marginHorizontal: 16, marginVertical: 12, padding: 4, backgroundColor: isDark ? '#1F2937' : '#E5E7EB', borderRadius: 16 },
    viewTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 12 },
    viewTabActive: { backgroundColor: isDark ? '#374151' : '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    viewTabText: { fontSize: 13, fontWeight: '600', color: isDark ? '#9CA3AF' : '#6B7280', marginLeft: 6 },
    viewTabTextActive: { color: isDark ? '#F9FAFB' : '#111827' },

    contentContainer: { paddingHorizontal: 16 },
    heroContainer: { height: 380, borderRadius: 24, overflow: 'hidden', marginBottom: 20, backgroundColor: isDark ? '#374151' : '#E5E7EB' },
    heroImage: { width: '100%', height: '100%', justifyContent: 'flex-end' },
    heroContent: { padding: 24 },
    heroTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
    heroSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginBottom: 16 },
    heroBtn: { backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 24, alignSelf: 'flex-start' },
    heroBtnText: { fontWeight: 'bold', color: '#000' },
    indicators: { position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 },
    indicatorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)' },
    indicatorDotActive: { width: 32, backgroundColor: '#fff' },

    quickActionsGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    actionBtn: { flex: 1, alignItems: 'center', padding: 16, backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05 },
    actionIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    actionTitle: { fontSize: 12, fontWeight: '500', color: isDark ? '#D1D5DB' : '#374151' },

    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827' },
    seeAll: { fontSize: 13, color: '#4F46E5', fontWeight: '600' },

    grid3: { flexDirection: 'row', gap: 10 },
    featuredRef: { flex: 1, height: 128, borderRadius: 16, overflow: 'hidden', backgroundColor: isDark ? '#374151' : '#E5E7EB' },
    featuredImg: { width: '100%', height: '100%' },
    featuredOverlay: { position: 'absolute', inset: 0, padding: 12, justifyContent: 'space-between' },
    featuredTitle: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
    featuredSub: { color: 'rgba(255,255,255,0.9)', fontSize: 9 },

    grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    catCard: { height: 180, borderRadius: 16, overflow: 'hidden', backgroundColor: isDark ? '#374151' : '#E5E7EB' },
    catImg: { width: '100%', height: '100%' },
    catOverlay: { position: 'absolute', inset: 0, padding: 16, justifyContent: 'space-between' },
    catTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

    miniBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    miniBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

    exploreCard: { height: 128, marginTop: 20, borderRadius: 16, overflow: 'hidden' },
    exploreContent: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
    exploreTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 2 },
    exploreSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
    arrowCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },

    // Consumos Styles
    summaryCard: { borderRadius: 24, overflow: 'hidden', marginBottom: 16, elevation: 4 },
    summaryGradient: { padding: 24 },
    summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    summaryLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 2 },
    summaryMonth: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
    summaryIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    summaryGrid: { flexDirection: 'row', gap: 12 },
    summaryStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 12 },
    statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 2 },
    statValue: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    statSub: { color: 'rgba(255,255,255,0.8)', fontSize: 10, marginTop: 2 },

    statCard: { flex: 1, backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 16, padding: 12, elevation: 1 },
    statIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    catLabel: { fontSize: 11, color: isDark ? '#D1D5DB' : '#6B7280', marginBottom: 2 },
    catValue: { fontSize: 14, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827' },
    catCount: { fontSize: 10, color: '#9CA3AF' },

    pillBadge: { borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    pillText: { fontSize: 11, color: isDark ? '#D1D5DB' : '#374151' },

    historyItem: { flexDirection: 'row', backgroundColor: isDark ? '#1F2937' : '#fff', padding: 10, borderRadius: 16, gap: 12 },
    historyImg: { width: 64, height: 64, borderRadius: 12, backgroundColor: isDark ? '#374151' : '#F3F4F6' },
    historyInfo: { flex: 1, justifyContent: 'center' },
    historyName: { fontSize: 13, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },
    historyDesc: { fontSize: 11, color: isDark ? '#9CA3AF' : '#6B7280', marginVertical: 2 },
    historyDate: { fontSize: 11, color: '#9CA3AF' },
    historyAmount: { fontSize: 13, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },
    statusBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
    statusText: { fontSize: 9, fontWeight: 'bold' }
});
