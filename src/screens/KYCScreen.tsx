import React, { useState, useRef, useMemo } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Animated, TextInput,
    ScrollView, Platform, KeyboardAvoidingView,
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

type Step = 'intro' | 'success';

export default function KYCScreen({ navigation, route }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = useMemo(() => getStyles(isDark), [isDark]);
    const { show } = useToast();

    const accountType = route.params?.accountType || 'consumer';
    const [step, setStep] = useState<Step>('intro');

    const [idFront, setIdFront] = useState<string | null>(null);
    const [idBack, setIdBack] = useState<string | null>(null);
    const [faceScanned, setFaceScanned] = useState(false);

    const [ein, setEin] = useState('');
    const [incorporationDoc, setIncorporationDoc] = useState<string | null>(null);
    const [businessAddress, setBusinessAddress] = useState('');
    const [premisesPhoto, setPremisesPhoto] = useState<string | null>(null);

    const [socialLink, setSocialLink] = useState('');

    const { user, markKycSubmitted } = useAuth();
    const { refreshKyc } = useFintech();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fadeAnim = useRef(new Animated.Value(1)).current;
    
    const skipKycMutation = useMutation(api.auth.skipKyc);

    const handleSkip = async () => {
        setIsSubmitting(true);
        try {
            await skipKycMutation({});
            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
        } catch (error: any) {
            show(error.message || 'Error al saltar KYC', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const transitionTo = (nextStep: Step) => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]).start();
        setTimeout(() => setStep(nextStep), 200);
    };

    const businessReady = isValidEin(ein) && incorporationDoc
        && isValidBusinessAddress(businessAddress) && premisesPhoto;
    const influencerReady = isValidSocialUrl(socialLink);
    const canSubmit = idFront && idBack && (
        accountType === 'business' ? businessReady
            : accountType === 'influencer' ? influencerReady
                : true
    );

    const handleStartVerification = async () => {
        if (!user) {
            show('Debes iniciar sesión primero', 'error');
            return;
        }
        if (!canSubmit) {
            if (!idFront || !idBack) {
                show('Adjuntá el frente y dorso del documento', 'error');
            } else if (accountType === 'business' && !isValidEin(ein)) {
                show('EIN inválido — formato XX-XXXXXXX (9 dígitos)', 'error');
            } else if (accountType === 'business' && !isValidBusinessAddress(businessAddress)) {
                show(`Dirección: mínimo ${MIN.businessAddress} caracteres`, 'error');
            } else if (accountType === 'influencer' && !isValidSocialUrl(socialLink)) {
                show('Ingresá una URL válida (ej. instagram.com/tuusuario)', 'error');
            } else {
                show('Completá todos los campos obligatorios', 'error');
            }
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
                <View style={styles.hero}>
                    <View style={styles.iconContainer}>
                        <ShieldCheck size={40} color="#4FC3F7" />
                    </View>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.subtitle}>{subtitle}</Text>
                </View>

                <View style={styles.formBody}>
                    <FormSection styles={styles} icon={User} title="Identidad">
                        <ImageUploadField
                            variant="document"
                            title="Documento de identidad — Frente"
                            images={idFront ? [idFront] : []}
                            onChange={(imgs) => setIdFront(imgs[0] ?? null)}
                            maxImages={1}
                        />
                        <ImageUploadField
                            variant="document"
                            title="Documento de identidad — Dorso"
                            images={idBack ? [idBack] : []}
                            onChange={(imgs) => setIdBack(imgs[0] ?? null)}
                            maxImages={1}
                        />
                    </FormSection>

                    {accountType === 'business' && (
                        <>
                            <FormSection styles={styles} icon={Building2} title="Empresa">
                                <FormField
                                    styles={styles}
                                    label="Número EIN"
                                    value={ein}
                                    onChangeText={(t) => setEin(formatEin(t))}
                                    placeholder="XX-XXXXXXX"
                                    isDark={isDark}
                                    maxLength={LIMITS.ein}
                                    hint="9 dígitos · formato XX-XXXXXXX"
                                    keyboardType="number-pad"
                                />
                                <ImageUploadField
                                    variant="document"
                                    title="Certificado de incorporación"
                                    images={incorporationDoc ? [incorporationDoc] : []}
                                    onChange={(imgs) => setIncorporationDoc(imgs[0] ?? null)}
                                    maxImages={1}
                                />
                            </FormSection>

                            <FormSection styles={styles} icon={MapPin} title="Ubicación física">
                                <FormField
                                    styles={styles}
                                    label="Dirección del local"
                                    value={businessAddress}
                                    onChangeText={(t) => setBusinessAddress(clamp(t, LIMITS.businessAddress))}
                                    placeholder="Calle, ciudad, NY"
                                    isDark={isDark}
                                    maxLength={LIMITS.businessAddress}
                                    hint={`${businessAddress.length}/${LIMITS.businessAddress} · mín. ${MIN.businessAddress}`}
                                />
                                <ImageUploadField
                                    variant="document"
                                    title="Foto del local comercial"
                                    images={premisesPhoto ? [premisesPhoto] : []}
                                    onChange={(imgs) => setPremisesPhoto(imgs[0] ?? null)}
                                    maxImages={1}
                                />
                            </FormSection>
                        </>
                    )}

                    {accountType === 'influencer' && (
                        <FormSection styles={styles} icon={LinkIcon} title="Red social">
                            <FormField
                                styles={styles}
                                label="Perfil principal"
                                value={socialLink}
                                onChangeText={(t) => setSocialLink(clamp(t, LIMITS.socialUrl))}
                                placeholder="https://instagram.com/tuusuario"
                                isDark={isDark}
                                autoCapitalize="none"
                                keyboardType="url"
                                maxLength={LIMITS.socialUrl}
                                hint="URL pública de Instagram, TikTok, YouTube, etc."
                                icon={LinkIcon}
                            />
                        </FormSection>
                    )}

                    <TouchableOpacity
                        style={[styles.btn, (isSubmitting || !canSubmit) && styles.btnDisabled]}
                        disabled={isSubmitting || !canSubmit}
                        onPress={handleStartVerification}
                        activeOpacity={0.9}
                    >
                        <Text style={styles.btnText}>
                            {isSubmitting ? 'Enviando…' : 'Enviar para Verificación'}
                        </Text>
                        {!isSubmitting && <ArrowRight size={20} color="#fff" />}
                    </TouchableOpacity>

                    {accountType === 'consumer' && (
                        <TouchableOpacity
                            style={styles.btnGhost}
                            onPress={handleSkip}
                            activeOpacity={0.9}
                            disabled={isSubmitting}
                        >
                            <Text style={styles.btnGhostText}>Saltar por ahora</Text>
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
                        {step === 'intro' && renderIntro()}
                        {step === 'success' && renderSuccess()}
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

const getStyles = (isDark: boolean) => {
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
        },
        hero: {
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingTop: 24,
            paddingBottom: 8,
        },
        iconContainer: {
            width: 72,
            height: 72,
            borderRadius: Radius.xl,
            backgroundColor: isDark ? 'rgba(79, 195, 247,0.18)' : 'rgba(79, 195, 247,0.12)',
            justifyContent: 'center',
            alignItems: 'center',
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
        },

        formBody: {
            paddingHorizontal: 16,
            paddingTop: 12,
            gap: 12,
        },
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

        successBody: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingVertical: 32,
        },
    });
};
