import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated, TextInput, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBackground } from '../components/auth/AuthBackground';
import { Camera, Upload, CheckCircle2, ShieldCheck, ArrowRight, User, Building2, MapPin, Link as LinkIcon, FileText } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useFintech } from '../contexts/FintechContext';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { KycWebViewMockModal } from '../components/auth/KycWebViewMockModal';

type Step = 'intro' | 'success';

export default function KYCScreen({ navigation, route }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const accountType = route.params?.accountType || 'consumer';
    const [step, setStep] = useState<Step>('intro');

    // Common State
    const [idFront, setIdFront] = useState<string | null>(null);
    const [idBack, setIdBack] = useState<string | null>(null);
    const [faceScanned, setFaceScanned] = useState(false);

    // Business State (NY Compliance)
    const [ein, setEin] = useState('');
    const [incorporationDoc, setIncorporationDoc] = useState<string | null>(null); // Estatutos/Certificado
    const [businessAddress, setBusinessAddress] = useState('');
    const [premisesPhoto, setPremisesPhoto] = useState<string | null>(null);

    // Influencer State
    const [socialLink, setSocialLink] = useState('');

    const { user, markKycSubmitted } = useAuth();
    const { submitKyc, refreshKyc } = useFintech();
    const initiateKyc = useAction((api as any).identity?.initiateKYCSession || api.users.syncUser);
    
    // WebView State
    const [webViewVisible, setWebViewVisible] = useState(false);
    const [kycUrl, setKycUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Animation
    const fadeAnim = useRef(new Animated.Value(1)).current;

    const transitionTo = (nextStep: Step) => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true })
        ]).start();
        setTimeout(() => setStep(nextStep), 200);
    };

    const handleStartVerification = async () => {
        if (!user) {
            show('Debes iniciar sesión primero', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await initiateKyc({ accountType });
            if (result && result.url) {
                setKycUrl(result.url);
                setWebViewVisible(true);
            }
        } catch (e) {
            show('Error contactando al proveedor de identidad', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKycSuccess = async () => {
        setWebViewVisible(false);
        setIsSubmitting(true);
        try {
            await markKycSubmitted({
                accountType,
                documentFront: idFront || 'mock_doc',
                documentBack: idBack || 'mock_doc',
                selfieValidated: faceScanned,
                // Business Data
                ein: accountType === 'business' ? ein : undefined,
                incorporationDoc: accountType === 'business' ? incorporationDoc : undefined,
                businessAddress: accountType === 'business' ? businessAddress : undefined,
                premisesPhoto: accountType === 'business' ? premisesPhoto : undefined,
                // Influencer Data
                socialLink: accountType === 'influencer' ? socialLink : undefined,

                submittedFrom: 'mobile',
                submittedAt: new Date().toISOString(),
            });

            // Submit to Fintech (Admin Dashboard)
            submitKyc({
                ownerId: user?.id || 'unknown',
                ownerType: accountType as any,
                ownerName: user?.name || user?.email || 'Unknown User',
                data: {
                    documentFront: idFront || 'mock_doc',
                    documentBack: idBack || 'mock_doc',
                    selfieValidated: faceScanned,
                    ein: accountType === 'business' ? ein : undefined,
                    incorporationDoc: accountType === 'business' ? incorporationDoc : undefined,
                    businessAddress: accountType === 'business' ? businessAddress : undefined,
                    premisesPhoto: accountType === 'business' ? premisesPhoto : undefined,
                    socialLink: accountType === 'influencer' ? socialLink : undefined,
                }
            });

            await refreshKyc();
            transitionTo('success');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error interno.';
            show(message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleComplete = () => {
        // All roles (Business, Influencer, Consumer) are redirected to Home.
        // Specialized roles can access their dashboards via the 'Panel' button in the navbar.
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    };

    const renderIntro = () => (
        <View style={styles.stepContainer}>
            <View style={styles.iconContainer}>
                <ShieldCheck size={48} color="#7C3AED" />
            </View>
            <Text style={styles.title}>
                {accountType === 'business' ? 'Verificación de Negocio (NY)' :
                    accountType === 'influencer' ? 'Verificación de Influencer' :
                        'Verifiquemos tu identidad'}
            </Text>
            <Text style={styles.subtitle}>
                {accountType === 'business'
                    ? 'Para operar en NY, necesitamos validar legalmente tu empresa y ubicación física.'
                    : 'Para mantener la seguridad de la comunidad, necesitamos validar tus datos.'}
            </Text>

            <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>Requisitos:</Text>

                {accountType === 'business' && (
                    <>
                        <View style={styles.infoRow}>
                            <View style={styles.bullet} />
                            <Text style={styles.infoText}>Estatutos / Certificado Incorporación (NY)</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <View style={styles.bullet} />
                            <Text style={styles.infoText}>Número EIN y Licencias</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <View style={styles.bullet} />
                            <Text style={styles.infoText}>Foto del local comercial</Text>
                        </View>
                    </>
                )}

                {accountType === 'influencer' && (
                    <View style={styles.infoRow}>
                        <View style={styles.bullet} />
                        <Text style={styles.infoText}>Enlace a perfil principal</Text>
                    </View>
                )}

                <View style={styles.infoRow}>
                    <View style={styles.bullet} />
                    <Text style={styles.infoText}>Identificación del representante</Text>
                </View>
            </View>

            <TouchableOpacity
                style={[styles.btn, isSubmitting && styles.btnDisabled]}
                disabled={isSubmitting}
                onPress={handleStartVerification}
            >
                <Text style={styles.btnText}>Continuar con Identidad Segura</Text>
                <ArrowRight size={20} color="#fff" />
            </TouchableOpacity>
        </View>
    );



    const renderSuccess = () => (
        <View style={styles.stepContainer}>
            <View style={[styles.iconContainer, { backgroundColor: '#D1FAE5' }]}>
                <CheckCircle2 size={48} color="#059669" />
            </View>
            <Text style={styles.title}>¡Solicitud Enviada!</Text>
            <Text style={styles.subtitle}>
                Hemos recibido tu documentación. Te notificaremos cuando tu cuenta {accountType === 'business' ? 'de Negocio' : accountType === 'influencer' ? 'de Influencer' : ''} esté activa.
            </Text>

            <TouchableOpacity style={styles.btn} onPress={handleComplete}>
                <Text style={styles.btnText}>Ir al Panel Principal</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container}>
                <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
                    {step === 'intro' && renderIntro()}
                    {step === 'success' && renderSuccess()}
                </Animated.View>
                
                <KycWebViewMockModal
                    userId={user?.id || ''}
                    visible={webViewVisible}
                    url={kycUrl}
                    onClose={() => setWebViewVisible(false)}
                    onSuccess={handleKycSuccess}
                />
            </SafeAreaView>
        </AuthBackground>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 16 },
    card: {
        backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
        shadowColor: isDark ? '#000' : '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: isDark ? 0.3 : 0.1,
        shadowRadius: 20,
        elevation: 10,
        minHeight: 450,
        justifyContent: 'center'
    },
    stepContainer: { alignItems: 'center', width: '100%' },
    scrollStep: { alignItems: 'center', width: '100%', paddingBottom: 20 },
    iconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: isDark ? '#2E1065' : '#ede9fe', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    title: { fontSize: 22, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center', marginBottom: 24, paddingHorizontal: 4 },

    infoBox: { width: '100%', backgroundColor: isDark ? '#374151' : '#F3F4F6', borderRadius: 16, padding: 16, marginBottom: 24 },
    infoTitle: { fontWeight: '600', color: isDark ? '#E5E7EB' : '#374151', marginBottom: 12 },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#7C3AED', marginRight: 10 },
    infoText: { color: isDark ? '#D1D5DB' : '#4B5563', fontSize: 13, flex: 1 },

    btn: { backgroundColor: '#7C3AED', flexDirection: 'row', height: 50, borderRadius: 12, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center', width: '100%', marginTop: 16 },
    btnDisabled: { backgroundColor: isDark ? '#4B5563' : '#D1D5DB' },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 15, marginRight: 8 },

    uploadCard: { width: '100%', height: 120, borderWidth: 2, borderColor: isDark ? '#4B5563' : '#E5E7EB', borderStyle: 'dashed', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 16, backgroundColor: isDark ? '#374151' : '#F9FAFB' },
    uploadCardSimple: { width: '100%', padding: 16, borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB', borderRadius: 12, marginBottom: 16, backgroundColor: isDark ? '#374151' : '#F9FAFB' },
    uploadPlaceholder: { alignItems: 'center' },
    uploadPlaceholderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    uploadText: { color: isDark ? '#9CA3AF' : '#6B7280', fontWeight: '500' },
    uploadedContent: { alignItems: 'center' },
    uploadedContentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    uploadedText: { color: '#059669', fontWeight: '600', marginTop: 8 },
    uploadedTextSimple: { color: '#059669', fontWeight: '600' },

    label: { alignSelf: 'flex-start', fontSize: 13, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151', marginBottom: 6, marginTop: 4 },
    input: { width: '100%', height: 48, borderWidth: 1, borderColor: isDark ? '#4B5563' : '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, backgroundColor: isDark ? '#374151' : '#fff', marginBottom: 12, color: isDark ? '#F9FAFB' : '#111827' },
    inputContainer: { flexDirection: 'row', alignItems: 'center', width: '100%', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, backgroundColor: isDark ? '#374151' : '#fff', height: 48, marginBottom: 16 },
    inputFlex: { flex: 1, height: '100%', color: isDark ? '#F9FAFB' : '#111827' },
    hint: { fontSize: 11, color: isDark ? '#9CA3AF' : '#9CA3AF', marginBottom: 16, textAlign: 'center' },

    cameraPreview: { width: 200, height: 200, borderRadius: 100, backgroundColor: '#111827', marginBottom: 24, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: isDark ? '#4B5563' : '#E5E7EB' },
    faceOverlay: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    scanBtn: { backgroundColor: '#111827', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 24 },
    scanBtnText: { color: '#fff', fontWeight: '600' }
});
