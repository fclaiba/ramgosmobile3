import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Linking } from 'react-native';
import { MessageCircle, Mail, Phone, Send, ChevronRight, Inbox } from 'lucide-react-native';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { MobileHeader } from '../components/MobileHeader';
import { LinearGradient } from 'expo-linear-gradient';
import { submitSupportTicket, getSupportEmail, isZendeskEnabled } from '../utils/support';

import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { Radius, colors } from '../theme/tokens';


export default function SupportScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

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
    const zendeskEnabled = isZendeskEnabled();

    // WhatsApp Business number for live support. The number is configured at
    // build time via EXPO_PUBLIC_SUPPORT_WHATSAPP. If unset, falls back to
    // mailto: so the button always lands somewhere usable.
    const whatsappNumber = (
        process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? ''
    ).replace(/[^\d]/g, '');
    const liveChatUrl = whatsappNumber
        ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
              'Hola Ramgos, necesito ayuda con la app.',
          )}`
        : `mailto:${supportEmail}?subject=${encodeURIComponent(
              'Soporte en vivo',
          )}&body=${encodeURIComponent('Hola Ramgos, necesito asistencia urgente.')}`;

    const contactMethods = [
        {
            icon: MessageCircle,
            title: whatsappNumber ? 'Chat por WhatsApp' : 'Chat en Vivo',
            description: whatsappNumber
                ? 'Hablemos por WhatsApp Business'
                : 'Te respondemos por email mientras armamos el chat',
            available: 'Respuesta < 1h en horario',
            colors: ['#3b82f6', '#06b6d4'],
            action: async () => {
                try {
                    const canOpen = await Linking.canOpenURL(liveChatUrl);
                    if (canOpen) {
                        await Linking.openURL(liveChatUrl);
                    } else {
                        show('No se pudo abrir el chat. Probá con email.', 'error');
                    }
                } catch (err) {
                    show('No se pudo abrir el chat. Probá con email.', 'error');
                }
            },
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
                    show(`Escríbenos a ${supportEmail}`, 'info');
                }
            },
        },
        {
            icon: Phone,
            title: 'Teléfono',
            description: '+1 (555) 123-4567',
            available: 'Lun-Vie 9AM-6PM',
            colors: ['#22c55e', '#10b981'],
            action: () => show('Llamando a soporte...', 'info'),
        },
        {
            icon: Inbox,
            title: zendeskEnabled ? 'Zendesk' : 'Zendesk (desactivado)',
            description: 'Portal de tickets',
            available: zendeskEnabled ? 'Gestionado por backend' : 'Temporalmente deshabilitado',
            colors: ['#6366f1', '#4FC3F7'],
            action: () => {
                show(
                    zendeskEnabled
                        ? 'Zendesk habilitado: crea tu ticket desde el formulario.'
                        : 'Zendesk está desactivado temporalmente. Usa Email para soporte.',
                    'info',
                );
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
            show('Completa todos los campos para enviar el ticket', 'error');
            return;
        }

        if (!validateEmail(trimmedEmail)) {
            show('Introduce un correo electrónico válido para recibir la respuesta de soporte.', 'warning');
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

            show(result.channel === 'zendesk'
                ? 'Solicitud registrada en Zendesk. Te contactaremos pronto.'
                : 'Se abrió tu cliente de correo para enviar los detalles.', 'success');

            setName('');
            setEmail('');
            setSubject('');
            setMessage('');
            setCategory(categories[0]);
            setView('contact');
        } catch (error: any) {
            show(error?.message || 'Intenta de nuevo más tarde.', 'error');
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
                            <ChevronRight size={20} color={isDark ? "#4B5563" : "#ccc"} />
                        </CardContent>
                    </Card>
                </TouchableOpacity>
            ))}

            <Button style={styles.ticketButton} onPress={() => setView('ticket')}>
                <Text style={{ color: isDark ? '#000' : '#fff', fontWeight: 'bold' }}>Crear un Ticket</Text>
            </Button>
        </View>
    );

    const renderTicketForm = () => (
        <View>
            <TouchableOpacity onPress={() => setView('contact')} style={{ marginBottom: 16 }}>
                <Text style={{ color: '#2196F3' }}>← Volver a opciones de contacto</Text>
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
                            style={{ color: isDark ? '#fff' : '#000' }}
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
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
                            style={{ color: isDark ? '#fff' : '#000' }}
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
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
                            style={{ color: isDark ? '#fff' : '#000' }}
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
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
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                        />
                    </View>
                    <Button onPress={handleSubmitTicket} style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}>
                        {isSubmitting ? (
                            <>
                                <ActivityIndicator size="small" color={isDark ? "#000" : "#fff"} style={{ marginRight: 8 }} />
                                <Text style={{ color: isDark ? "#000" : "#fff", fontWeight: '600' }}>Enviando...</Text>
                            </>
                        ) : (
                            <>
                                <Send size={16} color={isDark ? "#000" : "#fff"} style={{ marginRight: 8 }} />
                                <Text style={{ color: isDark ? "#000" : "#fff", fontWeight: '600' }}>Enviar Ticket</Text>
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

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors(isDark).bg },
    content: { padding: 16 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: isDark ? '#F9FAFB' : '#111' },
    card: { borderWidth: 0, shadowColor: isDark ? '#F9FAFB' : "#000", shadowOpacity: 0.1, elevation: 2, marginBottom: 8, backgroundColor: colors(isDark).glass },
    cardContentRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    iconContainer: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    methodTitle: { fontSize: 16, fontWeight: '600', color: isDark ? '#F9FAFB' : '#333' },
    methodDesc: { fontSize: 14, color: isDark ? '#9CA3AF' : '#666' },
    methodAvail: { fontSize: 12, color: '#3b82f6', marginTop: 2 },
    ticketButton: { marginTop: 24, backgroundColor: isDark ? '#F9FAFB' : '#111' },
    label: { fontSize: 14, fontWeight: '500', marginBottom: 6, color: isDark ? '#D1D5DB' : '#333' },
    formGroup: { marginBottom: 16 },
    textArea: { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#e2e8f0', borderRadius: Radius.md, padding: 12, minHeight: 120, fontSize: 14, color: colors(isDark).text },
    categoryRow: { flexDirection: 'row', flexWrap: 'wrap' },
    categoryPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.xl, backgroundColor: colors(isDark).glass, marginRight: 8, marginBottom: 8 },
    categoryPillActive: { backgroundColor: isDark ? '#F9FAFB' : '#111', transform: [{ scale: 1.02 }] },
    categoryText: { fontSize: 12, color: colors(isDark).textMuted, fontWeight: '500' },
    categoryTextActive: { color: isDark ? '#000' : '#fff' },
    submitButton: { backgroundColor: isDark ? '#F9FAFB' : '#111', borderRadius: Radius.md, paddingVertical: 14 },
    submitButtonDisabled: { opacity: 0.7 },
});
