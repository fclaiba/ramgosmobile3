import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Flag, EyeOff, VolumeX, Pin, Trash2 } from 'lucide-react-native';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent } from '../ui/sheet';
import { Radius, colors } from '../../theme/tokens';
import { ReportModal, ReportTargetType } from './ReportModal';

interface PostActionsSheetProps {
    visible: boolean;
    onClose: () => void;
    postId: string;
    authorUserId: string;
    /** true si el viewer es owner/admin de la comunidad a la que pertenece
     *  este post (B4, moderación de mods) — lo calcula el caller, que es
     *  quien sabe si el post está scopeado a una comunidad y con qué rol.
     *  El global admin/developer y el propio autor ya pueden borrar sin
     *  esto (`deletePost` los autoriza igual). */
    canModerate?: boolean;
    /** Comunidad a la que pertenece este post — necesario para "Fijar en la
     *  comunidad" (B4). Ausente si el post no está scopeado a ninguna. */
    communityId?: string;
}

/**
 * Menú "⋯" de un post: Reportar / No me interesa / Silenciar al autor.
 * Antes de la Fase 2 esto no existía — no había ninguna forma de reportar
 * contenido ni de dejar de ver a alguien sin bloquearlo del todo.
 */
export const PostActionsSheet = ({ visible, onClose, postId, authorUserId, canModerate, communityId }: PostActionsSheetProps) => {
    const { sessionToken, user } = useAuth();
    const { show } = useToast();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [reportOpen, setReportOpen] = useState(false);

    const hidePost = useMutation(api.social.moderation.hidePost);
    const muteUser = useMutation(api.social.moderation.muteUser);
    const pinPost = useMutation(api.social.pinPost);
    const deletePost = useMutation(api.social.deletePost);
    const pinCommunityPost = useMutation(api.social.communities.pinCommunityPost);

    const handlePinToCommunity = async () => {
        if (!sessionToken || !communityId) return;
        try {
            await pinCommunityPost({ sessionToken, communityId: communityId as any, postId: postId as any });
            show('Post fijado en la comunidad', 'success');
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo fijar', 'error');
        } finally {
            onClose();
        }
    };

    const isOwnPost = user?.id === authorUserId;
    // `AuthUserRole` (cliente) no incluye 'developer' — sólo el backend lo
    // conoce. `deletePost` ya autoriza a los dos igual; acá sólo decide si
    // MOSTRAR el botón, así que 'admin' alcanza para el caso común.
    const isGlobalAdmin = user?.role === 'admin';
    const canDelete = isOwnPost || isGlobalAdmin || canModerate;

    const handleDelete = async () => {
        if (!sessionToken) return;
        try {
            await deletePost({ sessionToken, postId: postId as any });
            show('Post eliminado', 'success');
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo eliminar', 'error');
        } finally {
            onClose();
        }
    };

    const handlePin = async () => {
        if (!sessionToken) return;
        try {
            await pinPost({ sessionToken, postId: postId as any });
            show('Post fijado en tu perfil', 'success');
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo fijar', 'error');
        } finally {
            onClose();
        }
    };

    const handleHide = async () => {
        if (!sessionToken) return;
        try {
            await hidePost({ sessionToken, postId: postId as any, reason: 'not_interested' });
            show('Vas a ver menos contenido como este', 'success');
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo ocultar el post', 'error');
        } finally {
            onClose();
        }
    };

    const handleMute = async () => {
        if (!sessionToken) return;
        try {
            await muteUser({ sessionToken, targetUserId: authorUserId, scope: 'all' });
            show('Silenciaste a este usuario', 'success');
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo silenciar', 'error');
        } finally {
            onClose();
        }
    };

    return (
        <>
            <Sheet open={visible} onOpenChange={(o: boolean) => !o && onClose()}>
                <SheetContent side="bottom">
                    <View style={styles.container}>
                        {isOwnPost ? (
                            <TouchableOpacity style={styles.row} onPress={handlePin}>
                                <Pin size={20} color={isDark ? '#fff' : '#111827'} />
                                <Text style={styles.rowText}>Fijar en mi perfil</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.row} onPress={handleHide}>
                                <EyeOff size={20} color={isDark ? '#fff' : '#111827'} />
                                <Text style={styles.rowText}>No me interesa</Text>
                            </TouchableOpacity>
                        )}

                        {!isOwnPost && (
                            <TouchableOpacity style={styles.row} onPress={handleMute}>
                                <VolumeX size={20} color={isDark ? '#fff' : '#111827'} />
                                <Text style={styles.rowText}>Silenciar a este usuario</Text>
                            </TouchableOpacity>
                        )}

                        {canModerate && communityId && (
                            <TouchableOpacity style={styles.row} onPress={handlePinToCommunity}>
                                <Pin size={20} color={isDark ? '#fff' : '#111827'} />
                                <Text style={styles.rowText}>Fijar en la comunidad</Text>
                            </TouchableOpacity>
                        )}

                        {!isOwnPost && (
                            <TouchableOpacity
                                style={styles.row}
                                onPress={() => {
                                    onClose();
                                    setReportOpen(true);
                                }}
                            >
                                <Flag size={20} color="#EF4444" />
                                <Text style={[styles.rowText, { color: '#EF4444' }]}>Reportar</Text>
                            </TouchableOpacity>
                        )}

                        {canDelete && (
                            <TouchableOpacity style={styles.row} onPress={handleDelete}>
                                <Trash2 size={20} color="#EF4444" />
                                <Text style={[styles.rowText, { color: '#EF4444' }]}>Eliminar</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </SheetContent>
            </Sheet>

            <ReportModal
                visible={reportOpen}
                onClose={() => setReportOpen(false)}
                targetType={'post' as ReportTargetType}
                targetId={postId}
                targetUserId={authorUserId}
            />
        </>
    );
};

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: { paddingVertical: 8 },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 14,
            paddingHorizontal: 20,
            borderRadius: Radius.md,
        },
        rowText: {
            fontSize: 16,
            fontWeight: '500',
            color: isDark ? '#fff' : '#111827',
        },
    });
