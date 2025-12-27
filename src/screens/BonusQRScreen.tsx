import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Brightness from 'expo-brightness';
import { useNavigation, useRoute } from '@react-navigation/native';
import { X, Clock, AlertCircle } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';

const { width } = Dimensions.get('window');

export default function BonusQRScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { user } = useAuth();
    const { bonusId, businessName } = route.params || {};

    const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
    const [initialBrightness, setInitialBrightness] = useState<number | null>(null);

    // QR Data Payload
    const qrData = JSON.stringify({
        type: 'bonus_redemption',
        bonusId: bonusId || 'demo_bonus',
        userId: user?.id || 'guest',
        timestamp: new Date().getTime(),
        validUntil: new Date().getTime() + 1000 * 60 * 5 // 5 mins
    });

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
            // Restore brightness
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

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
                    <X size={24} color="#374151" />
                </TouchableOpacity>

                <View style={styles.header}>
                    <Text style={styles.subTitle}>Canjeando en</Text>
                    <Text style={styles.title}>{businessName || 'Negocio'}</Text>
                </View>

                <View style={styles.qrCard}>
                    {timeLeft > 0 ? (
                        <>
                            <View style={styles.qrContainer}>
                                <QRCode
                                    value={qrData}
                                    size={width * 0.6}
                                    color="black"
                                    backgroundColor="white"
                                />
                            </View>
                            <Text style={styles.scanText}>Muestra este código al cajero</Text>
                        </>
                    ) : (
                        <View style={[styles.qrContainer, styles.expiredContainer]}>
                            <AlertCircle size={48} color="#EF4444" />
                            <Text style={styles.expiredText}>Código Expirado</Text>
                        </View>
                    )}
                </View>

                {timeLeft > 0 && (
                    <View style={styles.timerContainer}>
                        <Clock size={20} color="#F59E0B" />
                        <Text style={styles.timerText}>Expira en {formatTime(timeLeft)}</Text>
                    </View>
                )}

                <View style={styles.infoBox}>
                    <Text style={styles.infoText}>
                        El brillo de tu pantalla se subió automáticamente para facilitar el escaneo.
                    </Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', padding: 20 },
    content: { backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center' },

    closeBtn: { position: 'absolute', top: 16, right: 16, padding: 8, backgroundColor: '#F3F4F6', borderRadius: 20 },

    header: { alignItems: 'center', marginBottom: 32, marginTop: 16 },
    subTitle: { fontSize: 14, color: '#6B7280', marginBottom: 4 },
    title: { fontSize: 24, fontWeight: 'bold', color: '#111827', textAlign: 'center' },

    qrCard: { alignItems: 'center', marginBottom: 24 },
    qrContainer: { padding: 20, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, marginBottom: 16 },
    scanText: { fontSize: 16, fontWeight: '600', color: '#374151' },

    expiredContainer: { width: width * 0.6, height: width * 0.6, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FEF2F2' },
    expiredText: { marginTop: 12, fontSize: 18, fontWeight: 'bold', color: '#EF4444' },

    timerContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, marginBottom: 24 },
    timerText: { color: '#B45309', fontWeight: 'bold', fontSize: 14 },

    infoBox: { backgroundColor: '#F3F4F6', padding: 12, borderRadius: 12, width: '100%' },
    infoText: { fontSize: 12, color: '#6B7280', textAlign: 'center' },
});
