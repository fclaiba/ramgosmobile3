import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Image, Animated, Alert, TextInput, ScrollView } from 'react-native';
import { AuthBackground } from '../components/auth/AuthBackground';
import { Camera, Upload, CheckCircle2, ShieldCheck, ArrowRight, User, Building2, MapPin, Link as LinkIcon, FileText } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';

type Step = 'intro' | 'document' | 'face' | 'business_docs' | 'location' | 'social_link' | 'success';

export default function KYCScreen({ navigation, route }: any) {
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

    const [isSubmitting, setIsSubmitting] = useState(false);
    const { user, markKycSubmitted } = useAuth();

    // Animation
    const fadeAnim = useRef(new Animated.Value(1)).current;

    const transitionTo = (nextStep: Step) => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true })
        ]).start();
        setTimeout(() => setStep(nextStep), 200);
    };

    const handleUpload = (field: 'front' | 'back' | 'incorporation' | 'premises') => {
        // Mock Image Picker
        setTimeout(() => {
            if (field === 'front') setIdFront('mock_url_front');
            else if (field === 'back') setIdBack('mock_url_back');
            else if (field === 'incorporation') setIncorporationDoc('mock_url_incorporation');
            else if (field === 'premises') setPremisesPhoto('mock_url_premises');
        }, 1000);
    };

    const handleFaceScan = () => {
        setTimeout(() => {
            setFaceScanned(true);
        }, 2000);
    };

    const handleNextFromIntro = () => {
        if (accountType === 'business') transitionTo('business_docs');
        else if (accountType === 'influencer') transitionTo('social_link');
        else transitionTo('document');
    };

    // Business Flow Logic
    const handleBusinessDocsNext = () => {
        if (!ein || !incorporationDoc) {
            Alert.alert('Datos incompletos', 'Ingresa el EIN y sube el Certificado de Incorporación.');
            return;
        }
        transitionTo('location');
    };

    const handleLocationNext = () => {
        if (!businessAddress || !premisesPhoto) {
            Alert.alert('Datos incompletos', 'Ingresa la dirección y sube una foto del local.');
            return;
        }
        transitionTo('document'); // Continue to Identity verification
    };

    // Influencer Flow Logic
    const handleSocialLinkNext = () => {
        if (!socialLink) {
            Alert.alert('Enlace requerido', 'Ingresa el link de tu red social principal.');
            return;
        }
        transitionTo('document'); // Continue to Identity verification
    };

    const handleFinalizeKyc = async () => {
        if (isSubmitting) return;
        if (!user) {
            Alert.alert('Sesión requerida', 'Debes iniciar sesión para completar la verificación.');
            return;
        }
        if (!idFront || !idBack) {
            Alert.alert('Documento incompleto', 'Necesitamos las fotos de tu documento para continuar.');
            return;
        }
        if (!faceScanned) {
            Alert.alert('Escaneo facial pendiente', 'Completa el escaneo facial antes de finalizar.');
            return;
        }

        setIsSubmitting(true);
        try {
            await markKycSubmitted({
                accountType,
                documentFront: idFront,
                documentBack: idBack,
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
            transitionTo('success');
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'No pudimos registrar tu verificación. Inténtalo nuevamente.';
            Alert.alert('Verificación', message);
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
                style={styles.btn}
                onPress={handleNextFromIntro}
            >
                <Text style={styles.btnText}>Comenzar verificación</Text>
                <ArrowRight size={20} color="#fff" />
            </TouchableOpacity>
        </View>
    );

    const renderBusinessDocs = () => (
        <ScrollView contentContainerStyle={styles.scrollStep}>
            <Text style={styles.title}>Documentación Legal</Text>
            <Text style={styles.subtitle}>Sube los documentos de constitución de tu empresa bajo leyes de Nueva York.</Text>

            <Text style={styles.label}>Número EIN (Employer Identification Number)</Text>
            <TextInput
                style={styles.input}
                placeholder="Ej: 12-3456789"
                value={ein}
                onChangeText={setEin}
                keyboardType="numeric"
            />

            <Text style={styles.label}>Estatutos / Certificado de Incorporación</Text>
            <TouchableOpacity style={styles.uploadCardSimple} onPress={() => handleUpload('incorporation')}>
                {incorporationDoc ? (
                    <View style={styles.uploadedContentRow}>
                        <CheckCircle2 size={24} color="#10B981" />
                        <Text style={styles.uploadedTextSimple}>Documento cargado</Text>
                    </View>
                ) : (
                    <View style={styles.uploadPlaceholderRow}>
                        <FileText size={24} color="#7C3AED" />
                        <Text style={styles.uploadText}>Subir PDF o Imagen</Text>
                    </View>
                )}
            </TouchableOpacity>

            <Text style={styles.hint}>
                Debes proporcionar el "Articles of Organization" o "Certificate of Incorporation" válido.
            </Text>

            <TouchableOpacity
                style={[styles.btn, (!ein || !incorporationDoc) && styles.btnDisabled]}
                disabled={!ein || !incorporationDoc}
                onPress={handleBusinessDocsNext}
            >
                <Text style={styles.btnText}>Siguiente: Ubicación</Text>
            </TouchableOpacity>
        </ScrollView>
    );

    const renderLocation = () => (
        <ScrollView contentContainerStyle={styles.scrollStep}>
            <Text style={styles.title}>Ubicación Física</Text>
            <Text style={styles.subtitle}>Valida la dirección comercial de tu negocio en NY.</Text>

            <Text style={styles.label}>Dirección Completa</Text>
            <TextInput
                style={styles.input}
                placeholder="Calle, Número, Ciudad, CP"
                value={businessAddress}
                onChangeText={setBusinessAddress}
            />

            <Text style={styles.label}>Foto de la Fachada / Local</Text>
            <TouchableOpacity style={styles.uploadCard} onPress={() => handleUpload('premises')}>
                {premisesPhoto ? (
                    <View style={styles.uploadedContent}>
                        <CheckCircle2 size={32} color="#10B981" />
                        <Text style={styles.uploadedText}>Foto subida</Text>
                    </View>
                ) : (
                    <View style={styles.uploadPlaceholder}>
                        <Building2 size={32} color="#7C3AED" style={{ marginBottom: 8 }} />
                        <Text style={styles.uploadText}>Tomar foto del local</Text>
                    </View>
                )}
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.btn, (!businessAddress || !premisesPhoto) && styles.btnDisabled]}
                disabled={!businessAddress || !premisesPhoto}
                onPress={handleLocationNext}
            >
                <Text style={styles.btnText}>Siguiente: Identidad</Text>
            </TouchableOpacity>
        </ScrollView>
    );

    const renderSocialLink = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.title}>Tus Redes</Text>
            <Text style={styles.subtitle}>Conecta tu cuenta principal para acceder al panel de Influencer.</Text>

            <View style={styles.inputContainer}>
                <LinkIcon size={20} color="#6B7280" style={{ marginRight: 10 }} />
                <TextInput
                    style={styles.inputFlex}
                    placeholder="https://instagram.com/tu_usuario"
                    value={socialLink}
                    onChangeText={setSocialLink}
                    autoCapitalize="none"
                />
            </View>

            <TouchableOpacity
                style={[styles.btn, !socialLink && styles.btnDisabled]}
                disabled={!socialLink}
                onPress={handleSocialLinkNext}
            >
                <Text style={styles.btnText}>Verificar Enlace</Text>
            </TouchableOpacity>
        </View>
    );

    const renderDocument = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.title}>Identidad del Representante</Text>
            <Text style={styles.subtitle}>Sube tu documento personal (DNI/ID/Pasaporte).</Text>

            <TouchableOpacity style={styles.uploadCard} onPress={() => handleUpload('front')}>
                {idFront ? (
                    <View style={styles.uploadedContent}>
                        <CheckCircle2 size={32} color="#10B981" />
                        <Text style={styles.uploadedText}>Frente subido</Text>
                    </View>
                ) : (
                    <View style={styles.uploadPlaceholder}>
                        <Upload size={32} color="#7C3AED" style={{ marginBottom: 8 }} />
                        <Text style={styles.uploadText}>Subir Frente</Text>
                    </View>
                )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.uploadCard} onPress={() => handleUpload('back')}>
                {idBack ? (
                    <View style={styles.uploadedContent}>
                        <CheckCircle2 size={32} color="#10B981" />
                        <Text style={styles.uploadedText}>Dorso subido</Text>
                    </View>
                ) : (
                    <View style={styles.uploadPlaceholder}>
                        <Upload size={32} color="#7C3AED" style={{ marginBottom: 8 }} />
                        <Text style={styles.uploadText}>Subir Dorso</Text>
                    </View>
                )}
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.btn, (!idFront || !idBack) && styles.btnDisabled]}
                disabled={!idFront || !idBack}
                onPress={() => transitionTo('face')}
            >
                <Text style={styles.btnText}>Continuar a Selfie</Text>
            </TouchableOpacity>
        </View>
    );

    const renderFace = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.title}>Prueba de Vida</Text>
            <Text style={styles.subtitle}>Último paso. Coloca tu rostro en el centro.</Text>

            <View style={styles.cameraPreview}>
                <View style={styles.faceOverlay}>
                    {faceScanned ? <CheckCircle2 size={64} color="#10B981" /> : <User size={80} color="#fff" opacity={0.5} />}
                </View>
            </View>

            {!faceScanned ? (
                <TouchableOpacity style={styles.scanBtn} onPress={handleFaceScan}>
                    <Text style={styles.scanBtnText}>Escanear Rostro</Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity
                    style={[styles.btn, isSubmitting && { opacity: 0.7 }]}
                    disabled={isSubmitting}
                    onPress={handleFinalizeKyc}
                >
                    <Text style={styles.btnText}>Finalizar Verificación</Text>
                </TouchableOpacity>
            )}
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
                    {step === 'business_docs' && renderBusinessDocs()}
                    {step === 'location' && renderLocation()}
                    {step === 'social_link' && renderSocialLink()}
                    {step === 'document' && renderDocument()}
                    {step === 'face' && renderFace()}
                    {step === 'success' && renderSuccess()}
                </Animated.View>
            </SafeAreaView>
        </AuthBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 16 },
    card: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        alignSelf: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
        minHeight: 450,
        justifyContent: 'center'
    },
    stepContainer: { alignItems: 'center', width: '100%' },
    scrollStep: { alignItems: 'center', width: '100%', paddingBottom: 20 },
    iconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#ede9fe', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    title: { fontSize: 22, fontWeight: 'bold', color: '#111827', marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 24, paddingHorizontal: 4 },

    infoBox: { width: '100%', backgroundColor: '#F3F4F6', borderRadius: 16, padding: 16, marginBottom: 24 },
    infoTitle: { fontWeight: '600', color: '#374151', marginBottom: 12 },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#7C3AED', marginRight: 10 },
    infoText: { color: '#4B5563', fontSize: 13, flex: 1 },

    btn: { backgroundColor: '#7C3AED', flexDirection: 'row', height: 50, borderRadius: 12, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center', width: '100%', marginTop: 16 },
    btnDisabled: { backgroundColor: '#D1D5DB' },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 15, marginRight: 8 },

    uploadCard: { width: '100%', height: 120, borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 16, backgroundColor: '#F9FAFB' },
    uploadCardSimple: { width: '100%', padding: 16, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, marginBottom: 16, backgroundColor: '#F9FAFB' },
    uploadPlaceholder: { alignItems: 'center' },
    uploadPlaceholderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    uploadText: { color: '#6B7280', fontWeight: '500' },
    uploadedContent: { alignItems: 'center' },
    uploadedContentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    uploadedText: { color: '#059669', fontWeight: '600', marginTop: 8 },
    uploadedTextSimple: { color: '#059669', fontWeight: '600' },

    label: { alignSelf: 'flex-start', fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 4 },
    input: { width: '100%', height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#fff', marginBottom: 12 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', width: '100%', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#fff', height: 48, marginBottom: 16 },
    inputFlex: { flex: 1, height: '100%' },
    hint: { fontSize: 11, color: '#9CA3AF', marginBottom: 16, textAlign: 'center' },

    cameraPreview: { width: 200, height: 200, borderRadius: 100, backgroundColor: '#111827', marginBottom: 24, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#E5E7EB' },
    faceOverlay: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    scanBtn: { backgroundColor: '#111827', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 24 },
    scanBtnText: { color: '#fff', fontWeight: '600' }
});
