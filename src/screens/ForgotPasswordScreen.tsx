import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, Platform, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBackground } from '../components/auth/AuthBackground';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mail, Send, CheckCircle2, ArrowLeft, Lock, Key, ArrowRight, RefreshCw } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { glassShadow, Radius, colors } from '../theme/tokens';
import { useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useToast } from '../contexts/ToastContext';
import * as Clipboard from 'expo-clipboard';

export default function ForgotPasswordScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const [email, setEmail] = useState('');
    const [code, setCode] = useState(['', '', '', '', '', '']); // 6 digits
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // States: 'request' | 'verify' | 'success'
    const [step, setStep] = useState<'request' | 'verify' | 'success'>('request');
    const [focusedIndex, setFocusedIndex] = useState<number | null>(0);
    const [cooldown, setCooldown] = useState(0);

    const sendResetEmail = useAction(api.auth.sendPasswordResetEmail);
    const resetPassword = useMutation(api.auth.resetPasswordWithCode);

    // Refs for OTP
    const inputs = useRef<Array<TextInput | null>>([]);
    const scaleAnims = useRef(Array(6).fill(0).map(() => new Animated.Value(1))).current;

    // Refs for Success Animation
    const successScale = useRef(new Animated.Value(0)).current;
    const successOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (step === 'success') {
            Animated.parallel([
                Animated.spring(successScale, {
                    toValue: 1,
                    friction: 6,
                    tension: 50,
                    useNativeDriver: true
                }),
                Animated.timing(successOpacity, {
                    toValue: 1,
                    duration: 500,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true
                })
            ]).start();
        }
    }, [step]);

    useEffect(() => {
        const loadCooldown = async () => {
            try {
                const val = await AsyncStorage.getItem('forgot_pwd_cooldown');
                if (val) {
                    const expires = parseInt(val, 10);
                    const now = Date.now();
                    if (expires > now) {
                        setCooldown(Math.ceil((expires - now) / 1000));
                    } else {
                        await AsyncStorage.removeItem('forgot_pwd_cooldown');
                    }
                }
            } catch (e) {}
        };
        loadCooldown();
    }, []);

    useEffect(() => {
        if (cooldown > 0) {
            const timer = setInterval(() => {
                setCooldown(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        AsyncStorage.removeItem('forgot_pwd_cooldown').catch(() => {});
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [cooldown]);

    useEffect(() => {
        // Animate scale on focus change
        code.forEach((_, idx) => {
            Animated.spring(scaleAnims[idx], {
                toValue: focusedIndex === idx ? 1.08 : 1,
                useNativeDriver: true,
                friction: 6,
                tension: 40
            }).start();
        });
    }, [focusedIndex]);

    useEffect(() => {
        // Auto-detect code from clipboard safely (only exactly 6 digits)
        const checkClipboard = async () => {
            try {
                const text = await Clipboard.getStringAsync();
                if (text && /^\d{6}$/.test(text.trim())) {
                    setCode(text.trim().split(''));
                    setFocusedIndex(5);
                    inputs.current[5]?.focus();
                }
            } catch (e) {
                // Ignore clipboard errors safely
            }
        };
        checkClipboard();
    }, []);

    const handleChangeCode = (text: string, index: number) => {
        // Handle Paste (user pastes 6 digits at once)
        if (text.length === 6 && /^\d{6}$/.test(text)) {
            setCode(text.split(''));
            inputs.current[5]?.focus();
            return;
        }

        // Sanitize input: only numbers, max 1 char
        const cleanText = text.replace(/\D/g, '').slice(-1);

        const newCode = [...code];
        newCode[index] = cleanText;
        setCode(newCode);

        // Auto-focus next
        if (cleanText && index < 5) {
            inputs.current[index + 1]?.focus();
        }
        // Auto-focus previous on delete
        if (!cleanText && index > 0) {
            inputs.current[index - 1]?.focus();
        }
    };

    const handleKeyPress = (e: any, index: number) => {
        if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
            inputs.current[index - 1]?.focus();
        }
    };

    const handleSendEmail = async () => {
        if (!email || cooldown > 0) return;
        setIsLoading(true);
        try {
            await sendResetEmail({ email });
            
            const expires = Date.now() + 60000;
            await AsyncStorage.setItem('forgot_pwd_cooldown', expires.toString());
            setCooldown(60);

            show("Instrucciones enviadas", "success");
            setStep('verify');
        } catch (error: any) {
            show(error.message || "Ocurrió un error", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPassword = async () => {
        const codeValue = code.join('');
        if (codeValue.length < 6 || !newPassword || !oldPassword) {
            show("Ingresa el código completo y ambas contraseñas", "warning");
            return;
        }
        setIsLoading(true);
        try {
            await resetPassword({ email, code: codeValue, newPassword, oldPassword });
            setStep('success');
        } catch (error: any) {
            show(error.message || "Código o contraseña inválidos", "error");
        } finally {
            setIsLoading(false);
        }
    };

    if (step === 'success') {
        return (
            <AuthBackground>
                <SafeAreaView style={styles.container}>
                    <View style={styles.content}>
                        <Animated.View style={[styles.card, { opacity: successOpacity, transform: [{ scale: successScale }] }]}>
                            <View style={styles.successIconContainer}>
                                <View style={styles.successIconGlowWrapper}>
                                    <LinearGradient colors={['#34D399', '#10B981']} style={styles.successIconGlow} />
                                </View>
                                <LinearGradient
                                    colors={['#10B981', '#059669']}
                                    style={styles.successIconBg}
                                >
                                    <CheckCircle2 size={56} color="#fff" strokeWidth={2.5} />
                                </LinearGradient>
                            </View>

                            <Text style={styles.successTitle}>¡Contraseña actualizada!</Text>
                            <Text style={styles.successSubtitle}>
                                Tu contraseña ha sido cambiada y asegurada con éxito. Ya puedes volver a entrar.
                            </Text>

                            <TouchableOpacity
                                onPress={() => navigation.navigate('Login')}
                                style={styles.successBtnContainer}
                            >
                                <LinearGradient
                                    colors={['#10B981', '#059669']}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={styles.gradientBtn}
                                >
                                    <Text style={styles.btnText}>Iniciar sesión</Text>
                                    <ArrowRight size={20} color="#fff" style={{ marginLeft: 8 }} />
                                </LinearGradient>
                            </TouchableOpacity>
                        </Animated.View>
                    </View>
                </SafeAreaView>
            </AuthBackground>
        );
    }

    if (step === 'verify') {
        return (
            <AuthBackground>
                <SafeAreaView style={styles.container}>
                    <View style={styles.content}>
                        <View style={styles.card}>
                            <TouchableOpacity onPress={() => setStep('request')} style={styles.backBtn}>
                                <ArrowLeft size={18} color={isDark ? "#D1D5DB" : "#4B5563"} />
                                <Text style={styles.backText}>Volver</Text>
                            </TouchableOpacity>

                            <View style={styles.iconContainer}>
                                <View style={styles.iconGlowWrapper}>
                                    <LinearGradient colors={['#4FC3F7', '#29B6F6']} style={styles.iconGlow} />
                                </View>
                                <LinearGradient
                                    colors={['#4FC3F7', '#29B6F6']}
                                    style={styles.iconBg}
                                >
                                    <Key size={32} color="#fff" />
                                </LinearGradient>
                            </View>

                            <Text style={styles.title}>Ingresa el código</Text>
                            <Text style={styles.subtitle}>
                                Ingresa el código que enviamos a {email} y tu nueva contraseña.
                            </Text>

                            <View style={styles.otpContainer}>
                                {code.map((digit, idx) => {
                                    const isFocused = focusedIndex === idx;
                                    const isFilled = digit.length > 0;
                                    return (
                                        <Animated.View key={idx} style={{ transform: [{ scale: scaleAnims[idx] }] }}>
                                            <TextInput
                                                ref={ref => { inputs.current[idx] = ref; }}
                                                style={[
                                                    styles.otpInput,
                                                    isFilled && styles.otpInputFilled,
                                                    isFocused && styles.otpInputActive
                                                ]}
                                                maxLength={6} // allow pasting full 6 digits
                                                keyboardType="number-pad"
                                                textContentType="oneTimeCode"
                                                autoComplete="one-time-code"
                                                value={digit}
                                                onChangeText={(text) => handleChangeCode(text, idx)}
                                                onKeyPress={(e) => handleKeyPress(e, idx)}
                                                onFocus={() => setFocusedIndex(idx)}
                                                onBlur={() => setFocusedIndex(null)}
                                                textAlign="center"
                                                selectionColor="#29B6F6"
                                            />
                                        </Animated.View>
                                    );
                                })}
                            </View>

                                
                            <View style={styles.resendWrapper}>
                                {cooldown > 0 ? (
                                    <Text style={styles.timerText}>Reenviar código en {cooldown}s</Text>
                                ) : (
                                    <TouchableOpacity onPress={handleSendEmail} style={styles.resendBtn} disabled={isLoading}>
                                        <RefreshCw size={14} color="#2196F3" style={{ marginRight: 6 }} />
                                        <Text style={styles.resendText}>Reenviar código</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            <View style={styles.form}>
                                <View style={styles.inputContainer}>
                                    <Text style={styles.label}>Contraseña anterior</Text>
                                    <View style={styles.inputWrapper}>
                                        <Lock size={20} color={isDark ? "#9CA3AF" : "#9CA3AF"} style={styles.icon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Tu contraseña anterior"
                                            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                            value={oldPassword}
                                            onChangeText={setOldPassword}
                                            secureTextEntry
                                            autoComplete="off"
                                            textContentType="none"
                                            importantForAutofill="no"
                                            autoCorrect={false}
                                        />
                                    </View>
                                </View>

                                <View style={[styles.inputContainer, { marginTop: 12 }]}>
                                    <Text style={styles.label}>Nueva contraseña</Text>
                                    <View style={styles.inputWrapper}>
                                        <Lock size={20} color={isDark ? "#9CA3AF" : "#9CA3AF"} style={styles.icon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Mínimo 8 caracteres"
                                            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                                            value={newPassword}
                                            onChangeText={setNewPassword}
                                            secureTextEntry
                                            autoComplete="off"
                                            textContentType="none"
                                            importantForAutofill="no"
                                            autoCorrect={false}
                                        />
                                    </View>
                                </View>

                                <TouchableOpacity
                                    onPress={handleResetPassword}
                                    style={[styles.submitBtnContainer, { marginTop: 16 }]}
                                    disabled={isLoading}
                                >
                                    <LinearGradient
                                        colors={['#2196F3', '#29B6F6']}
                                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                        style={styles.gradientBtn}
                                    >
                                        {isLoading ? (
                                            <Text style={styles.btnText}>Guardando...</Text>
                                        ) : (
                                            <>
                                                <CheckCircle2 size={20} color="#fff" style={{ marginRight: 8 }} />
                                                <Text style={styles.btnText}>Cambiar contraseña</Text>
                                            </>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </SafeAreaView>
            </AuthBackground>
        );
    }

    // Step 1: Request Email
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
                            <View style={styles.iconGlowWrapper}>
                                <LinearGradient colors={['#4FC3F7', '#29B6F6']} style={styles.iconGlow} />
                            </View>
                            <LinearGradient
                                colors={['#4FC3F7', '#29B6F6']}
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
                                onPress={handleSendEmail}
                                style={[styles.submitBtnContainer, cooldown > 0 && { opacity: 0.5 }]}
                                disabled={isLoading || cooldown > 0}
                            >
                                <LinearGradient
                                    colors={['#2196F3', '#29B6F6']}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={styles.gradientBtn}
                                >
                                    {isLoading ? (
                                        <Text style={styles.btnText}>Enviando...</Text>
                                    ) : (
                                        <>
                                            {cooldown > 0 ? (
                                                <Text style={styles.btnText}>Reintentar en {cooldown}s</Text>
                                            ) : (
                                                <>
                                                    <Send size={20} color="#fff" style={{ marginRight: 8 }} />
                                                    <Text style={styles.btnText}>Enviar instrucciones</Text>
                                                </>
                                            )}
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>

                        {/* Footer */}
                        <View style={styles.divider} />
                        <View style={styles.footer}>
                            <Text style={{ color: colors(isDark).textMuted, fontSize: 14 }}>¿Recordaste tu contraseña? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                                <Text style={{ color: '#2196F3', fontWeight: '600' }}>Inicia sesión</Text>
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
        borderRadius: Radius.xl,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(79, 195, 247, 0.3)' : 'rgba(79, 195, 247, 0.2)',
        ...glassShadow(isDark),
    },

    backBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 20 },
    backText: { marginLeft: 8, color: colors(isDark).textMuted, fontWeight: '500' },

    iconContainer: { marginBottom: 24, alignItems: 'center', justifyContent: 'center' },
    iconGlowWrapper: { position: 'absolute', width: 64, height: 64 },
    iconGlow: { flex: 1, borderRadius: Radius.xl, opacity: 0.5, transform: [{ scale: 1.2 }] },
    iconBg: { width: 64, height: 64, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: isDark ? '#374151' : '#fff', ...glassShadow(isDark) },

    title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', color: colors(isDark).text, marginBottom: 8 },
    subtitle: { fontSize: 14, color: colors(isDark).textMuted, textAlign: 'center', marginBottom: 24, paddingHorizontal: 10 },

    form: { width: '100%', gap: 16 },
    inputContainer: { gap: 8 },
    label: { fontSize: 14, fontWeight: '500', color: isDark ? '#D1D5DB' : '#374151', marginLeft: 4 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)', borderRadius: Radius.md, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.15)', height: 48, paddingHorizontal: 12 },
    icon: { marginRight: 12 },
    input: { flex: 1, fontSize: 16, color: colors(isDark).text },

    // OTP Styles
    otpContainer: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 24 },
    otpInput: { 
        width: 52, 
        height: 52, 
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)', 
        borderRadius: Radius.lg, 
        borderWidth: 1.5, 
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.15)', 
        fontSize: 24, 
        fontWeight: '700', 
        color: colors(isDark).text,
        textAlign: 'center',
        padding: 0,
    },
    otpInputFilled: { 
        borderColor: '#4FC3F7',
        color: '#29B6F6',
        backgroundColor: isDark ? 'rgba(79, 195, 247, 0.08)' : '#F0F9FF',
    },
    otpInputActive: {
        borderColor: '#2196F3',
        backgroundColor: isDark ? 'rgba(33, 150, 243, 0.15)' : '#E3F2FD',
        ...Platform.select({
            web: { boxShadow: '0 0 12px rgba(33, 150, 243, 0.3)' } as any,
        }),
    },

    submitBtnContainer: { ...glassShadow(isDark), marginTop: 8 },
    gradientBtn: { flexDirection: 'row', height: 56, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    resendWrapper: { alignItems: 'center', marginBottom: 24, minHeight: 20 },
    resendBtn: { flexDirection: 'row', alignItems: 'center' },
    resendText: { color: '#2196F3', fontSize: 13, fontWeight: '600' },
    timerText: { color: colors(isDark).textMuted, fontSize: 13 },

    divider: { width: '100%', height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)', marginVertical: 24 },
    footer: { flexDirection: 'row', justifyContent: 'center' },

    // Success State
    successIconContainer: { marginBottom: 32, alignItems: 'center', justifyContent: 'center' },
    successIconGlowWrapper: { position: 'absolute', width: 80, height: 80 },
    successIconGlow: { flex: 1, borderRadius: Radius.xl, opacity: 0.6, transform: [{ scale: 1.3 }] },
    successIconBg: { width: 80, height: 80, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#fff', ...Platform.select({ web: { boxShadow: isDark ? '0px 10px 20px rgba(0, 0, 0, 0.4)' : '0 10px 20px rgba(16, 185, 129, 0.1)' } as any, default: { ...glassShadow(isDark) } }) },
    
    successTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center', color: isDark ? '#34D399' : '#10B981', marginBottom: 12 },
    successSubtitle: { fontSize: 15, color: colors(isDark).textMuted, textAlign: 'center', marginBottom: 32, paddingHorizontal: 16, lineHeight: 22 },
    successBtnContainer: { width: '100%', ...Platform.select({ web: { boxShadow: '0 6px 16px rgba(16, 185, 129, 0.3)' } as any, default: { ...glassShadow(isDark) } }), marginTop: 8 },
});
