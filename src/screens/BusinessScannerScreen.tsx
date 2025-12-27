import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { X, Zap, CheckCircle, AlertTriangle } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export default function BusinessScannerScreen() {
    const navigation = useNavigation<any>();
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<'success' | 'error' | null>(null);
    const [torchOn, setTorchOn] = useState(false);

    // Function to handle successful scan
    const handleBarCodeScanned = async ({ type, data }: any) => {
        if (scanned || loading) return;

        setScanned(true);
        setLoading(true);

        try {
            // Simulate backend validation
            console.log('Scanned Data:', data);
            let parsedData;
            try {
                parsedData = JSON.parse(data);
            } catch {
                // If it's not JSON, assume invalid
                throw new Error("Invalid Format");
            }

            setTimeout(() => {
                setLoading(false);

                // Mock validation logic
                // If the QR is a valid bonus redemption format
                if (parsedData && parsedData.type === 'bonus_redemption') {
                    // Check if not expired (mock: if created more than 5 mins ago, invalid)
                    const now = new Date().getTime();
                    if (parsedData.validUntil && now > parsedData.validUntil) {
                        setResult('error'); // Expired
                        return;
                    }
                    setResult('success');
                } else {
                    setResult('error'); // Invalid format
                }
            }, 1500);

        } catch (e) {
            setLoading(false);
            setResult('error');
        }
    };

    const resetScanner = () => {
        setScanned(false);
        setResult(null);
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
            <View style={styles.overlay}>
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
                                <Text style={styles.resultTitle}>Bono Válido</Text>
                                <Text style={styles.resultSub}>Descuento del 20% autorizado</Text>
                                <TouchableOpacity style={styles.confirmBtn} onPress={resetScanner}>
                                    <Text style={styles.confirmBtnText}>Confirmar Canje</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <AlertTriangle size={64} color="#fff" />
                                <Text style={styles.resultTitle}>QR Inválido</Text>
                                <Text style={styles.resultSub}>El código expiró o no es válido</Text>
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

    overlay: { position: 'absolute', inset: 0, justifyContent: 'space-between', padding: 20, paddingTop: 50 },
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
        position: 'absolute', top: '25%', left: 20, right: 20,
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
