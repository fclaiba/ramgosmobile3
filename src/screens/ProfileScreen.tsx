import React, { useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, StatusBar, Platform , KeyboardAvoidingView, Image} from 'react-native';
import { User, Mail, Phone, MapPin, Calendar, Camera, Edit2, Save, X, Award, TrendingUp, Heart, ShoppingBag, Ticket, PartyPopper, Shield, CreditCard, Bell, Settings, ChevronRight, LogOut, ArrowLeft, Users, Crown, AtSign, Hash, ListTodo, Lock, LayoutDashboard, CheckCircle2, QrCode, Tag, Trophy, Flame, Coins, Map, Gamepad2, Building, AlertCircle, Copy } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../contexts/ThemeContext';

import { useAuth } from '../contexts/AuthContext';
import { usePoints } from '../contexts/PointsContext';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Button } from '../components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { AlertTriangle } from 'lucide-react-native';
import { useToast } from '../contexts/ToastContext';
import { useReferral } from '../contexts/ReferralContext';
import { useNotifications } from '../contexts/NotificationsContext';
import { useSavedPaymentMethods } from '../payments/hooks/useSavedPaymentMethods';
import { MobileNav } from '../components/MobileNav';
import { glassShadow, Radius, colors } from '../theme/tokens';
import { useTranslation } from 'react-i18next';
import { formatReferralAlias, LIMITS } from '../utils/inputLimits';


interface UserProfile {
    name: string;
    email: string;
    phone: string;
    location: string;
    bio: string;
    joinDate: string;
    avatarUrl: string;
    username: string;
    /** Optional vanity invite alias (distinct from @username). */
    referralAlias: string;
}

interface UserStats {
    purchases: number;
    bonuses: number;
    events: number;
    savings: number;
}

function ProfileScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();
    const { t } = useTranslation();

    const { user, logout, sessionToken, refreshActiveSession } = useAuth();
    const { points, currentTier, nextTier, lifetimePoints, transactions } = usePoints();
    const { referralSummary, referralCode, username: referralUsername, referralAlias } = useReferral();
    const { unreadCount } = useNotifications();
    const { count: paymentMethodsCount } = useSavedPaymentMethods();
    const [isEditing, setIsEditing] = useState(false);

    // Initial State Mock
    const [profile, setProfile] = useState<UserProfile>({
        name: user?.name || '',
        email: user?.email || '',
        phone: (user as any)?.phone || '',
        location: (user as any)?.location || '',
        bio: (user as any)?.bio || '',
        joinDate: (user as any)?.joinedAt ? new Date((user as any).joinedAt).toLocaleDateString() : '',
        avatarUrl: (user as any)?.avatarUrl || (user as any)?.avatar || '',
        username: (user as any)?.username || '',
        referralAlias: (user as any)?.referralAlias || '',
    });

    React.useEffect(() => {
        if (user) {
            setProfile({
                name: user.name || '',
                email: user.email || '',
                phone: (user as any).phone || '',
                location: (user as any).location || '',
                bio: (user as any).bio || '',
                joinDate: (user as any).joinedAt ? new Date((user as any).joinedAt).toLocaleDateString() : '',
                avatarUrl: (user as any).avatarUrl || (user as any).avatar || '',
                username: (user as any).username || referralUsername || '',
                referralAlias: (user as any).referralAlias || referralAlias || '',
            });
        }
    }, [user, referralUsername, referralAlias]);

    const updateProfileMutation = useMutation(api.users.updateProfile);
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);

    const rawStats = useQuery(api.users.getUserActivityStats, user?.id ? {} : "skip");
    const stats = rawStats || {
        purchases: 0,
        bonuses: 0,
        events: 0,
        savings: 0,
    };

    const [editedProfile, setEditedProfile] = useState(profile);

    const handleSave = async () => {
        if (!editedProfile.name.trim()) {
            show(t('profile.nameRequired', { defaultValue: 'El nombre es obligatorio' }), 'error');
            return;
        }
        
        let finalAvatarUrl = editedProfile.avatarUrl;
        if (finalAvatarUrl && finalAvatarUrl.startsWith('file:/')) {
            try {
                const uploadUrl = await generateUploadUrl({ sessionToken: sessionToken || '', actorId: (user as any)?.id });
                let blob;
                try {
                    const fetchResponse = await fetch(finalAvatarUrl);
                    blob = await fetchResponse.blob();
                } catch (err) {
                    blob = await new Promise<Blob>((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.onload = function() { resolve(xhr.response); };
                        xhr.onerror = function() { reject(new TypeError('Network request failed')); };
                        xhr.responseType = 'blob';
                        xhr.open('GET', finalAvatarUrl, true);
                        xhr.send(null);
                    });
                }
                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'image/jpeg' },
                    body: blob,
                });
                const { storageId } = await response.json();
                finalAvatarUrl = `convex-storage:${storageId}`;
            } catch (error) {
                show(t('profile.imageUploadError', { defaultValue: 'Error al subir la imagen' }), 'error');
                return;
            }
        }
        
        try {
            await updateProfileMutation({
                id: (user as any)?.id,
                sessionToken: sessionToken || '',
                updates: {
                    name: editedProfile.name,
                    username: editedProfile.username,
                    referralAlias: editedProfile.referralAlias,
                    avatar: finalAvatarUrl,
                }
            });
            await refreshActiveSession();
            setProfile({ ...editedProfile, avatarUrl: finalAvatarUrl });
            setIsEditing(false);
            show(t('profile.updated', { defaultValue: 'Perfil actualizado correctamente' }), 'success');
        } catch (error: any) {
            show(error.message || t('profile.updateError', { defaultValue: 'Error al actualizar' }), 'error');
        }
    };

    const handleAvatarPress = async () => {
        if (!isEditing) return;
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
                setEditedProfile(prev => ({ ...prev, avatarUrl: result.assets[0].uri }));
            }
        } catch (error) {
            show(t('profile.pickImageError', { defaultValue: 'Error al seleccionar imagen' }), 'error');
        }
    };

    const handleCancel = () => {
        setEditedProfile(profile);
        setIsEditing(false);
    };

    const [pointsHistoryVisible, setPointsHistoryVisible] = useState(false);

    const pointHistoryPreview = useMemo(() => transactions.slice(0, 6), [transactions]);
    const totalEarnedPoints = useMemo(
        () => transactions.filter((t: any) => t.amount > 0).reduce((sum: any, t: any) => sum + t.amount, 0),
        [transactions],
    );
    const totalSpentPoints = useMemo(
        () => Math.abs(transactions.filter((t: any) => t.amount < 0).reduce((sum: any, t: any) => sum + t.amount, 0)),
        [transactions],
    );

    const quickActions = [
        { icon: Calendar, label: 'Mis Turnos', value: null, color: '#3B82F6', action: () => navigation.navigate('MyBookings') },
        { icon: ShoppingBag, label: 'Mis Compras', value: stats.purchases, color: '#06b6d4', action: () => navigation.navigate('History', { tab: 'purchases', filter: 'products' }) },
        { icon: Ticket, label: 'Mis Bonos', value: stats.bonuses, color: '#a855f7', action: () => navigation.navigate('History', { tab: 'purchases', filter: 'bonos' }) },
        { icon: PartyPopper, label: 'Eventos', value: stats.events, color: '#ec4899', action: () => navigation.navigate('History', { tab: 'purchases', filter: 'events' }) },
    ];

    const settingsOptions = [
        {
            icon: CreditCard,
            label: 'Métodos de Pago',
            badge: paymentMethodsCount > 0 ? String(paymentMethodsCount) : null,
            action: () => navigation.navigate('PaymentMethods'),
        },
        {
            icon: Bell,
            label: 'Notificaciones',
            badge: unreadCount > 0 ? String(unreadCount) : null,
            action: () => navigation.navigate('Notifications'),
        },
        {
            icon: Shield,
            label: 'Privacidad y Seguridad',
            badge: null,
            action: () => navigation.navigate('PrivacySecurity'),
        },
        {
            icon: Settings,
            label: 'Configuración',
            badge: null,
            action: () => navigation.navigate('Settings'),
        },
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
                    <LinearGradient colors={['#2196F3', '#EC4899']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />

                    {/* Top Bar */}
                    <View style={styles.topBar}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                                <ArrowLeft size={24} color="#fff" />
                            </TouchableOpacity>
                            <Text style={styles.screenTitle}>Mi Perfil</Text>
                        </View>
                        {!isEditing ? (
                            <TouchableOpacity onPress={() => { setEditedProfile(profile); setIsEditing(true); }} style={styles.editBtn}>
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
                        <TouchableOpacity 
                            style={styles.avatarWrapper} 
                            onPress={handleAvatarPress}
                            activeOpacity={isEditing ? 0.8 : 1}
                        >
                            <Avatar style={styles.avatar}>
                                <AvatarImage src={isEditing ? editedProfile.avatarUrl : profile.avatarUrl} />
                                <AvatarFallback style={isDark ? { backgroundColor: '#374151' } : {}} textStyle={isDark ? { color: '#F9FAFB' } : {}}>{(isEditing ? editedProfile.name : profile.name)[0]}</AvatarFallback>
                            </Avatar>
                            {isEditing && (
                                <BlurView intensity={60} tint="light" style={styles.cameraBtnGlass}>
                                    <View style={styles.cameraBtnInner}>
                                        <Camera size={16} color="#0F172A" />
                                    </View>
                                </BlurView>
                            )}
                        </TouchableOpacity>
                        
                        {isEditing ? (
                            <View style={{ alignItems: 'center', marginTop: 16, width: '100%', gap: 10 }}>
                                <BlurView intensity={20} tint="light" style={[styles.glassInputWrapper, { borderRadius: 24, maxWidth: 280 }]}>
                                    <TextInput
                                        style={[styles.editInputGlass, { fontSize: 22, fontWeight: '800' }]}
                                        value={editedProfile.name}
                                        onChangeText={(text) => setEditedProfile({ ...editedProfile, name: text })}
                                        placeholder="Tu Nombre"
                                        placeholderTextColor="rgba(255,255,255,0.6)"
                                        selectionColor="rgba(255,255,255,0.8)"
                                    />
                                </BlurView>
                                <BlurView intensity={20} tint="light" style={[styles.glassInputWrapper, { borderRadius: 20, maxWidth: 240, paddingVertical: 6 }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '500', marginRight: 4 }}>@</Text>
                                        <TextInput
                                            style={[styles.editInputGlass, { fontSize: 16, fontWeight: '500', minWidth: 100 }]}
                                            value={editedProfile.username}
                                            onChangeText={(text) => setEditedProfile({ ...editedProfile, username: text })}
                                            placeholder="usuario"
                                            placeholderTextColor="rgba(255,255,255,0.5)"
                                            autoCapitalize="none"
                                            selectionColor="rgba(255,255,255,0.8)"
                                        />
                                    </View>
                                </BlurView>
                                <BlurView intensity={20} tint="light" style={[styles.glassInputWrapper, { borderRadius: 20, maxWidth: 200, paddingVertical: 4 }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '500', marginRight: 4 }}>Alias:</Text>
                                        <TextInput
                                            style={[styles.editInputGlass, { fontSize: 13, fontWeight: '500', minWidth: 80 }]}
                                            value={editedProfile.referralAlias}
                                            onChangeText={(text) => {
                                                setEditedProfile({ ...editedProfile, referralAlias: formatReferralAlias(text) });
                                            }}
                                            placeholder="OPCIONAL"
                                            placeholderTextColor="rgba(255,255,255,0.5)"
                                            autoCapitalize="characters"
                                            selectionColor="rgba(255,255,255,0.8)"
                                            maxLength={LIMITS.referralAlias}
                                        />
                                    </View>
                                </BlurView>
                            </View>
                        ) : (
                            <View style={{ alignItems: 'center', marginTop: 12 }}>
                                <Text style={styles.name}>{profile.name}</Text>
                                <Text style={[styles.email, { opacity: 0.9, marginBottom: 4 }]}>@{profile.username || 'usuario'}</Text>
                                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '500' }}>
                                    {profile.referralAlias
                                        ? `Alias: ${profile.referralAlias} · @ también sirve`
                                        : 'Código de referido: tu @'}
                                </Text>
                            </View>
                        )}

                        <View style={[styles.badgesRow, { marginTop: isEditing ? 16 : 12 }]}>
                            <View style={[styles.badge, { backgroundColor: 'rgba(245, 158, 11, 0.2)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.4)' }]}>
                                <Flame size={12} color="#FCD34D" fill="#FCD34D" />
                                <Text style={[styles.badgeText, { color: '#FCD34D' }]}>{points} pts</Text>
                            </View>
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
                                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{(user as any)?.expProgress || 0}%</Text>
                            </View>
                            {renderProgressBar((user as any)?.expProgress || 0)}
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
                    </View>

                    {/* RAMGOS REWARDS CARD - LIQUID GLASS */}
                    <TouchableOpacity 
                        style={styles.rewardsPremiumCard} 
                        onPress={() => setPointsHistoryVisible(true)}
                        activeOpacity={0.9}
                    >
                        <LinearGradient
                            colors={isDark ? ['rgba(245, 158, 11, 0.15)', 'rgba(217, 119, 6, 0.05)'] : ['rgba(252, 211, 77, 0.3)', 'rgba(251, 191, 36, 0.1)']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.rewardsHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={styles.trophyIconBox}>
                                    <Trophy size={18} color="#D97706" fill="#F59E0B" />
                                </View>
                                <Text style={styles.rewardsTitle}>Ramgos Rewards</Text>
                            </View>
                            <ChevronRight size={18} color="#D97706" />
                        </View>
                        <View style={styles.rewardsBody}>
                            <Text style={styles.rewardsPoints}>{points}</Text>
                            <Text style={styles.rewardsLabel}>Puntos Disponibles</Text>
                        </View>
                        <View style={styles.rewardsFooter}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Flame size={14} color="#EF4444" fill="#EF4444" />
                                <Text style={styles.rewardsSubText}>+{totalEarnedPoints} ganados</Text>
                            </View>
                            <Text style={styles.rewardsActionText}>Ver Historial</Text>
                        </View>
                    </TouchableOpacity>

                    {/* QUICK ACTIONS */}
                    <Text style={styles.sectionHeader}>Actividad</Text>
                    <View style={styles.quickActionsRow}>
                        {quickActions.map((action, i) => (
                            <TouchableOpacity key={i} style={styles.actionCard} onPress={(action as any).action}>
                                <View style={[styles.actionIconBox, { backgroundColor: action.color }]}>
                                    <action.icon size={20} color="#fff" />
                                </View>
                                <Text style={styles.actionValue}>{action.value}</Text>
                                <Text style={styles.actionLabel}>{action.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity style={styles.inviteCard} onPress={() => navigation.navigate('Referrals')}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                            <View style={[styles.actionIconBox, { backgroundColor: '#10B981', marginBottom: 0 }]}>
                                <Users size={20} color="#fff" />
                            </View>
                            <View>
                                <Text style={styles.inviteValue}>Gana $$</Text>
                                <Text style={styles.inviteLabel}>Invitar Amigos</Text>
                            </View>
                        </View>
                        <ChevronRight size={20} color="#9CA3AF" />
                    </TouchableOpacity>

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
                                <AtSign size={18} color="#6B7280" />
                            </View>
                            <View style={styles.formContent}>
                                <Text style={styles.formLabel}>Nombre de Usuario</Text>
                                {isEditing ?
                                    <TextInput
                                        value={editedProfile.username}
                                        onChangeText={t => setEditedProfile({ ...editedProfile, username: t })}
                                        style={styles.inputObj}
                                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                        placeholder="Ej: ramgos123"
                                        autoCapitalize="none"
                                    /> :
                                    <Text style={styles.formValue}>{profile.username ? `@${profile.username}` : 'No definido'}</Text>
                                }
                            </View>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.formRow}>
                            <View style={styles.formIcon}>
                                <Hash size={18} color="#6B7280" />
                            </View>
                            <View style={styles.formContent}>
                                <Text style={styles.formLabel}>Alias de referido (opcional)</Text>
                                {isEditing ?
                                    <TextInput
                                        value={editedProfile.referralAlias}
                                        onChangeText={t => setEditedProfile({ ...editedProfile, referralAlias: formatReferralAlias(t) })}
                                        style={styles.inputObj}
                                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                        placeholder="Ej: MI-CODIGO"
                                        autoCapitalize="characters"
                                        maxLength={LIMITS.referralAlias}
                                    /> :
                                    <Text style={styles.formValue}>
                                        {profile.referralAlias
                                            ? profile.referralAlias
                                            : `Sin alias — usá @${profile.username || 'usuario'}`}
                                    </Text>
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

                    {/* KYC STATUS */}
                    <Text style={styles.sectionHeader}>Seguridad e Identidad</Text>
                    <View style={styles.card}>
                        <View style={styles.kycRow}>
                            <View style={styles.kycIconWrapper}>
                                <Shield size={24} color={user?.kycStatus === 'approved' ? '#10B981' : (user?.kycStatus === 'pending' ? '#F59E0B' : '#EF4444')} />
                            </View>
                            <View style={styles.kycContent}>
                                <Text style={styles.kycTitle}>
                                    {user?.kycStatus === 'approved' ? 'Identidad verificada'
                                        : user?.kycStatus === 'pending' ? 'Verificación en revisión'
                                            : user?.kycStatus === 'rejected' ? 'Verificación rechazada'
                                                : 'Verificación requerida'}
                                </Text>
                                <Text style={styles.kycSubtitle}>
                                    {user?.kycStatus === 'approved' ? 'Tu cuenta está protegida y podés operar sin límites.'
                                        : user?.kycStatus === 'pending' ? 'Estamos revisando tus documentos. Te avisaremos pronto.'
                                            : user?.kycStatus === 'rejected' ? 'Hubo un problema con tu documentación. Por favor, volvé a enviarla.'
                                                : 'Completá tu verificación KYC para vender, publicar o retirar fondos.'}
                                </Text>
                            </View>
                        </View>
                        {user?.kycStatus !== 'approved' && user?.kycStatus !== 'pending' && (
                            <TouchableOpacity 
                                style={styles.kycButton} 
                                onPress={() => navigation.navigate('KYC', { accountType: user?.role || 'consumer' })}
                            >
                                <Text style={styles.kycButtonText}>
                                    {user?.kycStatus === 'rejected' ? 'Volver a intentar' : 'Completar verificación'}
                                </Text>
                            </TouchableOpacity>
                        )}
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
                                    @{referralUsername || profile.username || 'usuario'}
                                    {referralAlias ? ` · alias ${referralAlias}` : ''}
                                    {referralCode ? ` · share ${referralCode}` : ''}
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
                    {['admin', 'developer'].includes((user as any)?.role) && (
                        <>
                            <Text style={styles.sectionHeader}>Administración</Text>
                            <View style={styles.card}>
                                <TouchableOpacity style={styles.settingsItem} onPress={() => navigation.navigate('AdminDashboard')}>
                                    <View style={styles.settingsLeft}>
                                        <View style={styles.settingsIcon}>
                                            <Shield size={18} color="#EF4444" />
                                        </View>
                                        <Text style={[styles.settingsLabel, { color: '#EF4444' }]}>Panel de Disputas y Pagos</Text>
                                    </View>
                                    <ChevronRight size={18} color="#9CA3AF" />
                                </TouchableOpacity>
                            </View>
                        </>
                    )}

                    {/* HERRAMIENTAS */}
                    {['business', 'influencer'].includes(user?.role as string) && (
                        <>
                            <Text style={styles.sectionHeader}>Herramientas</Text>
                            <View style={styles.card}>
                                {user?.role === 'business' && user?.kycStatus === 'approved' && (
                                    <TouchableOpacity style={[styles.settingsItem, styles.borderBottom]} onPress={() => navigation.navigate('BusinessForms')}>
                                        <View style={styles.settingsLeft}>
                                            <View style={[styles.settingsIcon, { backgroundColor: isDark ? '#3730a3' : '#e0e7ff' }]}>
                                                <ListTodo size={18} color={isDark ? '#818cf8' : '#4f46e5'} />
                                            </View>
                                            <Text style={styles.settingsLabel}>Mis Formularios</Text>
                                        </View>
                                        <ChevronRight size={18} color="#9CA3AF" />
                                    </TouchableOpacity>
                                )}
                                {user?.role === 'influencer' && (user as any)?.influencerStatus === 'approved' && (
                                    <TouchableOpacity
                                        style={styles.settingsItem}
                                        onPress={() => navigation.navigate('InfluencerDashboard')}
                                    >
                                        <View style={styles.settingsLeft}>
                                            <View style={[styles.settingsIcon, { backgroundColor: isDark ? '#064e3b' : '#d1fae5' }]}>
                                                <Ticket size={18} color={isDark ? '#34d399' : '#059669'} />
                                            </View>
                                            <Text style={styles.settingsLabel}>Dashboard Influencer · Bonos</Text>
                                        </View>
                                        <ChevronRight size={18} color="#9CA3AF" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </>
                    )}

                    <Text style={styles.sectionHeader}>Ajustes</Text>
                    <View style={styles.card}>
                        {settingsOptions.map((opt, i) => (
                            <TouchableOpacity
                                key={i}
                                style={[styles.settingsItem, i < settingsOptions.length - 1 && styles.borderBottom]}
                                onPress={opt.action}
                                activeOpacity={0.75}
                            >
                                <View style={styles.settingsLeft}>
                                    <View style={styles.settingsIcon}>
                                        <opt.icon size={18} color={isDark ? "#D1D5DB" : "#374151"} />
                                    </View>
                                    <Text style={styles.settingsLabel}>{opt.label}</Text>
                                    {opt.badge ? (
                                        <View style={styles.settingsBadge}>
                                            <Text style={styles.settingsBadgeText}>{opt.badge}</Text>
                                        </View>
                                    ) : null}
                                </View>
                                <ChevronRight size={18} color="#9CA3AF" />
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* LOGOUT BUTTON */}
                    <View style={{ marginTop: 24, marginBottom: 24, paddingHorizontal: 16 }}>
                        <TouchableOpacity 
                            style={styles.logoutBtn} 
                            onPress={async () => {
                                await logout();
                                // AuthContext listener should redirect automatically, 
                                // but we can force reset just in case
                                navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
                            }}
                        >
                            <LogOut size={20} color="#EF4444" />
                            <Text style={styles.logoutText}>Cerrar Sesión</Text>
                        </TouchableOpacity>
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
                                {pointHistoryPreview.map((tx: any) => {
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



            <MobileNav
                activeSection={'home'}
                onSectionChange={(section) => navigation.navigate('Home', { screen: 'HomeScreen', params: { initialTab: section } })}
            />
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors(isDark).bg },

    // Header
    headerContainer: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40, alignItems: 'center', backgroundColor: '#2196F3', borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingHorizontal: 24, marginBottom: 24 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    screenTitle: { fontSize: 18, color: '#fff', fontWeight: 'bold' },
    editBtn: { backgroundColor: 'rgba(255,255,255,0.15)', padding: 10, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },

    profileHeader: { alignItems: 'center', width: '100%' },
    avatarWrapper: { marginBottom: 12, position: 'relative' },
    avatar: { width: 100, height: 100, borderRadius: Radius.full, borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)' },
    cameraBtn: { position: 'absolute', bottom: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.62)', padding: 8, borderRadius: Radius.xl },
    cameraBtnGlass: {
        position: 'absolute', bottom: -4, right: -4, borderRadius: Radius.full, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    },
    cameraBtnInner: {
        backgroundColor: 'rgba(255,255,255,0.5)', padding: 10, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center'
    },
    glassInputWrapper: {
        width: '100%',
        maxWidth: 280,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    editInputGlass: {
        color: '#FFFFFF',
        textAlign: 'center',
        padding: 0,
        margin: 0,
    },

    name: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
    email: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginBottom: 16 },

    badgesRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 24 },
    badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.md, gap: 4 },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },

    levelProgressContainer: { width: '80%', alignItems: 'center' },
    progressBarBg: { width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: Radius.sm, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: 'rgba(255,255,255,0.62)', borderRadius: Radius.sm },

    // Body
    bodyContainer: { paddingHorizontal: 20, marginTop: -30 },

    // Stats Grid
    statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    statCard: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: Radius.xl, gap: 12, borderWidth: 1, ...glassShadow(isDark),},
    statIconCircle: { width: 36, height: 36, borderRadius: Radius.lg, backgroundColor: isDark ? '#065F46' : '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
    statLabel: { fontSize: 12, color: colors(isDark).textMuted, marginBottom: 2 },
    statValue: { fontSize: 18, fontWeight: 'bold' },

    // Quick Actions
    sectionHeader: { fontSize: 18, fontWeight: 'bold', color: colors(isDark).text, marginBottom: 12, marginLeft: 4 },
    quickActionsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    actionCard: { flex: 1, backgroundColor: colors(isDark).glass, borderRadius: Radius.lg, padding: 16, alignItems: 'center', ...glassShadow(isDark),},
    actionIconBox: { width: 44, height: 44, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    actionValue: { fontSize: 18, fontWeight: 'bold', color: colors(isDark).text, marginBottom: 2 },
    actionLabel: { fontSize: 11, color: colors(isDark).textMuted, fontWeight: '500', textAlign: 'center' },
    inviteCard: { flexDirection: 'row', backgroundColor: colors(isDark).glass, borderRadius: Radius.lg, padding: 16, alignItems: 'center', justifyContent: 'space-between', ...glassShadow(isDark), marginBottom: 24 },
    inviteValue: { fontSize: 18, fontWeight: 'bold', color: colors(isDark).text, marginBottom: 2 },
    inviteLabel: { fontSize: 13, color: colors(isDark).textMuted, fontWeight: '500' },

    // Forms & Settings
    card: { backgroundColor: colors(isDark).glass, borderRadius: Radius.xl, overflow: 'hidden', marginBottom: 24, padding: 4, ...glassShadow(isDark),},
    formRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    formIcon: { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: colors(isDark).glass, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    formContent: { flex: 1 },
    formLabel: { fontSize: 12, color: colors(isDark).textMuted, marginBottom: 2 },
    formValue: { fontSize: 15, color: colors(isDark).text, fontWeight: '500' },
    inputObj: { fontSize: 15, color: colors(isDark).text, borderBottomWidth: 1, borderBottomColor: '#2196F3', paddingVertical: 2 },
    editInput: { color: '#fff', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.5)', paddingVertical: 4 },
    divider: { height: 1, backgroundColor: colors(isDark).glass, marginLeft: 68 },

    // KYC Status
    kycRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 },
    kycIconWrapper: { width: 48, height: 48, borderRadius: Radius.full, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' },
    kycContent: { flex: 1 },
    kycTitle: { fontSize: 15, fontWeight: '700', color: colors(isDark).text, marginBottom: 2 },
    kycSubtitle: { fontSize: 12, color: colors(isDark).textMuted, lineHeight: 16 },
    kycButton: { backgroundColor: '#2196F3', marginHorizontal: 16, marginBottom: 16, paddingVertical: 12, borderRadius: Radius.lg, alignItems: 'center' },
    kycButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    // Points & referrals
    pointsTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    pointsTitle: { fontSize: 15, fontWeight: '700', color: colors(isDark).text },
    pointsSubtitle: { fontSize: 12, color: colors(isDark).textMuted, marginTop: 2 },
    pointsSummaryRow: { flexDirection: 'row', gap: 10, padding: 16 },
    pointsSummaryCard: { flex: 1, backgroundColor: colors(isDark).glass, borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' },
    pointsSummaryLabel: { fontSize: 11, color: colors(isDark).textMuted, marginBottom: 4 },
    pointsSummaryValue: { fontSize: 16, fontWeight: '800' },
    referralRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16 },

    txRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: Radius.md, backgroundColor: colors(isDark).glass, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' },
    txDot: { width: 10, height: 10, borderRadius: Radius.sm, marginTop: 4 },
    txTitle: { fontSize: 13, fontWeight: '700', color: colors(isDark).text },
    txMeta: { fontSize: 11, color: colors(isDark).textMuted, marginTop: 2 },
    txAmount: { fontSize: 13, fontWeight: '800' },

    settingsItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    settingsLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    settingsIcon: { width: 32, alignItems: 'center' },
    settingsLabel: { fontSize: 15, color: isDark ? '#D1D5DB' : '#374151', fontWeight: '500' },
    settingsBadge: {
        minWidth: 22,
        height: 22,
        paddingHorizontal: 6,
        borderRadius: Radius.md,
        backgroundColor: '#2196F3',
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingsBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    borderBottom: { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' },

    logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#3B1010' : '#FEF2F2', paddingVertical: 16, borderRadius: Radius.lg, gap: 8, marginBottom: 12 },
    logoutText: { color: '#EF4444', fontWeight: 'bold', fontSize: 15 },
    deleteBtn: { alignItems: 'center', paddingVertical: 12 },
    deleteText: { color: '#9CA3AF', fontSize: 13, textDecorationLine: 'underline' },

    // Sheet Styles
    sheetContent: {
        backgroundColor: colors(isDark).glass,
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
        borderRadius: Radius['2xl'],
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8
    },
    sheetText: {
        fontSize: 16,
        color: colors(isDark).textMuted,
        textAlign: 'center',
        marginBottom: 16
    },
    sheetActions: {
        flexDirection: 'row',
        gap: 12,
        width: '100%'
    },
    // RAMGOS REWARDS PREMIUM CARD
    rewardsPremiumCard: {
        marginHorizontal: 16,
        marginBottom: 24,
        borderRadius: Radius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.4)',
        ...glassShadow,
    },
    rewardsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    trophyIconBox: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: isDark ? 'rgba(217, 119, 6, 0.2)' : 'rgba(252, 211, 77, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    rewardsTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: isDark ? '#FCD34D' : '#B45309',
        letterSpacing: 0.5,
    },
    rewardsBody: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    rewardsPoints: {
        fontSize: 36,
        fontWeight: '900',
        color: isDark ? '#FFF' : '#111827',
    },
    rewardsLabel: {
        fontSize: 13,
        color: isDark ? '#9CA3AF' : '#6B7280',
        marginTop: 2,
    },
    rewardsFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 16,
        borderTopWidth: 1,
        borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
        paddingTop: 12,
        marginTop: 4,
    },
    rewardsSubText: {
        fontSize: 12,
        color: isDark ? '#D1D5DB' : '#4B5563',
        fontWeight: '500',
    },
    rewardsActionText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#D97706',
    },
});

// HOC inyectado automáticamente para soporte de teclado
const HOC_KeyboardAvoidingView_ProfileScreen = (props: any) => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ProfileScreen {...props} />
    </KeyboardAvoidingView>
);
export default HOC_KeyboardAvoidingView_ProfileScreen;
