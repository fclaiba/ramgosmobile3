import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Platform, useWindowDimensions, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthBackground } from '../../components/auth/AuthBackground';
import { Store, FileText, CheckCircle2, ArrowRight, Upload, ShieldCheck, MapPin } from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { useBusiness } from '../../contexts/BusinessContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { BusinessLocationSearch } from '../../components/business/BusinessLocationSearch';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { LIMITS, MIN, clamp, formatTaxId } from '../../utils/inputLimits';
import { glassShadow, Radius, colors } from '../../theme/tokens';



export default function BusinessKYCScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        businessName: '',
        taxId: '',
        address: '',
        legalRep: '',
        placeId: ''
    });
    const [docUploaded, setDocUploaded] = useState(false);
    const { businessInfo } = useBusiness();
    const { user, markKycSubmitted } = useAuth();
    
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleNext = () => {
        if (step === 1) {
            if (!formData.businessName.trim() || formData.businessName.trim().length < MIN.businessName) {
                show('Nombre comercial: mínimo 2 caracteres', 'error');
                return;
            }
            if (!formData.address.trim() || formData.address.trim().length < MIN.businessAddress) {
                show(`Dirección: mínimo ${MIN.businessAddress} caracteres`, 'error');
                return;
            }
            setStep(2);
        } else if (step === 2) {
            setStep(3);
        }
    };

    const handleUpload = () => {
        // Simulate picking a document
        show('Subiendo documento...', 'info');
        setTimeout(() => {
            setDocUploaded(true);
            show('Documento subido correctamente', 'success');
        }, 1500);
    };

    const handleLocationSelect = (place: { name: string; address: string; placeId: string }) => {
        setFormData(prev => ({
            ...prev,
            businessName: place.name,
            address: place.address,
            placeId: place.placeId
        }));
    };

    const handleSubmit = async () => {
        if (!user) {
            show('Debes iniciar sesión como negocio para completar la verificación.', 'error');
            return;
        }

        await handleKycSuccess();
    };

    const handleKycSuccess = async () => {
        setIsSubmitting(true);
        try {
            await markKycSubmitted({
                businessId: businessInfo?.id || 'new_biz',
                businessName: formData.businessName,
                taxId: formData.taxId,
                legalRep: formData.legalRep,
                address: formData.address,
                placeId: formData.placeId,
                documents: docUploaded,
            });

            navigation.navigate('BusinessDashboard', { verificationPending: true });
            show('Solicitud enviada. Te notificaremos al verificar los datos legales.', 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo enviar la verificación.';
            show(message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container}>
                <MobileHeader title="Verificación de Negocio" backButton onBack={() => navigation.goBack()} />

                <ScrollView
                    contentContainerStyle={[
                        styles.scroll,
                        { paddingBottom: Math.max(16, insets.bottom) + 24 },
                    ]}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={[styles.card, { width: '100%', maxWidth: Math.min(720, width - 32), alignSelf: 'center' }]}>
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

                        {/* STEP 1: Info (Updated with Location Search) */}
                        {step === 1 && (
                            <View style={styles.stepContent}>
                                <Text style={styles.stepTitle}>Información del Local</Text>
                                <Text style={styles.stepDesc}>Busca tu negocio en Google Maps o ingresalo manualmente.</Text>

                                <BusinessLocationSearch onSelect={handleLocationSelect} />

                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>Nombre Comercial</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Ej. Restaurante S.A."
                                        placeholderTextColor={isDark ? "#9CA3AF" : "#9CA3AF"}
                                        value={formData.businessName}
                                        onChangeText={t => setFormData({ ...formData, businessName: clamp(t, LIMITS.businessName) })}
                                        maxLength={LIMITS.businessName}
                                    />
                                </View>
                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>Dirección Completa</Text>
                                    <TextInput
                                        style={[styles.input, { height: 'auto', minHeight: 48, paddingVertical: 12 }]}
                                        placeholder="Calle Principal 123, Brooklyn, NY"
                                        placeholderTextColor={isDark ? "#9CA3AF" : "#9CA3AF"}
                                        value={formData.address}
                                        onChangeText={t => setFormData({ ...formData, address: clamp(t, LIMITS.businessAddress) })}
                                        multiline
                                        maxLength={LIMITS.businessAddress}
                                    />
                                </View>
                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>ID Fiscal (Opcional)</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="XX-XXXXXXX"
                                        placeholderTextColor={isDark ? "#9CA3AF" : "#9CA3AF"}
                                        value={formData.taxId}
                                        onChangeText={t => setFormData({ ...formData, taxId: formatTaxId(t) })}
                                        maxLength={LIMITS.taxId}
                                    />
                                </View>

                                <TouchableOpacity style={styles.btn} onPress={handleNext}>
                                    <Text style={styles.btnText}>Siguiente</Text>
                                    <ArrowRight size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* STEP 2: Docs (Same as before but improved flow) */}
                        {step === 2 && (
                            <View style={styles.stepContent}>
                                <Text style={styles.stepTitle}>Documentación Legal</Text>
                                <Text style={styles.stepDesc}>Sube tu Acta Constitutiva o Constancia de Situación Fiscal.</Text>

                                <TouchableOpacity style={styles.uploadBox} onPress={handleUpload}>
                                    {docUploaded ? (
                                        <>
                                            <CheckCircle2 size={48} color="#10B981" />
                                            <Text style={[styles.uploadText, { color: '#059669', marginTop: 12 }]}>Documento cargado exitosamente</Text>
                                            <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>archivo_legal.pdf</Text>
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
                                    <ShieldCheck size={48} color="#2196F3" />
                                </View>
                                <Text style={styles.stepTitle}>Confirmar Verificación</Text>
                                <Text style={styles.stepDesc}>Tus datos serán revisados manualmente.</Text>

                                <View style={styles.summaryBox}>
                                    <Text style={styles.summaryLabel}>Empresa:</Text>
                                    <Text style={styles.summaryVal}>{formData.businessName}</Text>

                                    <Text style={styles.summaryLabel}>Dirección:</Text>
                                    <Text style={styles.summaryVal}>{formData.address}</Text>

                                    {formData.placeId ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                            <MapPin size={14} color="#059669" />
                                            <Text style={{ fontSize: 12, color: '#059669', marginLeft: 4 }}>Ubicación validada por Google Maps</Text>
                                        </View>
                                    ) : null}

                                    <Text style={styles.summaryLabel}>Verificación KYB:</Text>
                                    <Text style={styles.summaryVal}>Tus documentos serán validados por un administrador.</Text>
                                </View>

                                <TouchableOpacity 
                                    style={[styles.btn, isSubmitting && styles.btnDisabled]} 
                                    onPress={handleSubmit}
                                    disabled={isSubmitting}
                                >
                                    <Text style={styles.btnText}>Enviar para Verificación</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                    </View>
                </ScrollView>
                

            </SafeAreaView>
        </AuthBackground>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1 },
    scroll: { flexGrow: 1, padding: 16, justifyContent: 'center' },
    card: {
        backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : '#fff',
        borderRadius: Radius.xl,
        padding: 24,
        ...glassShadow(isDark),
        borderWidth: 1,
        borderColor: isDark ? '#374151' : 'transparent',
    },

    progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    stepDot: { width: 32, height: 32, borderRadius: Radius.lg, backgroundColor: colors(isDark).glass, justifyContent: 'center', alignItems: 'center' },
    stepActive: { backgroundColor: '#2196F3' },
    stepNum: { fontSize: 14, fontWeight: 'bold', color: isDark ? '#9CA3AF' : '#9CA3AF' },
    stepLine: { width: 40, height: 2, backgroundColor: colors(isDark).glass, marginHorizontal: 4 },

    stepContent: { alignItems: 'stretch' },
    stepTitle: { fontSize: 20, fontWeight: 'bold', color: colors(isDark).text, textAlign: 'center', marginBottom: 8 },
    stepDesc: { fontSize: 14, color: colors(isDark).textMuted, textAlign: 'center', marginBottom: 24 },

    inputGroup: { marginBottom: 16 },
    label: { fontSize: 13, fontWeight: '500', color: isDark ? '#D1D5DB' : '#374151', marginBottom: 6 },
    input: { backgroundColor: colors(isDark).glass, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', borderRadius: Radius.md, height: 48, paddingHorizontal: 16, fontSize: 15, color: colors(isDark).text },

    btn: { backgroundColor: '#2196F3', height: 50, borderRadius: Radius.md, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
    btnDisabled: { backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginRight: 8 },

    uploadBox: { height: 160, borderWidth: 2, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', borderStyle: 'dashed', borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center', backgroundColor: colors(isDark).glass, marginBottom: 24 },
    uploadText: { marginTop: 12, color: colors(isDark).textMuted, fontWeight: '500' },

    iconContainer: { alignSelf: 'center', width: 80, height: 80, borderRadius: Radius.full, backgroundColor: isDark ? '#2E1065' : '#ede9fe', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    summaryBox: { backgroundColor: colors(isDark).glass, padding: 16, borderRadius: Radius.md, marginBottom: 24 },
    summaryLabel: { color: colors(isDark).textMuted, fontSize: 12, marginBottom: 2 },
    summaryVal: { color: colors(isDark).text, fontSize: 16, fontWeight: '600', marginBottom: 12 }
});
