import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Repeat2, ShoppingBag } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius, Space, Touch, Type } from '../../theme/tokens';
import { createThemedStyles } from '../../theme/makeThemedStyles';
import { glassSurface } from '../../utils/glass';
import { useFeedFocus } from '../../hooks/useFeedFocus';
import { PostMediaBox } from './PostMediaBox';
import { PostVideo } from './PostVideo';
import { formatCompactCount } from '../../utils/formatCompactCount';
import { formatRelativeTime } from '../../utils/formatters';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { CommerceTag } from './CommerceTag';
import { PostImageCarousel } from './PostImageCarousel';
import { LinkPreviewCard } from './LinkPreviewCard';
import { SharePostModal } from './SharePostModal';
import { SoundPill } from './SoundPill';
import { CommunityBadge } from './CommunityBadge';
import { QuotedPostCard, QuotedPost } from './QuotedPostCard';

/** Líneas de texto antes de plegar con "Ver más" (Twitter pliega parecido). */
const COLLAPSED_LINES = 5;

export interface PostCardProps {
    post: {
        _id: Id<'socialPosts'>;
        authorUserId: string;
        type: 'text' | 'image' | 'video' | 'poll' | 'commercial';
        content: string;
        images?: string[];
        /** Texto alternativo por imagen, mismo índice que `images`. */
        imageAlts?: string[];
        videoUrl?: string;
        commercialProduct?: {
            listingId?: string;
            name: string;
            price?: number;
            /** Backend field name (`socialPosts.commercialProduct.image`). */
            image?: string;
            discountPercent?: number;
        };
        poll?: {
            options: Array<{ id: string; text: string; votes: number }>;
            totalVotes: number;
            endsAt: string;
            voters?: Array<{ userId: string; optionId: string }>;
        };
        likesCount: number;
        commentsCount: number;
        hasLiked?: boolean;
        /** `isSavedByMe` de `getFeed` — evita una query de guardados por card. */
        hasSaved?: boolean;
        sharesCount?: number;
        repostsCount?: number;
        hasReposted?: boolean;
        /** Sólo en las CITAS: el post embebido. Los reposts simples llegan ya
         *  sustituidos por el original desde el servidor. */
        quotedPost?: QuotedPost | null;
        createdAt?: string;
        /** Sonidos reutilizables — ausente en posts viejos, pre-feature. */
        audioTrackId?: Id<'audioTracks'>;
        audioTrack?: { name: string; authorUsername: string | null } | null;
        /** B3 — ausente = post del feed global. */
        communityId?: Id<'commercialCommunities'>;
        communityName?: string | null;
    };
    author: {
        name: string;
        avatar?: string;
        role?: string;
        username?: string | null;
    } | null;
    /** Quién reposteó: dibuja "↻ Fulano reposteó" arriba de la tarjeta. */
    repostedBy?: { userId: string; name: string; username?: string | null } | null;
    onLike: () => void;
    onComment: (postId?: any) => void;
    onCommercePress: (listingId: string) => void;
    /** Abre el menú Repostear/Citar. Si ya reposteaste, des-repostea directo. */
    onOpenRepostMenu?: () => void;
    onToggleRepost?: () => void;
    /** Navegar al post citado desde la tarjeta embebida. */
    onOpenQuoted?: (postId: string) => void;
    isFocused?: boolean; // Para pausar/reproducir videos automáticamente
    /** Reportar / silenciar / ocultar (Fase 2). Opcional: sin esto no se
     *  muestra el botón "⋯", para no romper otros consumidores del card. */
    onOpenActions?: () => void;
    /** `post.type === 'poll'` sin esto no tenía NINGUNA UI — se guardaba el
     *  voto pero nadie podía votar ni ver resultados. */
    onVotePoll?: (optionId: string) => void;
    /** Id del usuario actual, para saber si ya votó y mostrar resultados. */
    currentUserId?: string;
    /** Abre el perfil de un usuario. Sin esto la cabecera queda inerte, que es
     *  como estuvo hasta ahora: el avatar y el nombre del feed no navegaban. */
    onUserPress?: (userId: string) => void;
}

/**
 * Encuestas. El schema y `votePoll` (idempotente, respeta `endsAt`) ya
 * existían enteros; lo único que faltaba era ALGO que los mostrara —
 * `post.type === 'poll'` no tenía ninguna UI, así que se guardaba el voto
 * pero nadie podía votar.
 */
