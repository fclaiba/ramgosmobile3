import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, StatusBar, Image, Platform } from 'react-native';
import { User, Mail, Phone, MapPin, Calendar, Camera, Edit2, Save, X, Award, TrendingUp, Heart, ShoppingBag, Ticket, PartyPopper, Shield, CreditCard, Bell, Settings, ChevronRight, LogOut, ArrowLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

import { useAuth } from '../contexts/AuthContext';
import { usePoints } from '../contexts/PointsContext';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';

interface UserProfile {
    name: string;
    email: string;
    phone: string;
    location: string;
    bio: string;
    joinDate: string;
    avatarUrl: string;
}

interface UserStats {
    purchases: number;
    bonuses: number;
    events: number;
    savings: number;
    level: number;
    expProgress: number;
}

export default function ProfileScreen({ navigation }: any) {
    const { user, logout } = useAuth();
    const { points } = usePoints();
    const [isEditing, setIsEditing] = useState(false);

    // Initial State Mock
    const [profile, setProfile] = useState<UserProfile>({
        name: user?.name || 'María García',
        email: user?.email || 'maria@ejemplo.com',
        phone: '+1 (555) 123-4567',
        location: 'Miami, FL',
        bio: 'Amante de las ofertas y la comunidad latina. Siempre buscando las mejores experiencias.',
        joinDate: 'Octubre 2025',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
    });

    const [stats, setStats] = useState<UserStats>({
        purchases: 28,
        bonuses: 12,
        events: 5,
        savings: 1250,
        level: 8,
        expProgress: 65,
    });

    const [editedProfile, setEditedProfile] = useState(profile);

    const handleSave = () => {
        if (!editedProfile.name.trim()) {
            Alert.alert('Error', 'El nombre es obligatorio');
            return;
        }
        setProfile(editedProfile);
        setIsEditing(false);
        Alert.alert('Éxito', 'Perfil actualizado exitosamente');
    };

    const handleCancel = () => {
        setEditedProfile(profile);
        setIsEditing(false);
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            "Eliminar Cuenta",
            "¿Estás absolutamente seguro? Esta acción no se puede deshacer.",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sí, eliminar",
                    style: "destructive",
                    onPress: () => {
                        Alert.alert("Cuenta eliminada", "Tu cuenta ha sido marcada para eliminación.");
                        setTimeout(() => {
                            logout().catch(() => { });
                        }, 2000);
                    }
                }
            ]
        );
    };

    const quickActions = [
        { icon: ShoppingBag, label: 'Mis Compras', value: stats.purchases, color: '#06b6d4' },
        { icon: Ticket, label: 'Bonos', value: stats.bonuses, color: '#a855f7' },
        { icon: PartyPopper, label: 'Eventos', value: stats.events, color: '#ec4899' },
    ];

    const settingsOptions = [
        { icon: CreditCard, label: 'Métodos de Pago', badge: '2' },
        { icon: Bell, label: 'Notificaciones', badge: null },
        { icon: Shield, label: 'Privacidad y Seguridad', badge: null },
        { icon: Settings, label: 'Configuración', badge: null },
    ];

    const renderProgressBar = (value: number) => (
        <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${value}%` }]} />
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                {/* HERO HEADER */}
                <View style={styles.headerContainer}>
                    <LinearGradient colors={['#7C3AED', '#EC4899']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />

                    {/* Top Bar */}
                    <View style={styles.topBar}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                                <ArrowLeft size={24} color="#fff" />
                            </TouchableOpacity>
                            <Text style={styles.screenTitle}>Mi Perfil</Text>
                        </View>
                        {!isEditing ? (
                            <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editBtn}>
                                <Edit2 size={18} color="#fff" />
                            </TouchableOpacity>
                        ) : (
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <TouchableOpacity onPress={handleCancel} style={styles.editBtn}>
                                    <X size={18} color="#fff" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleSave} style={styles.editBtn}>
                                    <Save size={18} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* Profile Info */}
                    <View style={styles.profileHeader}>
                        <View style={styles.avatarWrapper}>
                            <Avatar style={styles.avatar}>
                                <AvatarImage src={profile.avatarUrl} />
                                <AvatarFallback>{profile.name[0]}</AvatarFallback>
                            </Avatar>
                            {isEditing && (
                                <TouchableOpacity style={styles.cameraBtn}>
                                    <Camera size={16} color="#000" />
                                </TouchableOpacity>
                            )}
                        </View>
                        <Text style={styles.name}>{profile.name}</Text>
                        <Text style={styles.email}>{profile.email}</Text>

                        <View style={styles.badgesRow}>
                            <View style={styles.badge}>
                                <Award size={12} color="#FBBF24" fill="#FBBF24" />
                                <Text style={styles.badgeText}>Nivel {stats.level}</Text>
                            </View>
                            <View style={styles.badge}>
                                <Calendar size={12} color="#fff" />
                                <Text style={styles.badgeText}>Desde {profile.joinDate}</Text>
                            </View>
                        </View>

                        {/* Level Progress */}
                        <View style={styles.levelProgressContainer}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, width: '100%' }}>
                                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' }}>Progreso de Nivel</Text>
                                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{stats.expProgress}%</Text>
                            </View>
                            {renderProgressBar(stats.expProgress)}
                        </View>
                    </View>
                </View>

                <View style={styles.bodyContainer}>
                    {/* STATS HIGHLIGHTS */}
                    <View style={styles.statsGrid}>
                        <View style={[styles.statCard, { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' }]}>
                            <View style={styles.statIconCircle}>
                                <TrendingUp size={20} color="#16A34A" />
                            </View>
                            <View>
                                <Text style={styles.statLabel}>Ahorrado</Text>
                                <Text style={[styles.statValue, { color: '#16A34A' }]}>${stats.savings}</Text>
                            </View>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#FFFBEB', borderColor: '#FEF3C7' }]}>
                            <View style={[styles.statIconCircle, { backgroundColor: '#FEF3C7' }]}>
                                <Heart size={20} color="#D97706" fill="#D97706" />
                            </View>
                            <View>
                                <Text style={styles.statLabel}>Puntos</Text>
                                <Text style={[styles.statValue, { color: '#D97706' }]}>{points}</Text>
                            </View>
                        </View>
                    </View>

                    {/* QUICK ACTIONS */}
                    <Text style={styles.sectionHeader}>Actividad</Text>
                    <View style={styles.quickActionsRow}>
                        {quickActions.map((action, i) => (
                            <TouchableOpacity key={i} style={styles.actionCard}>
                                <View style={[styles.actionIconBox, { backgroundColor: action.color }]}>
                                    <action.icon size={20} color="#fff" />
                                </View>
                                <Text style={styles.actionValue}>{action.value}</Text>
                                <Text style={styles.actionLabel}>{action.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* PERSONAL INFO FORM */}
                    <Text style={styles.sectionHeader}>Información Personal</Text>
                    <View style={styles.card}>
                        <View style={styles.formRow}>
                            <View style={styles.formIcon}>
                                <User size={18} color="#6B7280" />
                            </View>
                            <View style={styles.formContent}>
                                <Text style={styles.formLabel}>Nombre Completo</Text>
                                {isEditing ?
                                    <TextInput value={editedProfile.name} onChangeText={t => setEditedProfile({ ...editedProfile, name: t })} style={styles.inputObj} /> :
                                    <Text style={styles.formValue}>{profile.name}</Text>
                                }
                            </View>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.formRow}>
                            <View style={styles.formIcon}>
                                <Mail size={18} color="#6B7280" />
                            </View>
                            <View style={styles.formContent}>
                                <Text style={styles.formLabel}>Email</Text>
                                {isEditing ?
                                    <TextInput value={editedProfile.email} onChangeText={t => setEditedProfile({ ...editedProfile, email: t })} style={styles.inputObj} /> :
                                    <Text style={styles.formValue}>{profile.email}</Text>
                                }
                            </View>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.formRow}>
                            <View style={styles.formIcon}>
                                <Phone size={18} color="#6B7280" />
                            </View>
                            <View style={styles.formContent}>
                                <Text style={styles.formLabel}>Teléfono</Text>
                                {isEditing ?
                                    <TextInput value={editedProfile.phone} onChangeText={t => setEditedProfile({ ...editedProfile, phone: t })} style={styles.inputObj} /> :
                                    <Text style={styles.formValue}>{profile.phone}</Text>
                                }
                            </View>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.formRow}>
                            <View style={styles.formIcon}>
                                <MapPin size={18} color="#6B7280" />
                            </View>
                            <View style={styles.formContent}>
                                <Text style={styles.formLabel}>Ubicación</Text>
                                {isEditing ?
                                    <TextInput value={editedProfile.location} onChangeText={t => setEditedProfile({ ...editedProfile, location: t })} style={styles.inputObj} /> :
                                    <Text style={styles.formValue}>{profile.location}</Text>
                                }
                            </View>
                        </View>
                    </View>

                    {/* SETTINGS MENU */}
                    <Text style={styles.sectionHeader}>Ajustes</Text>
                    <View style={styles.card}>
                        {settingsOptions.map((opt, i) => (
                            <TouchableOpacity key={i} style={[styles.settingsItem, i < settingsOptions.length - 1 && styles.borderBottom]}>
                                <View style={styles.settingsLeft}>
                                    <View style={styles.settingsIcon}>
                                        <opt.icon size={18} color="#374151" />
                                    </View>
                                    <Text style={styles.settingsLabel}>{opt.label}</Text>
                                </View>
                                <ChevronRight size={18} color="#9CA3AF" />
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* LOGOUT */}
                    <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
                        <LogOut size={18} color="#EF4444" />
                        <Text style={styles.logoutText}>Cerrar Sesión</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
                        <Text style={styles.deleteText}>Eliminar Cuenta</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },

    // Header
    headerContainer: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40, alignItems: 'center', backgroundColor: '#7C3AED', borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingHorizontal: 24, marginBottom: 24 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    screenTitle: { fontSize: 18, color: '#fff', fontWeight: 'bold' },
    editBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

    profileHeader: { alignItems: 'center', width: '100%' },
    avatarWrapper: { position: 'relative', marginBottom: 16 },
    avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)' },
    cameraBtn: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#fff', padding: 8, borderRadius: 20 },

    name: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
    email: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginBottom: 16 },

    badgesRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
    badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },

    levelProgressContainer: { width: '80%', alignItems: 'center' },
    progressBarBg: { width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#fff', borderRadius: 3 },

    // Body
    bodyContainer: { paddingHorizontal: 20, marginTop: -30 },

    // Stats Grid
    statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    statCard: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, gap: 12, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    statIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
    statLabel: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
    statValue: { fontSize: 18, fontWeight: 'bold' },

    // Quick Actions
    sectionHeader: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 12, marginLeft: 4 },
    quickActionsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    actionCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
    actionIconBox: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    actionValue: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 2 },
    actionLabel: { fontSize: 11, color: '#6B7280', fontWeight: '500' },

    // Forms & Settings
    card: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', marginBottom: 24, padding: 4, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
    formRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    formIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    formContent: { flex: 1 },
    formLabel: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
    formValue: { fontSize: 15, color: '#1F2937', fontWeight: '500' },
    inputObj: { fontSize: 15, color: '#111827', borderBottomWidth: 1, borderBottomColor: '#7C3AED', paddingVertical: 2 },
    divider: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 68 }, // Indented divider

    settingsItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    settingsLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    settingsIcon: { width: 32, alignItems: 'center' },
    settingsLabel: { fontSize: 15, color: '#374151', fontWeight: '500' },
    borderBottom: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },

    logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', paddingVertical: 16, borderRadius: 16, gap: 8, marginBottom: 12 },
    logoutText: { color: '#EF4444', fontWeight: 'bold', fontSize: 15 },
    deleteBtn: { alignItems: 'center', paddingVertical: 12 },
    deleteText: { color: '#9CA3AF', fontSize: 13, textDecorationLine: 'underline' },
});
