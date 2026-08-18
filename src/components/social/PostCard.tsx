import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Image, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Heart, MessageCircle, Share2, Tag, ShoppingCart, MoreVertical } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Id } from '../../../convex/_generated/dataModel';
import { useTheme } from '../../contexts/ThemeContext';
import { glassShadow, colors, Radius } from '../../theme/tokens';
import { CommerceTag } from './CommerceTag';
import { PostImageCarousel } from './PostImageCarousel';

const { width, height } = Dimensions.get('window');

// Altura calculada para ocupar toda la pantalla restando el BottomTab y SafeAreas
// Esto se ajustará mejor si el contenedor le pasa el layout exacto.
const POST_HEIGHT = height - 85; 

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
    };
    author: {
        name: string;
        avatar?: string;
        role?: string;
    } | null;
    onLike: () => void;
    onComment: (postId?: any) => void;
    onCommercePress: (listingId: string) => void;
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
}: {
    poll: NonNullable<PostCardProps['post']['poll']>;
    currentUserId?: string;
    onVote?: (optionId: string) => void;
}) => {
    const myVote = poll.voters?.find((v) => v.userId === currentUserId)?.optionId;
    const ended = new Date(poll.endsAt).getTime() < Date.now();
    const showResults = Boolean(myVote) || ended;
    const total = Math.max(1, poll.totalVotes);

    return (
        <View style={pollStyles.container}>
            {poll.options.map((opt) => {
                const pct = Math.round((opt.votes / total) * 100);
                const isMine = myVote === opt.id;
                return (
                    <TouchableOpacity
                        key={opt.id}
                        style={pollStyles.option}
                        disabled={showResults || !onVote}
                        onPress={() => onVote?.(opt.id)}
                        accessibilityRole="button"
                    >
                        {showResults && (
                            <View style={[pollStyles.fill, { width: `${pct}%` }, isMine && pollStyles.fillMine]} />
                        )}
                        <View style={pollStyles.optionRow}>
                            <Text style={pollStyles.optionText}>{opt.text}</Text>
                            {showResults && <Text style={pollStyles.optionPct}>{pct}%</Text>}
                        </View>
                    </TouchableOpacity>
                );
            })}
            <Text style={pollStyles.meta}>
                {poll.totalVotes} voto{poll.totalVotes === 1 ? '' : 's'} · {ended ? 'Encuesta finalizada' : 'En curso'}
            </Text>
        </View>
    );
};

const pollStyles = StyleSheet.create({
    container: { marginTop: 8, gap: 8 },
    option: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    fill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    fillMine: { backgroundColor: 'rgba(59,130,246,0.35)' },
    optionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    optionText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    optionPct: { color: '#fff', fontWeight: '700', fontSize: 13 },
    meta: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
});

