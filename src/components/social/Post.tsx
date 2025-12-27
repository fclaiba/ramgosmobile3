import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { Heart, MessageCircle, Share2, MoreHorizontal, Bookmark } from 'lucide-react-native';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { PostCommentsModal } from './PostCommentsModal';
import { SharePostModal } from './SharePostModal';

import { Post as PostType, useSocial } from '../../contexts/SocialContext';

export const Post = ({ post, onUserClick }: { post: PostType, onUserClick: (id: string) => void }) => {
    const { isPostSaved, savePost, unsavePost } = useSocial();
    const [liked, setLiked] = useState(post.likedByUser || false);
    const [likes, setLikes] = useState(post.likes);
    const [showComments, setShowComments] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const saved = isPostSaved(post.id);

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
                    <Avatar style={{ width: 44, height: 44, borderWidth: 2, borderColor: '#F3F4F6' }}>
                        <AvatarImage src={post.user.avatar} />
                        <AvatarFallback>{post.user.name[0]}</AvatarFallback>
                    </Avatar>
                    <View style={{ marginLeft: 12 }}>
                        <Text style={styles.userName}>{post.user.name}</Text>
                        <Text style={styles.timestamp}>{post.timestamp}</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.moreBtn}>
                    <MoreHorizontal size={20} color="#6B7280" />
                </TouchableOpacity>
            </View>

            <Text style={styles.content}>{post.content}</Text>

            {post.images && post.images.length > 0 && (
                <View style={styles.imageContainer}>
                    <ImageWithFallback src={post.images[0]} style={styles.postImage} />
                </View>
            )}

            <View style={styles.footer}>
                <View style={styles.actions}>
                    <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
                        <Heart size={24} color={liked ? "#EF4444" : "#4B5563"} fill={liked ? "#EF4444" : "none"} />
                        <Text style={[styles.actionText, liked && { color: "#EF4444" }]}>{likes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={() => setShowComments(true)}>
                        <MessageCircle size={24} color="#4B5563" />
                        <Text style={styles.actionText}>{post.comments.length}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={() => setShowShare(true)}>
                        <Share2 size={24} color="#4B5563" />
                    </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={handleSave}>
                    <Bookmark size={24} color={saved ? "#000" : "#4B5563"} fill={saved ? "#000" : "none"} />
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

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#fff',
        marginBottom: 8,
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    userInfo: { flexDirection: 'row', alignItems: 'center' },
    userName: { fontWeight: '700', fontSize: 16, color: '#111827', letterSpacing: -0.3 },
    timestamp: { color: '#9CA3AF', fontSize: 13, marginTop: 2, fontWeight: '500' },
    moreBtn: { padding: 8, marginRight: -8 },

    content: { fontSize: 16, color: '#1F2937', marginBottom: 12, lineHeight: 24, fontWeight: '400' },

    imageContainer: { width: '100%', aspectRatio: 16 / 9, borderRadius: 24, overflow: 'hidden', marginBottom: 16, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#F3F4F6' },
    postImage: { width: '100%', height: '100%' },

    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 },
    actions: { flexDirection: 'row', gap: 24 },
    actionButton: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionText: { fontSize: 14, color: '#4B5563', fontWeight: '600' }
});
