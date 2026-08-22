import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { Trash2, Heart, X, Undo2 } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent, SheetDragArea } from '../ui/sheet';
import { colors, Elevation } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/formatters';
import { usePostComments } from '../../hooks/usePostComments';

/**
 * Ventana para deshacer un borrado, al estilo de Instagram.
 *
 * El borrado NO se manda al servidor hasta que vence: por eso "Deshacer" no
 * necesita una mutation de restauración (que no existe — `deleteComment` sólo
 * sabe marcar `deletedAt`).
 */
const UNDO_WINDOW_MS = 5000;

interface PostCommentsModalProps {
    postId: string;
    visible: boolean;
    onClose: () => void;
    isInstagram?: boolean;
}

/**
 * A quién se está respondiendo.
 *
 * `targetId` es el comentario tocado y `rootId` el hilo al que pertenece.
 * Se distinguen porque `addComment` aplana: responder a una respuesta cuelga
 * del mismo padre (un solo nivel, estilo IG), así que para expandir el hilo
 * correcto después de enviar hace falta el root, no el target.
 */
type ReplyTarget = {
    targetId: string;
    rootId: string;
    authorName: string;
    /** `@usuario` para prefijar el input cuando se responde dentro del hilo. */
    mention?: string | null;
};

type Styles = ReturnType<typeof getStyles>;

/**
 * Fila de un comentario o de una respuesta. Es su propio componente (no una
 * función `renderComment` inline) porque necesita estado propio para el like
 * optimista, que no puede vivir en un `useState` compartido por toda la lista.
 */
