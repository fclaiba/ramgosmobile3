import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { Eye, EyeOff, Check } from 'lucide-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

export default function ChangePasswordScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { user } = useAuth();
    const { show } = useToast();
    const changePassword = useMutation(api.users.changePassword);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [busy, setBusy] = useState(false);

    const minLengthOk = newPassword.length >= 8;
    const matchOk = newPassword.length > 0 && newPassword === confirmPassword;
    const differentFromCurrent =
        newPassword.length > 0 && newPassword !== currentPassword;

    const canSubmit =
        !busy &&
        currentPassword.length > 0 &&
        minLengthOk &&
        matchOk &&
        differentFromCurrent;

    const handleSubmit = async () => {
        if (!user) {
            show('Inicia sesión para cambiar tu contraseña.', 'error');
            return;
        }
        if (!canSubmit) return;
        setBusy(true);
        try {
            await changePassword({
                actorId: user.id as any,
                currentPassword,
                newPassword,
            });
            show('Contraseña actualizada correctamente.', 'success');
            navigation.goBack();
        } catch (err: any) {
            show(err?.message ?? 'No se pudo cambiar la contraseña.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const FieldRow = ({
        label,
        value,
        onChangeText,
        show: visible,
        toggle,
        autoFocus = false,
    }: {
        label: string;
        value: string;
        onChangeText: (t: string) => void;
        show: boolean;
        toggle: () => void;
        autoFocus?: boolean;
    }) => (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.inputRow}>
                <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={onChangeText}
                    secureTextEntry={!visible}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus={autoFocus}
                    placeholder="••••••••"
                    placeholderTextColor={isDark ? '#4B5563' : '#9CA3AF'}
                />
                <TouchableOpacity onPress={toggle} style={styles.eyeBtn}>
                    {visible ? (
                        <EyeOff size={18} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    ) : (
                        <Eye size={18} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Cambiar contraseña"
                subtitle="Mantén tu cuenta segura"
                backButton
                onBack={() => navigation.goBack()}
            />
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                >
                    {FieldRow({
                        label: 'Contraseña actual',
                        value: currentPassword,
                        onChangeText: setCurrentPassword,
                        show: showCurrent,
                        toggle: () => setShowCurrent((v) => !v),
                        autoFocus: true,
                    })}

                    {FieldRow({
                        label: 'Nueva contraseña',
                        value: newPassword,
                        onChangeText: setNewPassword,
                        show: showNew,
                        toggle: () => setShowNew((v) => !v),
                    })}

                    {FieldRow({
                        label: 'Confirmar nueva contraseña',
                        value: confirmPassword,
                        onChangeText: setConfirmPassword,
                        show: showConfirm,
                        toggle: () => setShowConfirm((v) => !v),
                    })}

                    <View style={styles.checks}>
                        <CheckLine ok={minLengthOk} text="Al menos 8 caracteres" isDark={isDark} />
                        <CheckLine
                            ok={differentFromCurrent}
                            text="Diferente a la actual"
                            isDark={isDark}
                        />
                        <CheckLine ok={matchOk} text="Las contraseñas coinciden" isDark={isDark} />
                    </View>

                    <TouchableOpacity
                        style={[
                            styles.submitBtn,
                            !canSubmit && { opacity: 0.5 },
                        ]}
                        onPress={handleSubmit}
                        disabled={!canSubmit}
                    >
                        {busy ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.submitText}>Actualizar contraseña</Text>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const CheckLine = ({
    ok,
    text,
    isDark,
}: {
    ok: boolean;
    text: string;
    isDark: boolean;
}) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
            style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: ok ? '#10B981' : isDark ? '#374151' : '#E5E7EB',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {ok && <Check size={10} color="#fff" strokeWidth={3} />}
        </View>
        <Text
            style={{
                color: ok ? (isDark ? '#D1FAE5' : '#065F46') : isDark ? '#9CA3AF' : '#6B7280',
                fontSize: 13,
            }}
        >
            {text}
        </Text>
    </View>
);

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: isDark ? '#111827' : '#F9FAFB',
        },
        content: {
            padding: 20,
            gap: 20,
        },
        field: {
            gap: 8,
        },
        label: {
            color: isDark ? '#D1D5DB' : '#374151',
            fontSize: 13,
            fontWeight: '600',
        },
        inputRow: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? '#1F2937' : '#fff',
            borderColor: isDark ? '#374151' : '#E5E7EB',
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
        },
        input: {
            flex: 1,
            paddingVertical: 14,
            fontSize: 15,
            color: isDark ? '#F9FAFB' : '#111827',
        },
        eyeBtn: {
            padding: 6,
        },
        checks: {
            gap: 8,
            paddingVertical: 4,
        },
        submitBtn: {
            backgroundColor: '#7C3AED',
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: 'center',
            marginTop: 8,
        },
        submitText: {
            color: '#fff',
            fontSize: 15,
            fontWeight: '700',
        },
    });
