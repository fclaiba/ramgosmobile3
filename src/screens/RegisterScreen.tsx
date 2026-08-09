import React, { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, ScrollView, Alert, Platform, KeyboardAvoidingView, useWindowDimensions, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { Lock, Eye, EyeOff, Tag, CheckCircle2, Store, MapPin, Award, User, Mail, Sparkles, ArrowLeft, Users, ChevronDown, X, AtSign, Hash, Phone } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthBackground } from '../components/AuthBackground';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useReferral } from '../contexts/ReferralContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import {
    GoogleSignInCancelledError,
    signInWithGoogle,
} from '../services/auth/googleSignIn';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { GoogleAuthButton } from '../components/ui/GoogleAuthButton';
import {
    LIMITS, MIN, clamp, formatReferralCode, formatSocialHandle, formatPhone,
} from '../utils/inputLimits';
import { glassShadow, Radius, colors } from '../theme/tokens';
import { useTranslation } from 'react-i18next';

const BUSINESS_CATEGORIES = [
    'Restaurante / Gastronomía',
    'Bar / Club Nocturno / Discoteca',
    'Cafetería / Panadería',
    'Supermercado / Tienda de Conveniencia',
    'Tienda de Ropa / Moda',
    'Electrónica / Tecnología',
    'Hogar / Decoración',
    'Salud / Farmacia',
    'Belleza / Spa / Peluquería',
    'Deportes / Fitness / Gimnasio',
    'Servicios Profesionales',
    'Automotriz / Taller',
    'Mascotas / Veterinaria',
    'Educación / Librería',
    'Entretenimiento / Cine / Juegos',
    'Hotel / Turismo',
    'Arte / Música',
    'Otro'
];

const INFLUENCER_CATEGORIES = [
    'Lifestyle / Vlogs',
    'Moda / Belleza',
    'Fitness / Salud',
    'Tecnología / Gaming',
    'Viajes / Turismo',
    'Comedia / Entretenimiento',
    'Educación / Coaching',
    'Música / Baile',
    'Comida / Reseñas',
    'Otro'
];


// Local icons removed as they are imported from SocialIcons

