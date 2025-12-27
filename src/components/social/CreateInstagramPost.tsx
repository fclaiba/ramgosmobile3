import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Modal, SafeAreaView } from 'react-native';
import { X, Send, Image as ImageIcon } from 'lucide-react-native';
import { useSocial } from '../../contexts/SocialContext';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { ImageWithFallback } from '../figma/ImageWithFallback';

export const CreateInstagramPost = ({ onClose }: { onClose: () => void }) => {
    const { currentUser, createInstagramPost } = useSocial();
    const [imageUrl, setImageUrl] = useState('');
    const [caption, setCaption] = useState('');

    const canPost = imageUrl.trim().length > 0;

    const handlePost = () => {
        if (!canPost) return;
        createInstagramPost(imageUrl, caption);
        onClose();
    };

    return (
        <Modal animationType="slide" presentationStyle="pageSheet" visible={true} onRequestClose={onClose}>
            <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
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
                                style={styles.captionInput}
                                multiline
                                value={caption}
                                onChangeText={setCaption}
                            />
                        </View>

                        <View style={styles.urlInputContainer}>
                            <ImageIcon size={20} color="#6B7280" style={{ marginRight: 8 }} />
                            <TextInput
                                placeholder="URL de la imagen (https://...)"
                                style={styles.urlInput}
                                value={imageUrl}
                                onChangeText={setImageUrl}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            {imageUrl.length > 0 && (
                                <TouchableOpacity onPress={() => setImageUrl('')}>
                                    <X size={16} color="#9CA3AF" />
                                </TouchableOpacity>
                            )}
                        </View>

                        {imageUrl.length > 0 && (
                            <View style={styles.previewContainer}>
                                <ImageWithFallback src={imageUrl} style={styles.previewImage} />
                            </View>
                        )}
                    </View>
                </View>
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, height: 56, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    cancelText: { fontSize: 16, color: '#111' },
    headerTitle: { fontSize: 16, fontWeight: '600' },
    postButton: { fontSize: 16, color: '#3B82F6', fontWeight: '600' },
    disabledButton: { color: '#9CA3AF' },

    content: { padding: 16 },
    userRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
    avatar: { marginRight: 12 },
    captionInput: { flex: 1, fontSize: 16, marginTop: 8, minHeight: 60, textAlignVertical: 'top' },

    urlInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, paddingHorizontal: 12, height: 48, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB' },
    urlInput: { flex: 1, fontSize: 15 },

    previewContainer: { borderRadius: 12, overflow: 'hidden', aspectRatio: 1, backgroundColor: '#F3F4F6' },
    previewImage: { width: '100%', height: '100%' }
});
