import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { MobileHeader } from '../components/MobileHeader';
import { useFintech } from '../contexts/FintechContext';
import { useAuth } from '../contexts/AuthContext';
import { Building, DollarSign, Wallet, CheckCircle2, AlertCircle, ChevronDown, Lock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useToast } from '../contexts/ToastContext';

export default function WithdrawalScreen({ navigation, route }: any) {
    const { user } = useAuth();
    const { getWalletByOwner, requestWithdrawal } = useFintech();
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const { show } = useToast();

    // US Bank Details State
    const [bankName, setBankName] = useState('');
    const [routingNumber, setRoutingNumber] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [accountType, setAccountType] = useState<'checking' | 'savings'>('checking');

    // Get wallet based on context passed or user ID fallback
    const ownerId = route.params?.ownerId ?? user?.id; // Fallback to user ID but ideally should be passed
    const wallet = getWalletByOwner(ownerId);

    const availableBalance = wallet?.balances.available ?? 0;

    const handleWithdraw = async () => {
        const withdrawAmount = parseFloat(amount);

        if (isNaN(withdrawAmount) || withdrawAmount < 10) {
            show('Monto inválido. Mínimo $10.00 USD', 'error');
            return;
        }

        if (withdrawAmount > availableBalance) {
            show('Saldo insuficiente', 'error');
            return;
        }

        // Validate US Bank Details
        if (!bankName || routingNumber.length !== 9 || accountNumber.length < 4) {
            show('Completa los datos bancarios correctamente', 'error');
            return;
        }

        setLoading(true);
        try {
            // Simulate API call delay
            await new Promise(resolve => setTimeout(resolve, 1500));

            const destinationLabel = `${bankName} •••• ${accountNumber.slice(-4)}`;

            requestWithdrawal({
                accountId: wallet?.ownerId ?? '',
                amount: withdrawAmount,
                destination: {
                    type: 'bank',
                    label: destinationLabel
                },
                metadata: {
                    bankName,
                    routingNumber,
                    accountNumber,
                    accountType,
                    market: 'US-NY'
                },
                notes: `Retiro a cuenta ${accountType} en ${bankName}`
            });

            show(`Solicitud Enviada. $${withdrawAmount.toFixed(2)} a ${destinationLabel}`, 'success');
            setTimeout(() => navigation.goBack(), 1500);
        } catch (error: any) {
            show(error.message || 'No se pudo procesar la solicitud', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <MobileHeader title="Retirar Fondos" showBack onBack={() => navigation.goBack()} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Balance Card */}
                    <LinearGradient
                        colors={['#1e293b', '#0f172a']}
                        style={styles.balanceCard}
                    >
                        <View style={styles.balanceHeader}>
                            <Text style={styles.balanceLabel}>Saldo Disponible</Text>
                            <View style={styles.usdBadge}>
                                <Text style={styles.usdText}>USD</Text>
                            </View>
                        </View>
                        <Text style={styles.balanceValue}>${availableBalance.toFixed(2)}</Text>
                        <Text style={styles.balanceHint}>Fondos listos para transferir a tu cuenta en EE.UU.</Text>
                    </LinearGradient>

                    {/* Withdrawal Form */}
                    <View style={styles.formSection}>
                        <Text style={styles.sectionTitle}>Monto a retirar</Text>
                        <View style={styles.amountInputContainer}>
                            <DollarSign size={20} color="#374151" />
                            <TextInput
                                style={styles.amountInput}
                                value={amount}
                                onChangeText={setAmount}
                                placeholder="0.00"
                                keyboardType="numeric"
                                placeholderTextColor="#9CA3AF"
                            />
                        </View>
                        <Text style={styles.helperText}>Mínimo $10.00 USD</Text>
                    </View>

                    <View style={styles.formSection}>
                        <Text style={styles.sectionTitle}>Datos Bancarios (US)</Text>
                        <View style={styles.infoBox}>
                            <AlertCircle size={16} color="#2563EB" style={{ marginTop: 2 }} />
                            <Text style={styles.infoText}>
                                Solo transferencias a cuentas bancarias de Estados Unidos (ACH).
                            </Text>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Nombre del Banco</Text>
                            <TextInput
                                style={styles.input}
                                value={bankName}
                                onChangeText={setBankName}
                                placeholder="Ej: Chase, Bank of America"
                                placeholderTextColor="#9CA3AF"
                            />
                        </View>

                        <View style={styles.row}>
                            <View style={[styles.inputGroup, { flex: 1 }]}>
                                <Text style={styles.label}>Routing Number (ABA)</Text>
                                <TextInput
                                    style={styles.input}
                                    value={routingNumber}
                                    onChangeText={(t) => setRoutingNumber(t.replace(/\D/g, '').slice(0, 9))}
                                    placeholder="9 dígitos"
                                    keyboardType="numeric"
                                    maxLength={9}
                                    placeholderTextColor="#9CA3AF"
                                />
                            </View>
                            <View style={[styles.inputGroup, { flex: 1 }]}>
                                <Text style={styles.label}>Número de Cuenta</Text>
                                <TextInput
                                    style={styles.input}
                                    value={accountNumber}
                                    onChangeText={(t) => setAccountNumber(t.replace(/\D/g, ''))}
                                    placeholder="Account Number"
                                    keyboardType="numeric"
                                    secureTextEntry
                                    placeholderTextColor="#9CA3AF"
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Tipo de Cuenta</Text>
                            <View style={styles.radioGroup}>
                                <TouchableOpacity
                                    style={[styles.radioOption, accountType === 'checking' && styles.radioActive]}
                                    onPress={() => setAccountType('checking')}
                                >
                                    <View style={[styles.radioCircle, accountType === 'checking' && styles.radioCircleActive]} />
                                    <Text style={[styles.radioText, accountType === 'checking' && styles.radioTextActive]}>Checking</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.radioOption, accountType === 'savings' && styles.radioActive]}
                                    onPress={() => setAccountType('savings')}
                                >
                                    <View style={[styles.radioCircle, accountType === 'savings' && styles.radioCircleActive]} />
                                    <Text style={[styles.radioText, accountType === 'savings' && styles.radioTextActive]}>Savings</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[
                            styles.withdrawButton,
                            (loading || !amount || parseFloat(amount) <= 0) && styles.disabledButton
                        ]}
                        onPress={handleWithdraw}
                        disabled={loading || !amount || parseFloat(amount) <= 0}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Lock size={18} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.withdrawButtonText}>Retirar Fondos</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <Text style={styles.securityNote}>
                        Tus datos bancarios se transmiten de forma encriptada y segura.
                    </Text>

                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    scrollContent: { padding: 20, paddingBottom: 40 },

    balanceCard: {
        padding: 24,
        borderRadius: 20,
        marginBottom: 24,
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
    },
    balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    balanceLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '500' },
    usdBadge: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    usdText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    balanceValue: { fontSize: 42, fontWeight: '800', color: '#fff', marginBottom: 8 },
    balanceHint: { color: '#64748b', fontSize: 13 },

    formSection: { marginBottom: 24 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 12 },

    amountInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    amountInput: {
        flex: 1,
        fontSize: 20,
        fontWeight: '600',
        color: '#111827',
        marginLeft: 8,
    },
    helperText: { fontSize: 12, color: '#6B7280', marginTop: 6, marginLeft: 4 },

    infoBox: { flexDirection: 'row', gap: 10, backgroundColor: '#EFF6FF', padding: 12, borderRadius: 12, marginBottom: 16, borderColor: '#BFDBFE', borderWidth: 1 },
    infoText: { flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 18 },

    inputGroup: { marginBottom: 16 },
    row: { flexDirection: 'row', gap: 12 },
    label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
    input: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 15,
        color: '#111827',
    },

    radioGroup: { flexDirection: 'row', gap: 12 },
    radioOption: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, gap: 10 },
    radioActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
    radioCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#D1D5DB' },
    radioCircleActive: { borderColor: '#2563EB', borderWidth: 5 },
    radioText: { fontSize: 14, color: '#374151', fontWeight: '500' },
    radioTextActive: { color: '#1E40AF' },

    withdrawButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#111827',
        paddingVertical: 16,
        borderRadius: 16,
        marginTop: 8,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5
    },
    disabledButton: { opacity: 0.6, backgroundColor: '#4B5563' },
    withdrawButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    securityNote: { textAlign: 'center', fontSize: 11, color: '#9CA3AF', marginTop: 16, marginBottom: 30 },
});
