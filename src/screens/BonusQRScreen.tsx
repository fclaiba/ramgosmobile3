import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated, Platform } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Brightness from 'expo-brightness';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import { X, Clock, AlertCircle, Copy, CheckCircle2 } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';

const { width, height } = Dimensions.get('window');

export default function BonusQRScreen() {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { user } = useAuth();
    const { bonusId, businessName, bonoCode } = route.params || {};

    const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
    const [initialBrightness, setInitialBrightness] = useState<number | null>(null);
    const { show } = useToast();
    const [copied, setCopied] = useState(false);

    const finalCode = bonoCode || bonusId || 'DEMO-CODE-123';
    const qrData = finalCode;
    const qrSize = Math.min(width * 0.55, 220);

    const pulseAnim = useRef(new Animated.Value(0.4)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 0.4, duration: 1200, useNativeDriver: true })
            ])
        ).start();
    }, []);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        const setMaxBrightness = async () => {
            try {
                const { status } = await Brightness.requestPermissionsAsync();
                if (status === 'granted') {
                    const cur = await Brightness.getBrightnessAsync();
                    setInitialBrightness(cur);
                    await Brightness.setBrightnessAsync(1.0);
                }
            } catch (error) {
                console.warn("Could not set brightness", error);
            }
        };

        setMaxBrightness();

        timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            clearInterval(timer);
            if (initialBrightness !== null) {
                Brightness.setBrightnessAsync(initialBrightness).catch(() => { });
            }
        };
    }, [initialBrightness]);

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

    return (
        <View style={styles.container}>

            <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
                <X size={24} color="#fff" />
            </TouchableOpacity>

            <View style={styles.ticketContainer}>
                {/* Top Section */}
                <View style={[styles.ticketSection, styles.ticketTop]}>
                    <View style={styles.header}>
                        <View style={styles.badge}>
                            <Animated.View style={[styles.pulseDot, { opacity: pulseAnim }]} />
                            <Text style={styles.badgeText}>Listo para canjear</Text>
                        </View>
                        <Text style={styles.title} numberOfLines={1}>{businessName || 'Negocio Asociado'}</Text>
                        <Text style={styles.subTitle}>Muestra este ticket en la caja</Text>
                    </View>
                </View>

                {/* Ticket Divider */}
                <View style={styles.dividerContainer}>
                    <View style={styles.dashedLine} />
                </View>

                {/* Bottom Section */}
                <View style={[styles.ticketSection, styles.ticketBottom]}>
                    <View style={styles.qrWrapper}>
                        {timeLeft > 0 ? (
                            <View style={[styles.qrInner, { width: qrSize, height: qrSize }]}>
                                <QRCode value={qrData} size={qrSize} color="#000" backgroundColor="#fff" />
                            </View>
                        ) : (
                            <View style={[styles.qrInner, styles.expiredInner]}>
                                <AlertCircle size={48} color="#EF4444" />
                                <Text style={styles.expiredText}>Expirado</Text>
                            </View>
                        )}
                    </View>

                    <Text style={styles.codeLabel}>CÓDIGO ÚNICO</Text>
                    <TouchableOpacity 
                        style={[styles.codeRow, copied && styles.codeRowCopied]} 
                        onPress={handleCopyCode}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.codeText}>{finalCode}</Text>
                        {copied ? <CheckCircle2 size={22} color="#10B981" /> : <Copy size={22} color={isDark ? "#9CA3AF" : "#6B7280"} />}
                    </TouchableOpacity>

                    {timeLeft > 0 && (
                        <View style={styles.timerRow}>
                            <Clock size={16} color="#F59E0B" />
                            <Text style={styles.timerText}>Expira en {formatTime(timeLeft)}</Text>
                        </View>
                    )}
                </View>
            </View>

            <Text style={styles.bottomDisclaimer}>
                El brillo de tu pantalla se subió automáticamente para facilitar el escaneo.
            </Text>
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: isDark ? '#0F172A' : '#3B82F6' },
    closeBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, right: 24, padding: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 24, zIndex: 10 },
    
    ticketContainer: { width: '100%', maxWidth: 360, alignSelf: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.25, shadowRadius: 30, elevation: 15 },
    
    ticketSection: { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', padding: 24, alignItems: 'center' },
    ticketTop: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 },
    ticketBottom: { borderBottomLeftRadius: 24, borderBottomRightRadius: 24, paddingTop: 32 },

    header: { alignItems: 'center', width: '100%' },
    badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 16 },
    pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginRight: 8 },
    badgeText: { color: '#10B981', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    title: { fontSize: 26, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A', textAlign: 'center', marginBottom: 4 },
    subTitle: { fontSize: 14, color: isDark ? '#94A3B8' : '#64748B' },

    dividerContainer: { flexDirection: 'row', alignItems: 'center', height: 1, width: '100%', backgroundColor: isDark ? '#1E293B' : '#FFFFFF', zIndex: 1 },
    dashedLine: { flex: 1, height: 1, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0', borderStyle: 'dashed', marginHorizontal: 20 },

    qrWrapper: { padding: 16, backgroundColor: '#fff', borderRadius: 24, marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, alignSelf: 'center' },
    qrInner: { justifyContent: 'center', alignItems: 'center' },
    expiredInner: { backgroundColor: '#FEF2F2', borderRadius: 16 },
    expiredText: { marginTop: 12, fontSize: 18, fontWeight: 'bold', color: '#EF4444' },

    codeLabel: { fontSize: 11, fontWeight: '700', color: isDark ? '#64748B' : '#94A3B8', letterSpacing: 1.5, marginBottom: 8 },
    codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 20, marginBottom: 20 },
    codeRowCopied: { borderColor: '#10B981', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#ECFDF5' },
    codeText: { fontSize: 22, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A', letterSpacing: 3 },

    timerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(245, 158, 11, 0.1)' : '#FFFBEB', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    timerText: { marginLeft: 8, fontSize: 13, fontWeight: '700', color: '#F59E0B' },

    bottomDisclaimer: { marginTop: 32, fontSize: 12, color: 'rgba(255,255,255,0.6)', textAlign: 'center', maxWidth: 280 },
});
