import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBackground } from '../components/auth/AuthBackground';
import { Mail, Lock, Eye, EyeOff, LogIn, ArrowLeft, Sparkles, User } from 'lucide-react-native';
import { useAuth, getAuthDestination, REMEMBERED_LOGIN_KEY, type AuthFlowDecision } from '../contexts/AuthContext';
import { storage } from '../services/auth/storageAdapter';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { Radius, colors, Type, Space } from '../theme/tokens';
import { Brand } from '../theme/brand';
import {
    GoogleSignInCancelledError,
    signInWithGoogle,
} from '../services/auth/googleSignIn';
import { GoogleAuthButton } from '../components/ui/GoogleAuthButton';
import { useTranslation } from 'react-i18next';
import { mapAuthError } from '../i18n/errorMap';
import { GlassSurface } from '../components/ui/GlassSurface';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';

const getCleanErrorMessage = (error: unknown, fallback: string): string => {
    // ConvexError con payload objeto ({ code, message }) → el texto está en .data.
    const data = (error as { data?: unknown })?.data;
    if (data && typeof data === 'object' && typeof (data as any).message === 'string') {
        return (data as any).message || fallback;
    }
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
    const c = colors(isDark);
    const styles = getStyles(isDark, c);

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
            const state = navigation.getState();
            if (state && state.routes.length > 1) {
                const currentRouteName = state.routes[state.routes.length - 1].name;
                if (currentRouteName === 'Login' || currentRouteName === 'SignUp') {
                    navigation.goBack();
                    return;
                }
            }
            
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
        if (!email.trim() || !password.trim()) {
            show(t('auth:login.emptyCredentials'), 'error');
            return;
        }
        setIsLoading(true);
        try {
            const decision = await loginWithEmail(email.trim(), password, undefined, rememberMe);
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
            if (error instanceof Error && error.message === 'EMAIL_VERIFICATION_REQUIRED') {
                const accountType = mapRoleToAccountType(pendingVerification?.user?.role);
                navigation.navigate('Verification', {
                    email: email.trim(),
                    accountType,
                    rememberMe,
                });
                return;
            }
            if (isNoAccountError(error)) {
                show(t('auth:login.noAccountExists'), 'error');
            } else {
                show(mapAuthError(error instanceof Error ? error.message : String(error)), 'error');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setGoogleLoading(true);
        try {
            const response = await signInWithGoogle();
            if (response?.idToken) {
                const decision = await loginWithGoogleIdToken(response.idToken, { mode: 'login' });
                navigateAfterAuth(decision);
            } else {
                show(t('auth:login.googleFailed'), 'error');
            }
        } catch (error) {
            if (error instanceof GoogleSignInCancelledError) {
                // Ignore silent cancellation
            } else if (isNoAccountError(error)) {
                // Cuenta de Google nueva: no hay con qué "loguear" — se manda
                // al alta normal (que sí crea el usuario y llega a KYC con
                // sesión real) en vez de al `RoleSelection` roto de antes.
                show(t('auth:login.noAccountExists'), 'info');
                setTimeout(() => navigation.navigate('SignUp'), 600);
            } else {
                show(mapAuthError(error instanceof Error ? error.message : String(error)), 'error');
            }
        } finally {
            setGoogleLoading(false);
        }
    };

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.container}
                >
                    <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], width: '100%' }}>
                            
                            <TouchableOpacity
                                style={styles.backBtn}
                                onPress={() => navigation.goBack()}
                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityLabel={t('common:actions.back')}
                            >
                                <ArrowLeft size={18} color={c.text} style={{ marginRight: 6 }} />
                                <Text style={styles.backText}>{t('common:actions.back')}</Text>
                            </TouchableOpacity>

                            <GlassSurface elevation={3} style={styles.card}>
                                <Text style={styles.title}>{t('auth:login.title')}</Text>
                                <Text style={styles.subtitle}>{t('auth:login.subtitle')}</Text>

                                <View style={styles.form}>
                                    
                                    <View style={styles.inputContainer}>
                                        <Input
                                            label={t('auth:login.email')}
                                            placeholder="tucorreo@ejemplo.com"
                                            value={email}
                                            onChangeText={setEmail}
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            autoComplete="off"
                                            textContentType="none"
                                            importantForAutofill="no"
                                            autoCorrect={false}
                                            leftIcon={<Mail size={20} color={c.textSubtle} />}
                                        />
                                    </View>

                                    <View style={styles.inputContainer}>
                                        <View style={styles.passHeader}>
                                            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                                                <Text style={styles.forgotLink}>{t('auth:login.forgotPassword')}</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <Input
                                            label={t('auth:login.password')}
                                            placeholder="••••••••"
                                            secureTextEntry={!showPassword}
                                            value={password}
                                            onChangeText={setPassword}
                                            autoCapitalize="none"
                                            autoComplete="off"
                                            textContentType="none"
                                            importantForAutofill="no"
                                            autoCorrect={false}
                                            leftIcon={<Lock size={20} color={c.textSubtle} />}
                                            rightIcon={
                                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
                                                    {showPassword ? <EyeOff size={20} color={c.textSubtle} /> : <Eye size={20} color={c.textSubtle} />}
                                                </TouchableOpacity>
                                            }
                                        />
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
                                    <Button
                                        variant="default"
                                        onPress={handleLogin}
                                        isLoading={busy}
                                        style={{ marginTop: Space[2] }}
                                    >
                                        <LogIn size={20} color="#fff" style={{ marginRight: 8 }} />
                                        <Text>{t('auth:login.signInButton')}</Text>
                                    </Button>

                                    {/* Social Login Separator */}
                                    <View style={styles.divider}>
                                        <Separator style={{ flex: 1 }} variant="subtle" />
                                        <Text style={styles.orText}>{t('auth:login.socialDivider')}</Text>
                                        <Separator style={{ flex: 1 }} variant="subtle" />
                                    </View>

                                    <GoogleAuthButton
                                        label={t('auth:login.continueWithGoogle')}
                                        onPress={handleGoogleLogin}
                                        disabled={busy || googleLoading}
                                        loading={googleLoading}
                                        style={{ marginBottom: Space[3] }}
                                    />
                                </View>

                                {/* Footer */}
                                <View style={styles.footer}>
                                    <Text style={styles.footerText}>{t('auth:login.noAccount')} </Text>
                                    <TouchableOpacity onPress={() => navigation.navigate('SignUp')} hitSlop={8}>
                                        <Text style={styles.registerLink}>{t('auth:login.register')}</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Security Badge */}
                                <View style={styles.securityBadge}>
                                    <Sparkles size={12} color={Brand.primaryLight} style={{ marginRight: 6 }} />
                                    <Text style={styles.securityText}>{t('common:security.secureConnection')}</Text>
                                </View>

                            </GlassSurface>
                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </AuthBackground>
    );
}

