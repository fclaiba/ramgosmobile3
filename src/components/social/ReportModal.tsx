import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent } from '../ui/sheet';
import { Radius, colors } from '../../theme/tokens';

export type ReportTargetType = 'post' | 'comment' | 'user' | 'message' | 'story';

const REASONS: Array<{ value: string; label: string }> = [
    { value: 'spam', label: 'Spam' },
    { value: 'harassment', label: 'Acoso o bullying' },
    { value: 'nudity', label: 'Desnudez o contenido sexual' },
    { value: 'violence', label: 'Violencia' },
    { value: 'hate', label: 'Discurso de odio' },
    { value: 'scam', label: 'Estafa' },
    { value: 'selfharm', label: 'Autolesión' },
    { value: 'ip', label: 'Propiedad intelectual' },
    { value: 'other', label: 'Otro' },
];

interface ReportModalProps {
    visible: boolean;
    onClose: () => void;
    targetType: ReportTargetType;
    targetId: string;
    targetUserId?: string;
}

/**
 * Hoja de reporte compartida por post/comentario/usuario/mensaje/historia.
 * Antes de la Fase 2 no existía ningún camino para reportar contenido.
 */
export const ReportModal = ({ visible, onClose, targetType, targetId, targetUserId }: ReportModalProps) => {
    const { sessionToken } = useAuth();
    const { show } = useToast();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [reason, setReason] = useState<string | null>(null);
    const [details, setDetails] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const reportContent = useMutation(api.social.moderation.reportContent);

    const handleSubmit = async () => {
        if (!sessionToken || !reason) return;
        setSubmitting(true);
        try {
            const result = await reportContent({
                sessionToken,
                targetType: targetType as any,
                targetId,
                targetUserId,
                reason: reason as any,
                details: details.trim() || undefined,
            });
            if (result?.success === false) {
                show(result.message ?? 'Ya reportaste este contenido', 'warning');
            } else {
                show('Gracias por avisarnos. Vamos a revisarlo.', 'success');
            }
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo enviar el reporte', 'error');
        } finally {
            setSubmitting(false);
            setReason(null);
            setDetails('');
            onClose();
        }
    };

    return (
        <Sheet open={visible} onOpenChange={(o: boolean) => !o && onClose()}>
            <SheetContent side="bottom">
                <View style={styles.container}>
                    <Text style={styles.title}>¿Por qué reportás esto?</Text>
                    <View style={styles.reasonList}>
                        {REASONS.map((r) => (
                            <TouchableOpacity
                                key={r.value}
                                style={[styles.reasonChip, reason === r.value && styles.reasonChipActive]}
                                onPress={() => setReason(r.value)}
                            >
                                <Text
                                    style={[
                                        styles.reasonChipText,
                                        reason === r.value && styles.reasonChipTextActive,
                                    ]}
                                >
                                    {r.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TextInput
                        style={styles.detailsInput}
                        placeholder="Contanos más (opcional)"
                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                        value={details}
                        onChangeText={setDetails}
                        multiline
                        maxLength={500}
                    />

                    <TouchableOpacity
                        style={[styles.submitBtn, (!reason || submitting) && styles.submitBtnDisabled]}
                        disabled={!reason || submitting}
                        onPress={handleSubmit}
                    >
                        <Text style={styles.submitBtnText}>{submitting ? 'Enviando…' : 'Enviar reporte'}</Text>
                    </TouchableOpacity>
                </View>
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: { padding: 20, gap: 16 },
        title: { fontSize: 18, fontWeight: '700', color: isDark ? '#fff' : '#111827' },
        reasonList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        reasonChip: {
            paddingVertical: 8,
            paddingHorizontal: 14,
            borderRadius: Radius.full ?? 999,
            borderWidth: 1,
            borderColor: isDark ? '#374151' : '#E5E7EB',
        },
        reasonChipActive: {
            backgroundColor: colors(isDark).primary,
            borderColor: colors(isDark).primary,
        },
        reasonChipText: { fontSize: 14, color: isDark ? '#D1D5DB' : '#374151' },
        reasonChipTextActive: { color: '#fff', fontWeight: '600' },
        detailsInput: {
            minHeight: 80,
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: isDark ? '#374151' : '#E5E7EB',
            padding: 12,
            color: isDark ? '#fff' : '#111827',
            textAlignVertical: 'top',
        },
        submitBtn: {
            backgroundColor: '#EF4444',
            borderRadius: Radius.md,
            paddingVertical: 14,
            alignItems: 'center',
        },
        submitBtnDisabled: { opacity: 0.5 },
        submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    });
