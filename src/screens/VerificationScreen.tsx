import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Dimensions, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBackground } from '../components/auth/AuthBackground';
import { Mail, CheckCircle2, RefreshCw, ArrowLeft, Sparkles } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth, type AuthFlowDecision } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { glassShadow, Radius, colors } from '../theme/tokens';
import * as Clipboard from 'expo-clipboard';


export default function VerificationScreen({ navigation, route }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const email = route.params?.email || 'tu@email.com';
    const [code, setCode] = useState(['', '', '', '', '', '']); // 6 digits
    const [timer, setTimer] = useState(60);
    const [isLoading, setIsLoading] = useState(false);
    const [canResend, setCanResend] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState<number | null>(0);
    const { verifyEmailCode, resendVerificationCode, pendingVerification, isProcessing } = useAuth();
    const busy = isLoading || isProcessing;
    const displayEmail = pendingVerification?.email ?? email;

    // Refs for auto-focus and animations
    const inputs = useRef<Array<TextInput | null>>([]);
    const scaleAnims = useRef(code.map(() => new Animated.Value(1))).current;

    useEffect(() => {
        if (timer > 0) {
            const interval = setInterval(() => setTimer(prev => prev - 1), 1000);
            return () => clearInterval(interval);
        } else {
            setCanResend(true);
        }
    }, [timer]);

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

    const navigateFromDecision = (decision: AuthFlowDecision) => {
        const destination = decision.nextRoute ?? { screen: 'Home' as const };
        navigation.reset({ index: 0, routes: [{ name: destination.screen, params: destination.params }] });
    };

    const accountType = route.params?.accountType || 'consumer';
    const isSignup = route.params?.isSignup === true;
    const rememberMe = route.params?.rememberMe ?? true;

    const handleVerify = async () => {
        const codeValue = code.join('');
        if (codeValue.length < 6) return;

        setIsLoading(true);
        try {
            const decision = await verifyEmailCode(codeValue, rememberMe);

            // Profile setup is no longer required as a separate step

            // Route all to KYC screen so they can complete or skip, but ONLY on signup
            if (isSignup && ['business', 'influencer', 'consumer'].includes(accountType)) {
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'KYC', params: { accountType } }],
                });
                return;
            }

            navigateFromDecision(decision);

        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Código inválido o expirado.';
            show(message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleResend = async () => {
        try {
            await resendVerificationCode();
            setTimer(60);
            setCanResend(false);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'No pudimos reenviar el código.';
            show(message, 'error');
        }
    };

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

        // Auto submit
        if (index === 5 && cleanText) {
            // Wait a tick to let state update before verifying
            setTimeout(() => {
                // Not calling handleVerify here to let user confirm, but could.
            }, 100);
        }
    };

    const handleKeyPress = (e: any, index: number) => {
        if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
            inputs.current[index - 1]?.focus();
        }
    };

    return (
        <AuthBackground>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <SafeAreaView style={styles.container}>
                <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

                    {/* Card */}
                    <View style={styles.card}>

                        {/* Icon */}
                        <View style={styles.iconContainer}>
                            <View style={styles.iconGlowWrapper}>
                                <LinearGradient colors={['#4FC3F7', '#29B6F6']} style={styles.iconGlow} />
                            </View>
                            <LinearGradient
                                colors={['#4FC3F7', '#29B6F6', '#2196F3']}
                                style={styles.mainIcon}
                            >
                                <Mail size={40} color="#fff" />
                            </LinearGradient>
                        </View>

                        <Text style={styles.title}>Verifica tu cuenta</Text>
                        <Text style={styles.subtitle}>
                            Hemos enviado un código de 6 dígitos a {'\n'}
                            <Text style={{ fontWeight: '600', color: colors(isDark).textMuted }}>{displayEmail}</Text>
                        </Text>

                        <View style={styles.otpContainer}>
                            {code.map((digit, idx) => {
                                const isFocused = focusedIndex === idx;
                                const isFilled = digit.length > 0;
                                return (
                                    <Animated.View key={idx} style={[styles.otpSlot, { transform: [{ scale: scaleAnims[idx] }] }]}>
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

                        {/* Verify Button */}
                        <TouchableOpacity
                            onPress={handleVerify}
                            style={styles.verifyBtnContainer}
                            disabled={busy}
                        >
                            <LinearGradient
                                colors={['#2196F3', '#29B6F6']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                style={styles.verifyBtn}
                            >
                                {busy ? (
                                    <Text style={styles.btnText}>Verificando...</Text>
                                ) : (
                                    <>
                                        <CheckCircle2 size={20} color="#fff" style={{ marginRight: 8 }} />
                                        <Text style={styles.btnText}>Verificar cuenta</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Resend */}
                        <View style={styles.resendContainer}>
                            <Text style={styles.resendLabel}>¿No recibiste el código?</Text>

                            {canResend ? (
                                <TouchableOpacity
                                    onPress={handleResend}
                                    style={[styles.resendBtn, busy && { opacity: 0.8 }]}
                                    disabled={busy}
                                >
                                    <RefreshCw size={14} color="#2196F3" style={{ marginRight: 6 }} />
                                    <Text style={styles.resendTextEnabled}>Reenviar código</Text>
                                </TouchableOpacity>
                            ) : (
                                <View style={styles.timerContainer}>
                                    <View style={styles.dot} />
                                    <Text style={styles.resendTextDisabled}>
                                        Reenviar en <Text style={{ color: '#2196F3', fontWeight: 'bold' }}>{timer}s</Text>
                                    </Text>
                                </View>
                            )}
                        </View>

                        <View style={styles.divider} />

                        <TouchableOpacity onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] })} style={styles.backLink}>
                            <Text style={styles.backLinkText}>Volver al inicio</Text>
                        </TouchableOpacity>

                    </View>

                    {/* Footer Warning */}
                    <View style={styles.footerWarning}>
                        <Sparkles size={12} color="#4FC3F7" style={{ marginRight: 6 }} />
                        <Text style={styles.footerText}>El código es válido por 10 minutos</Text>
                    </View>

                </ScrollView>
            </SafeAreaView>
            </KeyboardAvoidingView>
        </AuthBackground>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { flexGrow: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },

    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: isDark ? 'rgba(31, 41, 55, 0.85)' : 'rgba(255, 255, 255, 0.8)',
        borderRadius: Radius.xl,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(79, 195, 247, 0.3)' : 'rgba(79, 195, 247, 0.2)',
        ...Platform.select({
            web: { boxShadow: isDark ? '0px 10px 20px rgba(0, 0, 0, 0.4)' : '0 10px 20px rgba(79, 195, 247, 0.1)' } as any,
            default: {
                ...glassShadow(isDark),
            },
        }),
    },

    iconContainer: { marginBottom: 24, alignItems: 'center', justifyContent: 'center' },
    iconGlowWrapper: { position: 'absolute', width: 70, height: 70 },
    iconGlow: { flex: 1, borderRadius: Radius.xl, opacity: 0.5, transform: [{ scale: 1.2 }] },
    mainIcon: { width: 80, height: 80, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: isDark ? '#374151' : '#fff' },

    title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', color: colors(isDark).text, marginBottom: 8 },
    subtitle: { fontSize: 14, color: colors(isDark).textMuted, textAlign: 'center', marginBottom: 32, lineHeight: 20 },

    otpContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32, width: '100%' },
    otpSlot: { flex: 1, maxWidth: 48, marginHorizontal: 3 },
    otpInput: { 
        width: '100%',
        height: 48,
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)', 
        borderRadius: Radius.lg, 
        borderWidth: 1.5, 
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.15)', 
        fontSize: 22, 
        fontWeight: '700', 
        color: colors(isDark).text,
        textAlign: 'center',
        padding: 0,
    },
    otpInputFilled: { 
        borderColor: '#4FC3F7',
        color: '#29B6F6', // Color the text to match theme
        backgroundColor: isDark ? 'rgba(79, 195, 247, 0.08)' : '#F0F9FF',
    },
    otpInputActive: {
        borderColor: '#2196F3',
        backgroundColor: isDark ? 'rgba(33, 150, 243, 0.15)' : '#E3F2FD',
        ...Platform.select({
            web: { boxShadow: '0 0 12px rgba(33, 150, 243, 0.3)' } as any,
        }),
    },

    verifyBtnContainer: {
        width: '100%',
        ...Platform.select({
            web: { boxShadow: '0 6px 16px rgba(33, 150, 243, 0.3)' } as any,
            default: { ...glassShadow(isDark),},
        }),
    },
    verifyBtn: { flexDirection: 'row', height: 56, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    resendContainer: { marginTop: 24, alignItems: 'center', gap: 8 },
    resendLabel: { fontSize: 14, color: colors(isDark).textMuted },
    resendBtn: { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: isDark ? '#374151' : '#FAFAFA', borderRadius: Radius.md, borderWidth: 1, borderColor: isDark ? '#1565C0' : '#DDD6FE' },
    resendTextEnabled: { color: '#2196F3', fontSize: 14, fontWeight: '600' },

    timerContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 6, height: 6, borderRadius: Radius.sm, backgroundColor: '#4FC3F7' },
    resendTextDisabled: { color: isDark ? '#6B7280' : '#6B7280', fontSize: 14 },

    divider: { width: '100%', height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)', marginVertical: 24 },
    backLink: {},
    backLinkText: { color: colors(isDark).textMuted, fontSize: 14, fontWeight: '500' },

    footerWarning: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
    footerText: { fontSize: 12, color: colors(isDark).textMuted },
});