const PollCard = ({
    poll,
    currentUserId,
    onVote,
    isDark,
}: {
    poll: NonNullable<PostCardProps['post']['poll']>;
    currentUserId?: string;
    onVote?: (optionId: string) => void;
    isDark: boolean;
}) => {
    const myVote = poll.voters?.find((v) => v.userId === currentUserId)?.optionId;
    const ended = new Date(poll.endsAt).getTime() < Date.now();
    const showResults = Boolean(myVote) || ended;
    const total = Math.max(1, poll.totalVotes);
    const c = colors(isDark);

    return (
        <View style={pollStyles.container}>
            {poll.options.map((opt) => {
                const pct = Math.round((opt.votes / total) * 100);
                const isMine = myVote === opt.id;
                return (
                    <TouchableOpacity
                        key={opt.id}
                        style={[pollStyles.option, { borderColor: c.border, backgroundColor: c.surface1 }]}
                        disabled={showResults || !onVote}
                        onPress={() => onVote?.(opt.id)}
                        accessibilityRole="button"
                    >
                        {showResults && (
                            <View
                                style={[
                                    pollStyles.fill,
                                    { width: `${pct}%`, backgroundColor: isMine ? c.primaryMuted : c.surface2 },
                                ]}
                            />
                        )}
                        <View style={pollStyles.optionRow}>
                            <Text style={[pollStyles.optionText, { color: c.text }]}>{opt.text}</Text>
                            {showResults && (
                                <Text style={[pollStyles.optionPct, { color: isMine ? c.primary : c.text }]}>
                                    {pct}%
                                </Text>
                            )}
                        </View>
                    </TouchableOpacity>
                );
            })}
            <Text style={[pollStyles.meta, { color: c.textMuted }]}>
                {poll.totalVotes} voto{poll.totalVotes === 1 ? '' : 's'} · {ended ? 'Encuesta finalizada' : 'En curso'}
            </Text>
        </View>
    );
};

const pollStyles = StyleSheet.create({
    container: { marginTop: 4, marginBottom: 12, gap: 8 },
    option: {
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    fill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
    },
    optionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    optionText: { fontWeight: '600', fontSize: 14 },
    optionPct: { fontWeight: '800', fontSize: 14 },
    meta: { fontSize: 12, fontWeight: '500' },
});

/**
 * Tarjeta de post del feed "Feed" — mezcla Twitter/Instagram: cabecera con
 * autor y hora relativa, texto plegable, media encuadrada (nunca recortada) y
 * una barra de acciones horizontal con contadores compactos.
 *
 * Antes era una tarjeta a pantalla completa con HUD sobre la media y una
 * barra lateral flotante de acciones (estilo TikTok). Ese formato se quedó
 * sólo en `LoopItem`, que sí es un feed de video.
 */
