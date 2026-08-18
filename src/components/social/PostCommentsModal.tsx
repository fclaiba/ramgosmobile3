import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Trash2, Heart } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent } from '../ui/sheet';
import { Radius, colors, Elevation } from '../../theme/tokens';


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
        authUser && sessionToken && postId
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
        
        // Simple relative time formatting
        const date = new Date(item.createdAt);
        const timeStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        return (
            <View style={styles.commentItem}>
                <Avatar style={styles.commentAvatar}>
                    {authorAvatar ? <AvatarImage src={authorAvatar} /> : null}
                    <AvatarFallback>{(authorName || 'U')[0]}</AvatarFallback>
                </Avatar>
                <View style={styles.commentContent}>
                    <View style={styles.commentHeader}>
                        <Text style={styles.commentUser}>
                            {authorName} <Text style={styles.commentTime}> {timeStr}</Text>
                        </Text>
                        {myId && item.authorUserId === myId && (
                            <TouchableOpacity onPress={() => handleDelete(item._id)} style={styles.deleteBtn}>
                                <Trash2 size={14} color={isDark ? "#ef4444" : "#ef4444"} />
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text style={styles.commentText}>{item.content}</Text>
                    <View style={styles.commentActions}>
                        <TouchableOpacity style={styles.actionBtn}>
                            <Text style={styles.actionText}>Responder</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                <TouchableOpacity style={styles.likeBtn}>
                    <Heart size={14} color={colors(isDark).textMuted} />
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <Sheet open={visible} onOpenChange={(val: boolean) => !val && onClose()}>
            <SheetContent side="bottom" style={styles.sheetContent}>
                <BlurView 
                    intensity={isDark ? 80 : 100} 
                    tint={isDark ? 'dark' : 'light'} 
                    style={StyleSheet.absoluteFill} 
                />
                
                {/* Drag indicator */}
                <View style={styles.dragIndicatorWrapper}>
                    <View style={styles.dragIndicator} />
                </View>

                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Comentarios</Text>
                </View>

                <FlatList
                    data={comments}
                    renderItem={renderComment}
                    keyExtractor={item => item._id}
                    contentContainerStyle={[styles.listContent, comments.length === 0 && { flex: 1, justifyContent: 'center' }]}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIconCircle}>
                                <Text style={{fontSize: 24}}>💬</Text>
                            </View>
                            <Text style={styles.emptyTitle}>Sin comentarios aún</Text>
                            <Text style={styles.emptyText}>Inicia la conversación.</Text>
                        </View>
                    }
                />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                >
                    <View style={styles.inputOuterContainer}>
                        <View style={styles.inputInnerContainer}>
                            <Avatar style={styles.inputAvatar}>
                                {authUser?.avatar ? <AvatarImage src={authUser.avatar} /> : null}
                                <AvatarFallback>
                                    {(authUser?.name || authUser?.nickname || 'U')[0]}
                                </AvatarFallback>
                            </Avatar>
                            <TextInput
                                style={styles.input}
                                placeholder="Agrega un comentario..."
                                placeholderTextColor={colors(isDark).textMuted}
                                value={commentText}
                                onChangeText={setCommentText}
                                multiline
                                maxLength={300}
                            />
                            {commentText.trim().length > 0 ? (
                                <TouchableOpacity
                                    style={styles.sendBtn}
                                    onPress={handleSendComment}
                                    disabled={sending}
                                >
                                    <Text style={styles.sendBtnText}>Publicar</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    sheetContent: {
        backgroundColor: 'transparent', // Let BlurView handle the background
        height: '90%',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors(isDark).glassBorder,
        paddingBottom: Platform.OS === 'ios' ? 20 : 0,
        overflow: 'hidden', // Ensure BlurView respects border radius
    },
    dragIndicatorWrapper: {
        width: '100%',
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 4,
    },
    dragIndicator: {
        width: 36,
        height: 5,
        borderRadius: Radius.full,
        backgroundColor: colors(isDark).textMuted,
        opacity: 0.4,
    },
    header: { 
        alignItems: 'center', 
        justifyContent: 'center', 
        paddingVertical: 14, 
        borderBottomWidth: StyleSheet.hairlineWidth, 
        borderBottomColor: colors(isDark).divider 
    },
    headerTitle: { 
        fontSize: 17, 
        fontWeight: '800', 
        color: colors(isDark).text,
        letterSpacing: -0.4,
    },
    listContent: { 
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 40,
    },
    commentItem: { 
        flexDirection: 'row', 
        marginBottom: 24 
    },
    commentAvatar: { 
        width: 40, 
        height: 40, 
        marginRight: 14,
    },
    commentContent: { 
        flex: 1, 
        justifyContent: 'center'
    },
    commentHeader: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: 4 
    },
    commentUser: { 
        fontWeight: '700', 
        fontSize: 14, 
        color: colors(isDark).text,
    },
    commentTime: { 
        fontWeight: '500',
        fontSize: 13, 
        color: colors(isDark).textMuted,
    },
    deleteBtn: {
        padding: 4,
        marginLeft: 8,
    },
    commentText: { 
        fontSize: 15, 
        lineHeight: 22,
        color: colors(isDark).textSecondary,
        marginBottom: 6,
    },
    commentActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    actionBtn: {
        marginRight: 16,
    },
    actionText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors(isDark).textMuted,
    },
    likeBtn: {
        padding: 4,
        alignSelf: 'center',
        marginLeft: 8,
    },
    emptyState: { 
        alignItems: 'center', 
        justifyContent: 'center',
        paddingVertical: 40 
    },
    emptyIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: colors(isDark).surface2,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors(isDark).text,
        marginBottom: 8,
    },
    emptyText: { 
        color: colors(isDark).textSubtle, 
        fontSize: 15,
        textAlign: 'center'
    },
    inputOuterContainer: { 
        paddingHorizontal: 20, 
        paddingTop: 12, 
        paddingBottom: Platform.OS === 'ios' ? 24 : 16,
        backgroundColor: 'transparent',
    },
    inputInnerContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        backgroundColor: colors(isDark).surface1,
        borderRadius: 26,
        paddingHorizontal: 14,
        paddingVertical: 10,
        minHeight: 52,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors(isDark).glassBorder,
        ...Elevation[1](isDark),
    },
    inputAvatar: { 
        width: 32, 
        height: 32, 
        marginRight: 12,
        marginBottom: 2,
    },
    input: { 
        flex: 1, 
        maxHeight: 120, 
        fontSize: 15, 
        color: colors(isDark).text,
        paddingTop: Platform.OS === 'ios' ? 6 : 4,
        paddingBottom: Platform.OS === 'ios' ? 6 : 4,
    },
    sendBtn: { 
        justifyContent: 'center', 
        alignItems: 'center', 
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 2,
    },
    sendBtnText: {
        color: colors(isDark).primary,
        fontWeight: '700',
        fontSize: 15,
    },
});
