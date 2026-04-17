import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
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
    const { initPaymentSheet, presentPaymentSheet } = useStripe();
    const { colorScheme } = useTheme();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (visible && clientSecret) {
            initializePaymentSheet();
        }
    }, [visible, clientSecret]);

    const initializePaymentSheet = async () => {
        setLoading(true);
        const { error } = await initPaymentSheet({
            merchantDisplayName: "Ramgos",
            paymentIntentClientSecret: clientSecret,
            allowsDelayedPaymentMethods: false,
            defaultBillingDetails: {
                name: 'Jane Doe',
            },
            appearance: {
                colors: {
                    primary: '#7C3AED',
                    background: colorScheme === 'dark' ? '#111827' : '#ffffff',
                    componentBackground: colorScheme === 'dark' ? '#1F2937' : '#f9fafb',
                    componentBorder: colorScheme === 'dark' ? '#374151' : '#e5e7eb',
                    componentDivider: colorScheme === 'dark' ? '#374151' : '#e5e7eb',
                    primaryText: colorScheme === 'dark' ? '#f9fafb' : '#111827',
                    secondaryText: colorScheme === 'dark' ? '#9ca3af' : '#6b7280',
                    componentText: colorScheme === 'dark' ? '#f9fafb' : '#111827',
                    placeholderText: colorScheme === 'dark' ? '#6b7280' : '#9ca3af',
                },
                shapes: {
                    borderRadius: 12,
                    borderWidth: 1,
                }
            }
        });
        
        if (error) {
            onPaymentError(`Error initializing payment: ${error.message}`);
            return;
        }

        setLoading(false);
        openPaymentSheet();
    };

    const openPaymentSheet = async () => {
        // If we are in local dev with strict dummy keys, we can just simulate success unconditionally
        if (clientSecret.startsWith('pi_mock_')) {
            setTimeout(() => {
                onPaymentSuccess();
            }, 1500);
            return;
        }

        const { error } = await presentPaymentSheet();
        
        if (error) {
            if (error.code === 'Canceled') {
                onCancel();
            } else {
                onPaymentError(error.message);
            }
        } else {
            onPaymentSuccess();
        }
    };

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="fade">
            <View style={styles.overlay}>
                <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#111827' : '#fff' }]}>
                    {loading && (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#7C3AED" />
                            <Text style={[styles.loadingText, { color: colorScheme === 'dark' ? '#D1D5DB' : '#4B5563' }]}>
                                Preparando pago seguro...
                            </Text>
                        </View>
                    )}
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
    }
});
