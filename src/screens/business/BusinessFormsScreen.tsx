import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Plus, ChevronLeft, Calendar, Phone } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';

function BusinessFormsScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { session, user } = useAuth();

    const forms = useQuery(api.businessForms.listFormsByBusiness, { sessionToken: session?.sessionToken });
    const createForm = useMutation(api.businessForms.createForm);

    const [isCreating, setIsCreating] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<'visit' | 'call'>('visit');

    const handleCreate = async () => {
        if (!title.trim()) {
            if (Platform.OS === 'web') window.alert("Ingresa un título para el formulario");
            else Alert.alert("Error", "Ingresa un título para el formulario");
            return;
        }

        try {
            await createForm({
                sessionToken: session?.sessionToken,
                title,
                description,
                type,
            });
            setIsCreating(false);
            setTitle('');
            setDescription('');
        } catch (error: any) {
            if (Platform.OS === 'web') window.alert(error.message);
            else Alert.alert("Error", error.message);
        }
    };

    const styles = StyleSheet.create({
        container: { flex: 1, backgroundColor: isDark ? '#111827' : '#F3F4F6' },
        header: { padding: 16, backgroundColor: isDark ? '#1F2937' : '#FFFFFF', flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
        backBtn: { marginRight: 16 },
        title: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#FFFFFF' : '#111827' },
        content: { padding: 16 },
        formCard: { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 12 },
        formTitle: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#FFFFFF' : '#111827', marginBottom: 4 },
        formDesc: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', marginBottom: 8 },
        typeTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#374151' : '#F3F4F6', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
        typeText: { fontSize: 12, color: isDark ? '#D1D5DB' : '#374151', marginLeft: 4 },
        createBtn: { backgroundColor: '#2196F3', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, marginTop: 16 },
        createBtnText: { color: '#FFFFFF', fontWeight: 'bold', marginLeft: 8 },
        input: { backgroundColor: isDark ? '#374151' : '#F9FAFB', borderRadius: 8, padding: 12, color: isDark ? '#FFFFFF' : '#111827', marginBottom: 12 },
        label: { fontSize: 14, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151', marginBottom: 8 },
        typeSelector: { flexDirection: 'row', gap: 12, marginBottom: 16 },
        typeOption: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB', alignItems: 'center' },
        typeOptionSelected: { borderColor: '#2196F3', backgroundColor: isDark ? 'rgba(33, 150, 243, 0.1)' : '#EBF5FF' },
        typeOptionText: { color: isDark ? '#D1D5DB' : '#374151', fontWeight: '500', marginTop: 4 },
        cancelBtn: { padding: 16, alignItems: 'center' },
        cancelText: { color: isDark ? '#9CA3AF' : '#6B7280', fontWeight: '600' }
    });

    if (user?.role !== 'business') {
        return (
            <View style={styles.container}>
                <Text style={[styles.title, { padding: 24, textAlign: 'center' }]}>Acceso denegado</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft size={24} color={isDark ? '#FFFFFF' : '#111827'} />
                </TouchableOpacity>
                <Text style={styles.title}>Mis Formularios</Text>
            </View>
            <ScrollView style={styles.content}>
                {isCreating ? (
                    <View style={styles.formCard}>
                        <Text style={styles.label}>Título del Formulario</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ej. Agendar cita para inspección"
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                            value={title}
                            onChangeText={setTitle}
                        />
                        <Text style={styles.label}>Descripción</Text>
                        <TextInput
                            style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                            placeholder="Detalles sobre qué esperar..."
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                            multiline
                            value={description}
                            onChangeText={setDescription}
                        />
                        <Text style={styles.label}>Tipo de Formulario</Text>
                        <View style={styles.typeSelector}>
                            <TouchableOpacity
                                style={[styles.typeOption, type === 'visit' && styles.typeOptionSelected]}
                                onPress={() => setType('visit')}
                            >
                                <Calendar size={20} color={type === 'visit' ? '#2196F3' : (isDark ? '#9CA3AF' : '#6B7280')} />
                                <Text style={styles.typeOptionText}>Agendar Visita</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.typeOption, type === 'call' && styles.typeOptionSelected]}
                                onPress={() => setType('call')}
                            >
                                <Phone size={20} color={type === 'call' ? '#2196F3' : (isDark ? '#9CA3AF' : '#6B7280')} />
                                <Text style={styles.typeOptionText}>Solicitar Llamada</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
                            <Text style={styles.createBtnText}>Guardar Formulario</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsCreating(false)}>
                            <Text style={styles.cancelText}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {forms?.map((form: any) => (
                            <View key={form._id} style={styles.formCard}>
                                <Text style={styles.formTitle}>{form.title}</Text>
                                {!!form.description && <Text style={styles.formDesc}>{form.description}</Text>}
                                <View style={styles.typeTag}>
                                    {form.type === 'visit' ? <Calendar size={14} color={isDark ? '#D1D5DB' : '#374151'} /> : <Phone size={14} color={isDark ? '#D1D5DB' : '#374151'} />}
                                    <Text style={styles.typeText}>{form.type === 'visit' ? 'Visita' : 'Llamada'}</Text>
                                </View>
                            </View>
                        ))}
                        <TouchableOpacity style={styles.createBtn} onPress={() => setIsCreating(true)}>
                            <Plus size={20} color="#FFFFFF" />
                            <Text style={styles.createBtnText}>Crear Formulario</Text>
                        </TouchableOpacity>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const HOC_KeyboardAvoidingView_BusinessFormsScreen = (props: any) => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <BusinessFormsScreen {...props} />
    </KeyboardAvoidingView>
);
export default HOC_KeyboardAvoidingView_BusinessFormsScreen;