export const PostCard = React.memo(({ post, author, onLike, onComment, onCommercePress, isFocused = true, onOpenActions, onVotePoll, currentUserId }: PostCardProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    // Manejo de Video usando expo-video (Performance)
    const player = useVideoPlayer(post.videoUrl || '', player => {
        player.loop = true;
    });

    // Auto Play/Pause basado en si el post está en foco (FlashList viewability)
    React.useEffect(() => {
        if (!post.videoUrl || !player) return;
        if (isFocused) {
            player.play();
        } else {
            player.pause();
        }
    }, [isFocused, player, post.videoUrl]);

    const handleLike = () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onLike();
    };

    const handleCommercePress = () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (post.commercialProduct?.listingId) {
            onCommercePress(post.commercialProduct.listingId);
        }
    };

    // Render del fondo visual dependiendo del tipo de post
    const renderMedia = () => {
        if (post.type === 'video' && post.videoUrl) {
            return (
                <View style={StyleSheet.absoluteFill}>
                    <VideoView
                        style={StyleSheet.absoluteFill}
                        player={player}
                        contentFit="cover"
                    />
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
                    <PostImageCarousel
                        images={gallery}
                        alts={post.imageAlts}
                        fallbackAlt={post.content}
                    />
                );
            }
        }

        // Fallback Gradient para texto o encuestas
        return (
            <LinearGradient
                colors={isDark ? ['#1F2937', '#111827', '#030712'] : ['#E0E7FF', '#C7D2FE', '#A5B4FC']}
                style={StyleSheet.absoluteFill}
            />
        );
    };

    // Capa de oscurecimiento sutil inferior para legibilidad
    const renderVignette = () => (
        <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.7)']}
            style={styles.vignette}
        />
    );

    return (
        <View style={[styles.container, { height: POST_HEIGHT }]}>
            {renderMedia()}
            {renderVignette()}

            {/* Panel de Contenido Inferior (HUD Liquid Glass) */}
            <View style={styles.hudContainer}>
                
                {/* Author Info */}
                <View style={styles.authorRow}>
                    <View style={styles.avatarPlaceholder}>
                        {author?.avatar ? (
                            <Image source={{ uri: author.avatar }} style={styles.avatar} />
                        ) : (
                            <Text style={styles.avatarText}>{author?.name?.charAt(0).toUpperCase() || '?'}</Text>
                        )}
                    </View>
                    <View>
                        <Text style={styles.authorName}>{author?.name || 'Usuario'}</Text>
                        <Text style={styles.authorRole}>{author?.role === 'business' ? 'Negocio' : author?.role === 'influencer' ? 'Creador' : 'Comunidad'}</Text>
                    </View>
                </View>

                {/* Post Text Content */}
                {post.content ? (
                    <Text style={styles.content} numberOfLines={3}>{post.content}</Text>
                ) : null}

                {post.type === 'poll' && post.poll && (
                    <PollCard poll={post.poll} currentUserId={currentUserId} onVote={onVotePoll} />
                )}

                {/* Commerce Tag (Liquid Glass) */}
                {post.commercialProduct && (
                    <CommerceTag
                        product={post.commercialProduct}
                        onPress={onCommercePress}
                    />
                )}
            </View>

            {/* Interacciones Laterales */}
            <View style={styles.interactionSidebar}>
                <TouchableOpacity style={styles.actionBtn} onPress={handleLike} accessibilityRole="button" accessibilityLabel="Me gusta">
                    <View style={[styles.actionIconContainer, post.hasLiked && styles.actionIconLiked]}>
                        <Heart size={28} color={post.hasLiked ? '#EF4444' : '#FFF'} fill={post.hasLiked ? '#EF4444' : 'transparent'} />
                    </View>
                    <Text style={styles.actionCount}>{post.likesCount}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtn} onPress={() => onComment(post._id)} accessibilityRole="button" accessibilityLabel="Comentar">
                    <View style={styles.actionIconContainer}>
                        <MessageCircle size={28} color="#FFF" />
                    </View>
                    <Text style={styles.actionCount}>{post.commentsCount}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtn} accessibilityRole="button" accessibilityLabel="Compartir">
                    <View style={styles.actionIconContainer}>
                        <Share2 size={28} color="#FFF" />
                    </View>
                    <Text style={styles.actionCount}>Share</Text>
                </TouchableOpacity>

                {onOpenActions && (
                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={onOpenActions}
                        accessibilityRole="button"
                        accessibilityLabel="Más opciones"
                    >
                        <View style={styles.actionIconContainer}>
                            <MoreVertical size={28} color="#FFF" />
                        </View>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        width: width,
        justifyContent: 'flex-end',
        position: 'relative',
        backgroundColor: '#000',
    },
    vignette: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '50%',
        pointerEvents: 'none',
    },
    hudContainer: {
        padding: 16,
        paddingBottom: 32, // Espacio para el bottom tab
        paddingRight: 70, // Espacio para la barra lateral
    },
    authorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 12,
    },
    avatarPlaceholder: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 22,
    },
    avatarText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 18,
    },
    authorName: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    authorRole: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        fontWeight: '500',
    },
    content: {
        color: '#fff',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 16,
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    
    // Commerce Tag Liquid Glass
    commerceTagWrapper: {
        borderRadius: Radius.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    commerceTag: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        gap: 12,
    },
    commerceInfo: {
        flex: 1,
    },
    commerceName: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    commercePrice: {
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '600',
        fontSize: 12,
    },
    buyBtn: {
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: Radius.full,
    },
    buyBtnText: {
        color: '#000',
        fontWeight: 'bold',
        fontSize: 12,
    },

    // Sidebar
    interactionSidebar: {
        position: 'absolute',
        right: 8,
        bottom: 32,
        alignItems: 'center',
        gap: 20,
    },
    actionBtn: {
        alignItems: 'center',
        gap: 4,
    },
    actionIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(0,0,0,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionIconLiked: {
        backgroundColor: 'rgba(239,68,68,0.2)',
    },
    actionCount: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    }
});
