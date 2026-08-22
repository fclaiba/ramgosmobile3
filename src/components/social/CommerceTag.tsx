import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShoppingCart, Ticket } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { Radius, colors } from '../../theme/tokens';
import { GlassSurface } from '../ui/GlassSurface';

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

/** El borde iridiscente "holográfico" — la diferencia entre una tarjeta de
 *  vidrio genérica y el gancho de venta que se supone que salte del feed. */
const HOLO_COLORS = ['#FCD34D', '#F472B6', '#818CF8', '#34D399', '#FCD34D'] as const;

/**
 * The floating "gancho" overlaid on a post — the one tap that turns content
 * into a sale. Discount-first when the listing has one ("🎟️ 40% OFF"),
 * price-first otherwise, per docs/DISEÑO_RED_SOCIAL_COMMERCE.md §2.
 *
 * Reescrito sobre `GlassSurface` (el mismo "Liquid Glass" de
 * `src/utils/glass.ts` que ya usa el resto de la app) en vez de un
 * `BlurView` a mano, más un borde iridiscente ("holográfico") que lo separa
 * visualmente del resto de tarjetas de vidrio — es plata, tiene que saltar.
 */
export const CommerceTag = React.memo(({ product, onPress, variant = 'full' }: CommerceTagProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    const discount = product.discountPercent ?? 0;
    const hasDiscount = discount > 0;
    const accent = isDark ? '#FCD34D' : '#D97706';
    // El tag ya no vive sólo sobre video oscuro: desde el rediseño del feed
    // se apoya en una tarjeta que sigue el tema, donde el texto blanco fijo
    // era ilegible en claro (`surface3` en light es casi blanco).
    const fg = colors(isDark).text;
    const priceColor = isDark ? '#10B981' : '#047857';

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
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={label}
            >
                <LinearGradient
                    colors={HOLO_COLORS}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.holoRingCompact}
                >
                    <GlassSurface intensity="prominent" style={styles.compactInner} specular>
                        <View style={styles.compact}>
                            {hasDiscount ? <Ticket size={14} color={accent} /> : <ShoppingCart size={14} color={accent} />}
                            <Text style={[styles.compactText, { color: fg }]} numberOfLines={1}>
                                {hasDiscount ? `${Math.round(discount)}% OFF` : `$${product.price ?? ''}`}
                            </Text>
                        </View>
                    </GlassSurface>
                </LinearGradient>
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity
            style={styles.wrapper}
            onPress={handlePress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <LinearGradient
                colors={HOLO_COLORS}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.holoRing}
            >
                <GlassSurface intensity="prominent" style={styles.tagInner} specular pressable>
                    <View style={styles.tag}>
                        {hasDiscount ? <Ticket size={16} color={accent} /> : <ShoppingCart size={16} color={accent} />}

                        <View style={styles.info}>
                            <Text style={[styles.name, { color: fg }]} numberOfLines={1}>
                                {product.name}
                            </Text>
                            {hasDiscount ? (
                                <View style={styles.priceRow}>
                                    <Text style={[styles.discountBadge, { color: accent }]}>
                                        {Math.round(discount)}% OFF
                                    </Text>
                                    {product.price !== undefined && (
                                        <Text style={[styles.price, { color: priceColor }]}>${product.price}</Text>
                                    )}
                                </View>
                            ) : (
                                product.price !== undefined && (
                                    <Text style={[styles.price, { color: priceColor }]}>${product.price}</Text>
                                )
                            )}
                        </View>

                        <View style={styles.buyBtn}>
                            <Text style={styles.buyBtnText}>{hasDiscount ? 'Obtener' : 'Comprar'}</Text>
                        </View>
                    </View>
                </GlassSurface>
            </LinearGradient>
        </TouchableOpacity>
    );
});

CommerceTag.displayName = 'CommerceTag';

const styles = StyleSheet.create({
    wrapper: {
        marginTop: 12,
    },
    // El "anillo" de gradiente hace de marco: 1.5px de grosor visible
    // alrededor de la superficie de vidrio insertada adentro.
    holoRing: {
        borderRadius: Radius.xl + 1.5,
        padding: 1.5,
    },
    holoRingCompact: {
        borderRadius: Radius.full + 1.5,
        padding: 1.5,
    },
    tagInner: {
        borderRadius: Radius.xl,
    },
    compactInner: {
        borderRadius: Radius.full,
    },
    tag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
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
    },
    compactText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '800',
    },
});
