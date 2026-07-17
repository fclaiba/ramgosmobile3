import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    useWindowDimensions,
    LayoutChangeEvent,
} from 'react-native';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { X, ShieldCheck, Package, Truck, Info, AlertTriangle, Star, User, ChevronRight } from 'lucide-react-native';
import type { Product } from '../contexts/MarketplaceContext';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet, SheetContent } from './ui/sheet';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { ReviewsList } from './ReviewsList';
import { AddReviewModal } from './AddReviewModal';
import { useAuth } from '../contexts/AuthContext';

// Removed static SCREEN_WIDTH — we use useWindowDimensions + onLayout instead

interface ItemPreview {
    id: string | number;
    type: 'product' | 'bono' | 'event' | 'service' | 'business';
    name: string;
    price: number;
    originalPrice?: number;
    discount?: number;
    discountValue?: number;
    rating?: number;
    image: string;
    gallery?: string[];
    category?: string;
    description?: string;
    condition?: 'new' | 'used';
    damageDescription?: string;
    sellerName?: string;
    sellerId?: string;
    sellerUsername?: string;
    sellerAvatar?: string;
}

interface ItemDetailViewProps {
    item: ItemPreview;
    product?: Product | null;
    onClose: () => void;
    onAddToCart?: () => void;
    onOpenCart?: () => void;
    onViewSellerProfile?: (sellerId: string) => void;
}

