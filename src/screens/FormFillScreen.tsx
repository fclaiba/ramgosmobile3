import React, { useState, useEffect, useMemo } from 'react';
import { 
    View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, 
    ActivityIndicator, KeyboardAvoidingView, Platform, useWindowDimensions 
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { Radius, colors, glassShadow } from '../theme/tokens';
import { CheckCircle2, ChevronLeft, Send, Sparkles, HelpCircle, FileText, Calendar, LifeBuoy, ChevronRight, Clock } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

const QUERY_TYPES = [
    { id: 'general', label: 'Consulta General', icon: HelpCircle },
    { id: 'quote', label: 'Cotización', icon: FileText },
    { id: 'visit', label: 'Agendar Visita', icon: Calendar },
    { id: 'support', label: 'Soporte', icon: LifeBuoy },
];

export default function FormFillScreen({
    businessId: propBusinessId,
    businessName: propBusinessName,
    formId: propFormId,
    /** `'visit'` entra derecho al selector de día/horario, salteando el paso 1.
     *  Es lo que usa el CTA "Agendar cita" del perfil comercial. */
    initialQueryType: propInitialQueryType,
    onClose,
}: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { width } = useWindowDimensions();
    const styles = getStyles(isDark, width);
    
    // Fecha local en YYYY-MM-DD, sin pasar por UTC.
    const fmtLocalDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const params = route?.params || {};
    const businessId = propBusinessId || params.businessId;
    const businessName = propBusinessName || params.businessName;
    const initialFormId = propFormId || params.formId;
    const initialQueryType = propInitialQueryType || params.initialQueryType;

    const { user, sessionToken } = useAuth();
    const { show } = useToast();

    // Convex calls
    const publicForms = useQuery(api.businessForms.getPublicForms, { businessId }) || [];
    const directForm = useQuery(api.businessForms.getForm, { formId: initialFormId });
    const businessSettings = useQuery(api.businessSettings.getSettings, { businessId });
    const submitLead = useMutation(api.businessForms.submitLead);

    /**
     * H5: los horarios los da el SERVIDOR.
     *
     * Antes esta pantalla armaba la grilla sola (día por día, hora por hora) y
     * el backend guardaba lo que le mandaran: nadie chequeaba si el horario ya
     * estaba tomado, así que dos personas reservaban el mismo. Además la
     * armaba con la zona horaria DEL TELÉFONO, así que un comprador de otra
     * zona veía horarios que el negocio no ofrecía.
     */
    const [nowMs] = useState(() => Date.now());

    // States
    const [step, setStep] = useState(initialFormId || initialQueryType ? 2 : 1);
    const [selectedForm, setSelectedForm] = useState<any>(null); // from publicForms
    
    // User Inputs
    const [message, setMessage] = useState('');
    const [queryType, setQueryType] = useState(initialQueryType || 'general');

    const [selectedDate, setSelectedDate] = useState<string>('');
    const [selectedTime, setSelectedTime] = useState<string>('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const isVisit = selectedForm ? selectedForm.type === 'visit' : queryType === 'visit';

    // Días candidatos. Qué horarios tiene cada uno lo decide el servidor.
    const nextDays = useMemo(() => {
        if (!businessSettings || !businessSettings.workingDays.length) return [];
        const days: Array<{ dateString: string; label: string; isToday: boolean }> = [];
        const cursor = new Date();
        const today = fmtLocalDate(new Date());
        for (let i = 0; days.length < 14 && i < 60; i++) {
            if (businessSettings.workingDays.includes(cursor.getDay())) {
                // `toISOString()` acá corría el día: convierte a UTC, así que a
                // la noche en NY devolvía la fecha de mañana.
                const dateString = fmtLocalDate(cursor);
                days.push({
                    dateString,
                    label: cursor.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }),
                    isToday: dateString === today,
                });
            }
            cursor.setDate(cursor.getDate() + 1);
        }
        return days;
    }, [businessSettings]);

    // La grilla real, ya sin los horarios ocupados.
    const slotsResult = useQuery(
        api.agenda.getAvailableSlots,
        selectedDate ? { businessId, date: selectedDate, nowMs } : 'skip',
    );
    const availableSlots = (slotsResult?.slots ?? []).map((s: any) => s.slotTime);
    const slotsLoading = !!selectedDate && slotsResult === undefined;

    useEffect(() => {
        if (initialFormId && directForm !== undefined) {
            setSelectedForm(directForm);
            setStep(2);
        }
    }, [initialFormId, directForm]);

    useEffect(() => {
        if (!selectedForm && (!message || message.startsWith('Hola,'))) {
            if (queryType === 'general') setMessage('Hola, quisiera hacerles una consulta...');
            if (queryType === 'quote') setMessage('Hola, me gustaría solicitar una cotización sobre...');
            if (queryType === 'support') setMessage('Hola, tengo un problema con...');
            if (queryType === 'visit') setMessage(''); // No ponemos nada, el usuario elegirá fecha/hora.
        }
    }, [queryType, selectedForm]);

    // Seleccionar automáticamente el primer día cuando cambie de tipo
    useEffect(() => {
        if (isVisit && nextDays.length > 0 && !selectedDate) {
            setSelectedDate(nextDays[0].dateString);
        }
    }, [isVisit, nextDays]);

    // Si el horario elegido ya no está en la grilla (cambió el día, o alguien
    // lo reservó mientras tanto), se deselecciona en vez de mandarlo igual.
    useEffect(() => {
        if (selectedTime && !availableSlots.includes(selectedTime)) setSelectedTime('');
    }, [availableSlots, selectedTime]);

    const handleBack = () => {
        if (isSuccess) {
            onClose ? onClose() : navigation.goBack();
            return;
        }
        if (step === 2 && !initialFormId && !initialQueryType) {
            setStep(1);
            setSelectedForm(null);
            setSelectedDate('');
            setSelectedTime('');
        } else {
            onClose ? onClose() : navigation.goBack();
        }
    };

    const handleSubmit = async () => {
        if (!isVisit && !message.trim()) {
            show('Por favor, ingresa el motivo de la consulta.', 'error');
            return;
        }

        if (isVisit && !businessSettings) {
            show('Este negocio aún no tiene horarios configurados. Por favor intenta otro tipo de consulta.', 'error');
            return;
        }

        if (isVisit && businessSettings && (!selectedDate || !selectedTime)) {
            show('Por favor, selecciona una fecha y hora.', 'error');
            return;
        }
        
        setIsSubmitting(true);
        try {
            let finalFormId = selectedForm ? selectedForm._id : undefined;
            let finalMessage = selectedForm ? message : (isVisit ? 'Reserva de visita agendada.' : `[${queryType}] ${message}`);

            await submitLead({
                formId: finalFormId,
                businessId,
                message: finalMessage,
                scheduledDate: selectedDate || undefined,
                scheduledTime: selectedTime || undefined,
                sessionToken
            });
            setIsSuccess(true);
        } catch (error: any) {
            show(error?.message || 'Error al enviar el formulario', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (initialFormId && directForm === undefined) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#3B82F6" />
            </View>
        );
    }

    if (isSuccess) {
        return (
            <View style={styles.container}>
                <LinearGradient colors={isDark ? ['#022c22', '#064e3b'] : ['#ecfdf5', '#d1fae5']} style={StyleSheet.absoluteFill} />
                <View style={styles.successContainer}>
                    <View style={styles.successIconWrapper}>
                        <CheckCircle2 size={80} color={isDark ? "#34d399" : "#10b981"} />
                        <Sparkles size={24} color="#f59e0b" style={styles.sparkleIcon} />
                    </View>
                    <Text style={styles.successTitle}>¡{isVisit ? 'Cita Agendada!' : 'Mensaje Enviado!'}</Text>
                    <Text style={styles.successDesc}>
                        {isVisit ? 'Tu solicitud de visita ha sido enviada.' : 'Tus datos han sido enviados.'}
                    </Text>
                    <TouchableOpacity style={styles.btnSuccess} onPress={handleBack} activeOpacity={0.8}>
                        <Text style={styles.btnSuccessText}>Volver al Perfil</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const renderStep1 = () => (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.infoCard}>
                <Text style={styles.subtitle}>Contactar a {businessName}</Text>
                <Text style={styles.description}>¿Qué tipo de información necesitás?</Text>
            </View>

            {publicForms.length > 0 && (
                <View style={styles.sectionBlock}>
                    <Text style={styles.sectionHeader}>Formularios Oficiales</Text>
                    {publicForms.map((f: any) => (
                        <TouchableOpacity 
                            key={f._id} 
                            style={styles.formSelectionCard} 
                            activeOpacity={0.8}
                            onPress={() => {
                                setSelectedForm(f);
                                setMessage(''); 
                                setStep(2);
                            }}
                        >
                            <LinearGradient
                                colors={isDark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)'] : ['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.4)']}
                                style={StyleSheet.absoluteFill}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            />
                            <View style={styles.formSelectionIcon}>
                                {f.type === 'visit' ? <Calendar size={20} color="#3B82F6" /> : <FileText size={20} color="#3B82F6" />}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.formSelectionTitle}>{f.title}</Text>
                                {f.description ? <Text style={styles.formSelectionDesc} numberOfLines={2}>{f.description}</Text> : null}
                            </View>
                            <ChevronRight size={20} color={colors(isDark).textMuted} />
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            <View style={styles.sectionBlock}>
                <Text style={styles.sectionHeader}>Consulta Rápida</Text>
                <BlurView intensity={isDark ? 40 : 80} tint={isDark ? 'dark' : 'light'} style={styles.quickQueryContainer}>
                    {QUERY_TYPES.map(type => {
                        const Icon = type.icon;
                        return (
                            <TouchableOpacity 
                                key={type.id}
                                style={styles.quickQueryOption}
                                onPress={() => {
                                    setSelectedForm(null);
                                    setQueryType(type.id);
                                    setStep(2);
                                }}
                            >
                                <View style={styles.quickQueryIconWrapper}>
                                    <Icon size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
                                </View>
                                <Text style={styles.quickQueryText}>{type.label}</Text>
                                <ChevronRight size={16} color={colors(isDark).border} />
                            </TouchableOpacity>
                        );
                    })}
                </BlurView>
            </View>
        </ScrollView>
    );

    const renderStep2 = () => {
        const titleText = selectedForm ? selectedForm.title : 'Consulta Rápida';
        const descText = selectedForm && selectedForm.description ? selectedForm.description : 'Completá tus datos para que se contacten con vos.';

        return (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                    
                    <View style={styles.infoCard}>
                        <Text style={styles.subtitle}>{titleText}</Text>
                        <Text style={styles.description}>{descText}</Text>
                    </View>
                    
                    <BlurView intensity={isDark ? 40 : 80} tint={isDark ? 'dark' : 'light'} style={styles.formContainer}>
                        
                        {businessSettings === null && (
                            <View style={{ padding: 20, alignItems: 'center' }}>
                                <ActivityIndicator color="#3b82f6" />
                            </View>
                        )}

                        {isVisit && businessSettings === null && (
                            <View style={{ padding: 16, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: Radius.md, marginBottom: 20 }}>
                                <Text style={{ color: '#ef4444', textAlign: 'center', fontWeight: '600' }}>El negocio no tiene horarios disponibles configurados. Por favor elegí otro tipo de consulta o contactalo directamente.</Text>
                            </View>
                        )}

                        {isVisit && businessSettings && nextDays.length === 0 && (
                            <View style={{ padding: 16, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: Radius.md, marginBottom: 20 }}>
                                <Text style={{ color: '#ef4444', textAlign: 'center', fontWeight: '600' }}>El negocio no tiene horarios disponibles configurados.</Text>
                            </View>
                        )}

                        {isVisit && businessSettings && nextDays.length > 0 && (
                            <View style={styles.fieldGroup}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                                    <Calendar size={16} color={isDark ? '#e5e7eb' : '#374151'} />
                                    <Text style={[styles.label, { marginBottom: 0 }]}>Día de la cita <Text style={styles.asterisk}>*</Text></Text>
                                </View>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24, paddingHorizontal: 24, paddingBottom: 8 }}>
                                    {nextDays.map(day => (
                                        <TouchableOpacity
                                            key={day.dateString}
                                            onPress={() => {
                                                setSelectedDate(day.dateString);
                                                setSelectedTime('');
                                            }}
                                            style={[
                                                styles.dateChip,
                                                selectedDate === day.dateString && styles.dateChipActive
                                            ]}
                                        >
                                            <Text style={[styles.dateChipText, selectedDate === day.dateString && styles.dateChipTextActive]}>
                                                {day.isToday ? 'Hoy' : day.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                    <View style={{ width: 24 }} />
                                </ScrollView>

                                {selectedDate ? (
                                    <>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 12 }}>
                                            <Clock size={16} color={isDark ? '#e5e7eb' : '#374151'} />
                                            <Text style={[styles.label, { marginBottom: 0 }]}>Horario <Text style={styles.asterisk}>*</Text></Text>
                                        </View>
                                        <View style={styles.timeGrid}>
                                            {availableSlots.length > 0 ? availableSlots.map(time => (
                                                <TouchableOpacity
                                                    key={time}
                                                    onPress={() => setSelectedTime(time)}
                                                    style={[
                                                        styles.timeChip,
                                                        selectedTime === time && styles.timeChipActive
                                                    ]}
                                                >
                                                    <Text style={[styles.timeChipText, selectedTime === time && styles.timeChipTextActive]}>
                                                        {time}
                                                    </Text>
                                                </TouchableOpacity>
                                            )) : (
                                                <Text style={{ color: colors(isDark).textMuted, fontStyle: 'italic' }}>
                                                    {slotsLoading
                                                        ? 'Buscando horarios disponibles…'
                                                        : 'No quedan turnos libres para este día.'}
                                                </Text>
                                            )}
                                        </View>
                                    </>
                                ) : null}
                            </View>
                        )}





                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>{selectedForm ? 'Mensaje adicional' : 'Tu consulta'} <Text style={styles.asterisk}>*</Text></Text>
                                <TextInput
                                    style={[styles.input, styles.textArea]}
                                    multiline
                                    placeholder="Escribe aquí..."
                                    placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                                    value={message}
                                    onChangeText={setMessage}
                                    textAlignVertical="top"
                                />
                        </View>
                        
                        <TouchableOpacity 
                            style={[styles.submitBtn, (isSubmitting || (isVisit && (!selectedDate || !selectedTime))) && { opacity: 0.7 }]} 
                            onPress={handleSubmit}
                            disabled={isSubmitting || (isVisit && (!selectedDate || !selectedTime))}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={['#3B82F6', '#1D4ED8']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                style={styles.submitGradient}
                            >
                                {isSubmitting ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <>
                                        <Send size={18} color="#fff" />
                                        <Text style={styles.submitBtnText}>{isVisit ? 'Confirmar Cita' : 'Enviar Solicitud'}</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                        
                        <Text style={styles.privacyText}>
                            Al enviar aceptás nuestras políticas de privacidad.
                        </Text>
                    </BlurView>
                </ScrollView>
            </KeyboardAvoidingView>
        );
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={isDark ? ['#1e3a8a30', '#111827'] : ['#dbeafe60', '#f9fafb']}
                style={StyleSheet.absoluteFill}
            />
            <View style={styles.header}>
                <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
                    <ChevronLeft size={24} color={colors(isDark).text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {step === 1 ? 'Seleccionar Consulta' : `Formulario de Contacto`}
                </Text>
                <View style={{ width: 40 }} />
            </View>
            
            {step === 1 ? renderStep1() : renderStep2()}
        </View>
    );
}

const getStyles = (isDark: boolean, width: number) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors(isDark).bg },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20, backgroundColor: colors(isDark).glass,
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors(isDark).text, flex: 1, textAlign: 'center' },
    scroll: { padding: 20, paddingBottom: 60 },
    infoCard: { marginBottom: 24, paddingHorizontal: 4 },
    subtitle: { fontSize: 14, color: '#3b82f6', fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
    description: { fontSize: 16, color: colors(isDark).text, fontWeight: '600', lineHeight: 22 },
    
    sectionBlock: { marginBottom: 32 },
    sectionHeader: { fontSize: 15, fontWeight: '700', color: colors(isDark).textMuted, marginBottom: 12, marginLeft: 4 },
    
    formSelectionCard: {
        flexDirection: 'row', alignItems: 'center',
        padding: 16, borderRadius: Radius.xl, marginBottom: 12,
        backgroundColor: colors(isDark).glass,
        borderWidth: 1, borderColor: colors(isDark).border, overflow: 'hidden'
    },
    formSelectionIcon: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#dbeafe',
        alignItems: 'center', justifyContent: 'center', marginRight: 16
    },
    formSelectionTitle: { fontSize: 16, fontWeight: '700', color: colors(isDark).text, marginBottom: 4 },
    formSelectionDesc: { fontSize: 13, color: colors(isDark).textMuted, lineHeight: 18 },

    quickQueryContainer: {
        borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors(isDark).border
    },
    quickQueryOption: {
        flexDirection: 'row', alignItems: 'center', padding: 16,
        borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
    },
    quickQueryIconWrapper: { width: 32, alignItems: 'center' },
    quickQueryText: { flex: 1, fontSize: 15, color: colors(isDark).text, fontWeight: '600' },

    formContainer: { borderRadius: Radius['2xl'], padding: 24, ...glassShadow(isDark), borderWidth: 1, borderColor: colors(isDark).border, overflow: 'hidden' },
    fieldGroup: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: colors(isDark).text, marginBottom: 8 },
    asterisk: { color: '#EF4444' },
    input: { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#ffffff', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb', borderRadius: Radius.lg, paddingHorizontal: 16, height: 52, color: colors(isDark).text, fontSize: 15 },
    textArea: { height: 100, paddingTop: 16 },

    dateChip: {
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6',
        borderRadius: Radius.lg, marginRight: 10,
        borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb'
    },
    dateChipActive: {
        backgroundColor: '#3b82f6', borderColor: '#2563eb'
    },
    dateChipText: {
        color: colors(isDark).text, fontWeight: '600'
    },
    dateChipTextActive: {
        color: '#ffffff'
    },

    timeGrid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 10
    },
    timeChip: {
        width: '30%', paddingVertical: 12, alignItems: 'center',
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6',
        borderRadius: Radius.md,
        borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb'
    },
    timeChipActive: {
        backgroundColor: '#3b82f6', borderColor: '#2563eb'
    },
    timeChipText: {
        color: colors(isDark).text, fontWeight: '500'
    },
    timeChipTextActive: {
        color: '#ffffff', fontWeight: '700'
    },
    
    submitBtn: { marginTop: 12, borderRadius: Radius.lg, overflow: 'hidden' },
    submitGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 54, gap: 8 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
    privacyText: { fontSize: 12, color: colors(isDark).textMuted, textAlign: 'center', marginTop: 20, lineHeight: 18 },
    
    successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    successIconWrapper: { position: 'relative', marginBottom: 24 },
    sparkleIcon: { position: 'absolute', top: -10, right: -10 },
    successTitle: { fontSize: 28, fontWeight: '800', color: isDark ? '#f8fafc' : '#0f172a', marginBottom: 12 },
    successDesc: { fontSize: 16, color: isDark ? '#94a3b8' : '#475569', textAlign: 'center', marginBottom: 40, lineHeight: 24, paddingHorizontal: 20 },
    btnSuccess: { backgroundColor: isDark ? '#10b981' : '#059669', paddingHorizontal: 32, paddingVertical: 16, borderRadius: Radius.full, width: '100%', alignItems: 'center' },
    btnSuccessText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
