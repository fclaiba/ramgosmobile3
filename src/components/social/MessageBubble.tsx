import React, { useState } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ShoppingBag, Trash2, CornerUpLeft } from 'lucide-react-native';
import { colors, Radius } from '../../theme/tokens';

const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

export interface MessageBubbleProps {
    message: any;
    isDark: boolean;
    /** Doble check: el otro lado ya leyó hasta acá. */
    showReadReceipt?: boolean;
    onReact: (messageId: string, emoji: string) => void;
    onReply: (message: any) => void;
    onDelete: (messageId: string) => void;
    onOpenListing?: (listingId: string) => void;
    /** Agrega al carrito el producto recomendado, con atribución al que lo compartió. */
    onBuyListing?: (messageId: string) => void;
    buying?: boolean;
}

const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/**
 * Burbuja de mensaje. Va dentro de una FlatList `inverted`, por eso el
 * `scaleY: -1` que la vuelve a dar vuelta.
 */
export const MessageBubble = React.memo(function MessageBubble({
    message,
    isDark,
    showReadReceipt,
    onReact,
    onReply,
    onDelete,
    onOpenListing,
    onBuyListing,
    buying,
}: MessageBubbleProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const c = colors(isDark);
    const styles = getStyles(isDark, message.mine);

    const reactionSummary = Object.entries(
        (message.reactions ?? []).reduce((acc: Record<string, number>, r: any) => {
            acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
            return acc;
        }, {}),
    );

    const listing = message.attachments?.find((a: any) => a.type === 'listing');
    const image = message.attachments?.find((a: any) => a.type === 'image');
    const post = message.attachments?.find((a: any) => a.type === 'post');

    return (
        <View style={styles.row}>
            <TouchableOpacity
                activeOpacity={0.9}
                onLongPress={() => !message.deleted && setMenuOpen((v) => !v)}
                // Doble tap = ❤️, como en Instagram.
                onPress={() => setMenuOpen(false)}
                style={styles.bubbleWrap}
            >
                {!!message.replyTo && (
                    <View style={styles.replyQuote}>
                        <Text style={styles.replyQuoteText} numberOfLines={1}>
                            {message.replyTo.body}
                        </Text>
                    </View>
                )}

                <View style={[styles.bubble, message.deleted && styles.bubbleDeleted]}>
                    {message.deleted ? (
                        <Text style={styles.deletedText}>Se eliminó este mensaje</Text>
                    ) : (
                        <>
                            {!!image && (
                                <Image
                                    source={{ uri: image.url }}
                                    style={styles.image}
                                    resizeMode="cover"
                                />
                            )}

                            {!!listing && (
                                <TouchableOpacity
                                    style={styles.listingCard}
                                    activeOpacity={0.85}
                                    onPress={() => onOpenListing?.(listing.metadata?.listingId ?? listing.url)}
                                >
                                    {!!listing.metadata?.image && (
                                        <Image
                                            source={{ uri: listing.metadata.image }}
                                            style={styles.listingImage}
                                        />
                                    )}
                                    <View style={styles.listingInfo}>
                                        <Text style={styles.listingTitle} numberOfLines={2}>
                                            {listing.metadata?.title ?? 'Producto'}
                                        </Text>
                                        {listing.metadata?.price != null && (
                                            <Text style={styles.listingPrice}>
                                                ${Number(listing.metadata.price).toFixed(2)}
                                            </Text>
                                        )}
                                        <View style={styles.listingActions}>
                                            <TouchableOpacity
                                                style={styles.listingCta}
                                                onPress={() =>
                                                    onOpenListing?.(
                                                        listing.metadata?.listingId ?? listing.url,
                                                    )
                                                }
                                            >
                                                <Text style={styles.listingCtaText}>Ver</Text>
                                            </TouchableOpacity>
                                            {!message.mine && !!onBuyListing && (
                                                <TouchableOpacity
                                                    style={styles.listingBuy}
                                                    disabled={buying}
                                                    onPress={() => onBuyListing(message._id)}
                                                >
                                                    <ShoppingBag size={12} color="#fff" />
                                                    <Text style={styles.listingBuyText}>
                                                        {buying ? '…' : 'Comprar'}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            )}

                            {!!post && (
                                <View style={styles.postCard}>
                                    <Text style={styles.postLabel}>Publicación compartida</Text>
                                    {!!post.metadata?.preview && (
                                        <Text style={styles.postPreview} numberOfLines={2}>
                                            {post.metadata.preview}
                                        </Text>
                                    )}
                                </View>
                            )}

                            {!!message.body && <Text style={styles.body}>{message.body}</Text>}
                        </>
                    )}
                </View>

                {reactionSummary.length > 0 && (
                    <View style={styles.reactions}>
                        {reactionSummary.map(([emoji, count]) => (
                            <View key={emoji} style={styles.reactionChip}>
                                <Text style={styles.reactionEmoji}>{emoji}</Text>
                                {(count as number) > 1 && (
                                    <Text style={styles.reactionCount}>{count as number}</Text>
                                )}
                            </View>
                        ))}
                    </View>
                )}

                <View style={styles.metaRow}>
                    <Text style={styles.time}>{formatTime(message.createdAt)}</Text>
                    {message.mine && (
                        <Text style={[styles.check, showReadReceipt && styles.checkRead]}>
                            {showReadReceipt ? '✓✓' : '✓'}
                        </Text>
                    )}
                </View>
            </TouchableOpacity>

            {menuOpen && (
                <View style={styles.menu}>
                    <View style={styles.emojiRow}>
                        {QUICK_EMOJIS.map((emoji) => (
                            <TouchableOpacity
                                key={emoji}
                                onPress={() => {
                                    onReact(message._id, emoji);
                                    setMenuOpen(false);
                                }}
                            >
                                <Text style={styles.emoji}>{emoji}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={styles.menuActions}>
                        <TouchableOpacity
                            style={styles.menuBtn}
                            onPress={() => {
                                onReply(message);
                                setMenuOpen(false);
                            }}
                        >
                            <CornerUpLeft size={15} color={c.textSecondary} />
                            <Text style={styles.menuBtnText}>Responder</Text>
                        </TouchableOpacity>
                        {message.mine && (
                            <TouchableOpacity
                                style={styles.menuBtn}
                                onPress={() => {
                                    onDelete(message._id);
                                    setMenuOpen(false);
                                }}
                            >
                                <Trash2 size={15} color="#EF4444" />
                                <Text style={[styles.menuBtnText, { color: '#EF4444' }]}>
                                    Eliminar
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}
        </View>
    );
});

const getStyles = (isDark: boolean, mine: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        // La lista es `inverted`; esto devuelve la burbuja a su orientación.
        row: {
            transform: [{ scaleY: -1 }],
            alignItems: mine ? 'flex-end' : 'flex-start',
            marginVertical: 3,
        },
        bubbleWrap: { maxWidth: '82%' },
        replyQuote: {
            borderLeftWidth: 3,
            borderLeftColor: c.primary,
            paddingLeft: 8,
            marginBottom: 3,
            opacity: 0.75,
        },
        replyQuoteText: { fontSize: 12, color: c.textSecondary },
        bubble: {
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: Radius.lg,
            backgroundColor: mine ? c.primary : c.surface2,
            borderBottomRightRadius: mine ? 4 : Radius.lg,
            borderBottomLeftRadius: mine ? Radius.lg : 4,
        },
        bubbleDeleted: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border },
        deletedText: { fontSize: 13, fontStyle: 'italic', color: c.textMuted },
        body: { fontSize: 15, lineHeight: 20, color: mine ? '#fff' : c.text },
        image: { width: 220, height: 220, borderRadius: Radius.md, marginBottom: 6 },
        listingCard: {
            flexDirection: 'row',
            gap: 10,
            width: 250,
            padding: 8,
            borderRadius: Radius.md,
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)',
            marginBottom: 6,
        },
        listingImage: { width: 56, height: 56, borderRadius: Radius.sm },
        listingInfo: { flex: 1, justifyContent: 'center' },
        listingTitle: { fontSize: 13, fontWeight: '600', color: c.text },
        listingPrice: { fontSize: 14, fontWeight: '800', color: c.text, marginTop: 2 },
        listingActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
        listingCta: {
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: Radius.sm,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.border,
        },
        listingCtaText: { fontSize: 12, fontWeight: '700', color: c.text },
        listingBuy: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: Radius.sm,
            backgroundColor: c.primary,
        },
        listingBuyText: { fontSize: 12, fontWeight: '800', color: '#fff' },
        postCard: {
            width: 230,
            padding: 10,
            borderRadius: Radius.md,
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)',
            marginBottom: 6,
        },
        postLabel: { fontSize: 11, fontWeight: '700', color: c.primary },
        postPreview: { fontSize: 13, color: c.text, marginTop: 3 },
        reactions: {
            flexDirection: 'row',
            gap: 4,
            marginTop: -6,
            alignSelf: mine ? 'flex-end' : 'flex-start',
        },
        reactionChip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 12,
            backgroundColor: c.surface3,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.border,
        },
        reactionEmoji: { fontSize: 12 },
        reactionCount: { fontSize: 10, fontWeight: '700', color: c.textSecondary },
        metaRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            alignSelf: mine ? 'flex-end' : 'flex-start',
            marginTop: 2,
        },
        time: { fontSize: 10, color: c.textMuted },
        check: { fontSize: 10, color: c.textMuted },
        checkRead: { color: c.primary },
        menu: {
            transform: [{ scaleY: 1 }],
            marginTop: 6,
            padding: 8,
            borderRadius: Radius.md,
            backgroundColor: c.surface3,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.border,
            alignSelf: mine ? 'flex-end' : 'flex-start',
        },
        emojiRow: { flexDirection: 'row', gap: 10 },
        emoji: { fontSize: 22 },
        menuActions: { flexDirection: 'row', gap: 14, marginTop: 8 },
        menuBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
        menuBtnText: { fontSize: 13, color: colors(isDark).textSecondary, fontWeight: '600' },
    });
};
