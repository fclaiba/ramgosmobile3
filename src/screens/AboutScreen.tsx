import React from 'react';
import { View, Text, ScrollView, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Heart, Users, Globe, Award, Target, Shield, Zap, Mail, Phone, MapPin, Facebook, Instagram, Twitter, Linkedin, Github } from 'lucide-react-native';
import { Card, CardContent } from '../components/ui/card';
import { MobileHeader } from '../components/MobileHeader';
import { LinearGradient } from 'expo-linear-gradient';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';

export default function AboutScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const stats = [
        { label: 'Usuarios', value: '50K+', icon: Users, colors: ['#3b82f6', '#06b6d4'] },
        { label: 'Negocios', value: '1.2K', icon: Globe, colors: ['#a855f7', '#ec4899'] },
        { label: 'Ciudades', value: '25', icon: MapPin, colors: ['#22c55e', '#10b981'] },
        { label: 'Eventos', value: '300+', icon: Award, colors: ['#eab308', '#f97316'] },
    ];

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Acerca de"
                subtitle="Conoce Ramgos App"
                onMenuPress={() => navigation.openDrawer && navigation.openDrawer()}
                backButton
                onBack={() => navigation.goBack()}
            />

            <ScrollView contentContainerStyle={styles.content}>
                {/* Hero Section */}
                <Card style={styles.heroCard}>
                    <LinearGradient
                        colors={['#7c3aed', '#db2777']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={styles.heroGradient}
                    >
                        <Text style={styles.heroEmoji}>🎉</Text>
                        <Text style={styles.heroTitle}>Ramgos App</Text>
                        <Text style={styles.heroSubtitle}>Descubre la oportunidad de conectarte con una comunidad latina latente</Text>
                        <View style={styles.versionBadge}>
                            <Text style={styles.versionText}>Versión 1.0.0</Text>
                        </View>
                    </LinearGradient>
                </Card>

                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                    {stats.map((stat, index) => (
                        <Card key={index} style={styles.statCard}>
                            <CardContent style={styles.statContent}>
                                <LinearGradient colors={stat.colors as any} style={styles.statIconContainer}>
                                    <stat.icon size={20} color="#fff" />
                                </LinearGradient>
                                <Text style={styles.statValue}>{stat.value}</Text>
                                <Text style={styles.statLabel}>{stat.label}</Text>
                            </CardContent>
                        </Card>
                    ))}
                </View>

                {/* Mission */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Nuestra Misión</Text>
                    <Card style={styles.card}>
                        <CardContent style={styles.missionContent}>
                            <View style={styles.missionIconContainer}>
                                <Target size={24} color="#7c3aed" />
                            </View>
                            <Text style={styles.missionText}>
                                Conectar a la comunidad latina con negocios locales, el descubrimiento, ahorro y participación en experiencias que fortalecen nuestra identidad cultural.
                            </Text>
                        </CardContent>
                    </Card>
                </View>

                {/* Team */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Nuestro Equipo</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
                        {[
                            { name: 'María G.', role: 'CEO', img: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&h=200&fit=crop' },
                            { name: 'Carlos R.', role: 'CTO', img: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop' },
                            { name: 'Ana M.', role: 'Comm.', img: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&h=200&fit=crop' },
                        ].map((member, i) => (
                            <Card key={i} style={styles.teamCard}>
                                <CardContent style={styles.teamContent}>
                                    <Image source={{ uri: member.img }} style={styles.teamImage} />
                                    <Text style={styles.teamName}>{member.name}</Text>
                                    <Text style={styles.teamRole}>{member.role}</Text>
                                </CardContent>
                            </Card>
                        ))}
                    </ScrollView>
                </View>

                {/* Footer / Legal */}
                <View style={[styles.section, { alignItems: 'center', marginTop: 32, marginBottom: 32 }]}>
                    <Text style={styles.copyright}>© 2025 Ramgos App. Todos los derechos reservados.</Text>
                    <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                        <Text style={styles.legalLink} onPress={() => show('Términos y Condiciones pronto', 'info')}>Términos</Text>
                        <Text style={styles.legalLink} onPress={() => show('Política de Privacidad pronto', 'info')}>Privacidad</Text>
                    </View>
                    <Text style={[styles.copyright, { marginTop: 12 }]}>Made with ❤️ in Miami</Text>
                </View>

            </ScrollView>
        </View>
    );
}

const getStyles = (isDark: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#09090B' : '#FAFAFA' },
    content: { padding: 16 },
    heroCard: { borderRadius: 24, overflow: 'hidden', marginBottom: 24, borderWidth: 0 },
    heroGradient: { padding: 24, alignItems: 'center' },
    heroEmoji: { fontSize: 48, marginBottom: 16 },
    heroTitle: { fontSize: 24, fontWeight: 'bold', color: isDark ? '#09090B' : '#FAFAFA', marginBottom: 8 },
    heroSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginBottom: 16 },
    versionBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
    versionText: { color: isDark ? '#09090B' : '#FAFAFA', fontSize: 12, fontWeight: '600' },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
    statCard: { width: '48%', borderWidth: 0, shadowColor: isDark ? '#F9FAFB' : '#000', shadowOpacity: 0.05, elevation: 1 },
    statContent: { padding: 16, alignItems: 'center' },
    statIconContainer: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    statValue: { fontSize: 20, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#333' },
    statLabel: { fontSize: 12, color: isDark ? '#9CA3AF' : '#666' },
    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#111' },
    missionContent: { padding: 20, flexDirection: 'row', gap: 16 },
    missionIconContainer: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#f3e8ff', alignItems: 'center', justifyContent: 'center' },
    missionText: { flex: 1, fontSize: 14, color: '#444', lineHeight: 20 },
    card: { borderWidth: 0, shadowColor: isDark ? '#F9FAFB' : '#000', shadowOpacity: 0.05, elevation: 1 },
    teamCard: { width: 120, marginRight: 12, borderWidth: 0 },
    teamContent: { padding: 12, alignItems: 'center' },
    teamImage: { width: 64, height: 64, borderRadius: 32, marginBottom: 8 },
    teamName: { fontSize: 14, fontWeight: '600', color: isDark ? '#F9FAFB' : '#333' },
    teamRole: { fontSize: 12, color: isDark ? '#9CA3AF' : '#666' },
    copyright: { fontSize: 12, color: isDark ? '#6B7280' : '#999' },
    legalLink: { fontSize: 12, color: '#7C3AED', fontWeight: '500' }
});
