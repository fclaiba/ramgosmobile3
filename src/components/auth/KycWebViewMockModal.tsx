import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator, TouchableOpacity } from 'react-native';
import { ShieldCheck, CheckCircle2 } from 'lucide-react-native';

interface KycWebViewMockProps {
    visible: boolean;
    url: string;
    onClose: () => void;
    onSuccess: () => void;
    userId: string;
}

export function KycWebViewMockModal({ visible, url, onClose, onSuccess, userId }: KycWebViewMockProps) {
    const [step, setStep] = useState<'loading' | 'simulating' | 'success'>('loading');

    useEffect(() => {
        if (visible) {
            setStep('loading');
            
            // 1. Simulate WebView loading
            const loaderTimer = setTimeout(() => {
                setStep('simulating');
                
                // 2. Simulate User completing Jumio/Truora flow
                const simTimer = setTimeout(async () => {
                    // 3. Post to Webhook mimicking the provider
                    try {
                        // Assuming the API is accessible locally or through Expo proxy
                        // In local dev, we might not have the full localhost URL easily from the app context,
                        // but Convex provides the EXPO_PUBLIC_CONVEX_URL. We can infer the HTTP url from it.
                        const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL || "";
                        const httpUrl = convexUrl.replace('.cloud', '.site'); // Standard Convex convection
                        
                        await fetch(`${httpUrl}/kyc-webhook`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                event: 'kyc.approved',
                                userId: userId
                            })
                        });
                    } catch (e) {
                        console.log("[KycWebViewMock] Could not ping webhook directly:", e);
                    }

                    setStep('success');
                }, 3500);

                return () => clearTimeout(simTimer);
            }, 1500);

            return () => clearTimeout(loaderTimer);
        }
    }, [visible, userId]);

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="slide">
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerText}>🔒 Proveedor de Identidad Seguro</Text>
                    <TouchableOpacity onPress={onClose}><Text style={styles.closeBtn}>Cancelar</Text></TouchableOpacity>
                </View>
                
                <View style={styles.content}>
                    {step === 'loading' && (
                        <>
                            <ActivityIndicator size="large" color="#000" />
                            <Text style={styles.text}>Cargando entorno seguro...</Text>
                        </>
                    )}
                    {step === 'simulating' && (
                        <>
                            <ShieldCheck size={64} color="#3B82F6" />
                            <Text style={styles.title}>Verificación Truora/Jumio</Text>
                            <Text style={styles.text}>1. Sube tu documento frontal</Text>
                            <Text style={styles.text}>2. Sube tu documento posterior</Text>
                            <Text style={styles.text}>3. Tómate una selfie</Text>
                            <Text style={[styles.text, { marginTop: 24, fontStyle: 'italic', color: '#6B7280' }]}>Simulando acciones del usuario...</Text>
                        </>
                    )}
                    {step === 'success' && (
                        <>
                            <CheckCircle2 size={64} color="#10B981" />
                            <Text style={styles.title}>¡Identidad Verificada!</Text>
                            <Text style={styles.text}>Retornando a la app...</Text>
                            <TouchableOpacity style={styles.btn} onPress={onSuccess}>
                                <Text style={styles.btnText}>Continuar</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
                
                <Text style={styles.urlBar}>{url}</Text>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        paddingTop: 50,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    headerText: { fontWeight: '600', color: '#111827' },
    closeBtn: { color: '#EF4444', fontWeight: 'bold' },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    title: { fontSize: 20, fontWeight: 'bold', marginTop: 16, marginBottom: 12, color: '#111827' },
    text: { fontSize: 16, color: '#4B5563', marginBottom: 8, textAlign: 'center' },
    urlBar: {
        backgroundColor: '#E5E7EB',
        padding: 12,
        textAlign: 'center',
        color: '#6B7280',
        fontSize: 12,
    },
    btn: {
        backgroundColor: '#10B981',
        paddingHorizontal: 32,
        paddingVertical: 12,
        borderRadius: 8,
        marginTop: 24
    },
    btnText: { color: '#fff', fontWeight: 'bold' }
});
