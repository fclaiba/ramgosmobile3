import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBackground } from '../components/auth/AuthBackground';
import { ArrowLeft, Lock, Eye } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { CommonActions } from '@react-navigation/native';

export default function PrivacyScreen({ navigation, route }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const isSignup = route?.params?.origin === 'signup';
    const returnKey = route?.params?.returnKey as string | undefined;

    const handleAccept = () => {
        if (isSignup) {
            if (returnKey) {
                navigation.dispatch({
                    ...CommonActions.setParams({ privacyAccepted: true }),
                    source: returnKey,
                });
            } else {
                navigation.navigate('Register', { privacyAccepted: true });
            }
            navigation.goBack();
            return;
        }
        navigation.goBack();
    };

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container}>
                <View style={styles.card}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                            <ArrowLeft size={24} color={isDark ? "#D1D5DB" : "#4B5563"} />
                        </TouchableOpacity>
                        <Text style={styles.title}>Política de Privacidad</Text>
                        <View style={{ width: 24 }} />
                    </View>

                    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                        <View style={styles.iconContainer}>
                            <Lock size={48} color="#7C3AED" />
                        </View>

                        <Text style={styles.sectionTitle}>1. ¿QUÉ DATOS RECOPILAMOS?</Text>
                        <Text style={styles.text}>
                            Recopilamos los datos que nos proporcionas al registrarte o usar la aplicación: nombre,
                            correo electrónico, foto de perfil opcional, información de negocio o redes sociales
                            (cuando corresponda), además de datos de interacción como historial de compras, puntos,
                            juegos y preferencias.
                        </Text>

                        <Text style={styles.sectionTitle}>2. ¿CÓMO UTILIZAMOS TU INFORMACIÓN?</Text>
                        <Text style={styles.text}>
                            Los datos se emplean para habilitar funcionalidades clave de la plataforma: experiencias
                            personalizadas, acceso a promociones, verificación de identidad (KYC), prevención de fraude
                            y comunicaciones operativas. Nunca vendemos tu información personal.
                        </Text>

                        <Text style={styles.sectionTitle}>3. MAPEO DE DATOS Y ALMACENAMIENTO</Text>
                        <Text style={styles.text}>
                            Tus datos se almacenan en infraestructuras seguras dentro de centros de datos certificados.
                            Utilizamos cifrado en tránsito (TLS 1.2+) y cifrado en reposo para credenciales y datos
                            sensibles. Accesos internos se controlan mediante políticas de mínimo privilegio.
                        </Text>

                        <Text style={styles.sectionTitle}>4. VERIFICACIÓN KYC Y MEDIDAS DE SEGURIDAD</Text>
                        <Text style={styles.text}>
                            Para habilitar pagos, retiros y comisiones requerimos validaciones KYC. Los documentos e
                            imágenes aportadas son tratados mediante proveedores especializados sujetos a estrictos
                            estándares de cumplimiento (AML, GDPR, CCPA). Ramgos nunca almacena datos biométricos sin
                            tu consentimiento explícito.
                        </Text>

                        <Text style={styles.sectionTitle}>5. TUS DERECHOS DE PRIVACIDAD</Text>
                        <Text style={styles.text}>
                            Puedes solicitar acceso, rectificación o eliminación de tus datos desde la sección de
                            configuración de la app o escribiendo a soporte@ramgos.com. También puedes revocar tu
                            consentimiento para comunicaciones comerciales desde las preferencias de notificaciones.
                        </Text>

                        <Text style={styles.sectionTitle}>6. RETENCIÓN Y ELIMINACIÓN DE DATOS</Text>
                        <Text style={styles.text}>
                            Conservamos tus datos el tiempo necesario para cumplir obligaciones legales, ofrecer
                            soporte y respaldar operaciones contables. Una vez cerrado tu perfil o concluido el periodo
                            legal, la información se anonimiza o elimina de forma segura.
                        </Text>

                        <Text style={styles.sectionTitle}>7. COOKIES Y TECNOLOGÍAS SIMILARES</Text>
                        <Text style={styles.text}>
                            El ecosistema Ramgos emplea identificadores anónimos para medir rendimiento, recordar tus
                            preferencias y optimizar experiencias. Puedes desactivarlos desde los ajustes de tu
                            dispositivo, entendiendo que algunas funciones pueden verse afectadas.
                        </Text>

                        <Text style={styles.sectionTitle}>8. TRANSFERENCIAS INTERNACIONALES</Text>
                        <Text style={styles.text}>
                            Si tus datos se transfieren fuera de tu país, garantizamos salvaguardas contractuales y
                            técnicas equivalentes a los estándares internacionales de protección de datos.
                        </Text>

                        <Text style={styles.sectionTitle}>9. ACTUALIZACIONES DE ESTA POLÍTICA</Text>
                        <Text style={styles.text}>
                            Publicaremos los cambios dentro de la app e indicaremos la fecha de última actualización.
                            Continúa usando Ramgos solo si estás conforme con las revisiones aplicadas.
                        </Text>

                        <Text style={styles.sectionTitle}>10. CONTACTO LEGAL</Text>
                        <Text style={styles.text}>
                            Para cualquier duda legal o relacionada con privacidad, puedes escribirnos a
                            soporte@ramgos.com indicando en el asunto “Privacidad”.
                        </Text>

                        <View style={{ height: 40 }} />
                    </ScrollView>

                    <TouchableOpacity onPress={handleAccept} style={styles.btn}>
                        <Text style={styles.btnText}>{isSignup ? 'Aceptar y Continuar' : 'Entendido'}</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </AuthBackground>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 16 },
    card: {
        flex: 1,
        backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        maxWidth: 500,
        alignSelf: 'center',
        shadowColor: isDark ? '#000' : '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: isDark ? 0.3 : 0.1,
        shadowRadius: 20,
        elevation: 10,
        marginVertical: 20,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    backBtn: { padding: 4 },
    title: { fontSize: 20, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827' },
    scroll: { flex: 1 },
    iconContainer: {
        alignSelf: 'center',
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: isDark ? '#2E1065' : '#ede9fe',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24
    },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#E5E7EB' : '#374151', marginBottom: 8, marginTop: 16 },
    text: { fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280', lineHeight: 20 },
    btn: { backgroundColor: '#7C3AED', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});






