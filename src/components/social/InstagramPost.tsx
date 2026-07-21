import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity, Dimensions, Text } from 'react-native';

const { width } = Dimensions.get('window');
// 3 columns, 2px gap
const itemSize = (width - 4) / 3;

import { X, Heart, MessageCircle, Share2 } from 'lucide-react-native';
import { InstagramPost as IGPostType, useSocial } from '../../contexts/SocialContext';
import { PostCommentsModal } from './PostCommentsModal';
import { SharePostModal } from './SharePostModal';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent, SheetHeader } from '../ui/sheet';
import { Radius, colors } from '../../theme/tokens';


export const InstagramPost = ({ post }: { post: IGPostType }) => {
    const [showDetail, setShowDetail] = React.useState(false);
    const [showComments, setShowComments] = React.useState(false);
    const [showShare, setShowShare] = React.useState(false);
    const { likeInstagramPost } = useSocial();
    const [liked, setLiked] = React.useState(post.likedByUser || false);
    const [likes, setLikes] = React.useState(post.likes);

    const { theme, colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const handleLike = () => {
        likeInstagramPost(post._id || post.id);
        setLiked(!liked);
        setLikes((prev: number) => liked ? prev - 1 : prev + 1);
    };

    return (
        <>
            <TouchableOpacity activeOpacity={0.8} style={styles.container} onPress={() => setShowDetail(true)}>
                <Image source={{ uri: post.image }} style={styles.image} />
            </TouchableOpacity>

            {/* Detail Sheet */}
            <Sheet open={showDetail} onOpenChange={setShowDetail}>
                <SheetContent side="bottom" style={styles.sheetContent}>
                    <View style={styles.detailContainer}>
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setShowDetail(false)}>
                            <X size={28} color="#fff" />
                        </TouchableOpacity>

                        <Image source={{ uri: post.image }} style={styles.fullImage} resizeMode="contain" />

                        <View style={styles.footer}>
                            <View style={styles.actions}>
                                <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
                                    <Heart size={28} color={liked ? "#EF4444" : "#fff"} fill={liked ? "#EF4444" : "none"} />
                                    <Text style={styles.actionText}>{likes}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.actionBtn} onPress={() => setShowComments(true)}>
                                    <MessageCircle size={28} color="#fff" />
                                    <Text style={styles.actionText}>{post.commentCount || post.comments?.length || 0}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.actionBtn} onPress={() => setShowShare(true)}>
                                    <Share2 size={28} color="#fff" />
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.caption}>{post.caption}</Text>
                            <Text style={styles.timestamp}>{new Date(post.timestamp).toLocaleDateString()}</Text>
                        </View>
                    </View>
                </SheetContent>
            </Sheet>

            <PostCommentsModal
                postId={post._id || post.id}
                visible={showComments}
                onClose={() => setShowComments(false)}
                isInstagram={true}
            />

            <SharePostModal
                postContent={post.caption || 'Mira esta foto!'}
                visible={showShare}
                onClose={() => setShowShare(false)}
            />
        </>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        width: itemSize,
        height: itemSize,
        backgroundColor: colors(isDark).glass,
        marginBottom: 2
    },
    image: { width: '100%', height: '100%' },

    // Detail View Styles
    sheetContent: {
        backgroundColor: '#000',
        height: '95%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 0 // Remove default padding for full image
    },
    detailContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
    closeBtn: { position: 'absolute', top: 20, right: 20, zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: Radius.xl },
    fullImage: { width: width, height: width * 1.25, backgroundColor: '#000' },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 40, backgroundColor: 'rgba(0,0,0,0.6)' },
    actions: { flexDirection: 'row', gap: 24, marginBottom: 12 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    caption: { color: '#fff', fontSize: 15, marginBottom: 4 },
    timestamp: { color: '#9CA3AF', fontSize: 12 }
});
