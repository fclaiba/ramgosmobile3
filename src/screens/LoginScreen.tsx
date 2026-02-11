import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBackground } from '../components/auth/AuthBackground';
import { Mail, Lock, Eye, EyeOff, LogIn, ArrowLeft, Sparkles } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useAuth, type AuthFlowDecision } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';

// Existing icons...

// SVG Icons matching WelcomeScreen
const GoogleIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
);

const FacebookIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="#1877F2">
        <Path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </Svg>
);

const AppleIcon = ({ isDark }: { isDark: boolean }) => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill={isDark ? "#fff" : "#000"}>
        <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
);

export default function LoginScreen({ navigation }: any) {
    const { loginWithEmail, loginWithSocial, pendingVerification, isProcessing } = useAuth();
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();
    }, []);

    const busy = isLoading || isProcessing;

    const mapRoleToAccountType = (role?: string) => {
        switch (role) {
            case 'business':
                return 'business';
            case 'influencer':
                return 'influencer';
            default:
                return 'consumer';
        }
    };

    const navigateAfterAuth = (decision: AuthFlowDecision) => {
        const destination = decision.nextRoute ?? { screen: 'Home' as const };
        navigation.reset({ index: 0, routes: [{ name: destination.screen, params: destination.params }] });
    };

    const handleLogin = async () => {
        console.log('[LoginScreen] handleLogin called with:', { email, hasPassword: !!password });
        if (!email.trim() || !password.trim()) {
            show('Ingresa tu email y contraseña', 'error');
            return;
        }
        setIsLoading(true);
        try {
            console.log('[LoginScreen] calling loginWithEmail...');
            const decision = await loginWithEmail(email.trim(), password);
            console.log('[LoginScreen] loginWithEmail succeeded:', decision);
            navigateAfterAuth(decision);
        } catch (error) {
            console.error('[LoginScreen] loginWithEmail error:', error);
            if (error instanceof Error && error.message === 'EMAIL_VERIFICATION_REQUIRED') {
                const accountType = mapRoleToAccountType(pendingVerification?.user?.role);
                navigation.navigate('Verification', { email: email.trim(), accountType });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSocialLogin = async (provider: Parameters<typeof loginWithSocial>[0]) => {
        if (busy) return;
        setIsLoading(true);
        try {
            const decision = await loginWithSocial(provider);
            navigateAfterAuth(decision);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'No pudimos completar el inicio con tu cuenta social.';
            show(message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContainer}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

                            {/* Header */}
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                                <ArrowLeft size={20} color={isDark ? "#D1D5DB" : "#4B5563"} />
                                <Text style={styles.backText}>Volver</Text>
                            </TouchableOpacity>

                            <Text style={styles.title}>Bienvenido a Ramgos</Text>
                            <Text style={styles.subtitle}>Inicia sesión para continuar</Text>

                            <View style={styles.form}>
                                {/* Email */}
                                <View style={styles.inputContainer}>
                                    <Text style={styles.label}>Email</Text>
                                    <View style={styles.inputWrapper}>
                                        <Mail size={20} color="#9CA3AF" style={styles.icon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="tu@email.com"
                                            placeholderTextColor="#9CA3AF"
                                            value={email}
                                            onChangeText={setEmail}
                                            autoCapitalize="none"
                                            keyboardType="email-address"
                                        />
                                    </View>
                                </View>

                                {/* Password */}
                                <View style={styles.inputContainer}>
                                    <View style={styles.passHeader}>
                                        <Text style={styles.label}>Contraseña</Text>
                                        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                                            <Text style={styles.forgotLink}>¿Olvidaste tu contraseña?</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.inputWrapper}>
                                        <Lock size={20} color="#9CA3AF" style={styles.icon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="••••••••"
                                            placeholderTextColor="#9CA3AF"
                                            secureTextEntry={!showPassword}
                                            value={password}
                                            onChangeText={setPassword}
                                            autoCapitalize="none"
                                        />
                                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                            {showPassword ? <EyeOff size={20} color="#9CA3AF" /> : <Eye size={20} color="#9CA3AF" />}
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* Remember Me */}
                                <TouchableOpacity
                                    style={styles.rememberContainer}
                                    onPress={() => setRememberMe(!rememberMe)}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                                        {rememberMe && <Sparkles size={10} color="#fff" />}
                                    </View>
                                    <Text style={styles.rememberText}>Recordarme</Text>
                                </TouchableOpacity>

                                {/* Submit Button */}
                                <TouchableOpacity
                                    onPress={handleLogin}
                                    activeOpacity={0.9}
                                    disabled={busy}
                                    style={[styles.submitBtnContainer, busy && { opacity: 0.8 }]}
                                >
                                    <LinearGradient
                                        colors={['#7C3AED', '#9333EA']}
                                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                        style={styles.gradientBtn}
                                    >
                                        {busy ? (
                                            <Text style={styles.btnText}>Iniciando...</Text>
                                        ) : (
                                            <>
                                                <LogIn size={20} color="#fff" style={{ marginRight: 8 }} />
                                                <Text style={styles.btnText}>Iniciar sesión</Text>
                                            </>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>

                            {/* Social Login */}
                            <View style={styles.divider}>
                                <View style={styles.line} />
                                <Text style={styles.orText}>O continúa con</Text>
                                <View style={styles.line} />
                            </View>

                            <View style={styles.socialRow}>
                                <TouchableOpacity
                                    style={styles.socialBtn}
                                    onPress={() => handleSocialLogin('google')}
                                    disabled={busy}
                                >
                                    <GoogleIcon />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.socialBtn}
                                    onPress={() => handleSocialLogin('facebook')}
                                    disabled={busy}
                                >
                                    <FacebookIcon />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.socialBtn}
                                    onPress={() => handleSocialLogin('apple')}
                                    disabled={busy}
                                >
                                    <AppleIcon isDark={isDark} />
                                </TouchableOpacity>
                            </View>

                            {/* Footer */}
                            <View style={styles.footer}>
                                <Text style={styles.footerText}>¿No tienes cuenta? </Text>
                                <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                                    <Text style={styles.registerLink}>Regístrate</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Security Badge */}
                            <View style={styles.securityBadge}>
                                <Sparkles size={12} color="#8B5CF6" style={{ marginRight: 6 }} />
                                <Text style={styles.securityText}>Conexión segura y encriptada</Text>
                            </View>

                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </AuthBackground>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1 },
    scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 16 },

    // Glass Card
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: isDark ? 'rgba(31, 41, 55, 0.85)' : 'rgba(255, 255, 255, 0.8)',
        borderRadius: 24,
        padding: 32,
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.2)',
        shadowColor: isDark ? '#000' : '#8B5CF6',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: isDark ? 0.3 : 0.1,
        shadowRadius: 20,
        elevation: 10,
    },

    backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, alignSelf: 'flex-start', paddingLeft: 4 },
    backText: { marginLeft: 8, color: isDark ? '#D1D5DB' : '#4B5563', fontWeight: '500', fontSize: 14 },

    title: { fontSize: 28, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#7C3AED', marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 16, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', marginBottom: 32 },

    form: { gap: 20 },
    inputContainer: { gap: 8 },
    label: { fontSize: 14, fontWeight: '500', color: isDark ? '#D1D5DB' : '#374151', marginLeft: 4 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#374151' : '#fff', borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB', height: 48, paddingHorizontal: 12 },
    icon: { marginRight: 12 },
    input: { flex: 1, fontSize: 16, color: isDark ? '#F9FAFB' : '#111827' },

    passHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    forgotLink: { fontSize: 12, color: '#7C3AED', fontWeight: '500' },

    // Checkbox
    rememberContainer: { flexDirection: 'row', alignItems: 'center', marginTop: -4 },
    checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: isDark ? '#374151' : '#fff' },
    checkboxChecked: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
    rememberText: { fontSize: 14, color: isDark ? '#D1D5DB' : '#4B5563' },

    submitBtnContainer: { shadowColor: '#7C3AED', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4, marginTop: 8 },
    gradientBtn: { flexDirection: 'row', height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
    line: { flex: 1, height: 1, backgroundColor: isDark ? '#4B5563' : '#E5E7EB' },
    orText: { marginHorizontal: 12, color: '#9CA3AF', fontSize: 12 },

    socialRow: { flexDirection: 'row', gap: 12, marginBottom: 24, justifyContent: 'center' },
    socialBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: isDark ? '#374151' : '#fff', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB', justifyContent: 'center', alignItems: 'center' },

    footer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
    footerText: { color: isDark ? '#9CA3AF' : '#6B7280' },
    registerLink: { color: '#7C3AED', fontWeight: '600' },

    securityBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    securityText: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280' },
});
