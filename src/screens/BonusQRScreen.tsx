import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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
import {
    X,
    Clock,
    AlertCircle,
    Copy,
    CheckCircle2,
    Ticket,
    ShieldCheck,
    RefreshCw,
} from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildBonoRedeemPayload } from '../utils/bonoDeepLink';

const { width } = Dimensions.get('window');
/** Privacy: hide QR after idle screen session — NOT the bono validity. */
const SCREEN_SESSION_SECONDS = 300;

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

function formatValidUntil(iso?: string): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return '';
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

    const finalCode = typeof bonoCode === 'string' && bonoCode.trim() ? bonoCode.trim() : '';
    const hasRealCode = !!finalCode && !finalCode.startsWith('DEMO-');
    // QR encodes redeem deep link; human-readable BNO-… stays on screen / clipboard
    const qrData = hasRealCode ? buildBonoRedeemPayload(finalCode) : '';
    const qrSize = Math.min(width * 0.52, 210);

    const bonoExpired = useMemo(() => {
        if (!validUntil) return false;
        const t = new Date(validUntil).getTime();
        return Number.isFinite(t) && t < Date.now();
    }, [validUntil]);

    const [sessionLeft, setSessionLeft] = useState(SCREEN_SESSION_SECONDS);
    const [sessionHidden, setSessionHidden] = useState(false);
    const [initialBrightness, setInitialBrightness] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);
    const [brightnessReady, setBrightnessReady] = useState(false);
    const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const pulseAnim = useRef(new RNAnimated.Value(0.4)).current;

    useEffect(() => {
        RNAnimated.loop(
            RNAnimated.sequence([
                RNAnimated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
                RNAnimated.timing(pulseAnim, { toValue: 0.4, duration: 1200, useNativeDriver: true }),
            ]),
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

    const clearSessionTimer = useCallback(() => {
        if (sessionTimerRef.current) {
            clearInterval(sessionTimerRef.current);
            sessionTimerRef.current = null;
        }
    }, []);

    const startScreenSession = useCallback(() => {
        clearSessionTimer();
        setSessionLeft(SCREEN_SESSION_SECONDS);
        setSessionHidden(false);
        sessionTimerRef.current = setInterval(() => {
            setSessionLeft((prev) => {
                if (prev <= 1) {
                    clearSessionTimer();
                    setSessionHidden(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, [clearSessionTimer]);

    useEffect(() => {
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
        if (!bonoExpired && hasRealCode) {
            startScreenSession();
        }

        return () => {
            clearSessionTimer();
            restoreBrightness();
        };
    }, [bonoExpired, hasRealCode, startScreenSession, clearSessionTimer, restoreBrightness]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const handleCopyCode = async () => {
        if (!hasRealCode || bonoExpired) return;
        await Clipboard.setStringAsync(finalCode);
        setCopied(true);
        show('Código copiado al portapapeles', 'success');
        setTimeout(() => setCopied(false), 2000);
    };

    const showQr = hasRealCode && !bonoExpired && !sessionHidden;
    const styles = getStyles(isDark, insets);
    const canvas = isDark ? '#09090B' : '#FAFAFA';
    const validLabel = formatValidUntil(validUntil);

    return (
        <View style={[styles.container, { backgroundColor: canvas }]}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

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
                                    {bonoExpired
                                        ? 'Bono vencido'
                                        : !hasRealCode
                                          ? 'Código no disponible'
                                          : sessionHidden
                                            ? 'QR oculto (privacidad)'
                                            : 'Listo para canjear'}
                                </Text>
                            </View>
                            <View style={styles.businessIconWrap}>
                                <Ticket size={26} color="#fff" />
                            </View>
                            <Text style={styles.title} numberOfLines={2}>
                                {businessName || 'Negocio Asociado'}
                            </Text>
                            {!!bonoTitle && (
                                <Text style={styles.bonoTitle} numberOfLines={1}>
                                    {bonoTitle}
                                </Text>
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
                            {validLabel ? `\nVálido hasta ${validLabel}` : ''}
                        </Text>
                    </View>

                    <View style={styles.dividerContainer}>
                        <View style={styles.circleLeft} />
                        <View style={styles.dashedLine} />
                        <View style={styles.circleRight} />
                    </View>

                    <View style={[styles.ticketSection, styles.ticketBottom]}>
                        <View style={styles.qrWrapper}>
                            {showQr ? (
                                <View style={[styles.qrInner, { width: qrSize, height: qrSize }]}>
                                    <QRCode value={qrData} size={qrSize} color="#09090B" backgroundColor="#FFFFFF" />
                                </View>
                            ) : (
                                <View style={[styles.qrInner, styles.expiredInner, { width: qrSize, height: qrSize }]}>
                                    <AlertCircle size={48} color={bonoExpired ? '#EF4444' : '#F59E0B'} />
                                    <Text style={styles.expiredText}>
                                        {bonoExpired
                                            ? 'Vencido'
                                            : !hasRealCode
                                              ? 'Sin código'
                                              : 'Oculto'}
                                    </Text>
                                    {sessionHidden && !bonoExpired && hasRealCode ? (
                                        <TouchableOpacity
                                            style={styles.reshowBtn}
                                            onPress={startScreenSession}
                                            accessibilityRole="button"
                                            accessibilityLabel="Mostrar QR de nuevo"
                                        >
                                            <RefreshCw size={16} color="#fff" />
                                            <Text style={styles.reshowBtnText}>Mostrar QR de nuevo</Text>
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            )}
                        </View>

                        <Text style={styles.codeLabel}>CÓDIGO DEL QR</Text>
                        <TouchableOpacity
                            style={[styles.codeRow, copied && styles.codeRowCopied]}
                            onPress={handleCopyCode}
                            activeOpacity={0.7}
                            disabled={!showQr}
                            accessibilityRole="button"
                            accessibilityLabel="Copiar código del bono"
                        >
                            <Text style={[styles.codeText, !showQr && { opacity: 0.5 }]} numberOfLines={1}>
                                {hasRealCode ? finalCode : '—'}
                            </Text>
                            {copied ? (
                                <CheckCircle2 size={22} color="#10B981" />
                            ) : (
                                <Copy size={22} color={isDark ? '#A1A1AA' : '#71717A'} />
                            )}
                        </TouchableOpacity>

                        {showQr && (
                            <View style={styles.timerRow}>
                                <Clock size={16} color="#D97706" />
                                <Text style={styles.timerText}>
                                    Sesión de pantalla {formatTime(sessionLeft)} · no es la vigencia del bono
                                </Text>
                            </View>
                        )}

                        <View style={styles.securityRow}>
                            <ShieldCheck size={14} color={isDark ? '#71717A' : '#A1A1AA'} />
                            <Text style={styles.securityText}>
                                {validLabel
                                    ? `Vigencia del bono hasta ${validLabel}`
                                    : 'Código único verificado por Ramgos'}
                            </Text>
                        </View>
                    </View>
                </View>

                <Text style={styles.bottomDisclaimer}>
                    {!hasRealCode
                        ? 'Abrí este QR desde Historial → Usar bono (compras reales).'
                        : brightnessReady
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
            zIndex: 20,
            width: 44,
            height: 44,
            borderRadius: 22,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        },
        content: {
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: 20,
            paddingTop: insets.top + 48,
            paddingBottom: insets.bottom + 24,
        },
        ticketContainer: {
            borderRadius: 24,
            overflow: 'hidden',
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: border,
        },
        ticketSection: { padding: 22 },
        ticketTop: { paddingBottom: 8 },
        ticketBottom: { alignItems: 'center', paddingTop: 8 },
        header: { alignItems: 'center', marginBottom: 16 },
        badge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: isDark ? 'rgba(33,150,243,0.15)' : '#E3F2FD',
            marginBottom: 14,
        },
        pulseDot: {
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: accent,
        },
        badgeText: {
            fontSize: 12,
            fontWeight: '700',
            color: accent,
            letterSpacing: 0.2,
        },
        businessIconWrap: {
            width: 52,
            height: 52,
            borderRadius: 16,
            backgroundColor: accent,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 10,
        },
        title: {
            fontSize: 22,
            fontWeight: '800',
            color: text,
            textAlign: 'center',
        },
        bonoTitle: {
            marginTop: 4,
            fontSize: 14,
            fontWeight: '600',
            color: muted,
            textAlign: 'center',
        },
        subTitle: {
            marginTop: 6,
            fontSize: 13,
            color: muted,
            textAlign: 'center',
        },
        creditRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 8,
            paddingVertical: 12,
            borderRadius: 16,
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F4F4F5',
        },
        creditCell: { flex: 1, alignItems: 'center' },
        creditDivider: {
            width: 1,
            height: 40,
            backgroundColor: border,
        },
        creditLabel: { fontSize: 11, color: muted, marginBottom: 4, fontWeight: '600' },
        creditValue: { fontSize: 22, fontWeight: '800', color: text },
        creditHint: { fontSize: 11, color: muted, marginTop: 2 },
        paidHint: {
            marginTop: 12,
            fontSize: 13,
            lineHeight: 18,
            color: muted,
            textAlign: 'center',
        },
        dividerContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            height: 24,
            backgroundColor: canvas,
        },
        circleLeft: {
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: canvas,
            marginLeft: -12,
            borderWidth: 1,
            borderColor: border,
        },
        circleRight: {
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: canvas,
            marginRight: -12,
            borderWidth: 1,
            borderColor: border,
        },
        dashedLine: {
            flex: 1,
            height: 1,
            borderStyle: 'dashed',
            borderWidth: 1,
            borderColor: border,
        },
        qrWrapper: {
            padding: 12,
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            marginBottom: 16,
            borderWidth: 1,
            borderColor: border,
        },
        qrInner: { justifyContent: 'center', alignItems: 'center' },
        expiredInner: {
            backgroundColor: isDark ? '#18181B' : '#FAFAFA',
            borderRadius: 12,
            gap: 8,
            padding: 12,
        },
        expiredText: {
            fontSize: 16,
            fontWeight: '800',
            color: muted,
        },
        reshowBtn: {
            marginTop: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: accent,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 12,
        },
        reshowBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
        codeLabel: {
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1,
            color: muted,
            marginBottom: 8,
        },
        codeRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            maxWidth: '100%',
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F4F4F5',
            borderWidth: 1,
            borderColor: border,
            marginBottom: 12,
        },
        codeRowCopied: {
            borderColor: '#10B981',
        },
        codeText: {
            flex: 1,
            fontSize: 14,
            fontWeight: '700',
            color: text,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        },
        timerRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 10,
            paddingHorizontal: 8,
        },
        timerText: {
            fontSize: 11,
            fontWeight: '600',
            color: '#D97706',
            flexShrink: 1,
        },
        securityRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        securityText: {
            fontSize: 11,
            color: muted,
            flexShrink: 1,
            textAlign: 'center',
        },
        bottomDisclaimer: {
            marginTop: 18,
            textAlign: 'center',
            fontSize: 12,
            color: muted,
            lineHeight: 17,
            paddingHorizontal: 12,
        },
    });
}
