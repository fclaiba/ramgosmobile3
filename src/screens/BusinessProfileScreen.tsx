import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform, ImageBackground } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, Clock, MapPin, Phone, ExternalLink, Ticket, ArrowRight, Share2, Star } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';

// Mock Bonuses for the business
const BUSINESS_BONUSES = [
    { id: '1', title: '20% OFF en Toda la Carta', description: 'Válido lunes y martes', pointsCost: 0, expires: '15 Oct' },
    { id: '2', title: '2x1 en Tragos de Autor', description: 'Happy hour 18-20hs', pointsCost: 50, expires: '30 Oct' },
    { id: '3', title: 'Postre Gratis', description: 'Con compra mínima de $15', pointsCost: 100, expires: '1 Nov' },
];

export default function BusinessProfileScreen() {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { business } = route.params || {};

    // Fallback data if accessed directly or incomplete
    const data = {
        id: business?.id || '1',
        name: business?.name || 'Negocio Demo',
        category: business?.category || 'Restaurante',
        image: business?.image || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
        address: business?.address || 'Calle Falsa 123',
        rating: business?.rating || 4.5,
        reviews: business?.reviews || 100,
        latitude: business?.latitude,
        longitude: business?.longitude,
    };

    const openMaps = () => {
        const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
        const latLng = `${data.latitude || 0},${data.longitude || 0}`;
        const label = data.name;
        const url = Platform.select({
            ios: `${scheme}${label}@${latLng}`,
            android: `${scheme}${latLng}(${label})`
        });

        if (url) Linking.openURL(url);
    };

    return (
        <View style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Header Image */}
                <ImageBackground source={{ uri: data.image }} style={styles.headerImage}>
                    <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} />

                    <View style={styles.headerTop}>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
                            <ArrowLeft size={24} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn}>
                            <Share2 size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.headerContent}>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{data.category}</Text>
                        </View>
                        <Text style={styles.title}>{data.name}</Text>
                        <View style={styles.ratingRow}>
                            <Star size={16} color="#F59E0B" fill="#F59E0B" />
                            <Text style={styles.ratingText}>{data.rating} ({data.reviews} reseñas)</Text>
                        </View>
                    </View>
                </ImageBackground>

                {/* Info Card */}
                <View style={styles.infoSection}>
                    <View style={styles.infoRow}>
                        <MapPin size={20} color="#6B7280" />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.infoText}>{data.address}</Text>
                            <Text style={styles.subInfo}>A 1.2 km de ti</Text>
                        </View>
                        <TouchableOpacity style={styles.actionBtnOutline} onPress={openMaps}>
                            <Text style={styles.actionBtnTextOutline}>Cómo llegar</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.infoRow}>
                        <Clock size={20} color="#6B7280" />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.infoText}>Abierto • Cierra 22:00</Text>
                            <Text style={styles.subInfo}>Lun-Dom: 10:00 - 22:00</Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.infoRow}>
                        <Phone size={20} color="#6B7280" />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.infoText}>+54 11 1234-5678</Text>
                        </View>
                        <TouchableOpacity style={styles.actionBtnOutline} onPress={() => Linking.openURL('tel:+541112345678')}>
                            <Text style={styles.actionBtnTextOutline}>Llamar</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Bonuses Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Bonos Disponibles</Text>
                    {BUSINESS_BONUSES.map((bonus) => (
                        <View key={bonus.id} style={styles.bonusCard}>
                            <View style={styles.ticketLeft}>
                                <Ticket size={24} color="#7C3AED" />
                            </View>
                            <View style={styles.ticketContent}>
                                <Text style={styles.bonusTitle}>{bonus.title}</Text>
                                <Text style={styles.bonusDesc}>{bonus.description}</Text>
                                <Text style={styles.bonusMeta}>Expira: {bonus.expires} • {bonus.pointsCost > 0 ? `${bonus.pointsCost} Pts` : 'Gratis'}</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.claimBtn}
                                onPress={() => navigation.navigate('BonusQR', { bonusId: bonus.id, businessName: data.name })}
                            >
                                <Text style={styles.claimBtnText}>Usar</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>

                {/* Marketplace Link */}
                <TouchableOpacity style={styles.marketplaceCard} onPress={() => navigation.navigate('Marketplace', { searchQuery: data.name })}>
                    <LinearGradient colors={['#111827', '#374151']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.mpTitle}>Ver Productos en Marketplace</Text>
                        <Text style={styles.mpSub}>Compra online y retira en el local</Text>
                    </View>
                    <ArrowRight size={24} color="#fff" />
                </TouchableOpacity>

            </ScrollView>
        </View>
    );
}

const getStyles = (isDark: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    headerImage: { height: 300, justifyContent: 'space-between' },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 50, paddingHorizontal: 16 },
    iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },

    headerContent: { padding: 20 },
    badge: { backgroundColor: '#7C3AED', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
    badgeText: { color: isDark ? '#1F2937' : '#fff', fontSize: 12, fontWeight: 'bold' },
    title: { color: isDark ? '#1F2937' : '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    ratingText: { color: isDark ? '#1F2937' : '#fff', fontWeight: '600' },

    infoSection: { backgroundColor: isDark ? '#1F2937' : '#fff', margin: 16, marginTop: -20, borderRadius: 16, padding: 16, shadowColor: isDark ? '#F9FAFB' : '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    infoText: { fontSize: 14, fontWeight: '600', color: '#111827' },
    subInfo: { fontSize: 12, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280' },
    divider: { height: 1, backgroundColor: isDark ? '#1F2937' : '#F3F4F6', marginVertical: 8 },

    actionBtnOutline: { borderWidth: 1, borderColor: isDark ? '#D1D5DB' : '#374151', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    actionBtnTextOutline: { fontSize: 12, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },

    section: { paddingHorizontal: 16, marginBottom: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#111827' },

    bonusCard: { flexDirection: 'row', backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 12, padding: 12, marginBottom: 10, alignItems: 'center', shadowColor: isDark ? '#F9FAFB' : '#000', shadowOpacity: 0.03, elevation: 1 },
    ticketLeft: { width: 40, alignItems: 'center' },
    ticketContent: { flex: 1, paddingHorizontal: 8 },
    bonusTitle: { fontSize: 14, fontWeight: 'bold', color: '#111827' },
    bonusDesc: { fontSize: 12, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#4B5563', marginVertical: 2 },
    bonusMeta: { fontSize: 11, color: '#7C3AED', fontWeight: '500' },
    claimBtn: { backgroundColor: '#7C3AED', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    claimBtnText: { color: isDark ? '#1F2937' : '#fff', fontWeight: 'bold', fontSize: 12 },

    marketplaceCard: { marginHorizontal: 16, height: 80, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, overflow: 'hidden' },
    mpTitle: { color: isDark ? '#1F2937' : '#fff', fontSize: 16, fontWeight: 'bold' },
    mpSub: { color: isDark ? '#6B7280' : '#9CA3AF', fontSize: 12 },
});
