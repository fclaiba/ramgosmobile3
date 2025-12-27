import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Animated, Dimensions, SafeAreaView, Platform, Alert } from 'react-native';
import { User, Settings, LogOut, HelpCircle, Save, History, Moon, X, LayoutDashboard, Plus, PawPrint, Info, Phone, Shield, Store, Zap, Code, Bell, ChevronRight } from 'lucide-react-native';
import { useAuth, type UserRole } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationsContext';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { LinearGradient } from 'expo-linear-gradient';
import { useWindowDimensions } from 'react-native';

interface SidebarMenuProps {
    visible: boolean;
    onClose: () => void;
    navigation: any;
}

export const SidebarMenu = ({ visible, onClose, navigation }: SidebarMenuProps) => {
    const { user, logout, updateRole, loginWithEmail } = useAuth(); // Retrieve loginWithEmail
    const { unreadCount } = useNotifications();
    const { width, height } = useWindowDimensions();
    const SIDEBAR_WIDTH = Math.min(width * 0.85, 380);

    const slideAnim = useRef(new Animated.Value(-width)).current;

    useEffect(() => {
        if (visible) {
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                damping: 20,
                mass: 0.8,
                stiffness: 100,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: -width,
                duration: 250,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, width]);

    const handleLogout = async () => {
        await logout();
        onClose();
    };

    const handleRoleChange = async (role: UserRole) => {
        try {
            if (!user) {
                // Auto-Login for Guest Users
                const credentials = {
                    business: { email: 'business@ramgos.com', pass: 'password123' },
                    influencer: { email: 'influencer@ramgos.com', pass: 'password123' },
                    admin: { email: 'admin@ramgos.com', pass: 'password123' },
                    consumer: { email: 'test@ramgos.com', pass: 'password123' },
                };

                const creds = credentials[role];
                await loginWithEmail(creds.email, creds.pass);
            } else {
                // Just switch role if already logged in
                await updateRole(role);
            }

            // Determine destination
            let destination = 'Profile';
            switch (role) {
                case 'business': destination = 'BusinessDashboard'; break;
                case 'influencer': destination = 'InfluencerDashboard'; break;
                case 'admin': destination = 'AdminDashboard'; break;
                default: destination = 'Home'; break;
            }

            Alert.alert(
                'Modo Desarrollador',
                `Ahora eres: ${role.toUpperCase()}. Accediendo al panel...`,
                [
                    {
                        text: 'OK',
                        onPress: () => {
                            onClose();
                            setTimeout(() => {
                                navigation.navigate(destination);
                            }, 300);
                        }
                    }
                ]
            );

        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo activar el modo desarrollador. Intenta nuevamente.');
        }
    };

    const MenuItem = ({ icon: Icon, label, action, badge, color = "#4B5563", danger = false }: any) => (
        <TouchableOpacity
            style={[styles.menuItem, danger && styles.menuItemDanger]}
            onPress={action}
            activeOpacity={0.7}
        >
            <View style={[styles.iconContainer, danger && { backgroundColor: '#FEE2E2' }]}>
                <Icon size={20} color={danger ? "#EF4444" : color} />
            </View>
            <Text style={[styles.menuText, danger && { color: "#EF4444" }]}>{label}</Text>
            {badge !== undefined && badge > 0 ? (
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                </View>
            ) : (
                <ChevronRight size={16} color="#D1D5DB" style={{ marginLeft: 'auto' }} />
            )}
        </TouchableOpacity>
    );

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
                <Animated.View style={[
                    styles.container,
                    { width: SIDEBAR_WIDTH, transform: [{ translateX: slideAnim }] }
                ]}>
                    <LinearGradient
                        colors={['#fff', '#F9FAFB']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    />

                    <SafeAreaView style={{ flex: 1 }}>
                        <View style={styles.header}>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <X color="#6B7280" size={24} />
                            </TouchableOpacity>

                            <View style={styles.profileSection}>
                                <View style={styles.avatarContainer}>
                                    <Avatar style={styles.avatar}>
                                        <AvatarImage src={user?.avatar} />
                                        <AvatarFallback>{user?.name?.[0] || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <View style={styles.statusDot} />
                                </View>
                                <View style={styles.userInfo}>
                                    <Text style={styles.userName}>{user?.name || 'Invitado'}</Text>
                                    <Text style={styles.userEmail} numberOfLines={1}>{user?.email || 'Inicia sesión'}</Text>
                                    <View style={styles.roleBadge}>
                                        <Text style={styles.roleText}>{user?.role?.toUpperCase() || 'USUARIO'}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        <ScrollView
                            style={styles.content}
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={styles.section}>
                                <Text style={styles.sectionHeader}>Principal</Text>
                                <MenuItem icon={Bell} label="Notificaciones" action={() => { onClose(); navigation.navigate('Notifications'); }} badge={unreadCount} color="#6366F1" />
                                <MenuItem icon={PawPrint} label="Mi Mascota" action={() => { onClose(); navigation.navigate('MiMascota'); }} color="#EC4899" />
                                <MenuItem icon={User} label="Mi Perfil" action={() => { onClose(); navigation.navigate('Profile'); }} color="#8B5CF6" />
                                <MenuItem icon={Save} label="Guardados" action={() => { onClose(); navigation.navigate('Saved'); }} color="#F59E0B" />
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.sectionHeader}>Cuenta</Text>
                                <MenuItem icon={History} label="Historial" action={() => { onClose(); navigation.navigate('History'); }} />
                                <MenuItem icon={Settings} label="Configuración" action={() => { onClose(); navigation.navigate('Settings'); }} />
                                <MenuItem icon={HelpCircle} label="Ayuda" action={() => { onClose(); navigation.navigate('HelpCenter'); }} />
                            </View>

                            {/* Dynamic Sections based on Role */}
                            {user?.role === 'business' && (
                                <View style={styles.section}>
                                    <Text style={[styles.sectionHeader, { color: '#10B981' }]}>Negocio</Text>
                                    <MenuItem icon={Store} label="Panel de Negocio" action={() => { onClose(); navigation.navigate('BusinessDashboard'); }} color="#10B981" />
                                </View>
                            )}
                            {user?.role === 'influencer' && (
                                <View style={styles.section}>
                                    <Text style={[styles.sectionHeader, { color: '#A855F7' }]}>Influencer</Text>
                                    <MenuItem icon={Zap} label="Panel Influencer" action={() => { onClose(); navigation.navigate('InfluencerDashboard'); }} color="#A855F7" />
                                </View>
                            )}
                            {user?.role === 'admin' && (
                                <View style={styles.section}>
                                    <Text style={[styles.sectionHeader, { color: '#EF4444' }]}>Admin</Text>
                                    <MenuItem icon={Shield} label="Panel Admin" action={() => { onClose(); navigation.navigate('AdminDashboard'); }} color="#EF4444" />
                                </View>
                            )}

                            <View style={styles.section}>
                                <Text style={styles.sectionHeader}>Developer Mode</Text>
                                <View style={styles.roleSelector}>
                                    {(['consumer', 'business', 'influencer', 'admin'] as const).map((role) => (
                                        <TouchableOpacity
                                            key={role}
                                            style={[styles.roleChip, user?.role === role && styles.roleChipActive]}
                                            onPress={() => handleRoleChange(role)}
                                        >
                                            <Text style={[styles.roleChipText, user?.role === role && styles.roleChipTextActive]}>
                                                {role.charAt(0).toUpperCase()}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <View style={[styles.section, { borderBottomWidth: 0, marginBottom: 40 }]}>
                                <MenuItem icon={LogOut} label="Cerrar Sesión" action={handleLogout} danger />
                            </View>

                        </ScrollView>
                    </SafeAreaView>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1 },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 1
    },
    container: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        backgroundColor: '#fff',
        shadowColor: "#000",
        shadowOffset: { width: 5, height: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
        zIndex: 2,
        borderRightWidth: 1,
        borderRightColor: 'rgba(0,0,0,0.05)'
    },
    header: {
        padding: 24,
        paddingTop: Platform.OS === 'android' ? 40 : 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6'
    },
    closeButton: {
        position: 'absolute',
        top: 24,
        right: 24,
        zIndex: 10,
        padding: 4,
    },
    profileSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginTop: 10,
    },
    avatarContainer: {
        position: 'relative',
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 3,
        borderColor: '#fff',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4
    },
    statusDot: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#10B981',
        borderWidth: 2,
        borderColor: '#fff'
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 2
    },
    userEmail: {
        fontSize: 13,
        color: '#6B7280',
        marginBottom: 6
    },
    roleBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 99,
    },
    roleText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#4B5563',
        letterSpacing: 0.5
    },
    content: { flex: 1 },
    scrollContent: { paddingVertical: 16 },
    section: {
        marginBottom: 24,
        paddingHorizontal: 16,
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: '700',
        color: '#9CA3AF',
        marginBottom: 12,
        paddingHorizontal: 12,
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        marginBottom: 4,
        backgroundColor: 'transparent'
    },
    menuItemDanger: {
        backgroundColor: '#FEF2F2',
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#F9FAFB',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    menuText: {
        fontSize: 15,
        fontWeight: '500',
        color: '#374151',
        flex: 1
    },
    badge: {
        backgroundColor: '#EF4444',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginLeft: 'auto'
    },
    badgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700'
    },
    roleSelector: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 12
    },
    roleChip: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    roleChipActive: {
        backgroundColor: '#111827',
        borderColor: '#111827'
    },
    roleChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6B7280'
    },
    roleChipTextActive: {
        color: '#fff'
    }
});