export const ItemDetailView: React.FC<ItemDetailViewProps> = ({ item, product, onClose, onAddToCart, onOpenCart, onViewSellerProfile }) => {
    const { theme, colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { width: windowWidth } = useWindowDimensions();
    // Track the actual rendered width of the hero container so gallery
    // paging and image sizing always match the real layout, even on web.
    const [heroWidth, setHeroWidth] = useState(windowWidth);
    const handleHeroLayout = useCallback((e: LayoutChangeEvent) => {
        const layoutWidth = e.nativeEvent.layout.width;
        if (layoutWidth > 0) setHeroWidth(layoutWidth);
    }, []);
    const styles = getStyles(isDark, heroWidth);

    const open = !!item;

    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const recordView = useMutation(api.listings.recordView);
    const { user } = useAuth();

    useEffect(() => {
        if (open && item) {
            const sessionId = 'session-' + Math.random().toString(36).substr(2, 9);
            if (!item.id) return;

            recordView({
                listingId: String(item.id),
                sessionId,
                userId: user?.id ? (user.id as any) : undefined,
            }).catch(e => console.log("View record failed", e));
        }
    }, [open, item, user]);

    const gallery = useMemo(() => {
        if (!item) return [];
        if (product?.images?.length) {
            return product.images.map((img) => img.url);
        }
        if (item.gallery?.length) {
            return item.gallery;
        }
        return [item.image];
    }, [item, product?.images]);

    if (!item) return null;

    const sellerName = product?.seller?.name ?? item.sellerName ?? 'Unknown';
    const sellerUsername = (product?.seller as any)?.username ?? item.sellerUsername ?? `@${sellerName.toLowerCase().replace(/\s+/g, '')}`;
    const sellerAvatar = (product?.seller as any)?.avatar ?? item.sellerAvatar;
    const sellerType = product?.seller?.type === 'business' ? 'Comercio verificado' : 'Vendedor particular';
    const conditionLabel =
        item.type === 'event' ? 'Evento'
      : item.type === 'service' ? 'Servicio'
      : item.condition === 'used' ? 'Usado verificado'
      : 'Nuevo';
      
    const conditionColor =
        item.type === 'event' ? '#F59E0B'
      : item.type === 'service' ? '#38BDF8'
      : item.condition === 'used' ? '#F59E0B'
      : '#16A34A';

    const shippingProfile = product?.shippingProfile;

    const handleAddToCart = () => {
        onAddToCart?.();
        onOpenCart?.();
    };

    const handleSellerPress = () => {
        const targetId = product?.seller?.id || item.sellerId;
        if (onViewSellerProfile && targetId) {
            onViewSellerProfile(targetId as string);
        }
    };

    const handleScroll = (event: any) => {
        const slideSize = event.nativeEvent.layoutMeasurement.width;
        const index = Math.floor(event.nativeEvent.contentOffset.x / slideSize);
        if (index !== currentImageIndex && index >= 0 && index < gallery.length) {
            setCurrentImageIndex(index);
        }
    };

    return (
        <Sheet open={open} onOpenChange={(val: boolean) => !val && onClose()}>
            <SheetContent side="bottom" style={styles.sheetContent}>
                
                {/* Floating Close Button */}
                <View style={styles.floatingHeader}>
                    <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
                        <X size={20} color={isDark ? '#F9FAFB' : '#111827'} />
                    </TouchableOpacity>
                </View>

                <View style={styles.mainContainer}>
                    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
                        
                        {/* Hero Image Gallery */}
                        <View style={styles.heroContainer} onLayout={handleHeroLayout}>
                            <ScrollView 
                                horizontal 
                                pagingEnabled 
                                showsHorizontalScrollIndicator={false}
                                onMomentumScrollEnd={handleScroll}
                            >
                                {gallery.map((url, index) => (
                                    <View key={`${url}-${index}`} style={styles.heroSlide}>
                                        <ImageWithFallback
                                            src={url}
                                            style={styles.heroImage}
                                            resizeMode="cover"
                                        />
                                    </View>
                                ))}
                            </ScrollView>
                            {gallery.length > 1 && (
                                <View style={styles.paginationBadge}>
                                    <Text style={styles.paginationText}>{currentImageIndex + 1} / {gallery.length}</Text>
                                </View>
                            )}
                        </View>

                        <View style={styles.contentPadding}>
                            {/* Title Block */}
                            <View style={styles.titleBlock}>
                                <View style={styles.chipsRow}>
                                    <Badge style={[styles.badge, { backgroundColor: `${conditionColor}1A` }]}>
                                        <Text style={[styles.badgeText, { color: conditionColor }]}>{conditionLabel}</Text>
                                    </Badge>
                                    {product?.seller?.type === 'business' && (
                                        <Badge style={[styles.badge, { backgroundColor: isDark ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF' }]}>
                                            <ShieldCheck size={12} color="#2563EB" />
                                            <Text style={[styles.badgeText, { color: '#1D4ED8', marginLeft: 4 }]}>Escrow protegido</Text>
                                        </Badge>
                                    )}
                                    {item.rating && (
                                        <Badge style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
                                            <Star size={12} color="#CA8A04" fill="#FACC15" />
                                            <Text style={[styles.badgeText, { color: '#92400E', marginLeft: 4 }]}>{item.rating.toFixed(1)}</Text>
                                        </Badge>
                                    )}
                                </View>
                                <Text style={styles.title}>{item.name}</Text>
                                {item.type === 'bono' && item.discountValue ? (
                                    <View>
                                        <Text style={[styles.category, { color: '#10B981', fontWeight: '700', fontSize: 16, marginTop: 4 }]}>
                                            Pagás ${item.price.toFixed(2)} y consumís por ${item.discountValue.toFixed(2)}
                                        </Text>
                                    </View>
                                ) : (
                                    <Text style={styles.category}>{item.category}</Text>
                                )}
                            </View>

                            <View style={styles.divider} />

                            {/* Description Section */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Descripción</Text>
                                <Text style={styles.sectionText}>
                                    {item.description || 'Este artículo no tiene una descripción detallada.'}
                                </Text>
                            </View>

                            {/* Warning Section for Used Items */}
                            {item.condition === 'used' && (
                                <View style={[styles.section, styles.warningCard]}>
                                    <AlertTriangle size={20} color="#B45309" style={{ marginRight: 12, marginTop: 2 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.warningTitle}>Estado declarado</Text>
                                        <Text style={styles.warningText}>
                                            {item.damageDescription || 'El vendedor indicó que no hay daños visibles.'}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* Seller Profile Section */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Vendedor</Text>
                                <TouchableOpacity style={styles.sellerCard} activeOpacity={0.7} onPress={handleSellerPress}>
                                    <View style={styles.sellerAvatar}>
                                        {sellerAvatar ? (
                                            <ImageWithFallback src={sellerAvatar} style={{ width: 48, height: 48, borderRadius: 24 }} />
                                        ) : (
                                            <User size={24} color="#9CA3AF" />
                                        )}
                                    </View>
                                    <View style={styles.sellerInfo}>
                                        <Text style={styles.sellerName}>{sellerName}</Text>
                                        <Text style={styles.sellerUsername}>{sellerUsername}</Text>
                                        <Text style={styles.sellerType}>{sellerType}</Text>
                                        {product?.seller?.responseTimeHours && (
                                            <Text style={styles.sellerMeta}>Responde en aprox. {product.seller.responseTimeHours}h</Text>
                                        )}
                                    </View>
                                    <ChevronRight size={20} color="#9CA3AF" />
                                </TouchableOpacity>
                            </View>

                            {/* Shipping & Logistics */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Envío y entrega</Text>
                                <View style={styles.logisticsContainer}>
                                    <View style={styles.featureCard}>
                                        <View style={styles.featureIconContainer}>
                                            <Package size={18} color={isDark ? '#9CA3AF' : '#4B5563'} />
                                        </View>
                                        <View style={styles.featureContent}>
                                            <Text style={styles.featureTitle}>Peso estimado</Text>
                                            <Text style={styles.featureSubtitle}>
                                                {shippingProfile?.weightKg != null ? `${shippingProfile.weightKg.toFixed(2)} kg` : 'No especificado'}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.featureCard}>
                                        <View style={styles.featureIconContainer}>
                                            <Truck size={18} color={isDark ? '#9CA3AF' : '#4B5563'} />
                                        </View>
                                        <View style={styles.featureContent}>
                                            <Text style={styles.featureTitle}>Dimensiones</Text>
                                            <Text style={styles.featureSubtitle}>
                                                {shippingProfile?.dimensionsCm
                                                    ? `${shippingProfile.dimensionsCm.length} x ${shippingProfile.dimensionsCm.width} x ${shippingProfile.dimensionsCm.height} cm`
                                                    : 'No especificado'}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.featureCard}>
                                        <View style={styles.featureIconContainer}>
                                            <Info size={18} color={isDark ? '#9CA3AF' : '#4B5563'} />
                                        </View>
                                        <View style={styles.featureContent}>
                                            <Text style={styles.featureTitle}>Retiro en persona</Text>
                                            <Text style={styles.featureSubtitle}>
                                                {shippingProfile?.allowPickup ? 'Disponible' : 'No disponible'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </View>

                            {/* Reviews Section */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Reseñas</Text>
                                <ReviewsList listingId={String(item.id)} onWriteReview={() => setIsReviewOpen(true)} />
                            </View>

                            {/* Escrow Protection Card */}
                            <View style={[styles.section, styles.escrowCard]}>
                                <ShieldCheck size={24} color="#2563EB" style={{ marginRight: 16 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.escrowTitle}>Compra protegida con Escrow</Text>
                                    <Text style={styles.escrowText}>
                                        Tu pago se retiene de forma segura hasta 10 días después de que recibas el producto. Si hay algún problema, te devolvemos tu dinero.
                                    </Text>
                                </View>
                            </View>

                            {/* Extra bottom padding to avoid sticky footer overlap */}
                            <View style={{ height: 100 }} />
                        </View>
                    </ScrollView>

                    {/* Sticky Footer */}
                    <View style={styles.stickyFooter}>
                        <View style={styles.footerPriceBlock}>
                            {item.type === 'bono' && item.discountValue ? (
                                <View>
                                    <Text style={[styles.footerOriginalPrice, { textDecorationLine: 'none', color: '#10B981', fontWeight: '700' }]}>
                                        Valor real: ${item.discountValue.toFixed(2)}
                                    </Text>
                                    <Text style={styles.footerPrice}>${item.price.toFixed(2)}</Text>
                                </View>
                            ) : (
                                <>
                                    {item.discount && item.discount > 0 && item.originalPrice && (
                                        <View style={styles.discountRow}>
                                            <Text style={styles.footerOriginalPrice}>${item.originalPrice.toFixed(2)}</Text>
                                            <Badge style={styles.discountBadge}>
                                                <Text style={styles.discountBadgeText}>-{item.discount}%</Text>
                                            </Badge>
                                        </View>
                                    )}
                                    <Text style={styles.footerPrice}>${item.price.toFixed(2)}</Text>
                                </>
                            )}
                        </View>
                        
                        <Button onPress={handleAddToCart} style={styles.addToCartButton}>
                            <Text style={styles.addToCartText}>Agregar al carrito</Text>
                        </Button>
                    </View>
                </View>

                {/* Render Modal */}
                <AddReviewModal 
                    visible={isReviewOpen} 
                    onClose={() => setIsReviewOpen(false)} 
                    listingId={String(item.id)}
                />
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean, heroWidth: number) => StyleSheet.create({
    sheetContent: { 
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)', 
        height: '95%',
        padding: 0, // Reset default padding to allow edge-to-edge
        overflow: 'hidden',
    },
    floatingHeader: {
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 100,
    },
    closeBtn: {
        width: 36, 
        height: 36, 
        borderRadius: 18, 
        backgroundColor: isDark ? 'rgba(31, 41, 55, 0.8)' : 'rgba(255, 255, 255, 0.9)', 
        alignItems: 'center', 
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    mainContainer: {
        flex: 1,
        position: 'relative',
    },
    scrollContent: {
        paddingBottom: 20,
    },
    heroContainer: {
        position: 'relative',
        width: '100%',
        aspectRatio: 1, // 1:1 aspect ratio for product images
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
        overflow: 'hidden',
    },
    heroSlide: {
        width: heroWidth,
        height: heroWidth,
        overflow: 'hidden',
    },
    heroImage: {
        width: '100%',
        height: '100%',
    },
    paginationBadge: {
        position: 'absolute',
        bottom: 16,
        right: 16,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    paginationText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '600',
    },
    contentPadding: {
        padding: 20,
    },
    titleBlock: {
        marginTop: 4,
    },
    chipsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '600',
    },
    title: {
        fontSize: 26,
        fontWeight: '800',
        color: isDark ? '#F9FAFB' : '#111827',
        lineHeight: 32,
        marginBottom: 4,
    },
    category: {
        fontSize: 15,
        color: '#6B7280',
        fontWeight: '500',
    },
    divider: {
        height: 1,
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
        marginVertical: 24,
    },
    section: {
        marginBottom: 28,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: isDark ? '#F9FAFB' : '#111827',
        marginBottom: 12,
    },
    sectionText: {
        fontSize: 15,
        color: isDark ? '#D1D5DB' : '#4B5563',
        lineHeight: 24,
    },
    warningCard: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: isDark ? 'rgba(180, 83, 9, 0.1)' : '#FFFBEB',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(180, 83, 9, 0.2)' : '#FDE68A',
    },
    warningTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: isDark ? '#FCD34D' : '#92400E',
        marginBottom: 4,
    },
    warningText: {
        fontSize: 14,
        color: isDark ? '#D1D5DB' : '#92400E',
        lineHeight: 20,
    },
    sellerCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)',
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
    },
    sellerAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    sellerInfo: {
        flex: 1,
    },
    sellerName: {
        fontSize: 16,
        fontWeight: '700',
        color: isDark ? '#F9FAFB' : '#111827',
        marginBottom: 2,
    },
    sellerUsername: {
        fontSize: 14,
        color: isDark ? '#9CA3AF' : '#6B7280',
        marginBottom: 2,
    },
    sellerType: {
        fontSize: 14,
        color: '#6B7280',
    },
    sellerMeta: {
        fontSize: 13,
        color: isDark ? '#9CA3AF' : '#6B7280',
        marginTop: 4,
        fontWeight: '500',
    },
    logisticsContainer: {
        gap: 12,
    },
    featureCard: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    featureIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    featureContent: {
        flex: 1,
    },
    featureTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: isDark ? '#E5E7EB' : '#374151',
    },
    featureSubtitle: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 2,
    },
    escrowCard: {
        flexDirection: 'row',
        backgroundColor: isDark ? 'rgba(37, 99, 235, 0.1)' : '#EFF6FF',
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(37, 99, 235, 0.2)' : '#DBEAFE',
    },
    escrowTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: isDark ? '#60A5FA' : '#1D4ED8',
        marginBottom: 6,
    },
    escrowText: {
        fontSize: 14,
        color: isDark ? '#93C5FD' : '#1E3A8A',
        lineHeight: 20,
    },
    stickyFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderTopWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 24, // extra padding for safe area
    },
    footerPriceBlock: {
        flex: 1,
    },
    discountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 2,
    },
    footerOriginalPrice: {
        fontSize: 14,
        color: '#9CA3AF',
        textDecorationLine: 'line-through',
        fontWeight: '500',
    },
    discountBadge: {
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    discountBadgeText: {
        color: '#B91C1C',
        fontSize: 10,
        fontWeight: '700',
    },
    footerPrice: {
        fontSize: 28,
        fontWeight: '800',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    addToCartButton: {
        backgroundColor: '#7C3AED', // Standard high-conversion blue
        borderRadius: 100, // fully rounded pill
        paddingVertical: 16,
        paddingHorizontal: 28,
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    addToCartText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
