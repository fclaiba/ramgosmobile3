import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { X, CheckCircle, AlertTriangle, Search, Camera as CameraIcon, Keyboard } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';

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
    const [isManualMode, setIsManualMode] = useState(false);

    const [permission, requestPermission] = useCameraPermissions();

    const _api = api as any;
    const redeemBonoMutation = useMutation(_api.bonos?.redeemBono as any);

    const handleValidate = async (codeToValidate?: string) => {
        const code = codeToValidate || inputCode;
        const trimmed = code.trim().toUpperCase();
        if (!trimmed || loading) return;

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

    const handleBarCodeScanned = ({ type, data }: { type: string, data: string }) => {
        if (!loading && !result) {
            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            }
            handleValidate(data);
        }
    };

    const resetScanner = () => {
        setInputCode('');
        setResult(null);
        setResultMessage('');
    };

    const toggleMode = () => {
        setIsManualMode(!isManualMode);
        resetScanner();
    };

    if (!permission) {
        return <View style={styles.container} />;
    }

    if (!permission.granted && !isManualMode) {
        return (
            <View style={[styles.container, styles.centerBox]}>
                <AlertTriangle size={64} color="#F59E0B" />
                <Text style={styles.loadingText}>Permiso de Cámara Denegado</Text>
                <Text style={styles.instructionText}>Necesitamos acceso a tu cámara para escanear el QR.</Text>
                <TouchableOpacity style={[styles.btn, { marginTop: 20 }]} onPress={requestPermission}>
                    <Text style={styles.btnText}>Conceder Permiso</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.resetBtn, { marginTop: 20 }]} onPress={toggleMode}>
                    <Text style={styles.resetBtnText}>Ingresar código manualmente</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.resetBtn, { marginTop: 20 }]} onPress={() => navigation.goBack()}>
                    <Text style={styles.resetBtnText}>Volver</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: Math.max(16, insets.top + 12) }]}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
                    <X size={24} color={isDark ? "#fff" : "#111827"} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Validar Bono</Text>
                <TouchableOpacity style={styles.iconBtn} onPress={toggleMode}>
                    {isManualMode ? <CameraIcon size={24} color={isDark ? "#fff" : "#111827"} /> : <Keyboard size={24} color={isDark ? "#fff" : "#111827"} />}
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                {!result && !loading && !isManualMode && (
                    <View style={styles.cameraContainer}>
                        <CameraView
                            style={styles.camera}
                            facing="back"
                            onBarcodeScanned={handleBarCodeScanned}
                            barcodeScannerSettings={{
                                barcodeTypes: ["qr"],
                            }}
                        />
                        <View style={styles.overlay}>
                            <View style={styles.scanTarget} />
                        </View>
                        <Text style={styles.instructionText}>
                            Apunta la cámara al código QR del cliente.
                        </Text>
                    </View>
                )}

                {/* Manual Input Field */}
                {!result && !loading && isManualMode && (
                    <View style={styles.inputSection}>
                        <Text style={[styles.instructionText, { marginBottom: 20 }]}>
                            Pide al cliente que te dicte su código único.
                        </Text>
                        <TextInput
                            style={styles.input}
                            placeholder="EJ: BNO-1234-ABCD"
                            placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                            value={inputCode}
                            onChangeText={setInputCode}
                            autoCapitalize="characters"
                        />
                        <TouchableOpacity style={styles.btn} onPress={() => handleValidate()}>
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
    
    cameraContainer: { alignItems: 'center', flex: 1, width: '100%' },
    camera: {
        width: width * 0.8,
        height: width * 0.8,
        borderRadius: 24,
        overflow: 'hidden',
        marginBottom: 24,
    },
    overlay: {
        position: 'absolute',
        top: 0,
        width: width * 0.8,
        height: width * 0.8,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
    },
    scanTarget: {
        width: '70%',
        height: '70%',
        borderWidth: 2,
        borderColor: '#3B82F6',
        backgroundColor: 'transparent',
        borderRadius: 16,
    },
    
    instructionText: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 16, textAlign: 'center', paddingHorizontal: 20 },

    inputSection: { width: '100%', justifyContent: 'center', flex: 1 },
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

    centerBox: { alignItems: 'center', justifyContent: 'center', padding: 24, flex: 1 },
    loadingText: { color: isDark ? '#F8FAFC' : '#111827', marginTop: 16, fontSize: 18, fontWeight: '600' },
    
    resultTitle: { fontSize: 28, fontWeight: 'bold', marginTop: 24, marginBottom: 8, textAlign: 'center' },
    resultSub: { fontSize: 16, color: isDark ? '#94A3B8' : '#475569', textAlign: 'center', marginBottom: 32 },
    resetBtn: {
        backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
        paddingVertical: 16, paddingHorizontal: 32, borderRadius: 16
    },
    resetBtnText: { color: isDark ? '#F8FAFC' : '#111827', fontSize: 16, fontWeight: 'bold' },
});
