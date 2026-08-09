import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBackground } from '../components/auth/AuthBackground';
import { Mail, Lock, Eye, EyeOff, LogIn, ArrowLeft, Sparkles, User } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth, getAuthDestination, REMEMBERED_LOGIN_KEY, type AuthFlowDecision } from '../contexts/AuthContext';
import { storage } from '../services/auth/storageAdapter';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { glassShadow, Radius, colors } from '../theme/tokens';
import {
    GoogleSignInCancelledError,
    signInWithGoogle,
} from '../services/auth/googleSignIn';
import { GoogleAuthButton } from '../components/ui/GoogleAuthButton';
import { useTranslation } from 'react-i18next';
import { mapAuthError } from '../i18n/errorMap';

const getCleanErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error) {
        let msg = error.message;
        if (msg.includes('[ConvexError]')) {
            msg = msg.split('[ConvexError]')[1].split('\n')[0].trim();
        }
        if (msg.includes('Uncaught ConvexError:')) {
            msg = msg.split('Uncaught ConvexError:')[1].split('\n')[0].trim();
        }
        while (msg.includes('Uncaught Error:')) {
            msg = msg.split('Uncaught Error:').pop()!.split('\n')[0].trim();
        }
        if (msg.startsWith('NO_ACCOUNT:')) {
            return msg.replace(/^NO_ACCOUNT:\s*/, '');
        }
        if (msg.startsWith('ACCOUNT_EXISTS:')) {
            return msg.replace(/^ACCOUNT_EXISTS:\s*/, '');
        }
        return msg || fallback;
    }
    return fallback;
};

const isNoAccountError = (error: unknown): boolean => {
    const msg = error instanceof Error ? error.message : String(error);
    return msg.includes('NO_ACCOUNT') || msg.toLowerCase().includes('no hay cuenta') || msg.toLowerCase().includes('no existe una cuenta');
};

export default function LoginScreen({ navigation }: any) {
    const { loginWithEmail, loginWithGoogleIdToken, pendingVerification, isProcessing, status, user } = useAuth();
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const { t } = useTranslation(['auth', 'common']);
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const raw = await storage.getItem(REMEMBERED_LOGIN_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw) as { email?: string; rememberMe?: boolean };
                    if (parsed.email) setEmail(parsed.email);
                    setRememberMe(parsed.rememberMe !== false);
                }
            } catch {
                /* ignore */
            }
        })();
    }, []);

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

    const busy = isLoading || isProcessing || googleLoading;

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
            show(t('auth:login.emptyCredentials'), 'error');
            return;
        }
        setIsLoading(true);
        try {
            console.log('[LoginScreen] calling loginWithEmail...');
            const decision = await loginWithEmail(email.trim(), password, undefined, rememberMe);
            console.log('[LoginScreen] loginWithEmail succeeded:', decision);
            if (decision.nextRoute?.screen === 'Verification') {
                navigation.navigate('Verification', {
                    email: email.trim(),
                    accountType: mapRoleToAccountType(pendingVerification?.user?.role),
                    rememberMe,
                    isSignup: false,
                });
                return;
            }
            navigateAfterAuth(decision);
        } catch (error) {
            console.error('[LoginScreen] loginWithEmail error:', error);
            if (error instanceof Error && error.message === 'EMAIL_VERIFICATION_REQUIRED') {
                const accountType = mapRoleToAccountType(pendingVerification?.user?.role);
                navigation.navigate('Verification', {
                    email: email.trim(),
                    accountType,
                    rememberMe,
                });
                return;
            }
            if (error instanceof Error && error.message.includes('ACCOUNT_BANNED')) {
                navigation.navigate('BannedUser');
                return;
            }
            const cleanMsg = getCleanErrorMessage(error, t('auth:login.invalidCredentials'));
            show(mapAuthError(cleanMsg), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        if (busy || googleLoading) return;
        setGoogleLoading(true);
        try {
            const { idToken } = await signInWithGoogle();
            const decision = await loginWithGoogleIdToken(idToken, { mode: 'login' });
            navigateAfterAuth(decision);
        } catch (error) {
            if (error instanceof GoogleSignInCancelledError) return;
            console.error('[LoginScreen] Google login error:', error);
            const cleanMsg = getCleanErrorMessage(error, t('auth:login.googleFailed'));
            show(mapAuthError(cleanMsg), 'error');
            if (isNoAccountError(error)) {
                setTimeout(() => navigation.navigate('SignUp'), 600);
            }
        } finally {
            setGoogleLoading(false);
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
                                <Text style={styles.backText}>{t('common:buttons.back')}</Text>
                            </TouchableOpacity>

                            <Text style={styles.title}>{t('auth:login.title')}</Text>
                            <Text style={styles.subtitle}>{t('auth:login.subtitle')}</Text>

                            <View style={styles.form}>
                                {/* Email / Username */}
                                <View style={styles.inputContainer}>
                                    <Text style={styles.label}>{t('auth:login.emailOrUsername')}</Text>
                                    <View style={styles.inputWrapper}>
                                        <User size={20} color="#9CA3AF" style={styles.icon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder={t('auth:login.emailOrUsernamePlaceholder')}
                                            placeholderTextColor="#9CA3AF"
                                            value={email}
                                            onChangeText={setEmail}
                                            autoCapitalize="none"
                                            keyboardType="default"
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
                                        <Text style={styles.label}>{t('auth:login.password')}</Text>
                                        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                                            <Text style={styles.forgotLink}>{t('auth:login.forgotPassword')}</Text>
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
                                    <Text style={styles.rememberText}>{t('auth:login.rememberMe')}</Text>
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
                                            <Text style={styles.btnText}>{t('auth:login.signingIn')}</Text>
                                        ) : (
                                            <>
                                                <LogIn size={20} color="#fff" style={{ marginRight: 8 }} />
                                                <Text style={styles.btnText}>{t('auth:login.signInButton')}</Text>
                                            </>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>

                                {/* Social Login Separator */}
                                <View style={styles.divider}>
                                    <View style={styles.line} />
                                    <Text style={styles.orText}>{t('auth:login.socialDivider')}</Text>
                                    <View style={styles.line} />
                                </View>

                                <GoogleAuthButton
                                    label={t('auth:login.continueWithGoogle')}
                                    onPress={handleGoogleLogin}
                                    disabled={busy || googleLoading}
                                    loading={googleLoading}
                                    style={{ marginBottom: 12 }}
                                />
                            </View>



                            {/* Footer */}
                            <View style={styles.footer}>
                                <Text style={styles.footerText}>{t('auth:login.noAccount')} </Text>
                                <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                                    <Text style={styles.registerLink}>{t('auth:login.register')}</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Security Badge */}
                            <View style={styles.securityBadge}>
                                <Sparkles size={12} color="#4FC3F7" style={{ marginRight: 6 }} />
                                <Text style={styles.securityText}>{t('common:security.secureConnection')}</Text>
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
