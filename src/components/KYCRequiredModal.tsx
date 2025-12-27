
import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { ShieldAlert, ArrowRight, X } from 'lucide-react-native';
import { BlurView } from 'expo-blur';

interface KYCRequiredModalProps {
    visible: boolean;
    onClose: () => void;
    onVerify: () => void;
}

export const KYCRequiredModal: React.FC<KYCRequiredModalProps> = ({ visible, onClose, onVerify }) => {
    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <BlurView intensity={20} style={styles.absolute} tint="dark">
                <View style={styles.overlay}>
                    <View style={styles.modalCard}>
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <X size={20} color="#9CA3AF" />
                        </TouchableOpacity>

                        <View style={styles.iconContainer}>
                            <ShieldAlert size={48} color="#EF4444" />
                        </View>

                        <Text style={styles.title}>Verificación Requerida</Text>
                        <Text style={styles.message}>
                            Para acceder a esta función, necesitamos verificar tu identidad. Es un proceso rápido y seguro.
                        </Text>

                        <TouchableOpacity style={styles.primaryBtn} onPress={() => { onClose(); onVerify(); }}>
                            <Text style={styles.primaryBtnText}>Verificar ahora</Text>
                            <ArrowRight size={18} color="#fff" />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
                            <Text style={styles.secondaryBtnText}>Quizás luego</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </BlurView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    absolute: { flex: 1 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalCard: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
        position: 'relative'
    },
    closeBtn: {
        position: 'absolute',
        top: 16,
        right: 16,
        padding: 4,
        zIndex: 10
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#FEE2E2',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 8,
        textAlign: 'center'
    },
    message: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20
    },
    primaryBtn: {
        width: '100%',
        height: 48,
        backgroundColor: '#7C3AED', // Brand primary
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 12
    },
    primaryBtnText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16
    },
    secondaryBtn: {
        paddingVertical: 8
    },
    secondaryBtnText: {
        color: '#6B7280',
        fontWeight: '500',
        fontSize: 14
    }
});