export const PostCard = React.memo(({ post, author, repostedBy, onLike, onComment, onCommercePress, isFocused = true, onOpenActions, onVotePoll, currentUserId, onOpenRepostMenu, onToggleRepost, onOpenQuoted, onUserPress }: PostCardProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const styles = getStyles(isDark);
    const { sessionToken } = useAuth();

    // Dentro de un feed el foco llega por suscripción al store, así que un
    // cambio de viewport re-renderiza sólo las tarjetas que entraron o salieron.
    // Suelta — detalle de post, perfil, preview — no hay store y cae a la prop.
    const focusFromFeed = useFeedFocus(String(post._id));
    const focused = focusFromFeed ?? isFocused;

    const [liked, setLiked] = useState(Boolean(post.hasLiked));
    const [likeCount, setLikeCount] = useState(post.likesCount);
    const [reposted, setReposted] = useState(Boolean(post.hasReposted));
    const [repostCount, setRepostCount] = useState(post.repostsCount ?? 0);
    const [savedLocal, setSavedLocal] = useState<boolean | null>(null);
    const [showShare, setShowShare] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [truncatable, setTruncatable] = useState(false);
    // Silenciado por defecto: en una lista scrolleable puede haber más de un
    // video en pantalla, y ninguno pidió sonido.
    const [muted, setMuted] = useState(true);

    const toggleSaveMut = useMutation(api.social.toggleSavePost);
    const saved = savedLocal ?? Boolean(post.hasSaved);

    // El servidor es la fuente de verdad: cuando Convex reemite el post
    // (propio like confirmado, o el de otro), el estado optimista se realinea.
    useEffect(() => {
        setLiked(Boolean(post.hasLiked));
        setLikeCount(post.likesCount);
    }, [post.hasLiked, post.likesCount]);

    useEffect(() => {
        setReposted(Boolean(post.hasReposted));
        setRepostCount(post.repostsCount ?? 0);
    }, [post.hasReposted, post.repostsCount]);

    useEffect(() => {
        setSavedLocal(null);
    }, [post.hasSaved]);

    // El reproductor ya no lo crea la tarjeta: en el feed lo presta el pool
    // compartido y suelto lo crea `PostVideo`. Ver `src/hooks/useVideoPool.tsx`.

    const handleLike = () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const wasLiked = liked;
        setLiked(!wasLiked);
        setLikeCount((n) => (wasLiked ? Math.max(0, n - 1) : n + 1));
        onLike();
    };

    const handleSave = async () => {
        if (!sessionToken) return;
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const prev = saved;
        setSavedLocal(!prev);
        try {
            const res = await toggleSaveMut({ sessionToken, postId: post._id as any });
            setSavedLocal(Boolean((res as any)?.saved));
        } catch (e) {
            setSavedLocal(prev);
            console.warn('[feed] save failed', e);
        }
    };

    const handleShare = () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setShowShare(true);
    };

    /**
     * Si ya reposteaste, des-repostea directo (como Twitter): abrir un menú
     * para deshacer sería un paso de más. Si no, abre Repostear/Citar.
     */
    const handleRepostPress = () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (reposted) {
            setReposted(false);
            setRepostCount((n) => Math.max(0, n - 1));
            onToggleRepost?.();
            return;
        }
        onOpenRepostMenu?.();
    };

    const handleCommercePress = () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (post.commercialProduct?.listingId) {
            onCommercePress(post.commercialProduct.listingId);
        }
    };

    const roleLabel =
        author?.role === 'business' ? 'Negocio' : author?.role === 'influencer' ? 'Creador' : null;

    /** `post.authorUserId` siempre viaja desde `decoratePosts`, así que la
     *  cabecera puede navegar aunque `author` venga en null (autor borrado). */
    const openAuthorProfile =
        onUserPress && post.authorUserId ? () => onUserPress(String(post.authorUserId)) : undefined;

    // Todas las imágenes del post, no sólo la primera. El
    // `commercialProduct.image` es el fallback para posts comerciales que no
    // subieron galería propia.
    const gallery =
        post.type === 'image' || post.type === 'commercial'
            ? post.images && post.images.length > 0
                ? post.images
                : post.commercialProduct?.image
                  ? [post.commercialProduct.image]
                  : []
            : [];

    const hasVideo = post.type === 'video' && !!post.videoUrl;
    const hasMedia = hasVideo || gallery.length > 0;

    /**
     * La píldora de compra flota SOBRE la media en vez de ocupar una fila
     * propia debajo: entra en la misma fijación visual que el contenido que el
     * ojo ya está mirando, no compite con la barra de acciones y no le suma
     * alto al post. Sin media no hay dónde flotar, así que ahí se cae al
     * bloque `full` de siempre.
     */
    const commercePill = post.commercialProduct ? (
        <CommerceTag
            product={post.commercialProduct}
            onPress={handleCommercePress}
            variant="compact"
        />
    ) : undefined;

    /**
     * Media a sangre en 4:5 (`PostMediaBox`). El video va en UNA sola
     * superficie con `cover` — el relleno difuminado dejó de hacer falta al
     * pasar de caja cuadrada a vertical. Las imágenes siguen con el carrusel,
     * que conserva su propio relleno porque ahí sí no queremos recortar.
     */
    const renderMedia = () => {
        if (hasVideo) {
            return (
                <PostMediaBox overlay={commercePill}>
                    <PostVideo
                        postId={String(post._id)}
                        videoUrl={post.videoUrl as string}
                        isFocused={focused}
                        muted={muted}
                        onToggleMute={() => setMuted((m) => !m)}
                    />
                </PostMediaBox>
            );
        }

        if (gallery.length > 0) {
            return (
                <PostMediaBox overlay={commercePill}>
                    <PostImageCarousel
                        images={gallery}
                        alts={post.imageAlts}
                        fallbackAlt={post.content}
                        dotsPosition="bottom"
                    />
                </PostMediaBox>
            );
        }

        return null;
    };

    return (
        <View style={styles.card}>
            {/* Atribución del repost. La tarjeta de abajo ES el post original
                —el servidor ya sustituyó el espejo—, así que todo lo que
                hagas acá (like, comentar, guardar) impacta el original. */}
            {repostedBy && (
                <TouchableOpacity
                    style={styles.repostBanner}
                    onPress={onUserPress && repostedBy.userId ? () => onUserPress(repostedBy.userId) : undefined}
                    disabled={!onUserPress || !repostedBy.userId}
                    activeOpacity={0.7}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver el perfil de ${repostedBy.name}`}
                >
                    <Repeat2 size={14} color={c.textMuted} />
                    <Text style={styles.repostBannerText} numberOfLines={1}>
                        {repostedBy.name} reposteó
                    </Text>
                </TouchableOpacity>
            )}

            {/* Cabecera: autor, hora relativa y "⋯" (Twitter/IG) */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.headerIdentity}
                    onPress={openAuthorProfile}
                    disabled={!openAuthorProfile}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver el perfil de ${author?.name || 'este usuario'}`}
                >
                    <Avatar size="md">
                        {author?.avatar ? <AvatarImage src={author.avatar} /> : null}
                        <AvatarFallback size="md">{(author?.name || 'U')[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <View style={styles.headerText}>
                        <View style={styles.nameRow}>
                            <Text style={styles.authorName} numberOfLines={1}>
                                {author?.name || 'Usuario'}
                            </Text>
                            {post.createdAt ? (
                                <Text style={styles.timestamp} numberOfLines={1}>
                                    {' · '}
                                    {formatRelativeTime(post.createdAt)}
                                </Text>
                            ) : null}
                        </View>
                        {(author?.username || roleLabel) && (
                            <Text style={styles.authorMeta} numberOfLines={1}>
                                {author?.username ? `@${author.username}` : roleLabel}
                            </Text>
                        )}
                    </View>
                </TouchableOpacity>
                {onOpenActions && (
                    <TouchableOpacity
                        onPress={onOpenActions}
                        style={styles.moreBtn}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Más opciones"
                    >
                        <MoreHorizontal size={20} color={c.textMuted} />
                    </TouchableOpacity>
                )}
            </View>

            {post.communityId && post.communityName && (
                <View style={styles.chipRow}>
                    <CommunityBadge
                        communityId={post.communityId}
                        name={post.communityName}
                        variant="surface"
                    />
                </View>
            )}

            {post.content ? (
                <>
                    <Text
                        style={styles.content}
                        numberOfLines={expanded ? undefined : COLLAPSED_LINES}
                        onTextLayout={(e) => {
                            if (!expanded && e.nativeEvent.lines.length >= COLLAPSED_LINES) {
                                setTruncatable(true);
                            }
                        }}
                    >
                        {post.content}
                    </Text>
                    {truncatable && !expanded && (
                        <TouchableOpacity onPress={() => setExpanded(true)} hitSlop={6}>
                            <Text style={styles.moreText}>Ver más</Text>
                        </TouchableOpacity>
                    )}
                </>
            ) : null}

            {post.type === 'text' && <LinkPreviewCard content={post.content} />}

            {post.type === 'poll' && post.poll && (
                <PollCard
                    poll={post.poll}
                    currentUserId={currentUserId}
                    onVote={onVotePoll}
                    isDark={isDark}
                />
            )}

            {renderMedia()}

            {/* Cita: el post original embebido, debajo del texto y la media
                propias. Un repost simple nunca llega acá — viene sustituido. */}
            {post.quotedPost !== undefined && post.quotedPost !== null && (
                <QuotedPostCard quoted={post.quotedPost} onPress={onOpenQuoted} onUserPress={onUserPress} />
            )}

            {post.audioTrackId && (
                <View style={styles.chipRow}>
                    <SoundPill
                        trackId={post.audioTrackId}
                        name={post.audioTrack?.name}
                        authorUsername={post.audioTrack?.authorUsername}
                        variant="surface"
                    />
                </View>
            )}

            {/* Con media la píldora ya está flotando encima; sin media (texto,
                encuesta) el bloque completo es la única afordancia de compra. */}
            {post.commercialProduct && !hasMedia && (
                <CommerceTag product={post.commercialProduct} onPress={handleCommercePress} />
            )}

            {/* Barra de acciones horizontal (Twitter) + guardar a la derecha (IG) */}
            <View style={styles.footer}>
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={handleLike}
                        accessibilityRole="button"
                        accessibilityLabel="Me gusta"
                    >
                        <View pointerEvents="none">
                            <Heart
                                size={20}
                                color={liked ? '#EF4444' : c.textMuted}
                                fill={liked ? '#EF4444' : 'transparent'}
                            />
                        </View>
                        <Text style={[styles.actionCount, liked && styles.actionCountLiked]}>
                            {formatCompactCount(likeCount)}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => onComment(post._id)}
                        accessibilityRole="button"
                        accessibilityLabel="Comentar"
                    >
                        <View pointerEvents="none">
                            <MessageCircle size={20} color={c.textMuted} />
                        </View>
                        <Text style={styles.actionCount}>{formatCompactCount(post.commentsCount)}</Text>
                    </TouchableOpacity>

                    {/* Sin repost en posts de comunidad: el espejo no heredaría
                        el `communityId` y filtraría contenido privado al feed
                        global. El backend lo rechaza igual. */}
                    {(onOpenRepostMenu || onToggleRepost) && !post.communityId && (
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={handleRepostPress}
                            accessibilityRole="button"
                            accessibilityLabel={reposted ? 'Quitar repost' : 'Repostear'}
                        >
                            <View pointerEvents="none">
                                <Repeat2 size={20} color={reposted ? '#22C55E' : c.textMuted} />
                            </View>
                            {repostCount > 0 && (
                                <Text style={[styles.actionCount, reposted && styles.actionCountReposted]}>
                                    {formatCompactCount(repostCount)}
                                </Text>
                            )}
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={handleShare}
                        accessibilityRole="button"
                        accessibilityLabel="Compartir"
                    >
                        <View pointerEvents="none">
                            <Share2 size={20} color={c.textMuted} />
                        </View>
                        {(post.sharesCount ?? 0) > 0 && (
                            <Text style={styles.actionCount}>{formatCompactCount(post.sharesCount)}</Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Segundo nivel de compra: la píldora sobre la media captura el
                    impulso, ésta captura la intención deliberada de quien ya
                    leyó el post y bajó hasta las acciones. */}
                {post.commercialProduct && hasMedia && (
                    <TouchableOpacity
                        style={styles.buyPill}
                        onPress={handleCommercePress}
                        accessibilityRole="button"
                        accessibilityLabel={`Comprar ${post.commercialProduct.name}`}
                    >
                        <View pointerEvents="none">
                            <ShoppingBag size={16} color={c.primary} />
                        </View>
                        <Text style={styles.buyPillText}>Comprar</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    onPress={handleSave}
                    style={styles.saveBtn}
                    accessibilityRole="button"
                    accessibilityLabel={saved ? 'Quitar de guardados' : 'Guardar'}
                >
                    <View pointerEvents="none">
                        <Bookmark
                            size={20}
                            color={saved ? c.primary : c.textMuted}
                            fill={saved ? c.primary : 'transparent'}
                        />
                    </View>
                </TouchableOpacity>
            </View>

            <SharePostModal
                postId={String(post._id)}
                postContent={post.content || 'Mirá esta publicación'}
                postPreviewImage={post.images?.[0]}
                visible={showShare}
                onClose={() => setShowShare(false)}
            />
        </View>
    );
});

PostCard.displayName = 'PostCard';

const getStyles = createThemedStyles((isDark, c) => ({
    card: {
        ...glassSurface(isDark, 'subtle'),
        borderRadius: Radius.xl,
        marginBottom: Space[3],
        paddingHorizontal: Space[4],
        paddingTop: Space[3],
        paddingBottom: Space[2],
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Space[2],
    },
    headerIdentity: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerText: {
        flex: 1,
        marginLeft: Space[3],
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    authorName: {
        ...Type.title,
        color: c.text,
        flexShrink: 1,
    },
    timestamp: {
        ...Type.bodySm,
        color: c.textMuted,
    },
    authorMeta: {
        ...Type.bodySm,
        color: c.textMuted,
        marginTop: 1,
    },
    moreBtn: {
        padding: 6,
        marginRight: -6,
    },
    chipRow: {
        marginBottom: Space[2],
        flexDirection: 'row',
    },
    content: {
        ...Type.body,
        color: c.textSecondary,
        marginBottom: Space[2],
    },
    moreText: {
        fontSize: 14,
        fontWeight: '700',
        color: c.primary,
        marginTop: -4,
        marginBottom: Space[2],
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Space[2],
        paddingTop: Space[1],
    },
    // `flex: 1` empuja la pildora de compra y el guardar contra el borde
    // derecho, en vez de que un `space-between` los reparta por el ancho.
    actions: {
        flex: 1,
        flexDirection: 'row',
        gap: Space[6],
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: Touch.min,
    },
    actionCount: {
        ...Type.bodySm,
        fontWeight: '600',
        color: c.textMuted,
    },
    actionCountLiked: {
        color: '#EF4444',
    },
    actionCountReposted: {
        color: '#22C55E',
    },
    buyPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 28,
        paddingHorizontal: Space[3],
        borderRadius: Radius.full,
        backgroundColor: c.primaryMuted,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.borderFocus,
    },
    buyPillText: {
        ...Type.caption,
        fontWeight: '800',
        color: c.primary,
    },
    repostBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: Space[2],
        paddingLeft: 2,
    },
    repostBannerText: {
        ...Type.bodySm,
        fontWeight: '700',
        flex: 1,
        color: c.textMuted,
    },
    saveBtn: {
        padding: 4,
        marginRight: -4,
    },
}));
