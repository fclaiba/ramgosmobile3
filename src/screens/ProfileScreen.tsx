import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, StatusBar, Platform, Alert } from 'react-native';
import { User, Mail, Phone, MapPin, Calendar, Camera, Edit2, Save, X, Award, TrendingUp, Heart, ShoppingBag, Ticket, PartyPopper, Shield, CreditCard, Bell, Settings, ChevronRight, LogOut, ArrowLeft, Users, Crown } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

import { useAuth } from '../contexts/AuthContext';
import { usePoints } from '../contexts/PointsContext';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Button } from '../components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { AlertTriangle } from 'lucide-react-native';
import { useToast } from '../contexts/ToastContext';
import { useReferral } from '../contexts/ReferralContext';
import { MobileNav } from '../components/MobileNav';

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
}

export default function ProfileScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const { user, logout, refreshActiveSession } = useAuth();
    const { points, currentTier, nextTier, lifetimePoints, transactions } = usePoints();
    const { referralSummary, referralCode } = useReferral();
    const setAccountAge = useMutation((api.developer as any).debug_setAccountAge);
    const triggerCron = useMutation((api.developer as any).debug_triggerCron);
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
        // level: 8, // Removed mock
        // expProgress: 65, // Removed mock
    });

    const [editedProfile, setEditedProfile] = useState(profile);

    const handleSave = () => {
        if (!editedProfile.name.trim()) {
            show('El nombre es obligatorio', 'error');
            return;
        }
        setProfile(editedProfile);
        setIsEditing(false);
        show('Perfil actualizado exitosamente', 'success');
    };

    const handleCancel = () => {
        setEditedProfile(profile);
        setIsEditing(false);
    };

    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [pointsHistoryVisible, setPointsHistoryVisible] = useState(false);

    const pointHistoryPreview = useMemo(() => transactions.slice(0, 6), [transactions]);
    const totalEarnedPoints = useMemo(
        () => transactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
        [transactions],
    );
    const totalSpentPoints = useMemo(
        () => Math.abs(transactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)),
        [transactions],
    );

    const handleDeleteAccount = () => {
        setDeleteModalVisible(true);
    };

    const confirmDelete = () => {
        setDeleteModalVisible(false);
        show("Cuenta eliminada. Tu cuenta ha sido marcada para eliminación.", "info");
        setTimeout(() => {
            logout().catch(() => { });
        }, 2000);
    };

    const quickActions = [
        { icon: ShoppingBag, label: 'Mis Compras', value: stats.purchases, color: '#06b6d4' },
        { icon: Users, label: 'Invitar Amigos', value: 'Gana $$', color: '#10B981', action: () => navigation.navigate('Referrals') },
        { icon: Ticket, label: 'Bonos', value: stats.bonuses, color: '#a855f7' },
        { icon: PartyPopper, label: 'Eventos', value: stats.events, color: '#ec4899' },
    ];

    const settingsOptions = [
        { icon: CreditCard, label: 'Métodos de Pago', badge: '2' },
        { icon: Bell, label: 'Notificaciones', badge: null },
        { icon: Shield, label: 'Privacidad y Seguridad', badge: null },
        { icon: Settings, label: 'Configuración', badge: null },
    ];

    const range = nextTier ? (nextTier.minPoints - currentTier.minPoints) : 1;
    const progress = Math.max(0, lifetimePoints - currentTier.minPoints);
    const progressPercentage = nextTier
        ? Math.min(100, (progress / range) * 100)
        : 100;

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
                {/* ... existing header code ... */}

                {/* (Keep existing code above) */}

                {/* ... inside Developer Tools block ... */}


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
                                <AvatarFallback style={isDark ? { backgroundColor: '#374151' } : {}} textStyle={isDark ? { color: '#F9FAFB' } : {}}>{profile.name[0]}</AvatarFallback>
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
                                <Text style={styles.badgeText}>Nivel {currentTier?.label || 'Bronze'}</Text>
                            </View>
                            <View style={styles.badge}>
                                <Calendar size={12} color="#fff" />
                                <Text style={styles.badgeText}>Desde {profile.joinDate}</Text>
                            </View>
                            {/* Subscription Badge */}
                            {['pro', 'business'].includes((user as any)?.subscriptionTier) ? (
                                <View style={[styles.badge, { backgroundColor: '#F59E0B' }]}>
                                    <Crown size={12} color="#FFF" fill="#FFF" />
                                    <Text style={styles.badgeText}>{(user as any)?.subscriptionTier?.toUpperCase()}</Text>
                                </View>
                            ) : (
                                <TouchableOpacity
                                    style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.3)', borderWidth: 1, borderColor: '#F59E0B' }]}
                                    onPress={() => navigation.navigate('SubscriptionPlans')}
                                >
                                    <Crown size={12} color="#F59E0B" />
                                    <Text style={[styles.badgeText, { color: '#FCD34D' }]}>SER PRO</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Level Progress */}
                        <View style={styles.levelProgressContainer}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, width: '100%' }}>
                                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' }}>
                                    {nextTier ? `Próximo: ${nextTier.label}` : 'Nivel Máximo'}
                                </Text>
                                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{Math.floor(progressPercentage)}%</Text>
                            </View>
                            {renderProgressBar(progressPercentage)}
                        </View>
                    </View>
                </View>

                <View style={styles.bodyContainer}>
                    {/* STATS HIGHLIGHTS */}
                    {/* STATS HIGHLIGHTS */}
                    <View style={styles.statsGrid}>
                        <View style={[styles.statCard, isDark ? { backgroundColor: '#064E3B', borderColor: '#065F46' } : { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' }]}>
                            <View style={styles.statIconCircle}>
                                <TrendingUp size={20} color="#16A34A" />
                            </View>
                            <View>
                                <Text style={styles.statLabel}>Ahorrado</Text>
                                <Text style={[styles.statValue, { color: '#16A34A' }]}>${stats.savings}</Text>
                            </View>
                        </View>
                        <View style={[styles.statCard, isDark ? { backgroundColor: '#451A03', borderColor: '#78350F' } : { backgroundColor: '#FFFBEB', borderColor: '#FEF3C7' }]}>
                            <View style={[styles.statIconCircle, isDark ? { backgroundColor: '#78350F' } : { backgroundColor: '#FEF3C7' }]}>
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
                            <TouchableOpacity key={i} style={styles.actionCard} onPress={action.action}>
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
                                    <TextInput
                                        value={editedProfile.name}
                                        onChangeText={t => setEditedProfile({ ...editedProfile, name: t })}
                                        style={styles.inputObj}
                                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                    /> :
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
                                    <TextInput
                                        value={editedProfile.email}
                                        onChangeText={t => setEditedProfile({ ...editedProfile, email: t })}
                                        style={styles.inputObj}
                                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                    /> :
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
                                    <TextInput
                                        value={editedProfile.phone}
                                        onChangeText={t => setEditedProfile({ ...editedProfile, phone: t })}
                                        style={styles.inputObj}
                                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                    /> :
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
                                    <TextInput
                                        value={editedProfile.location}
                                        onChangeText={t => setEditedProfile({ ...editedProfile, location: t })}
                                        style={styles.inputObj}
                                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                    /> :
                                    <Text style={styles.formValue}>{profile.location}</Text>
                                }
                            </View>
                        </View>
                    </View>

                    {/* POINTS & REFERRALS */}
                    <Text style={styles.sectionHeader}>Puntos y Referidos</Text>
                    <View style={styles.card}>
                        <TouchableOpacity style={styles.pointsTopRow} onPress={() => setPointsHistoryVisible(true)}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.pointsTitle}>Historial de puntos</Text>
                                <Text style={styles.pointsSubtitle}>Tocá para ver el detalle</Text>
                            </View>
                            <ChevronRight size={18} color="#9CA3AF" />
                        </TouchableOpacity>

                        <View style={styles.divider} />
                        <View style={styles.pointsSummaryRow}>
                            <View style={styles.pointsSummaryCard}>
                                <Text style={styles.pointsSummaryLabel}>Ganados</Text>
                                <Text style={[styles.pointsSummaryValue, { color: '#16A34A' }]}>+{totalEarnedPoints}</Text>
                            </View>
                            <View style={styles.pointsSummaryCard}>
                                <Text style={styles.pointsSummaryLabel}>Canjeados</Text>
                                <Text style={[styles.pointsSummaryValue, { color: '#EF4444' }]}>{totalSpentPoints}</Text>
                            </View>
                            <View style={styles.pointsSummaryCard}>
                                <Text style={styles.pointsSummaryLabel}>Saldo</Text>
                                <Text style={[styles.pointsSummaryValue, { color: '#D97706' }]}>{points}</Text>
                            </View>
                        </View>

                        <View style={styles.divider} />
                        <View style={styles.referralRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.pointsTitle}>Referidos</Text>
                                <Text style={styles.pointsSubtitle}>
                                    Código: <Text style={{ fontWeight: '700' }}>{referralCode}</Text>
                                </Text>
                                <Text style={styles.pointsSubtitle}>
                                    Registros: {referralSummary.registrations} · Compras: {referralSummary.purchases} · Puntos: {referralSummary.totalPoints}
                                </Text>
                            </View>
                            <Button variant="outline" onPress={() => navigation.navigate('Referrals')}>
                                <Text style={{ color: isDark ? '#D1D5DB' : '#374151' }}>Ver</Text>
                            </Button>
                        </View>
                    </View>

                    {/* SETTINGS MENU */}
                    <Text style={styles.sectionHeader}>Ajustes</Text>
                    <View style={styles.card}>
                        {settingsOptions.map((opt, i) => (
                            <TouchableOpacity key={i} style={[styles.settingsItem, i < settingsOptions.length - 1 && styles.borderBottom]}>
                                <View style={styles.settingsLeft}>
                                    <View style={styles.settingsIcon}>
                                        <opt.icon size={18} color={isDark ? "#D1D5DB" : "#374151"} />
                                    </View>
                                    <Text style={styles.settingsLabel}>{opt.label}</Text>
                                </View>
                                <ChevronRight size={18} color="#9CA3AF" />
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* LOGOUT */}
                    <TouchableOpacity style={styles.logoutBtn} onPress={() => logout()}>
                        <LogOut size={18} color="#EF4444" />
                        <Text style={styles.logoutText}>Cerrar Sesión</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
                        <Text style={styles.deleteText}>Eliminar Cuenta</Text>
                    </TouchableOpacity>

                    {/* DEBUG SECTION */}
                    <View style={{ marginTop: 20, padding: 16, backgroundColor: isDark ? '#374151' : '#F3F4F6', borderRadius: 12 }}>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: isDark ? '#D1D5DB' : '#6B7280', marginBottom: 8 }}>DEBUG AREA</Text>
                        <Text style={{ color: isDark ? '#FFF' : '#000', marginBottom: 8 }}>KYC Status: {user?.kycStatus || 'N/A'}</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Button
                                size="sm"
                                onPress={async () => {
                                    if (!user) return;
                                    const { mockConvexStore } = require('../services/auth/mockConvexStore');
                                    await mockConvexStore.updateKycStatus(user.id, 'approved');
                                    await refreshActiveSession();
                                    show('Forzar verificar: OK', 'success');
                                }}
                            >
                                <Text>Forzar Verificar</Text>
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onPress={async () => {
                                    if (!user) return;
                                    const { mockConvexStore } = require('../services/auth/mockConvexStore');
                                    await mockConvexStore.updateKycStatus(user.id, 'unverified');
                                    await refreshActiveSession();
                                    show('Forzar des-verificar: OK', 'info');
                                }}
                            >
                                <Text>Forzar Des-Verificar</Text>
                            </Button>
                        </View>
                    </View>
                </View>

            </ScrollView>

            <Sheet open={pointsHistoryVisible} onOpenChange={setPointsHistoryVisible}>
                <SheetContent side="bottom" style={styles.sheetContent}>
                    <SheetHeader>
                        <SheetTitle>Historial de puntos</SheetTitle>
                    </SheetHeader>
                    <View style={styles.sheetBody}>
                        {transactions.length === 0 ? (
                            <Text style={styles.sheetText}>Todavía no tenés movimientos de puntos.</Text>
                        ) : (
                            <View style={{ width: '100%', gap: 10 }}>
                                {pointHistoryPreview.map((tx) => {
                                    const isEarn = tx.amount >= 0;
                                    const amountLabel = `${isEarn ? '+' : ''}${tx.amount}`;
                                    const dateLabel = new Date(tx.date).toLocaleString();
                                    return (
                                        <View key={tx.id} style={styles.txRow}>
                                            <View style={[styles.txDot, { backgroundColor: isEarn ? '#16A34A' : '#EF4444' }]} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.txTitle}>{tx.description}</Text>
                                                <Text style={styles.txMeta}>{dateLabel}</Text>
                                            </View>
                                            <Text style={[styles.txAmount, { color: isEarn ? '#16A34A' : '#EF4444' }]}>{amountLabel}</Text>
                                        </View>
                                    );
                                })}
                                {transactions.length > pointHistoryPreview.length && (
                                    <Text style={[styles.txMeta, { textAlign: 'center', marginTop: 4 }]}>
                                        Mostrando {pointHistoryPreview.length} de {transactions.length}.
                                    </Text>
                                )}
                            </View>
                        )}
                    </View>
                </SheetContent>
            </Sheet>

            <Sheet open={deleteModalVisible} onOpenChange={setDeleteModalVisible}>
                <SheetContent side="bottom" style={styles.sheetContent}>
                    <SheetHeader>
                        <SheetTitle>Eliminar Cuenta</SheetTitle>
                    </SheetHeader>
                    <View style={styles.sheetBody}>
                        <View style={[styles.confirmationIcon, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2' }]}>
                            <AlertTriangle size={32} color={isDark ? '#ef4444' : '#dc2626'} />
                        </View>
                        <Text style={styles.sheetText}>
                            ¿Estás absolutamente seguro? Esta acción no se puede deshacer y perderás todos tus datos y puntos acumulados.
                        </Text>
                        <View style={styles.sheetActions}>
                            <Button variant="outline" style={{ flex: 1 }} onPress={() => setDeleteModalVisible(false)}>
                                <Text style={{ color: isDark ? '#D1D5DB' : '#374151' }}>Cancelar</Text>
                            </Button>
                            <Button
                                style={{ flex: 1, backgroundColor: '#dc2626' }}
                                onPress={confirmDelete}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Sí, eliminar</Text>
                            </Button>
                        </View>
                    </View>
                </SheetContent>
            </Sheet>

            <MobileNav
                activeSection={'home'}
                onSectionChange={(section) => navigation.navigate('Home', { screen: 'HomeScreen', params: { initialTab: section } })}
            />
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#111827' : '#F9FAFB' },

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
    statIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? '#065F46' : '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
    statLabel: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280', marginBottom: 2 },
    statValue: { fontSize: 18, fontWeight: 'bold' },

    // Quick Actions
    sectionHeader: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 12, marginLeft: 4 },
    quickActionsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    actionCard: { flex: 1, backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 16, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
    actionIconBox: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    actionValue: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 2 },
    actionLabel: { fontSize: 11, color: isDark ? '#9CA3AF' : '#6B7280', fontWeight: '500' },

    // Forms & Settings
    card: { backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 20, overflow: 'hidden', marginBottom: 24, padding: 4, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
    formRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    formIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? '#374151' : '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    formContent: { flex: 1 },
    formLabel: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280', marginBottom: 2 },
    formValue: { fontSize: 15, color: isDark ? '#F9FAFB' : '#1F2937', fontWeight: '500' },
    inputObj: { fontSize: 15, color: isDark ? '#F9FAFB' : '#111827', borderBottomWidth: 1, borderBottomColor: '#7C3AED', paddingVertical: 2 },
    divider: { height: 1, backgroundColor: isDark ? '#374151' : '#F3F4F6', marginLeft: 68 },

    // Points & referrals
    pointsTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    pointsTitle: { fontSize: 15, fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827' },
    pointsSubtitle: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280', marginTop: 2 },
    pointsSummaryRow: { flexDirection: 'row', gap: 10, padding: 16 },
    pointsSummaryCard: { flex: 1, backgroundColor: isDark ? '#111827' : '#F9FAFB', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB' },
    pointsSummaryLabel: { fontSize: 11, color: isDark ? '#9CA3AF' : '#6B7280', marginBottom: 4 },
    pointsSummaryValue: { fontSize: 16, fontWeight: '800' },
    referralRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16 },

    txRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 14, backgroundColor: isDark ? '#111827' : '#F9FAFB', borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB' },
    txDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
    txTitle: { fontSize: 13, fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827' },
    txMeta: { fontSize: 11, color: isDark ? '#9CA3AF' : '#6B7280', marginTop: 2 },
    txAmount: { fontSize: 13, fontWeight: '800' },

    settingsItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    settingsLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    settingsIcon: { width: 32, alignItems: 'center' },
    settingsLabel: { fontSize: 15, color: isDark ? '#D1D5DB' : '#374151', fontWeight: '500' },
    borderBottom: { borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F3F4F6' },

    logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#3B1010' : '#FEF2F2', paddingVertical: 16, borderRadius: 16, gap: 8, marginBottom: 12 },
    logoutText: { color: '#EF4444', fontWeight: 'bold', fontSize: 15 },
    deleteBtn: { alignItems: 'center', paddingVertical: 12 },
    deleteText: { color: '#9CA3AF', fontSize: 13, textDecorationLine: 'underline' },

    // Sheet Styles
    sheetContent: {
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    sheetBody: {
        padding: 24,
        paddingBottom: 40,
        alignItems: 'center',
        gap: 16
    },
    confirmationIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8
    },
    sheetText: {
        fontSize: 16,
        color: isDark ? '#D1D5DB' : '#4B5563',
        textAlign: 'center',
        marginBottom: 16
    },
    sheetActions: {
        flexDirection: 'row',
        gap: 12,
        width: '100%'
    }
});
