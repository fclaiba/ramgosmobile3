import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { MobileHeader } from '../components/MobileHeader';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { Radius, colors, glassShadow } from '../theme/tokens';
import { CheckCircle2, Calendar, ChevronDown } from 'lucide-react-native';

export default function FormFillScreen() {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { formId, businessName } = route.params || {};
    
    const { user } = useAuth();
    const { show } = useToast();
    
    const form = useQuery(api.businessForms.getForm, { formId });
    const submitForm = useMutation(api.businessForms.submitForm);

    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    if (form === undefined) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#2196F3" />
            </View>
        );
    }
    
    if (form === null) {
        return (
            <View style={styles.container}>
                <MobileHeader title="Formulario no encontrado" backButton onBack={() => navigation.goBack()} />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <Text style={{ color: colors(isDark).textMuted }}>Este formulario ya no está disponible.</Text>
                </View>
            </View>
        );
    }

    const handleChange = (fieldId: string, value: string) => {
        setAnswers(prev => ({ ...prev, [fieldId]: value }));
    };

    const handleSubmit = async () => {
        // Validate required
        for (const field of form.fields) {
            if (field.required && (!answers[field.id] || answers[field.id].trim() === '')) {
                show(`El campo "${field.label}" es obligatorio.`, 'error');
                return;
            }
        }
        
        setIsSubmitting(true);
        try {
            const formattedAnswers = form.fields.map((f: any) => ({
                fieldId: f.id,
                label: f.label,
                value: answers[f.id] || '',
            }));
            
            await submitForm({
                formId,
                answers: formattedAnswers,
                userId: user?.id
            });
            
            setIsSuccess(true);
        } catch (error: any) {
            show(error?.message || 'Error al enviar el formulario', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <View style={styles.container}>
                <MobileHeader title={form.title} backButton onBack={() => navigation.goBack()} />
                <View style={styles.successContainer}>
                    <CheckCircle2 size={80} color="#10B981" />
                    <Text style={styles.successTitle}>¡Enviado con éxito!</Text>
                    <Text style={styles.successDesc}>Tus datos han sido enviados a {businessName}. Se pondrán en contacto contigo a la brevedad.</Text>
                    <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
                        <Text style={styles.btnText}>Volver</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <MobileHeader title={form.title} backButton onBack={() => navigation.goBack()} />
            
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scroll}>
                    <Text style={styles.subtitle}>Enviando solicitud a {businessName}</Text>
                    <Text style={styles.description}>{form.description}</Text>
                    
                    <View style={styles.formContainer}>
                        {form.fields.map((field: any) => (
                            <View key={field.id} style={styles.fieldGroup}>
                                <Text style={styles.label}>
                                    {field.label} {field.required && <Text style={{ color: '#EF4444' }}>*</Text>}
                                </Text>
                                
                                <TextInput
                                    style={styles.input}
                                    keyboardType={field.type === 'email' ? 'email-address' : field.type === 'phone' ? 'phone-pad' : 'default'}
                                    placeholder={field.type === 'date' ? 'DD/MM/AAAA' : 'Tu respuesta...'}
                                    placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                    value={answers[field.id] || ''}
                                    onChangeText={(text) => handleChange(field.id, text)}
                                />
                            </View>
                        ))}
                        
                        <TouchableOpacity 
                            style={[styles.submitBtn, isSubmitting && { opacity: 0.7 }]} 
                            onPress={handleSubmit}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Enviar Solicitud</Text>}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors(isDark).bg },
    scroll: { padding: 20 },
    subtitle: { fontSize: 13, color: '#2196F3', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 },
    description: { fontSize: 15, color: colors(isDark).textMuted, marginBottom: 24, lineHeight: 22 },
    formContainer: { backgroundColor: colors(isDark).glass, padding: 20, borderRadius: Radius.lg, ...glassShadow(isDark) },
    fieldGroup: { marginBottom: 16 },
    label: { fontSize: 14, fontWeight: '600', color: colors(isDark).text, marginBottom: 8 },
    input: { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#fff', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB', borderRadius: Radius.md, paddingHorizontal: 16, height: 48, color: colors(isDark).text, fontSize: 15 },
    submitBtn: { backgroundColor: '#2196F3', height: 50, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    
    successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    successTitle: { fontSize: 24, fontWeight: 'bold', color: colors(isDark).text, marginTop: 24, marginBottom: 12 },
    successDesc: { fontSize: 15, color: colors(isDark).textMuted, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
    btn: { backgroundColor: '#2196F3', paddingHorizontal: 32, paddingVertical: 14, borderRadius: Radius.full },
    btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
