import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { ShoppingCart, Ticket } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { Radius } from '../../theme/tokens';

export interface CommerceTagProduct {
    listingId?: string;
    name: string;
    price?: number;
    /** Percent off the list price, when the linked listing carries one. */
    discountPercent?: number;
}

export interface CommerceTagProps {
    product: CommerceTagProduct;
    onPress: (listingId: string) => void;
    /** `compact` is the sidebar pill used by the vertical video feed. */
    variant?: 'full' | 'compact';
}

/**
 * The floating "gancho" overlaid on a post — the one tap that turns content
 * into a sale. Discount-first when the listing has one ("🎟️ 40% OFF"),
 * price-first otherwise, per docs/DISEÑO_RED_SOCIAL_COMMERCE.md §2.
 */
export const CommerceTag = React.memo(({ product, onPress, variant = 'full' }: CommerceTagProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    const discount = product.discountPercent ?? 0;
    const hasDiscount = discount > 0;
    const accent = isDark ? '#FCD34D' : '#D97706';

    const handlePress = () => {
        if (!product.listingId) return;
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress(product.listingId);
    };

    const label = hasDiscount
        ? `Obtener ${Math.round(discount)}% OFF en ${product.name}`
        : `Ver producto ${product.name}`;

    if (variant === 'compact') {
        return (
            <TouchableOpacity
                onPress={handlePress}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={label}
            >
                <BlurView intensity={isDark ? 60 : 40} tint={isDark ? 'dark' : 'light'} style={styles.compact}>
                    {hasDiscount ? <Ticket size={14} color={accent} /> : <ShoppingCart size={14} color={accent} />}
                    <Text style={styles.compactText} numberOfLines={1}>
                        {hasDiscount ? `${Math.round(discount)}% OFF` : `$${product.price ?? ''}`}
                    </Text>
                </BlurView>
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity
            style={styles.wrapper}
            onPress={handlePress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <BlurView intensity={isDark ? 60 : 40} tint={isDark ? 'dark' : 'light'} style={styles.tag}>
                {hasDiscount ? <Ticket size={16} color={accent} /> : <ShoppingCart size={16} color={accent} />}

                <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={1}>
                        {product.name}
                    </Text>
                    {hasDiscount ? (
                        <View style={styles.priceRow}>
                            <Text style={styles.discountBadge}>{Math.round(discount)}% OFF</Text>
                            {product.price !== undefined && (
                                <Text style={styles.price}>${product.price}</Text>
                            )}
                        </View>
                    ) : (
                        product.price !== undefined && <Text style={styles.price}>${product.price}</Text>
                    )}
                </View>

                <View style={styles.buyBtn}>
                    <Text style={styles.buyBtnText}>{hasDiscount ? 'Obtener' : 'Comprar'}</Text>
                </View>
            </BlurView>
        </TouchableOpacity>
    );
});

CommerceTag.displayName = 'CommerceTag';

const styles = StyleSheet.create({
    wrapper: {
        marginTop: 12,
        borderRadius: Radius.xl,
        overflow: 'hidden',
    },
    tag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    info: {
        flex: 1,
    },
    name: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '700',
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 2,
    },
    discountBadge: {
        color: '#FCD34D',
        fontSize: 13,
        fontWeight: '900',
    },
    price: {
        color: '#10B981',
        fontSize: 13,
        fontWeight: '800',
        marginTop: 2,
    },
    buyBtn: {
        backgroundColor: '#4F46E5',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: Radius.full,
    },
    buyBtnText: {
        color: '#FFF',
        fontSize: 13,
        fontWeight: '800',
    },
    compact: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: Radius.full,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    compactText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '800',
    },
});
