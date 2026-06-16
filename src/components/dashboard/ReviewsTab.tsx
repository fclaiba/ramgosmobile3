import React from "react";
import { View, Text } from "react-native";
import { TrendingUp } from "lucide-react-native";
import { formatDateShort } from "../../utils/formatters";

export function ReviewsTab({ styles, businessInfo, reviews, isDark }: any) {
    return (
        <View style={styles.sectionGap}>
            <View style={styles.ratingCard}>
                <View style={styles.ratingLeft}>
                    <Text style={styles.ratingBig}>
                        {businessInfo.overallRating.toFixed(1)}
                    </Text>
                    <View style={{ flexDirection: "row" }}>
                        {[1, 2, 3, 4, 5].map((i) => (
                            <TrendingUp
                                key={i}
                                size={14}
                                color={
                                    i <= Math.round(businessInfo.overallRating)
                                        ? "#F59E0B"
                                        : isDark
                                            ? "#4B5563"
                                            : "#E5E7EB"
                                }
                                fill={
                                    i <= Math.round(businessInfo.overallRating)
                                        ? "#F59E0B"
                                        : "none"
                                }
                            />
                        ))}
                    </View>
                    <Text style={styles.ratingCount}>
                        {reviews.length} reseñas
                    </Text>
                </View>
                <View style={styles.ratingRight}>
                    <Text style={styles.ratingMsg}>
                        Mantén una calificación alta para aparecer en
                        "Recomendados".
                    </Text>
                </View>
            </View>

            {reviews.map((review: any) => (
                <View key={review.id} style={styles.reviewItem}>
                    <View style={styles.reviewHeader}>
                        <Text style={styles.reviewerName}>{review.user}</Text>
                        <Text style={styles.reviewDate}>
                            {formatDateShort(review.createdAt)}
                        </Text>
                    </View>
                    <View style={styles.starsRow}>
                        {[1, 2, 3, 4, 5].map((i) => (
                            <View
                                key={i}
                                style={[
                                    styles.starDot,
                                    i <= review.rating && styles.starDotActive,
                                ]}
                            />
                        ))}
                    </View>
                    <Text style={styles.reviewText}>{review.comment}</Text>
                </View>
            ))}
        </View>
    );
}
