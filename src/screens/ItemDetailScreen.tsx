import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { ChevronLeft, Star, MapPin, Share2, Heart, ShoppingBag, Plus as PlusIcon, Minus, Check, Truck, ShieldCheck, Clock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCart } from '../contexts/CartContext';

// Mock Reviews

// Mock Reviews
const REVIEWS = [
    { id: 1, user: 'Maria G.', rating: 5, comment: '¡Excelente producto! Superó mis expectativas.', date: 'Hace 2 días' },
    { id: 2, user: 'Carlos R.', rating: 4, comment: 'Muy buena calidad, envío rápido.', date: 'Hace 1 semana' },
];

export default function ItemDetailScreen({ navigation, route }: any) {
    const item = route.params?.itemData || route.params?.item;
    const { addItem, openCart } = useCart();
    const [quantity, setQuantity] = useState(1);
    const [activeSection, setActiveSection] = useState<'details' | 'reviews'>('details');

    if (!item) return null;

    const handleAddToCart = () => {
        addItem({ ...item, quantity });
        openCart();
    };

    const renderReview = ({ item }: any) => (
        <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
                <View style={styles.reviewUser}>
                    <View style={styles.userAvatar}>
                        <Text style={styles.userInitials}>{item.user.charAt(0)}</Text>
                    </View>
                    <View>
                        <Text style={styles.userName}>{item.user}</Text>
                        <View style={styles.reviewRating}>
                            {[...Array(5)].map((_, i) => (
                                <Star key={i} size={12} color={i < item.rating ? "#FBBF24" : "#E5E7EB"} fill={i < item.rating ? "#FBBF24" : "none"} />
                            ))}
                        </View>
                    </View>
                </View>
                <Text style={styles.reviewDate}>{item.date}</Text>
            </View>
            <Text style={styles.reviewText}>{item.comment}</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Hero Image */}
                <View style={styles.imageContainer}>
                    <Image source={{ uri: item.image }} style={styles.image} />
                    <LinearGradient colors={['rgba(0,0,0,0.3)', 'transparent']} style={styles.topGradient} />

                    {/* Floating Header */}
                    <View style={styles.header}>
                        <TouchableOpacity style={styles.roundBtn} onPress={() => navigation.goBack()}>
                            <ChevronLeft size={24} color="#111827" />
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <TouchableOpacity style={styles.roundBtn} onPress={useCart().openCart}>
                                <ShoppingBag size={22} color="#111827" />
                                {useCart().items.length > 0 && (
                                    <View style={{ position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.roundBtn}>
                                <Heart size={22} color="#EF4444" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.roundBtn}>
                                <Share2 size={22} color="#111827" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                <View style={styles.contentContainer}>
                    {/* Main Info */}
                    <View style={styles.titleSection}>
                        <Text style={styles.category}>{item.category || item.type}</Text>
                        <Text style={styles.title}>{item.name || item.title}</Text>

                        <View style={styles.ratingRow}>
                            <View style={styles.badge}>
                                <Star size={14} color="#fff" fill="#fff" />
                                <Text style={styles.badgeText}>{item.rating || '4.8'}</Text>
                            </View>
                            <Text style={styles.reviewCount}>(128 reseñas)</Text>
                            <View style={styles.dot} />
                            <MapPin size={14} color="#6B7280" />
                            <Text style={styles.location}>{item.location?.name || item.location || 'Ubicación'}</Text>
                        </View>

                        <View style={styles.priceRow}>
                            {item.originalPrice ? (
                                <View>
                                    <Text style={styles.originalPrice}>${item.originalPrice}</Text>
                                    <Text style={styles.discountBadge}>-{item.discount}% OFF</Text>
                                </View>
                            ) : null}
                            <Text style={styles.price}>${item.price}</Text>
                        </View>
                    </View>

                    {/* Features Grid */}
                    <View style={styles.featuresGrid}>
                        <View style={styles.featureItem}>
                            <Truck size={20} color="#7C3AED" />
                            <Text style={styles.featureText}>Envío Rápido</Text>
                        </View>
                        <View style={styles.featureItem}>
                            <ShieldCheck size={20} color="#7C3AED" />
                            <Text style={styles.featureText}>Garantía</Text>
                        </View>
                        <View style={styles.featureItem}>
                            <Clock size={20} color="#7C3AED" />
                            <Text style={styles.featureText}>24/7 Soporte</Text>
                        </View>
                    </View>

                    {/* Description */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Descripción</Text>
                        <Text style={styles.description}>
                            {item.description || "Descubre este increíble producto seleccionado especialmente para nuestra comunidad. Calidad garantizada y los mejores beneficios con tus Puntos Ramgos."}
                        </Text>
                    </View>

                    {/* Reviews Preview */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Reseñas</Text>
                            <TouchableOpacity>
                                <Text style={styles.seeAll}>Ver todas</Text>
                            </TouchableOpacity>
                        </View>
                        {REVIEWS.map((r) => (
                            <View key={r.id} style={{ marginBottom: 12 }}>
                                {renderReview({ item: r })}
                            </View>
                        ))}
                    </View>

                </View>
            </ScrollView>

            {/* Bottom Action Bar */}
            <View style={styles.footer}>
                <View style={styles.qtyContainer}>
                    <TouchableOpacity onPress={() => setQuantity(Math.max(1, quantity - 1))} style={styles.qtyBtn}>
                        <Minus size={18} color="#374151" />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{quantity}</Text>
                    <TouchableOpacity onPress={() => setQuantity(quantity + 1)} style={styles.qtyBtn}>
                        <PlusIcon size={18} color="#374151" />
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.addBtnContainer} onPress={handleAddToCart}>
                    <LinearGradient
                        colors={['#111827', '#374151']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={styles.addBtn}
                    >
                        <ShoppingBag size={20} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.addBtnText}>Agregar • ${(item.price * quantity).toFixed(2)}</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    // Image Header
    imageContainer: { width: '100%', height: 320, backgroundColor: '#F3F4F6', position: 'relative' },
    image: { width: '100%', height: '100%' },
    topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 100 },
    header: { position: 'absolute', top: 50, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', zIndex: 10 },
    roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },

    contentContainer: { flex: 1, marginTop: -24, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },

    titleSection: { marginBottom: 24 },
    category: { fontSize: 13, color: '#7C3AED', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 },
    title: { fontSize: 26, fontWeight: 'bold', color: '#111827', marginBottom: 12, lineHeight: 32 },

    ratingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FBBF24', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 8 },
    badgeText: { fontSize: 12, fontWeight: 'bold', color: '#fff', marginLeft: 4 },
    reviewCount: { fontSize: 13, color: '#6B7280', marginRight: 12 },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', marginRight: 12 },
    location: { fontSize: 13, color: '#6B7280', flex: 1 },

    priceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    price: { fontSize: 32, fontWeight: 'bold', color: '#111827' },
    originalPrice: { fontSize: 16, color: '#9CA3AF', textDecorationLine: 'line-through', marginBottom: 4 },
    discountBadge: { fontSize: 12, color: '#EF4444', fontWeight: 'bold' },

    // Features
    featuresGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32, backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16 },
    featureItem: { alignItems: 'center', gap: 6 },
    featureText: { fontSize: 11, fontWeight: '600', color: '#4B5563' },

    section: { marginBottom: 32 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
    seeAll: { fontSize: 13, color: '#7C3AED', fontWeight: '600' },
    description: { fontSize: 15, lineHeight: 24, color: '#4B5563' },

    // Reviews
    reviewCard: { backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16 },
    reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    reviewUser: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    userAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#DDD6FE', justifyContent: 'center', alignItems: 'center' },
    userInitials: { fontSize: 14, fontWeight: 'bold', color: '#7C3AED' },
    userName: { fontSize: 14, fontWeight: '600', color: '#111827' },
    reviewRating: { flexDirection: 'row', gap: 2, marginTop: 2 },
    reviewDate: { fontSize: 11, color: '#9CA3AF' },
    reviewText: { fontSize: 13, color: '#4B5563', lineHeight: 20 },

    // Footer
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB', flexDirection: 'row', padding: 16, paddingBottom: 32, gap: 16 },
    qtyContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, padding: 4 },
    qtyBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2 },
    qtyText: { fontSize: 16, fontWeight: 'bold', color: '#111827', width: 32, textAlign: 'center' },

    addBtnContainer: { flex: 1, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
    addBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
    addBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' }
});
