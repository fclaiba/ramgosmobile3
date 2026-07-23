import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform, ImageBackground } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, Clock, MapPin, Phone, ExternalLink, Ticket, ArrowRight, Share2, Star, FileText, Mail } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { glassShadow, Radius, colors } from '../theme/tokens';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';


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

    const forms = useQuery(api.businessForms.getPublicForms, { businessId: data.id });

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
                                <Ticket size={24} color="#2196F3" />
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

                {/* Forms Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Servicios y Contacto</Text>
                    <TouchableOpacity
                        style={styles.formCard}
                        onPress={() => navigation.navigate('FormFill', { businessId: data.id, businessName: data.name })}
                    >
                        <View style={styles.formIconBox}>
                            <Mail size={20} color="#2196F3" />
                        </View>
                        <View style={{ flex: 1, paddingHorizontal: 12 }}>
                            <Text style={styles.formTitle}>Enviar Consulta</Text>
                            <Text style={styles.formDesc}>Comunicate directamente con el negocio</Text>
                        </View>
                        <ArrowRight size={20} color="#9CA3AF" />
                    </TouchableOpacity>

                    {forms && forms.map((form) => (
                        <TouchableOpacity
                            key={form._id}
                            style={styles.formCard}
                            onPress={() => navigation.navigate('FormFill', { formId: form._id, businessId: data.id, businessName: data.name })}
                        >
                            <View style={styles.formIconBox}>
                                <FileText size={20} color="#2196F3" />
                            </View>
                            <View style={{ flex: 1, paddingHorizontal: 12 }}>
                                <Text style={styles.formTitle}>{form.title}</Text>
                                <Text style={styles.formDesc}>{form.description}</Text>
                            </View>
                            <ArrowRight size={20} color="#9CA3AF" />
                        </TouchableOpacity>
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
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    headerImage: { height: 300, justifyContent: 'space-between' },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 50, paddingHorizontal: 16 },
    iconBtn: { width: 40, height: 40, borderRadius: Radius.xl, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },

    headerContent: { padding: 20 },
    badge: { backgroundColor: '#2196F3', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm, marginBottom: 8 },
    badgeText: { color: isDark ? '#09090B' : '#FAFAFA', fontSize: 12, fontWeight: 'bold' },
    title: { color: isDark ? '#09090B' : '#FAFAFA', fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    ratingText: { color: isDark ? '#09090B' : '#FAFAFA', fontWeight: '600' },

    infoSection: { backgroundColor: colors(isDark).glass, margin: 16, marginTop: -20, borderRadius: Radius.lg, padding: 16, ...glassShadow(isDark),},
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    infoText: { fontSize: 14, fontWeight: '600', color: '#111827' },
    subInfo: { fontSize: 12, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280' },
    divider: { height: 1, backgroundColor: colors(isDark).glass, marginVertical: 8 },

    actionBtnOutline: { borderWidth: 1, borderColor: isDark ? '#D1D5DB' : '#374151', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.xl },
    actionBtnTextOutline: { fontSize: 12, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },

    section: { paddingHorizontal: 16, marginBottom: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#111827' },

    bonusCard: { flexDirection: 'row', backgroundColor: colors(isDark).glass, borderRadius: Radius.md, padding: 12, marginBottom: 10, alignItems: 'center', ...glassShadow(isDark),},
    ticketLeft: { width: 40, alignItems: 'center' },
    ticketContent: { flex: 1, paddingHorizontal: 8 },
    bonusTitle: { fontSize: 14, fontWeight: 'bold', color: '#111827' },
    bonusDesc: { fontSize: 12, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#4B5563', marginVertical: 2 },
    bonusMeta: { fontSize: 11, color: '#2196F3', fontWeight: '500' },
    claimBtn: { backgroundColor: '#2196F3', paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.xl },
    claimBtnText: { color: isDark ? '#09090B' : '#FAFAFA', fontWeight: 'bold', fontSize: 12 },

    marketplaceCard: { marginHorizontal: 16, height: 80, borderRadius: Radius.lg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, overflow: 'hidden' },
    mpTitle: { color: isDark ? '#09090B' : '#FAFAFA', fontSize: 16, fontWeight: 'bold' },
    mpSub: { color: isDark ? '#6B7280' : '#9CA3AF', fontSize: 12 },
    formCard: { flexDirection: 'row', backgroundColor: colors(isDark).glass, borderRadius: Radius.md, padding: 16, marginBottom: 10, alignItems: 'center', ...glassShadow(isDark) },
    formIconBox: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: isDark ? 'rgba(33, 150, 243, 0.15)' : '#E3F2FD', justifyContent: 'center', alignItems: 'center' },
    formTitle: { fontSize: 15, fontWeight: 'bold', color: '#111827' },
    formDesc: { fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280', marginTop: 2 },
});
