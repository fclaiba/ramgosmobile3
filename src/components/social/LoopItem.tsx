import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated, Platform } from 'react-native';
import { Heart, MessageCircle, Share2, Music2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { Post as PostType, useSocial } from '../../contexts/SocialContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Radius, colors } from '../../theme/tokens';
import { glassSurface } from '../../utils/glass';
import { PostCommentsModal } from './PostCommentsModal';
import { SharePostModal } from './SharePostModal';

const { height, width } = Dimensions.get('window');

interface LoopItemProps {
    post: any;
    isActive: boolean;
    onUserClick: (userId: string) => void;
}

export const LoopItem = ({ post, isActive, onUserClick }: LoopItemProps) => {
    const videoRef = useRef<Video>(null);
    const { isDark } = useTheme();
    const { toggleLike } = useSocial();
    const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
    const [liked, setLiked] = useState(post.likedByUser || false);
    const [likes, setLikes] = useState(post.likeCount || 0);
    const [showComments, setShowComments] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const spinValue = new Animated.Value(0);

    useEffect(() => {
        if (!videoRef.current) return;
        if (isActive) {
            videoRef.current.playAsync().catch(() => {});
        } else {
            videoRef.current.pauseAsync().catch(() => {});
        }
    }, [isActive]);

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

    const handleLike = () => {
        setLiked(!liked);
        setLikes((prev: number) => liked ? prev - 1 : prev + 1);
        toggleLike({ targetType: 'post', targetId: post._id || post.id });
    };

    const hasVideo = !!post.videoUrl;

    return (
        <View style={styles.container}>
            {hasVideo ? (
                <Video
                    ref={videoRef}
                    style={styles.video}
                    source={{ uri: post.videoUrl }}
                    resizeMode={ResizeMode.COVER}
                    isLooping
                    shouldPlay={isActive}
                    onPlaybackStatusUpdate={status => setStatus(() => status)}
                />
            ) : (
                <ImageWithFallback src={post.images?.[0]} style={styles.video} />
            )}

            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.6)']}
                style={styles.gradient}
            />

            <View style={styles.bottomSection}>
                <View style={styles.infoSection}>
                    <TouchableOpacity style={styles.userRow} onPress={() => onUserClick(post.author?.userId)}>
                        <Avatar style={styles.avatar}>
                            <AvatarImage src={post.author?.avatar} />
                            <AvatarFallback>{post.author?.displayName?.[0]}</AvatarFallback>
                        </Avatar>
                        <Text style={styles.username}>@{post.author?.username}</Text>
                        <TouchableOpacity style={styles.followBtn}>
                            <Text style={styles.followText}>Seguir</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                    
                    <Text style={styles.content} numberOfLines={3}>{post.content}</Text>
                    
                    <View style={styles.musicRow}>
                        <Music2 size={14} color="#fff" />
                        <Text style={styles.musicText}>Sonido original - {post.author?.username}</Text>
                    </View>
                </View>

                <View style={styles.actionSection}>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
                        <View style={[styles.iconWrapper, liked && { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                            <Heart size={28} color={liked ? "#EF4444" : "#fff"} fill={liked ? "#EF4444" : "none"} />
                        </View>
                        <Text style={styles.actionText}>{likes}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => setShowComments(true)}>
                        <View style={styles.iconWrapper}>
                            <MessageCircle size={28} color="#fff" />
                        </View>
                        <Text style={styles.actionText}>{post.commentCount || 0}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => setShowShare(true)}>
                        <View style={styles.iconWrapper}>
                            <Share2 size={28} color="#fff" />
                        </View>
                        <Text style={styles.actionText}>Compartir</Text>
                    </TouchableOpacity>

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
                visible={showShare}
                onClose={() => setShowShare(false)}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width,
        height, 
        backgroundColor: '#000',
        justifyContent: 'center',
    },
    video: {
        ...StyleSheet.absoluteFillObject,
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
        bottom: Platform.OS === 'ios' ? 100 : 80, // Leave space for bottom nav
        left: 16,
        right: 8,
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    infoSection: {
        flex: 1,
        paddingRight: 16,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: '#fff',
    },
    username: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
        ...Platform.select({
            web: { textShadow: '0px 0px 4px rgba(0,0,0,0.5)' },
            default: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }
        })
    },
    followBtn: {
        borderWidth: 1,
        borderColor: '#fff',
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    followText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    content: {
        color: '#fff',
        fontSize: 15,
        marginBottom: 12,
        lineHeight: 20,
    },
    musicRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    musicText: {
        color: '#fff',
        fontSize: 13,
    },
    actionSection: {
        alignItems: 'center',
        gap: 16,
    },
    actionBtn: {
        alignItems: 'center',
        gap: 4,
    },
    iconWrapper: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
    recordWrapper: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#262626',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
        borderWidth: 8,
        borderColor: '#111',
    },
    recordImage: {
        width: 24,
        height: 24,
        borderRadius: 12,
    },
});
