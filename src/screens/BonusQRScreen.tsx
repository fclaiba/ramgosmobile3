import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Animated as RNAnimated,
    Platform,
    StatusBar,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Brightness from 'expo-brightness';
import * as Clipboard from 'expo-clipboard';
import { BlurView } from 'expo-blur';
import { useNavigation, useRoute } from '@react-navigation/native';
import { X, Clock, AlertCircle, Copy, CheckCircle2, Ticket, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { glassShadow, Radius } from '../theme/tokens';


const { width } = Dimensions.get('window');

function formatCurrency(n?: number): string {
    if (n === undefined || n === null || Number.isNaN(n)) return '$0';
    try {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
        }).format(Number(n));
    } catch {
        return `$${Number(n).toFixed(0)}`;
    }
}

export default function BonusQRScreen() {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { show } = useToast();

    const {
        bonusId,
        businessName,
        bonoCode,
        bonoTitle,
        paidAmount = 50,
        creditTotal = 100,
        creditRemaining = 100,
        usesTotal = 1,
        usesRemaining = 1,
        validUntil,
    } = route.params || {};

    const finalCode = bonoCode || bonusId || 'DEMO-CODE-123';
    const qrData = finalCode;
    const qrSize = Math.min(width * 0.52, 210);

    const [timeLeft, setTimeLeft] = useState(300);
    const [initialBrightness, setInitialBrightness] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);
    const [brightnessReady, setBrightnessReady] = useState(false);

    const pulseAnim = useRef(new RNAnimated.Value(0.4)).current;

    useEffect(() => {
        RNAnimated.loop(
            RNAnimated.sequence([
                RNAnimated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
                RNAnimated.timing(pulseAnim, { toValue: 0.4, duration: 1200, useNativeDriver: true }),
            ])
        ).start();
    }, [pulseAnim]);

    const restoreBrightness = useCallback(async () => {
        if (initialBrightness !== null) {
            try {
                await Brightness.setBrightnessAsync(initialBrightness);
            } catch {
                /* ignore */
            }
        }
    }, [initialBrightness]);

    useEffect(() => {
        let timer: ReturnType<typeof setInterval> | null = null;
        const setMaxBrightness = async () => {
            try {
                const { status } = await Brightness.requestPermissionsAsync();
                if (status === 'granted') {
                    const cur = await Brightness.getBrightnessAsync();
                    setInitialBrightness(cur);
                    await Brightness.setBrightnessAsync(1.0);
                    setBrightnessReady(true);
                }
            } catch (error) {
                console.warn('[BonusQR] Could not set brightness', error);
            }
        };

        setMaxBrightness();

        timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    if (timer) clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timer) clearInterval(timer);
            restoreBrightness();
        };
    }, [restoreBrightness]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const handleCopyCode = async () => {
        await Clipboard.setStringAsync(finalCode);
        setCopied(true);
        show('Código copiado al portapapeles', 'success');
        setTimeout(() => setCopied(false), 2000);
    };

    const isExpired = timeLeft <= 0;
    const styles = getStyles(isDark, insets);
    const canvas = isDark ? '#09090B' : '#FAFAFA';

    return (
        <View style={[styles.container, { backgroundColor: canvas }]}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

            {/* Glass close — chrome only */}
            <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
                {Platform.OS !== 'web' ? (
                    <BlurView
                        intensity={isDark ? 40 : 55}
                        tint={isDark ? 'dark' : 'light'}
                        style={StyleSheet.absoluteFill}
                    />
                ) : null}
                <X size={22} color={isDark ? '#F4F4F5' : '#18181B'} />
            </TouchableOpacity>

            <View style={styles.content}>
                <View style={styles.ticketContainer}>
                    <View style={[styles.ticketSection, styles.ticketTop]}>
                        <View style={styles.header}>
                            <View style={styles.badge}>
                                <RNAnimated.View style={[styles.pulseDot, { opacity: pulseAnim }]} />
                                <Text style={styles.badgeText}>
                                    {isExpired ? 'Sesión expirada' : 'Listo para canjear'}
                                </Text>
                            </View>
                            <View style={styles.businessIconWrap}>
                                <Ticket size={26} color="#fff" />
                            </View>
                            <Text style={styles.title} numberOfLines={2}>
                                {businessName || 'Negocio Asociado'}
                            </Text>
                            {!!bonoTitle && (
                                <Text style={styles.bonoTitle} numberOfLines={1}>{bonoTitle}</Text>
                            )}
                            <Text style={styles.subTitle}>Mostrá el QR en la caja</Text>
                        </View>

                        <View style={styles.creditRow}>
                            <View style={styles.creditCell}>
                                <Text style={styles.creditLabel}>Crédito disponible</Text>
                                <Text style={styles.creditValue}>{formatCurrency(creditRemaining)}</Text>
                                <Text style={styles.creditHint}>de {formatCurrency(creditTotal)}</Text>
                            </View>
                            <View style={styles.creditDivider} />
                            <View style={styles.creditCell}>
                                <Text style={styles.creditLabel}>Usos</Text>
                                <Text style={styles.creditValue}>{usesRemaining}</Text>
                                <Text style={styles.creditHint}>de {usesTotal}</Text>
                            </View>
                        </View>
                        <Text style={styles.paidHint}>
                            Pagaste {formatCurrency(paidAmount)} · vale {formatCurrency(creditTotal)} en el local
                            {validUntil
                                ? `\nVálido hasta ${new Date(validUntil).toLocaleDateString('es-AR', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                  })}`
                                : ''}
                        </Text>
                    </View>

                    <View style={styles.dividerContainer}>
                        <View style={styles.circleLeft} />
                        <View style={styles.dashedLine} />
                        <View style={styles.circleRight} />
                    </View>

                    <View style={[styles.ticketSection, styles.ticketBottom]}>
                        <View style={styles.qrWrapper}>
                            {!isExpired ? (
                                <View style={[styles.qrInner, { width: qrSize, height: qrSize }]}>
                                    <QRCode value={qrData} size={qrSize} color="#09090B" backgroundColor="#FFFFFF" />
                                </View>
                            ) : (
                                <View style={[styles.qrInner, styles.expiredInner, { width: qrSize, height: qrSize }]}>
                                    <AlertCircle size={48} color="#EF4444" />
                                    <Text style={styles.expiredText}>Expirado</Text>
                                </View>
                            )}
                        </View>

                        <Text style={styles.codeLabel}>CÓDIGO DEL QR</Text>
                        <TouchableOpacity
                            style={[styles.codeRow, copied && styles.codeRowCopied]}
                            onPress={handleCopyCode}
                            activeOpacity={0.7}
                            disabled={isExpired}
                            accessibilityRole="button"
                            accessibilityLabel="Copiar código del bono"
                        >
                            <Text style={[styles.codeText, isExpired && { opacity: 0.5 }]} numberOfLines={1}>
                                {finalCode}
                            </Text>
                            {copied ? (
                                <CheckCircle2 size={22} color="#10B981" />
                            ) : (
                                <Copy size={22} color={isDark ? '#A1A1AA' : '#71717A'} />
                            )}
                        </TouchableOpacity>

                        {!isExpired && (
                            <View style={styles.timerRow}>
                                <Clock size={16} color="#D97706" />
                                <Text style={styles.timerText}>Pantalla activa {formatTime(timeLeft)}</Text>
                            </View>
                        )}

                        <View style={styles.securityRow}>
                            <ShieldCheck size={14} color={isDark ? '#71717A' : '#A1A1AA'} />
                            <Text style={styles.securityText}>Código único verificado por Ramgos</Text>
                        </View>
                    </View>
                </View>

                <Text style={styles.bottomDisclaimer}>
                    {brightnessReady
                        ? 'Subimos el brillo para facilitar el escaneo.'
                        : 'Mostrá el código en la caja para canjear tu crédito.'}
                </Text>
            </View>
        </View>
    );
}

