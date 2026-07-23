import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBackground } from '../components/auth/AuthBackground';
import { Mail, Lock, Eye, EyeOff, LogIn, ArrowLeft, Sparkles } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useAuth, getAuthDestination, type AuthFlowDecision } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { glassShadow, Radius, colors } from '../theme/tokens';


// Existing icons...

const getCleanErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error) {
        const msg = error.message;
        if (msg.includes('[ConvexError]')) {
            return msg.split('[ConvexError]')[1].split('\n')[0].trim();
        }
        if (msg.includes('Uncaught ConvexError:')) {
            return msg.split('Uncaught ConvexError:')[1].split('\n')[0].trim();
        }
        if (msg.includes('Uncaught Error:')) {
            return msg.split('Uncaught Error:')[1].split('\n')[0].trim();
        }
        return msg;
    }
    return fallback;
};

// SVG Icons matching WelcomeScreen
const GoogleIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
);

const AppleIcon = ({ isDark }: { isDark: boolean }) => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill={isDark ? "#fff" : "#000"}>
        <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
);

export default function LoginScreen({ navigation }: any) {
    const { loginWithEmail, loginWithSocial, pendingVerification, isProcessing, status, user } = useAuth();
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);

    useEffect(() => {
        if (status === 'authenticated' && user) {
            const destination = getAuthDestination(user) ?? { screen: 'Home' as const };
            const timer = setTimeout(() => {
                navigation.reset({
                    index: 0,
                    routes: [{ name: destination.screen, params: destination.params }],
                });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [status, user, navigation]);

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
                return;
            }
            if (error instanceof Error && error.message.includes('ACCOUNT_BANNED')) {
                navigation.navigate('BannedUser');
                return;
            }
            const cleanMsg = getCleanErrorMessage(error, 'Credenciales inválidas. Por favor, intenta de nuevo.');
            show(cleanMsg, 'error');
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
            console.error('[LoginScreen] loginWithSocial error:', error);
            const cleanMsg = getCleanErrorMessage(error, 'No pudimos completar el inicio con tu cuenta social.');
            show(cleanMsg, 'error');
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
                            <TouchableOpacity onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] })} style={styles.backBtn}>
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
                                            autoComplete="off"
                                            textContentType="none"
                                            importantForAutofill="no"
                                            autoCorrect={false}
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
                                            autoComplete="off"
                                            textContentType="none"
                                            importantForAutofill="no"
                                            autoCorrect={false}
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
                                        colors={['#2196F3', '#29B6F6']}
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

                                {/* Social Login Separator */}
                                <View style={styles.divider}>
                                    <View style={styles.line} />
                                    <Text style={styles.orText}>O continuar con</Text>
                                    <View style={styles.line} />
                                </View>

                                {/* Social Login Buttons */}
                                <View style={styles.socialRow}>
                                    <TouchableOpacity style={styles.socialBtn} onPress={() => handleSocialLogin('google')} activeOpacity={0.8}>
                                        <GoogleIcon />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.socialBtn} onPress={() => handleSocialLogin('apple')} activeOpacity={0.8}>
                                        <AppleIcon isDark={isDark} />
                                    </TouchableOpacity>
                                </View>
                            </View>



                            {/* Footer */}
                            <View style={styles.footer}>
                                <Text style={styles.footerText}>¿No tienes cuenta? </Text>
                                <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                                    <Text style={styles.registerLink}>Regístrate</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Security Badge */}
                            <View style={styles.securityBadge}>
                                <Sparkles size={12} color="#4FC3F7" style={{ marginRight: 6 }} />
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
        borderRadius: Radius.xl,
        padding: 32,
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(79, 195, 247, 0.3)' : 'rgba(79, 195, 247, 0.2)',
        ...glassShadow(isDark),
    },

    backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, alignSelf: 'flex-start', paddingLeft: 4 },
    backText: { marginLeft: 8, color: colors(isDark).textMuted, fontWeight: '500', fontSize: 14 },

    title: { fontSize: 28, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#2196F3', marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 16, color: colors(isDark).textMuted, textAlign: 'center', marginBottom: 32 },

    form: { gap: 20 },
    inputContainer: { gap: 8 },
    label: { fontSize: 14, fontWeight: '500', color: isDark ? '#D1D5DB' : '#374151', marginLeft: 4 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderRadius: Radius.md, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', height: 48, paddingHorizontal: 12 },
    icon: { marginRight: 12 },
    input: { flex: 1, fontSize: 16, color: colors(isDark).text },

    passHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    forgotLink: { fontSize: 12, color: '#2196F3', fontWeight: '500' },

    // Checkbox
    rememberContainer: { flexDirection: 'row', alignItems: 'center', marginTop: -4 },
    checkbox: { width: 18, height: 18, borderRadius: Radius.sm, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)' },
    checkboxChecked: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
    rememberText: { fontSize: 14, color: colors(isDark).textMuted },

    submitBtnContainer: { ...glassShadow(isDark), marginTop: 8 },
    gradientBtn: { flexDirection: 'row', height: 56, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
    line: { flex: 1, height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)' },
    orText: { marginHorizontal: 12, color: '#9CA3AF', fontSize: 12 },

    socialRow: { flexDirection: 'row', gap: 12, marginBottom: 24, justifyContent: 'center' },
    socialBtn: { width: 48, height: 48, borderRadius: Radius.md, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', justifyContent: 'center', alignItems: 'center' },

    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32, marginBottom: 16 },
    footerText: { color: colors(isDark).textMuted },
    registerLink: { color: '#2196F3', fontWeight: '600' },

    securityBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    securityText: { fontSize: 12, color: colors(isDark).textMuted },
});
