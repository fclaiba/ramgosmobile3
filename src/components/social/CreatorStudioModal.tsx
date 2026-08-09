import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Image, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { X, Camera, Tag, Send, ShoppingBag } from 'lucide-react-native';
import { CommerceLinker } from './CommerceLinker';
import { Radius } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';

export interface CreatorStudioModalProps {
    visible: boolean;
    onClose: () => void;
}

export function CreatorStudioModal({ visible, onClose }: CreatorStudioModalProps) {
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const isDark = colorScheme === 'dark';

    const [mediaUri, setMediaUri] = useState<string | null>(null);
    const [mediaType, setMediaType] = useState<'video' | 'image' | null>(null);
    const [caption, setCaption] = useState('');
    const [attachedProduct, setAttachedProduct] = useState<{ listingId: string, name: string, price: number, imageUrl?: string } | null>(null);
    const [isLinkerVisible, setIsLinkerVisible] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const createPost = useMutation(api.social.createPost);
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);

    const handlePickMedia = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsEditing: true,
            quality: 0.7,
        });

        if (!result.canceled && result.assets[0]) {
            setMediaUri(result.assets[0].uri);
            setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
        }
    };

    const handlePublish = async () => {
        if (!mediaUri && !caption.trim()) {
            show('Agregá un video, foto o texto para publicar.', 'error');
            return;
        }

        setIsUploading(true);
        try {
            let finalMediaUrl = '';

            // 1. Upload Media si existe (Ponytail: Simulación rápida usando fetch standard de Convex)
            if (mediaUri) {
                const uploadUrl = await generateUploadUrl({ sessionToken: sessionToken || '' });
                const response = await fetch(mediaUri);
                const blob = await response.blob();
                
                const uploadResult = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': mediaType === 'video' ? 'video/mp4' : 'image/jpeg' },
                    body: blob,
                });
                
                const { storageId } = await uploadResult.json();
                finalMediaUrl = `convex-storage:${storageId}`;
            }

            // 2. Armar el payload comercial si hay producto
            const commercialProduct = attachedProduct ? {
                listingId: attachedProduct.listingId,
                name: attachedProduct.name,
                price: attachedProduct.price,
                image: attachedProduct.imageUrl,
            } : undefined;

            // 3. Llamar a la mutación de social.ts
            const listingId = attachedProduct?.listingId;
            await createPost({
                sessionToken: sessionToken || '',
                type: attachedProduct
                    ? 'commercial'
                    : mediaType || 'text',
                content: caption,
                videoUrl: mediaType === 'video' ? finalMediaUrl : undefined,
                images: mediaType === 'image' && finalMediaUrl ? [finalMediaUrl] : undefined,
                commercialProduct,
                ...(listingId
                    ? { attachedListingId: listingId as any }
                    : {}),
            });

            show('¡Publicado con éxito!', 'success');
            resetAndClose();
        } catch (error) {
            console.error("Error al publicar:", error);
            show('Hubo un error al publicar.', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const resetAndClose = () => {
        setMediaUri(null);
        setMediaType(null);
        setCaption('');
        setAttachedProduct(null);
        setIsLinkerVisible(false);
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={resetAndClose}>
            <KeyboardAvoidingView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={resetAndClose} style={styles.iconBtn}>
                        <X size={24} color={isDark ? '#FFF' : '#000'} />
                    </TouchableOpacity>
                    <Text style={[styles.title, isDark ? styles.textLight : styles.textDark]}>Nuevo Post</Text>
                    <TouchableOpacity 
                        style={[styles.publishBtn, (!mediaUri && !caption.trim()) && styles.publishBtnDisabled]} 
                        onPress={handlePublish}
                        disabled={(!mediaUri && !caption.trim()) || isUploading}
                    >
                        {isUploading ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <Text style={styles.publishText}>Publicar</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.content}>
                    
                    {/* Media Preview / Picker */}
                    <TouchableOpacity style={styles.mediaPicker} onPress={handlePickMedia}>
                        {mediaUri ? (
                            <>
                                <Image source={{ uri: mediaUri }} style={styles.mediaPreview} />
                                <View style={styles.changeMediaBadge}>
                                    <Camera size={16} color="#FFF" />
                                    <Text style={styles.changeMediaText}>Cambiar</Text>
                                </View>
                            </>
                        ) : (
                            <View style={styles.mediaEmptyState}>
                                <Camera size={40} color="#9CA3AF" />
                                <Text style={styles.mediaEmptyText}>Toca para subir un Video o Foto</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Caption Input */}
                    <TextInput
                        style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                        placeholder="Escribe una descripción..."
                        placeholderTextColor="#9CA3AF"
                        multiline
                        maxLength={500}
                        value={caption}
                        onChangeText={setCaption}
                    />

                    {/* Commerce Linker Button */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, isDark ? styles.textLight : styles.textDark]}>
                            Social Commerce
                        </Text>
                        
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
                                    <Text style={[styles.addTagTitle, isDark ? styles.textLight : styles.textDark]}>Etiquetar Producto o Bono</Text>
                                    <Text style={styles.addTagSub}>Permite a tus seguidores comprar sin salir del video.</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>

            {/* Modal Interno para el Buscador */}
            <Modal visible={isLinkerVisible} animationType="slide" transparent>
                <View style={styles.linkerOverlay}>
                    <View style={{ flex: 1, marginTop: 100 }}>
                        <CommerceLinker 
                            onClose={() => setIsLinkerVisible(false)} 
                            onSelect={(prod) => {
                                setAttachedProduct(prod);
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
    mediaPicker: {
        width: '100%',
        aspectRatio: 9 / 16, // Proporción de video vertical
        maxHeight: 400,
        backgroundColor: 'rgba(156, 163, 175, 0.1)',
        borderRadius: Radius.lg,
        overflow: 'hidden',
        marginBottom: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mediaEmptyState: {
        alignItems: 'center',
        gap: 12,
    },
    mediaEmptyText: {
        color: '#9CA3AF',
        fontSize: 14,
    },
    mediaPreview: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    changeMediaBadge: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        backgroundColor: 'rgba(0,0,0,0.6)',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: Radius.full,
        gap: 6,
    },
    changeMediaText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '600',
    },
    input: {
        fontSize: 16,
        minHeight: 80,
        padding: 16,
        borderRadius: Radius.lg,
        textAlignVertical: 'top',
        marginBottom: 24,
    },
    inputDark: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        color: '#FFF',
    },
    inputLight: {
        backgroundColor: '#FFF',
        color: '#111827',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 12,
        opacity: 0.8,
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
    linkerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    }
});
