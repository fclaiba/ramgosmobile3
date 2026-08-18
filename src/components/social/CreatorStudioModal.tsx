import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Image, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { X, Camera, Tag, ShoppingBag, Plus, Video } from 'lucide-react-native';
import { CommerceLinker } from './CommerceLinker';
import { Radius } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { LIMITS } from '../../utils/inputLimits';
import { uploadLocalImageToConvex } from '../../utils/uploadToConvexStorage';

export interface CreatorStudioModalProps {
    visible: boolean;
    onClose: () => void;
}

const MAX_IMAGES = 10;

/**
 * Composer estilo Twitter (decisión de producto, 2026-08-18).
 *
 * Antes era un `Modal` con `animationType="slide"` + `presentationStyle=
 * "pageSheet"` — de ahí la sensación de "se desliza". Ahora entra con
 * `fade` + `fullScreen`, sin el gesto de deslizar hacia abajo para cerrar
 * que tenía el pageSheet.
 *
 * Sube hasta `MAX_IMAGES` fotos (antes una sola) vía `uploadLocalImageToConvex`
 * — el mismo util que ya resuelve idempotencia, fallback XHR para URIs
 * nativas y detección real de `contentType`, que el código viejo no tenía
 * (subía con `fetch`+blob inline, hardcodeando `image/jpeg`). Un post sigue
 * siendo galería O video, nunca ambos.
 */
