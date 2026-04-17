import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { X, Star, Upload } from 'lucide-react-native';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from './ui/button';

interface AddReviewModalProps {
    visible: boolean;
    onClose: () => void;
    listingId: string;
    onSuccess?: () => void;
}

export const AddReviewModal: React.FC<AddReviewModalProps> = ({ visible, onClose, listingId, onSuccess }) => {
    const { theme, colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { user } = useAuth();
    const { show } = useToast();

    const addReview = useMutation(api.reviews.addReview);

    const handleSubmit = async () => {
        if (rating === 0) return;
        if (!comment.trim()) return;
        if (!user?.id) {
            show('Debes iniciar sesión para publicar una reseña.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            await addReview({
                actorId: user.id as any,
                listingId,
                rating,
                comment,
                userId: user.id,
                // orderId: "...", 
            });
            setRating(0);
            setComment('');
            onSuccess?.();
            onClose();
            show('Reseña publicada correctamente.', 'success');
        } catch (e) {
            console.error("Failed to add review", e);
            show('No se pudo publicar la reseña.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Escribir Reseña</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={20} color={isDark ? '#F9FAFB' : '#111827'} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.content}>
                        <Text style={styles.label}>Calificación</Text>
                        <View style={styles.starsRow}>
                            {[1, 2, 3, 4, 5].map((star) => (
                                <TouchableOpacity key={star} onPress={() => setRating(star)}>
                                    <Star
                                        size={32}
                                        color={star <= rating ? '#CA8A04' : '#D1D5DB'}
                                        fill={star <= rating ? '#FACC15' : 'transparent'}
                                    />
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.label}>Comentario</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Comparte tu experiencia con este producto..."
                            placeholderTextColor={isDark ? '#9CA3AF' : '#6B7280'}
                            multiline
                            numberOfLines={4}
                            value={comment}
                            onChangeText={setComment}
                            textAlignVertical="top"
                        />

                        {/* Image Upload Integration Point */}
                        <TouchableOpacity style={styles.uploadBtn}>
                            <Upload size={20} color={isDark ? '#D1D5DB' : '#4B5563'} />
                            <Text style={styles.uploadText}>Agregar Fotos (Opcional)</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.footer}>
                        <Button
                            onPress={handleSubmit}
                            disabled={isSubmitting || rating === 0 || !comment.trim()}
                            style={styles.submitBtn}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.submitBtnText}>Publicar Reseña</Text>
                            )}
                        </Button>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    container: { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32, maxHeight: '80%' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F3F4F6' },
    title: { fontSize: 18, fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827' },
    closeBtn: { padding: 4 },
    content: { padding: 20 },
    label: { fontSize: 14, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151', marginBottom: 12, marginTop: 12 },
    starsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    input: { backgroundColor: isDark ? '#111827' : '#F9FAFB', borderRadius: 12, padding: 16, color: isDark ? '#F9FAFB' : '#111827', borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB', minHeight: 120 },
    uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB', borderRadius: 12, borderStyle: 'dashed', marginTop: 20, justifyContent: 'center' },
    uploadText: { color: isDark ? '#D1D5DB' : '#4B5563', fontWeight: '500' },
    footer: { padding: 20, paddingTop: 0 },
    submitBtn: { width: '100%', backgroundColor: isDark ? '#374151' : '#111827', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' }
});
