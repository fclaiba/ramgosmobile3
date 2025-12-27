import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { AuthBackground } from '../../components/auth/AuthBackground';
import { Store, FileText, CheckCircle2, ArrowRight, Upload, ShieldCheck } from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { useBusiness } from '../../contexts/BusinessContext';
import { useAuth } from '../../contexts/AuthContext';

export default function BusinessKYCScreen({ navigation }: any) {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        businessName: '',
        taxId: '',
        address: '',
        legalRep: ''
    });
    const [docUploaded, setDocUploaded] = useState(false);
    const { businessInfo } = useBusiness();
    const { user, markKycSubmitted } = useAuth();

    const handleNext = () => {
        if (step === 1) {
            if (!formData.businessName || !formData.taxId) {
                Alert.alert('Error', 'Completa los campos obligatorios');
                return;
            }
            setStep(2);
        } else if (step === 2) {
            setStep(3);
        }
    };

    const handleUpload = () => {
        setTimeout(() => {
            setDocUploaded(true);
            Alert.alert('Éxito', 'Documento subido correctamente');
        }, 1000);
    };

    const handleSubmit = async () => {
        if (!docUploaded) {
            Alert.alert('Documentación requerida', 'Necesitamos que subas la documentación legal para continuar.');
            return;
        }
        if (!user) {
            Alert.alert('Sesión requerida', 'Debes iniciar sesión como negocio para completar la verificación.');
            return;
        }
        try {
            await markKycSubmitted({
                businessId: businessInfo.id,
                businessName: formData.businessName,
                taxId: formData.taxId,
                legalRep: formData.legalRep,
                address: formData.address,
                documents: docUploaded,
            });
            Alert.alert(
                'Verificación en Proceso',
                'Hemos recibido tu solicitud. Te notificaremos cuando tu negocio esté verificado.',
                [
                    {
                        text: 'Ir al Panel',
                        onPress: () =>
                            navigation.navigate('BusinessDashboard', { verificationPending: true }),
                    },
                ],
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'No se pudo enviar la verificación.';
            Alert.alert('Error', message);
        }
    };

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container}>
                <MobileHeader title="Verificación de Negocio" backButton onBack={() => navigation.goBack()} />

                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.card}>
                        {/* Progress */}
                        <View style={styles.progressRow}>
                            <View style={[styles.stepDot, step >= 1 ? styles.stepActive : null]}>
                                <Text style={[styles.stepNum, step >= 1 && { color: '#fff' }]}>1</Text>
                            </View>
                            <View style={styles.stepLine} />
                            <View style={[styles.stepDot, step >= 2 ? styles.stepActive : null]}>
                                <Text style={[styles.stepNum, step >= 2 && { color: '#fff' }]}>2</Text>
                            </View>
                            <View style={styles.stepLine} />
                            <View style={[styles.stepDot, step >= 3 ? styles.stepActive : null]}>
                                <Text style={[styles.stepNum, step >= 3 && { color: '#fff' }]}>3</Text>
                            </View>
                        </View>

                        {/* STEP 1: Info */}
                        {step === 1 && (
                            <View style={styles.stepContent}>
                                <Text style={styles.stepTitle}>Información Fiscal</Text>
                                <Text style={styles.stepDesc}>Ingresa los datos legales de tu empresa para facturación.</Text>

                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>Razón Social</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Ej. Restaurante S.A."
                                        value={formData.businessName}
                                        onChangeText={t => setFormData({ ...formData, businessName: t })}
                                    />
                                </View>
                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>RUT / CUIT / Tax ID</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="00-00000000-0"
                                        value={formData.taxId}
                                        onChangeText={t => setFormData({ ...formData, taxId: t })}
                                    />
                                </View>
                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>Dirección Legal</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Calle Principal 123"
                                        value={formData.address}
                                        onChangeText={t => setFormData({ ...formData, address: t })}
                                    />
                                </View>

                                <TouchableOpacity style={styles.btn} onPress={handleNext}>
                                    <Text style={styles.btnText}>Siguiente</Text>
                                    <ArrowRight size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* STEP 2: Docs */}
                        {step === 2 && (
                            <View style={styles.stepContent}>
                                <Text style={styles.stepTitle}>Documentación</Text>
                                <Text style={styles.stepDesc}>Sube el acta constitutiva o constancia fiscal.</Text>

                                <TouchableOpacity style={styles.uploadBox} onPress={handleUpload}>
                                    {docUploaded ? (
                                        <>
                                            <CheckCircle2 size={48} color="#10B981" />
                                            <Text style={[styles.uploadText, { color: '#059669', marginTop: 12 }]}>Documento cargado</Text>
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={48} color="#9CA3AF" />
                                            <Text style={styles.uploadText}>Toca para subir PDF o Foto</Text>
                                        </>
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.btn, !docUploaded && styles.btnDisabled]}
                                    onPress={handleNext}
                                    disabled={!docUploaded}
                                >
                                    <Text style={styles.btnText}>Siguiente</Text>
                                    <ArrowRight size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* STEP 3: Review */}
                        {step === 3 && (
                            <View style={styles.stepContent}>
                                <View style={styles.iconContainer}>
                                    <ShieldCheck size={48} color="#7C3AED" />
                                </View>
                                <Text style={styles.stepTitle}>Confirma tu Solicitud</Text>
                                <Text style={styles.stepDesc}>Al enviar, nuestros agentes revisarán tu documentación en un plazo de 24-48 horas.</Text>

                                <View style={styles.summaryBox}>
                                    <Text style={styles.summaryLabel}>Empresa:</Text>
                                    <Text style={styles.summaryVal}>{formData.businessName}</Text>
                                    <Text style={styles.summaryLabel}>ID Fiscal:</Text>
                                    <Text style={styles.summaryVal}>{formData.taxId}</Text>
                                </View>

                                <TouchableOpacity style={styles.btn} onPress={handleSubmit}>
                                    <Text style={styles.btnText}>Enviar Solicitud</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                    </View>
                </ScrollView>
            </SafeAreaView>
        </AuthBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { flexGrow: 1, padding: 16, justifyContent: 'center' },
    card: { backgroundColor: '#fff', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },

    progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    stepActive: { backgroundColor: '#7C3AED' },
    stepNum: { fontSize: 14, fontWeight: 'bold', color: '#9CA3AF' },
    stepLine: { width: 40, height: 2, backgroundColor: '#F3F4F6', marginHorizontal: 4 },

    stepContent: { alignItems: 'stretch' },
    stepTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827', textAlign: 'center', marginBottom: 8 },
    stepDesc: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24 },

    inputGroup: { marginBottom: 16 },
    label: { fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 6 },
    input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, height: 48, paddingHorizontal: 16, fontSize: 15 },

    btn: { backgroundColor: '#7C3AED', height: 50, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
    btnDisabled: { backgroundColor: '#D1D5DB' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginRight: 8 },

    uploadBox: { height: 160, borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed', borderRadius: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB', marginBottom: 24 },
    uploadText: { marginTop: 12, color: '#6B7280', fontWeight: '500' },

    iconContainer: { alignSelf: 'center', width: 80, height: 80, borderRadius: 40, backgroundColor: '#ede9fe', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    summaryBox: { backgroundColor: '#F3F4F6', padding: 16, borderRadius: 12, marginBottom: 24 },
    summaryLabel: { color: '#6B7280', fontSize: 12, marginBottom: 2 },
    summaryVal: { color: '#111827', fontSize: 16, fontWeight: '600', marginBottom: 12 }
});
