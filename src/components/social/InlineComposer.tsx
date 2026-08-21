import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image, ActivityIndicator, Platform, Modal } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { X, Camera, Tag, ShoppingBag, Plus, Video, Image as ImageIcon, Send, Type } from 'lucide-react-native';
import { CommerceLinker } from './CommerceLinker';
import { Radius, colors } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { LIMITS } from '../../utils/inputLimits';
import { uploadLocalImageToConvex } from '../../utils/uploadToConvexStorage';

const MAX_IMAGES = 10;

interface InlineComposerProps {
    onPostCreated?: () => void;
    /** B1: postear DENTRO de una comunidad — el chip "Publicando en: X" se
     *  muestra cuando viene seteado. El backend ya valida membresía activa
     *  (`createPostImpl`, `social.ts`), acá sólo se manda el id. */
    communityId?: string;
    communityName?: string;
}

export function InlineComposer({ onPostCreated, communityId, communityName }: InlineComposerProps) {
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    const [isExpanded, setIsExpanded] = useState(false);
    const [images, setImages] = useState<string[]>([]);
    /** Texto alternativo por imagen, mismo índice que `images` (accesibilidad
     *  para lectores de pantalla). El campo `imageAlts` ya existía en el
     *  schema y se renderiza en `PostImageCarousel`; esto era lo único que
     *  faltaba: la UI para cargarlo al publicar. */
    const [imageAlts, setImageAlts] = useState<string[]>([]);
    const [editingAltIndex, setEditingAltIndex] = useState<number | null>(null);
    const [videoUri, setVideoUri] = useState<string | null>(null);
    const [caption, setCaption] = useState('');
    const [attachedProduct, setAttachedProduct] = useState<{ listingId: string, name: string, price: number, imageUrl?: string } | null>(null);
    const [isLinkerVisible, setIsLinkerVisible] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const createPost = useMutation(api.social.createPost);
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);
    const registerUpload = useMutation(api.files.registerUpload);

    const hasContent = images.length > 0 || !!videoUri || caption.trim().length > 0 || !!attachedProduct;
    const overLimit = caption.length > LIMITS.socialPost;

    const handlePickImages = async () => {
        const remaining = MAX_IMAGES - images.length;
        if (remaining <= 0) {
            show(`Máximo ${MAX_IMAGES} fotos por post.`, 'warning');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            selectionLimit: remaining,
            quality: 0.7,
        });
        if (result.canceled || result.assets.length === 0) return;

        setVideoUri(null);
        setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, MAX_IMAGES));
        setImageAlts((prev) => [...prev, ...result.assets.map(() => '')].slice(0, MAX_IMAGES));
        setIsExpanded(true);
    };

    const handlePickVideo = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['videos'],
            quality: 0.7,
        });
        if (result.canceled || !result.assets[0]) return;

        setImages([]);
        setVideoUri(result.assets[0].uri);
        setIsExpanded(true);
    };

    const removeImage = (index: number) => {
        setImages((prev) => prev.filter((_, i) => i !== index));
        setImageAlts((prev) => prev.filter((_, i) => i !== index));
        setEditingAltIndex(null);
    };

    const handlePublish = async () => {
        if (!hasContent) return;
        if (overLimit) {
            show(`Límite superado.`, 'error');
            return;
        }

        setIsUploading(true);
        try {
            const uploadedImages = await Promise.all(
                images.map((uri) =>
                    uploadLocalImageToConvex({
                        uri,
                        generateUploadUrl,
                        registerUpload,
                        purpose: 'social_post',
                        sessionToken: sessionToken || '',
                    }),
                ),
            );
            const uploadedVideo = videoUri
                ? await uploadLocalImageToConvex({
                      uri: videoUri,
                      generateUploadUrl,
                      registerUpload,
                      purpose: 'social_post',
                      sessionToken: sessionToken || '',
                  })
                : undefined;

            const commercialProduct = attachedProduct ? {
                listingId: attachedProduct.listingId,
                name: attachedProduct.name,
                price: attachedProduct.price,
                image: attachedProduct.imageUrl,
            } : undefined;

            const listingId = attachedProduct?.listingId;
            const type = attachedProduct
                ? 'commercial'
                : uploadedVideo
                  ? 'video'
                  : uploadedImages.length > 0
                    ? 'image'
                    : 'text';

            await createPost({
                sessionToken: sessionToken || '',
                type,
                content: caption,
                videoUrl: uploadedVideo,
                images: uploadedImages.length > 0 ? uploadedImages : undefined,
                imageAlts:
                    uploadedImages.length > 0 && imageAlts.some((a) => a.trim().length > 0)
                        ? uploadedImages.map((_, i) => imageAlts[i]?.trim() ?? '')
                        : undefined,
                commercialProduct,
                ...(listingId ? { attachedListingId: listingId as any } : {}),
                ...(communityId ? { communityId: communityId as any } : {}),
            });

            show('¡Publicado con éxito!', 'success');
            resetAndClose();
            onPostCreated?.();
        } catch (error: any) {
            console.error("Error al publicar:", error);
            show(error?.data?.message ?? 'Hubo un error al publicar.', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const resetAndClose = () => {
        setImages([]);
        setImageAlts([]);
        setEditingAltIndex(null);
        setVideoUri(null);
        setCaption('');
        setAttachedProduct(null);
        setIsLinkerVisible(false);
        setIsExpanded(false);
    };

    const handleFocus = () => {
        setIsExpanded(true);
    };

    const counterColor = overLimit ? '#EF4444' : caption.length > LIMITS.socialPost - 30 ? '#F59E0B' : c.textMuted;

    return (
        <View style={[styles.container, { backgroundColor: c.glass, borderColor: c.border }]}>
            {communityId && communityName && (
                <View style={styles.communityChip}>
                    <Text style={styles.communityChipText}>Publicando en: {communityName}</Text>
                </View>
            )}
            <TextInput
                style={[styles.input, { color: c.text, minHeight: isExpanded ? 80 : 40 }]}
                placeholder="¿Qué estás pensando?"
                placeholderTextColor={c.textMuted}
                multiline
                onFocus={handleFocus}
                value={caption}
                onChangeText={setCaption}
            />

            {(images.length > 0 || videoUri) && isExpanded && (
                <View style={styles.mediaContainer}>
                    <View style={styles.mediaScrollWrapper}>
                        {videoUri ? (
                            <View style={styles.thumbWrapper}>
                                <View style={[styles.thumbnail, styles.videoThumb]}>
                                    <Video size={24} color="#9CA3AF" />
                                </View>
                                <TouchableOpacity style={styles.removeThumbBtn} onPress={() => setVideoUri(null)}>
                                    <X size={14} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.imagesRow}>
                                {images.map((uri, i) => (
                                    <View key={`${uri}-${i}`} style={styles.thumbWrapper}>
                                        <Image source={{ uri }} style={styles.thumbnail} />
                                        {imageAlts[i]?.trim() ? (
                                            <View style={styles.altBadgeSet} pointerEvents="none">
                                                <Text style={styles.altBadgeText}>ALT</Text>
                                            </View>
                                        ) : null}
                                        <TouchableOpacity
                                            style={styles.altThumbBtn}
                                            onPress={() => setEditingAltIndex(editingAltIndex === i ? null : i)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Texto alternativo de la imagen ${i + 1}`}
                                        >
                                            <Type size={12} color="#fff" />
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.removeThumbBtn} onPress={() => removeImage(i)}>
                                            <X size={14} color="#fff" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                {images.length > 0 && images.length < MAX_IMAGES && (
                                    <TouchableOpacity style={styles.addThumbBtn} onPress={handlePickImages}>
                                        <Plus size={20} color={c.textMuted} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                    </View>

                    {editingAltIndex !== null && images[editingAltIndex] && (
                        <View style={[styles.altEditor, { borderColor: c.border }]}>
                            <Text style={[styles.altEditorLabel, { color: c.textMuted }]}>
                                Descripción de la imagen {editingAltIndex + 1} (para lectores de pantalla)
                            </Text>
                            <TextInput
                                style={[styles.altEditorInput, { color: c.text, borderColor: c.border }]}
                                placeholder="Ej: Foto de un par de zapatillas rojas sobre fondo blanco"
                                placeholderTextColor={c.textMuted}
                                value={imageAlts[editingAltIndex] ?? ''}
                                onChangeText={(text) =>
                                    setImageAlts((prev) => {
                                        const next = [...prev];
                                        next[editingAltIndex] = text;
                                        return next;
                                    })
                                }
                                maxLength={200}
                                multiline
                                autoFocus
                            />
                            <TouchableOpacity onPress={() => setEditingAltIndex(null)} style={styles.altEditorDone}>
                                <Text style={styles.altEditorDoneText}>Listo</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            )}

            {attachedProduct && isExpanded && (
                <View style={[styles.attachedCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff', borderColor: c.border }]}>
                    {attachedProduct.imageUrl ? (
                        <Image source={{ uri: attachedProduct.imageUrl }} style={styles.attachedImg} />
                    ) : (
                        <View style={[styles.attachedImg, { backgroundColor: 'rgba(156,163,175,0.2)', justifyContent: 'center', alignItems: 'center' }]}>
                            <ShoppingBag size={20} color="#9CA3AF" />
                        </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.attachedName, { color: c.text }]} numberOfLines={1}>
                            {attachedProduct.name}
                        </Text>
                        <Text style={styles.attachedPrice}>${attachedProduct.price}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setAttachedProduct(null)} style={styles.removeTagBtn}>
                        <X size={20} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            )}

            {isExpanded && (
                <View style={[styles.toolbar, { borderTopColor: c.border }]}>
                    <View style={styles.actionsRow}>
                        <TouchableOpacity style={styles.actionBtn} onPress={handlePickImages} disabled={!!videoUri}>
                            <ImageIcon size={20} color={videoUri ? c.textMuted : c.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={handlePickVideo} disabled={images.length > 0}>
                            <Video size={20} color={images.length > 0 ? c.textMuted : c.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => setIsLinkerVisible(true)}>
                            <Tag size={20} color={c.primary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.rightActions}>
                        {caption.length > 0 && (
                            <Text style={[styles.counter, { color: counterColor }]}>
                                {caption.length}/{LIMITS.socialPost}
                            </Text>
                        )}
                        <TouchableOpacity 
                            style={[styles.publishBtn, (!hasContent || overLimit || isUploading) && styles.publishBtnDisabled]}
                            onPress={handlePublish}
                            disabled={!hasContent || overLimit || isUploading}
                        >
                            {isUploading ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <Text style={styles.publishText}>Publicar</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <Modal visible={isLinkerVisible} animationType="slide" transparent>
                <View style={styles.linkerOverlay}>
                    <View style={{ flex: 1, marginTop: 100 }}>
                        <CommerceLinker
                            onClose={() => setIsLinkerVisible(false)}
                            onSelect={(id, name, price, imageUrl) => {
                                setAttachedProduct({ listingId: id, name, price, imageUrl });
                                setIsLinkerVisible(false);
                            }}
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    communityChip: {
        alignSelf: 'flex-start',
        marginTop: 10,
        marginLeft: 16,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: Radius.full,
        backgroundColor: 'rgba(167,139,250,0.15)',
    },
    communityChipText: {
        color: '#A78BFA',
        fontSize: 12,
        fontWeight: '600',
    },
    container: {
        marginBottom: 16,
        borderRadius: Radius.lg,
        borderWidth: 1,
        overflow: 'hidden',
    },
    input: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 16,
        fontSize: 16,
        textAlignVertical: 'top',
    },
    mediaContainer: {
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    mediaScrollWrapper: {
        flexDirection: 'row',
    },
    imagesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    thumbWrapper: {
        width: 70,
        height: 70,
        borderRadius: Radius.md,
        overflow: 'hidden',
    },
    thumbnail: {
        width: '100%',
        height: '100%',
    },
    videoThumb: {
        backgroundColor: 'rgba(156, 163, 175, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    removeThumbBtn: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: Radius.full,
        padding: 4,
    },
    altThumbBtn: {
        position: 'absolute',
        top: 4,
        left: 4,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: Radius.full,
        padding: 4,
    },
    altBadgeSet: {
        position: 'absolute',
        bottom: 4,
        left: 4,
        backgroundColor: 'rgba(37,99,235,0.85)',
        borderRadius: Radius.sm,
        paddingHorizontal: 4,
        paddingVertical: 1,
    },
    altBadgeText: {
        color: '#fff',
        fontSize: 8,
        fontWeight: '800',
    },
    altEditor: {
        marginHorizontal: 16,
        marginTop: 8,
        padding: 10,
        borderWidth: 1,
        borderRadius: Radius.md,
        gap: 6,
    },
    altEditorLabel: {
        fontSize: 11,
        fontWeight: '600',
    },
    altEditorInput: {
        borderWidth: 1,
        borderRadius: Radius.sm,
        padding: 8,
        fontSize: 13,
        minHeight: 44,
        textAlignVertical: 'top',
    },
    altEditorDone: {
        alignSelf: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    altEditorDoneText: {
        color: '#4F46E5',
        fontWeight: '700',
        fontSize: 13,
    },
    addThumbBtn: {
        width: 70,
        height: 70,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#9CA3AF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    attachedCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: Radius.md,
        borderWidth: 1,
    },
    attachedImg: {
        width: 40,
        height: 40,
        borderRadius: Radius.sm,
    },
    attachedName: {
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    attachedPrice: {
        fontSize: 13,
        color: '#10B981',
        fontWeight: 'bold',
    },
    removeTagBtn: {
        padding: 8,
    },
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    actionBtn: {
        padding: 8,
    },
    rightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    counter: {
        fontSize: 12,
        fontWeight: '500',
    },
    publishBtn: {
        backgroundColor: '#4F46E5',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: Radius.full,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    publishBtnDisabled: {
        opacity: 0.5,
    },
    publishText: {
        color: '#FFF',
        fontWeight: '600',
        fontSize: 14,
    },
    linkerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    }
});
