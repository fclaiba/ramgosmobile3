import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, Animated, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBackground } from '../components/auth/AuthBackground';
import { Mail, Send, CheckCircle2, ArrowLeft, Lock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';

export default function ForgotPasswordScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSent, setIsSent] = useState(false);

    const handleSend = () => {
        if (!email) return;
        setIsLoading(true);
        setTimeout(() => {
            setIsLoading(false);
            setIsSent(true);
        }, 1500);
    };

    if (isSent) {
        return (
            <AuthBackground>
                <SafeAreaView style={styles.container}>
                    <View style={styles.content}>
                        <View style={styles.card}>
                            <View style={styles.successIconContainer}>
                                <LinearGradient
                                    colors={['#10B981', '#059669']}
                                    style={styles.successIconBg}
                                >
                                    <CheckCircle2 size={40} color="#fff" />
                                </LinearGradient>
                            </View>

                            <Text style={styles.title}>¡Email enviado!</Text>
                            <Text style={styles.subtitle}>
                                Hemos enviado las instrucciones a {'\n'}
                                <Text style={{ fontWeight: '600', color: isDark ? '#D1D5DB' : '#111827' }}>{email}</Text>
                            </Text>

                            <TouchableOpacity
                                onPress={() => navigation.navigate('Login')}
                                style={[styles.submitBtnContainer, { marginTop: 16 }]}
                            >
                                <LinearGradient
                                    colors={['#7C3AED', '#9333EA']}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={styles.gradientBtn}
                                >
                                    <Text style={styles.btnText}>Volver al inicio de sesión</Text>
                                </LinearGradient>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => setIsSent(false)}
                                style={[styles.ghostBtn, { marginTop: 12 }]}
                            >
                                <Text style={styles.ghostBtnText}>Reenviar email</Text>
                            </TouchableOpacity>

                            <View style={styles.hintBox}>
                                <Text style={styles.hintText}>Revisa tu carpeta de spam si no lo ves en unos minutos.</Text>
                            </View>
                        </View>
                    </View>
                </SafeAreaView>
            </AuthBackground>
        );
    }

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container}>
                <View style={styles.content}>
                    <View style={styles.card}>

                        {/* Back */}
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                            <ArrowLeft size={18} color={isDark ? "#D1D5DB" : "#4B5563"} />
                            <Text style={styles.backText}>Volver</Text>
                        </TouchableOpacity>

                        {/* Header */}
                        <View style={styles.iconContainer}>
                            <LinearGradient
                                colors={['#8B5CF6', '#9333EA']}
                                style={styles.iconBg}
                            >
                                <Lock size={32} color="#fff" />
                            </LinearGradient>
                        </View>

                        <Text style={styles.title}>Recuperar contraseña</Text>
                        <Text style={styles.subtitle}>
                            Ingresa tu email y te enviaremos instrucciones.
                        </Text>

                        {/* Form */}
                        <View style={styles.form}>
                            <View style={styles.inputContainer}>
                                <Text style={styles.label}>Email</Text>
                                <View style={styles.inputWrapper}>
                                    <Mail size={20} color={isDark ? "#9CA3AF" : "#9CA3AF"} style={styles.icon} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="tu@email.com"
                                        placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                        value={email}
                                        onChangeText={setEmail}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                    />
                                </View>
                            </View>

                            <TouchableOpacity
                                onPress={handleSend}
                                style={styles.submitBtnContainer}
                                disabled={isLoading}
                            >
                                <LinearGradient
                                    colors={['#7C3AED', '#9333EA']}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={styles.gradientBtn}
                                >
                                    {isLoading ? (
                                        <Text style={styles.btnText}>Enviando...</Text>
                                    ) : (
                                        <>
                                            <Send size={20} color="#fff" style={{ marginRight: 8 }} />
                                            <Text style={styles.btnText}>Enviar instrucciones</Text>
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>

                        {/* Footer */}
                        <View style={styles.divider} />
                        <View style={styles.footer}>
                            <Text style={{ color: isDark ? '#9CA3AF' : '#6B7280', fontSize: 14 }}>¿Recordaste tu contraseña? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                                <Text style={{ color: '#7C3AED', fontWeight: '600' }}>Inicia sesión</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </SafeAreaView>
        </AuthBackground>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1 },
    content: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },

    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: isDark ? 'rgba(31, 41, 55, 0.85)' : 'rgba(255, 255, 255, 0.8)',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.2)',
        shadowColor: isDark ? '#000' : '#8B5CF6',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: isDark ? 0.3 : 0.1,
        shadowRadius: 20,
        elevation: 10,
    },

    backBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 20 },
    backText: { marginLeft: 8, color: isDark ? '#D1D5DB' : '#4B5563', fontWeight: '500' },

    iconContainer: { marginBottom: 16 },
    iconBg: { width: 64, height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center', shadowColor: '#8B5CF6', shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },

    title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 8 },
    subtitle: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', marginBottom: 24, paddingHorizontal: 10 },

    form: { width: '100%', gap: 16 },
    inputContainer: { gap: 8 },
    label: { fontSize: 14, fontWeight: '500', color: isDark ? '#D1D5DB' : '#374151', marginLeft: 4 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#374151' : '#fff', borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB', height: 48, paddingHorizontal: 12 },
    icon: { marginRight: 12 },
    input: { flex: 1, fontSize: 16, color: isDark ? '#F9FAFB' : '#111827' },

    submitBtnContainer: { shadowColor: '#7C3AED', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4, marginTop: 8 },
    gradientBtn: { flexDirection: 'row', height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    divider: { width: '100%', height: 1, backgroundColor: isDark ? '#4B5563' : '#E5E7EB', marginVertical: 24 },
    footer: { flexDirection: 'row', justifyContent: 'center' },

    // Success State
    successIconContainer: { marginBottom: 24 },
    successIconBg: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', shadowColor: '#10B981', shadowOpacity: 0.3, shadowRadius: 12, elevation: 5 },
    ghostBtn: { width: '100%', height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: isDark ? '#6D28D9' : '#DDD6FE', backgroundColor: isDark ? '#374151' : '#F5F3FF' },
    ghostBtnText: { color: '#7C3AED', fontSize: 14, fontWeight: '600' },
    hintBox: { marginTop: 24, padding: 12, backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : '#F5F3FF', borderRadius: 12, width: '100%' },
    hintText: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center' },
});
