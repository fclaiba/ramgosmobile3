import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { confirmAction } from '../../utils/confirm';
import { Heart, MessageCircle, Share2, MoreHorizontal, Bookmark, ShoppingBag } from 'lucide-react-native';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { PostCommentsModal } from './PostCommentsModal';
import { SharePostModal } from './SharePostModal';

import { Post as PostType, useSocial } from '../../contexts/SocialContext';
import { useCart } from '../../contexts/CartContext';
import { useMarketplace } from '../../contexts/MarketplaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Radius, colors, glassShadow } from '../../theme/tokens';
import { glassSurface } from '../../utils/glass';


export const Post = ({ post, onUserClick }: { post: PostType, onUserClick: (id: string) => void }) => {
    const { isPostSaved, savePost, unsavePost, currentUser, deletePost } = useSocial();
    const { addToCart } = useCart();
    const { addToWishlist } = useMarketplace();
    const [liked, setLiked] = useState(post.likedByUser || false);
    const [likes, setLikes] = useState(post.likeCount || post.likes?.length || 0);
    const [showComments, setShowComments] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const saved = isPostSaved(post.id);

    const { theme, colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const handleSave = () => {
        if (saved) unsavePost(post._id || post.id);
        else savePost(post._id || post.id);
    };

    const handleLike = () => {
        setLiked(!liked);
        setLikes((prev: number) => liked ? prev - 1 : prev + 1);
    };

    const handleDelete = async () => {
        const ok = await confirmAction(
            "Eliminar publicación",
            "¿Estás seguro de que quieres eliminar esta publicación?",
        );
        if (ok) deletePost(post._id || post.id);
    };

    const handleMoreOptions = () => {
        // Only owner action today is delete; go straight to the styled confirm.
        if (currentUser.id === (post.author || post.user)?.userId || currentUser.id === (post.author || post.user)?.id) handleDelete();
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.userInfo} onPress={() => onUserClick((post.author || post.user)?.userId || (post.author || post.user)?.id)}>
                    <Avatar style={{ width: 44, height: 44, borderWidth: 2, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' }}>
                        <AvatarImage src={(post.author || post.user)?.avatar} />
                        <AvatarFallback>{((post.author || post.user)?.displayName || (post.author || post.user)?.name || 'U')[0]}</AvatarFallback>
                    </Avatar>
                    <View style={{ marginLeft: 12 }}>
                        <Text style={styles.userName}>{(post.author || post.user)?.displayName || (post.author || post.user)?.name || 'Usuario'}</Text>
                        <Text style={styles.timestamp}>{new Date(post.createdAt || post.timestamp || Date.now()).toLocaleDateString()}</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.moreBtn} onPress={handleMoreOptions}>
                    <MoreHorizontal size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                </TouchableOpacity>
            </View>

            <Text style={styles.content}>{post.content}</Text>

            {post.images && post.images.length > 0 && (
                <View style={styles.imageContainer}>
                    <ImageWithFallback src={post.images[0]} style={styles.postImage} />
                </View>
            )}

            {post.commercialProduct && (
                <View style={[styles.commercialContainer, isDark ? styles.commercialContainerDark : styles.commercialContainerLight]}>
                    <View style={styles.commercialImageContainer}>
                        <ImageWithFallback src={post.commercialProduct.image} style={styles.commercialImage} />
                    </View>
                    <View style={styles.commercialContent}>
                        <View>
                            <Text style={[styles.commercialTitle, isDark ? { color: '#F9FAFB' } : { color: '#111827' }]} numberOfLines={2}>
                                {post.commercialProduct.name}
                            </Text>
                            <Text style={[styles.commercialSubtitle, isDark ? { color: '#9CA3AF' } : { color: '#6B7280' }]}>
                                {post.commercialProduct.type.toUpperCase()}
                            </Text>
                        </View>
                        <View style={styles.commercialFooter}>
                            <Text style={[styles.commercialPrice, isDark ? { color: '#10B981' } : { color: '#059669' }]}>
                                ${post.commercialProduct.price.toFixed(2)}
                            </Text>
                            <View style={styles.commercialActions}>
                                <TouchableOpacity
                                    style={[styles.commercialButton, { backgroundColor: colors(isDark).glass }]}
                                    onPress={() => addToWishlist(post.commercialProduct!.id, post.commercialProduct!.referralLink)}
                                >
                                    <Bookmark size={16} color={isDark ? '#D1D5DB' : '#374151'} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.commercialButton, { backgroundColor: isDark ? '#2563EB' : '#2563EB' }]}
                                    onPress={() => addToCart({
                                        id: post.commercialProduct!.id,
                                        name: post.commercialProduct!.name,
                                        price: post.commercialProduct!.price,
                                        image: post.commercialProduct!.image,
                                        quantity: 1,
                                        sellerId: (post.author || post.user)?.userId || (post.author || post.user)?.id,
                                        sellerName: (post.author || post.user)?.displayName || (post.author || post.user)?.name,
                                        referralCode: post.commercialProduct!.referralLink,
                                    })}
                                >
                                    <ShoppingBag size={16} color="#ffffff" />
                                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Agregar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            )}

            <View style={styles.footer}>
                <View style={styles.actions}>
                    <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
                        <Heart size={24} color={liked ? "#EF4444" : isDark ? "#9CA3AF" : "#4B5563"} fill={liked ? "#EF4444" : "none"} />
                        <Text style={[styles.actionText, liked && { color: "#EF4444" }]}>{likes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={() => setShowComments(true)}>
                        <MessageCircle size={24} color={isDark ? "#9CA3AF" : "#4B5563"} />
                        <Text style={styles.actionText}>{post.commentCount || post.comments?.length || 0}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={() => setShowShare(true)}>
                        <Share2 size={24} color={isDark ? "#9CA3AF" : "#4B5563"} />
                    </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={handleSave}>
                    <Bookmark size={24} color={saved ? (isDark ? "#F9FAFB" : "#000") : (isDark ? "#9CA3AF" : "#4B5563")} fill={saved ? (isDark ? "#F9FAFB" : "#000") : "none"} />
                </TouchableOpacity>
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
        </View >
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        ...glassSurface(isDark, 'subtle'),
        marginBottom: 12,
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    userInfo: { flexDirection: 'row', alignItems: 'center' },
    userName: { fontWeight: '700', fontSize: 16, color: colors(isDark).text, letterSpacing: -0.3 },
    timestamp: { color: isDark ? '#9CA3AF' : '#9CA3AF', fontSize: 13, marginTop: 2, fontWeight: '500' },
    moreBtn: { padding: 8, marginRight: -8 },

    content: { fontSize: 16, color: isDark ? '#D1D5DB' : '#1F2937', marginBottom: 12, lineHeight: 24, fontWeight: '400' },

    imageContainer: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.xl, overflow: 'hidden', marginBottom: 16, backgroundColor: colors(isDark).glass, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' },
    postImage: { width: '100%', height: '100%' },

    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 },
    actions: { flexDirection: 'row', gap: 24 },
    actionButton: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionText: { fontSize: 14, color: colors(isDark).textMuted, fontWeight: '600' },

    // Commercial Product Styles
    commercialContainer: {
        borderRadius: Radius.md,
        marginBottom: 16,
        overflow: 'hidden',
        borderWidth: 1,
        flexDirection: 'row',
    },
    commercialContainerLight: {
        backgroundColor: '#FAFAFA',
        borderColor: '#E5E7EB',
    },
    commercialContainerDark: {
        backgroundColor: '#374151',
        borderColor: '#4B5563',
    },
    commercialImageContainer: {
        width: 100,
        height: 100,
        backgroundColor: '#E5E7EB',
    },
    commercialImage: {
        width: '100%',
        height: '100%',
    },
    commercialContent: {
        flex: 1,
        padding: 12,
        justifyContent: 'space-between',
    },
    commercialTitle: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
    },
    commercialSubtitle: {
        fontSize: 12,
        fontWeight: '500',
    },
    commercialFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
    },
    commercialPrice: {
        fontSize: 16,
        fontWeight: '700',
    },
    commercialActions: {
        flexDirection: 'row',
        gap: 8,
    },
    commercialButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: Radius.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
});
