
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { ShieldAlert, ArrowRight, X } from 'lucide-react-native';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

interface KYCRequiredModalProps {
    visible: boolean;
    onClose: () => void;
    onVerify: () => void;
}

export const KYCRequiredModal: React.FC<KYCRequiredModalProps> = ({ visible, onClose, onVerify }) => {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const isNarrow = width < 420;

    return (
        <Sheet open={visible} onOpenChange={(val: boolean) => !val && onClose()}>
            <SheetContent
                side="bottom"
                style={[
                    styles.sheetContent,
                    {
                        backgroundColor: isDark ? '#0B1220' : '#fff',
                        borderTopColor: isDark ? 'rgba(148, 163, 184, 0.15)' : '#E5E7EB',
                        height: isNarrow ? 420 : 380,
                    },
                ]}
            >
                <View style={[styles.inner, { paddingBottom: Math.max(18, insets.bottom + 16) }]}>
                    <SheetHeader style={styles.header}>
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <X size={20} color={isDark ? '#CBD5E1' : '#9CA3AF'} />
                        </TouchableOpacity>
                    </SheetHeader>

                    <View style={styles.content}>
                        <View
                            style={[
                                styles.iconContainer,
                                { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEE2E2' },
                            ]}
                        >
                            <ShieldAlert size={44} color="#EF4444" />
                        </View>

                        <Text style={[styles.title, { color: isDark ? '#F9FAFB' : '#111827' }]}>
                            Verificación requerida
                        </Text>
                        <Text style={[styles.message, { color: isDark ? '#CBD5E1' : '#6B7280' }]}>
                            Para acceder a esta función, necesitamos verificar tu identidad. Es un proceso rápido y seguro.
                        </Text>

                        <TouchableOpacity
                            style={[styles.primaryBtn, { backgroundColor: '#7C3AED' }]}
                            onPress={() => {
                                onClose();
                                onVerify();
                            }}
                        >
                            <Text style={styles.primaryBtnText}>Verificar ahora</Text>
                            <ArrowRight size={18} color="#fff" />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
                            <Text style={[styles.secondaryBtnText, { color: isDark ? '#94A3B8' : '#6B7280' }]}>
                                Quizás luego
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: any) => StyleSheet.create({
    sheetContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: 1,
    },
    inner: {
        width: '100%',
        maxWidth: 520,
        alignSelf: 'center',
    },
    header: {
        alignItems: 'flex-end',
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    content: {
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    closeBtn: {
        padding: 4,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold', // 700
        marginBottom: 8,
        textAlign: 'center'
    },
    message: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 32,
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
        marginBottom: 16
    },
    primaryBtnText: {
        color: isDark ? '#1F2937' : '#fff',
        fontWeight: '600',
        fontSize: 16
    },
    secondaryBtn: {
        paddingVertical: 8,
        width: '100%',
        alignItems: 'center'
    },
    secondaryBtnText: {
        color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280',
        fontWeight: '500',
        fontSize: 14
    }
});
