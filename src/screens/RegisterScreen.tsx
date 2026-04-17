import React, { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, ScrollView, Alert, Platform, KeyboardAvoidingView, useWindowDimensions, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { Lock, Eye, EyeOff, Tag, CheckCircle2, Store, MapPin, Award, User, Mail, Sparkles, ArrowLeft, Users, ChevronDown, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthBackground } from '../components/AuthBackground';
import { Badge } from '../components/ui/badge';
import { CURRENT_TERMS_VERSION, useAuth } from '../contexts/AuthContext';
import { useReferral } from '../contexts/ReferralContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { BlurView } from 'expo-blur';

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


// SVG Icons matching Login/Welcome
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

export default function RegisterScreen({ navigation, route }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const isCompact = windowWidth < 360;
    const styles = useMemo(() => getStyles(isDark, windowWidth, windowHeight), [isDark, windowHeight, windowWidth]);

    const [step, setStep] = useState<'type' | 'form'>('type');
    const [accountType, setAccountType] = useState<'consumer' | 'business' | 'influencer'>('consumer');

    // Form Data
    const [formData, setFormData] = useState({
        name: '', email: '', password: '', confirmPassword: '',
        businessName: '', businessCategory: '', businessAddress: '', businessPhone: '',
        referralCode: '',
        acceptTerms: false,
        acceptPrivacy: false
    });

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [legalViews, setLegalViews] = useState({ terms: false, privacy: false });
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const { signUpWithEmail, loginWithSocial, isProcessing } = useAuth();
    useReferral();
    const { show } = useToast();
    const acceptTermsMutation = useMutation(api.users.acceptTerms);

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

    const handleOpenTerms = () => {
        setLegalViews(prev => ({ ...prev, terms: true }));
        navigation.navigate('Terms', { origin: 'signup', returnKey: route?.key });
    };

    const handleOpenPrivacy = () => {
        setLegalViews(prev => ({ ...prev, privacy: true }));
        navigation.navigate('Privacy', { origin: 'signup', returnKey: route?.key });
    };

    const strength = getPasswordStrength(formData.password);

    const handleContinue = () => {
        // Fade out slightly before switching
        setStep('form');
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true })
        ]).start();
    };

    const busy = isLoading || isProcessing;

    const handleRegister = async () => {
        if (!formData.acceptTerms || !formData.acceptPrivacy) {
            show('Debes aceptar los Términos y Privacidad', 'error');
            return;
        }
        if (!formData.name.trim() || !formData.email.trim() || !formData.password.trim()) {
            show('Completa nombre, email y contraseña', 'error');
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            show('Las contraseñas no coinciden', 'error');
            return;
        }

        setIsLoading(true);
        try {
            const signupInput = {
                name: formData.name.trim(),
                email: formData.email.trim(),
                password: formData.password,
                role: accountType,
                businessName: accountType === 'business' ? formData.businessName : undefined,
                businessCategory: accountType === 'business' ? formData.businessCategory : undefined,
                businessAddress: accountType === 'business' ? formData.businessAddress : undefined,
                phone: accountType === 'business' ? formData.businessPhone : undefined,
                referralCode: formData.referralCode || undefined
            };

            const result = await signUpWithEmail(signupInput);

            // Mark T&C acceptance for the newly-created user (pre-verification) so it won't block later.
            if (formData.acceptTerms) {
                // Use backend mutation directly since AuthContext user might not be synced yet
                await acceptTermsMutation({
                    id: result.userId as any,
                    version: CURRENT_TERMS_VERSION
                });
            }

            // Referral attribution (demo/mock): store pending code and redeem after auth is established.
            if (formData.referralCode) {
                await AsyncStorage.setItem(
                    `@ramgos/referrals/pending/${result.userId}`,
                    formData.referralCode.trim().toUpperCase()
                );
            }

            navigation.navigate('Verification', {
                email: result.user.email,
                accountType,
                isSignup: true
            });

        } catch (error: any) {
            console.error('Registration error:', error);
            const errorMessage = error.message || '';

            if (errorMessage.includes('El email ya está registrado')) {
                if (Platform.OS === 'web') {
                    // Web specific handling using window.confirm
                    // @ts-ignore
                    if (window.confirm("Este correo ya está registrado. ¿Quieres iniciar sesión?")) {
                        navigation.navigate('Login');
                    }
                } else {
                    // Native Alert
                    Alert.alert(
                        "Correo ya registrado",
                        "Este correo ya existe en nuestra base de datos. ¿Deseas iniciar sesión?",
                        [
                            { text: "Cancelar", style: "cancel" },
                            { text: "Ir al Login", onPress: () => navigation.navigate('Login') }
                        ]
                    );
                }
            } else {
                show(errorMessage || 'Error al registrarse', 'error');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSocialSignup = async (provider: Parameters<typeof loginWithSocial>[0]) => {
        if (busy) return;
        setIsLoading(true);
        try {
            const decision = await loginWithSocial(provider, undefined, accountType);

            // Check if we need to setup profile first
            const nextScreen = decision.nextRoute?.screen;
            if (nextScreen === 'BasicProfileSetup') {
                const destination = decision.nextRoute!;
                navigation.reset({ index: 0, routes: [{ name: destination.screen, params: destination.params }] });
                return;
            }

            // Force KYC for ALL users during registration flow
            navigation.reset({
                index: 0,
                routes: [{ name: 'KYC', params: { accountType: accountType || 'consumer' } }]
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'No pudimos continuar con tu cuenta social.';
            show(message, 'error');
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

    // Modal Render
    function renderCategoryModal() {
        const categories = accountType === 'business' ? BUSINESS_CATEGORIES : INFLUENCER_CATEGORIES;

        return (
            <Modal
                visible={showCategoryModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowCategoryModal(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowCategoryModal(false)}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Selecciona una categoría</Text>
                            <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                                <X size={24} color={isDark ? "#D1D5DB" : "#4B5563"} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={categories}
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
                                    {formData.businessCategory === item && <CheckCircle2 size={18} color="#7C3AED" />}
                                </TouchableOpacity>
                            )}
                            contentContainerStyle={{ paddingBottom: 20 }}
                        />
                    </View>
                </TouchableOpacity>
            </Modal>
        );
    }

    return (
        <AuthBackground>
            {renderCategoryModal()}
            <SafeAreaView style={styles.container}>
                <KeyboardAvoidingView
                    style={styles.container}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        <Animated.View style={[styles.card, { opacity: fadeAnim }]}>

                            {/* Header */}
                            <TouchableOpacity
                                onPress={() => {
                                    if (step === 'form') {
                                        setStep('type');
                                        return;
                                    }
                                    // Ensure we always land on Welcome even if Register was opened via deep link
                                    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
                                }}
                                style={styles.backBtn}
                            >
                                <ArrowLeft size={20} color={isDark ? "#D1D5DB" : "#4B5563"} />
                                <Text style={styles.backText}>Volver</Text>
                            </TouchableOpacity>

                            <Text style={styles.title}>Únete a Ramgos</Text>
                            <Text style={styles.subtitle}>
                                {step === 'type' ? 'Selecciona el tipo de cuenta' : 'Completa tu información'}
                            </Text>

                            {step === 'type' ? (
                                // STEP 1: Account Type
                                <View style={{ gap: 12 }}>
                                    {renderAccountTypeButton('consumer', Users, 'Consumidor', 'Explora productos, bonos y eventos', '#2563EB')}
                                    {renderAccountTypeButton('business', Store, 'Negocio', 'Vende productos y crea bonos', '#059669')}
                                    {renderAccountTypeButton('influencer', Award, 'Influencer', 'Gana comisiones por referidos', '#7C3AED')}

                                    <TouchableOpacity onPress={handleContinue} activeOpacity={0.9} style={styles.submitBtnContainer}>
                                        <LinearGradient
                                            colors={['#7C3AED', '#9333EA']}
                                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                            style={styles.gradientBtn}
                                        >
                                            <Sparkles size={20} color="#fff" style={{ marginRight: 8 }} />
                                            <Text style={styles.btnText}>Continuar</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>

                                    {/* Social Login Divider */}
                                    <View style={styles.divider}>
                                        <View style={styles.line} />
                                        <Text style={styles.orText}>O continúa con</Text>
                                        <View style={styles.line} />
                                    </View>
                                    <View style={styles.socialRow}>
                                        <TouchableOpacity
                                            style={styles.socialBtn}
                                            onPress={() => handleSocialSignup('google')}
                                            disabled={busy}
                                        >
                                            <GoogleIcon />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.socialBtn}
                                            onPress={() => handleSocialSignup('facebook')}
                                            disabled={busy}
                                        >
                                            <FacebookIcon />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ) : (
                                // STEP 2: Form
                                <View style={styles.form}>
                                    <View style={{ alignItems: 'center', marginBottom: 12 }}>
                                        <Badge
                                            color={accountType === 'consumer' ? '#2563EB' : accountType === 'business' ? '#059669' : '#7C3AED'}
                                        >
                                            {accountType === 'consumer' ? 'Consumidor' : accountType === 'business' ? 'Negocio' : 'Influencer'}
                                        </Badge>
                                    </View>

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
                                                    onChangeText={t => setFormData({ ...formData, name: t })}
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
                                                    onChangeText={t => setFormData({ ...formData, email: t })}
                                                    keyboardType="email-address"
                                                    autoCapitalize="none"
                                                />
                                            </View>
                                        </View>
                                    </View>

                                    {/* Passwords */}
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
                                                    onChangeText={t => setFormData({ ...formData, password: t })}
                                                />
                                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                                    {showPassword ? <EyeOff size={20} color="#9CA3AF" /> : <Eye size={20} color="#9CA3AF" />}
                                                </TouchableOpacity>
                                            </View>
                                            {/* Strength Meter */}
                                            {formData.password.length > 0 && (
                                                <View style={{ marginTop: 4 }}>
                                                    <View style={{ height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, overflow: 'hidden' }}>
                                                        <View style={{ height: '100%', width: strength.width as any, backgroundColor: strength.color }} />
                                                    </View>
                                                    <Text style={{ fontSize: 10, color: strength.color, marginLeft: 'auto', marginTop: 2 }}>
                                                        {strength.label}
                                                    </Text>
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
                                                    onChangeText={t => setFormData({ ...formData, confirmPassword: t })}
                                                />
                                                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                                                    {showConfirmPassword ? <EyeOff size={20} color="#9CA3AF" /> : <Eye size={20} color="#9CA3AF" />}
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Referral Code (Optional) */}
                                    <View style={styles.inputContainer}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                            <Text style={styles.label}>Código de referido (Opcional)</Text>
                                            <Text style={{ fontSize: 10, color: isDark ? '#C4B5FD' : '#7C3AED', fontWeight: 'bold' }}>¡Gana puntos extra!</Text>
                                        </View>
                                        <View style={[styles.inputWrapper, { borderColor: formData.referralCode ? '#7C3AED' : (isDark ? '#4B5563' : '#E5E7EB'), backgroundColor: formData.referralCode ? (isDark ? '#2E1065' : '#F5F3FF') : (isDark ? '#374151' : '#fff') }]}>
                                            <Tag size={20} color={formData.referralCode ? '#7C3AED' : '#9CA3AF'} style={styles.icon} />
                                            <TextInput
                                                style={[styles.input, { color: formData.referralCode ? '#7C3AED' : (isDark ? '#F9FAFB' : '#111827'), fontWeight: formData.referralCode ? '600' : '400' }]}
                                                placeholder="Ej: RAMGOS-JUAN"
                                                placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                value={formData.referralCode}
                                                onChangeText={t => setFormData({ ...formData, referralCode: t.toUpperCase() })}
                                                autoCapitalize="characters"
                                            />
                                            {formData.referralCode.length > 0 && <CheckCircle2 size={16} color="#7C3AED" />}
                                        </View>
                                    </View>

                                    {/* Business Specific Fields */}
                                    {accountType === 'business' && (
                                        <>
                                            <View style={styles.row}>
                                                <View style={[styles.inputContainer, styles.col]}>
                                                    <Text style={styles.label}>Nombre del negocio</Text>
                                                    <View style={styles.inputWrapper}>
                                                        <Store size={20} color="#9CA3AF" style={styles.icon} />
                                                        <TextInput
                                                            style={styles.input}
                                                            placeholder="Mi Negocio"
                                                            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                            value={formData.businessName}
                                                            onChangeText={t => setFormData({ ...formData, businessName: t })}
                                                        />
                                                    </View>
                                                </View>

                                                <View style={[styles.inputContainer, styles.col]}>
                                                    <Text style={styles.label}>Dirección</Text>
                                                    <View style={styles.inputWrapper}>
                                                        <MapPin size={20} color="#9CA3AF" style={styles.icon} />
                                                        <TextInput
                                                            style={styles.input}
                                                            placeholder="Calle 123"
                                                            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                            value={formData.businessAddress}
                                                            onChangeText={t => setFormData({ ...formData, businessAddress: t })}
                                                        />
                                                    </View>
                                                </View>
                                            </View>

                                            <View style={styles.inputContainer}>
                                                <Text style={styles.label}>Categoría</Text>
                                                <TouchableOpacity
                                                    style={styles.inputWrapper}
                                                    onPress={() => setShowCategoryModal(true)}
                                                >
                                                    <Tag size={20} color="#9CA3AF" style={styles.icon} />
                                                    <Text style={[
                                                        styles.input,
                                                        { lineHeight: isCompact ? 34 : 48 }, // Vertical center fix
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
                                        <View style={styles.row}>
                                            <View style={[styles.inputContainer, styles.col]}>
                                                <Text style={styles.label}>Usuario (Instagram/TikTok)</Text>
                                                <View style={styles.inputWrapper}>
                                                    <Award size={20} color="#9CA3AF" style={styles.icon} />
                                                    <TextInput
                                                        style={styles.input}
                                                        placeholder="@usuario"
                                                        placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                                        value={formData.businessName} // Reusing field for simplicity or add new one
                                                        onChangeText={t => setFormData({ ...formData, businessName: t })}
                                                    />
                                                </View>
                                            </View>
                                            <View style={[styles.inputContainer, styles.col]}>
                                                <Text style={styles.label}>Categoría</Text>
                                                <TouchableOpacity
                                                    style={styles.inputWrapper}
                                                    onPress={() => setShowCategoryModal(true)}
                                                >
                                                    <Tag size={20} color="#9CA3AF" style={styles.icon} />
                                                    <Text style={[
                                                        styles.input,
                                                        { lineHeight: isCompact ? 34 : 48 }, // Vertical center fix
                                                        !formData.businessCategory && { color: isDark ? "#6B7280" : "#9CA3AF" }
                                                    ]}>
                                                        {formData.businessCategory || "Seleccionar categoría"}
                                                    </Text>
                                                    <ChevronDown size={20} color="#9CA3AF" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}

                                    <View style={styles.legalRow}>
                                        <TouchableOpacity
                                            style={[
                                                styles.legalCheckbox,
                                                {
                                                    borderColor: formData.acceptTerms ? '#7C3AED' : (isDark ? '#4B5563' : '#D1D5DB'),
                                                    backgroundColor: formData.acceptTerms ? '#7C3AED' : 'transparent'
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
                                            <Text style={styles.legalLink} onPress={handleOpenTerms}> Términos y Condiciones</Text>
                                        </Text>
                                    </View>

                                    <View style={styles.legalRow}>
                                        <TouchableOpacity
                                            style={[
                                                styles.legalCheckbox,
                                                {
                                                    borderColor: formData.acceptPrivacy ? '#7C3AED' : (isDark ? '#4B5563' : '#D1D5DB'),
                                                    backgroundColor: formData.acceptPrivacy ? '#7C3AED' : 'transparent'
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

                                    <TouchableOpacity
                                        onPress={() => {
                                            if (!formData.acceptTerms || !formData.acceptPrivacy) {
                                                show('Debes aceptar los Términos y Condiciones y la Política de Privacidad para continuar.', 'warning');
                                                return;
                                            }
                                            handleRegister();
                                        }}
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
                                                <Text style={styles.btnText}>Creando cuenta...</Text>
                                            ) : (
                                                <>
                                                    <Sparkles size={20} color="#fff" style={{ marginRight: 8 }} />
                                                    <Text style={styles.btnText}>Crear cuenta</Text>
                                                </>
                                            )}
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </View>

                            )}

                            <View style={styles.footer}>
                                <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
                                <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                                    <Text style={styles.registerLink}>Inicia sesión</Text>
                                </TouchableOpacity>
                            </View>

                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView >
        </AuthBackground >
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
            backgroundColor: isDark ? 'rgba(31, 41, 55, 0.85)' : 'rgba(255, 255, 255, 0.8)',
            borderRadius: isCompact ? 18 : 24,
            padding: cardPadding,
            alignSelf: 'center',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.2)',
            ...Platform.select({
                web: {
                    boxShadow: isDark ? '0px 10px 20px rgba(0, 0, 0, 0.4)' : '0 10px 20px rgba(139, 92, 246, 0.1)',
                } as any,
                default: {
                    shadowColor: isDark ? '#000' : '#8B5CF6',
                    shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: isDark ? 0.3 : 0.1,
                    shadowRadius: 20,
                    elevation: 10,
                },
            }),
        },

        backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: isCompact ? 12 : 20 },
        backText: { marginLeft: 8, color: isDark ? '#D1D5DB' : '#4B5563', fontWeight: '500' },

        title: { fontSize: isCompact ? 22 : 26, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#7C3AED', marginBottom: 8, textAlign: 'center' },
        subtitle: { fontSize: isCompact ? 13 : 14, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', marginBottom: isCompact ? 16 : 24 },

        // Type Selection
        typeBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? '#374151' : '#fff',
            borderRadius: 16,
            padding: isCompact ? 12 : 16,
            marginBottom: 12,
            borderWidth: 2,
            borderColor: 'transparent',
        },
        typeBtnSelected: {
            ...Platform.select({
                web: { boxShadow: '0 4px 6px rgba(0,0,0,0.05)' } as any,
                default: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
            }),
        },
        typeIconBox: { width: isCompact ? 40 : 44, height: isCompact ? 40 : 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
        typeTitle: { fontSize: isCompact ? 15 : 16, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 4 },
        typeDesc: { fontSize: isCompact ? 11 : 12, color: isDark ? '#9CA3AF' : '#6B7280' },

        // Form
        form: { gap: isCompact ? 12 : 16 },
        inputContainer: { gap: 6 },
        label: { fontSize: 13, fontWeight: '500', color: isDark ? '#D1D5DB' : '#374151', marginLeft: 4 },
        inputWrapper: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? '#374151' : '#fff',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: isDark ? '#4B5563' : '#E5E7EB',
            height: isCompact ? 44 : 48,
            paddingHorizontal: 12,
            minWidth: 0,
        },
        icon: { marginRight: 12 },
        input: { flex: 1, fontSize: isCompact ? 14 : 15, color: isDark ? '#F9FAFB' : '#111827' },

        row: { flexDirection: isWide ? 'row' : 'column', gap: isCompact ? 10 : 12, width: '100%' },
        col: { flex: 1, minWidth: 0 },

        submitBtnContainer: {
            marginTop: isCompact ? 8 : 12,
            ...Platform.select({
                web: { boxShadow: '0 6px 16px rgba(124, 58, 237, 0.3)' } as any,
                default: { shadowColor: '#7C3AED', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
            }),
        },
        gradientBtn: { flexDirection: 'row', height: isCompact ? 50 : 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
        btnText: { color: '#fff', fontSize: isCompact ? 15 : 16, fontWeight: '600' },
        legalRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: isCompact ? 10 : 14 },
        legalCheckbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2 },
        legalText: { fontSize: isCompact ? 12 : 13, color: isDark ? '#9CA3AF' : '#4B5563', flex: 1, flexWrap: 'wrap', lineHeight: isCompact ? 16 : 18 },
        legalLink: { color: '#7C3AED', fontWeight: 'bold', textDecorationLine: 'underline' },

        divider: { flexDirection: 'row', alignItems: 'center', marginVertical: isCompact ? 16 : 24 },
        line: { flex: 1, height: 1, backgroundColor: isDark ? '#4B5563' : '#E5E7EB' },
        orText: { marginHorizontal: 12, color: isDark ? '#9CA3AF' : '#9CA3AF', fontSize: 12 },

        socialRow: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
        socialBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: isDark ? '#374151' : '#fff', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB', justifyContent: 'center', alignItems: 'center' },

        footer: { flexDirection: 'row', justifyContent: 'center', marginTop: isCompact ? 16 : 24, flexWrap: 'wrap' },
        footerText: { color: isDark ? '#9CA3AF' : '#6B7280' },
        registerLink: { color: '#7C3AED', fontWeight: '600' },

        // Badge (legacy)
        badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },

        // Modal
        modalOverlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20
        },
        modalContent: {
            width: '100%',
            maxWidth: 400,
            maxHeight: '70%',
            backgroundColor: isDark ? '#1F2937' : '#fff',
            borderRadius: 20,
            padding: 20,
            ...Platform.select({
                web: { boxShadow: '0 10px 25px rgba(0,0,0,0.2)' },
                default: { elevation: 5 }
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
            color: isDark ? '#F9FAFB' : '#111827'
        },
        categoryItem: {
            paddingVertical: 14,
            paddingHorizontal: 12,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? '#374151' : '#F3F4F6',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center'
        },
        categoryItemActive: {
            backgroundColor: isDark ? 'rgba(124, 58, 237, 0.1)' : '#F5F3FF',
            borderRadius: 8,
            borderBottomWidth: 0
        },
        categoryText: {
            fontSize: 15,
            color: isDark ? '#D1D5DB' : '#4B5563'
        },
        categoryTextActive: {
            color: '#7C3AED',
            fontWeight: '600'
        }
    });
};
