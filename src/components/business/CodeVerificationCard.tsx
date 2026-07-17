import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Platform, Dimensions } from 'react-native';
import { CheckCircle2, XCircle, User, QrCode, AlertCircle, AlertTriangle, ArrowRight } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut, SlideInUp, SlideInDown, Layout } from 'react-native-reanimated';

interface CodeVerificationCardProps {
    code: string;
    username: string;
    status: 'pending' | 'processing' | 'success' | 'error';
    resultData?: {
        title?: string;
        message?: string;
        subMessage?: string;
    };
    onConfirm: () => void;
    onCancel: () => void;
    onReset?: () => void;
}

export const CodeVerificationCard = ({
    code,
    username,
    status,
    resultData,
    onConfirm,
    onCancel,
    onReset
}: CodeVerificationCardProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    // Render Success State
    if (status === 'success') {
        return (
            <Animated.View entering={FadeIn.duration(400)} layout={Layout.springify()} style={[styles.container, styles.successContainer]}>
                <View style={styles.iconCircleSuccess}>
                    <CheckCircle2 size={48} color="#ffffff" strokeWidth={2.5} />
                </View>

                <Text style={styles.resultTitle}>{resultData?.title || '¡Canje Exitoso!'}</Text>

                <View style={styles.resultDetailsBox}>
                    <Text style={styles.resultMessage}>{resultData?.message}</Text>
                    {resultData?.subMessage && (
                        <Text style={styles.resultSubMessage}>{resultData.subMessage}</Text>
                    )}
                </View>

                <TouchableOpacity
                    style={[styles.successButton]}
                    onPress={onReset || onCancel}
                    activeOpacity={0.9}
                >
                    <Text style={styles.successButtonText}>Finalizar</Text>
                    <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
                </TouchableOpacity>
            </Animated.View>
        );
    }

    // Render Error State
    if (status === 'error') {
        return (
            <Animated.View entering={SlideInDown.springify()} layout={Layout.springify()} style={[styles.container, styles.errorContainer]}>
                <View style={styles.iconCircleError}>
                    <XCircle size={48} color="#ffffff" strokeWidth={2.5} />
                </View>

                <Text style={[styles.resultTitle, styles.errorText]}>{resultData?.title || 'Error en Canje'}</Text>

                <Text style={styles.errorMessage}>{resultData?.message}</Text>

                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.confirmButton, styles.retryButton]}
                        onPress={onReset || onCancel}
                    >
                        <Text style={styles.confirmText}>Intentar de nuevo</Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        );
    }

    // Render Pending/Processing State
    return (
        <Animated.View layout={Layout.springify()} style={styles.container}>
            {/* Header / Code Box */}
            <View style={styles.codeBox}>
                <View style={styles.codeHeader}>
                    <QrCode size={14} color={isDark ? '#4ADE80' : '#15803D'} />
                    <Text style={styles.codeLabel}>Código detectado</Text>
                </View>
                <Text style={styles.codeValue}>{code}</Text>
            </View>

            {/* User Info */}
            <View style={styles.userRow}>
                <View style={styles.userIconContainer}>
                    <User size={16} color={isDark ? '#9CA3AF' : '#4B5563'} />
                </View>
                <Text style={styles.username}>{username}</Text>
            </View>

            {/* Instructions */}
            <View style={styles.instructionsContainer}>
                <AlertCircle size={14} color={isDark ? '#9CA3AF' : '#6B7280'} style={{ marginTop: 2, marginRight: 8 }} />
                <Text style={styles.instructionsText}>
                    Verifica los datos y confirma el canje con el cliente presente.
                </Text>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
                <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={onConfirm}
                    disabled={status === 'processing'}
                    activeOpacity={0.9}
                >
                    <LinearGradient
                        colors={['#111827', '#1F2937']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    {isDark && (
                        <LinearGradient
                            colors={['#3B82F6', '#2563EB']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                    )}

                    <Text style={styles.confirmText}>
                        {status === 'processing' ? 'Procesando...' : 'Validar y canjear'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={onCancel}
                    disabled={status === 'processing'}
                >
                    <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        backgroundColor: isDark ? '#09090B' : '#FAFAFA',
        borderRadius: 24,
        padding: 24,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
        width: '100%',
        maxWidth: 400,
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)',
        overflow: 'hidden',
    },
    // Success Styles
    successContainer: {
        alignItems: 'center',
        borderColor: isDark ? '#065F46' : '#DCFCE7',
        backgroundColor: isDark ? '#09090B' : '#FAFAFA',
    },
    iconCircleSuccess: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#10B981',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        shadowColor: '#10B981',
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 8,
    },
    resultTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: isDark ? '#F9FAFB' : '#111827',
        textAlign: 'center',
        marginBottom: 8,
    },
    resultDetailsBox: {
        width: '100%',
        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#ECFDF5',
        padding: 16,
        borderRadius: 16,
        marginVertical: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#A7F3D0',
    },
    resultMessage: {
        fontSize: 16,
        fontWeight: '700',
        color: isDark ? '#D1FAE5' : '#047857',
        textAlign: 'center',
        marginBottom: 4,
    },
    resultSubMessage: {
        fontSize: 14,
        color: isDark ? '#A7F3D0' : '#059669',
        textAlign: 'center',
    },
    successButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#10B981',
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 32,
        gap: 8,
        width: '100%',
        shadowColor: '#10B981',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
        marginTop: 8,
    },
    successButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },

    // Error Styles
    errorContainer: {
        alignItems: 'center',
        borderColor: isDark ? '#7F1D1D' : '#FEE2E2',
    },
    iconCircleError: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#EF4444',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        shadowColor: '#EF4444',
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 8,
    },
    errorText: {
        color: isDark ? '#FCA5A5' : '#DC2626',
    },
    errorMessage: {
        fontSize: 15,
        color: isDark ? '#D1D5DB' : '#4B5563',
        textAlign: 'center',
        marginHorizontal: 16,
        marginBottom: 24,
        lineHeight: 20,
    },
    retryButton: {
        backgroundColor: '#EF4444',
    },

    // Pending Styles (unchanged mostly)
    codeBox: {
        backgroundColor: isDark ? 'rgba(22, 101, 52, 0.2)' : '#DCFCE7',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(22, 163, 74, 0.3)' : '#BBF7D0',
        alignItems: 'center',
        marginBottom: 20,
    },
    codeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    codeLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: isDark ? '#4ADE80' : '#15803D',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    codeValue: {
        fontSize: 24,
        fontWeight: '800',
        color: isDark ? '#F0FDF4' : '#14532D',
        letterSpacing: 1,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 24,
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 999,
        alignSelf: 'center',
    },
    userIconContainer: {
        padding: 4,
        borderRadius: 999,
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
    },
    username: {
        fontSize: 15,
        fontWeight: '600',
        color: isDark ? '#D1D5DB' : '#4B5563',
    },
    instructionsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 8,
        marginBottom: 24,
    },
    instructionsText: {
        fontSize: 13,
        color: isDark ? '#9CA3AF' : '#64748B',
        lineHeight: 18,
        flex: 1,
        textAlign: 'center',
    },
    actions: {
        gap: 12,
        width: '100%',
    },
    confirmButton: {
        height: 54,
        borderRadius: 16,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: isDark ? '#3B82F6' : '#000',
        shadowOpacity: isDark ? 0.3 : 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    confirmText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    cancelButton: {
        height: 54,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)',
    },
    cancelText: {
        color: isDark ? '#D1D5DB' : '#4B5563',
        fontSize: 15,
        fontWeight: '600',
    },
});
