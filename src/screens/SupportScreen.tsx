import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, ActivityIndicator, Linking } from 'react-native';
import { MessageCircle, Mail, Phone, Send, ChevronRight, Inbox } from 'lucide-react-native';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { MobileHeader } from '../components/MobileHeader';
import { LinearGradient } from 'expo-linear-gradient';
import { submitSupportTicket, getSupportEmail } from '../utils/support';

export default function SupportScreen({ navigation }: any) {
    const [view, setView] = useState<'contact' | 'ticket'>('contact');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [category, setCategory] = useState('Soporte General');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const categories = useMemo(() => ([
        'Soporte General',
        'Pagos y Facturación',
        'Problemas con Comercios',
        'Gamificación y Puntos',
        'Cuenta y Seguridad',
    ]), []);

    const supportEmail = getSupportEmail();

    const contactMethods = [
        {
            icon: MessageCircle,
            title: 'Chat en Vivo',
            description: 'Respuesta inmediata',
            available: 'Disponible ahora',
            colors: ['#3b82f6', '#06b6d4'],
            action: () => Alert.alert('Próximamente', 'El chat en vivo estará disponible muy pronto. Mientras tanto, usa el formulario o envíanos un correo.'),
        },
        {
            icon: Mail,
            title: 'Email',
            description: supportEmail,
            available: 'Respuesta en 24h',
            colors: ['#a855f7', '#ec4899'],
            action: async () => {
                const mailto = `mailto:${supportEmail}`;
                const canOpen = await Linking.canOpenURL(mailto);
                if (canOpen) {
                    await Linking.openURL(mailto);
                } else {
                    Alert.alert('Info', `Escríbenos a ${supportEmail}`);
                }
            },
        },
        {
            icon: Phone,
            title: 'Teléfono',
            description: '+1 (555) 123-4567',
            available: 'Lun-Vie 9AM-6PM',
            colors: ['#22c55e', '#10b981'],
            action: () => Alert.alert('Llamada', 'Llamando...'),
        },
        {
            icon: Inbox,
            title: 'Zendesk',
            description: 'Portal de tickets',
            available: '24/7 Auto-servicio',
            colors: ['#6366f1', '#8b5cf6'],
            action: async () => {
                const subdomain = process.env.EXPO_PUBLIC_ZENDESK_SUBDOMAIN || 'ramgos';
                const url = `https://${subdomain}.zendesk.com`;
                const canOpen = await Linking.canOpenURL(url);
                if (canOpen) {
                    await Linking.openURL(url);
                } else {
                    Alert.alert('Portal Zendesk', 'No pudimos abrir el portal en este dispositivo. Intenta desde un navegador.');
                }
            },
        },
    ];

    const validateEmail = (value: string) => /\S+@\S+\.\S+/.test(value);

    const handleSubmitTicket = async () => {
        if (isSubmitting) return;

        const trimmedSubject = subject.trim();
        const trimmedMessage = message.trim();
        const trimmedEmail = email.trim();

        if (!trimmedSubject || !trimmedMessage || !trimmedEmail) {
            Alert.alert('Formulario incompleto', 'Por favor, completa correo, asunto y mensaje para crear el ticket.');
            return;
        }

        if (!validateEmail(trimmedEmail)) {
            Alert.alert('Correo inválido', 'Introduce un correo electrónico válido para recibir la respuesta de soporte.');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await submitSupportTicket({
                name: name.trim(),
                email: trimmedEmail,
                subject: trimmedSubject,
                message: trimmedMessage,
                category,
            });

            Alert.alert(
                'Ticket enviado',
                result.channel === 'zendesk'
                    ? 'Tu solicitud fue registrada en Zendesk. Te contactaremos pronto.'
                    : 'Abrimos tu cliente de correo para que puedas enviarnos todos los detalles.'
            );

            setName('');
            setEmail('');
            setSubject('');
            setMessage('');
            setCategory(categories[0]);
            setView('contact');
        } catch (error: any) {
            Alert.alert('No se pudo enviar', error?.message || 'Intenta de nuevo más tarde.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderContact = () => (
        <View>
            <Text style={styles.sectionTitle}>Contáctanos</Text>
            {contactMethods.map((method, index) => (
                <TouchableOpacity key={index} onPress={method.action} style={{ marginBottom: 12 }}>
                    <Card style={styles.card}>
                        <CardContent style={styles.cardContentRow}>
                            <LinearGradient
                                colors={method.colors as any}
                                style={styles.iconContainer}
                            >
                                <method.icon size={24} color="#fff" />
                            </LinearGradient>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.methodTitle}>{method.title}</Text>
                                <Text style={styles.methodDesc}>{method.description}</Text>
                                <Text style={styles.methodAvail}>{method.available}</Text>
                            </View>
                            <ChevronRight size={20} color="#ccc" />
                        </CardContent>
                    </Card>
                </TouchableOpacity>
            ))}

            <Button style={styles.ticketButton} onPress={() => setView('ticket')}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Crear un Ticket</Text>
            </Button>
        </View>
    );

    const renderTicketForm = () => (
        <View>
            <TouchableOpacity onPress={() => setView('contact')} style={{ marginBottom: 16 }}>
                <Text style={{ color: '#007AFF' }}>← Volver a opciones de contacto</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Nuevo Ticket</Text>
            <Card style={styles.card}>
                <CardContent style={{ padding: 16 }}>
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Nombre</Text>
                        <Input
                            placeholder="Tu nombre completo"
                            value={name}
                            onChangeText={setName}
                            autoCapitalize="words"
                        />
                    </View>
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Correo de contacto</Text>
                        <Input
                            placeholder="tu@email.com"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Categoría</Text>
                        <View style={styles.categoryRow}>
                            {categories.map(item => {
                                const isActive = item === category;
                                return (
                                    <TouchableOpacity
                                        key={item}
                                        onPress={() => setCategory(item)}
                                        style={[styles.categoryPill, isActive && styles.categoryPillActive]}
                                    >
                                        <Text style={[styles.categoryText, isActive && styles.categoryTextActive]}>
                                            {item}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Asunto</Text>
                        <Input
                            placeholder="Breve descripción del problema"
                            value={subject}
                            onChangeText={setSubject}
                        />
                    </View>
                    <View style={[styles.formGroup, { marginBottom: 0 }]}>
                        <Text style={styles.label}>Mensaje</Text>
                        <TextInput
                            placeholder="Describe tu problema en detalle..."
                            value={message}
                            onChangeText={setMessage}
                            multiline
                            numberOfLines={4}
                            style={styles.textArea}
                            textAlignVertical="top"
                        />
                    </View>
                    <Button onPress={handleSubmitTicket} style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}>
                        {isSubmitting ? (
                            <>
                                <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                                <Text style={{ color: '#fff', fontWeight: '600' }}>Enviando...</Text>
                            </>
                        ) : (
                            <>
                                <Send size={16} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={{ color: '#fff', fontWeight: '600' }}>Enviar Ticket</Text>
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>
        </View>
    );

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Soporte"
                subtitle="Estamos aquí para ayudarte"
                onMenuPress={() => navigation.openDrawer && navigation.openDrawer()}
                backButton
                onBack={() => navigation.goBack()}
            />
            <ScrollView contentContainerStyle={styles.content}>
                {view === 'contact' ? renderContact() : renderTicketForm()}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    content: { padding: 16 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#111' },
    card: { borderWidth: 0, shadowColor: "#000", shadowOpacity: 0.1, elevation: 2, marginBottom: 8 },
    cardContentRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    iconContainer: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    methodTitle: { fontSize: 16, fontWeight: '600', color: '#333' },
    methodDesc: { fontSize: 14, color: '#666' },
    methodAvail: { fontSize: 12, color: '#3b82f6', marginTop: 2 },
    ticketButton: { marginTop: 24, backgroundColor: '#111' },
    label: { fontSize: 14, fontWeight: '500', marginBottom: 6, color: '#333' },
    formGroup: { marginBottom: 16 },
    textArea: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, minHeight: 120, fontSize: 14, color: '#1f2937' },
    categoryRow: { flexDirection: 'row', flexWrap: 'wrap' },
    categoryPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', marginRight: 8, marginBottom: 8 },
    categoryPillActive: { backgroundColor: '#111', transform: [{ scale: 1.02 }] },
    categoryText: { fontSize: 12, color: '#4b5563', fontWeight: '500' },
    categoryTextActive: { color: '#fff' },
    submitButton: { backgroundColor: '#111', borderRadius: 12, paddingVertical: 14 },
    submitButtonDisabled: { opacity: 0.7 },
});
