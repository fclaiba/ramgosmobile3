import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { X, Image as ImageIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useSocial } from '../../contexts/SocialContext';
import { useAuth } from '../../contexts/AuthContext';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent } from '../ui/sheet';
import { useToast } from '../../contexts/ToastContext';

export const CreateStory = ({ onClose }: { onClose: () => void }) => {
    const { createStory } = useSocial();
    const { user: authUser } = useAuth();
    const { show } = useToast();
    const [imageUrl, setImageUrl] = useState('');
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
            quality: 0.8,
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

    const handleCreate = () => {
        if (!imageUrl) return;
        createStory(imageUrl);
        onClose();
    };

    return (
        <Sheet open={true} onOpenChange={(val: boolean) => !val && onClose()}>
            <SheetContent side="bottom" style={styles.sheetContent}>
                <SafeAreaView style={{ flex: 1 }}>
                    <View style={styles.container}>
                        <View style={styles.header}>
                            <TouchableOpacity onPress={onClose}>
                                <X size={28} color="#fff" />
                            </TouchableOpacity>
                            <Text style={styles.title}>Crear Historia</Text>
                            <View style={{ width: 28 }} />
                        </View>

                        <View style={styles.content}>
                            {imageUrl ? (
                                <ImageWithFallback src={imageUrl} style={styles.previewImage} />
                            ) : (
                                <TouchableOpacity style={styles.placeholder} onPress={handlePickImage} disabled={uploading}>
                                    {uploading ? (
                                        <ActivityIndicator size="large" color="#fff" />
                                    ) : (
                                        <>
                                            <ImageIcon size={64} color="#666" />
                                            <Text style={styles.placeholderText}>Tocá para elegir una foto</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={styles.footer}>
                            <TouchableOpacity
                                style={[styles.createBtn, !imageUrl && styles.disabledBtn]}
                                onPress={handleCreate}
                                disabled={!imageUrl}
                            >
                                <Text style={styles.createBtnText}>Compartir en tu historia</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </SafeAreaView>
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    sheetContent: {
        backgroundColor: '#000',
        height: '95%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    container: { flex: 1 },
    header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    previewImage: { width: '100%', height: '80%', borderRadius: 16, resizeMode: 'cover' },
    placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, width: '100%' },
    placeholderText: { color: '#666', fontSize: 16 },
    footer: { padding: 20 },
    createBtn: { backgroundColor: '#8B5CF6', padding: 16, borderRadius: 16, alignItems: 'center' },
    disabledBtn: { backgroundColor: '#4B5563', opacity: 0.5 },
    createBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
