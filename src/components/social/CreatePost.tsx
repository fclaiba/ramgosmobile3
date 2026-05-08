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

export const CreatePost = ({ onClose }: { onClose: () => void }) => {
    const { currentUser, createPost } = useSocial();
    const { user: authUser } = useAuth();
    const { show } = useToast();
    const [content, setContent] = useState('');
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    const generateUploadUrl = useMutation(api.files.generateUploadUrl);

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const handlePickImage = async () => {
        if (!authUser) { show('Debes iniciar sesión', 'error'); return; }
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) { show('Permiso de galería requerido', 'error'); return; }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
        });
        if (result.canceled || !result.assets[0]) return;

        setUploading(true);
        try {
            const uploadUrl = await generateUploadUrl({ actorId: authUser.id as any, userId: authUser.id as any });
            const asset = result.assets[0];
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': asset.mimeType ?? 'image/jpeg' },
                body: { uri: asset.uri } as any,
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
        if (imageUrl) {
            createPost(content || '', 'image', { images: [imageUrl] });
        } else {
            createPost(content, 'text');
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
                            <Image source={{ uri: imageUrl }} style={styles.preview} />
                            <TouchableOpacity style={styles.removeImage} onPress={() => setImageUrl(null)}>
                                <X size={16} color="#fff" />
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
                </View>
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    sheetContent: {
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '90%'
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F3F4F6' },
    closeBtn: { padding: 4 },
    title: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827' },
    postBtn: { backgroundColor: '#7C3AED', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    postBtnDisabled: { backgroundColor: isDark ? '#374151' : '#E5E7EB' },
    postBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    postBtnTextDisabled: { color: '#9CA3AF' },

    content: { padding: 20, flex: 1 },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    userName: { fontWeight: 'bold', fontSize: 15, color: isDark ? '#F9FAFB' : '#111827' },
    input: { fontSize: 16, color: isDark ? '#F9FAFB' : '#111827', minHeight: 120, flex: 1 },

    footer: { padding: 16, borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#F3F4F6', marginBottom: 20 },
    mediaBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: isDark ? '#374151' : '#F9FAFB' },
    mediaText: { color: isDark ? '#D1D5DB' : '#6B7280', fontWeight: '500' },
    imagePreview: { marginTop: 16, position: 'relative' },
    preview: { width: '100%', height: 200, borderRadius: 12 },
    removeImage: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
});
