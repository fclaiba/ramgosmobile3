import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, Animated, ScrollView, Alert, Platform } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { Lock, Eye, EyeOff, Tag, CheckCircle2, Store, MapPin, Award, User, Mail, Sparkles, ArrowLeft, Users } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthBackground } from '../components/AuthBackground';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useRewards } from '../contexts/RewardsContext';


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

export default function RegisterScreen({ navigation }: any) {
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
    const { signUpWithEmail, loginWithSocial, isProcessing } = useAuth();
    const { registerReferralSignup } = useRewards();

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }, [step]); // Re-animate on step change

    const getPasswordStrength = (pass: string) => {
        if (!pass) return { width: '0%', color: '#E5E7EB', label: '' };
        if (pass.length < 6) return { width: '33%', color: '#EF4444', label: 'Débil' };
        if (pass.length < 8) return { width: '66%', color: '#F59E0B', label: 'Regular' };
        return { width: '100%', color: '#10B981', label: 'Fuerte' };
    };

    const handleOpenTerms = () => {
        setLegalViews(prev => ({ ...prev, terms: true }));
        navigation.navigate('Terms');
    };

    const handleOpenPrivacy = () => {
        setLegalViews(prev => ({ ...prev, privacy: true }));
        navigation.navigate('Privacy');
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
            Alert.alert('Acción requerida', 'Debes aceptar los Términos y la Política de Privacidad.');
            return;
        }
        if (!formData.name.trim() || !formData.email.trim() || !formData.password.trim()) {
            Alert.alert('Campos incompletos', 'Completa nombre, email y contraseña.');
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            Alert.alert('Contraseña inválida', 'La confirmación no coincide.');
            return;
        }
        setIsLoading(true);
        try {
            const result = await signUpWithEmail({
                name: formData.name.trim(),
                email: formData.email.trim(),
                password: formData.password,
                role: accountType,
                referralCode: formData.referralCode.trim() || undefined,
            });

            // Register attribution to RewardsContext immediately
            if (formData.referralCode.trim()) {
                const attribution = registerReferralSignup(result.userId, formData.name.trim());
                if (attribution.status !== 'awarded') {
                    console.warn('[Register] Referral attribution outcome:', attribution.message);
                }
            }
            navigation.navigate('Verification', {
                email: result.user.email,
                accountType,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No pudimos crear la cuenta.';
            Alert.alert('Registro', message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSocialSignup = async (provider: Parameters<typeof loginWithSocial>[0]) => {
        if (busy) return;
        setIsLoading(true);
        try {
            const decision = await loginWithSocial(provider, undefined, accountType);
            const destination = decision.nextRoute ?? { screen: 'Home' as const };
            navigation.reset({ index: 0, routes: [{ name: destination.screen, params: destination.params }] });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'No pudimos continuar con tu cuenta social.';
            Alert.alert('Registro social', message);
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
                    isSelected && { borderColor: color, backgroundColor: isSelected ? color + '10' : '#fff' },
                    isSelected && styles.typeBtnSelected // Additional shadow
                ]}
            >
                <View style={[styles.typeIconBox, { backgroundColor: isSelected ? color : '#F3F4F6' }]}>
                    <Icon size={24} color={isSelected ? '#fff' : '#6B7280'} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.typeTitle, isSelected && { color: color }]}>{label}</Text>
                    <Text style={styles.typeDesc}>{desc}</Text>
                </View>
                {isSelected && <CheckCircle2 size={24} color={color} />}
            </TouchableOpacity>
        );
    };

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container}>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    <Animated.View style={[styles.card, { opacity: fadeAnim }]}>

                        {/* Header */}
                        <TouchableOpacity
                            onPress={() => step === 'form' ? setStep('type') : navigation.goBack()}
                            style={styles.backBtn}
                        >
                            <ArrowLeft size={20} color="#4B5563" />
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
                                    <Badge color={accountType === 'consumer' ? '#2563EB' : accountType === 'business' ? '#059669' : '#7C3AED'}>
                                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                                            {accountType === 'consumer' ? 'Consumidor' : accountType === 'business' ? 'Negocio' : 'Influencer'}
                                        </Text>
                                    </Badge>
                                </View>

                                {/* Common Fields */}
                                <View style={styles.inputContainer}>
                                    <Text style={styles.label}>{accountType === 'business' ? 'Nombre del contacto' : 'Nombre completo'}</Text>
                                    <View style={styles.inputWrapper}>
                                        <User size={20} color="#9CA3AF" style={styles.icon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Juan Pérez"
                                            value={formData.name}
                                            onChangeText={t => setFormData({ ...formData, name: t })}
                                        />
                                    </View>
                                </View>

                                <View style={styles.inputContainer}>
                                    <Text style={styles.label}>Email</Text>
                                    <View style={styles.inputWrapper}>
                                        <Mail size={20} color="#9CA3AF" style={styles.icon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="tu@email.com"
                                            value={formData.email}
                                            onChangeText={t => setFormData({ ...formData, email: t })}
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                        />
                                    </View>
                                </View>

                                {/* Password */}
                                <View style={styles.inputContainer}>
                                    <Text style={styles.label}>Contraseña</Text>
                                    <View style={styles.inputWrapper}>
                                        <Lock size={20} color="#9CA3AF" style={styles.icon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="••••••••"
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

                                {/* Confirm Password - Simplified for length */}
                                <View style={styles.inputContainer}>
                                    <Text style={styles.label}>Confirmar contraseña</Text>
                                    <View style={styles.inputWrapper}>
                                        <Lock size={20} color="#9CA3AF" style={styles.icon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="••••••••"
                                            secureTextEntry={!showConfirmPassword}
                                            value={formData.confirmPassword}
                                            onChangeText={t => setFormData({ ...formData, confirmPassword: t })}
                                        />
                                        <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                                            {showConfirmPassword ? <EyeOff size={20} color="#9CA3AF" /> : <Eye size={20} color="#9CA3AF" />}
                                        </TouchableOpacity>
                                    </View>

                                    {/* Referral Code (Optional) */}
                                    <View style={styles.inputContainer}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                            <Text style={styles.label}>Código de referido (Opcional)</Text>
                                            <Text style={{ fontSize: 10, color: '#7C3AED', fontWeight: 'bold' }}>¡Gana puntos extra!</Text>
                                        </View>
                                        <View style={[styles.inputWrapper, { borderColor: formData.referralCode ? '#7C3AED' : '#E5E7EB', backgroundColor: formData.referralCode ? '#F5F3FF' : '#fff' }]}>
                                            <Tag size={20} color={formData.referralCode ? '#7C3AED' : '#9CA3AF'} style={styles.icon} />
                                            <TextInput
                                                style={[styles.input, { color: formData.referralCode ? '#7C3AED' : '#111827', fontWeight: formData.referralCode ? '600' : '400' }]}
                                                placeholder="Ej: RAMGOS-JUAN"
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
                                            <View style={styles.inputContainer}>
                                                <Text style={styles.label}>Nombre del negocio</Text>
                                                <View style={styles.inputWrapper}>
                                                    <Store size={20} color="#9CA3AF" style={styles.icon} />
                                                    <TextInput
                                                        style={styles.input}
                                                        placeholder="Mi Negocio"
                                                        value={formData.businessName}
                                                        onChangeText={t => setFormData({ ...formData, businessName: t })}
                                                    />
                                                </View>
                                            </View>

                                            <View style={styles.inputContainer}>
                                                <Text style={styles.label}>Dirección</Text>
                                                <View style={styles.inputWrapper}>
                                                    <MapPin size={20} color="#9CA3AF" style={styles.icon} />
                                                    <TextInput
                                                        style={styles.input}
                                                        placeholder="Calle 123"
                                                        value={formData.businessAddress}
                                                        onChangeText={t => setFormData({ ...formData, businessAddress: t })}
                                                    />
                                                </View>
                                            </View>
                                        </>
                                    )}

                                    {/* Influencer Specific Fields */}
                                    {accountType === 'influencer' && (
                                        <>
                                            <View style={styles.inputContainer}>
                                                <Text style={styles.label}>Usuario (Instagram/TikTok)</Text>
                                                <View style={styles.inputWrapper}>
                                                    <Award size={20} color="#9CA3AF" style={styles.icon} />
                                                    <TextInput
                                                        style={styles.input}
                                                        placeholder="@usuario"
                                                        value={formData.businessName} // Reusing field for simplicity or add new one
                                                        onChangeText={t => setFormData({ ...formData, businessName: t })}
                                                    />
                                                </View>
                                            </View>
                                            <View style={styles.inputContainer}>
                                                <Text style={styles.label}>Categoría</Text>
                                                <View style={styles.inputWrapper}>
                                                    <Tag size={20} color="#9CA3AF" style={styles.icon} />
                                                    <TextInput
                                                        style={styles.input}
                                                        placeholder="Moda, Tech, Lifestyle..."
                                                        value={formData.businessCategory}
                                                        onChangeText={t => setFormData({ ...formData, businessCategory: t })}
                                                    />
                                                </View>
                                            </View>
                                        </>
                                    )}

                                    <View style={styles.legalRow}>
                                        <TouchableOpacity
                                            style={[
                                                styles.legalCheckbox,
                                                {
                                                    borderColor: formData.acceptTerms ? '#7C3AED' : '#D1D5DB',
                                                    backgroundColor: formData.acceptTerms ? '#7C3AED' : 'transparent'
                                                }
                                            ]}
                                            onPress={() => {
                                                if (!legalViews.terms) {
                                                    handleOpenTerms();
                                                    return;
                                                }
                                                setFormData({ ...formData, acceptTerms: !formData.acceptTerms });
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
                                                    borderColor: formData.acceptPrivacy ? '#7C3AED' : '#D1D5DB',
                                                    backgroundColor: formData.acceptPrivacy ? '#7C3AED' : 'transparent'
                                                }
                                            ]}
                                            onPress={() => {
                                                if (!legalViews.privacy) {
                                                    handleOpenPrivacy();
                                                    return;
                                                }
                                                setFormData({ ...formData, acceptPrivacy: !formData.acceptPrivacy });
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
                                                Alert.alert('Acción requerida', 'Debes aceptar los Términos y Condiciones y la Política de Privacidad para continuar.');
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
            </SafeAreaView>
        </AuthBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 16 },

    // Glass Card
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        borderRadius: 24,
        padding: 24,
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.2)',
        ...Platform.select({
            web: {
                boxShadow: '0 10px 20px rgba(139, 92, 246, 0.1)'
            } as any,
            default: {
                shadowColor: '#8B5CF6',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.1,
                shadowRadius: 20,
                elevation: 10,
            }
        }),
    },

    backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    backText: { marginLeft: 8, color: '#4B5563', fontWeight: '500' },

    title: { fontSize: 26, fontWeight: 'bold', color: '#7C3AED', marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24 },

    // Type Selection
    typeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: 'transparent' },
    typeBtnSelected: {
        ...Platform.select({
            web: { boxShadow: '0 4px 6px rgba(0,0,0,0.05)' } as any,
            default: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }
        })
    },
    typeIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    typeTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 4 },
    typeDesc: { fontSize: 12, color: '#6B7280' },

    // Form
    form: { gap: 16 },
    inputContainer: { gap: 6 },
    label: { fontSize: 13, fontWeight: '500', color: '#374151', marginLeft: 4 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', height: 48, paddingHorizontal: 12 },
    icon: { marginRight: 12 },
    input: { flex: 1, fontSize: 15, color: '#111827' },

    submitBtnContainer: {
        marginTop: 12,
        ...Platform.select({
            web: { boxShadow: '0 6px 16px rgba(124, 58, 237, 0.3)' } as any,
            default: { shadowColor: '#7C3AED', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }
        }),
    },
    gradientBtn: { flexDirection: 'row', height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    legalRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    legalCheckbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    legalText: { fontSize: 13, color: '#4B5563', flex: 1, flexWrap: 'wrap' },
    legalLink: { color: '#7C3AED', fontWeight: 'bold', textDecorationLine: 'underline' },

    divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
    line: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
    orText: { marginHorizontal: 12, color: '#9CA3AF', fontSize: 12 },

    socialRow: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
    socialBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },

    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
    footerText: { color: '#6B7280' },
    registerLink: { color: '#7C3AED', fontWeight: '600' },

    // Badge
    badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
});
