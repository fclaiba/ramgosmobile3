import React, { useMemo } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    SafeAreaView,
} from 'react-native';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { X, ShieldCheck, Package, Truck, Info, AlertTriangle, Star } from 'lucide-react-native';
import type { Product } from '../contexts/MarketplaceContext';

interface ItemPreview {
    id: string | number;
    type: 'product' | 'bono' | 'event' | 'business';
    name: string;
    price: number;
    originalPrice?: number;
    discount?: number;
    rating?: number;
    image: string;
    gallery?: string[];
    category?: string;
    description?: string;
    condition?: 'new' | 'used';
    damageDescription?: string;
    sellerName?: string;
}

interface ItemDetailViewProps {
    item: ItemPreview;
    product?: Product | null;
    onClose: () => void;
    onAddToCart?: () => void;
    onOpenCart?: () => void;
}

export const ItemDetailView: React.FC<ItemDetailViewProps> = ({ item, product, onClose, onAddToCart, onOpenCart }) => {
    if (!item) return null;

    const gallery = useMemo(() => {
        if (product?.images?.length) {
            return product.images.map((img) => img.url);
        }
        if (item.gallery?.length) {
            return item.gallery;
        }
        return [item.image];
    }, [item.image, item.gallery, product?.images]);

    const sellerName = product?.seller.name ?? item.sellerName ?? 'Vendedor';
    const sellerType = product?.seller.type === 'business' ? 'Comercio verificado' : 'Vendedor particular';
    const conditionLabel = item.condition === 'used' ? 'Usado verificado' : 'Nuevo';
    const conditionColor = item.condition === 'used' ? '#F59E0B' : '#16A34A';

    const shippingProfile = product?.shippingProfile;

    const handleAddToCart = () => {
        onAddToCart?.();
        onOpenCart?.();
    };

    return (
        <Modal animationType="slide" presentationStyle="pageSheet" visible onRequestClose={onClose}>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Detalle del artículo</Text>
                    <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                        <X size={20} color="#111827" />
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
                        {gallery.map((url, index) => (
                            <ImageWithFallback
                                key={`${url}-${index}`}
                                src={url}
                                style={styles.galleryImage}
                            />
                        ))}
                    </ScrollView>

                    <View style={styles.titleBlock}>
                        <View style={styles.chipsRow}>
                            <Badge style={[styles.badge, { backgroundColor: `${conditionColor}1A` }]}>
                                <Text style={[styles.badgeText, { color: conditionColor }]}>{conditionLabel}</Text>
                            </Badge>
                            {product?.seller.type === 'business' && (
                                <Badge style={[styles.badge, { backgroundColor: '#F3F4F6' }]}>
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
                        <Text style={styles.category}>{item.category}</Text>
                    </View>

                    <View style={styles.priceRow}>
                        <Text style={styles.price}>${item.price.toFixed(2)}</Text>
                        {item.originalPrice && (
                            <Text style={styles.originalPrice}>${item.originalPrice.toFixed(2)}</Text>
                        )}
                        {item.discount && item.discount > 0 && (
                            <Badge style={[styles.badge, { backgroundColor: '#FEE2E2' }]}>
                                <Text style={[styles.badgeText, { color: '#B91C1C' }]}>-{item.discount}%</Text>
                            </Badge>
                        )}
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Descripción</Text>
                        <Text style={styles.sectionText}>
                            {item.description || 'Este vendedor no proporcionó una descripción detallada.'}
                        </Text>
                    </View>

                    {item.condition === 'used' && (
                        <View style={[styles.section, styles.warningCard]}>
                            <AlertTriangle size={18} color="#B45309" style={{ marginRight: 8 }} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.sectionTitle}>Estado declarado</Text>
                                <Text style={styles.sectionText}>
                                    {item.damageDescription || 'El vendedor indicó que no hay daños visibles.'}
                                </Text>
                            </View>
                        </View>
                    )}

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Información del vendedor</Text>
                        <View style={styles.sellerCard}>
                            <View>
                                <Text style={styles.sellerName}>{sellerName}</Text>
                                <Text style={styles.sellerType}>{sellerType}</Text>
                            </View>
                            {product?.seller.responseTimeHours && (
                                <Text style={styles.sellerMeta}>Tiempo de respuesta aprox. {product.seller.responseTimeHours}h</Text>
                            )}
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Envío y logística</Text>
                        <View style={styles.featureCard}>
                            <Package size={18} color="#111827" style={styles.featureIcon} />
                            <View style={styles.featureContent}>
                                <Text style={styles.featureTitle}>Peso estimado</Text>
                                <Text style={styles.featureSubtitle}>
                                    {shippingProfile ? `${shippingProfile.weightKg.toFixed(2)} kg` : 'No especificado'}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.featureCard}>
                            <Truck size={18} color="#111827" style={styles.featureIcon} />
                            <View style={styles.featureContent}>
                                <Text style={styles.featureTitle}>Dimensiones del paquete</Text>
                                <Text style={styles.featureSubtitle}>
                                    {shippingProfile
                                        ? `${shippingProfile.dimensionsCm.length} x ${shippingProfile.dimensionsCm.width} x ${shippingProfile.dimensionsCm.height} cm`
                                        : 'No especificado'}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.featureCard}>
                            <Info size={18} color="#111827" style={styles.featureIcon} />
                            <View style={styles.featureContent}>
                                <Text style={styles.featureTitle}>Retiro en persona</Text>
                                <Text style={styles.featureSubtitle}>
                                    {shippingProfile?.allowPickup ? 'Disponible con coordinación' : 'No disponible'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    <View style={[styles.section, styles.escrowCard]}>
                        <ShieldCheck size={20} color="#2563EB" style={{ marginRight: 12 }} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.escrowTitle}>Pagos protegidos con escrow</Text>
                            <Text style={styles.escrowText}>
                                Congelamos el pago durante 15 días después de confirmar la entrega. Si existe una disputa, los fondos permanecen retenidos hasta su resolución.
                            </Text>
                        </View>
                    </View>
                </ScrollView>

                <View style={styles.footer}>
                    <Button onPress={handleAddToCart} style={styles.primaryButton}>
                        <Text style={styles.primaryButtonText}>Agregar al carrito</Text>
                    </Button>
                    <Button variant="outline" onPress={onClose} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Cerrar</Text>
                    </Button>
                </View>
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
    headerTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
    closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
    scrollContent: { padding: 20, paddingBottom: 40 },
    galleryRow: { gap: 12 },
    galleryImage: { width: 240, height: 200, borderRadius: 16, backgroundColor: '#F3F4F6' },
    titleBlock: { marginTop: 20 },
    chipsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    badgeText: { fontSize: 12, fontWeight: '600' },
    title: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 6 },
    category: { fontSize: 13, color: '#6B7280' },
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
    price: { fontSize: 28, fontWeight: '800', color: '#111827' },
    originalPrice: { fontSize: 16, color: '#9CA3AF', textDecorationLine: 'line-through' },
    section: { marginTop: 24 },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 8 },
    sectionText: { fontSize: 14, color: '#4B5563', lineHeight: 20 },
    warningCard: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, backgroundColor: '#FFFBEB', borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A' },
    sellerCard: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', gap: 4 },
    sellerName: { fontSize: 15, fontWeight: '600', color: '#111827' },
    sellerType: { fontSize: 13, color: '#6B7280' },
    sellerMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 6 },
    featureCard: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#F9FAFB', borderRadius: 12, marginBottom: 8 },
    featureIcon: { marginRight: 12 },
    featureContent: { flex: 1 },
    featureTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
    featureSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
    escrowCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EFF6FF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#DBEAFE', marginTop: 24 },
    escrowTitle: { fontSize: 14, fontWeight: '600', color: '#1D4ED8', marginBottom: 4 },
    escrowText: { fontSize: 12, color: '#1E3A8A', lineHeight: 18 },
    footer: { padding: 20, paddingTop: 12, borderTopWidth: 1, borderColor: '#F3F4F6', backgroundColor: '#FFFFFF', gap: 12 },
    primaryButton: { width: '100%', borderRadius: 16, backgroundColor: '#111827', paddingVertical: 14 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    secondaryButton: { width: '100%', borderRadius: 16, borderColor: '#E5E7EB' },
    secondaryButtonText: { color: '#111827', fontSize: 15, fontWeight: '600' },
});
