import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Camera, CheckCircle, AlertTriangle, Building, User } from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { useBusiness, RedeemResult } from '../../contexts/BusinessContext';
import { useToast } from '../../contexts/ToastContext';
import { CodeVerificationCard } from '../../components/business/CodeVerificationCard';

export default function BusinessQRScannerScreen({ navigation }: any) {
    const { coupons, redeemCouponByCode, branches } = useBusiness();
    const { show } = useToast();
    const [scannedPayload, setScannedPayload] = useState<{ code: string; user: string } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<RedeemResult | null>(null);
    const [selectedBranch, setSelectedBranch] = useState<string>(branches[0]?.id ?? '');

    const activeCoupons = useMemo(() => coupons.filter((coupon) => coupon.status === 'active'), [coupons]);

    const mockUsers = useMemo(
        () => ['cliente_mgarcia', 'cliente_jperez', 'cliente_lrojas', 'cliente_rsanchez'],
        []
    );

    const handleSimulateScan = () => {
        if (!activeCoupons.length) {
            show('Sin bonos activos: Primero crea o activa un bono.', 'info');
            return;
        }
        const randomCoupon = activeCoupons[Math.floor(Math.random() * activeCoupons.length)];
        const randomUser = mockUsers[Math.floor(Math.random() * mockUsers.length)];
        setIsProcessing(true);
        setResult(null);
        setScannedPayload(null);
        setIsProcessing(true);
        setTimeout(() => {
            setScannedPayload({ code: randomCoupon.code, user: randomUser });
            setIsProcessing(false);
        }, 1500);
    };

    const handleReset = () => {
        setScannedPayload(null);
        setResult(null);
    };

    const handleValidate = () => {
        if (!scannedPayload) {
            return;
        }
        const branchId = selectedBranch || branches[0]?.id;
        if (!branchId) {
            show('Selecciona una sucursal para continuar.', 'info');
            return;
        }
        setIsProcessing(true);
        setTimeout(() => {
            const outcome = redeemCouponByCode(scannedPayload.code, scannedPayload.user, branchId);
            setResult(outcome);
            setIsProcessing(false);
        }, 700);
    };

    return (
        <View style={styles.container}>
            <MobileHeader title="Escanear QR" backButton onBack={() => navigation.goBack()} />

            <View style={styles.body}>
                <View style={styles.branchSelector}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Building size={16} color="#0f172a" />
                        <Text style={styles.branchLabel}>Sucursal asignada</Text>
                    </View>
                    <View style={styles.branchChips}>
                        {branches.map((branch) => {
                            const isActive = branch.id === selectedBranch;
                            return (
                                <TouchableOpacity
                                    key={branch.id}
                                    style={[styles.branchChip, isActive && styles.branchChipActive]}
                                    onPress={() => setSelectedBranch(branch.id)}
                                >
                                    <Text style={[styles.branchChipText, isActive && styles.branchChipTextActive]}>
                                        {branch.name}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {!scannedPayload ? (
                    <View style={styles.cameraPlaceholder}>
                        <Text style={styles.instructions}>Apunta el código QR del bono hacia el recuadro</Text>
                        <View style={styles.scanFrame}>
                            <View style={[styles.corner, styles.tl]} />
                            <View style={[styles.corner, styles.tr]} />
                            <View style={[styles.corner, styles.bl]} />
                            <View style={[styles.corner, styles.br]} />
                        </View>

                        <Button onPress={handleSimulateScan} style={styles.simBtn}>
                            <Camera size={20} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={{ color: '#fff' }}>Simular Escaneo (Demo)</Text>
                        </Button>
                        {isProcessing && <ActivityIndicator color="#fff" style={{ marginTop: 16 }} />}
                    </View>
                ) : (
                    <CodeVerificationCard
                        code={scannedPayload.code}
                        username={scannedPayload.user}
                        status={
                            isProcessing
                                ? 'processing'
                                : !result
                                    ? 'pending'
                                    : result.status === 'success'
                                        ? 'success'
                                        : 'error'
                        }
                        resultData={
                            !result
                                ? undefined
                                : result.status === 'success'
                                    ? {
                                        title: '¡Canje Exitoso!',
                                        message: `${result.coupon.name}`,
                                        subMessage: `Restan ${result.remainingStock} unidades`,
                                    }
                                    : {
                                        title: 'No se pudo canjear',
                                        message: result.message,
                                    }
                        }
                        onConfirm={handleValidate}
                        onCancel={handleReset}
                        onReset={handleReset}
                    />
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    body: { flex: 1, padding: 16, gap: 16 },
    branchSelector: {
        backgroundColor: '#111827',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#1e293b',
    },
    branchLabel: { color: '#f8fafc', fontWeight: '600' },
    branchChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    branchChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#1d4ed8',
        backgroundColor: 'transparent',
    },
    branchChipActive: { backgroundColor: '#1d4ed8' },
    branchChipText: { color: '#93c5fd', fontSize: 12, fontWeight: '600' },
    branchChipTextActive: { color: '#fff' },
    cameraPlaceholder: {
        flex: 1,
        backgroundColor: '#1F2937',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#334155',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 24,
    },
    instructions: { color: '#cbd5f5', fontSize: 14, textAlign: 'center' },
    scanFrame: { width: 250, height: 250, borderWidth: 0, position: 'relative' },
    corner: { position: 'absolute', width: 40, height: 40, borderColor: '#38bdf8', borderWidth: 4 },
    tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
    tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
    bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
    br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
    simBtn: { backgroundColor: '#2563eb', flexDirection: 'row', paddingHorizontal: 24 },
    resultCard: { padding: 20, borderRadius: 18, backgroundColor: '#fff', gap: 12 },
    scanMeta: {
        backgroundColor: '#eff6ff',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: '#bfdbfe',
        gap: 4,
    },
    scanMetaLabel: { fontSize: 12, color: '#1d4ed8', fontWeight: '600', textTransform: 'uppercase' },
    scanMetaValue: { fontSize: 16, color: '#0f172a', fontWeight: '700' },
    scanMetaUser: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    scanMetaUserText: { fontSize: 14, color: '#475569', fontWeight: '600' },
    validationPending: { marginTop: 8 },
    validationSuccess: { marginTop: 8, alignItems: 'center' },
    validationError: { marginTop: 8, alignItems: 'center' },
    resultTitle: { fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center' },
    resultDesc: { fontSize: 14, color: '#475569', textAlign: 'center', marginTop: 4 },
    resultUser: { fontSize: 13, color: '#16a34a', marginTop: 6, fontWeight: '600' },
    pendingText: { fontSize: 14, color: '#1f2937', textAlign: 'center' },
});