export function CreatorStudioModal({ visible, onClose }: CreatorStudioModalProps) {
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const isDark = colorScheme === 'dark';

    const [images, setImages] = useState<string[]>([]);
    const [videoUri, setVideoUri] = useState<string | null>(null);
    const [caption, setCaption] = useState('');
    const [attachedProduct, setAttachedProduct] = useState<{ listingId: string, name: string, price: number, imageUrl?: string } | null>(null);
    const [isLinkerVisible, setIsLinkerVisible] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const createPost = useMutation(api.social.createPost);
    const saveDraft = useMutation(api.social.drafts.saveDraft);
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);
    const registerUpload = useMutation(api.files.registerUpload);

    const hasContent = images.length > 0 || !!videoUri || caption.trim().length > 0;
    const overLimit = caption.length > LIMITS.socialPost;

    const handlePickImages = async () => {
        const remaining = MAX_IMAGES - images.length;
        if (remaining <= 0) {
            show(`Máximo ${MAX_IMAGES} fotos por post.`, 'warning');
            return;
        }
        // `allowsEditing` no es compatible con selección múltiple en
        // expo-image-picker — hay que elegir uno de los dos.
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            selectionLimit: remaining,
            quality: 0.7,
        });
        if (result.canceled || result.assets.length === 0) return;

        setVideoUri(null); // un post es galería O video, no ambos
        setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, MAX_IMAGES));
    };

    const handlePickVideo = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['videos'],
            quality: 0.7,
        });
        if (result.canceled || !result.assets[0]) return;

        setImages([]);
        setVideoUri(result.assets[0].uri);
    };

    const removeImage = (index: number) => {
        setImages((prev) => prev.filter((_, i) => i !== index));
    };

    const handlePublish = async () => {
        if (!hasContent) {
            show('Agregá un video, foto o texto para publicar.', 'error');
            return;
        }
        if (overLimit) {
            show(`Los posts no pueden superar los ${LIMITS.socialPost} caracteres.`, 'error');
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
                commercialProduct,
                ...(listingId ? { attachedListingId: listingId as any } : {}),
            });

            show('¡Publicado con éxito!', 'success');
            resetAndClose();
        } catch (error: any) {
            console.error("Error al publicar:", error);
            show(error?.data?.message ?? 'Hubo un error al publicar.', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    /**
     * Guarda el borrador con las URIs locales tal cual — `saveDraft` sólo
     * valida forma y longitud (`createPostArgsValidator`), no exige que las
     * imágenes ya estén subidas. La subida real ocurre recién al publicar
     * (`publishDraftNow` o el cron), igual que en una publicación en vivo.
     */
    const handleSaveDraft = async () => {
        if (!hasContent) {
            show('Agregá algo para guardar como borrador.', 'error');
            return;
        }
        if (overLimit) {
            show(`Los posts no pueden superar los ${LIMITS.socialPost} caracteres.`, 'error');
            return;
        }
        setIsUploading(true);
        try {
            const commercialProduct = attachedProduct ? {
                listingId: attachedProduct.listingId,
                name: attachedProduct.name,
                price: attachedProduct.price,
                image: attachedProduct.imageUrl,
            } : undefined;

            await saveDraft({
                sessionToken: sessionToken || '',
                payload: {
                    type: attachedProduct ? 'commercial' : videoUri ? 'video' : images.length > 0 ? 'image' : 'text',
                    content: caption,
                    videoUrl: videoUri ?? undefined,
                    images: images.length > 0 ? images : undefined,
                    commercialProduct,
                    ...(attachedProduct ? { attachedListingId: attachedProduct.listingId as any } : {}),
                },
            });
            show('Guardado como borrador', 'success');
            resetAndClose();
        } catch (error: any) {
            show(error?.data?.message ?? 'No se pudo guardar el borrador.', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const resetAndClose = () => {
        setImages([]);
        setVideoUri(null);
        setCaption('');
        setAttachedProduct(null);
        setIsLinkerVisible(false);
        onClose();
    };

    const counterColor = overLimit ? '#EF4444' : caption.length > LIMITS.socialPost - 30 ? '#F59E0B' : '#9CA3AF';

    return (
        <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={resetAndClose}>
            <KeyboardAvoidingView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

                {/* Header estilo Twitter: X / título / Publicar */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={resetAndClose} style={styles.iconBtn}>
                        <X size={24} color={isDark ? '#FFF' : '#000'} />
                    </TouchableOpacity>
                    <Text style={[styles.title, isDark ? styles.textLight : styles.textDark]}>Nuevo post</Text>
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            style={styles.draftBtn}
                            onPress={handleSaveDraft}
                            disabled={!hasContent || overLimit || isUploading}
                        >
                            <Text style={[styles.draftBtnText, (!hasContent || overLimit) && styles.draftBtnTextDisabled]}>Borrador</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.publishBtn, (!hasContent || overLimit) && styles.publishBtnDisabled]}
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

                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

                    {/* Textarea grande, protagonista — estilo Twitter */}
                    <TextInput
                        style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                        placeholder="¿Qué está pasando?"
                        placeholderTextColor="#9CA3AF"
                        multiline
                        autoFocus
                        value={caption}
                        onChangeText={setCaption}
                    />

                    {/* Grid de miniaturas + botón de agregar (carrusel al publicar) */}
                    {(images.length > 0 || videoUri) && (
                        <View style={styles.mediaGrid}>
                            {videoUri ? (
                                <View style={styles.thumbWrapper}>
                                    <View style={[styles.thumbnail, styles.videoThumb]}>
                                        <Video size={28} color="#9CA3AF" />
                                    </View>
                                    <TouchableOpacity style={styles.removeThumbBtn} onPress={() => setVideoUri(null)}>
                                        <X size={14} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                images.map((uri, i) => (
                                    <View key={`${uri}-${i}`} style={styles.thumbWrapper}>
                                        <Image source={{ uri }} style={styles.thumbnail} />
                                        <TouchableOpacity style={styles.removeThumbBtn} onPress={() => removeImage(i)}>
                                            <X size={14} color="#fff" />
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                            {!videoUri && images.length < MAX_IMAGES && (
                                <TouchableOpacity style={styles.addThumbBtn} onPress={handlePickImages}>
                                    <Plus size={24} color="#9CA3AF" />
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* Commerce Linker */}
                    <View style={styles.section}>
                        {attachedProduct ? (
                            <View style={[styles.attachedCard, isDark ? styles.cardDark : styles.cardLight]}>
                                {attachedProduct.imageUrl ? (
                                    <Image source={{ uri: attachedProduct.imageUrl }} style={styles.attachedImg} />
                                ) : (
                                    <View style={[styles.attachedImg, { backgroundColor: 'rgba(156,163,175,0.2)', justifyContent: 'center', alignItems: 'center' }]}>
                                        <ShoppingBag size={20} color="#9CA3AF" />
                                    </View>
                                )}
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={[styles.attachedName, isDark ? styles.textLight : styles.textDark]} numberOfLines={1}>
                                        {attachedProduct.name}
                                    </Text>
                                    <Text style={styles.attachedPrice}>${attachedProduct.price}</Text>
                                </View>
                                <TouchableOpacity onPress={() => setAttachedProduct(null)} style={styles.removeTagBtn}>
                                    <X size={20} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity style={styles.addTagBtn} onPress={() => setIsLinkerVisible(true)}>
                                <View style={styles.addTagIcon}>
                                    <Tag size={20} color="#4F46E5" />
                                </View>
                                <View>
                                    <Text style={[styles.addTagTitle, isDark ? styles.textLight : styles.textDark]}>Etiquetar producto o bono</Text>
                                    <Text style={styles.addTagSub}>Permite comprar sin salir del post.</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    </View>

                </ScrollView>

                {/* Barra inferior: acciones de medio + contador */}
                <View style={[styles.bottomBar, isDark ? styles.bottomBarDark : styles.bottomBarLight]}>
                    <View style={styles.bottomActions}>
                        <TouchableOpacity style={styles.bottomIconBtn} onPress={handlePickImages} disabled={!!videoUri}>
                            <Camera size={22} color={videoUri ? '#4B5563' : '#4F46E5'} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.bottomIconBtn} onPress={handlePickVideo} disabled={images.length > 0}>
                            <Video size={22} color={images.length > 0 ? '#4B5563' : '#4F46E5'} />
                        </TouchableOpacity>
                    </View>
                    <Text style={[styles.counter, { color: counterColor }]}>
                        {caption.length}/{LIMITS.socialPost}
                    </Text>
                </View>
            </KeyboardAvoidingView>

            {/* Modal Interno para el Buscador */}
            <Modal visible={isLinkerVisible} animationType="slide" transparent>
                <View style={styles.linkerOverlay}>
                    <View style={{ flex: 1, marginTop: 100 }}>
                        <CommerceLinker
                            onClose={() => setIsLinkerVisible(false)}
                            onSelect={(id, name) => {
                                setAttachedProduct({ listingId: id, name, price: 0 });
                                setIsLinkerVisible(false);
                            }}
                        />
                    </View>
                </View>
            </Modal>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    containerDark: {
        backgroundColor: '#111827',
    },
    containerLight: {
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(156, 163, 175, 0.2)',
    },
    iconBtn: {
        padding: 4,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    textLight: { color: '#FFF' },
    textDark: { color: '#111827' },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    draftBtn: {
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    draftBtnText: {
        color: '#4F46E5',
        fontWeight: '600',
        fontSize: 14,
    },
    draftBtnTextDisabled: {
        color: '#9CA3AF',
    },
    publishBtn: {
        backgroundColor: '#4F46E5',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: Radius.full,
    },
    publishBtnDisabled: {
        backgroundColor: 'rgba(79, 70, 229, 0.5)',
    },
    publishText: {
        color: '#FFF',
        fontWeight: 'bold',
    },
    content: {
        padding: 16,
    },
    input: {
        fontSize: 18,
        minHeight: 120,
        padding: 4,
        marginBottom: 16,
    },
    inputDark: {
        color: '#FFF',
    },
    inputLight: {
        color: '#111827',
    },
    mediaGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    thumbWrapper: {
        width: 90,
        height: 90,
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
    addThumbBtn: {
        width: 90,
        height: 90,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#9CA3AF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    section: {
        marginBottom: 24,
    },
    addTagBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    addTagIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    addTagTitle: {
        fontSize: 16,
        fontWeight: '600',
    },
    addTagSub: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 2,
    },
    attachedCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: Radius.lg,
        borderWidth: 1,
    },
    cardDark: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderColor: 'rgba(255,255,255,0.1)',
    },
    cardLight: {
        backgroundColor: '#FFF',
        borderColor: '#E5E7EB',
    },
    attachedImg: {
        width: 48,
        height: 48,
        borderRadius: Radius.sm,
    },
    attachedName: {
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    attachedPrice: {
        fontSize: 14,
        color: '#10B981',
        fontWeight: 'bold',
    },
    removeTagBtn: {
        padding: 8,
    },
    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: 1,
    },
    bottomBarDark: {
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    bottomBarLight: {
        borderTopColor: '#E5E7EB',
    },
    bottomActions: {
        flexDirection: 'row',
        gap: 16,
    },
    bottomIconBtn: {
        padding: 4,
    },
    counter: {
        fontSize: 13,
        fontWeight: '600',
    },
    linkerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    }
});
