import React, { useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Linking,
    Platform,
    ImageBackground,
    Share,
    ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
    ArrowLeft,
    Clock,
    MapPin,
    Phone,
    Ticket,
    ArrowRight,
    Share2,
    Star,
    FileText,
    Mail,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { glassShadow, Radius, colors } from '../theme/tokens';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

export default function BusinessProfileScreen() {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const params = route.params || {};

    const businessIdRaw =
        params.businessId ||
        params.sellerId ||
        params.business?.id ||
        params.business?._id ||
        params.id;

    const businessId =
        typeof businessIdRaw === 'string' && businessIdRaw.length > 10
            ? (businessIdRaw as Id<'users'>)
            : null;

    const profile = useQuery(
        api.users.getUser,
        businessId ? { id: businessId } : 'skip',
    );

    const forms = useQuery(
        api.businessForms.getPublicForms,
        businessId ? { businessId: String(businessId) } : 'skip',
    );

    const data = useMemo(() => {
        const routeBiz = params.business || {};
        const kp = (profile as any)?.kycProfile || {};
        const store = (profile as any)?.storeLocation;

        return {
            id: businessId ? String(businessId) : null,
            name:
                profile?.nickname ||
                profile?.name ||
                routeBiz.name ||
                'Negocio',
            category:
                profile?.businessCategory ||
                routeBiz.category ||
                'Negocio',
            image:
                profile?.avatar ||
                routeBiz.image ||
                'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
            address:
                kp.businessAddress ||
                store?.address ||
                store?.name ||
                routeBiz.address ||
                'Dirección no publicada',
            phone:
                profile?.phoneNumber ||
                kp.contactPhone ||
                routeBiz.phone ||
                null,
            rating: profile?.sellerRating ?? routeBiz.rating ?? 0,
            reviews: profile?.sellerReviewCount ?? routeBiz.reviews ?? 0,
            latitude: store?.lat ?? routeBiz.latitude,
            longitude: store?.lng ?? routeBiz.longitude,
            hoursLabel: (profile as any)?.businessAvailability
                ? `${(profile as any).businessAvailability.startTime} – ${(profile as any).businessAvailability.endTime}`
                : null,
        };
    }, [profile, businessId, params.business]);

    const openMaps = () => {
        if (data.latitude == null || data.longitude == null) {
            const q = encodeURIComponent(data.address);
            Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
            return;
        }
        const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
        const latLng = `${data.latitude},${data.longitude}`;
        const label = data.name;
        const url = Platform.select({
            ios: `${scheme}${label}@${latLng}`,
            android: `${scheme}${latLng}(${label})`,
        });
        if (url) Linking.openURL(url);
    };

    const handleShare = async () => {
        try {
            await Share.share({
                title: data.name,
                message: `Mirá ${data.name} en Ramgos`,
            });
        } catch {
            /* cancelled */
        }
    };

    if (businessId && profile === undefined) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#2196F3" />
            </View>
        );
    }

    if (!businessId) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
                <Text style={{ color: colors(isDark).text, textAlign: 'center', marginBottom: 16 }}>
                    No se encontró el negocio. Abrí el perfil desde el marketplace.
                </Text>
                <TouchableOpacity style={styles.claimBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.claimBtnText}>Volver</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                <ImageBackground source={{ uri: data.image }} style={styles.headerImage}>
                    <LinearGradient
                        colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.8)']}
                        style={StyleSheet.absoluteFill}
                    />

                    <View style={styles.headerTop}>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
                            <ArrowLeft size={24} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn} onPress={handleShare}>
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
                            <Text style={styles.ratingText}>
                                {Number(data.rating).toFixed(1)} ({data.reviews} reseñas)
                            </Text>
                        </View>
                    </View>
                </ImageBackground>

                <View style={styles.infoSection}>
                    <View style={styles.infoRow}>
                        <MapPin size={20} color="#6B7280" />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.infoText}>{data.address}</Text>
                        </View>
                        <TouchableOpacity style={styles.actionBtnOutline} onPress={openMaps}>
                            <Text style={styles.actionBtnTextOutline}>Cómo llegar</Text>
                        </TouchableOpacity>
                    </View>

                    {data.hoursLabel ? (
                        <>
                            <View style={styles.divider} />
                            <View style={styles.infoRow}>
                                <Clock size={20} color="#6B7280" />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.infoText}>{data.hoursLabel}</Text>
                                    <Text style={styles.subInfo}>Horario del negocio</Text>
                                </View>
                            </View>
                        </>
                    ) : null}

                    {data.phone ? (
                        <>
                            <View style={styles.divider} />
                            <View style={styles.infoRow}>
                                <Phone size={20} color="#6B7280" />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.infoText}>{data.phone}</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.actionBtnOutline}
                                    onPress={() => Linking.openURL(`tel:${data.phone}`)}
                                >
                                    <Text style={styles.actionBtnTextOutline}>Llamar</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : null}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Mis bonos canjeables</Text>
                    <TouchableOpacity
                        style={styles.bonusCard}
                        onPress={() => navigation.navigate('History')}
                        accessibilityRole="button"
                        accessibilityLabel="Ir a Historial para usar bonos"
                    >
                        <View style={styles.ticketLeft}>
                            <Ticket size={24} color="#2196F3" />
                        </View>
                        <View style={styles.ticketContent}>
                            <Text style={styles.bonusTitle}>Usá tus bonos desde Historial</Text>
                            <Text style={styles.bonusDesc}>
                                Después de comprar un bono, abrí Historial → Usar bono para mostrar el QR real.
                            </Text>
                        </View>
                        <View style={styles.claimBtn}>
                            <Text style={styles.claimBtnText}>Ir</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Servicios y Contacto</Text>
                    <TouchableOpacity
                        style={styles.formCard}
                        onPress={() =>
                            navigation.navigate('FormFill', {
                                businessId: data.id,
                                businessName: data.name,
                            })
                        }
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

                    {(forms || []).map((form: any) => (
                        <TouchableOpacity
                            key={form._id}
                            style={styles.formCard}
                            onPress={() =>
                                navigation.navigate('FormFill', {
                                    formId: form._id,
                                    businessId: data.id,
                                    businessName: data.name,
                                })
                            }
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

                <TouchableOpacity
                    style={styles.marketplaceCard}
                    onPress={() =>
                        navigation.navigate('CommercialProfile', { sellerId: data.id })
                    }
                >
                    <LinearGradient
                        colors={['#111827', '#374151']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.mpTitle}>Ver catálogo del negocio</Text>
                        <Text style={styles.mpSub}>Productos, servicios y bonos</Text>
                    </View>
                    <ArrowRight size={24} color="#fff" />
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const getStyles = (isDark: any) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: '#FAFAFA' },
        headerImage: { height: 300, justifyContent: 'space-between' },
        headerTop: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 50,
            paddingHorizontal: 16,
        },
        iconBtn: {
            width: 40,
            height: 40,
            borderRadius: Radius.xl,
            backgroundColor: 'rgba(255,255,255,0.2)',
            justifyContent: 'center',
            alignItems: 'center',
        },

        headerContent: { padding: 20 },
        badge: {
            backgroundColor: '#2196F3',
            alignSelf: 'flex-start',
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: Radius.sm,
            marginBottom: 8,
        },
        badgeText: { color: '#FAFAFA', fontSize: 12, fontWeight: 'bold' },
        title: { color: '#FAFAFA', fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
        ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        ratingText: { color: '#FAFAFA', fontWeight: '600' },

        infoSection: {
            backgroundColor: colors(isDark).glass,
            margin: 16,
            marginTop: -20,
            borderRadius: Radius.lg,
            padding: 16,
            ...glassShadow(isDark),
        },
        infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
        infoText: { fontSize: 14, fontWeight: '600', color: '#111827' },
        subInfo: { fontSize: 12, color: '#6B7280' },
        divider: { height: 1, backgroundColor: colors(isDark).glass, marginVertical: 8 },

        actionBtnOutline: {
            borderWidth: 1,
            borderColor: isDark ? '#D1D5DB' : '#374151',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: Radius.xl,
        },
        actionBtnTextOutline: { fontSize: 12, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },

        section: { paddingHorizontal: 16, marginBottom: 20 },
        sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#111827' },

        bonusCard: {
            flexDirection: 'row',
            backgroundColor: colors(isDark).glass,
            borderRadius: Radius.md,
            padding: 12,
            marginBottom: 10,
            alignItems: 'center',
            ...glassShadow(isDark),
        },
        ticketLeft: { width: 40, alignItems: 'center' },
        ticketContent: { flex: 1, paddingHorizontal: 8 },
        bonusTitle: { fontSize: 14, fontWeight: 'bold', color: '#111827' },
        bonusDesc: { fontSize: 12, color: '#4B5563', marginVertical: 2 },
        claimBtn: {
            backgroundColor: '#2196F3',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: Radius.xl,
        },
        claimBtnText: { color: '#FAFAFA', fontWeight: 'bold', fontSize: 12 },

        marketplaceCard: {
            marginHorizontal: 16,
            height: 80,
            borderRadius: Radius.lg,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 20,
            overflow: 'hidden',
        },
        mpTitle: { color: '#FAFAFA', fontSize: 16, fontWeight: 'bold' },
        mpSub: { color: '#9CA3AF', fontSize: 12 },
        formCard: {
            flexDirection: 'row',
            backgroundColor: colors(isDark).glass,
            borderRadius: Radius.md,
            padding: 16,
            marginBottom: 10,
            alignItems: 'center',
            ...glassShadow(isDark),
        },
        formIconBox: {
            width: 40,
            height: 40,
            borderRadius: Radius.sm,
            backgroundColor: isDark ? 'rgba(33, 150, 243, 0.15)' : '#E3F2FD',
            justifyContent: 'center',
            alignItems: 'center',
        },
        formTitle: { fontSize: 15, fontWeight: 'bold', color: '#111827' },
        formDesc: { fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280', marginTop: 2 },
    });
