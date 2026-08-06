import React, { useState, useRef, useMemo } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Animated, TextInput,
    ScrollView, Platform, KeyboardAvoidingView, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { AuthBackground } from '../components/auth/AuthBackground';
import { CheckCircle2, ShieldCheck, ArrowRight, User, Building2, MapPin, Link as LinkIcon } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useFintech } from '../contexts/FintechContext';
import { ImageUploadField } from '../components/ui/ImageUploadField';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { glassTokens } from '../utils/glass';
import {
    LIMITS, MIN, clamp, formatEin, isValidEin, isValidBusinessAddress, isValidSocialUrl,
} from '../utils/inputLimits';
import { Radius, colors } from '../theme/tokens';
import { useTranslation } from 'react-i18next';

type Step = 'intro' | 'success';

export default function KYCScreen({ navigation, route }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { width: windowWidth } = useWindowDimensions();
    const isWide = windowWidth >= 768;
    const styles = useMemo(() => getStyles(isDark, isWide), [isDark, isWide]);
    const { show } = useToast();
    const { t } = useTranslation();

    const accountType = route.params?.accountType || 'consumer';
    const totalSteps = accountType === 'consumer' ? 2 : 3;
    const [status, setStatus] = useState<'intro' | 'success'>('intro');
    const [formStep, setFormStep] = useState(1);

    const [idFront, setIdFront] = useState<string | null>(null);
    const [idBack, setIdBack] = useState<string | null>(null);
    const [faceScanned, setFaceScanned] = useState(false);

    const [ein, setEin] = useState('');
    const [incorporationDoc, setIncorporationDoc] = useState<string | null>(null);
    const [businessAddress, setBusinessAddress] = useState('');
    const [premisesPhoto, setPremisesPhoto] = useState<string | null>(null);

    const [socialLink, setSocialLink] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [contactEmail, setContactEmail] = useState('');

    const { user, sessionToken, markKycSubmitted } = useAuth();
    const { refreshKyc } = useFintech();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fadeAnim = useRef(new Animated.Value(1)).current;
    
    const skipKycMutation = useMutation(api.auth.skipKyc);

    const handleSkip = async () => {
        setIsSubmitting(true);
        try {
            await skipKycMutation({ sessionToken });
            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
        } catch (error: any) {
            show(error.message || t('kyc.skipError', { defaultValue: 'Error al omitir la verificación KYC' }), 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const transitionTo = (nextStatus: 'intro' | 'success') => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]).start();
        setTimeout(() => setStatus(nextStatus), 200);
    };

    const businessReady = isValidEin(ein) && incorporationDoc && isValidBusinessAddress(businessAddress) && premisesPhoto;
    const influencerReady = isValidSocialUrl(socialLink);

    const handleNext = () => {
        if (formStep === 1) {
            if (!idFront || !idBack) {
                show(t('kyc.needDocuments', { defaultValue: 'Adjunta el frente y reverso del documento' }), 'error');
                return;
            }
        } else if (formStep === 2 && accountType !== 'consumer') {
            if (accountType === 'business' && !businessReady) {
                show(t('kyc.needBusinessData', { defaultValue: 'Completa los datos requeridos (EIN, documentos y foto)' }), 'error');
                return;
            } else if (accountType === 'influencer' && !influencerReady) {
                show(t('kyc.needValidUrl', { defaultValue: 'Ingresa una URL válida (ej. instagram.com/tuusuario)' }), 'error');
                return;
            }
            if (!contactPhone.trim() || !contactEmail.trim() || !contactEmail.includes('@')) {
                show(t('kyc.needContact', { defaultValue: 'Ingresa un teléfono y correo de contacto válidos' }), 'error');
                return;
            }
        }
        setFormStep(s => Math.min(s + 1, totalSteps));
    };

    const handleBack = () => setFormStep(s => Math.max(s - 1, 1));

    const handleStartVerification = async () => {
        if (!user) {
            show('Debes iniciar sesión primero', 'error');
            return;
        }
        await handleKycSuccess();
    };

    const handleKycSuccess = async () => {
        setIsSubmitting(true);
        try {
            await markKycSubmitted({
                accountType,
                documentFront: idFront as string,
                documentBack: idBack as string,
                selfieValidated: faceScanned,
                ein: accountType === 'business' ? ein : undefined,
                incorporationDoc: accountType === 'business' ? incorporationDoc : undefined,
                businessAddress: accountType === 'business' ? businessAddress : undefined,
                premisesPhoto: accountType === 'business' ? premisesPhoto : undefined,
                socialLink: accountType === 'influencer' ? socialLink : undefined,
                contactPhone: accountType !== 'consumer' ? contactPhone : undefined,
                contactEmail: accountType !== 'consumer' ? contactEmail : undefined,
                submittedFrom: 'mobile',
                submittedAt: new Date().toISOString(),
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
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    };

    const title = accountType === 'business' ? 'Verificación de Negocio (NY)'
        : accountType === 'influencer' ? 'Verificación de Influencer'
            : 'Verifiquemos tu identidad';

    const subtitle = accountType === 'business'
        ? 'Para operar en NY, necesitamos validar legalmente tu empresa y ubicación física.'
        : accountType === 'influencer'
            ? 'Validamos tu perfil público para activar campañas y comisiones.'
            : 'Para mantener la seguridad de la comunidad, necesitamos validar tus datos.';

    const renderIntro = () => (
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                style={styles.flex}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Progress */}
                <View style={styles.progressRow}>
                    <View style={[styles.stepDot, formStep >= 1 ? styles.stepActive : null]}>
                        <Text style={[styles.stepNum, formStep >= 1 && { color: '#fff' }]}>1</Text>
                    </View>
                    <View style={styles.stepLine} />
                    <View style={[styles.stepDot, formStep >= 2 ? styles.stepActive : null]}>
                        <Text style={[styles.stepNum, formStep >= 2 && { color: '#fff' }]}>2</Text>
                    </View>
                    {totalSteps === 3 && (
                        <>
                            <View style={styles.stepLine} />
                            <View style={[styles.stepDot, formStep >= 3 ? styles.stepActive : null]}>
                                <Text style={[styles.stepNum, formStep >= 3 && { color: '#fff' }]}>3</Text>
                            </View>
                        </>
                    )}
                </View>

                {formStep === 1 && (
                    <View style={styles.stepContent}>
                        <View style={styles.iconContainer}>
                            <ShieldCheck size={48} color="#4FC3F7" />
                        </View>
                        <Text style={styles.title}>Identidad</Text>
                        <Text style={styles.subtitle}>Sube el frente y dorso de tu documento.</Text>
                        
                        <View style={styles.formBody}>
                            <View style={styles.docsRow}>
                                <View style={styles.docCol}>
                                    <ImageUploadField
                                        variant="document"
                                        title="Identidad — Frente"
                                        images={idFront ? [idFront] : []}
                                        onChange={(imgs) => setIdFront(imgs[0] ?? null)}
                                        maxImages={1}
                                    />
                                </View>
                                <View style={styles.docCol}>
                                    <ImageUploadField
                                        variant="document"
                                        title="Identidad — Dorso"
                                        images={idBack ? [idBack] : []}
                                        onChange={(imgs) => setIdBack(imgs[0] ?? null)}
                                        maxImages={1}
                                    />
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {formStep === 2 && accountType !== 'consumer' && (
                    <View style={styles.stepContent}>
                        <View style={styles.iconContainer}>
                            {accountType === 'business' ? <Building2 size={48} color="#4FC3F7" /> : <LinkIcon size={48} color="#4FC3F7" />}
                        </View>
                        <Text style={styles.title}>{accountType === 'business' ? 'Empresa' : 'Red Social'}</Text>
                        <Text style={styles.subtitle}>{subtitle}</Text>

                        <View style={styles.formBody}>
                            {accountType === 'business' && (
                                <>
                                    <FormField styles={styles} label="Número EIN" value={ein} onChangeText={(t) => setEin(formatEin(t))} placeholder="XX-XXXXXXX" isDark={isDark} maxLength={LIMITS.ein} hint="9 dígitos · formato XX-XXXXXXX" keyboardType="number-pad" />
                                    <ImageUploadField variant="document" title="Certificado de incorporación" images={incorporationDoc ? [incorporationDoc] : []} onChange={(imgs) => setIncorporationDoc(imgs[0] ?? null)} maxImages={1} />
                                    <FormField styles={styles} label="Dirección del local" value={businessAddress} onChangeText={(t) => setBusinessAddress(clamp(t, LIMITS.businessAddress))} placeholder="Calle, ciudad, NY" isDark={isDark} maxLength={LIMITS.businessAddress} hint={`${businessAddress.length}/${LIMITS.businessAddress} · mín. ${MIN.businessAddress}`} />
                                    <ImageUploadField variant="document" title="Foto del local comercial" images={premisesPhoto ? [premisesPhoto] : []} onChange={(imgs) => setPremisesPhoto(imgs[0] ?? null)} maxImages={1} />
                                </>
                            )}
                            {accountType === 'influencer' && (
                                <FormField styles={styles} label="Perfil principal" value={socialLink} onChangeText={(t) => setSocialLink(clamp(t, LIMITS.socialUrl))} placeholder="https://instagram.com/tuusuario" isDark={isDark} autoCapitalize="none" keyboardType="url" maxLength={LIMITS.socialUrl} hint="URL pública de Instagram, TikTok, YouTube, etc." icon={LinkIcon} />
                            )}
                            
                            <View style={{ marginTop: 24, paddingTop: 24, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                                <Text style={[styles.subtitle, { marginBottom: 16, color: colors(isDark).text }]}>Datos de Contacto (Administración)</Text>
                                <FormField styles={styles} label="Teléfono de contacto" value={contactPhone} onChangeText={setContactPhone} placeholder="+1 555-0123" isDark={isDark} keyboardType="phone-pad" hint="Para que podamos comunicarnos por la verificación." />
                                <FormField styles={styles} label="Correo de contacto" value={contactEmail} onChangeText={setContactEmail} placeholder="correo@ejemplo.com" isDark={isDark} keyboardType="email-address" autoCapitalize="none" hint="Tu correo para avisos importantes." />
                            </View>
                        </View>
                    </View>
                )}

                {formStep === totalSteps && (
                    <View style={styles.stepContent}>
                        <View style={styles.iconContainer}>
                            <ShieldCheck size={48} color="#4FC3F7" />
                        </View>
                        <Text style={styles.title}>Confirmar Verificación</Text>
                        <Text style={styles.subtitle}>Tus datos serán revisados manualmente.</Text>

                        <View style={styles.summaryBox}>
                            <Text style={styles.summaryLabel}>Tipo de Cuenta:</Text>
                            <Text style={styles.summaryVal}>{accountType === 'business' ? 'Negocio' : accountType === 'influencer' ? 'Influencer' : 'Consumidor'}</Text>

                            <Text style={styles.summaryLabel}>Documento de Identidad:</Text>
                            <Text style={styles.summaryVal}>{idFront && idBack ? 'Adjuntado' : 'Faltante'}</Text>

                            {accountType === 'business' && (
                                <>
                                    <Text style={styles.summaryLabel}>EIN:</Text>
                                    <Text style={styles.summaryVal}>{ein}</Text>
                                    <Text style={styles.summaryLabel}>Dirección:</Text>
                                    <Text style={styles.summaryVal}>{businessAddress}</Text>
                                </>
                            )}
                            {accountType === 'influencer' && (
                                <>
                                    <Text style={styles.summaryLabel}>Red Social:</Text>
                                    <Text style={styles.summaryVal}>{socialLink}</Text>
                                </>
                            )}
                            {accountType !== 'consumer' && (
                                <>
                                    <Text style={styles.summaryLabel}>Teléfono:</Text>
                                    <Text style={styles.summaryVal}>{contactPhone}</Text>
                                    <Text style={styles.summaryLabel}>Email:</Text>
                                    <Text style={styles.summaryVal}>{contactEmail}</Text>
                                </>
                            )}
                        </View>
                    </View>
                )}

                <View style={styles.navButtonsContainer}>
                    <View style={styles.navButtonsRow}>
                        {formStep > 1 && (
                            <TouchableOpacity style={styles.btnGhostSquare} onPress={handleBack} disabled={isSubmitting}>
                                <Text style={styles.btnGhostTextSquare}>Atrás</Text>
                            </TouchableOpacity>
                        )}
                        
                        {formStep < totalSteps ? (
                            <TouchableOpacity style={[styles.btnGhostSquare, styles.btnPrimary]} onPress={handleNext}>
                                <Text style={styles.btnPrimaryText}>Siguiente</Text>
                                <ArrowRight size={18} color="#fff" />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={[styles.btnGhostSquare, styles.btnPrimary, isSubmitting && styles.btnDisabled]} onPress={handleStartVerification} disabled={isSubmitting}>
                                <Text style={styles.btnPrimaryText}>{isSubmitting ? 'Enviando...' : 'Enviar'}</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {formStep === 1 && (
                         <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} disabled={isSubmitting}>
                            <Text style={styles.skipBtnText}>Saltar por ahora</Text>
                        </TouchableOpacity>
                    )}
                </View>

            </ScrollView>
        </KeyboardAvoidingView>
    );

    const renderSuccess = () => (
        <View style={styles.successBody}>
            <View style={[styles.iconContainer, styles.iconSuccess]}>
                <CheckCircle2 size={40} color="#059669" />
            </View>
            <Text style={styles.title}>¡Solicitud Enviada!</Text>
            <Text style={styles.subtitle}>
                Hemos recibido tu documentación. Te notificaremos cuando tu cuenta{' '}
                {accountType === 'business' ? 'de Negocio' : accountType === 'influencer' ? 'de Influencer' : ''}{' '}
                esté activa.
            </Text>
            <TouchableOpacity style={styles.btn} onPress={handleComplete} activeOpacity={0.9}>
                <Text style={styles.btnText}>Ir al Panel Principal</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container}>
                <Animated.View style={[styles.cardWrapper, { opacity: fadeAnim }]}>
                    <BlurView
                        intensity={isDark ? 30 : 60}
                        tint={isDark ? 'dark' : 'light'}
                        style={styles.card}
                    >
                        {status === 'intro' && renderIntro()}
                        {status === 'success' && renderSuccess()}
                    </BlurView>
                </Animated.View>
            </SafeAreaView>
        </AuthBackground>
    );
}

function FormSection({ styles, icon: Icon, title, children }: {
    styles: ReturnType<typeof getStyles>;
    icon: any;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                    <Icon size={16} color="#4FC3F7" />
                </View>
                <Text style={styles.sectionTitle}>{title}</Text>
            </View>
            <View style={styles.sectionBody}>{children}</View>
        </View>
    );
}

function FormField({ styles, label, value, onChangeText, placeholder, isDark, autoCapitalize, icon: Icon, maxLength, hint, keyboardType }: {
    styles: ReturnType<typeof getStyles>;
    label: string;
    value: string;
    onChangeText: (t: string) => void;
    placeholder: string;
    isDark: boolean;
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
    icon?: any;
    maxLength?: number;
    hint?: string;
    keyboardType?: 'default' | 'email-address' | 'url' | 'number-pad' | 'phone-pad';
}) {
    return (
        <View style={styles.field}>
            <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>{label}</Text>
                {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
            </View>
            <View style={styles.inputWrap}>
                {Icon && <Icon size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />}
                <TextInput
                    style={[styles.input, Icon && styles.inputWithIcon]}
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                    autoCapitalize={autoCapitalize ?? 'sentences'}
                    maxLength={maxLength}
                    keyboardType={keyboardType ?? 'default'}
                />
            </View>
        </View>
    );
}

const getStyles = (isDark: boolean, isWide: boolean) => {
    const glass = glassTokens(isDark);
    const glassCard = {
        backgroundColor: glass.bg,
        borderWidth: 1,
        borderColor: glass.border,
        ...glass.shadow,
        ...glass.backdrop,
    } as const;

    return StyleSheet.create({
        flex: { flex: 1, width: '100%' },
        container: {
            flex: 1,
            justifyContent: 'flex-start',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 16,
            width: '100%',
        },
        cardWrapper: {
            width: '100%',
            maxWidth: 520,
            flex: 1,
            maxHeight: '94%',
            alignSelf: 'center',
            borderRadius: Radius.xl,
            overflow: 'hidden',
            ...glass.shadow,
        },
        card: {
            flex: 1,
            borderRadius: Radius.xl,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.5)',
            backgroundColor: isDark ? 'rgba(17,24,39,0.45)' : 'rgba(255,255,255,0.35)',
            overflow: 'hidden',
        },

        scrollContent: {
            flexGrow: 1,
            paddingBottom: 24,
            paddingTop: 12,
        },
        progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24, marginTop: 12 },
        stepDot: { width: 32, height: 32, borderRadius: Radius.lg, backgroundColor: glass.bg, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: glass.border },
        stepActive: { backgroundColor: '#4FC3F7', borderColor: '#4FC3F7' },
        stepNum: { fontSize: 14, fontWeight: 'bold', color: isDark ? '#9CA3AF' : '#6B7280' },
        stepLine: { width: 40, height: 2, backgroundColor: glass.border, marginHorizontal: 4 },
        stepContent: { alignItems: 'stretch' },

        hero: {
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingBottom: 8,
        },
        iconContainer: {
            width: 72,
            height: 72,
            borderRadius: Radius.xl,
            backgroundColor: isDark ? 'rgba(79, 195, 247,0.18)' : 'rgba(79, 195, 247,0.12)',
            justifyContent: 'center',
            alignItems: 'center',
            alignSelf: 'center',
            marginBottom: 14,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(79, 195, 247,0.35)' : 'rgba(79, 195, 247,0.2)',
        },
        iconSuccess: { backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#D1FAE5', borderColor: 'rgba(16,185,129,0.35)' },
        title: {
            fontSize: 21,
            fontWeight: '800',
            color: colors(isDark).text,
            marginBottom: 6,
            textAlign: 'center',
        },
        subtitle: {
            fontSize: 13,
            lineHeight: 19,
            color: colors(isDark).textMuted,
            textAlign: 'center',
            paddingHorizontal: 8,
            marginBottom: 16,
        },

        formBody: {
            paddingHorizontal: 16,
            paddingTop: 12,
            gap: 12,
        },
        docsRow: { flexDirection: isWide ? 'row' : 'column', gap: 16 },
        docCol: { flex: isWide ? 1 : undefined, minWidth: 0, width: isWide ? 'auto' : '100%' },
        section: {
            borderRadius: Radius.lg,
            padding: 14,
            ...glassCard,
        },
        sectionHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(99,102,241,0.1)',
        },
        sectionIcon: {
            width: 32,
            height: 32,
            borderRadius: Radius.md,
            backgroundColor: isDark ? 'rgba(79, 195, 247,0.2)' : 'rgba(79, 195, 247,0.1)',
            alignItems: 'center',
            justifyContent: 'center',
        },
        sectionTitle: {
            fontSize: 15,
            fontWeight: '700',
            color: colors(isDark).text,
        },
        sectionBody: { gap: 4 },

        field: { marginBottom: 12 },
        fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 },
        fieldLabel: {
            fontSize: 12,
            fontWeight: '600',
            color: colors(isDark).textMuted,
            flexShrink: 1,
        },
        fieldHint: {
            fontSize: 10,
            color: isDark ? '#6B7280' : '#9CA3AF',
            flexShrink: 0,
        },
        inputWrap: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            height: 48,
            borderRadius: Radius.md,
            paddingHorizontal: 14,
            backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.65)',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(99,102,241,0.15)',
        },
        input: {
            flex: 1,
            height: '100%',
            fontSize: 14,
            color: colors(isDark).text,
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
        },
        inputWithIcon: { paddingLeft: 0 },

        btn: {
            backgroundColor: 'rgba(33, 150, 243, 0.92)',
            flexDirection: 'row',
            height: 52,
            borderRadius: Radius.lg,
            paddingHorizontal: 24,
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            marginTop: 8,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.2)',
            ...glass.backdrop,
        },
        btnDisabled: {
            backgroundColor: isDark ? 'rgba(75,85,99,0.45)' : 'rgba(209,213,219,0.55)',
            borderColor: 'transparent',
        },
        btnText: { color: '#fff', fontWeight: '700', fontSize: 15, marginRight: 8 },

        btnGhost: {
            flexDirection: 'row',
            height: 52,
            borderRadius: Radius.lg,
            paddingHorizontal: 24,
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(33, 150, 243, 0.2)',
        },
        btnGhostText: { color: isDark ? '#D1D5DB' : '#2196F3', fontWeight: '600', fontSize: 15 },

        summaryBox: { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)', padding: 16, borderRadius: Radius.md, marginBottom: 24, borderWidth: 1, borderColor: glass.border },
        summaryLabel: { color: colors(isDark).textMuted, fontSize: 12, marginBottom: 2 },
        summaryVal: { color: colors(isDark).text, fontSize: 16, fontWeight: '600', marginBottom: 12 },

        navButtonsContainer: {
            marginTop: 32,
            paddingHorizontal: 8,
            alignItems: 'stretch',
            gap: 16
        },
        navButtonsRow: {
            flexDirection: 'row',
            gap: 12,
        },
        btnGhostSquare: {
            flexDirection: 'row',
            height: 52,
            borderRadius: Radius.lg,
            paddingHorizontal: 20,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(33, 150, 243, 0.3)',
        },
        btnGhostTextSquare: { color: isDark ? '#D1D5DB' : '#2196F3', fontWeight: '600', fontSize: 15, marginRight: 6 },
        btnPrimary: {
            flex: 1,
            backgroundColor: '#2196F3',
            borderColor: '#2196F3',
            ...Platform.select({
                web: { boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)' } as any,
                default: { elevation: 4, shadowColor: '#2196F3', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
            }),
        },
        btnPrimaryText: {
            color: '#fff',
            fontWeight: '700',
            fontSize: 15,
            marginRight: 6
        },
        skipBtn: {
            alignItems: 'center',
            paddingVertical: 12,
        },
        skipBtnText: {
            color: colors(isDark).textMuted,
            fontSize: 14,
            fontWeight: '600',
        },
        
        successBody: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingVertical: 32,
        },
    });
};
