import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Volume2, VolumeX, Repeat2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius } from '../../theme/tokens';
import { glassSurface } from '../../utils/glass';
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
const COLLAPSED_LINES = 6;

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
export const PostCard = React.memo(({ post, author, repostedBy, onLike, onComment, onCommercePress, isFocused = true, onOpenActions, onVotePoll, currentUserId, onOpenRepostMenu, onToggleRepost, onOpenQuoted }: PostCardProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const styles = getStyles(isDark);
    const { sessionToken } = useAuth();

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

    // Manejo de Video usando expo-video (Performance)
    const player = useVideoPlayer(post.videoUrl || '', player => {
        player.loop = true;
        player.muted = true;
    });

    // Auto Play/Pause basado en si el post está en foco (FlashList viewability)
    useEffect(() => {
        if (!post.videoUrl || !player) return;
        if (isFocused) {
            player.play();
        } else {
            player.pause();
        }
    }, [isFocused, player, post.videoUrl]);

    useEffect(() => {
        if (!post.videoUrl || !player) return;
        player.muted = muted;
    }, [muted, player, post.videoUrl]);

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

    /**
     * Media encuadrada. Se mantiene la regla de `PostImageCarousel`: el
     * contenido se ve COMPLETO (`contain`) y las bandas se rellenan con una
     * copia difuminada — sólo que ahora dentro de una caja cuadrada en vez
     * de a pantalla completa.
     */
    const renderMedia = () => {
        if (post.type === 'video' && post.videoUrl) {
            return (
                <View style={styles.mediaBox}>
                    <VideoView
                        style={StyleSheet.absoluteFill}
                        player={player}
                        contentFit="cover"
                        nativeControls={false}
                        pointerEvents="none"
                    />
                    <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.videoBackdropTint} pointerEvents="none" />
                    <VideoView
                        style={StyleSheet.absoluteFill}
                        player={player}
                        contentFit="contain"
                        nativeControls={false}
                    />
                    <TouchableOpacity
                        style={styles.muteBtn}
                        onPress={() => setMuted((m) => !m)}
                        accessibilityRole="button"
                        accessibilityLabel={muted ? 'Activar sonido' : 'Silenciar'}
                    >
                        {muted ? <VolumeX size={16} color="#FFF" /> : <Volume2 size={16} color="#FFF" />}
                    </TouchableOpacity>
                </View>
            );
        }

        if (post.type === 'image' || post.type === 'commercial') {
            // Todas las imágenes del post, no sólo la primera. El
            // `commercialProduct.image` es el fallback para posts comerciales
            // que no subieron galería propia.
            const gallery =
                post.images && post.images.length > 0
                    ? post.images
                    : post.commercialProduct?.image
                      ? [post.commercialProduct.image]
                      : [];

            if (gallery.length > 0) {
                return (
                    <View style={styles.mediaBox}>
                        <PostImageCarousel
                            images={gallery}
                            alts={post.imageAlts}
                            fallbackAlt={post.content}
                            dotsPosition="bottom"
                        />
                    </View>
                );
            }
        }

        return null;
    };

    return (
        <View style={styles.card}>
            {/* Atribución del repost. La tarjeta de abajo ES el post original
                —el servidor ya sustituyó el espejo—, así que todo lo que
                hagas acá (like, comentar, guardar) impacta el original. */}
            {repostedBy && (
                <View style={styles.repostBanner}>
                    <Repeat2 size={14} color={c.textMuted} />
                    <Text style={styles.repostBannerText} numberOfLines={1}>
                        {repostedBy.name} reposteó
                    </Text>
                </View>
            )}

            {/* Cabecera: autor, hora relativa y "⋯" (Twitter/IG) */}
            <View style={styles.header}>
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
                <QuotedPostCard quoted={post.quotedPost} onPress={onOpenQuoted} />
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

            {post.commercialProduct && (
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
                                size={22}
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
                            <MessageCircle size={22} color={c.textMuted} />
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
                                <Repeat2 size={22} color={reposted ? '#22C55E' : c.textMuted} />
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
                            <Share2 size={22} color={c.textMuted} />
                        </View>
                        {(post.sharesCount ?? 0) > 0 && (
                            <Text style={styles.actionCount}>{formatCompactCount(post.sharesCount)}</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    onPress={handleSave}
                    style={styles.saveBtn}
                    accessibilityRole="button"
                    accessibilityLabel={saved ? 'Quitar de guardados' : 'Guardar'}
                >
                    <View pointerEvents="none">
                        <Bookmark
                            size={22}
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

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        card: {
            ...glassSurface(isDark, 'subtle'),
            marginBottom: 12,
            paddingHorizontal: 16,
            paddingVertical: 16,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 10,
        },
        headerText: {
            flex: 1,
            marginLeft: 12,
        },
        nameRow: {
            flexDirection: 'row',
            alignItems: 'baseline',
        },
        authorName: {
            fontWeight: '700',
            fontSize: 15,
            color: c.text,
            letterSpacing: -0.3,
            flexShrink: 1,
        },
        timestamp: {
            fontSize: 13,
            fontWeight: '500',
            color: c.textMuted,
        },
        authorMeta: {
            fontSize: 13,
            fontWeight: '500',
            color: c.textMuted,
            marginTop: 1,
        },
        moreBtn: {
            padding: 6,
            marginRight: -6,
        },
        chipRow: {
            marginBottom: 10,
            flexDirection: 'row',
        },
        content: {
            fontSize: 15,
            lineHeight: 22,
            color: c.textSecondary,
            marginBottom: 10,
        },
        moreText: {
            fontSize: 14,
            fontWeight: '700',
            color: c.primary,
            marginTop: -4,
            marginBottom: 10,
        },
        // Caja cuadrada: con `contain` + relleno difuminado sirve igual a
        // fotos apaisadas y a video vertical, sin recortar ninguno.
        mediaBox: {
            width: '100%',
            aspectRatio: 1,
            borderRadius: Radius.lg,
            overflow: 'hidden',
            backgroundColor: isDark ? '#000' : c.surface2,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
            marginBottom: 12,
        },
        videoBackdropTint: {
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
        },
        muteBtn: {
            position: 'absolute',
            right: 10,
            bottom: 10,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
        },
        footer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 4,
        },
        actions: {
            flexDirection: 'row',
            gap: 24,
        },
        actionBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            minHeight: 32,
        },
        actionCount: {
            fontSize: 13,
            fontWeight: '600',
            color: c.textMuted,
        },
        actionCountLiked: {
            color: '#EF4444',
        },
        actionCountReposted: {
            color: '#22C55E',
        },
        repostBanner: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 8,
            paddingLeft: 2,
        },
        repostBannerText: {
            flex: 1,
            fontSize: 13,
            fontWeight: '700',
            color: c.textMuted,
        },
        saveBtn: {
            padding: 4,
            marginRight: -4,
        },
    });
};