const getStyles = (isDark: boolean, c: ReturnType<typeof colors>) => StyleSheet.create({
    container: { flex: 1 },
    scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: Space[4] },

    card: {
        width: '100%',
        maxWidth: 400,
        padding: Space[8],
        alignSelf: 'center',
    },

    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Space[5],
        alignSelf: 'flex-start',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: Radius.full,
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.85)',
        borderWidth: 1,
        borderColor: c.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    backText: { color: c.text, ...Type.bodySm, fontWeight: '600' },

    title: { ...Type.display, color: c.text, marginBottom: 8, textAlign: 'center' },
    subtitle: { ...Type.body, color: c.textMuted, textAlign: 'center', marginBottom: Space[8] },

    form: { gap: Space[5] },
    inputContainer: { },

    passHeader: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: -20, zIndex: 10 },
    forgotLink: { ...Type.caption, color: Brand.primary, fontWeight: '600' },

    // Checkbox
    rememberContainer: { flexDirection: 'row', alignItems: 'center', marginTop: -4 },
    checkbox: { width: 18, height: 18, borderRadius: Radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: c.surface2 },
    checkboxChecked: { backgroundColor: Brand.primary, borderColor: Brand.primary },
    rememberText: { ...Type.bodySm, color: c.textMuted },

    divider: { flexDirection: 'row', alignItems: 'center', marginVertical: Space[6] },
    orText: { marginHorizontal: 12, ...Type.caption, color: c.textSubtle },

    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: Space[8], marginBottom: Space[4] },
    footerText: { color: c.textMuted, ...Type.bodySm },
    registerLink: { ...Type.bodySm, color: Brand.primary, fontWeight: '700' },

    securityBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    securityText: { ...Type.caption, color: c.textMuted },
});
