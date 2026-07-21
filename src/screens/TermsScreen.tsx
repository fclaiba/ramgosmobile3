import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBackground } from '../components/auth/AuthBackground';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { CommonActions } from '@react-navigation/native';
import { glassShadow, Radius, colors } from '../theme/tokens';


export default function TermsScreen({ navigation, route }: any) {
    const { colorScheme } = useTheme();
    const { acceptCurrentTerms, user } = useAuth();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    // Check if opened in blocking mode (forced acceptance)
    const isBlocking = route?.params?.mode === 'blocking';
    const isSignup = route?.params?.origin === 'signup';
    const returnKey = route?.params?.returnKey as string | undefined;

    const handleAccept = async () => {
        try {
            if (isBlocking) {
                await acceptCurrentTerms();
                // After accepting terms in blocking mode, route user to the next required step.
                // This must work for all roles (consumer/business/influencer).
                const next =
                    !user
                        ? { screen: 'Welcome', params: undefined as any }
                        : (!user.nickname && !user.name)
                            ? { screen: 'BasicProfileSetup', params: undefined as any }
                            : { screen: 'Home', params: undefined as any };

                navigation.reset({
                    index: 0,
                    routes: [{ name: next.screen, params: next.params }],
                });
                return;
            }

            if (isSignup) {
                // In signup flow, mark acceptance on the existing Register route (preserves form state),
                // then just goBack to return to the same instance.
                if (returnKey) {
                    navigation.dispatch({
                        ...CommonActions.setParams({ termsAccepted: true }),
                        source: returnKey,
                    });
                } else {
                    // Fallback if returnKey wasn't provided
                    navigation.navigate('Register', { termsAccepted: true });
                }
                navigation.goBack();
                return;
            }

            navigation.goBack();
            // If blocking, the AuthContext state update should trigger a navigation reset or re-evaluation
        } catch (error) {
            console.error('Failed to accept terms', error);
        }
    };

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container}>
                <View style={styles.card}>
                    {/* Header */}
                    <View style={styles.header}>
                        {!isBlocking && (
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                                <ArrowLeft size={24} color={isDark ? "#D1D5DB" : "#4B5563"} />
                            </TouchableOpacity>
                        )}
                        <Text style={styles.title}>Términos y Condiciones</Text>
                        <View style={{ width: 24 }} />
                    </View>

                    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                        <View style={styles.iconContainer}>
                            <ShieldCheck size={48} color="#2196F3" />
                        </View>
                        {/* ... text content ... */}

                        <Text style={styles.sectionTitle}>1. ACEPTACIÓN DE LOS TÉRMINOS</Text>
                        <Text style={styles.text}>
                            Al acceder a la aplicación mediante tu cuenta de red social, Google o cualquier otro método de autenticación, aceptas los presentes Términos y Condiciones en su totalidad.
                            Ramgos podrá actualizar estos términos en cualquier momento, notificando los cambios dentro de la app o por correo electrónico.
                        </Text>

                        <Text style={styles.sectionTitle}>2. REGISTRO Y AUTENTICACIÓN</Text>
                        <Text style={styles.text}>
                            <Text style={styles.bold}>Autenticación:</Text> Todos los usuarios (clientes, negocios e influencers) deberán registrarse utilizando un método seguro de autenticación (Google, Redes Sociales, etc.).{'\n\n'}
                            <Text style={styles.bold}>Verificación KYC:</Text> Para determinadas funciones (pagos, bonos, comisiones, retiros, etc.) se requerirá verificación KYC (Know Your Customer), lo que incluye la validación de identidad mediante documentos oficiales y/o verificación facial.
                        </Text>

                        <Text style={styles.sectionTitle}>3. ROLES DE USUARIO</Text>

                        <Text style={styles.subTitle}>🧍‍♂️ USUARIOS (CONSUMIDORES)</Text>
                        <Text style={styles.text}>
                            Al registrarte como usuario aceptas los siguientes términos:{'\n'}
                            • Podrás acceder a mapas, bonos, puntos y promociones exclusivas.{'\n'}
                            • La información personal será tratada conforme a nuestra Política de Privacidad.{'\n'}
                            • Los pagos dentro de la app se procesarán mediante pasarelas seguras y cifradas.{'\n'}
                            • El usuario acepta que su cuenta es personal e intransferible.{'\n'}
                            • Cualquier intento de fraude, manipulación de puntos o abuso de promociones podrá resultar en la suspensión o eliminación de la cuenta.
                        </Text>

                        <Text style={styles.subTitle}>🏪 NEGOCIOS O ESTABLECIMIENTOS</Text>
                        <Text style={styles.text}>
                            <Text style={styles.bold}>Veracidad:</Text> Toda la información suministrada (dirección, precios, fotos, promociones) debe ser veraz.{'\n'}
                            <Text style={styles.bold}>Seguridad:</Text> Ramgos implementa medidas de seguridad y privacidad para proteger los datos del negocio.{'\n'}
                            <Text style={styles.bold}>Ganancias:</Text> Los negocios recibirán bonos y porcentajes de ganancias según el acuerdo comercial vigente.{'\n'}
                            <Text style={styles.bold}>Requisito:</Text> Se requerirá verificación KYC para la activación completa del perfil comercial.{'\n'}
                            <Text style={styles.bold}>Retenciones:</Text> Ramgos podrá retener pagos temporalmente en casos de disputas o revisiones por fraude.
                        </Text>

                        <Text style={styles.subTitle}>🌟 INFLUENCERS</Text>
                        <Text style={styles.text}>
                            • Participarán en un sistema de porcentajes de ganancias por ventas o interacciones generadas mediante sus enlaces.{'\n'}
                            • Recibirán niveles de puntos y premios por logros como número de seguidores o metas mensuales.{'\n'}
                            • Obtendrán bonificaciones extras por alcanzar metas de ventas o de crecimiento de comunidad.{'\n'}
                            • Los bonos de uso exclusivo podrán utilizarse o transferirse a sus seguidores según las políticas vigentes.{'\n'}
                            • Toda actividad de influencer estará sujeta a verificación KYC para pagos y validación de identidad.
                        </Text>


                        <Text style={styles.sectionTitle}>4. MARKETPLACE (PRODUCTOS NUEVOS Y USADOS)</Text>
                        <Text style={styles.text}>
                            <Text style={styles.bold}>4.1. Condición de los productos</Text>{'\n'}
                            Los vendedores podrán publicar productos nuevos o usados, siempre que lo indiquen de forma clara y veraz en la descripción del artículo.
                            En los productos usados, el vendedor deberá especificar el estado del artículo, incluir fotografías reales y detallar cualquier daño, desgaste o reparación.
                            Ramgos no es propietario de los artículos listados ni interviene en la fabricación, almacenamiento o envío de los productos, siendo únicamente una plataforma de intermediación digital.{'\n\n'}

                            <Text style={styles.bold}>4.2. Entrega del dinero al vendedor</Text>{'\n'}
                            <Text style={styles.bold}>Plazo de Liberación:</Text> El pago correspondiente a una venta será liberado al vendedor 10 días después de confirmada la entrega del producto al comprador, siempre que no existan reclamos o devoluciones en curso.{'\n'}
                            <Text style={styles.bold}>Retención Temporal:</Text> Si se abre una disputa o solicitud de devolución dentro de ese periodo, el pago quedará en retención temporal hasta que se resuelva el caso.{'\n'}
                            <Text style={styles.bold}>Verificación:</Text> Ramgos podrá realizar verificaciones adicionales de seguridad o autenticación KYC antes de liberar fondos.{'\n\n'}

                            <Text style={styles.bold}>4.3. Devoluciones y reclamos</Text>{'\n'}
                            Los compradores podrán solicitar una devolución o cambio dentro de los primeros 7 días posteriores a la recepción del producto, siempre que: el artículo no corresponda a la descripción, esté defectuoso o dañado, y no se haya utilizado/modificado.{'\n'}
                            <Text style={styles.bold}>Proceso:</Text> El comprador inicia mediante "Mis compras" aportando evidencias. El vendedor tiene 3 días hábiles para responder.{'\n\n'}

                            <Text style={styles.bold}>4.5. Responsabilidad General Marketplace</Text>{'\n'}
                            <Text style={styles.bold}>Vendedor:</Text> Responsable único de la calidad, autenticidad y legalidad.{'\n'}
                            <Text style={styles.bold}>Ramgos:</Text> Intermediario tecnológico. Cobra comisión por venta.
                        </Text>

                        <Text style={styles.sectionTitle}>5. ECOSISTEMA DE PUNTOS Y BONOS ("RAMGOS REWARDS")</Text>
                        <Text style={styles.text}>
                            <Text style={styles.bold}>🎁 Términos de Bonos:</Text> Válidos en establecimientos participantes. Canje solo vía App/QR.{'\n\n'}

                            <Text style={styles.bold}>🪙 Términos y Valor de los Puntos:</Text>{'\n'}
                            <Text style={styles.bold}>A. Valor y Conversión:</Text>{'\n'}
                            • Tasa Base: 1 Punto = $0.01 USD.{'\n'}
                            • Equivalencia: 100 Puntos = $1.00 USD.{'\n'}
                            • Por Compras: $1.00 gastado = 1 punto.{'\n\n'}

                            <Text style={styles.bold}>B. Puntos por Juegos y Actividad:</Text>{'\n'}
                            • Mascota Virtual: +5 puntos por día.{'\n'}
                            • Arcade: 1–20 puntos (max 3/día).{'\n'}
                            • Rueda de la Suerte: 1 giro diario.{'\n'}
                            • Rachas y Referidos: Bonificaciones progresivas.{'\n'}
                            • <Text style={styles.bold}>Límite Trimestral:</Text> Los puntos por juegos expiran si no se cumple el objetivo trimestral.{'\n\n'}

                            <Text style={styles.bold}>C. Niveles de Membresía (Tiers):</Text>{'\n'}
                            🥉 Bronze (0–999 pts): Acceso básico.{'\n'}
                            🥈 Silver (1,000–4,999 pts): +5% puntos extra.{'\n'}
                            🥇 Gold (5,000–14,999 pts): +10% puntos extra.{'\n'}
                            💎 Platinum (+15,000 pts): +15% puntos extra + Envíos gratis selectos.
                        </Text>

                        <Text style={styles.sectionTitle}>6. PAGOS, SEGURIDAD Y LEGAL</Text>
                        <Text style={styles.text}>
                            Todos los pagos son seguros. Ramgos no se responsabiliza por errores de terceros. Privacidad protegida según legislación vigente.
                        </Text>

                        <Text style={styles.sectionTitle}>7. CONTACTO</Text>
                        <Text style={styles.text}>
                            Para dudas: soporte@ramgos.com
                        </Text>

                        <View style={{ height: 40 }} />
                    </ScrollView>

                    {isBlocking || isSignup ? (
                        <TouchableOpacity onPress={handleAccept} style={styles.btn}>
                            <Text style={styles.btnText}>Aceptar y Continuar</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.btn}>
                            <Text style={styles.btnText}>Cerrar</Text>
                        </TouchableOpacity>
                    )}
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
        borderRadius: Radius.xl,
        padding: 24,
        width: '100%',
        maxWidth: 500,
        alignSelf: 'center',
        ...glassShadow(isDark),
        marginVertical: 20,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(79, 195, 247, 0.3)' : 'transparent',
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    backBtn: { padding: 4 },
    title: { fontSize: 20, fontWeight: 'bold', color: colors(isDark).text },

    scroll: { flex: 1 },
    iconContainer: { alignSelf: 'center', width: 80, height: 80, borderRadius: Radius.full, backgroundColor: isDark ? '#2E1065' : '#ede9fe', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },

    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: colors(isDark).text, marginBottom: 8, marginTop: 16 },
    subTitle: { fontSize: 14, fontWeight: 'bold', color: colors(isDark).textMuted, marginBottom: 4, marginTop: 12, marginLeft: 8 },
    text: { fontSize: 13, color: colors(isDark).textMuted, lineHeight: 20 },
    bold: { fontWeight: 'bold', color: colors(isDark).text },

    btn: { backgroundColor: '#2196F3', height: 50, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