export default function RegisterScreen({ navigation, route }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const isCompact = windowWidth < 360;
    const styles = useMemo(() => getStyles(isDark, windowWidth, windowHeight), [isDark, windowHeight, windowWidth]);

    const [step, setStep] = useState<'type' | 'form'>('type');
    const [accountType, setAccountType] = useState<'consumer' | 'business' | 'influencer' | null>(null);
    const [signupMethod, setSignupMethod] = useState<'google' | 'email'>('email');

    const accountTypeLabel =
        accountType === 'consumer' ? 'Consumidor'
        : accountType === 'business' ? 'Negocio'
        : accountType === 'influencer' ? 'Influencer'
        : null;
    const accountTypeColor =
        accountType === 'consumer' ? '#2563EB'
        : accountType === 'business' ? '#059669'
        : accountType === 'influencer' ? '#2196F3'
        : '#9CA3AF';

    // Form Data
    const [formData, setFormData] = useState({
        name: '', email: '', password: '', confirmPassword: '',
        businessName: '', businessCategory: '', businessAddress: '', businessPhone: '',
        username: '', referralCode: '', referredBy: '', instagramUrl: '', tiktokUrl: '',
        acceptTerms: false,
        acceptPrivacy: false
    });

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [legalViews, setLegalViews] = useState({ terms: false, privacy: false });
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const { signUpWithEmail, loginWithGoogleIdToken, isProcessing } = useAuth();
    useReferral();
    const { show } = useToast();
    const { t } = useTranslation('auth');

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }, [step]); // Re-animate on step change

    // Receive acceptance signals from Terms/Privacy screens (signup flow)
    useEffect(() => {
        const termsAccepted = route?.params?.termsAccepted === true;
        const privacyAccepted = route?.params?.privacyAccepted === true;
        if (!termsAccepted && !privacyAccepted) return;

        setFormData((prev) => ({
            ...prev,
            ...(termsAccepted ? { acceptTerms: true } : null),
            ...(privacyAccepted ? { acceptPrivacy: true } : null),
        }));
        setLegalViews((prev) => ({
            ...prev,
            ...(termsAccepted ? { terms: true } : null),
            ...(privacyAccepted ? { privacy: true } : null),
        }));

        // Clear params to avoid re-applying if screen re-renders
        navigation.setParams?.({ termsAccepted: undefined, privacyAccepted: undefined });
    }, [navigation, route?.params?.privacyAccepted, route?.params?.termsAccepted]);

    const getPasswordStrength = (pass: string) => {
        if (!pass) return { width: '0%', color: '#E5E7EB', label: '' };
        if (pass.length < 6) return { width: '33%', color: '#EF4444', label: 'Débil' };
        if (pass.length < 8) return { width: '66%', color: '#F59E0B', label: 'Regular' };
        return { width: '100%', color: '#10B981', label: 'Fuerte' };
    };

    const passwordRequirements = [
        { label: '8+ caracteres', met: formData.password.length >= 8 },
        { label: 'Una mayúscula', met: /[A-Z]/.test(formData.password) },
        { label: 'Un número', met: /[0-9]/.test(formData.password) },
    ];

    const handleOpenTerms = () => {
        setLegalViews(prev => ({ ...prev, terms: true }));
        navigation.navigate('Terms', { origin: 'signup', returnKey: route?.key, accountType: accountType ?? 'consumer' });
    };

    const handleOpenPrivacy = () => {
        setLegalViews(prev => ({ ...prev, privacy: true }));
        navigation.navigate('Privacy', { origin: 'signup', returnKey: route?.key });
    };

    const strength = getPasswordStrength(formData.password);

    const handleContinue = (method: 'google' | 'email') => {
        if (!accountType) {
            show('Elegí el tipo de cuenta para continuar', 'error');
            return;
        }
        setSignupMethod(method);
        setStep('form');
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true })
        ]).start();
    };

    const busy = isLoading || isProcessing || googleLoading;
    const canProceed = !!accountType && !busy;

    const normalizeUsername = (raw: string) =>
        raw.trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);

    /** Shared profile rules for email + Google signup. */
    const validateProfileFields = (): string | null => {
        if (!accountType) return 'Elige el tipo de cuenta para continuar';

        const username = normalizeUsername(formData.username);
        if (!username) return 'Elegí tu @ de usuario';
        if (username.length < 3) return 'El usuario debe tener al menos 3 caracteres';
        if (!/^[a-z0-9_]{3,24}$/.test(username)) {
            return 'El usuario solo puede tener letras, números o _';
        }

        if (accountType === 'business') {
            if (!formData.businessName.trim()) return 'Ingresá el nombre del negocio';
            if (!formData.businessCategory.trim()) return 'Seleccioná la categoría del negocio';
        }

        if (accountType === 'influencer') {
            if (!formData.businessCategory.trim()) return 'Seleccioná tu categoría de influencer';
            if (!formData.instagramUrl.trim() && !formData.tiktokUrl.trim()) {
                return 'Debés proporcionar al menos Instagram o TikTok';
            }
            if (formData.instagramUrl && !formData.instagramUrl.startsWith('https://')) {
                return 'El enlace de Instagram debe comenzar con https://';
            }
            if (formData.tiktokUrl && !formData.tiktokUrl.startsWith('https://')) {
                return 'El enlace de TikTok debe comenzar con https://';
            }
        }

        if (!formData.acceptTerms || !formData.acceptPrivacy) {
            return 'Debés aceptar los Términos y Privacidad';
        }

        return null;
    };

    const profilePayload = () => ({
        username: normalizeUsername(formData.username),
        referredBy: formData.referredBy.trim() || undefined,
        businessName: accountType === 'business' ? formData.businessName.trim() : undefined,
        businessCategory:
            accountType === 'business' || accountType === 'influencer'
                ? formData.businessCategory.trim()
                : undefined,
        businessAddress: accountType === 'business' ? formData.businessAddress.trim() || undefined : undefined,
        phone: accountType === 'business' ? formData.businessPhone.trim() || undefined : undefined,
        instagramUrl: accountType === 'influencer' ? formData.instagramUrl.trim() || undefined : undefined,
        tiktokUrl: accountType === 'influencer' ? formData.tiktokUrl.trim() || undefined : undefined,
    });

    const handleGoogleSignup = async () => {
        if (busy) return;
        const profileError = validateProfileFields();
        if (profileError) {
            show(profileError, 'error');
            return;
        }
        if (!accountType) return;

        setGoogleLoading(true);
        try {
            const { idToken } = await signInWithGoogle();
            const profile = profilePayload();
            const decision = await loginWithGoogleIdToken(idToken, {
                mode: 'register',
                role: accountType,
                ...profile,
            });

            if (profile.referredBy && decision.user?.id) {
                await AsyncStorage.setItem(
                    `@ramgos/referrals/pending/${decision.user.id}`,
                    profile.referredBy.trim().toUpperCase(),
                );
            }

            navigation.reset({
                index: 0,
                routes: [{ name: 'KYC', params: { accountType } }],
            });
        } catch (error) {
            if (error instanceof GoogleSignInCancelledError) return;
            let message =
                error instanceof Error ? error.message : 'No pudimos continuar con Google.';
            while (message.includes('Uncaught Error:')) {
                message = message.split('Uncaught Error:').pop()!.split('\n')[0].trim();
            }
            message = message
                .replace(/^ACCOUNT_EXISTS:\s*/, '')
                .replace(/^NO_ACCOUNT:\s*/, '');
            show(message, 'error');
            if (message.toLowerCase().includes('iniciar sesión') || message.includes('ACCOUNT_EXISTS')) {
                setTimeout(() => navigation.navigate('Login'), 600);
            }
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleRegister = async () => {
        const profileError = validateProfileFields();
        if (profileError) {
            show(profileError, 'error');
            return;
        }
        if (!formData.name.trim() || formData.name.trim().length < MIN.name || !formData.email.trim() || !formData.password.trim()) {
            show('Completa nombre, email y contraseña', 'error');
            return;
        }
        if (formData.email.length > LIMITS.email) {
            show('Email demasiado largo', 'error');
            return;
        }
        if (accountType === 'business' && formData.businessAddress.trim()
            && formData.businessAddress.trim().length < MIN.businessAddress) {
            show(`Dirección: mínimo ${MIN.businessAddress} caracteres`, 'error');
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            show('Las contraseñas no coinciden', 'error');
            return;
        }
        
        if (formData.password.length < 8 || !/[A-Z]/.test(formData.password) || !/[0-9]/.test(formData.password)) {
            show('La contraseña debe tener al menos 8 caracteres, una mayúscula y un número', 'error');
            return;
        }

        if (!accountType) {
            show('Elegí el tipo de cuenta para continuar', 'error');
            setStep('type');
            return;
        }

        setIsLoading(true);
        try {
            const profile = profilePayload();
            const signupInput = {
                name: formData.name.trim(),
                email: formData.email.trim(),
                password: formData.password,
                role: accountType,
                ...profile,
            };

            const result = await signUpWithEmail(signupInput);

            // Referral attribution: store pending code and redeem after auth is established.
            if (profile.referredBy) {
                await AsyncStorage.setItem(
                    `@ramgos/referrals/pending/${result.user.id}`,
                    profile.referredBy.trim().toUpperCase()
                );
            }

            navigation.reset({
                index: 0,
                routes: [{ 
                    name: 'Verification', 
                    params: { 
                        email: formData.email.trim(),
                        accountType: accountType || 'consumer',
                        isSignup: true
                    } 
                }],
            });

        } catch (error: any) {
            console.error('Registration error:', error);
            const errorMessage = error.message || '';

            if (errorMessage.includes('El email ya está registrado')) {
                // Prevención de enumeración de usuarios (White Hat Security Fix)
                // Se muestra un mensaje de éxito genérico y se envía a la pantalla de verificación
                // para que el atacante no pueda distinguir si el correo existe o no.
                show("Proceso iniciado. Si el correo no estaba registrado, recibirás un código de verificación.", "success");
                navigation.navigate('Verification', {
                    email: formData.email.trim(),
                    accountType,
                    isSignup: true
                });
            } else if (errorMessage.includes('Si ya tienes una cuenta')) {
                show('Este correo ya está registrado. Usa Iniciar sesión con tu contraseña.', 'error');
                navigation.navigate('Login', { email: formData.email.trim() });
            } else {
                show(errorMessage || 'Error al registrarse', 'error');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const renderAccountTypeButton = (type: 'consumer' | 'business' | 'influencer', icon: any, label: string, desc: string, color: string) => {
        const isSelected = accountType === type;
        const Icon = icon;

        return (
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setAccountType(type)}
                style={[
                    styles.typeBtn,
                    isSelected && { borderColor: color, backgroundColor: isSelected ? color + (isDark ? '30' : '10') : (isDark ? '#374151' : '#fff') },
                    isSelected && styles.typeBtnSelected // Additional shadow
                ]}
            >
                <View style={[styles.typeIconBox, { backgroundColor: isSelected ? color : (isDark ? '#4B5563' : '#F3F4F6') }]}>
                    <Icon size={24} color={isSelected ? '#fff' : (isDark ? '#D1D5DB' : '#6B7280')} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.typeTitle, isSelected && { color: color }]}>{label}</Text>
                    <Text style={styles.typeDesc}>{desc}</Text>
                </View>
                {isSelected && <CheckCircle2 size={24} color={color} />}
            </TouchableOpacity>
        );
    };

    // Category modal is rendered inline below (shared for business / influencer).

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        bounces={false}
                    >
                        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                            <BlurView intensity={isDark ? 40 : 70} tint={isDark ? 'dark' : 'light'} style={styles.card}>

                            {/* Header */}
                            <TouchableOpacity
                                onPress={() => {
                                    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
                                }}
                                style={styles.backBtn}
                            >
                                <ArrowLeft size={20} color={isDark ? "#D1D5DB" : "#4B5563"} />
                                <Text style={styles.backText}>{t('register.back', { defaultValue: 'Volver' })}</Text>
                            </TouchableOpacity>

                            <Text style={styles.title}>{t('register.title')}</Text>
                            <Text style={styles.subtitle}>
                                {step === 'type'
                                    ? t('register.subtitleType')
                                    : signupMethod === 'google'
                                        ? t('register.subtitleGoogle')
                                        : t('register.subtitleEmail')}
                            </Text>

                            {step === 'type' ? (
                                <View style={{ gap: 12 }}>
                                    {renderAccountTypeButton('consumer', Users, t('register.consumer'), t('register.consumerDesc'), '#2563EB')}
                                    {renderAccountTypeButton('business', Store, t('register.business'), t('register.businessDesc'), '#059669')}
                                    {renderAccountTypeButton('influencer', Award, t('register.influencer'), t('register.influencerDesc'), '#2196F3')}

                                    <View
                                        style={[
                                            styles.actionsBlock,
                                            !accountType && styles.actionsBlockMuted,
                                        ]}
                                        pointerEvents={accountType ? 'auto' : 'none'}
                                    >
                                        <View style={styles.divider}>
                                            <View style={styles.line} />
                                            <Text style={styles.orText}>
                                                {accountType
                                                    ? `Continuar como ${accountTypeLabel}`
                                                    : t('register.chooseType')}
                                            </Text>
                                            <View style={styles.line} />
                                        </View>

                                        <GoogleAuthButton
                                            label={
                                                accountTypeLabel
                                                    ? `${t('register.continueWithGoogle')} · ${accountTypeLabel}`
                                                    : t('register.continueWithGoogle')
                                            }
                                            onPress={() => handleContinue('google')}
                                            disabled={!canProceed}
                                            loading={false}
                                            style={{ marginBottom: 12 }}
                                        />

                                        <TouchableOpacity
                                            onPress={() => handleContinue('email')}
                                            activeOpacity={0.9}
                                            disabled={!canProceed}
                                            style={[
                                                styles.submitBtnContainer,
                                                !canProceed && { opacity: 0.45 },
                                            ]}
                                        >
                                            <LinearGradient
                                                colors={['#2196F3', '#29B6F6']}
                                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                                style={styles.gradientBtn}
                                            >
                                                <Sparkles size={20} color="#fff" style={{ marginRight: 8 }} />
                                                <Text style={styles.btnText}>{t('register.continueWithEmail')}</Text>
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ) : (
                                // STEP 2: Form (email/password path)
                                <View style={styles.form}>
                                    <View style={{ alignItems: 'center', marginBottom: 12, gap: 8 }}>
                                        <Badge color={accountTypeColor}>
                                            {accountTypeLabel}
                                            {signupMethod === 'google' ? ' · Google' : ' · Email'}
                                        </Badge>
                                        <TouchableOpacity
                                            onPress={() => setStep('type')}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        >
                                            <Text style={styles.changeTypeLink}>{t('register.changeAccountType')}</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {/* Email/password only when not using Google */}
                                    {signupMethod === 'email' && (
                                    <>
                                    {/* Common Fields */}
                                    <View style={styles.row}>
                                        <View style={[styles.inputContainer, styles.col]}>
                                            <Text style={styles.label}>{accountType === 'business' ? 'Nombre del contacto' : 'Nombre completo'}</Text>
                                            <View style={styles.inputWrapper}>
                                                <User size={20} color={isDark ? "#9CA3AF" : "#9CA3AF"} style={styles.icon} />
                                                <TextInput
                                                    style={styles.input}
                                                    placeholder="Juan Pérez"
                                                    placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                    value={formData.name}
                                                    onChangeText={t => setFormData({ ...formData, name: clamp(t, LIMITS.name) })}
                                                    maxLength={LIMITS.name}
                                                />
                                            </View>
                                        </View>

                                        <View style={[styles.inputContainer, styles.col]}>
                                            <Text style={styles.label}>Email</Text>
                                            <View style={styles.inputWrapper}>
                                                <Mail size={20} color="#9CA3AF" style={styles.icon} />
                                                <TextInput
                                                    style={styles.input}
                                                    placeholder="tu@email.com"
                                                    placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                    value={formData.email}
                                                    onChangeText={t => setFormData({ ...formData, email: clamp(t.trim().toLowerCase(), LIMITS.email) })}
                                                    keyboardType="email-address"
                                                    autoCapitalize="none"
                                                    maxLength={LIMITS.email}
                                                />
                                            </View>
                                        </View>
                                    </View>
                                    </>
                                    )}

                                    {/* Passwords */}
                                    {signupMethod === 'email' && (
                                    <View style={styles.row}>
                                        <View style={[styles.inputContainer, styles.col]}>
                                            <Text style={styles.label}>Contraseña</Text>
                                            <View style={styles.inputWrapper}>
                                                <Lock size={20} color="#9CA3AF" style={styles.icon} />
                                                <TextInput
                                                    style={styles.input}
                                                    placeholder="••••••••"
                                                    placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                    secureTextEntry={!showPassword}
                                                    value={formData.password}
                                                    onChangeText={t => setFormData({ ...formData, password: clamp(t, LIMITS.password) })}
                                                    maxLength={LIMITS.password}
                                                />
                                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                                    {showPassword ? <EyeOff size={20} color="#9CA3AF" /> : <Eye size={20} color="#9CA3AF" />}
                                                </TouchableOpacity>
                                            </View>
                                            {/* Dynamic Requirements */}
                                            {formData.password.length > 0 && (
                                                <View style={{ marginTop: 8, gap: 4 }}>
                                                    {passwordRequirements.map((req, i) => (
                                                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                            <CheckCircle2 size={12} color={req.met ? '#10B981' : (isDark ? '#4B5563' : '#D1D5DB')} />
                                                            <Text style={{ fontSize: 11, color: req.met ? (isDark ? '#D1D5DB' : '#374151') : (isDark ? '#4B5563' : '#9CA3AF') }}>
                                                                {req.label}
                                                            </Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            )}
                                        </View>

                                        <View style={[styles.inputContainer, styles.col]}>
                                            <Text style={styles.label}>Confirmar contraseña</Text>
                                            <View style={styles.inputWrapper}>
                                                <Lock size={20} color="#9CA3AF" style={styles.icon} />
                                                <TextInput
                                                    style={styles.input}
                                                    placeholder="••••••••"
                                                    placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                    secureTextEntry={!showConfirmPassword}
                                                    value={formData.confirmPassword}
                                                    onChangeText={t => setFormData({ ...formData, confirmPassword: clamp(t, LIMITS.password) })}
                                                    maxLength={LIMITS.password}
                                                />
                                                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                                                    {showConfirmPassword ? <EyeOff size={20} color="#9CA3AF" /> : <Eye size={20} color="#9CA3AF" />}
                                                </TouchableOpacity>
                                            </View>
                                            {/* Dynamic Match Requirement */}
                                            {formData.confirmPassword.length > 0 && (
                                                <View style={{ marginTop: 8, gap: 4 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                        <CheckCircle2 size={12} color={formData.password === formData.confirmPassword ? '#10B981' : (isDark ? '#4B5563' : '#D1D5DB')} />
                                                        <Text style={{ fontSize: 11, color: formData.password === formData.confirmPassword ? (isDark ? '#D1D5DB' : '#374151') : (isDark ? '#4B5563' : '#9CA3AF') }}>
                                                            Las contraseñas coinciden
                                                        </Text>
                                                    </View>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                    )}

                                    <View style={styles.inputContainer}>
                                        <Text style={styles.label}>Tu @ de usuario *</Text>
                                        <View style={styles.inputWrapper}>
                                            <AtSign size={20} color="#9CA3AF" style={styles.icon} />
                                            <TextInput
                                                style={styles.input}
                                                placeholder="juanperez"
                                                placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                value={formData.username}
                                                onChangeText={t => setFormData({ ...formData, username: normalizeUsername(t) })}
                                                autoCapitalize="none"
                                                maxLength={24}
                                            />
                                        </View>
                                        <Text style={{ fontSize: 11, color: isDark ? '#9CA3AF' : '#6B7280', marginLeft: 4 }}>
                                            3–24 caracteres. Letras, números o _
                                        </Text>
                                    </View>

                                    {/* Referred By (Optional) */}
                                    <View style={styles.inputContainer}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                            <Text style={styles.label}>Código de referido (opcional)</Text>
                                            <Text style={{ fontSize: 10, color: isDark ? '#C4B5FD' : '#2196F3', fontWeight: 'bold' }}>¡Gana puntos extra!</Text>
                                        </View>
                                        <View style={[styles.inputWrapper, { borderColor: formData.referredBy ? '#2196F3' : (isDark ? '#4B5563' : '#E5E7EB'), backgroundColor: formData.referredBy ? (isDark ? '#2E1065' : '#FAFAFA') : (isDark ? '#374151' : '#fff') }]}>
                                            <Tag size={20} color={formData.referredBy ? '#2196F3' : '#9CA3AF'} style={styles.icon} />
                                            <TextInput
                                                style={[styles.input, { color: formData.referredBy ? '#2196F3' : (isDark ? '#F9FAFB' : '#111827'), fontWeight: formData.referredBy ? '600' : '400' }]}
                                                placeholder="Código o @ de quien te invitó"
                                                placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                value={formData.referredBy}
                                                onChangeText={t => setFormData({ ...formData, referredBy: formatReferralCode(t) })}
                                                autoCapitalize="characters"
                                                maxLength={LIMITS.referralCode}
                                            />
                                            {formData.referredBy.length > 0 && <CheckCircle2 size={16} color="#2196F3" />}
                                        </View>
                                    </View>

                                    {/* Business Specific Fields */}
                                    {accountType === 'business' && (
                                        <>
                                            <View style={styles.row}>
                                                <View style={[styles.inputContainer, styles.col]}>
                                                    <Text style={styles.label}>Nombre del negocio *</Text>
                                                    <View style={styles.inputWrapper}>
                                                        <Store size={20} color="#9CA3AF" style={styles.icon} />
                                                        <TextInput
                                                            style={styles.input}
                                                            placeholder="Mi Negocio"
                                                            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                            value={formData.businessName}
                                                            onChangeText={t => setFormData({ ...formData, businessName: clamp(t, LIMITS.businessName) })}
                                                            maxLength={LIMITS.businessName}
                                                        />
                                                    </View>
                                                </View>

                                                <View style={[styles.inputContainer, styles.col]}>
                                                    <Text style={styles.label}>Teléfono (opcional)</Text>
                                                    <View style={styles.inputWrapper}>
                                                        <Phone size={20} color="#9CA3AF" style={styles.icon} />
                                                        <TextInput
                                                            style={styles.input}
                                                            placeholder="+1 555 000 0000"
                                                            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                            value={formData.businessPhone}
                                                            onChangeText={t => setFormData({ ...formData, businessPhone: formatPhone(t) })}
                                                            keyboardType="phone-pad"
                                                            maxLength={LIMITS.phone}
                                                        />
                                                    </View>
                                                </View>
                                            </View>

                                            <View style={styles.inputContainer}>
                                                <Text style={styles.label}>Dirección (opcional)</Text>
                                                <View style={styles.inputWrapper}>
                                                    <MapPin size={20} color="#9CA3AF" style={styles.icon} />
                                                    <TextInput
                                                        style={styles.input}
                                                        placeholder="Calle 123, Brooklyn, NY"
                                                        placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                        value={formData.businessAddress}
                                                        onChangeText={t => setFormData({ ...formData, businessAddress: clamp(t, LIMITS.businessAddress) })}
                                                        maxLength={LIMITS.businessAddress}
                                                    />
                                                </View>
                                                <Text style={{ fontSize: 11, color: isDark ? '#9CA3AF' : '#6B7280', marginLeft: 4 }}>
                                                    La verificación formal (EIN, docs) se hace después en KYC
                                                </Text>
                                            </View>

                                            <View style={styles.inputContainer}>
                                                <Text style={styles.label}>Categoría del negocio *</Text>
                                                <TouchableOpacity
                                                    style={styles.inputWrapper}
                                                    onPress={() => setShowCategoryModal(true)}
                                                >
                                                    <Tag size={20} color="#9CA3AF" style={styles.icon} />
                                                    <Text style={[
                                                        styles.input,
                                                        { lineHeight: isCompact ? 34 : 48 },
                                                        !formData.businessCategory && { color: isDark ? "#6B7280" : "#9CA3AF" }
                                                    ]}>
                                                        {formData.businessCategory || "Seleccionar categoría"}
                                                    </Text>
                                                    <ChevronDown size={20} color="#9CA3AF" />
                                                </TouchableOpacity>
                                            </View>
                                        </>
                                    )}

                                    {/* Influencer Specific Fields */}
                                    {accountType === 'influencer' && (
                                        <>
                                            <Text style={{ fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280', marginBottom: 4 }}>
                                                Al menos una red social es obligatoria
                                            </Text>
                                            <View style={styles.row}>
                                                <View style={[styles.inputContainer, styles.col]}>
                                                    <Text style={styles.label}>Instagram (URL)</Text>
                                                    <View style={styles.inputWrapper}>
                                                        <Award size={20} color="#9CA3AF" style={styles.icon} />
                                                        <TextInput
                                                            style={styles.input}
                                                            placeholder="https://instagram.com/usuario"
                                                            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                            value={formData.instagramUrl}
                                                            onChangeText={t => setFormData({ ...formData, instagramUrl: t.trim() })}
                                                            autoCapitalize="none"
                                                            maxLength={100}
                                                        />
                                                    </View>
                                                </View>
                                                <View style={[styles.inputContainer, styles.col]}>
                                                    <Text style={styles.label}>TikTok (URL)</Text>
                                                    <View style={styles.inputWrapper}>
                                                        <Award size={20} color="#9CA3AF" style={styles.icon} />
                                                        <TextInput
                                                            style={styles.input}
                                                            placeholder="https://tiktok.com/@usuario"
                                                            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                            value={formData.tiktokUrl}
                                                            onChangeText={t => setFormData({ ...formData, tiktokUrl: t.trim() })}
                                                            autoCapitalize="none"
                                                            maxLength={100}
                                                        />
                                                    </View>
                                                </View>
                                            </View>
                                            <View style={styles.row}>
                                                <View style={[styles.inputContainer, styles.col]}>
                                                    <Text style={styles.label}>Categoría de influencer *</Text>
                                                    <TouchableOpacity
                                                        style={styles.inputWrapper}
                                                        onPress={() => setShowCategoryModal(true)}
                                                    >
                                                        <Tag size={20} color="#9CA3AF" style={styles.icon} />
                                                        <Text style={[
                                                            styles.input,
                                                            { lineHeight: isCompact ? 34 : 48 },
                                                            !formData.businessCategory && { color: isDark ? "#6B7280" : "#9CA3AF" }
                                                        ]}>
                                                            {formData.businessCategory || "Seleccionar categoría"}
                                                        </Text>
                                                        <ChevronDown size={20} color="#9CA3AF" />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        </>
                                    )}

                                    <View style={styles.legalRow}>
                                        <TouchableOpacity
                                            style={[
                                                styles.legalCheckbox,
                                                {
                                                    borderColor: formData.acceptTerms ? '#2196F3' : (isDark ? '#4B5563' : '#D1D5DB'),
                                                    backgroundColor: formData.acceptTerms ? '#2196F3' : 'transparent'
                                                }
                                            ]}
                                            onPress={() => {
                                                if (formData.acceptTerms) {
                                                    setFormData({ ...formData, acceptTerms: false });
                                                    return;
                                                }
                                                handleOpenTerms();
                                            }}
                                        >
                                            {formData.acceptTerms && <CheckCircle2 size={12} color="#fff" />}
                                        </TouchableOpacity>
                                        <Text style={styles.legalText}>
                                            He leído y acepto los
                                            <Text style={styles.legalLink} onPress={handleOpenTerms}>
                                                {accountType === 'business' ? ' Términos para Vendedores' : 
                                                 accountType === 'influencer' ? ' T&C de Comisiones' : 
                                                 ' Términos y Condiciones'}
                                            </Text>
                                        </Text>
                                    </View>

                                    <View style={styles.legalRow}>
                                        <TouchableOpacity
                                            style={[
                                                styles.legalCheckbox,
                                                {
                                                    borderColor: formData.acceptPrivacy ? '#2196F3' : (isDark ? '#4B5563' : '#D1D5DB'),
                                                    backgroundColor: formData.acceptPrivacy ? '#2196F3' : 'transparent'
                                                }
                                            ]}
                                            onPress={() => {
                                                if (formData.acceptPrivacy) {
                                                    setFormData({ ...formData, acceptPrivacy: false });
                                                    return;
                                                }
                                                handleOpenPrivacy();
                                            }}
                                        >
                                            {formData.acceptPrivacy && <CheckCircle2 size={12} color="#fff" />}
                                        </TouchableOpacity>
                                        <Text style={styles.legalText}>
                                            He leído y acepto la
                                            <Text style={styles.legalLink} onPress={handleOpenPrivacy}> Política de Privacidad</Text>
                                        </Text>
                                    </View>

                                    {signupMethod === 'google' ? (
                                        <GoogleAuthButton
                                            label={
                                                accountTypeLabel
                                                    ? `Crear cuenta con Google · ${accountTypeLabel}`
                                                    : 'Crear cuenta con Google'
                                            }
                                            onPress={handleGoogleSignup}
                                            disabled={busy}
                                            loading={googleLoading}
                                        />
                                    ) : (
                                    <TouchableOpacity
                                        onPress={() => {
                                            if (!formData.acceptTerms || !formData.acceptPrivacy) {
                                                show('Debes aceptar los términos y la política de privacidad para continuar.', 'warning');
                                                return;
                                            }
                                            handleRegister();
                                        }}
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
                                                <Text style={styles.btnText}>{t('register.creatingAccount')}</Text>
                                            ) : (
                                                <>
                                                    <Sparkles size={20} color="#fff" style={{ marginRight: 8 }} />
                                                    <Text style={styles.btnText}>{t('register.createAccount')}</Text>
                                                </>
                                            )}
                                        </LinearGradient>
                                    </TouchableOpacity>
                                    )}
                                </View>

                            )}

                            <View style={styles.footer}>
                                <Text style={styles.footerText}>{t('register.alreadyAccount')} </Text>
                                <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                                    <Text style={styles.registerLink}>{t('register.login')}</Text>
                                </TouchableOpacity>
                            </View>
                            </BlurView>
                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>

            {/* Category Modal */}
            <Modal visible={showCategoryModal} transparent animationType="fade">
                <BlurView intensity={30} tint="dark" style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Selecciona una categoría</Text>
                            <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                                <X size={24} color={isDark ? "#D1D5DB" : "#4B5563"} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={accountType === 'business' ? BUSINESS_CATEGORIES : INFLUENCER_CATEGORIES}
                            keyExtractor={(item) => item}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[
                                        styles.categoryItem,
                                        formData.businessCategory === item && styles.categoryItemActive
                                    ]}
                                    onPress={() => {
                                        setFormData(prev => ({ ...prev, businessCategory: item }));
                                        setShowCategoryModal(false);
                                    }}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={[
                                            styles.categoryText,
                                            formData.businessCategory === item && styles.categoryTextActive
                                        ]}>{item}</Text>
                                    </View>
                                    {formData.businessCategory === item && <CheckCircle2 size={18} color="#2196F3" />}
                                </TouchableOpacity>
                            )}
                            contentContainerStyle={{ paddingBottom: 20 }}
                        />
                    </View>
                </BlurView>
            </Modal>
        </AuthBackground>
    );

}

const getStyles = (isDark: boolean, windowWidth: number, windowHeight: number) => {
    const isCompact = windowWidth < 360;
    const isSmall = windowWidth < 420;
    const isWide = windowWidth >= 768;

    const contentPaddingX = isCompact ? 12 : isSmall ? 14 : 16;
    const contentPaddingY = isCompact ? 12 : isSmall ? 16 : 20;
    const cardPadding = isCompact ? 16 : isSmall ? 20 : 24;

    // On small screens we avoid vertical centering to prevent "jumpiness" and clipping with keyboard.
    const scrollJustify: 'center' | 'flex-start' = isSmall ? 'flex-start' : 'center';

    // Slightly wider card on tablets/web so the form breathes.
    const maxCardWidth = isWide ? 560 : 440;

    return StyleSheet.create({
        container: { flex: 1 },
        scrollContent: {
            flexGrow: 1,
            justifyContent: scrollJustify,
            paddingHorizontal: contentPaddingX,
            paddingVertical: contentPaddingY,
            minHeight: Math.max(windowHeight - 80, 0),
        },

        // Glass Card
        card: {
            width: '100%',
            maxWidth: maxCardWidth,
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.55)',
            borderRadius: isCompact ? 24 : 32,
            padding: cardPadding,
            alignSelf: 'center',
            borderWidth: 1.5,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.6)',
            overflow: 'hidden',
            ...Platform.select({
                web: {
                    boxShadow: isDark ? '0 20px 40px rgba(0, 0, 0, 0.5)' : '0 20px 40px rgba(79, 195, 247, 0.15)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                } as any,
                default: {
                    ...glassShadow(isDark),
                },
            }),
        },

        backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: isCompact ? 12 : 20 },
        backText: { marginLeft: 8, color: colors(isDark).textMuted, fontWeight: '500' },

        title: { fontSize: isCompact ? 22 : 26, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#2196F3', marginBottom: 8, textAlign: 'center' },
        subtitle: { fontSize: isCompact ? 13 : 14, color: colors(isDark).textMuted, textAlign: 'center', marginBottom: isCompact ? 16 : 24 },

        // Type Selection
        typeBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)',
            borderRadius: Radius.lg,
            padding: isCompact ? 12 : 16,
            marginBottom: 12,
            borderWidth: 2,
            borderColor: 'transparent',
        },
        typeBtnSelected: {
            ...Platform.select({
                web: { boxShadow: '0 4px 6px rgba(0,0,0,0.05)' } as any,
                default: { ...glassShadow(isDark),},
            }),
        },
        typeIconBox: { width: isCompact ? 40 : 44, height: isCompact ? 40 : 44, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
        typeTitle: { fontSize: isCompact ? 15 : 16, fontWeight: '600', color: colors(isDark).text, marginBottom: 4 },
        typeDesc: { fontSize: isCompact ? 11 : 12, color: colors(isDark).textMuted },

        // Form
        form: { gap: isCompact ? 12 : 16 },
        inputContainer: { gap: 6 },
        label: { fontSize: 13, fontWeight: '500', color: isDark ? '#D1D5DB' : '#374151', marginLeft: 4 },
        inputWrapper: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)',
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
            height: isCompact ? 44 : 48,
            paddingHorizontal: 12,
            minWidth: 0,
        },
        icon: { marginRight: 12 },
        input: { flex: 1, fontSize: isCompact ? 14 : 15, color: colors(isDark).text },

        row: { flexDirection: isWide ? 'row' : 'column', gap: isCompact ? 10 : 12, width: '100%' },
        col: { flex: isWide ? 1 : undefined, minWidth: 0, width: isWide ? 'auto' : '100%' },

        submitBtnContainer: {
            marginTop: isCompact ? 8 : 12,
            ...Platform.select({
                web: { boxShadow: '0 6px 16px rgba(33, 150, 243, 0.3)' } as any,
                default: { ...glassShadow(isDark),},
            }),
        },
        gradientBtn: { flexDirection: 'row', height: isCompact ? 50 : 56, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
        btnText: { color: '#fff', fontSize: isCompact ? 15 : 16, fontWeight: '600' },
        legalRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: isCompact ? 10 : 14 },
        legalCheckbox: { width: 20, height: 20, borderRadius: Radius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2 },
        legalText: { fontSize: isCompact ? 12 : 13, color: colors(isDark).textMuted, flex: 1, flexWrap: 'wrap', lineHeight: isCompact ? 16 : 18 },
        legalLink: { color: '#2196F3', fontWeight: 'bold', textDecorationLine: 'underline' },

        divider: { flexDirection: 'row', alignItems: 'center', marginVertical: isCompact ? 16 : 24 },
        line: { flex: 1, height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)' },
        orText: { marginHorizontal: 12, color: '#9CA3AF', fontSize: 12 },
        actionsBlock: {
            marginTop: 4,
            gap: 12,
            opacity: 1,
        },
        actionsBlockMuted: {
            opacity: 0.4,
        },
        changeTypeLink: {
            fontSize: 13,
            color: '#2196F3',
            fontWeight: '500',
        },

        socialRow: { flexDirection: 'row', gap: 12, marginBottom: 24, justifyContent: 'center' },
        socialBtn: { width: 48, height: 48, borderRadius: Radius.md, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', justifyContent: 'center', alignItems: 'center' },

        footer: { flexDirection: 'row', justifyContent: 'center', marginTop: isCompact ? 16 : 24, flexWrap: 'wrap' },
        footerText: { color: colors(isDark).textMuted },
        registerLink: { color: '#2196F3', fontWeight: '600' },

        // Badge (legacy)
        badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.xl },

        // Modal
        modalOverlay: {
            flex: 1,
            backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(15,23,42,0.3)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
            ...Platform.select({
                web: {
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                } as any,
            }),
        },
        modalContent: {
            width: '100%',
            maxWidth: 400,
            maxHeight: '70%',
            backgroundColor: isDark ? 'rgba(24,24,27,0.85)' : 'rgba(255,255,255,0.85)',
            borderRadius: Radius.xl,
            padding: 20,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.5)',
            ...Platform.select({
                web: { 
                    boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                } as any,
                default: { elevation: 8 }
            })
        },
        modalHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16
        },
        modalTitle: {
            fontSize: 18,
            fontWeight: 'bold',
            color: colors(isDark).text
        },
        categoryItem: {
            paddingVertical: 14,
            paddingHorizontal: 12,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center'
        },
        categoryItemActive: {
            backgroundColor: isDark ? 'rgba(33, 150, 243, 0.1)' : '#FAFAFA',
            borderRadius: Radius.sm,
            borderBottomWidth: 0
        },
        categoryText: {
            fontSize: 15,
            color: colors(isDark).textMuted
        },
        categoryTextActive: {
            color: '#2196F3',
            fontWeight: '600'
        }
    });
};
