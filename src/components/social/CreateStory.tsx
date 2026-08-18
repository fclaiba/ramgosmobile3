import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Modal } from 'react-native';
import { X, Send, Star } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const CreateStory = ({ onClose }: { onClose: () => void }) => {
    const { user: authUser, sessionToken } = useAuth();
    const { show } = useToast();
    const [localUri, setLocalUri] = useState('');
    const [uploadedStorageId, setUploadedStorageId] = useState('');
    const [uploading, setUploading] = useState(false);
    const [closeFriendsOnly, setCloseFriendsOnly] = useState(false);
    const insets = useSafeAreaInsets();

    const generateUploadUrl = useMutation(api.files.generateUploadUrl);
    const createStoryMutation = useMutation(api.social.createStory);

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    useEffect(() => {
        if (!authUser) { show('Debes iniciar sesión', 'error'); onClose(); return; }
        launchGallery();
    }, []);

    const uploadImage = async (asset: ImagePicker.ImagePickerAsset) => {
        setLocalUri(asset.uri);
        setUploading(true);
        try {
            const uploadUrl = await generateUploadUrl({ sessionToken, actorId: authUser?.id as any });
            let blob: Blob;
            try {
                const resp = await fetch(asset.uri);
                blob = await resp.blob();
            } catch {
                blob = await new Promise<Blob>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.onload = () => resolve(xhr.response);
                    xhr.onerror = () => reject(new TypeError('Network request failed'));
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
            setUploadedStorageId(storageId);
        } catch (e: any) {
            show(e.message || 'Error al subir imagen', 'error');
        } finally {
            setUploading(false);
        }
    };

    const launchGallery = async () => {
        try {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) { show('Permiso de galería requerido', 'error'); onClose(); return; }
            
            const mediaTypes = (ImagePicker.MediaTypeOptions as any)?.Images || 'Images';
            
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes,
                quality: 0.8,
            });
            if (result.canceled || !result.assets?.[0]) { onClose(); return; }
            uploadImage(result.assets[0]);
        } catch (error: any) {
            show(error.message || 'Error al abrir la galería', 'error');
            onClose();
        }
    };

    const handleCreate = async () => {
        if (!uploadedStorageId || uploading) return;
        setUploading(true);
        try {
            await createStoryMutation({
                sessionToken: sessionToken || '',
                url: `convex-storage:${uploadedStorageId}`,
                type: 'image',
                audience: closeFriendsOnly ? 'close_friends' : 'everyone',
            });
            show('Historia publicada 🎉', 'success');
        } catch (error: any) {
            show(error.message || 'Error al publicar historia', 'error');
        }
        setUploading(false);
        onClose();
    };

    if (!localUri) return null;

    return (
        <Modal visible={true} transparent={false} animationType="fade" onRequestClose={onClose}>
            <View style={styles.container}>
                <ImageWithFallback src={localUri} style={StyleSheet.absoluteFill} resizeMode="contain" />
                <View style={styles.overlay} />

                <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
                    <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                        <X size={28} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.title}>Tu Historia</Text>
                    <View style={{ width: 44 }} />
                </View>

                <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
                    <TouchableOpacity
                        style={[styles.closeFriendsToggle, closeFriendsOnly && styles.closeFriendsToggleActive]}
                        onPress={() => setCloseFriendsOnly((v) => !v)}
                    >
                        <Star size={14} color={closeFriendsOnly ? '#000' : '#fff'} fill={closeFriendsOnly ? '#000' : 'transparent'} />
                        <Text style={[styles.closeFriendsToggleText, closeFriendsOnly && { color: '#000' }]}>
                            Mejores amigos
                        </Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                        style={[styles.shareBtn, (uploading || !uploadedStorageId) && { opacity: 0.5 }]}
                        onPress={handleCreate}
                        disabled={uploading || !uploadedStorageId}
                    >
                        {uploading ? (
                            <ActivityIndicator size="small" color="#000" />
                        ) : (
                            <>
                                <Text style={styles.shareBtnText}>Compartir</Text>
                                <View style={styles.shareIconWrap}>
                                    <Send size={16} color="#000" />
                                </View>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    overlay: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    topBar: {
        position: 'absolute', top: 0, left: 0, right: 0,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, zIndex: 10,
    },
    bottomBar: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        flexDirection: 'row', justifyContent: 'flex-end',
        paddingHorizontal: 20, zIndex: 10,
    },
    iconBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center', alignItems: 'center',
    },
    title: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    shareBtn: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 24,
        borderRadius: 30, gap: 12, minWidth: 140, justifyContent: 'center',
    },
    shareBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
    shareIconWrap: { backgroundColor: '#f0f0f0', padding: 6, borderRadius: 16 },
    closeFriendsToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    closeFriendsToggleActive: { backgroundColor: '#FBBF24' },
    closeFriendsToggleText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
