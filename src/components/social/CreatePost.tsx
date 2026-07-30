import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { X, Image as ImageIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useSocial } from '../../contexts/SocialContext';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { useToast } from '../../contexts/ToastContext';
import { Radius, colors } from '../../theme/tokens';
import { CommerceLinker } from './CommerceLinker';
import { Tag as TagIcon } from 'lucide-react-native';

export const CreatePost = ({ onClose }: { onClose: () => void }) => {
    const { currentUser, createPost } = useSocial();
    const { user: authUser } = useAuth();
    const { show } = useToast();
    const [content, setContent] = useState('');
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isVideo, setIsVideo] = useState<boolean>(false);
    const [uploading, setUploading] = useState(false);
    const [showLinker, setShowLinker] = useState(false);
    const [attachedListing, setAttachedListing] = useState<{ id: string, title: string } | null>(null);

    const generateUploadUrl = useMutation(api.files.generateUploadUrl);

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const handlePickImage = async () => {
        if (!authUser) { show('Debes iniciar sesión', 'error'); return; }
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) { show('Permiso de galería requerido', 'error'); return; }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            quality: 0.7,
        });
        if (result.canceled || !result.assets[0]) return;

        setUploading(true);
        try {
            const uploadUrl = await generateUploadUrl({});
            const asset = result.assets[0];
            setIsVideo(asset.type === 'video');
            let blob: Blob;
            try {
                const fetchResponse = await fetch(asset.uri);
                blob = await fetchResponse.blob();
            } catch (err) {
                blob = await new Promise<Blob>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.onload = function() { resolve(xhr.response); };
                    xhr.onerror = function(e) { reject(new TypeError('Network request failed')); };
                    xhr.responseType = 'blob';
                    xhr.open('GET', asset.uri, true);
                    xhr.send(null);
                });
            }

            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg') },
                body: blob,
            });
            const { storageId } = await response.json();
            setImageUrl(`convex-storage:${storageId}`);
        } catch (e: any) {
            show(e.message || 'Error al subir imagen', 'error');
        } finally {
            setUploading(false);
        }
    };

    const handlePost = () => {
        if (!content.trim() && !imageUrl) return;
        
        const basePayload: any = {};
        if (attachedListing) basePayload.attachedListingId = attachedListing.id;

        if (imageUrl) {
            if (isVideo) {
                createPost(content || '', 'video', { videoUrl: imageUrl, ...basePayload });
            } else {
                createPost(content || '', 'image', { images: [imageUrl], ...basePayload });
            }
        } else {
            createPost(content, 'text', basePayload);
        }
        onClose();
    };

    return (
        <Sheet open={true} onOpenChange={(val: boolean) => !val && onClose()}>
            <SheetContent side="bottom" style={styles.sheetContent}>
                <SheetHeader style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color={isDark ? '#D1D5DB' : '#374151'} />
                    </TouchableOpacity>
                    <SheetTitle style={styles.title}>Crear Publicación</SheetTitle>
                    <TouchableOpacity
                        onPress={handlePost}
                        disabled={!content.trim()}
                        style={[styles.postBtn, !content.trim() && styles.postBtnDisabled]}
                    >
                        <Text style={[styles.postBtnText, !content.trim() && styles.postBtnTextDisabled]}>
                            Publicar
                        </Text>
                    </TouchableOpacity>
                </SheetHeader>

                <View style={styles.content}>
                    <View style={styles.userInfo}>
                        <Avatar>
                            <AvatarImage src={currentUser?.avatar} />
                            <AvatarFallback>{currentUser?.name?.[0] || 'U'}</AvatarFallback>
                        </Avatar>
                        <Text style={styles.userName}>{currentUser?.name || 'Usuario'}</Text>
                    </View>

                    <TextInput
                        style={styles.input}
                        placeholder="¿Qué estás pensando?"
                        multiline
                        autoFocus
                        value={content}
                        onChangeText={setContent}
                        placeholderTextColor="#9CA3AF"
                        textAlignVertical="top"
                    />
                    {imageUrl && (
                        <View style={styles.imagePreview}>
                            {isVideo ? (
                                <View style={[styles.preview, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#222' }]}>
                                    <ImageIcon size={48} color="#666" />
                                    <Text style={{color: '#fff', marginTop: 8}}>Video adjunto</Text>
                                </View>
                            ) : (
                                <Image source={{ uri: imageUrl }} style={styles.preview} />
                            )}
                            <TouchableOpacity style={styles.removeImage} onPress={() => { setImageUrl(null); setIsVideo(false); }}>
                                <X size={16} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    )}

                    {attachedListing && (
                        <View style={styles.attachedPill}>
                            <TagIcon size={16} color="#2196F3" />
                            <Text style={styles.attachedPillText} numberOfLines={1}>{attachedListing.title}</Text>
                            <TouchableOpacity onPress={() => setAttachedListing(null)}>
                                <X size={16} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                <View style={styles.footer}>
                    <TouchableOpacity style={styles.mediaBtn} onPress={handlePickImage} disabled={uploading}>
                        {uploading ? (
                            <ActivityIndicator size="small" color="#6B7280" />
                        ) : (
                            <ImageIcon size={24} color="#6B7280" />
                        )}
                        <Text style={styles.mediaText}>{uploading ? 'Subiendo...' : 'Foto/Video'}</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.linkerBtn} onPress={() => setShowLinker(true)}>
                        <TagIcon size={24} color="#2196F3" />
                        <Text style={styles.linkerText}>Vincular Producto</Text>
                    </TouchableOpacity>
                </View>
            </SheetContent>

            {showLinker && (
                <CommerceLinker 
                    onClose={() => setShowLinker(false)} 
                    onSelect={(id, title) => setAttachedListing({ id, title })} 
                />
            )}
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    sheetContent: {
        backgroundColor: colors(isDark).glass,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '90%'
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' },
    closeBtn: { padding: 4 },
    title: { fontSize: 16, fontWeight: 'bold', color: colors(isDark).text },
    postBtn: { backgroundColor: '#2196F3', paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.xl },
    postBtnDisabled: { backgroundColor: colors(isDark).glass },
    postBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    postBtnTextDisabled: { color: '#9CA3AF' },

    content: { padding: 20, flex: 1 },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    userName: { fontWeight: 'bold', fontSize: 15, color: colors(isDark).text },
    input: { fontSize: 16, color: colors(isDark).text, minHeight: 120, flex: 1 },

    footer: { padding: 16, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', marginBottom: 20, flexDirection: 'row', gap: 12 },
    mediaBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: Radius.md, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', flex: 1, justifyContent: 'center' },
    mediaText: { color: colors(isDark).textMuted, fontWeight: '500' },
    linkerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: Radius.md, backgroundColor: isDark ? 'rgba(33, 150, 243,0.1)' : '#E3F2FD', flex: 1, justifyContent: 'center' },
    linkerText: { color: '#2196F3', fontWeight: 'bold' },
    imagePreview: { marginTop: 16, position: 'relative' },
    preview: { width: '100%', height: 200, borderRadius: Radius.md },
    removeImage: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: Radius.md, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    attachedPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: isDark ? 'rgba(33, 150, 243,0.1)' : '#E3F2FD', paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, marginTop: 16, alignSelf: 'flex-start' },
    attachedPillText: { color: '#2196F3', fontWeight: 'bold', maxWidth: 200 },
});
