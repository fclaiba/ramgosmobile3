import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy, CornerUpLeft, FileText, ShoppingBag, Trash2 } from 'lucide-react-native';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { colors, Radius } from '../../theme/tokens';

const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

export interface MessageBubbleProps {
    message: any;
    isDark: boolean;
    /** Doble check: el otro lado ya leyó hasta acá. */
    showReadReceipt?: boolean;
    /** Estado VIVO de los productos, por listingId. La tarjeta sólo guarda un snapshot. */
    listingStateById?: Map<string, any>;
    /** En grupos hay que poder saber quién mandó cada mensaje. */
    isGroup?: boolean;
    onReact: (messageId: string, emoji: string) => void;
    onReply: (message: any) => void;
    onDelete: (messageId: string) => void;
    onOpenListing?: (listingId: string) => void;
    onOpenPost?: (postId: string) => void;
    onOpenProfile?: (userId: string) => void;
    /** Agrega al carrito el producto recomendado, con atribución al que lo compartió. */
    onBuyListing?: (messageId: string) => void;
    onCopied?: () => void;
    buying?: boolean;
}

const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

const UNAVAILABLE_LABEL: Record<string, string> = {
    listing_not_found: 'Ya no está disponible',
    inactive: 'Ya no está a la venta',
    out_of_stock: 'Sin stock',
    own_product: 'Es tu producto',
};

/**
 * Burbuja de mensaje. Va dentro de una FlatList `inverted`, por eso el
 * `scaleY: -1` que la vuelve a dar vuelta.
 */
