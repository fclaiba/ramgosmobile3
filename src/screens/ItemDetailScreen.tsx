import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Platform, Dimensions, StatusBar } from 'react-native';
import { ChevronLeft, Star, MapPin, Share2, Heart, ShoppingBag, Plus as PlusIcon, Minus, Truck, ShieldCheck, Clock, Building2, UserCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { ReviewsList } from '../components/ReviewsList';
import { AddReviewModal } from '../components/AddReviewModal';
import { useTheme } from '../contexts/ThemeContext';
import Animated, { useAnimatedStyle, useSharedValue, useAnimatedScrollHandler, interpolate, Extrapolation, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');
const HEADER_HEIGHT = 380;
const MIN_HEADER_HEIGHT = Platform.OS === 'ios' ? 90 : 70;

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const AnimatedButton = ({ onPress, style, children, isDark }: any) => {
    const scale = useSharedValue(1);
    
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }]
    }));

    const handlePressIn = () => {
        scale.value = withSpring(0.95);
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handlePressOut = () => {
        scale.value = withSpring(1);
    };

    return (
        <AnimatedTouchable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={onPress}
            style={[style, animatedStyle]}
            activeOpacity={0.9}
        >
            {children}
        </AnimatedTouchable>
    );
}

export default function ItemDetailScreen({ route, navigation }: any) {
    const slug = route.params?.slug;
    const listingFromSlug = useQuery(api.listings.getListingBySlug, slug ? { slug } : "skip");
    const passedItem = route.params?.itemData || route.params?.item;
    const item = passedItem || listingFromSlug;

    const { addItem, openCart } = useCart();
    const { user } = useAuth();
    const [quantity, setQuantity] = useState(1);
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const recordView = useMutation(api.listings.recordView);
    const insets = useSafeAreaInsets();

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark, insets);

    const scrollY = useSharedValue(0);

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollY.value = event.contentOffset.y;
        },
    });

    useEffect(() => {
        if (item?._id || item?.id) {
            const id = item._id || item.id;
            const sessionId = 'session-' + Math.random().toString(36).substr(2, 9);
            recordView({
                listingId: String(id),
                sessionId,
                userId: user?.id ? (user.id as any) : undefined,
            }).catch(e => console.log("View record failed", e));
        }
    }, [item?._id, item?.id, user]);

    const sellerId = item?.sellerId || item?.seller?.id;
    const sellerProfile = useQuery(api.users.getUser, sellerId ? { id: sellerId as any } : "skip");

    const handleAddToCart = useCallback(() => {
        if (!item) return;
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        addItem({ ...item, id: item._id || item.id, type: item.type || 'product', quantity });
        openCart();
    }, [item, quantity, addItem, openCart]);

    const headerStyle = useAnimatedStyle(() => {
        const opacity = interpolate(scrollY.value, [0, HEADER_HEIGHT - MIN_HEADER_HEIGHT - 20], [0, 1], Extrapolation.CLAMP);
        return { opacity };
    });

    const imageStyle = useAnimatedStyle(() => {
        const translateY = interpolate(scrollY.value, [-100, 0, HEADER_HEIGHT], [-50, 0, HEADER_HEIGHT * 0.5], Extrapolation.CLAMP);
        const scale = Platform.OS === 'web' ? 1 : interpolate(scrollY.value, [-100, 0], [1.5, 1], Extrapolation.CLAMP);
        return {
            transform: [{ translateY }, { scale }],
        };
    });

    if (slug && !item) return <View style={[styles.container, {justifyContent: 'center', alignItems: 'center'}]}><Text style={{color: isDark?'#fff':'#000'}}>Cargando...</Text></View>;
    if (!item) return <View style={[styles.container, {justifyContent: 'center', alignItems: 'center'}]}><Text style={{color: isDark?'#fff':'#000'}}>Producto no encontrado</Text></View>;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            
            {/* Animated Sticky Header */}
            <Animated.View style={[styles.stickyHeader, headerStyle]}>
                <AnimatedBlurView tint={isDark ? 'dark' : 'light'} intensity={80} style={StyleSheet.absoluteFill} />
                <View style={[styles.stickyHeaderContent, { paddingTop: insets.top || 20 }]}>
                    <Text style={styles.stickyHeaderTitle} numberOfLines={1}>{item.name || item.title}</Text>
                </View>
            </Animated.View>

            {/* Top Navigation Bar */}
            <View style={[styles.topBar, { top: insets.top || 20 }]}>
                <AnimatedButton style={styles.glassBtn} onPress={() => navigation.goBack()} isDark={isDark}>
                    <ChevronLeft size={24} color={isDark ? '#FFF' : '#000'} />
                </AnimatedButton>
                <View style={styles.topBarActions}>
                    <AnimatedButton style={styles.glassBtn} onPress={openCart} isDark={isDark}>
                        <ShoppingBag size={22} color={isDark ? '#FFF' : '#000'} />
                    </AnimatedButton>
                    <AnimatedButton style={styles.glassBtn} isDark={isDark}>
                        <Heart size={22} color={isDark ? '#FFF' : '#000'} />
                    </AnimatedButton>
                </View>
            </View>

            <Animated.ScrollView
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 140 }}
            >
                {/* Hero Parallax Image */}
                <View style={styles.imageContainer}>
                    <Animated.Image source={{ uri: item.image }} style={[styles.image, imageStyle]} resizeMode="contain" />
                    <LinearGradient colors={['transparent', isDark ? '#09090B' : '#FFFFFF']} style={styles.bottomGradient} />
                </View>

                <View style={styles.contentContainer}>
                    {/* Header Info */}
                    <View style={styles.titleSection}>
                        <View style={styles.categoryBadge}>
                            <Text style={styles.category}>{item.category || item.type}</Text>
                        </View>
                        <Text style={styles.title}>{item.name || item.title}</Text>

                        <View style={styles.metaRow}>
                            <View style={styles.ratingBadge}>
                                <Star size={14} color={styles.star.color} fill={styles.star.color} />
                                <Text style={styles.ratingText}>{item.averageRating ? item.averageRating.toFixed(1) : 'Nuevo'}</Text>
                                <Text style={styles.reviewCount}>({item.reviewCount || 0})</Text>
                            </View>
                            <View style={styles.dot} />
                            <View style={styles.locationContainer}>
                                <MapPin size={14} color={isDark ? '#A1A1AA' : '#6B7280'} />
                                <Text style={styles.location}>{item.location?.name || item.location || 'Online'}</Text>
                            </View>
                        </View>

                        <View style={styles.priceContainer}>
                            <View>
                                {item.originalPrice ? (
                                    <View style={styles.discountRow}>
                                        <Text style={styles.originalPrice}>${item.originalPrice}</Text>
                                        <View style={styles.discountTag}>
                                            <Text style={styles.discountBadgeText}>-{item.discount}%</Text>
                                        </View>
                                    </View>
                                ) : null}
                                <Text style={styles.price}>${item.price}</Text>
                            </View>
                            <AnimatedButton style={styles.shareButton} isDark={isDark}>
                                <Share2 size={20} color={isDark ? '#E5E7EB' : '#374151'} />
                            </AnimatedButton>
                        </View>
                    </View>

                    {/* Features Glass Grid */}
                    <View style={styles.featuresGrid}>
                        <View style={styles.featureItem}>
                            <View style={[styles.featureIconBox, styles.featureIconBgTruck]}>
                                <Truck size={22} color={styles.featureIconTruck.color} />
                            </View>
                            <Text style={styles.featureText}>Envío Rápido</Text>
                        </View>
                        <View style={styles.featureItem}>
                            <View style={[styles.featureIconBox, styles.featureIconBgShield]}>
                                <ShieldCheck size={22} color={styles.featureIconShield.color} />
                            </View>
                            <Text style={styles.featureText}>Garantía</Text>
                        </View>
                        <View style={styles.featureItem}>
                            <View style={[styles.featureIconBox, styles.featureIconBgClock]}>
                                <Clock size={22} color={styles.featureIconClock.color} />
                            </View>
                            <Text style={styles.featureText}>24/7 Ayuda</Text>
                        </View>
                    </View>

                    {/* Description */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Descripción</Text>
                        <Text style={styles.description}>
                            {item.description || "Descubre este increíble producto seleccionado especialmente para nuestra comunidad. Calidad garantizada y los mejores beneficios con tus Puntos Ramgos."}
                        </Text>
                    </View>

                    {/* Seller Profile Card */}
                    <AnimatedButton 
                        style={styles.sellerCard} 
                        onPress={() => navigation.navigate('CommercialProfile', { sellerId })}
                        isDark={isDark}
                    >
                        <View style={styles.sellerHeader}>
                            <View style={styles.sellerAvatarContainer}>
                                {sellerProfile?.avatar ? (
                                    <Image source={{ uri: sellerProfile.avatar }} style={styles.sellerAvatar} />
                                ) : (
                                    <View style={[styles.sellerAvatar, { backgroundColor: isDark ? '#374151' : '#E5E7EB', justifyContent: 'center', alignItems: 'center' }]}>
                                        {sellerProfile?.role === 'business' ? (
                                            <Building2 size={24} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                        ) : (
                                            <UserCircle size={24} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                        )}
                                    </View>
                                )}
                            </View>
                            <View style={styles.sellerInfo}>
                                <Text style={styles.sellerName}>{sellerProfile?.name || 'Vendedor Verificado'}</Text>
                                <Text style={styles.sellerHandle}>@{sellerProfile?.name?.toLowerCase().replace(/\s/g, '') || 'usuario'}</Text>
                                <View style={styles.sellerRating}>
                                    <Star size={12} color={styles.star.color} fill={styles.star.color} />
                                    <Text style={styles.sellerRatingText}>4.9 (120 ventas)</Text>
                                </View>
                            </View>
                            <ChevronLeft size={20} color={isDark ? '#6B7280' : '#9CA3AF'} style={{ transform: [{ rotate: '180deg' }] }} />
                        </View>
                    </AnimatedButton>

                    {/* Reviews */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Reseñas</Text>
                        </View>
                        <ReviewsList listingId={String(item._id || item.id)} onWriteReview={() => setIsReviewOpen(true)} />
                    </View>
                </View>
            </Animated.ScrollView>

            {/* Glass Bottom Action Bar */}
            <View style={styles.footerContainer}>
                <BlurView tint={isDark ? 'dark' : 'light'} intensity={80} style={StyleSheet.absoluteFill} />
                <View style={[styles.footer, { paddingBottom: insets.bottom || 20 }]}>
                    <View style={styles.qtyWrapper}>
                        <TouchableOpacity onPress={() => { if(Platform.OS !== 'web') Haptics.selectionAsync(); setQuantity(Math.max(1, quantity - 1)); }} style={styles.qtyBtn}>
                            <Minus size={20} color={isDark ? '#FFF' : '#000'} />
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{quantity}</Text>
                        <TouchableOpacity onPress={() => { if(Platform.OS !== 'web') Haptics.selectionAsync(); setQuantity(quantity + 1); }} style={styles.qtyBtn}>
                            <PlusIcon size={20} color={isDark ? '#FFF' : '#000'} />
                        </TouchableOpacity>
                    </View>

                    <AnimatedButton style={styles.addBtnContainer} onPress={handleAddToCart} isDark={isDark}>
                        <LinearGradient
                            colors={styles.addBtnGradient as [string, string]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={styles.addBtn}
                        >
                            <ShoppingBag size={20} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.addBtnText}>Comprar • ${(item.price * quantity).toFixed(2)}</Text>
                        </LinearGradient>
                    </AnimatedButton>
                </View>
            </View>

            <AddReviewModal
                visible={isReviewOpen}
                onClose={() => setIsReviewOpen(false)}
                listingId={String(item._id || item.id)}
            />
        </View>
    );
}

