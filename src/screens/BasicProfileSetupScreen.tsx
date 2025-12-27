
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Alert, Image } from 'react-native';
import { Camera, User, Phone, AtSign, ArrowRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';

export default function BasicProfileSetupScreen({ navigation, route }: any) {
    const { user, updateProfile } = useAuth();
    const role = route.params?.role || user?.role || 'consumer';

    const [nickname, setNickname] = useState(user?.profile?.nickname || '');
    const [phone, setPhone] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar || `https://api.dicebear.com/7.x/initials/png?seed=${nickname}`);

    const handleContinue = async () => {
        if (!nickname.trim()) {
            Alert.alert('Faltan datos', 'Por favor ingresa un nombre de usuario.');
            return;
        }

        setIsSubmitting(true);
        try {
            // Update profile in context/mock store
            await updateProfile({ nickname });

            // Navigate based on role
            if (role === 'consumer') {
                navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            } else {
                // Business/Influencer go to KYC Flow
                navigation.navigate('KYC', { accountType: role });
            }
        } catch (error) {
            console.error('Profile update error:', error);
            Alert.alert('Error', 'No pudimos guardar tu perfil');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAvatarPress = () => {
        Alert.alert('Cambiar Foto', 'Selección de galería simulada', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Usar avatar aleatorio', onPress: () => setAvatarUrl(`https://api.dicebear.com/7.x/avataaars/png?seed=${Math.random()}`) }
        ]);
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
                                <AtSign size={20} color="#9CA3AF" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Ej. JuanPerez, TacosMexico"
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
                                <Phone size={20} color="#9CA3AF" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="+52 55 1234 5678"
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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    scrollContent: { padding: 24, paddingBottom: 100 },

    header: { alignItems: 'center', marginBottom: 32 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#111827', marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center', paddingHorizontal: 20 },

    avatarContainer: { alignSelf: 'center', marginBottom: 40, position: 'relative' },
    avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#E5E7EB' },
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
        borderColor: '#FAFAFA'
    },

    formContainer: { width: '100%' },
    inputGroup: { marginBottom: 24 },
    label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16
    },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, fontSize: 16, color: '#1F2937', height: '100%' },
    hint: { fontSize: 12, color: '#9CA3AF', marginTop: 6, marginLeft: 4 },

    footer: {
        padding: 24,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6'
    },
    btn: { width: '100%', height: 56, borderRadius: 16, overflow: 'hidden' },
    btnGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
