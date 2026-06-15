import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { X, Image as ImageIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useSocial } from '../../contexts/SocialContext';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent } from '../ui/sheet';
import { useToast } from '../../contexts/ToastContext';

export const CreateInstagramPost = ({ onClose }: { onClose: () => void }) => {
    const { currentUser, createInstagramPost } = useSocial();
    const { user: authUser } = useAuth();
    const { show } = useToast();
    const [imageUrl, setImageUrl] = useState('');
    const [caption, setCaption] = useState('');
    const [uploading, setUploading] = useState(false);

    const generateUploadUrl = useMutation(api.files.generateUploadUrl);

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const canPost = imageUrl.trim().length > 0 && !uploading;

    const handlePickImage = async () => {
        if (!authUser) { show('Debes iniciar sesión', 'error'); return; }
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) { show('Permiso de galería requerido', 'error'); return; }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            allowsEditing: true,
            aspect: [1, 1],
        });
        if (result.canceled || !result.assets[0]) return;

        setUploading(true);
        try {
            const uploadUrl = await generateUploadUrl({});
            const asset = result.assets[0];
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
                headers: { 'Content-Type': asset.mimeType ?? 'image/jpeg' },
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
        if (!canPost) return;
        createInstagramPost(imageUrl, caption);
        onClose();
    };

    return (
        <Sheet open={true} onOpenChange={(val: boolean) => !val && onClose()}>
            <SheetContent side="bottom" style={styles.sheetContent}>
                <SafeAreaView style={{ flex: 1 }}>
                    <View style={styles.container}>
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity onPress={onClose}>
                                <Text style={styles.cancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <Text style={styles.headerTitle}>Nueva Publicación</Text>
                            <TouchableOpacity onPress={handlePost} disabled={!canPost}>
                                <Text style={[styles.postButton, !canPost && styles.disabledButton]}>Compartir</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.content}>
                            <View style={styles.userRow}>
                                <Avatar style={styles.avatar}>
                                    <AvatarImage src={currentUser.avatar} />
                                    <AvatarFallback>{currentUser.name[0]}</AvatarFallback>
                                </Avatar>
                                <TextInput
                                    placeholder="Escribe un pie de foto..."
                                    placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
                                    style={styles.captionInput}
                                    multiline
                                    value={caption}
                                    onChangeText={setCaption}
                                />
                            </View>

                            <TouchableOpacity style={styles.urlInputContainer} onPress={handlePickImage} disabled={uploading}>
                                {uploading ? (
                                    <ActivityIndicator size="small" color="#6B7280" />
                                ) : (
                                    <ImageIcon size={20} color="#6B7280" style={{ marginRight: 8 }} />
                                )}
                                <Text style={[styles.urlInput, { color: imageUrl ? (isDark ? '#F9FAFB' : '#000') : '#9CA3AF' }]}>
                                    {uploading ? 'Subiendo...' : imageUrl ? 'Imagen seleccionada' : 'Tocá para elegir una foto'}
                                </Text>
                                {imageUrl.length > 0 && !uploading && (
                                    <TouchableOpacity onPress={() => setImageUrl('')}>
                                        <X size={16} color={isDark ? '#D1D5DB' : '#9CA3AF'} />
                                    </TouchableOpacity>
                                )}
                            </TouchableOpacity>

                            {imageUrl.length > 0 && (
                                <View style={styles.previewContainer}>
                                    <ImageWithFallback src={imageUrl} style={styles.previewImage} />
                                </View>
                            )}
                        </View>
                    </View>
                </SafeAreaView>
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    sheetContent: {
        backgroundColor: isDark ? '#111827' : '#fff',
        height: '92%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, height: 56, borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F3F4F6' },
    cancelText: { fontSize: 16, color: isDark ? '#F9FAFB' : '#111' },
    headerTitle: { fontSize: 16, fontWeight: '600', color: isDark ? '#F9FAFB' : '#000' },
    postButton: { fontSize: 16, color: '#3B82F6', fontWeight: '600' },
    disabledButton: { color: isDark ? '#4B5563' : '#9CA3AF' },

    content: { padding: 16 },
    userRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
    avatar: { marginRight: 12 },
    captionInput: { flex: 1, fontSize: 16, marginTop: 8, minHeight: 60, textAlignVertical: 'top', color: isDark ? '#F9FAFB' : '#000' },

    urlInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderRadius: 12, paddingHorizontal: 12, height: 48, marginBottom: 16, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB' },
    urlInput: { flex: 1, fontSize: 15, color: isDark ? '#F9FAFB' : '#000' },

    previewContainer: { borderRadius: 12, overflow: 'hidden', aspectRatio: 1, backgroundColor: isDark ? '#1F2937' : '#F3F4F6' },
    previewImage: { width: '100%', height: '100%' }
});
