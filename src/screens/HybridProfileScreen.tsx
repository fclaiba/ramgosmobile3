import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Image, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Grid, ShoppingBag, Ticket, Star, ChevronLeft, MoreHorizontal } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useTheme } from '../contexts/ThemeContext';
import { glassShadow, colors, Radius } from '../theme/tokens';
import { UnifiedFeed } from '../components/social/UnifiedFeed';

const { width, height } = Dimensions.get('window');

type TabType = 'feed' | 'catalogo' | 'bonos';

export function HybridProfileScreen({ route, navigation }: any) {
    const { userId } = route?.params || {};
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const [activeTab, setActiveTab] = useState<TabType>('feed');

    // MOCK DATA - Reemplazar con query real cuando esté lista en Convex
    const profile = {
        name: 'Ramgos Influencer',
        username: 'ramgosofficial',
        role: 'influencer',
        avatar: 'https://i.pravatar.cc/150?img=12',
        bio: 'Creando el mejor contenido de moda y lifestyle. 🔥 Usá mi código RAMGOS20.',
        location: 'Buenos Aires, AR',
        followers: '12.4K',
        following: '342',
        rating: 4.9,
    };

    const renderHeader = () => (
        <View style={styles.headerContainer}>
            <LinearGradient
                colors={isDark ? ['#1E1B4B', '#312E81', '#000000'] : ['#E0E7FF', '#C7D2FE', '#F3F4F6']}
                style={StyleSheet.absoluteFill}
            />
            
            <View style={styles.topNav}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
                    <ChevronLeft size={24} color={isDark ? '#FFF' : '#000'} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn}>
                    <MoreHorizontal size={24} color={isDark ? '#FFF' : '#000'} />
                </TouchableOpacity>
            </View>

            <View style={styles.profileInfo}>
                <Image source={{ uri: profile.avatar }} style={styles.avatar} />
                <View style={styles.nameRow}>
                    <Text style={styles.name}>{profile.name}</Text>
                    {profile.role === 'influencer' && (
                        <View style={styles.badge}>
                            <Star size={10} color="#FCD34D" fill="#FCD34D" />
                            <Text style={styles.badgeText}>PRO</Text>
                        </View>
                    )}
                </View>
                <Text style={styles.username}>@{profile.username}</Text>
                
                <Text style={styles.bio}>{profile.bio}</Text>
                
                <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{profile.followers}</Text>
                        <Text style={styles.statLabel}>Seguidores</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{profile.following}</Text>
                        <Text style={styles.statLabel}>Seguidos</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{profile.rating}</Text>
                        <Text style={styles.statLabel}>Rating</Text>
                    </View>
                </View>
            </View>

            {/* Custom Tab Bar */}
            <View style={styles.tabBar}>
                <TouchableOpacity style={[styles.tabBtn, activeTab === 'feed' && styles.tabBtnActive]} onPress={() => setActiveTab('feed')}>
                    <Grid size={20} color={activeTab === 'feed' ? (isDark ? '#FFF' : '#000') : '#9CA3AF'} />
                    <Text style={[styles.tabText, activeTab === 'feed' && styles.tabTextActive]}>Feed</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tabBtn, activeTab === 'catalogo' && styles.tabBtnActive]} onPress={() => setActiveTab('catalogo')}>
                    <ShoppingBag size={20} color={activeTab === 'catalogo' ? (isDark ? '#FFF' : '#000') : '#9CA3AF'} />
                    <Text style={[styles.tabText, activeTab === 'catalogo' && styles.tabTextActive]}>Catálogo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tabBtn, activeTab === 'bonos' && styles.tabBtnActive]} onPress={() => setActiveTab('bonos')}>
                    <Ticket size={20} color={activeTab === 'bonos' ? (isDark ? '#FFF' : '#000') : '#9CA3AF'} />
                    <Text style={[styles.tabText, activeTab === 'bonos' && styles.tabTextActive]}>Bonos</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#F9FAFB' }]}>
            {renderHeader()}
            
            <View style={styles.contentContainer}>
                {activeTab === 'feed' && (
                    // Inyectamos el UnifiedFeed directamente para no romper la virtualización
                    <UnifiedFeed />
                )}
                
                {activeTab === 'catalogo' && (
                    <View style={styles.placeholderContainer}>
                        <ShoppingBag size={48} color="#9CA3AF" />
                        <Text style={styles.placeholderText}>Catálogo Comercial</Text>
                        <Text style={styles.placeholderSub}>Los productos de este creador aparecerán aquí.</Text>
                    </View>
                )}

                {activeTab === 'bonos' && (
                    <View style={styles.placeholderContainer}>
                        <Ticket size={48} color="#9CA3AF" />
                        <Text style={styles.placeholderText}>Bonos y Descuentos</Text>
                        <Text style={styles.placeholderSub}>Ofertas exclusivas para la comunidad.</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    headerContainer: {
        paddingTop: Platform.OS === 'ios' ? 50 : 30,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(156, 163, 175, 0.2)',
        position: 'relative',
    },
    topNav: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileInfo: {
        alignItems: 'center',
        marginBottom: 24,
    },
    avatar: {
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 3,
        borderColor: '#4F46E5',
        marginBottom: 16,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    name: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff', // TODO: Adaptar a isDark si el fondo no es siempre oscuro
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(252, 211, 77, 0.3)',
        gap: 4,
    },
    badgeText: {
        color: '#FCD34D',
        fontSize: 10,
        fontWeight: 'bold',
    },
    username: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 12,
    },
    bio: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
        textAlign: 'center',
        marginBottom: 20,
        paddingHorizontal: 20,
        lineHeight: 20,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 24,
        gap: 20,
    },
    statBox: {
        alignItems: 'center',
    },
    statValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    statLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 4,
    },
    statDivider: {
        width: 1,
        height: 24,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    tabBar: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: 'rgba(156, 163, 175, 0.2)',
    },
    tabBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 8,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabBtnActive: {
        borderBottomColor: '#4F46E5', // Color de acento
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#9CA3AF',
    },
    tabTextActive: {
        color: '#4F46E5',
    },
    contentContainer: {
        flex: 1,
    },
    placeholderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    placeholderText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#9CA3AF',
        marginTop: 16,
        marginBottom: 8,
    },
    placeholderSub: {
        fontSize: 14,
        color: '#9CA3AF',
        textAlign: 'center',
    }
});
