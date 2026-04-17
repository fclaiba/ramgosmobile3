import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface StripePaymentModalProps {
    clientSecret: string;
    visible: boolean;
    onPaymentSuccess: () => void;
    onPaymentError: (error: string) => void;
    onCancel: () => void;
}

export function StripePaymentModal({
    clientSecret,
    visible,
    onPaymentSuccess,
    onPaymentError,
    onCancel
}: StripePaymentModalProps) {
    const { colorScheme } = useTheme();

    useEffect(() => {
        if (visible && clientSecret) {
            // Web Mock: Simulate a successful payment or show an alert
            // Since Stripe Native is not supported on web, we simulate success for local dev.
            setTimeout(() => {
                onPaymentSuccess();
            }, 1500);
        }
    }, [visible, clientSecret]);

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="fade">
            <View style={styles.overlay}>
                <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#111827' : '#fff' }]}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#7C3AED" />
                        <Text style={[styles.loadingText, { color: colorScheme === 'dark' ? '#D1D5DB' : '#4B5563' }]}>
                            Procesando pago simulado (Web no soporta Stripe Nativo)...
                        </Text>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    container: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        minHeight: 200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingContainer: {
        alignItems: 'center',
        padding: 40,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 14,
        fontWeight: '500',
        textAlign: 'center'
    }
});
