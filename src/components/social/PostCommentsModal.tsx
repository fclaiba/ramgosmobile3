import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { X, Send, Trash2 } from 'lucide-react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { Radius, colors } from '../../theme/tokens';


interface PostCommentsModalProps {
    postId: string;
    visible: boolean;
    onClose: () => void;
    isInstagram?: boolean;
}

export const PostCommentsModal = ({ postId, visible, onClose }: PostCommentsModalProps) => {
    const { user: authUser, sessionToken } = useAuth();
    const { show } = useToast();
    const [commentText, setCommentText] = useState('');
    const [sending, setSending] = useState(false);

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const commentsResult = useQuery(
        api.social.getCommentsForPost,
        authUser && sessionToken
            ? { postId: postId as any, limit: 100, sessionToken }
            : 'skip',
    );
    const addCommentMut = useMutation(api.social.addComment);
    const deleteCommentMut = useMutation(api.social.deleteComment);

    const comments = commentsResult?.items ?? [];
    const myId = authUser?.id ? String(authUser.id) : '';

    const handleSendComment = async () => {
        if (!commentText.trim()) return;
        if (!sessionToken) {
            show('Iniciá sesión para comentar', 'warning');
            return;
        }
        setSending(true);
        try {
            await addCommentMut({
                sessionToken,
                postId: postId as any,
                content: commentText.trim(),
            });
            setCommentText('');
        } catch (e: any) {
            show(e?.message || 'No se pudo comentar', 'error');
        } finally {
            setSending(false);
        }
    };

    const handleDelete = (commentId: string) => {
        if (!authUser || !sessionToken) return;
        deleteCommentMut({
            commentId: commentId as any,
            sessionToken,
        }).catch((err) => console.warn('[comments] delete failed', err));
    };

    const renderComment = ({ item }: { item: any }) => {
        const author = item.author;
        const authorName = author?.displayName ?? 'Usuario';
        const authorAvatar = author?.avatar;
        return (
            <View style={styles.commentItem}>
                <Avatar style={styles.commentAvatar}>
                    {authorAvatar ? <AvatarImage src={authorAvatar} /> : null}
                    <AvatarFallback>{(authorName || 'U')[0]}</AvatarFallback>
                </Avatar>
                <View style={styles.commentContent}>
                    <View style={styles.commentHeader}>
                        <Text style={styles.commentUser}>{authorName}</Text>
                        <Text style={styles.commentTime}>
                            {new Date(item.createdAt).toLocaleDateString()}
                        </Text>
                    </View>
                    <Text style={styles.commentText}>{item.content}</Text>
                </View>
                {myId && item.authorUserId === myId && (
                    <TouchableOpacity onPress={() => handleDelete(item._id)}>
                        <Trash2 size={16} color={isDark ? "#9CA3AF" : "#9CA3AF"} />
                    </TouchableOpacity>
                )}
            </View>
        );
    };

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
                    data={comments}
                    renderItem={renderComment}
                    keyExtractor={item => item._id}
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
                            {authUser?.avatar ? <AvatarImage src={authUser.avatar} /> : null}
                            <AvatarFallback>
                                {(authUser?.name || authUser?.nickname || 'U')[0]}
                            </AvatarFallback>
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
                            style={[styles.sendBtn, (!commentText.trim() || sending) && styles.sendBtnDisabled]}
                            onPress={handleSendComment}
                            disabled={sending || !commentText.trim()}
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
        backgroundColor: colors(isDark).glass,
        height: '85%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111' },
    closeBtn: { padding: 4 },
    listContent: { padding: 16 },
    commentItem: { flexDirection: 'row', marginBottom: 16 },
    commentAvatar: { width: 36, height: 36, marginRight: 12 },
    commentContent: { flex: 1, backgroundColor: colors(isDark).glass, borderRadius: Radius.md, padding: 10, marginRight: 8 },
    commentHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    commentUser: { fontWeight: '600', fontSize: 13, color: isDark ? '#F9FAFB' : '#111' },
    commentTime: { fontSize: 11, color: '#9CA3AF' },
    commentText: { fontSize: 14, color: isDark ? '#D1D5DB' : '#374151' },
    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyText: { color: '#9CA3AF', fontSize: 15 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: Platform.OS === 'ios' ? 24 : 12, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', backgroundColor: colors(isDark).glass },
    inputAvatar: { width: 32, height: 32, marginRight: 10 },
    input: { flex: 1, backgroundColor: colors(isDark).glass, borderRadius: Radius.xl, paddingHorizontal: 16, paddingVertical: 8, maxHeight: 100, fontSize: 15, color: isDark ? '#F9FAFB' : '#111' },
    sendBtn: { width: 36, height: 36, borderRadius: Radius.lg, backgroundColor: isDark ? '#4F46E5' : '#000', alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
    sendBtnDisabled: { backgroundColor: colors(isDark).glass },
});