function getStyles(isDark: boolean, insets: any) {
    const bg = isDark ? '#09090B' : '#FFFFFF';
    const surface = isDark ? '#18181B' : '#F9FAFB';
    const text = isDark ? '#FAFAFA' : '#111827';
    const muted = isDark ? '#A1A1AA' : '#6B7280';
    const border = isDark ? '#27272A' : '#E5E7EB';
    
    // Premium Theme Additions
    const primary = isDark ? '#A78BFA' : '#7C3AED';
    const primaryDarker = isDark ? '#8B5CF6' : '#6D28D9';
    const success = isDark ? '#34D399' : '#10B981';
    const info = isDark ? '#60A5FA' : '#3B82F6';
    const starColor = '#FBBF24';
    
    // Feature box backgrounds
    const bgPrimary = isDark ? 'rgba(167, 139, 250, 0.15)' : '#F3E8FF';
    const bgSuccess = isDark ? 'rgba(52, 211, 153, 0.15)' : '#D1FAE5';
    const bgInfo = isDark ? 'rgba(96, 165, 250, 0.15)' : '#DBEAFE';

    const rawColors = {
        star: { color: starColor },
        featureIconTruck: { color: primary },
        featureIconShield: { color: success },
        featureIconClock: { color: info },
        addBtnGradient: [primary, primaryDarker],
    };

    const styles = StyleSheet.create({
        container: { flex: 1, backgroundColor: bg },
        
        stickyHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, overflow: 'hidden', height: MIN_HEADER_HEIGHT + (insets.top || 20) },
        stickyHeaderContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 60 },
        stickyHeaderTitle: { color: text, fontSize: 16, fontWeight: '700' },

        topBar: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', zIndex: 100 },
        topBarActions: { flexDirection: 'row', gap: 12 },
        glassBtn: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)' },

        imageContainer: { width: '100%', height: HEADER_HEIGHT, position: 'relative', backgroundColor: isDark ? '#1F2937' : '#F3F4F6' },
        image: { width: '100%', height: '100%', resizeMode: 'contain' },
        bottomGradient: { position: 'absolute', bottom: -2, left: 0, right: 0, height: 160 },

        contentContainer: { backgroundColor: bg, paddingHorizontal: 24, paddingTop: 10 },

        titleSection: { marginBottom: 32 },
        categoryBadge: { alignSelf: 'flex-start', backgroundColor: bgPrimary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 12 },
        category: { fontSize: 12, color: primary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
        title: { fontSize: 32, fontWeight: '800', color: text, marginBottom: 16, lineHeight: 38, letterSpacing: -1 },

        metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
        ratingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#27272A' : '#F3F4F6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
        ratingText: { fontSize: 14, fontWeight: '800', color: text, marginLeft: 6 },
        reviewCount: { fontSize: 13, color: muted, marginLeft: 4, fontWeight: '500' },
        dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: muted, marginHorizontal: 12 },
        locationContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        location: { fontSize: 14, color: muted, fontWeight: '500' },

        priceContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
        discountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
        originalPrice: { fontSize: 16, color: muted, textDecorationLine: 'line-through', fontWeight: '600' },
        discountTag: { backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
        discountBadgeText: { fontSize: 12, color: '#EF4444', fontWeight: '800' },
        price: { fontSize: 40, fontWeight: '800', color: text, letterSpacing: -1.5, lineHeight: 44 },
        shareButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: border },

        featuresGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 36 },
        featureItem: { flex: 1, alignItems: 'center', gap: 10 },
        featureIconBox: { width: 56, height: 56, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
        featureIconBgTruck: { backgroundColor: bgPrimary },
        featureIconBgShield: { backgroundColor: bgSuccess },
        featureIconBgClock: { backgroundColor: bgInfo },
        featureText: { fontSize: 13, fontWeight: '600', color: text, textAlign: 'center' },

        section: { marginBottom: 36 },
        sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
        sectionTitle: { fontSize: 22, fontWeight: '800', color: text, letterSpacing: -0.5 },
        description: { fontSize: 16, lineHeight: 28, color: isDark ? '#A1A1AA' : '#4B5563', fontWeight: '400' },

        sellerCard: { backgroundColor: surface, padding: 16, borderRadius: 24, marginBottom: 36, borderWidth: 1, borderColor: border, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
        sellerHeader: { flexDirection: 'row', alignItems: 'center' },
        sellerAvatarContainer: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', marginRight: 16 },
        sellerAvatar: { width: '100%', height: '100%' },
        sellerInfo: { flex: 1, justifyContent: 'center' },
        sellerName: { fontSize: 16, fontWeight: '800', color: text, marginBottom: 4 },
        sellerHandle: { fontSize: 14, color: muted, fontWeight: '500', marginBottom: 6 },
        sellerRating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        sellerRatingText: { fontSize: 13, fontWeight: '600', color: muted },

        footerContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, overflow: 'hidden', borderTopLeftRadius: 32, borderTopRightRadius: 32, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
        footer: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 20, gap: 16 },
        qtyWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)', borderRadius: 20, padding: 6, borderWidth: 1, borderColor: isDark ? '#27272A' : '#E5E7EB' },
        qtyBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 16 },
        qtyText: { fontSize: 18, fontWeight: '800', color: text, width: 32, textAlign: 'center' },
        
        addBtnContainer: { flex: 1 },
        addBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
        addBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 }
    });

    return { ...styles, ...rawColors } as any;
}
;
