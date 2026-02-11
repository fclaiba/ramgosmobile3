import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { X, Send, Heart, Trash2 } from 'lucide-react-native';
import { useSocial, Post, Comment } from '../../contexts/SocialContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';

interface PostCommentsModalProps {
    postId: string;
    visible: boolean;
    onClose: () => void;
    isInstagram?: boolean;
}

export const PostCommentsModal = ({ postId, visible, onClose, isInstagram = false }: PostCommentsModalProps) => {
    const { posts, instagramPosts, addComment, currentUser, deleteComment } = useSocial();
    const [commentText, setCommentText] = useState('');

    const { theme, colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const post = isInstagram
        ? instagramPosts.find(p => p.id === postId)
        : posts.find(p => p.id === postId);

    if (!post) return null;

    const handleSendComment = () => {
        if (!commentText.trim()) return;
        addComment(postId, commentText, isInstagram);
        setCommentText('');
    };

    const renderComment = ({ item }: { item: Comment }) => (
        <View style={styles.commentItem}>
            <Avatar style={styles.commentAvatar}>
                <AvatarImage src={item.user.avatar} />
                <AvatarFallback>{item.user.name[0]}</AvatarFallback>
            </Avatar>
            <View style={styles.commentContent}>
                <View style={styles.commentHeader}>
                    <Text style={styles.commentUser}>{item.user.name}</Text>
                    <Text style={styles.commentTime}>
                        {new Date(item.timestamp).toLocaleDateString()}
                    </Text>
                </View>
                <Text style={styles.commentText}>{item.content}</Text>
            </View>
            {/* Delete option for own comments */}
            {item.userId === currentUser.id && (
                <TouchableOpacity onPress={() => deleteComment(postId, item.id, isInstagram)}>
                    <Trash2 size={16} color={isDark ? "#9CA3AF" : "#9CA3AF"} />
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <Sheet open={visible} onOpenChange={(val: boolean) => !val && onClose()}>
            <SheetContent side="bottom" style={styles.sheetContent}>
                <SheetHeader style={styles.header}>
                    <SheetTitle style={styles.headerTitle}>Comentarios</SheetTitle>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color={isDark ? "#F9FAFB" : "#111"} />
                    </TouchableOpacity>
                </SheetHeader>

                <FlatList
                    data={post.comments}
                    renderItem={renderComment}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>Sé el primero en comentar 👇</Text>
                        </View>
                    }
                />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                >
                    <View style={styles.inputContainer}>
                        <Avatar style={styles.inputAvatar}>
                            <AvatarImage src={currentUser.avatar} />
                            <AvatarFallback>{currentUser.name[0]}</AvatarFallback>
                        </Avatar>
                        <TextInput
                            style={styles.input}
                            placeholder="Agrega un comentario..."
                            placeholderTextColor="#9CA3AF"
                            value={commentText}
                            onChangeText={setCommentText}
                            multiline
                        />
                        <TouchableOpacity
                            style={[styles.sendBtn, !commentText.trim() && styles.sendBtnDisabled]}
                            onPress={handleSendComment}
                            disabled={!commentText.trim()}
                        >
                            <Send size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    sheetContent: {
        backgroundColor: isDark ? '#111827' : '#fff',
        height: '85%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F3F4F6' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111' },
    closeBtn: { padding: 4 },
    listContent: { padding: 16 },
    commentItem: { flexDirection: 'row', marginBottom: 16 },
    commentAvatar: { width: 36, height: 36, marginRight: 12 },
    commentContent: { flex: 1, backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderRadius: 12, padding: 10, marginRight: 8 },
    commentHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    commentUser: { fontWeight: '600', fontSize: 13, color: isDark ? '#F9FAFB' : '#111' },
    commentTime: { fontSize: 11, color: '#9CA3AF' },
    commentText: { fontSize: 14, color: isDark ? '#D1D5DB' : '#374151' },
    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyText: { color: '#9CA3AF', fontSize: 15 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: Platform.OS === 'ios' ? 24 : 12, borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#F3F4F6', backgroundColor: isDark ? '#1F2937' : '#fff' },
    inputAvatar: { width: 32, height: 32, marginRight: 10 },
    input: { flex: 1, backgroundColor: isDark ? '#374151' : '#F3F4F6', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, maxHeight: 100, fontSize: 15, color: isDark ? '#F9FAFB' : '#111' },
    sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? '#4F46E5' : '#000', alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
    sendBtnDisabled: { backgroundColor: isDark ? '#374151' : '#E5E7EB' },
});