function getStyles(isDark: boolean, insets: any) {
    const surface = isDark ? '#18181B' : '#FFFFFF';
    const border = isDark ? '#27272A' : '#E4E4E7';
    const text = isDark ? '#FAFAFA' : '#09090B';
    const muted = isDark ? '#A1A1AA' : '#71717A';
    const canvas = isDark ? '#09090B' : '#FAFAFA';
    const accent = '#2196F3';

    return StyleSheet.create({
        container: { flex: 1 },
        closeBtn: {
            position: 'absolute',
            top: insets.top + 12,
            right: 20,
            width: 44,
            height: 44,
            borderRadius: Radius.xl,
            overflow: 'hidden',
            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.72)',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(9,9,11,0.08)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10,
        },
        content: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingTop: insets.top + 56,
            paddingBottom: Math.max(insets.bottom, 20),
        },
        ticketContainer: {
            width: '100%',
            maxWidth: 360,
            ...glassShadow(isDark),
        },
        ticketSection: {
            backgroundColor: surface,
            padding: 24,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: border,
        },
        ticketTop: {
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderBottomWidth: 0,
            paddingBottom: 20,
        },
        ticketBottom: {
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
            borderTopWidth: 0,
            paddingTop: 28,
        },
        header: { alignItems: 'center', width: '100%' },
        badge: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: Radius.xl,
            marginBottom: 16,
        },
        pulseDot: { width: 8, height: 8, borderRadius: Radius.sm, backgroundColor: '#10B981', marginRight: 8 },
        badgeText: { color: '#10B981', fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
        businessIconWrap: {
            width: 56,
            height: 56,
            borderRadius: Radius.lg,
            backgroundColor: accent,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 12,
        },
        title: {
            fontSize: 22,
            fontWeight: '800',
            color: text,
            textAlign: 'center',
            marginBottom: 4,
        },
        bonoTitle: {
            fontSize: 13,
            fontWeight: '600',
            color: muted,
            marginBottom: 4,
        },
        subTitle: { fontSize: 13, color: muted, fontWeight: '500', marginBottom: 16 },

        creditRow: {
            flexDirection: 'row',
            width: '100%',
            borderRadius: Radius.lg,
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(9,9,11,0.03)',
            paddingVertical: 14,
            marginBottom: 10,
        },
        creditCell: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
        creditDivider: { width: StyleSheet.hairlineWidth, backgroundColor: border },
        creditLabel: { fontSize: 11, fontWeight: '600', color: muted, marginBottom: 4 },
        creditValue: { fontSize: 20, fontWeight: '800', color: text },
        creditHint: { fontSize: 11, fontWeight: '500', color: muted, marginTop: 2 },
        paidHint: {
            fontSize: 12,
            color: muted,
            fontWeight: '500',
            textAlign: 'center',
        },

        dividerContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            height: 1,
            width: '100%',
            backgroundColor: surface,
            position: 'relative',
        },
        dashedLine: {
            flex: 1,
            height: 1,
            borderWidth: 1,
            borderColor: border,
            borderStyle: 'dashed',
            marginHorizontal: 16,
        },
        circleLeft: {
            position: 'absolute',
            left: -12,
            top: -12,
            width: 24,
            height: 24,
            borderRadius: Radius.md,
            backgroundColor: canvas,
        },
        circleRight: {
            position: 'absolute',
            right: -12,
            top: -12,
            width: 24,
            height: 24,
            borderRadius: Radius.md,
            backgroundColor: canvas,
        },

        qrWrapper: {
            padding: 14,
            backgroundColor: '#FFFFFF',
            borderRadius: Radius.xl,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: isDark ? '#E4E4E7' : border,
            alignSelf: 'center',
        },
        qrInner: { justifyContent: 'center', alignItems: 'center' },
        expiredInner: { backgroundColor: '#FEF2F2', borderRadius: Radius.lg },
        expiredText: { marginTop: 12, fontSize: 16, fontWeight: 'bold', color: '#EF4444' },

        codeLabel: {
            fontSize: 11,
            fontWeight: '800',
            color: muted,
            letterSpacing: 1.4,
            marginBottom: 10,
        },
        codeRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(9,9,11,0.03)',
            borderWidth: 1,
            borderColor: border,
            borderRadius: Radius.lg,
            paddingVertical: 14,
            paddingHorizontal: 16,
            marginBottom: 14,
            gap: 10,
        },
        codeRowCopied: {
            borderColor: '#10B981',
            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#ECFDF5',
        },
        codeText: {
            flex: 1,
            fontSize: 15,
            fontWeight: '800',
            color: text,
            letterSpacing: 1.2,
        },
        timerRow: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(217, 119, 6, 0.12)' : '#FFFBEB',
            paddingHorizontal: 16,
            paddingVertical: 9,
            borderRadius: Radius.xl,
            marginBottom: 12,
        },
        timerText: { marginLeft: 8, fontSize: 13, fontWeight: '700', color: '#D97706' },
        securityRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        securityText: { fontSize: 11, color: muted, fontWeight: '500' },

        bottomDisclaimer: {
            marginTop: 24,
            fontSize: 12,
            color: muted,
            textAlign: 'center',
            maxWidth: 280,
            fontWeight: '500',
            lineHeight: 17,
        },
    });
}