const CommentRow = ({
    item,
    isReply = false,
    myId,
    sessionToken,
    isDark,
    styles,
    expanded,
    onToggleExpand,
    onDelete,
    onReply,
}: {
    item: any;
    isReply?: boolean;
    myId: string;
    sessionToken: string | null | undefined;
    isDark: boolean;
    styles: Styles;
    expanded?: boolean;
    onToggleExpand?: () => void;
    onDelete: (commentId: string) => void;
    onReply: (target: ReplyTarget) => void;
}) => {
    const [liked, setLiked] = useState(Boolean(item.hasLiked));
    const [likeCount, setLikeCount] = useState(item.likeCount ?? 0);
    const toggleLikeMut = useMutation(api.social.toggleLike);

    // El servidor manda: cuando la query reemite (like propio confirmado o de
    // otro usuario), el estado optimista se realinea.
    useEffect(() => {
        setLiked(Boolean(item.hasLiked));
        setLikeCount(item.likeCount ?? 0);
    }, [item.hasLiked, item.likeCount]);

    const author = item.author;
    const authorName = author?.displayName ?? author?.username ?? 'Usuario';
    const authorAvatar = author?.avatar;
    const isMine = Boolean(myId) && item.authorUserId === myId;
    const replyCount = item.replyCount ?? 0;

    const handleLike = () => {
        if (!sessionToken) return;
        const wasLiked = liked;
        setLiked(!wasLiked);
        setLikeCount((c: number) => Math.max(0, wasLiked ? c - 1 : c + 1));
        toggleLikeMut({
            sessionToken,
            targetType: 'comment',
            targetId: String(item._id),
        }).catch(() => {
            setLiked(wasLiked);
            setLikeCount((c: number) => Math.max(0, wasLiked ? c + 1 : c - 1));
        });
    };

    const handleReplyPress = () => {
        onReply({
            targetId: String(item._id),
            // Responder a una respuesta cuelga del mismo hilo, no crea uno nuevo.
            rootId: String(isReply ? item.parentCommentId : item._id),
            authorName,
            mention: author?.username ?? null,
        });
    };

    return (
        <View style={isReply ? styles.replyWrapper : styles.commentWrapper}>
            <View style={[styles.row, isReply && styles.replyRow]}>
                <Avatar size={isReply ? 'sm' : 'md'} style={styles.rowAvatar}>
                    {authorAvatar ? <AvatarImage src={authorAvatar} /> : null}
                    <AvatarFallback size={isReply ? 'sm' : 'md'}>
                        {(authorName || 'U')[0]?.toUpperCase()}
                    </AvatarFallback>
                </Avatar>

                <View style={styles.body}>
                    <View style={styles.bodyHeader}>
                        <Text style={styles.authorName} numberOfLines={1}>
                            {authorName}
                            <Text style={styles.timestamp}>{'  '}{formatRelativeTime(item.createdAt)}</Text>
                        </Text>
                        {isMine && (
                            <TouchableOpacity
                                onPress={() => onDelete(String(item._id))}
                                style={styles.deleteBtn}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel="Eliminar comentario"
                            >
                                <Trash2 size={14} color={colors(isDark).textSubtle} />
                            </TouchableOpacity>
                        )}
                    </View>

                    <Text style={styles.commentText}>{item.content}</Text>

                    <View style={styles.actions}>
                        <TouchableOpacity
                            onPress={handleReplyPress}
                            style={styles.actionBtn}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={`Responder a ${authorName}`}
                        >
                            <Text style={styles.actionText}>Responder</Text>
                        </TouchableOpacity>

                        {!isReply && replyCount > 0 && onToggleExpand && (
                            <TouchableOpacity
                                onPress={onToggleExpand}
                                style={styles.actionBtn}
                                hitSlop={6}
                                accessibilityRole="button"
                            >
                                <View style={styles.threadLine} />
                                <Text style={styles.actionTextStrong}>
                                    {expanded ? 'Ocultar respuestas' : `Ver ${replyCount} respuesta${replyCount === 1 ? '' : 's'}`}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                <TouchableOpacity
                    style={styles.likeBtn}
                    onPress={handleLike}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={liked ? 'Quitar me gusta' : 'Me gusta'}
                >
                    <Heart
                        size={15}
                        color={liked ? '#EF4444' : colors(isDark).textSubtle}
                        fill={liked ? '#EF4444' : 'transparent'}
                    />
                    {likeCount > 0 && (
                        <Text style={[styles.likeCount, liked && styles.likeCountActive]}>{likeCount}</Text>
                    )}
                </TouchableOpacity>
            </View>

            {!isReply && expanded && (
                <CommentReplies
                    commentId={String(item._id)}
                    sessionToken={sessionToken}
                    myId={myId}
                    isDark={isDark}
                    styles={styles}
                    onDelete={onDelete}
                    onReply={onReply}
                />
            )}
        </View>
    );
};

/** Respuestas de un comentario, cargadas al expandir — un hilo de 200
 *  respuestas no debe inflar la carga inicial del modal. */
const CommentReplies = ({
    commentId,
    sessionToken,
    myId,
    isDark,
    styles,
    onDelete,
    onReply,
}: {
    commentId: string;
    sessionToken: string | null | undefined;
    myId: string;
    isDark: boolean;
    styles: Styles;
    onDelete: (commentId: string) => void;
    onReply: (target: ReplyTarget) => void;
}) => {
    const replies = useQuery(
        api.social.getCommentReplies,
        sessionToken ? { commentId: commentId as any, sessionToken } : 'skip',
    );

    if (replies === undefined) {
        return (
            <View style={styles.repliesLoading}>
                <ActivityIndicator size="small" color={colors(isDark).textSubtle} />
            </View>
        );
    }

    return (
        <>
            {replies.map((reply: any) => (
                <CommentRow
                    key={reply._id}
                    item={reply}
                    isReply
                    myId={myId}
                    sessionToken={sessionToken}
                    isDark={isDark}
                    styles={styles}
                    onDelete={onDelete}
                    onReply={onReply}
                />
            ))}
        </>
    );
};

export const PostCommentsModal = ({ postId, visible, onClose }: PostCommentsModalProps) => {
    const { user: authUser, sessionToken } = useAuth();
    const { show } = useToast();
    const [commentText, setCommentText] = useState('');
    const [sending, setSending] = useState(false);
    const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const inputRef = useRef<TextInput>(null);
    const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingIdRef = useRef<string | null>(null);

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    // Cerrado no consulta nada: el modal vive montado dentro de cada card.
    const { comments, isLoading, hasMore, loadMore, markDeleted, unmarkDeleted } =
        usePostComments(visible ? postId : undefined);

    const addCommentMut = useMutation(api.social.addComment);
    const deleteCommentMut = useMutation(api.social.deleteComment);

    const myId = authUser?.id ? String(authUser.id) : '';

    const commitDelete = useCallback(
        (id: string) => {
            if (!sessionToken) return;
            deleteCommentMut({ commentId: id as any, sessionToken }).catch((e: any) => {
                unmarkDeleted(id);
                show(e?.message || 'No se pudo eliminar', 'error');
            });
        },
        [sessionToken, deleteCommentMut, unmarkDeleted, show],
    );

    /** Cierra la ventana de deshacer y manda el borrado ya mismo. */
    const flushPendingDelete = useCallback(() => {
        if (undoTimer.current) {
            clearTimeout(undoTimer.current);
            undoTimer.current = null;
        }
        const id = pendingIdRef.current;
        pendingIdRef.current = null;
        setPendingDelete(null);
        if (id) commitDelete(id);
    }, [commitDelete]);

    // Al cerrar se limpia el borrador y el hilo abierto — reabrir no debe
    // heredar "respondiendo a" de la sesión anterior. Un borrado a medio
    // deshacer se confirma: cerrar no puede dejarlo en el limbo.
    useEffect(() => {
        if (!visible) {
            flushPendingDelete();
            setReplyingTo(null);
            setCommentText('');
            setExpandedIds(new Set());
        }
    }, [visible, flushPendingDelete]);

    // Desmontar con un borrado pendiente también lo confirma. Va contra un ref
    // y con deps vacías a propósito: si dependiera de `commitDelete`, un
    // cambio de sesión dispararía el cleanup en pleno período de deshacer y
    // confirmaría el borrado antes de tiempo.
    const commitRef = useRef(commitDelete);
    useEffect(() => {
        commitRef.current = commitDelete;
    }, [commitDelete]);

    useEffect(() => () => {
        if (undoTimer.current) {
            clearTimeout(undoTimer.current);
            undoTimer.current = null;
        }
        const id = pendingIdRef.current;
        pendingIdRef.current = null;
        if (id) commitRef.current(id);
    }, []);

    const toggleExpanded = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleReply = (target: ReplyTarget) => {
        setReplyingTo(target);
        // Dentro de un hilo la respuesta se aplana al mismo nivel, así que sin
        // la mención se pierde a quién le estabas contestando (igual que IG).
        if (target.targetId !== target.rootId && target.mention) {
            setCommentText((prev) => (prev.trim() ? prev : `@${target.mention} `));
        }
        inputRef.current?.focus();
    };

    const handleSendComment = async () => {
        const content = commentText.trim();
        if (!content) return;
        if (!sessionToken) {
            show('Iniciá sesión para comentar', 'warning');
            return;
        }
        setSending(true);
        try {
            await addCommentMut({
                sessionToken,
                postId: postId as any,
                content,
                parentCommentId: (replyingTo?.targetId as any) ?? undefined,
            });
            setCommentText('');
            // Que la respuesta recién enviada se vea: si el hilo estaba
            // plegado, el usuario sólo vería subir un contador.
            if (replyingTo) {
                const rootId = replyingTo.rootId;
                setExpandedIds((prev) => new Set(prev).add(rootId));
            }
            setReplyingTo(null);
        } catch (e: any) {
            show(e?.message || 'No se pudo comentar', 'error');
        } finally {
            setSending(false);
        }
    };

    /**
     * Borrado estilo Instagram: desaparece al instante y queda una barra de
     * "Deshacer" unos segundos. Antes abría un diálogo de confirmación global
     * (`ConfirmProvider`), que en web se monta en un portal creado al arrancar
     * la app: como `ModalPortal` no fija z-index, el sheet de comentarios
     * —cuyo portal se crea después— siempre lo tapaba, y encima el diálogo
     * invisible se quedaba con el foco y la lista se sentía trabada.
     */
    const handleDelete = (commentId: string) => {
        if (!authUser || !sessionToken) return;
        // Una sola barra a la vez: si ya había un borrado esperando, se confirma.
        flushPendingDelete();
        markDeleted(commentId);
        pendingIdRef.current = commentId;
        setPendingDelete(commentId);
        undoTimer.current = setTimeout(() => {
            undoTimer.current = null;
            const id = pendingIdRef.current;
            pendingIdRef.current = null;
            setPendingDelete(null);
            if (id) commitDelete(id);
        }, UNDO_WINDOW_MS);
    };

    const handleUndoDelete = () => {
        if (undoTimer.current) {
            clearTimeout(undoTimer.current);
            undoTimer.current = null;
        }
        const id = pendingIdRef.current;
        pendingIdRef.current = null;
        setPendingDelete(null);
        // Nunca llegó a salir al servidor: alcanza con volver a mostrarlo.
        if (id) unmarkDeleted(id);
    };

    const canSend = commentText.trim().length > 0 && !sending;

    return (
        <Sheet open={visible} onOpenChange={(val: boolean) => !val && onClose()}>
            <SheetContent side="bottom" style={styles.sheetContent}>
                <BlurView
                    intensity={isDark ? 80 : 100}
                    tint={isDark ? 'dark' : 'light'}
                    style={StyleSheet.absoluteFill}
                />

                {/* El encabezado también arrastra, además de la barra que
                    dibuja `SheetContent` — es la zona grande y obvia para
                    agarrar, como en Instagram. */}
                <SheetDragArea style={styles.header}>
                    <Text style={styles.headerTitle}>Comentarios</Text>
                </SheetDragArea>

                {isLoading ? (
                    <View style={styles.centerFill}>
                        <ActivityIndicator color={colors(isDark).primary} />
                    </View>
                ) : (
                    <FlatList
                        // Sin `flex: 1` la lista se estira con su contenido en
                        // vez de quedar acotada al alto del sheet, y con muchos
                        // comentarios el final queda fuera de alcance.
                        style={styles.list}
                        data={comments}
                        keyExtractor={(item) => String(item._id)}
                        renderItem={({ item }) => (
                            <CommentRow
                                item={item}
                                myId={myId}
                                sessionToken={sessionToken}
                                isDark={isDark}
                                styles={styles}
                                expanded={expandedIds.has(String(item._id))}
                                onToggleExpand={() => toggleExpanded(String(item._id))}
                                onDelete={handleDelete}
                                onReply={handleReply}
                            />
                        )}
                        contentContainerStyle={[
                            styles.listContent,
                            comments.length === 0 && styles.listContentEmpty,
                        ]}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        onEndReached={hasMore ? loadMore : undefined}
                        onEndReachedThreshold={0.4}
                        ListFooterComponent={
                            hasMore ? (
                                <TouchableOpacity onPress={loadMore} style={styles.loadMoreBtn}>
                                    <Text style={styles.loadMoreText}>Ver más comentarios</Text>
                                </TouchableOpacity>
                            ) : null
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <View style={styles.emptyIconCircle}>
                                    <Text style={{ fontSize: 24 }}>💬</Text>
                                </View>
                                <Text style={styles.emptyTitle}>Sin comentarios aún</Text>
                                <Text style={styles.emptyText}>Iniciá la conversación.</Text>
                            </View>
                        }
                    />
                )}

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                >
                    {pendingDelete && (
                        <View style={styles.undoBar}>
                            <Text style={styles.undoText} numberOfLines={1}>
                                Comentario eliminado
                            </Text>
                            <TouchableOpacity
                                onPress={handleUndoDelete}
                                style={styles.undoBtn}
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel="Deshacer eliminación"
                            >
                                <Undo2 size={15} color={colors(isDark).primary} />
                                <Text style={styles.undoAction}>Deshacer</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {replyingTo && (
                        <View style={styles.replyingBanner}>
                            <Text style={styles.replyingText} numberOfLines={1}>
                                Respondiendo a <Text style={styles.replyingName}>{replyingTo.authorName}</Text>
                            </Text>
                            <TouchableOpacity
                                onPress={() => setReplyingTo(null)}
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel="Cancelar respuesta"
                            >
                                <X size={16} color={colors(isDark).textMuted} />
                            </TouchableOpacity>
                        </View>
                    )}

                    <View style={styles.inputOuterContainer}>
                        <View style={styles.inputInnerContainer}>
                            <Avatar size="sm" style={styles.inputAvatar}>
                                {authUser?.avatar ? <AvatarImage src={authUser.avatar} /> : null}
                                <AvatarFallback size="sm">
                                    {(authUser?.name || authUser?.nickname || 'U')[0]?.toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <TextInput
                                ref={inputRef}
                                style={styles.input}
                                placeholder={
                                    replyingTo
                                        ? `Responder a ${replyingTo.authorName}...`
                                        : 'Agrega un comentario...'
                                }
                                placeholderTextColor={colors(isDark).textMuted}
                                value={commentText}
                                onChangeText={setCommentText}
                                multiline
                                maxLength={300}
                            />
                            {sending ? (
                                <View style={styles.sendBtn}>
                                    <ActivityIndicator size="small" color={colors(isDark).primary} />
                                </View>
                            ) : canSend ? (
                                <TouchableOpacity
                                    style={styles.sendBtn}
                                    onPress={handleSendComment}
                                    accessibilityRole="button"
                                    accessibilityLabel="Publicar comentario"
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

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        sheetContent: {
            backgroundColor: 'transparent', // Let BlurView handle the background
            height: '90%',
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.glassBorder,
            paddingBottom: Platform.OS === 'ios' ? 20 : 0,
            overflow: 'hidden', // Ensure BlurView respects border radius
        },
        header: {
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.divider,
        },
        headerTitle: {
            fontSize: 17,
            fontWeight: '800',
            color: c.text,
            letterSpacing: -0.4,
        },
        centerFill: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
        list: { flex: 1 },
        listContent: {
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 32,
        },
        listContentEmpty: {
            flexGrow: 1,
            justifyContent: 'center',
        },

        commentWrapper: { marginBottom: 20 },
        replyWrapper: { marginTop: 14, marginLeft: 52 },
        row: { flexDirection: 'row', alignItems: 'flex-start' },
        replyRow: {},
        rowAvatar: { marginRight: 12 },
        body: { flex: 1, paddingTop: 1 },
        bodyHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
        },
        authorName: {
            flex: 1,
            fontWeight: '700',
            fontSize: 14,
            color: c.text,
        },
        timestamp: {
            fontWeight: '500',
            fontSize: 12,
            color: c.textSubtle,
        },
        deleteBtn: { padding: 4, marginLeft: 8, marginTop: -2 },
        commentText: {
            fontSize: 15,
            lineHeight: 21,
            color: c.textSecondary,
            marginTop: 3,
        },
        actions: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 7,
        },
        actionBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            marginRight: 18,
        },
        actionText: {
            fontSize: 12.5,
            fontWeight: '700',
            color: c.textMuted,
        },
        actionTextStrong: {
            fontSize: 12.5,
            fontWeight: '700',
            color: c.textSecondary,
        },
        // Guiño visual al hilo, como el conector de respuestas de IG.
        threadLine: {
            width: 18,
            height: StyleSheet.hairlineWidth * 2,
            backgroundColor: c.textSubtle,
            marginRight: 8,
            opacity: 0.6,
        },
        likeBtn: {
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 2,
            paddingHorizontal: 4,
            paddingTop: 2,
            marginLeft: 8,
        },
        likeCount: {
            fontSize: 11,
            fontWeight: '700',
            color: c.textSubtle,
        },
        likeCountActive: { color: '#EF4444' },
        repliesLoading: {
            marginLeft: 52,
            marginTop: 12,
            alignItems: 'flex-start',
        },
        loadMoreBtn: {
            paddingVertical: 12,
            alignItems: 'center',
        },
        loadMoreText: {
            fontSize: 13,
            fontWeight: '700',
            color: c.primary,
        },

        emptyState: {
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 40,
        },
        emptyIconCircle: {
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: c.surface2,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
        },
        emptyTitle: {
            fontSize: 18,
            fontWeight: '700',
            color: c.text,
            marginBottom: 8,
        },
        emptyText: {
            color: c.textSubtle,
            fontSize: 15,
            textAlign: 'center',
        },

        undoBar: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingHorizontal: 20,
            paddingVertical: 11,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.divider,
            backgroundColor: c.surface2,
        },
        undoText: {
            flex: 1,
            fontSize: 13.5,
            fontWeight: '600',
            color: c.textSecondary,
        },
        undoBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        undoAction: {
            fontSize: 13.5,
            fontWeight: '800',
            color: c.primary,
        },
        replyingBanner: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingHorizontal: 20,
            paddingVertical: 9,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.divider,
            backgroundColor: c.surface1,
        },
        replyingText: {
            flex: 1,
            fontSize: 13,
            fontWeight: '500',
            color: c.textMuted,
        },
        replyingName: { fontWeight: '800', color: c.textSecondary },
        inputOuterContainer: {
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: Platform.OS === 'ios' ? 24 : 16,
            backgroundColor: 'transparent',
        },
        inputInnerContainer: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            backgroundColor: c.surface1,
            borderRadius: 26,
            paddingHorizontal: 12,
            paddingVertical: 8,
            minHeight: 52,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
            ...Elevation[1](isDark),
        },
        inputAvatar: { marginRight: 10, marginBottom: 2 },
        input: {
            flex: 1,
            maxHeight: 120,
            fontSize: 15,
            color: c.text,
            paddingTop: Platform.OS === 'ios' ? 8 : 6,
            paddingBottom: Platform.OS === 'ios' ? 8 : 6,
        },
        sendBtn: {
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 8,
            marginBottom: 2,
            minWidth: 62,
        },
        sendBtnText: {
            color: c.primary,
            fontWeight: '800',
            fontSize: 15,
        },
    });
};