export const MessageBubble = React.memo(function MessageBubble({
    message,
    isDark,
    showReadReceipt,
    listingStateById,
    isGroup,
    onReact,
    onReply,
    onDelete,
    onOpenListing,
    onOpenPost,
    onOpenProfile,
    onBuyListing,
    onCopied,
    buying,
}: MessageBubbleProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const c = colors(isDark);
    const styles = getStyles(isDark, message.mine);

    // Evento del hilo ("X salió del grupo"): ni burbuja ni acciones.
    if (message.kind === 'system') {
        return (
            <View style={styles.systemRow}>
                <Text style={styles.systemText}>{message.body}</Text>
            </View>
        );
    }

    const reactionSummary = Object.entries(
        (message.reactions ?? []).reduce((acc: Record<string, number>, r: any) => {
            acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
            return acc;
        }, {}),
    );
    const myEmoji = (message.reactions ?? []).find((r: any) => r.mine)?.emoji;

    // Antes se tomaba sólo el PRIMER adjunto de cada tipo con `.find()`, así
    // que un mensaje con varias fotos mostraba una sola.
    const attachments: any[] = message.attachments ?? [];

    const handleCopy = async () => {
        setMenuOpen(false);
        if (!message.body) return;
        await Clipboard.setStringAsync(message.body);
        onCopied?.();
    };

    const renderAttachment = (a: any, index: number) => {
        if (a.type === 'image') {
            return (
                <Image
                    key={`img-${index}`}
                    source={{ uri: a.url }}
                    style={styles.image}
                    resizeMode="cover"
                />
            );
        }

        if (a.type === 'listing') {
            const listingId = a.metadata?.listingId ?? a.url;
            const live = listingStateById?.get(String(listingId));
            const price = live?.available ? live.priceUsd : a.metadata?.price;
            const unavailable = live && !live.available;

            return (
                <TouchableOpacity
                    key={`listing-${index}`}
                    style={styles.listingCard}
                    activeOpacity={0.85}
                    onPress={() => onOpenListing?.(listingId)}
                >
                    {!!a.metadata?.image && (
                        <Image source={{ uri: a.metadata.image }} style={styles.listingImage} />
                    )}
                    <View style={styles.listingInfo}>
                        <Text style={styles.listingTitle} numberOfLines={2}>
                            {a.metadata?.title ?? 'Producto'}
                        </Text>
                        {price != null && (
                            <Text style={[styles.listingPrice, unavailable && styles.listingStale]}>
                                ${Number(price).toFixed(2)}
                            </Text>
                        )}
                        {unavailable ? (
                            <Text style={styles.listingUnavailable}>
                                {UNAVAILABLE_LABEL[live.reason] ?? 'No disponible'}
                            </Text>
                        ) : (
                            <View style={styles.listingActions}>
                                <TouchableOpacity
                                    style={styles.listingCta}
                                    onPress={() => onOpenListing?.(listingId)}
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
                        )}
                    </View>
                </TouchableOpacity>
            );
        }

        if (a.type === 'post') {
            const postId = a.metadata?.postId ?? a.url;
            return (
                <TouchableOpacity
                    key={`post-${index}`}
                    style={styles.postCard}
                    activeOpacity={0.85}
                    onPress={() => onOpenPost?.(postId)}
                >
                    {/* La imagen venía en `metadata.image` y nunca se pintaba. */}
                    {!!a.metadata?.image && (
                        <Image source={{ uri: a.metadata.image }} style={styles.postImage} />
                    )}
                    <View style={styles.postBody}>
                        <Text style={styles.postLabel}>
                            {a.metadata?.authorUsername
                                ? `Publicación de @${a.metadata.authorUsername}`
                                : 'Publicación compartida'}
                        </Text>
                        {!!a.metadata?.preview && (
                            <Text style={styles.postPreview} numberOfLines={2}>
                                {a.metadata.preview}
                            </Text>
                        )}
                    </View>
                </TouchableOpacity>
            );
        }

        // Tipo desconocido (o un `video`/`document` que todavía no tiene
        // vista propia): antes no renderizaba NADA, y con el cuerpo vacío la
        // burbuja quedaba en blanco.
        return (
            <View key={`file-${index}`} style={styles.fileCard}>
                <FileText size={16} color={c.textSecondary} />
                <Text style={styles.fileText} numberOfLines={1}>
                    {a.type === 'video'
                        ? 'Video'
                        : a.type === 'document'
                          ? 'Documento'
                          : 'Adjunto'}
                </Text>
            </View>
        );
    };

    return (
        <View style={styles.row}>
            {isGroup && !message.mine && (
                <TouchableOpacity
                    style={styles.senderRow}
                    activeOpacity={0.7}
                    onPress={() => onOpenProfile?.(message.senderUserId)}
                >
                    <Avatar size="sm">
                        <AvatarImage src={message.senderAvatar ?? undefined} />
                        <AvatarFallback>
                            {(message.senderName ?? '?').charAt(0)}
                        </AvatarFallback>
                    </Avatar>
                    <Text style={styles.senderName} numberOfLines={1}>
                        {message.senderName ?? 'Alguien'}
                    </Text>
                </TouchableOpacity>
            )}

            <TouchableOpacity
                activeOpacity={0.9}
                onLongPress={() => !message.deleted && setMenuOpen((v) => !v)}
                onPress={() => setMenuOpen(false)}
                delayLongPress={280}
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
                            {attachments.map(renderAttachment)}
                            {!!message.body && <Text style={styles.body}>{message.body}</Text>}
                        </>
                    )}
                </View>

                {reactionSummary.length > 0 && (
                    <View style={styles.reactions}>
                        {reactionSummary.map(([emoji, count]) => (
                            // Tocable: los chips eran `View`, así que no había
                            // forma de sacarse la propia reacción sin volver a
                            // abrir el menú y elegir el mismo emoji.
                            <TouchableOpacity
                                key={emoji}
                                style={[
                                    styles.reactionChip,
                                    myEmoji === emoji && styles.reactionChipMine,
                                ]}
                                onPress={() => onReact(message._id, emoji)}
                            >
                                <Text style={styles.reactionEmoji}>{emoji}</Text>
                                {(count as number) > 1 && (
                                    <Text style={styles.reactionCount}>{count as number}</Text>
                                )}
                            </TouchableOpacity>
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
                                <Text style={[styles.emoji, myEmoji === emoji && styles.emojiOn]}>
                                    {emoji}
                                </Text>
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
                        {!!message.body && (
                            <TouchableOpacity style={styles.menuBtn} onPress={handleCopy}>
                                <Copy size={15} color={c.textSecondary} />
                                <Text style={styles.menuBtnText}>Copiar</Text>
                            </TouchableOpacity>
                        )}
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
        // La lista es `inverted`; la react-native-web u os manejan la re-inversión
        row: {
            alignItems: mine ? 'flex-end' : 'flex-start',
            marginVertical: 3,
        },
        systemRow: { alignItems: 'center', marginVertical: 8 },
        systemText: {
            fontSize: 11,
            color: c.textMuted,
            textAlign: 'center',
            paddingHorizontal: 24,
        },
        senderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
        senderName: { fontSize: 11, fontWeight: '700', color: c.textSecondary },
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
        listingStale: { textDecorationLine: 'line-through', color: c.textMuted },
        listingUnavailable: { fontSize: 11, fontWeight: '700', color: c.textMuted, marginTop: 6 },
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
            borderRadius: Radius.md,
            overflow: 'hidden',
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)',
            marginBottom: 6,
        },
        postImage: { width: '100%', height: 130 },
        postBody: { padding: 10 },
        postLabel: { fontSize: 11, fontWeight: '700', color: c.primary },
        postPreview: { fontSize: 13, color: c.text, marginTop: 3 },
        fileCard: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: Radius.md,
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)',
            marginBottom: 6,
        },
        fileText: { fontSize: 13, fontWeight: '600', color: c.text },
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
        reactionChipMine: { borderColor: c.primary },
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
            // El padre ya está con `scaleY: -1`; sin volver a invertir acá, el
            // menú se dibujaba dado vuelta.
            transform: [{ scaleY: -1 }],
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
        emojiOn: { opacity: 1, transform: [{ scale: 1.15 }] },
        menuActions: { flexDirection: 'row', gap: 14, marginTop: 8 },
        menuBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
        menuBtnText: { fontSize: 13, color: colors(isDark).textSecondary, fontWeight: '600' },
    });
};
