
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Image, Alert } from 'react-native';
import { Camera, User, Phone, AtSign, ArrowRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';

export default function BasicProfileSetupScreen({ navigation, route }: any) {
    const { user, updateProfile } = useAuth();
    const { show } = useToast();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const role = route.params?.role || user?.role || 'consumer';

    const [nickname, setNickname] = useState(user?.nickname || '');
    const [phone, setPhone] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar || `https://api.dicebear.com/7.x/initials/png?seed=${nickname}`);

    const handleContinue = async () => {
        if (!nickname.trim()) {
            show('Por favor ingresa un nombre de usuario.', 'warning');
            return;
        }

        setIsSubmitting(true);
        try {
            // Update profile in context/mock store
            await updateProfile({ nickname, phoneNumber: phone, avatar: avatarUrl });

            // Go straight to Home — KYC is validated by admin in the Admin Panel
            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
        } catch (error) {
            console.error('Profile update error:', error);
            show('No pudimos guardar tu perfil. Inténtalo de nuevo.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAvatarPress = async () => {
        if (Platform.OS === 'web') {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
                setAvatarUrl(result.assets[0].uri);
            }
            return;
        }

        Alert.alert(
            "Foto de perfil",
            "Elige una opción",
            [
                {
                    text: "Tomar foto",
                    onPress: async () => {
                        const { status } = await ImagePicker.requestCameraPermissionsAsync();
                        if (status !== 'granted') {
                            show('Se necesita permiso para acceder a la cámara.', 'warning');
                            return;
                        }
                        const result = await ImagePicker.launchCameraAsync({
                            allowsEditing: true,
                            aspect: [1, 1],
                            quality: 0.5,
                        });
                        if (!result.canceled && result.assets && result.assets.length > 0) {
                            setAvatarUrl(result.assets[0].uri);
                        }
                    }
                },
                {
                    text: "Elegir de galería",
                    onPress: async () => {
                        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                        if (status !== 'granted') {
                            show('Se necesita permiso para acceder a la galería.', 'warning');
                            return;
                        }
                        const result = await ImagePicker.launchImageLibraryAsync({
                            mediaTypes: ['images'],
                            allowsEditing: true,
                            aspect: [1, 1],
                            quality: 0.5,
                        });
                        if (!result.canceled && result.assets && result.assets.length > 0) {
                            setAvatarUrl(result.assets[0].uri);
                        }
                    }
                },
                {
                    text: "Cancelar",
                    style: "cancel"
                }
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Completa tu Perfil</Text>
                        <Text style={styles.subtitle}>
                            {role === 'consumer' ? 'Cuéntanos un poco sobre ti para personalizar tu experiencia.' : 'Configura tu perfil público para que los clientes te encuentren.'}
                        </Text>
                    </View>

                    <TouchableOpacity style={styles.avatarContainer} onPress={handleAvatarPress}>
                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                        <View style={styles.cameraBtn}>
                            <Camera size={20} color="#fff" />
                        </View>
                    </TouchableOpacity>

                    <View style={styles.formContainer}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Nombre de Usuario (Nickname)</Text>
                            <View style={styles.inputWrapper}>
                                <AtSign size={20} color={isDark ? '#9CA3AF' : '#9CA3AF'} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Ej. JuanPerez, TacosMexico"
                                    placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                    value={nickname}
                                    onChangeText={setNickname}
                                    autoCapitalize="none"
                                />
                            </View>
                            <Text style={styles.hint}>Este será tu identificador público en la app.</Text>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Teléfono (Opcional)</Text>
                            <View style={styles.inputWrapper}>
                                <Phone size={20} color={isDark ? '#9CA3AF' : '#9CA3AF'} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="+52 55 1234 5678"
                                    placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                    value={phone}
                                    onChangeText={setPhone}
                                    keyboardType="phone-pad"
                                />
                            </View>
                        </View>
                    </View>
                </ScrollView>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.btn, isSubmitting && { opacity: 0.7 }]}
                        onPress={handleContinue}
                        disabled={isSubmitting}
                    >
                        <LinearGradient
                            colors={['#7C3AED', '#EC4899']}
                            style={styles.btnGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <Text style={styles.btnText}>
                                {isSubmitting ? 'Guardando...' : role === 'consumer' ? 'Comenzar a explorar' : 'Continuar a Verificación'}
                            </Text>
                            {!isSubmitting && <ArrowRight size={20} color="#fff" />}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#09090B' : '#FAFAFA' },
    scrollContent: { padding: 24, paddingBottom: 100 },

    header: { alignItems: 'center', marginBottom: 32 },
    title: { fontSize: 28, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 16, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', paddingHorizontal: 20 },

    avatarContainer: { alignSelf: 'center', marginBottom: 40, position: 'relative' },
    avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)' },
    cameraBtn: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#7C3AED',
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: isDark ? '#09090B' : '#FAFAFA'
    },

    formContainer: { width: '100%' },
    inputGroup: { marginBottom: 24 },
    label: { fontSize: 14, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151', marginBottom: 8 },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isDark ? '#09090B' : '#FAFAFA',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16
    },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, fontSize: 16, color: isDark ? '#F9FAFB' : '#1F2937', height: '100%' },
    hint: { fontSize: 12, color: isDark ? '#9CA3AF' : '#9CA3AF', marginTop: 6, marginLeft: 4 },

    footer: {
        padding: 24,
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
        borderTopWidth: 1,
        borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)'
    },
    btn: { width: '100%', height: 56, borderRadius: 16, overflow: 'hidden' },
    btnGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
