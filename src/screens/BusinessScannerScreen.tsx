import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Dimensions, Animated, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { X, CheckCircle, AlertTriangle, Search } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const { width } = Dimensions.get('window');

export default function BusinessScannerScreen() {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { user } = useAuth();

    const [inputCode, setInputCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<'success' | 'error' | null>(null);
    const [resultMessage, setResultMessage] = useState<string>('');

    // Scanner animation
    const [scanAnim] = useState(new Animated.Value(0));

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(scanAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
                Animated.timing(scanAnim, { toValue: 0, duration: 2000, useNativeDriver: true })
            ])
        ).start();
    }, []);

    const _api = api as any;
    const redeemBonoMutation = useMutation(_api.bonos?.redeemBono as any);

    const handleValidate = async () => {
        const trimmed = inputCode.trim().toUpperCase();
        if (!trimmed) return;

        setLoading(true);

        try {
            await redeemBonoMutation({
                bonoCode: trimmed,
                actorId: user?.id,
            });

            setLoading(false);
            setResult('success');
            setResultMessage('Canje confirmado. El pago se libera automáticamente.');
        } catch (e: any) {
            setLoading(false);
            setResult('error');
            setResultMessage(e?.message || 'No se pudo validar el bono.');
        }
    };

    const resetScanner = () => {
        setInputCode('');
        setResult(null);
        setResultMessage('');
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: Math.max(16, insets.top + 12) }]}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
                    <X size={24} color={isDark ? "#fff" : "#111827"} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Validar Bono</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.content}>
                {/* Simulated Scanner */}
                {!result && !loading && (
                    <View style={styles.simulatorContainer}>
                        <View style={styles.scannerBox}>
                            <Animated.View style={[styles.laser, {
                                transform: [{ translateY: scanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 200] }) }]
                            }]} />
                            <Text style={styles.simText}>Simulador de Escáner</Text>
                        </View>
                        <Text style={styles.instructionText}>
                            Pide al cliente que te dicte su código único.
                        </Text>
                    </View>
                )}

                {/* Input Field */}
                {!result && !loading && (
                    <View style={styles.inputSection}>
                        <TextInput
                            style={styles.input}
                            placeholder="EJ: BNO-1234-ABCD"
                            placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                            value={inputCode}
                            onChangeText={setInputCode}
                            autoCapitalize="characters"
                        />
                        <TouchableOpacity style={styles.btn} onPress={handleValidate}>
                            <Search size={20} color="#fff" />
                            <Text style={styles.btnText}>Validar Código</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Loading State */}
                {loading && (
                    <View style={styles.centerBox}>
                        <ActivityIndicator size="large" color="#3B82F6" />
                        <Text style={styles.loadingText}>Validando bono...</Text>
                    </View>
                )}

                {/* Result Message */}
                {result && (
                    <View style={styles.centerBox}>
                        {result === 'success' ? (
                            <>
                                <CheckCircle size={80} color="#10B981" />
                                <Text style={[styles.resultTitle, { color: '#10B981' }]}>Bono Válido</Text>
                                <Text style={styles.resultSub}>{resultMessage}</Text>
                            </>
                        ) : (
                            <>
                                <AlertTriangle size={80} color="#EF4444" />
                                <Text style={[styles.resultTitle, { color: '#EF4444' }]}>Error de Validación</Text>
                                <Text style={styles.resultSub}>{resultMessage}</Text>
                            </>
                        )}
                        <TouchableOpacity style={styles.resetBtn} onPress={resetScanner}>
                            <Text style={styles.resetBtnText}>Validar otro código</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </KeyboardAvoidingView>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
    headerTitle: { color: isDark ? '#F9FAFB' : '#111827', fontSize: 20, fontWeight: 'bold' },
    iconBtn: { padding: 8, backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderRadius: 20 },
    
    content: { flex: 1, padding: 24, justifyContent: 'center' },
    
    simulatorContainer: { alignItems: 'center', marginBottom: 40 },
    scannerBox: {
        width: 200, height: 200, 
        borderWidth: 2, borderColor: '#3B82F6', borderRadius: 24, 
        backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
        overflow: 'hidden', justifyContent: 'center', alignItems: 'center'
    },
    laser: { width: '100%', height: 3, backgroundColor: '#EF4444', position: 'absolute', top: 0 },
    simText: { color: isDark ? '#64748B' : '#94A3B8', fontWeight: 'bold' },
    instructionText: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 16, marginTop: 24, textAlign: 'center' },

    inputSection: { width: '100%' },
    input: {
        backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
        borderWidth: 2, borderColor: isDark ? '#334155' : '#E2E8F0',
        borderRadius: 16, padding: 20, fontSize: 24, color: isDark ? '#F8FAFC' : '#0F172A',
        textAlign: 'center', letterSpacing: 4, fontWeight: 'bold', marginBottom: 20,
    },
    btn: {
        backgroundColor: '#3B82F6', borderRadius: 16, padding: 20,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12
    },
    btnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

    centerBox: { alignItems: 'center', justifyContent: 'center', padding: 24 },
    loadingText: { color: isDark ? '#F8FAFC' : '#111827', marginTop: 16, fontSize: 18, fontWeight: '600' },
    
    resultTitle: { fontSize: 28, fontWeight: 'bold', marginTop: 24, marginBottom: 8, textAlign: 'center' },
    resultSub: { fontSize: 16, color: isDark ? '#94A3B8' : '#475569', textAlign: 'center', marginBottom: 32 },
    resetBtn: {
        backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
        paddingVertical: 16, paddingHorizontal: 32, borderRadius: 16
    },
    resetBtnText: { color: isDark ? '#F8FAFC' : '#111827', fontSize: 16, fontWeight: 'bold' },
});
