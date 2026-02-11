import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { Heart, MessageCircle, Share2, MoreHorizontal, Bookmark, ShoppingBag } from 'lucide-react-native';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { PostCommentsModal } from './PostCommentsModal';
import { SharePostModal } from './SharePostModal';

import { Post as PostType, useSocial } from '../../contexts/SocialContext';
import { useCart } from '../../contexts/CartContext';
import { useMarketplace } from '../../contexts/MarketplaceContext';
import { useTheme } from '../../contexts/ThemeContext';

export const Post = ({ post, onUserClick }: { post: PostType, onUserClick: (id: string) => void }) => {
    const { isPostSaved, savePost, unsavePost } = useSocial();
    const { addItem } = useCart();
    const { addToWishlist } = useMarketplace();
    const [liked, setLiked] = useState(post.likedByUser || false);
    const [likes, setLikes] = useState(post.likes);
    const [showComments, setShowComments] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const saved = isPostSaved(post.id);

    const { theme, colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const handleSave = () => {
        if (saved) unsavePost(post.id);
        else savePost(post.id);
    };

    const handleLike = () => {
        setLiked(!liked);
        setLikes((prev: number) => liked ? prev - 1 : prev + 1);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.userInfo} onPress={() => onUserClick(post.user.id)}>
                    <Avatar style={{ width: 44, height: 44, borderWidth: 2, borderColor: isDark ? '#374151' : '#F3F4F6' }}>
                        <AvatarImage src={post.user.avatar} />
                        <AvatarFallback>{post.user.name[0]}</AvatarFallback>
                    </Avatar>
                    <View style={{ marginLeft: 12 }}>
                        <Text style={styles.userName}>{post.user.name}</Text>
                        <Text style={styles.timestamp}>{post.timestamp}</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.moreBtn}>
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
                                    style={[styles.commercialButton, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]}
                                    onPress={() => addToWishlist(post.commercialProduct!.id, post.commercialProduct!.referralLink)}
                                >
                                    <Bookmark size={16} color={isDark ? '#D1D5DB' : '#374151'} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.commercialButton, { backgroundColor: isDark ? '#2563EB' : '#2563EB' }]}
                                    onPress={() => addItem({
                                        id: post.commercialProduct!.id,
                                        name: post.commercialProduct!.name,
                                        price: post.commercialProduct!.price,
                                        image: post.commercialProduct!.image,
                                        type: 'product', // Mapping types if needed
                                        sellerId: post.user.id, // Assuming seller is the post author or linked
                                        sellerName: post.user.name,
                                        referralCode: post.commercialProduct!.referralLink
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
                        <Text style={styles.actionText}>{post.comments.length}</Text>
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
                postId={post.id}
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
        backgroundColor: isDark ? '#1F2937' : '#fff',
        marginBottom: 8,
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderRadius: 16,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    userInfo: { flexDirection: 'row', alignItems: 'center' },
    userName: { fontWeight: '700', fontSize: 16, color: isDark ? '#F9FAFB' : '#111827', letterSpacing: -0.3 },
    timestamp: { color: isDark ? '#9CA3AF' : '#9CA3AF', fontSize: 13, marginTop: 2, fontWeight: '500' },
    moreBtn: { padding: 8, marginRight: -8 },

    content: { fontSize: 16, color: isDark ? '#D1D5DB' : '#1F2937', marginBottom: 12, lineHeight: 24, fontWeight: '400' },

    imageContainer: { width: '100%', aspectRatio: 16 / 9, borderRadius: 24, overflow: 'hidden', marginBottom: 16, backgroundColor: isDark ? '#374151' : '#F3F4F6', borderWidth: 1, borderColor: isDark ? '#374151' : '#F3F4F6' },
    postImage: { width: '100%', height: '100%' },

    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 },
    actions: { flexDirection: 'row', gap: 24 },
    actionButton: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionText: { fontSize: 14, color: isDark ? '#9CA3AF' : '#4B5563', fontWeight: '600' },

    // Commercial Product Styles
    commercialContainer: {
        borderRadius: 12,
        marginBottom: 16,
        overflow: 'hidden',
        borderWidth: 1,
        flexDirection: 'row',
    },
    commercialContainerLight: {
        backgroundColor: '#F9FAFB',
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
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
});
