import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBackground } from '../components/auth/AuthBackground';
import { Mail, CheckCircle2, RefreshCw, ArrowLeft, Sparkles } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth, type AuthFlowDecision } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';

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
    const { verifyEmailCode, resendVerificationCode, pendingVerification, isProcessing } = useAuth();
    const busy = isLoading || isProcessing;
    const displayEmail = pendingVerification?.email ?? email;

    // Refs for auto-focus
    const inputs = useRef<Array<TextInput | null>>([]);

    useEffect(() => {
        if (timer > 0) {
            const interval = setInterval(() => setTimer(prev => prev - 1), 1000);
            return () => clearInterval(interval);
        } else {
            setCanResend(true);
        }
    }, [timer]);

    const navigateFromDecision = (decision: AuthFlowDecision) => {
        const destination = decision.nextRoute ?? { screen: 'Home' as const };
        navigation.reset({ index: 0, routes: [{ name: destination.screen, params: destination.params }] });
    };

    const accountType = route.params?.accountType || 'consumer';

    const handleVerify = async () => {
        const codeValue = code.join('');
        if (codeValue.length < 6) return;

        setIsLoading(true);
        try {
            const decision = await verifyEmailCode(codeValue);

            // Check if we need to setup profile first
            const nextScreen = decision.nextRoute?.screen;
            if (nextScreen === 'BasicProfileSetup') {
                navigateFromDecision(decision);
                return;
            }

            // Force KYC only for signup flow
            const isSignup = route.params?.isSignup;

            if (isSignup) {
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'KYC', params: { accountType: accountType || 'consumer' } }]
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
        const newCode = [...code];
        newCode[index] = text;
        setCode(newCode);

        // Auto-focus next
        if (text && index < 5) {
            inputs.current[index + 1]?.focus();
        }
        // Auto-focus previous on delete
        if (!text && index > 0) {
            inputs.current[index - 1]?.focus();
        }

        // Auto submit
        if (index === 5 && text) {
            // handleVerify(); call can be here
        }
    };

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container}>
                <View style={styles.content}>

                    {/* Card */}
                    <View style={styles.card}>

                        {/* Icon */}
                        <View style={styles.iconContainer}>
                            <View style={styles.iconGlowWrapper}>
                                <LinearGradient colors={['#8B5CF6', '#9333EA']} style={styles.iconGlow} />
                            </View>
                            <LinearGradient
                                colors={['#8B5CF6', '#9333EA', '#7C3AED']}
                                style={styles.mainIcon}
                            >
                                <Mail size={40} color="#fff" />
                            </LinearGradient>
                        </View>

                        <Text style={styles.title}>Verifica tu cuenta</Text>
                        <Text style={styles.subtitle}>
                            Hemos enviado un código de 6 dígitos a {'\n'}
                            <Text style={{ fontWeight: '600', color: isDark ? '#D1D5DB' : '#4B5563' }}>{displayEmail}</Text>
                        </Text>

                        {/* OTP Inputs */}
                        <View style={styles.otpContainer}>
                            {code.map((digit, idx) => (
                                <TextInput
                                    key={idx}
                                    ref={ref => { inputs.current[idx] = ref; }}
                                    style={[styles.otpInput, digit ? styles.otpInputFilled : null]}
                                    maxLength={1}
                                    keyboardType="number-pad"
                                    value={digit}
                                    onChangeText={(text) => handleChangeCode(text, idx)}
                                    textAlign="center"
                                />
                            ))}
                        </View>

                        {/* Verify Button */}
                        <TouchableOpacity
                            onPress={handleVerify}
                            style={styles.verifyBtnContainer}
                            disabled={busy}
                        >
                            <LinearGradient
                                colors={['#7C3AED', '#9333EA']}
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
                                    <RefreshCw size={14} color="#7C3AED" style={{ marginRight: 6 }} />
                                    <Text style={styles.resendTextEnabled}>Reenviar código</Text>
                                </TouchableOpacity>
                            ) : (
                                <View style={styles.timerContainer}>
                                    <View style={styles.dot} />
                                    <Text style={styles.resendTextDisabled}>
                                        Reenviar en <Text style={{ color: '#7C3AED', fontWeight: 'bold' }}>{timer}s</Text>
                                    </Text>
                                </View>
                            )}
                        </View>

                        <View style={styles.divider} />

                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
                            <Text style={styles.backLinkText}>Volver al inicio</Text>
                        </TouchableOpacity>

                    </View>

                    {/* Footer Warning */}
                    <View style={styles.footerWarning}>
                        <Sparkles size={12} color="#8B5CF6" style={{ marginRight: 6 }} />
                        <Text style={styles.footerText}>El código es válido por 10 minutos</Text>
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
        ...Platform.select({
            web: { boxShadow: isDark ? '0px 10px 20px rgba(0, 0, 0, 0.4)' : '0 10px 20px rgba(139, 92, 246, 0.1)' } as any,
            default: {
                shadowColor: isDark ? '#000' : '#8B5CF6',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: isDark ? 0.3 : 0.1,
                shadowRadius: 20,
                elevation: 10,
            },
        }),
    },

    iconContainer: { marginBottom: 24, alignItems: 'center', justifyContent: 'center' },
    iconGlowWrapper: { position: 'absolute', width: 70, height: 70 },
    iconGlow: { flex: 1, borderRadius: 20, opacity: 0.5, transform: [{ scale: 1.2 }] },
    mainIcon: { width: 80, height: 80, borderRadius: 24, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: isDark ? '#374151' : '#fff' },

    title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 8 },
    subtitle: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', marginBottom: 32, lineHeight: 20 },

    otpContainer: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 24 },
    otpInput: { width: 44, height: 56, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderRadius: 12, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)', fontSize: 20, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },
    otpInputFilled: { borderColor: '#7C3AED', backgroundColor: isDark ? '#2E1065' : '#FAFAFA' },

    verifyBtnContainer: {
        width: '100%',
        ...Platform.select({
            web: { boxShadow: '0 6px 16px rgba(124, 58, 237, 0.3)' } as any,
            default: { shadowColor: '#7C3AED', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
        }),
    },
    verifyBtn: { flexDirection: 'row', height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    resendContainer: { marginTop: 24, alignItems: 'center', gap: 8 },
    resendLabel: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280' },
    resendBtn: { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: isDark ? '#374151' : '#FAFAFA', borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#6D28D9' : '#DDD6FE' },
    resendTextEnabled: { color: '#7C3AED', fontSize: 14, fontWeight: '600' },

    timerContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#8B5CF6' },
    resendTextDisabled: { color: isDark ? '#6B7280' : '#6B7280', fontSize: 14 },

    divider: { width: '100%', height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)', marginVertical: 24 },
    backLink: {},
    backLinkText: { color: isDark ? '#9CA3AF' : '#6B7280', fontSize: 14, fontWeight: '500' },

    footerWarning: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
    footerText: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280' },
});
