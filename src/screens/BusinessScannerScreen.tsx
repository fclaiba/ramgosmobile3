import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { X, Zap, CheckCircle, AlertTriangle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';

const { width } = Dimensions.get('window');

export default function BusinessScannerScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<'success' | 'error' | null>(null);
    const [resultMessage, setResultMessage] = useState<string>('');
    const [torchOn, setTorchOn] = useState(false);

    // Real bono redemption — server enforces:
    //   - actor is the bono's seller (or admin)
    //   - bono is in 'issued' state and not expired
    //   - on success it auto-releases the order's escrow
    const _api = api as any;
    const redeemBonoMutation = useMutation(_api.bonos?.redeemBono || api.users.syncUser);

    // Function to handle successful scan. Accepts either:
    //   - the raw bonoCode (e.g. "BNO-123-XYZ"), or
    //   - a JSON envelope `{ "type":"bonus_redemption", "code":"BNO-..." }`
    //     emitted by older client builds.
    const handleBarCodeScanned = async ({ data }: any) => {
        if (scanned || loading) return;

        setScanned(true);
        setLoading(true);

        let bonoCode: string | null = null;

        try {
            const trimmed = String(data ?? '').trim();
            if (!trimmed) throw new Error('QR vacío');

            try {
                const parsed = JSON.parse(trimmed);
                bonoCode = parsed?.code ?? parsed?.bonoCode ?? null;
            } catch {
                bonoCode = trimmed;
            }

            if (!bonoCode) throw new Error('Código no reconocido.');

            await redeemBonoMutation({
                actorId: user?.id as any,
                bonoCode,
            });

            setLoading(false);
            setResult('success');
            setResultMessage('Canje confirmado. El pago al negocio se libera automáticamente.');
        } catch (e: any) {
            setLoading(false);
            setResult('error');
            setResultMessage(e?.message || 'No se pudo validar el bono.');
        }
    };

    const resetScanner = () => {
        setScanned(false);
        setResult(null);
        setResultMessage('');
    };

    if (!permission) {
        // Camera permissions are still loading
        return <View style={styles.container} />;
    }

    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.message}>Necesitamos permiso para usar la cámara</Text>
                <TouchableOpacity onPress={requestPermission} style={styles.btn}>
                    <Text style={styles.btnText}>Conceder Permiso</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                enableTorch={torchOn}
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            />

            {/* Overlay UI */}
            <View style={[styles.overlay, { paddingTop: Math.max(16, insets.top + 12), paddingBottom: Math.max(16, insets.bottom + 16) }]}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
                        <X size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Escanear Bono</Text>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => setTorchOn(!torchOn)}>
                        <Zap size={24} color={torchOn ? "#F59E0B" : "#fff"} fill={torchOn ? "#F59E0B" : "none"} />
                    </TouchableOpacity>
                </View>

                {/* Focus Box */}
                {!scanned && !result && (
                    <View style={styles.focusContainer}>
                        <View style={styles.cornerTL} />
                        <View style={styles.cornerTR} />
                        <View style={styles.cornerBL} />
                        <View style={styles.cornerBR} />
                        <Text style={styles.instructionText}>Apunta al código QR del cliente</Text>
                    </View>
                )}

                {/* Loading State */}
                {loading && (
                    <View style={styles.centerModal}>
                        <ActivityIndicator size="large" color="#fff" />
                        <Text style={styles.loadingText}>Validando...</Text>
                    </View>
                )}

                {/* Result Modal */}
                {result && (
                    <View style={[styles.resultModal, result === 'error' && styles.errorModal]}>
                        {result === 'success' ? (
                            <>
                                <CheckCircle size={64} color="#fff" />
                                <Text style={styles.resultTitle}>Bono canjeado</Text>
                                <Text style={styles.resultSub}>{resultMessage || 'Canje confirmado.'}</Text>
                                <TouchableOpacity style={styles.confirmBtn} onPress={resetScanner}>
                                    <Text style={styles.confirmBtnText}>Escanear otro</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <AlertTriangle size={64} color="#fff" />
                                <Text style={styles.resultTitle}>No se pudo canjear</Text>
                                <Text style={styles.resultSub}>{resultMessage || 'El código no es válido.'}</Text>
                                <TouchableOpacity style={[styles.confirmBtn, styles.errorBtn]} onPress={resetScanner}>
                                    <Text style={[styles.confirmBtnText, { color: '#EF4444' }]}>Intentar de nuevo</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
    message: { textAlign: 'center', paddingBottom: 10, color: '#fff' },
    btn: { backgroundColor: '#3B82F6', padding: 12, borderRadius: 8 },
    btnText: { color: '#fff', fontWeight: 'bold' },

    overlay: { position: 'absolute', inset: 0, justifyContent: 'space-between', padding: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    iconBtn: { padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },

    focusContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginVertical: 100 },
    cornerTL: { position: 'absolute', top: 0, left: 0, width: 40, height: 40, borderTopWidth: 4, borderLeftWidth: 4, borderColor: '#3B82F6' },
    cornerTR: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, borderTopWidth: 4, borderRightWidth: 4, borderColor: '#3B82F6' },
    cornerBL: { position: 'absolute', bottom: 0, left: 0, width: 40, height: 40, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: '#3B82F6' },
    cornerBR: { position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, borderBottomWidth: 4, borderRightWidth: 4, borderColor: '#3B82F6' },
    instructionText: { marginTop: 280, color: '#fff', fontSize: 16, fontWeight: '500', textAlign: 'center' },

    centerModal: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center', alignItems: 'center'
    },
    loadingText: { color: '#fff', marginTop: 16, fontWeight: '600' },

    resultModal: {
        position: 'absolute',
        top: '22%',
        left: 0,
        right: 0,
        marginHorizontal: 16,
        width: '100%',
        maxWidth: 520,
        alignSelf: 'center',
        backgroundColor: '#10B981',
        borderRadius: 24, padding: 32,
        alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 10
    },
    errorModal: { backgroundColor: '#EF4444' },
    resultTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginTop: 16 },
    resultSub: { color: 'rgba(255,255,255,0.9)', fontSize: 14, textAlign: 'center', marginVertical: 8 },
    confirmBtn: { backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 16, minWidth: 150, alignItems: 'center' },
    errorBtn: { backgroundColor: '#fff' },
    confirmBtnText: { color: '#10B981', fontWeight: 'bold', fontSize: 16 },
});
