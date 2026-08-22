import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius } from '../../theme/tokens';
import { LIMITS } from '../../utils/inputLimits';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { Sheet, SheetContent, SheetDragArea } from '../ui/sheet';
import { QuotedPostCard, QuotedPost } from './QuotedPostCard';

/**
 * Composer de cita: tu texto + el post original embebido.
 *
 * No reusa `InlineComposer` a propósito: ese está construido como encabezado
 * colapsable de la lista del feed (`isExpanded`/`resetAndClose`), deriva el
 * `type` de la media adjunta y no acepta `quotedPostId` por ningún lado.
 *
 * No necesita nada nuevo en el backend: `createPost` ya acepta
 * `quotedPostId` y ya dispara la actividad de tipo `quote`.
 */
export const QuoteComposerModal = ({
    visible,
    onClose,
    quoted,
    onPosted,
}: {
    visible: boolean;
    onClose: () => void;
    quoted: QuotedPost | null;
    onPosted?: () => void;
}) => {
    const { user: authUser, sessionToken } = useAuth();
    const { show } = useToast();
    const isDark = useTheme().colorScheme === 'dark';
    const c = colors(isDark);
    const styles = getStyles(isDark);

    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const createPost = useMutation(api.social.createPost);

    useEffect(() => {
        if (!visible) {
            setText('');
            setSending(false);
        }
    }, [visible]);

    const overLimit = text.length > LIMITS.socialPost;
    const canPost = text.trim().length > 0 && !overLimit && !sending && Boolean(quoted);
    const counterColor = overLimit
        ? '#EF4444'
        : text.length > LIMITS.socialPost - 30
          ? '#F59E0B'
          : c.textMuted;

    const handlePost = async () => {
        if (!canPost || !sessionToken || !quoted) return;
        setSending(true);
        try {
            await createPost({
                sessionToken,
                type: 'text',
                content: text.trim(),
                quotedPostId: quoted._id as any,
            });
            onClose();
            onPosted?.();
        } catch (e: any) {
            show(e?.message || 'No se pudo publicar', 'error');
        } finally {
            setSending(false);
        }
    };

    return (
        <Sheet open={visible} onOpenChange={(o: boolean) => !o && onClose()}>
            <SheetContent side="bottom" style={styles.sheet}>
                <SheetDragArea style={styles.header}>
                    <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button">
                        <Text style={styles.cancel}>Cancelar</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Citar</Text>
                    <TouchableOpacity
                        style={[styles.publishBtn, !canPost && styles.publishBtnDisabled]}
                        onPress={handlePost}
                        disabled={!canPost}
                        accessibilityRole="button"
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <Text style={styles.publishText}>Publicar</Text>
                        )}
                    </TouchableOpacity>
                </SheetDragArea>

                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <ScrollView
                        style={styles.flex}
                        contentContainerStyle={styles.body}
                        keyboardShouldPersistTaps="handled"
                    >
                        <View style={styles.composerRow}>
                            <Avatar size="md" style={styles.avatar}>
                                {authUser?.avatar ? <AvatarImage src={authUser.avatar} /> : null}
                                <AvatarFallback size="md">
                                    {(authUser?.name || authUser?.nickname || 'U')[0]?.toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <TextInput
                                style={styles.input}
                                placeholder="Agregá un comentario..."
                                placeholderTextColor={c.textMuted}
                                value={text}
                                onChangeText={setText}
                                multiline
                                autoFocus
                            />
                        </View>

                        {/* Preview no interactiva: sin `onPress`, es lo que vas
                            a citar, no un link para irte a otro lado. */}
                        <QuotedPostCard quoted={quoted} />

                        <Text style={[styles.counter, { color: counterColor }]}>
                            {text.length}/{LIMITS.socialPost}
                        </Text>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        sheet: { height: '70%' },
        flex: { flex: 1 },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.divider,
        },
        cancel: { fontSize: 15, fontWeight: '600', color: c.textMuted },
        title: { fontSize: 16, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
        publishBtn: {
            backgroundColor: c.primary,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: Radius.full,
            minWidth: 84,
            alignItems: 'center',
        },
        publishBtnDisabled: { opacity: 0.45 },
        publishText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
        body: { padding: 16, paddingBottom: 40 },
        composerRow: { flexDirection: 'row', marginBottom: 12 },
        avatar: { marginRight: 12 },
        input: {
            flex: 1,
            minHeight: 80,
            maxHeight: 200,
            fontSize: 16,
            lineHeight: 22,
            color: c.text,
            paddingTop: 6,
        },
        counter: { fontSize: 12, fontWeight: '600', textAlign: 'right' },
    });
};
