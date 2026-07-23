import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Search, Building, KeyRound, AlertTriangle } from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { Button } from '../../components/ui/button';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../contexts/ToastContext';
import { CodeVerificationCard } from '../../components/business/CodeVerificationCard';
import { useTheme } from '../../contexts/ThemeContext';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { toUserErrorTitle, toUserMessage } from '../../utils/errors';
import { Radius, colors } from '../../theme/tokens';


function BusinessQRScannerScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { branches } = useBusiness();
    const { show } = useToast();

    const [inputCode, setInputCode] = useState('');
    const [searchCode, setSearchCode] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<{ status: 'success' | 'error', message: string, title?: string } | null>(null);
    const [selectedBranch, setSelectedBranch] = useState<string>(branches[0]?.id ?? '');

    const lookupResult = useQuery(api.bonos.lookupBono, searchCode ? { bonoCode: searchCode } : "skip");
    const redeemBono = useMutation(api.bonos.redeemBono);

    const handleSearch = () => {
        if (!inputCode.trim()) {
            show('Por favor ingresa un código.', 'info');
            return;
        }
        setSearchCode(inputCode.trim().toUpperCase());
        setResult(null);
    };

    const handleReset = () => {
        setSearchCode('');
        setInputCode('');
        setResult(null);
    };

    const handleValidate = async () => {
        if (!searchCode || !lookupResult) return;
        
        const branchId = selectedBranch || branches[0]?.id;
        if (!branchId) {
            show('Selecciona una sucursal para continuar.', 'info');
            return;
        }
        
        setIsProcessing(true);
        try {
            await redeemBono({ bonoCode: searchCode });
            setResult({
                status: 'success',
                title: '¡Canje Exitoso!',
                message: `El bono ${lookupResult.listing?.title || searchCode} fue canjeado.`
            });
        } catch (error: any) {
            const payload = error?.data ?? error?.message ?? error;
            setResult({
                status: 'error',
                title: toUserErrorTitle(payload, 'No se pudo canjear'),
                message: toUserMessage(
                    payload,
                    'No se pudo validar el bono. Revisá el código e intentá de nuevo.',
                ),
            });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <View style={styles.container}>
            <MobileHeader title="Canjear Bono" subtitle="Ingreso Manual" backButton onBack={() => navigation.goBack()} />

            <View style={styles.body}>
                <View style={styles.branchSelector}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Building size={16} color={isDark ? "#f8fafc" : "#0f172a"} />
                        <Text style={styles.branchLabel}>Sucursal asignada</Text>
                    </View>
                    <View style={styles.branchChips}>
                        {branches.map((branch) => {
                            const isActive = branch.id === selectedBranch;
                            return (
                                <TouchableOpacity
                                    key={branch.id}
                                    style={[styles.branchChip, isActive && styles.branchChipActive]}
                                    onPress={() => setSelectedBranch(branch.id ?? '')}
                                >
                                    <Text style={[styles.branchChipText, isActive && styles.branchChipTextActive]}>
                                        {branch.name}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {!searchCode ? (
                    <View style={styles.cameraPlaceholder}>
                        <KeyRound size={48} color={isDark ? '#3B82F6' : '#2563EB'} style={{ marginBottom: 16 }} />
                        <Text style={styles.titleText}>Validación Manual</Text>
                        <Text style={styles.instructions}>
                            Pídele al cliente que te dicte el código único que aparece debajo del código QR de su bono.
                        </Text>
                        
                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={styles.input}
                                placeholder="EJ: BNO-1234-ABCD"
                                placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                                value={inputCode}
                                onChangeText={setInputCode}
                                autoCapitalize="characters"
                            />
                        </View>

                        <Button onPress={handleSearch} style={styles.simBtn}>
                            <Search size={20} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Validar Código</Text>
                        </Button>
                    </View>
                ) : lookupResult === undefined ? (
                    <View style={styles.cameraPlaceholder}>
                        <ActivityIndicator color="#2563eb" size="large" />
                        <Text style={styles.instructions}>Buscando código...</Text>
                        <Button onPress={handleReset} variant="outline" style={{marginTop: 16}}>
                            <Text>Cancelar</Text>
                        </Button>
                    </View>
                ) : lookupResult === null ? (
                    <View style={styles.cameraPlaceholder}>
                        <AlertTriangle size={48} color="#EF4444" />
                        <Text style={styles.instructions}>No se encontró ningún bono con el código: {searchCode}</Text>
                        <Button onPress={handleReset} style={styles.simBtn}>
                            <Text style={{ color: '#fff' }}>Intentar Otro Código</Text>
                        </Button>
                    </View>
                ) : (
                    <CodeVerificationCard
                        code={searchCode}
                        username={lookupResult.ownerName || 'Cliente'}
                        status={
                            isProcessing
                                ? 'processing'
                                : result 
                                    ? result.status
                                : lookupResult.status !== 'issued'
                                    ? 'error'
                                : 'pending'
                        }
                        resultData={
                            result ? {
                                title: result.title,
                                message: result.message
                            } : lookupResult.status !== 'issued' ? {
                                title: 'Bono Inválido',
                                message: `Este bono no se puede canjear porque su estado actual es: ${
                                    lookupResult.status === 'redeemed' ? 'Ya canjeado' : 
                                    lookupResult.status === 'expired' ? 'Expirado' : 
                                    lookupResult.status === 'cancelled' ? 'Cancelado' : lookupResult.status
                                }.`
                            } : undefined
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

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors(isDark).bg },
    body: { flex: 1, padding: 16, gap: 16 },
    branchSelector: {
        backgroundColor: colors(isDark).glass,
        borderRadius: Radius.lg,
        padding: 16,
        borderWidth: 1,
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    branchLabel: { color: isDark ? '#f8fafc' : '#0f172a', fontWeight: '600' },
    branchChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    branchChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: '#1d4ed8',
        backgroundColor: 'transparent',
    },
    branchChipActive: { backgroundColor: '#1d4ed8' },
    branchChipText: { color: '#1d4ed8', fontSize: 12, fontWeight: '600' },
    branchChipTextActive: { color: '#fff' },
    cameraPlaceholder: {
        flex: 1,
        backgroundColor: colors(isDark).glass,
        borderRadius: Radius.xl,
        borderWidth: 1,
        borderColor: isDark ? '#334155' : '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    titleText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: isDark ? '#f8fafc' : '#0f172a',
        marginBottom: 8,
        textAlign: 'center',
    },
    instructions: { 
        color: isDark ? '#cbd5f5' : '#475569', 
        fontSize: 16, 
        textAlign: 'center', 
        marginBottom: 32,
        lineHeight: 24
    },
    inputWrapper: {
        width: '100%',
        marginBottom: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
    },
    input: {
        width: '100%',
        backgroundColor: colors(isDark).glass,
        borderWidth: 2,
        borderColor: isDark ? '#374151' : '#E2E8F0',
        borderRadius: Radius.lg,
        padding: 20,
        fontSize: 20,
        color: isDark ? '#f8fafc' : '#0f172a',
        textAlign: 'center',
        letterSpacing: 4,
        fontWeight: 'bold',
    },
    simBtn: { 
        backgroundColor: '#2563eb', 
        flexDirection: 'row', 
        height: 56,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: Radius.lg
    },
});

// HOC inyectado automáticamente para soporte de teclado
const HOC_KeyboardAvoidingView_BusinessQRScannerScreen = (props: any) => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <BusinessQRScannerScreen {...props} />
    </KeyboardAvoidingView>
);
export default HOC_KeyboardAvoidingView_BusinessQRScannerScreen;
