import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    useWindowDimensions,
    ActivityIndicator,
    TextInput,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MobileHeader } from '../components/MobileHeader';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { Radius, colors, glassShadow } from '../theme/tokens';
import { glassGradient } from '../utils/glass';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Plus, X, ListTodo, Calendar, Phone, Mail, CheckCircle2, Copy } from 'lucide-react-native';
import { ResponsiveLayout } from '../components/ResponsiveLayout';
import { DesktopSidebar } from '../components/DesktopSidebar';
import { useResponsive } from '../hooks/useResponsive';
import * as Clipboard from 'expo-clipboard';

export default function BusinessFormsScreen({ navigation, route }: any) {
    const { user, sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => getStyles(isDark), [isDark]);
    const { show } = useToast();
    const { isDesktop } = useResponsive();

    const [viewMode, setViewMode] = useState<'list' | 'create' | 'responses'>('list');
    const [selectedFormId, setSelectedFormId] = useState<string | null>(null);

    // Form creation state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<'schedule_visit' | 'request_call'>('schedule_visit');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Convex calls
    const listForms = useQuery(api.businessForms.listFormsByBusiness, { sessionToken }) || [];
    const listSubmissions = useQuery(api.businessForms.listLeads, 
        selectedFormId ? { formId: selectedFormId, sessionToken } : "skip"
    );
    const createFormMutation = useMutation(api.businessForms.createForm);

    const handleCreateForm = async () => {
        if (!title.trim() || !description.trim()) {
            show('Completa todos los campos', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            await createFormMutation({
                sessionToken,
                title,
                description,
                type: type === 'schedule_visit' ? 'visit' : 'call',
            });

            show('Formulario creado exitosamente', 'success');
            setTitle('');
            setDescription('');
            setViewMode('list');
        } catch (error: any) {
            show(error.message || 'Error al crear formulario', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const copyFormLink = (formId: string) => {
        const link = `https://ramgos.com/form/${formId}`;
        Clipboard.setStringAsync(link);
        show('Enlace copiado al portapapeles', 'success');
    };

    const renderList = () => (
        <View style={styles.content}>
            <View style={styles.headerActions}>
                <Text style={styles.sectionTitle}>Tus Formularios</Text>
                <TouchableOpacity style={styles.createBtn} onPress={() => setViewMode('create')}>
                    <Plus size={20} color="#fff" />
                    <Text style={styles.createBtnText}>Crear Formulario</Text>
                </TouchableOpacity>
            </View>

            {listForms.length === 0 ? (
                <View style={styles.emptyState}>
                    <ListTodo size={48} color={isDark ? '#4B5563' : '#9CA3AF'} />
                    <Text style={styles.emptyTitle}>Sin formularios</Text>
                    <Text style={styles.emptyDesc}>Crea tu primer formulario para captar prospectos y agendas.</Text>
                </View>
            ) : (
                <View style={styles.grid}>
                    {listForms.map((form: any) => (
                        <TouchableOpacity 
                            key={form._id} 
                            style={styles.card}
                            onPress={() => {
                                setSelectedFormId(form._id);
                                setViewMode('responses');
                            }}
                        >
                            <View style={styles.cardHeader}>
                                <View style={[styles.typeIcon, { backgroundColor: form.type === 'schedule_visit' ? '#E0E7FF' : '#DCFCE7' }]}>
                                    {form.type === 'schedule_visit' ? <Calendar size={20} color="#4F46E5" /> : <Phone size={20} color="#16A34A" />}
                                </View>
                                <Badge status={form.status === 'active' ? 'success' : 'neutral'}>
                                    {form.status === 'active' ? 'Activo' : 'Inactivo'}
                                </Badge>
                            </View>
                            <Text style={styles.cardTitle}>{form.title}</Text>
                            <Text style={styles.cardDesc} numberOfLines={2}>{form.description}</Text>
                            
                            <TouchableOpacity style={styles.linkBtn} onPress={() => copyFormLink(form._id)}>
                                <Copy size={16} color={isDark ? "#9CA3AF" : "#6B7280"} />
                                <Text style={styles.linkBtnText}>Copiar Enlace</Text>
                            </TouchableOpacity>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );

    const renderCreate = () => (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.content}>
                <View style={styles.headerActions}>
                    <Text style={styles.sectionTitle}>Crear Formulario</Text>
                    <TouchableOpacity style={styles.closeBtn} onPress={() => setViewMode('list')}>
                        <X size={20} color={isDark ? '#D1D5DB' : '#4B5563'} />
                    </TouchableOpacity>
                </View>

                <View style={styles.formContainer}>
                    <Text style={styles.label}>Tipo de formulario</Text>
                    <View style={styles.typeSelector}>
                        <TouchableOpacity 
                            style={[styles.typeOption, type === 'schedule_visit' && styles.typeOptionActive]}
                            onPress={() => setType('schedule_visit')}
                        >
                            <Calendar size={20} color={type === 'schedule_visit' ? '#2563EB' : (isDark ? '#9CA3AF' : '#6B7280')} />
                            <Text style={[styles.typeOptionText, type === 'schedule_visit' && styles.typeOptionTextActive]}>Agendar Visita</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.typeOption, type === 'request_call' && styles.typeOptionActive]}
                            onPress={() => setType('request_call')}
                        >
                            <Phone size={20} color={type === 'request_call' ? '#2563EB' : (isDark ? '#9CA3AF' : '#6B7280')} />
                            <Text style={[styles.typeOptionText, type === 'request_call' && styles.typeOptionTextActive]}>Solicitar Llamada</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.label}>Título del formulario</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ej: Agenda tu clase de prueba"
                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                        value={title}
                        onChangeText={setTitle}
                    />

                    <Text style={styles.label}>Descripción</Text>
                    <TextInput
                        style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                        placeholder="Breve descripción que verán tus clientes..."
                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                        value={description}
                        onChangeText={setDescription}
                        multiline
                    />

                    <TouchableOpacity 
                        style={[styles.submitBtn, isSubmitting && { opacity: 0.7 }]} 
                        onPress={handleCreateForm}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Crear Formulario</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
    );

    const renderResponses = () => (
        <View style={styles.content}>
            <View style={styles.headerActions}>
                <Text style={styles.sectionTitle}>Respuestas</Text>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setViewMode('list')}>
                    <X size={20} color={isDark ? '#D1D5DB' : '#4B5563'} />
                </TouchableOpacity>
            </View>

            {listSubmissions === undefined ? (
                <ActivityIndicator color="#2196F3" style={{ marginTop: 40 }} />
            ) : listSubmissions.length === 0 ? (
                <View style={styles.emptyState}>
                    <Mail size={48} color={isDark ? '#4B5563' : '#9CA3AF'} />
                    <Text style={styles.emptyTitle}>Aún no hay respuestas</Text>
                    <Text style={styles.emptyDesc}>Comparte el enlace de tu formulario para comenzar a recibir solicitudes.</Text>
                </View>
            ) : (
                <View style={{ gap: 12 }}>
                    {listSubmissions.map((sub: any) => (
                        <View key={sub._id} style={styles.responseCard}>
                            <View style={styles.responseHeader}>
                                <Badge status={sub.status === 'new' ? 'warning' : 'success'}>
                                    {sub.status === 'new' ? 'Nuevo' : 'Contactado'}
                                </Badge>
                                <Text style={styles.dateText}>{new Date(sub.submittedAt).toLocaleDateString()}</Text>
                            </View>
                            {sub.answers.map((ans: any, idx: number) => (
                                <View key={idx} style={styles.answerRow}>
                                    <Text style={styles.answerLabel}>{ans.label}:</Text>
                                    <Text style={styles.answerValue}>{ans.value}</Text>
                                </View>
                            ))}
                        </View>
                    ))}
                </View>
            )}
        </View>
    );

    return (
        <ResponsiveLayout
            style={styles.container}
            sidebar={
                isDesktop ? (
                    <DesktopSidebar
                        activeSection="dashboard"
                        onSectionChange={(section) => {
                            if (section === "home") navigation.navigate("Home");
                        }}
                    />
                ) : undefined
            }
        >
            <LinearGradient
                colors={glassGradient(isDark)}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />
            <MobileHeader
                title="Captación de Leads"
                subtitle="Formularios y agendas"
                backButton={true}
                onBack={() => navigation.goBack()}
            />
            
            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
                {viewMode === 'list' && renderList()}
                {viewMode === 'create' && renderCreate()}
                {viewMode === 'responses' && renderResponses()}
            </ScrollView>
        </ResponsiveLayout>
    );
}

const Badge = ({ children, status }: { children: string, status: 'success' | 'warning' | 'neutral' }) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const bg = status === 'success' ? (isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5') : 
               status === 'warning' ? (isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7') : 
               (isDark ? 'rgba(156, 163, 175, 0.2)' : '#F3F4F6');
    const color = status === 'success' ? (isDark ? '#34D399' : '#059669') : 
                  status === 'warning' ? (isDark ? '#FBBF24' : '#D97706') : 
                  (isDark ? '#D1D5DB' : '#4B5563');
                  
    return (
        <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
            <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{children}</Text>
        </View>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#111827' : '#F9FAFB' },
    content: { padding: 16, maxWidth: 800, width: '100%', alignSelf: 'center' },
    headerActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    sectionTitle: { fontSize: 24, fontWeight: 'bold', color: colors(isDark).text },
    createBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2196F3', paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.full },
    createBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
    closeBtn: { padding: 8, backgroundColor: colors(isDark).glass, borderRadius: Radius.full },
    
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: colors(isDark).text, marginTop: 16 },
    emptyDesc: { fontSize: 14, color: colors(isDark).textMuted, textAlign: 'center', marginTop: 8, paddingHorizontal: 32 },
    
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    card: { 
        width: '100%', 
        maxWidth: 400,
        backgroundColor: colors(isDark).glass, 
        borderRadius: Radius.lg, 
        padding: 16,
        ...glassShadow(isDark),
        borderWidth: 1,
        borderColor: colors(isDark).border
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    typeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: 18, fontWeight: 'bold', color: colors(isDark).text, marginBottom: 4 },
    cardDesc: { fontSize: 14, color: colors(isDark).textMuted, marginBottom: 16 },
    linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
    linkBtnText: { fontSize: 14, color: isDark ? '#D1D5DB' : '#4B5563', fontWeight: '500' },
    
    formContainer: { backgroundColor: colors(isDark).glass, borderRadius: Radius.xl, padding: 20, ...glassShadow(isDark), borderWidth: 1, borderColor: colors(isDark).border },
    label: { fontSize: 14, fontWeight: '600', color: colors(isDark).text, marginBottom: 8, marginTop: 16 },
    input: { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#fff', borderRadius: Radius.md, padding: 12, color: colors(isDark).text, borderWidth: 1, borderColor: colors(isDark).border },
    
    typeSelector: { flexDirection: 'row', gap: 12 },
    typeOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: Radius.md, backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#fff', borderWidth: 1, borderColor: colors(isDark).border },
    typeOptionActive: { borderColor: '#2563EB', backgroundColor: isDark ? 'rgba(37, 99, 235, 0.1)' : '#EFF6FF' },
    typeOptionText: { fontSize: 14, color: colors(isDark).textMuted, fontWeight: '500' },
    typeOptionTextActive: { color: '#2563EB', fontWeight: '600' },
    
    submitBtn: { backgroundColor: '#2196F3', borderRadius: Radius.md, padding: 16, alignItems: 'center', marginTop: 24 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    
    responseCard: { backgroundColor: colors(isDark).glass, borderRadius: Radius.lg, padding: 16, ...glassShadow(isDark), borderWidth: 1, borderColor: colors(isDark).border },
    responseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    dateText: { fontSize: 12, color: colors(isDark).textMuted },
    answerRow: { flexDirection: 'row', marginBottom: 8 },
    answerLabel: { width: 120, fontSize: 14, color: colors(isDark).textMuted, fontWeight: '500' },
    answerValue: { flex: 1, fontSize: 14, color: colors(isDark).text, fontWeight: '600' },
});
