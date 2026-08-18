import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Animated, Platform } from 'react-native';
import { Heart, MessageCircle, Share2, Music2, ShoppingBag, MoreVertical } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Radius, colors } from '../../theme/tokens';
import { glassSurface } from '../../utils/glass';
import { PostCommentsModal } from './PostCommentsModal';
import { SharePostModal } from './SharePostModal';
import { SocialFollowButton } from './SocialFollowButton';

interface LoopItemProps {
    post: any;
    isActive: boolean;
    onUserClick: (userId: string) => void;
    onCommercePress?: (listingId: string, postId: string) => void;
}

export const LoopItem = ({ post, isActive, onUserClick, onCommercePress }: LoopItemProps) => {
    const { height, width } = useWindowDimensions();
    const videoRef = useRef<Video>(null);
    const isDark = useTheme().colorScheme === 'dark';
    const { sessionToken } = useAuth();

    const postId = post._id || post.id;

    const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
    const [liked, setLiked] = useState(Boolean(post.isLikedByMe ?? post.likedByUser));
    const [likes, setLikes] = useState(post.likeCount || 0);
    const [showComments, setShowComments] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const spinValue = new Animated.Value(0);

    const toggleLike = useMutation(api.social.toggleLike);
    const addView = useMutation(api.social.addView);
    const viewCounted = useRef(false);

    // Server state wins when the feed refetches (another device, cache hydrate).
    useEffect(() => {
        setLiked(Boolean(post.isLikedByMe ?? post.likedByUser));
        setLikes(post.likeCount || 0);
    }, [post.isLikedByMe, post.likedByUser, post.likeCount]);

    useEffect(() => {
        if (!videoRef.current) return;
        if (isActive) {
            videoRef.current.playAsync().catch(() => {});
        } else {
            videoRef.current.pauseAsync().catch(() => {});
        }
    }, [isActive]);

    // Impressions are what pay creators for reach, so count one the first time
    // this loop actually becomes the active item. The mutation is idempotent
    // per (post, viewer), so a re-scroll is silently free.
    useEffect(() => {
        if (!isActive || viewCounted.current || !sessionToken || !postId) return;
        viewCounted.current = true;
        addView({ sessionToken, postIds: [postId] }).catch(() => {
            viewCounted.current = false;
        });
    }, [isActive, sessionToken, postId, addView]);

    useEffect(() => {
        Animated.loop(
            Animated.timing(spinValue, {
                toValue: 1,
                duration: 3000,
                useNativeDriver: Platform.OS !== 'web',
            })
        ).start();
    }, []);

    const spin = spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    const handleLike = async () => {
        if (!sessionToken || !postId) return;
        // Optimistic: the heart must answer the tap instantly in a video feed.
        const next = !liked;
        setLiked(next);
        setLikes((prev: number) => (next ? prev + 1 : Math.max(0, prev - 1)));
        try {
            await toggleLike({ sessionToken, targetType: 'post', targetId: postId });
        } catch {
            setLiked(!next);
            setLikes((prev: number) => (next ? Math.max(0, prev - 1) : prev + 1));
        }
    };

    const hasVideo = !!post.videoUrl;

    return (
        <View style={[styles.container, { width, height }]}>
            <View style={styles.videoCentering}>
                {hasVideo ? (
                    <Video
                        ref={videoRef}
                        style={styles.video}
                        source={{ uri: post.videoUrl }}
                        resizeMode={ResizeMode.CONTAIN}
                        isLooping
                        shouldPlay={isActive}
                        onPlaybackStatusUpdate={status => setStatus(() => status)}
                    />
                ) : (
                    <ImageWithFallback src={post.images?.[0]} style={styles.video} resizeMode="contain" />
                )}
            </View>

            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.8)']}
                locations={[0, 0.5, 1]}
                style={styles.gradient}
            />

            <View style={styles.bottomSection}>
                <View style={styles.infoSection}>
                    <View style={styles.userRow}>
                        <TouchableOpacity
                            style={styles.userTap}
                            onPress={() => onUserClick(post.author?.userId)}
                            accessibilityRole="button"
                            accessibilityLabel={`Ver perfil de ${post.author?.username ?? 'usuario'}`}
                        >
                            <Avatar style={styles.avatar}>
                                <AvatarImage src={post.author?.avatar} />
                                <AvatarFallback>{post.author?.displayName?.[0]}</AvatarFallback>
                            </Avatar>
                            <Text style={styles.username}>{post.author?.username}</Text>
                        </TouchableOpacity>
                        
                        {post.author?.userId && (
                            <View style={styles.followContainer}>
                                <Text style={styles.bulletPoint}>•</Text>
                                <TouchableOpacity>
                                    <Text style={styles.followTextPlain}>Seguir</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                    
                    <Text style={styles.content} numberOfLines={2}>{post.content}</Text>
                    
                    <View style={styles.musicRow}>
                        <Music2 size={12} color="#fff" style={styles.iconShadow as any} />
                        <Text style={styles.musicText}>Sonido original - {post.author?.username}</Text>
                    </View>
                </View>

                <View style={styles.actionSection}>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
                        <View style={styles.iconWrapper}>
                            <Heart size={28} color={liked ? "#EF4444" : "#fff"} fill={liked ? "#EF4444" : "none"} style={styles.iconShadow as any} />
                        </View>
                        <Text style={styles.actionText}>{likes}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => setShowComments(true)} accessibilityRole="button" accessibilityLabel="Comentar">
                        <View style={styles.iconWrapper}>
                            <MessageCircle size={28} color="#fff" style={styles.iconShadow as any} />
                        </View>
                        <Text style={styles.actionText}>{post.commentCount || 0}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => setShowShare(true)}>
                        <View style={styles.iconWrapper}>
                            <Share2 size={28} color="#fff" style={styles.iconShadow as any} />
                        </View>
                        <Text style={styles.actionText}>{post.shareCount || 0}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn}>
                        <View style={styles.iconWrapper}>
                            <MoreVertical size={28} color="#fff" style={styles.iconShadow as any} />
                        </View>
                    </TouchableOpacity>

                    {post.commercialProduct?.listingId && (
                        <TouchableOpacity
                            style={[styles.actionBtn, { marginTop: 8 }]}
                            onPress={() => onCommercePress?.(post.commercialProduct.listingId, postId)}
                            accessibilityRole="button"
                            accessibilityLabel={
                                post.commercialProduct.discountPercent
                                    ? `Obtener ${Math.round(post.commercialProduct.discountPercent)}% OFF en ${post.commercialProduct.name}`
                                    : `Comprar ${post.commercialProduct.name}`
                            }
                        >
                            <View style={[styles.iconWrapper, { backgroundColor: '#2563EB', borderRadius: 8, width: 40, height: 40 }]}>
                                <ShoppingBag size={20} color="#fff" />
                            </View>
                        </TouchableOpacity>
                    )}

                    <Animated.View style={[styles.recordWrapper, { transform: [{ rotate: spin }] }]}>
                        <ImageWithFallback src={post.author?.avatar} style={styles.recordImage} />
                    </Animated.View>
                </View>
            </View>

            <PostCommentsModal
                postId={post._id || post.id}
                visible={showComments}
                onClose={() => setShowComments(false)}
            />
            <SharePostModal
                postContent={post.content || 'Check out this post!'}
                postId={String(post._id ?? post.id ?? '')}
                visible={showShare}
                onClose={() => setShowShare(false)}
            />
        </View>
    );
};

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 90 : 70;

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#000',
    },
    videoCentering: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    video: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    gradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '50%',
    },
    bottomSection: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 90 : 70, // Espacio para bottom nav tab de IG
        left: 0,
        right: 0,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
    },
    infoSection: {
        flex: 1,
        paddingRight: 32,
        paddingBottom: 8,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    userTap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#fff',
    },
    username: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 15,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    followContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    bulletPoint: {
        color: '#fff',
        fontSize: 14,
        marginHorizontal: 6,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    followTextPlain: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    content: {
        color: '#fff',
        fontSize: 14,
        marginBottom: 10,
        lineHeight: 18,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    musicRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        alignSelf: 'flex-start',
    },
    musicText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '500',
    },
    iconShadow: {
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    actionSection: {
        alignItems: 'center',
        gap: 20,
    },
    actionBtn: {
        alignItems: 'center',
        gap: 2,
    },
    iconWrapper: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        // Transparent in Reels, no dark circle
        backgroundColor: 'transparent',
    },
    actionText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    recordWrapper: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#111',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
        borderWidth: 6,
        borderColor: '#262626',
    },
    recordImage: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
});
