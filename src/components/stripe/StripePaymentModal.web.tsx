import React from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';

/**
 * Web shim for StripePaymentModal.
 * @stripe/stripe-react-native is native-only; on web we show a placeholder.
 */

interface StripePaymentModalProps {
    clientSecret: string;
    visible: boolean;
    onPaymentSuccess: () => void;
    onPaymentError: (error: string) => void;
    onCancel: () => void;
}

export function StripePaymentModal({
    visible,
    onCancel,
}: StripePaymentModalProps) {
    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="fade">
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <Text style={styles.title}>Pagos con tarjeta</Text>
                    <Text style={styles.subtitle}>
                        Los pagos con tarjeta solo están disponibles en la app móvil.
                    </Text>
                    <Text style={styles.link} onPress={onCancel}>
                        Cerrar
                    </Text>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 32,
        maxWidth: 360,
        alignItems: 'center',
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
    },
    link: {
        color: '#7C3AED',
        fontWeight: '600',
        fontSize: 15,
    },
});
