import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Animated,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Key, Lock, Eye, EyeOff, CheckCircle2, RefreshCw } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthBackground } from '../components/auth/AuthBackground';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Radius, colors, glassShadow } from '../theme/tokens';
import * as Clipboard from 'expo-clipboard';

export default function ChangePasswordScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { user } = useAuth();
    const { show } = useToast();
    
    const changePassword = useMutation(api.users.changePassword);
    const sendCodeAction = useAction(api.auth.sendPasswordResetEmail);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [code, setCode] = useState(['', '', '', '', '', '']);
    
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [codeSent, setCodeSent] = useState(false);
    const [timer, setTimer] = useState(0);
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const inputs = useRef<Array<TextInput | null>>([]);
    const scaleAnims = useRef(Array(6).fill(0).map(() => new Animated.Value(1))).current;

    const minLengthOk = newPassword.length >= 8;
    const matchOk = newPassword.length > 0 && newPassword === confirmPassword;
    const differentFromCurrent = newPassword.length > 0 && newPassword !== currentPassword;
    const codeComplete = code.join('').length === 6;
    const canSubmit = !busy && currentPassword.length > 0 && minLengthOk && matchOk && differentFromCurrent && codeComplete;

    useEffect(() => {
        if (timer > 0) {
            const interval = setInterval(() => setTimer(prev => prev - 1), 1000);
            return () => clearInterval(interval);
        }
    }, [timer]);

    useEffect(() => {
        const checkClipboard = async () => {
            try {
                const text = await Clipboard.getStringAsync();
                if (text && /^\d{6}$/.test(text.trim())) {
                    setCode(text.trim().split(''));
                    setFocusedIndex(5);
                    inputs.current[5]?.focus();
                }
            } catch (e) {}
        };
        checkClipboard();
    }, []);

    useEffect(() => {
        code.forEach((_, idx) => {
            Animated.spring(scaleAnims[idx], {
                toValue: focusedIndex === idx ? 1.08 : 1,
                useNativeDriver: true,
                friction: 6,
                tension: 40
            }).start();
        });
    }, [focusedIndex]);

    const handleChangeCode = (text: string, index: number) => {
        if (text.length === 6 && /^\d{6}$/.test(text)) {
            setCode(text.split(''));
            inputs.current[5]?.focus();
            return;
        }
        const cleanText = text.replace(/\D/g, '').slice(-1);
        const newCode = [...code];
        newCode[index] = cleanText;
        setCode(newCode);
        if (cleanText && index < 5) {
            inputs.current[index + 1]?.focus();
        }
        if (!cleanText && index > 0) {
            inputs.current[index - 1]?.focus();
        }
    };

    const handleKeyPress = (e: any, index: number) => {
        if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
            inputs.current[index - 1]?.focus();
        }
    };

    const handleSendCode = async () => {
        if (!user?.email) return;
        setBusy(true);
        try {
            await sendCodeAction({ email: user.email });
            setCodeSent(true);
            setTimer(60);
            show('Código enviado a tu correo.', 'success');
        } catch (err: any) {
            show(err?.message ?? 'Error al enviar código.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleSubmit = async () => {
        if (!user) {
            show('Inicia sesión para cambiar tu contraseña.', 'error');
            return;
        }
        if (!canSubmit) return;
        setBusy(true);
        try {
            await changePassword({
                code: code.join(''),
                currentPassword,
                newPassword,
            });
            show('Contraseña actualizada correctamente.', 'success');
            navigation.goBack();
        } catch (err: any) {
            show(err?.message ?? 'No se pudo cambiar la contraseña.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const renderInput = (
        label: string, 
        value: string, 
        setValue: (v: string) => void, 
        visible: boolean, 
        toggle: () => void,
        placeholder: string
    ) => (
        <View style={styles.inputContainer}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.inputWrapper}>
                <Lock size={18} color={isDark ? "#9CA3AF" : "#9CA3AF"} style={styles.icon} />
                <TextInput
                    style={styles.input}
                    placeholder={placeholder}
                    placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                    value={value}
                    onChangeText={setValue}
                    secureTextEntry={!visible}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                <TouchableOpacity onPress={toggle} style={styles.eyeBtn}>
                    {visible ? (
                        <EyeOff size={18} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    ) : (
                        <Eye size={18} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container}>
                <KeyboardAvoidingView 
                    style={{ flex: 1 }} 
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                        <View style={styles.card}>
                            
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
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

                            <Text style={styles.title}>Cambiar contraseña</Text>
                            <Text style={styles.subtitle}>
                                Ingresa el código que enviamos a {user?.email} y tus nuevas credenciales.
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
                                                maxLength={6}
                                                keyboardType="number-pad"
                                                textContentType="oneTimeCode"
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
                                {timer > 0 ? (
                                    <Text style={styles.timerText}>Reenviar código en {timer}s</Text>
                                ) : (
                                    <TouchableOpacity onPress={handleSendCode} style={styles.resendBtn} disabled={busy}>
                                        <RefreshCw size={14} color="#2196F3" style={{ marginRight: 6 }} />
                                        <Text style={styles.resendText}>{codeSent ? 'Reenviar código' : 'Solicitar código'}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            <View style={styles.form}>
                                {renderInput('Contraseña actual', currentPassword, setCurrentPassword, showCurrent, () => setShowCurrent(!showCurrent), 'Tu contraseña actual')}
                                {renderInput('Nueva contraseña', newPassword, setNewPassword, showNew, () => setShowNew(!showNew), 'Mínimo 8 caracteres')}
                                {renderInput('Confirmar nueva contraseña', confirmPassword, setConfirmPassword, showConfirm, () => setShowConfirm(!showConfirm), 'Repite tu nueva contraseña')}

                                <TouchableOpacity
                                    onPress={handleSubmit}
                                    style={[styles.submitBtnContainer, !canSubmit && { opacity: 0.5 }]}
                                    disabled={!canSubmit || busy}
                                >
                                    <LinearGradient
                                        colors={['#2196F3', '#29B6F6']}
                                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                        style={styles.gradientBtn}
                                    >
                                        {busy ? (
                                            <ActivityIndicator color="#fff" />
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
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </AuthBackground>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1 },
    content: { flexGrow: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
    
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
    inputContainer: { gap: 6 },
    label: { fontSize: 13, fontWeight: '600', color: isDark ? '#E5E7EB' : '#374151', marginLeft: 4 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)', borderRadius: Radius.md, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.15)', height: 48, paddingHorizontal: 12 },
    icon: { marginRight: 12 },
    input: { flex: 1, fontSize: 15, color: colors(isDark).text },
    eyeBtn: { padding: 4 },

    otpContainer: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 12 },
    otpInput: { 
        width: 44, 
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

    resendWrapper: { alignItems: 'center', marginBottom: 24, minHeight: 20 },
    resendBtn: { flexDirection: 'row', alignItems: 'center' },
    resendText: { color: '#2196F3', fontSize: 13, fontWeight: '600' },
    timerText: { color: colors(isDark).textMuted, fontSize: 13 },

    submitBtnContainer: { ...glassShadow(isDark), marginTop: 12 },
    gradientBtn: { flexDirection: 'row', height: 52, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
