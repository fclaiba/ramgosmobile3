import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useTheme } from '../contexts/ThemeContext';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Star } from 'lucide-react-native';
import { useToast } from '../contexts/ToastContext';

interface ReviewsListProps {
    listingId: string;
    onWriteReview?: () => void;
}

export const ReviewsList: React.FC<ReviewsListProps> = ({ listingId, onWriteReview }) => {
    const reviews = useQuery(api.reviews.getListingReviews, { listingId, limit: 5 });
    const reviewEligibility = useQuery(api.reviews.canReviewListing, { listingId });
    const { theme, colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    if (reviews === undefined) return <Text style={{ color: '#9CA3AF', marginVertical: 8 }}>Cargando reseñas...</Text>;

    return (
        <View style={styles.container}>
            {onWriteReview && (
                <TouchableOpacity 
                    onPress={() => {
                        if (reviewEligibility?.canReview) {
                            onWriteReview();
                        } else {
                            show(reviewEligibility?.reason || "Inicia sesión para dejar una reseña", 'warning');
                        }
                    }} 
                    style={[styles.writeReviewBtn, !reviewEligibility?.canReview && { opacity: 0.5 }]}
                >
                    <Star size={16} color={isDark ? '#F9FAFB' : '#111827'} style={{ marginRight: 8 }} />
                    <Text style={styles.writeReviewText}>Escribir una reseña</Text>
                </TouchableOpacity>
            )}

            {reviews.length === 0 ? (
                <Text style={styles.noReviews}>Aún no hay reseñas para este artículo. ¡Sé el primero!</Text>
            ) : (
                reviews.map((review: any) => (
                    <View key={review._id} style={styles.reviewCard}>
                        <View style={styles.header}>
                            <ImageWithFallback
                                src={review.userAvatar}
                                style={styles.avatar}
                                fallbackText={review.userName ? review.userName[0] : 'U'}
                            />
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={styles.userName}>{review.userName}</Text>
                                    <Text style={styles.date}>
                                        {new Date(review.createdAt).toLocaleDateString()}
                                    </Text>
                                </View>
                                <View style={styles.ratingRow}>
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <Star
                                            key={i}
                                            size={12}
                                            color={i < review.rating ? "#FBBF24" : "#D1D5DB"}
                                            fill={i < review.rating ? "#FBBF24" : "none"}
                                        />
                                    ))}
                                </View>
                            </View>
                        </View>
                        {review.title ? <Text style={styles.title}>{review.title}</Text> : null}
                        <Text style={styles.comment}>{review.comment}</Text>

                        {review.sellerResponse && (
                            <View style={styles.response}>
                                <Text style={styles.responseTitle}>Respuesta del vendedor:</Text>
                                <Text style={styles.responseText}>{review.sellerResponse.message}</Text>
                            </View>
                        )}
                    </View>
                ))
            )}
        </View>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { gap: 16, paddingTop: 8 },
    noReviews: { color: isDark ? '#9CA3AF' : '#6B7280', fontStyle: 'italic', textAlign: 'center', marginTop: 8 },
    writeReviewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)', borderRadius: 12, marginBottom: 8 },
    writeReviewText: { fontSize: 14, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },
    reviewCard: {
        padding: 12,
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
        borderRadius: 12, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)'
    },
    header: { flexDirection: 'row', gap: 12, marginBottom: 8 },
    avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)' },
    userName: { fontSize: 13, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },
    date: { fontSize: 11, color: '#9CA3AF' },
    ratingRow: { flexDirection: 'row', marginTop: 2, gap: 2 },
    title: { fontSize: 13, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 2 },
    comment: { fontSize: 13, color: isDark ? '#D1D5DB' : '#4B5563', lineHeight: 18 },
    response: {
        marginTop: 10, padding: 10, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
        borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#2563EB'
    },
    responseTitle: { fontSize: 11, fontWeight: '600', color: '#2563EB', marginBottom: 2 },
    responseText: { fontSize: 12, color: isDark ? '#D1D5DB' : '#4B5563' },
});
