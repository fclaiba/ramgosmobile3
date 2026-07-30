import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Image, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Heart, MessageCircle, Share2, Tag, ShoppingCart } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Id } from '../../../convex/_generated/dataModel';
import { useTheme } from '../../contexts/ThemeContext';
import { glassShadow, colors, Radius } from '../../theme/tokens';

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
        videoUrl?: string;
        commercialProduct?: {
            listingId?: string;
            name: string;
            price?: number;
            imageUrl?: string;
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
    onComment: () => void;
    onCommercePress: (listingId: string) => void;
    isFocused?: boolean; // Para pausar/reproducir videos automáticamente
}

export const PostCard = React.memo(({ post, author, onLike, onComment, onCommercePress, isFocused = true }: PostCardProps) => {
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
                        allowsFullscreen={false} 
                        allowsPictureInPicture={false}
                        contentFit="cover"
                        nativeControls={false}
                    />
                </View>
            );
        }
        
        if (post.type === 'image' || post.type === 'commercial') {
            const displayImage = post.commercialProduct?.imageUrl || (post.images && post.images.length > 0 ? post.images[0] : null);
            if (displayImage) {
                return <Image source={{ uri: displayImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />;
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

                {/* Commerce Tag (Liquid Glass) */}
                {post.commercialProduct && (
                    <TouchableOpacity 
                        style={styles.commerceTagWrapper} 
                        onPress={handleCommercePress}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={`Ver producto ${post.commercialProduct.name}`}
                    >
                        <BlurView intensity={isDark ? 60 : 40} tint={isDark ? 'dark' : 'light'} style={styles.commerceTag}>
                            <ShoppingCart size={16} color={isDark ? '#FCD34D' : '#D97706'} />
                            <View style={styles.commerceInfo}>
                                <Text style={styles.commerceName} numberOfLines={1}>{post.commercialProduct.name}</Text>
                                {post.commercialProduct.price !== undefined && (
                                    <Text style={styles.commercePrice}>${post.commercialProduct.price}</Text>
                                )}
                            </View>
                            <View style={styles.buyBtn}>
                                <Text style={styles.buyBtnText}>Comprar</Text>
                            </View>
                        </BlurView>
                    </TouchableOpacity>
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
